import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { uploadToS3 } from './s3.js';

const TMP_DIR = '/tmp/ai-video-gen';

// Map of our internal Vertex model IDs to their real API model strings
const VERTEX_IMAGE_MODEL_MAP = {
  'vertex-imagen4':       'imagen-4.0-generate-001',
  'vertex-nano-banana-2': 'gemini-3.1-flash-image-generation',
};

/**
 * Generates an image via Google Vertex AI and returns a presigned S3 URL.
 * Supports:
 *   - Imagen 4  (vertex-imagen4)         → ai.models.generateImages
 *   - Nano Banana 2 (vertex-nano-banana-2) → ai.models.generateContent with IMAGE modality
 *
 * @param {string} prompt    - Image generation prompt
 * @param {object} options   - { aspect_ratio: '9:16'|'16:9'|'1:1' }
 * @param {string} modelId   - Internal model ID (e.g. 'vertex-nano-banana-2')
 * @returns {Promise<string>} Presigned S3 URL for the generated image
 */
export async function generateVertexImage(prompt, options = {}, modelId = 'vertex-nano-banana-2') {
  const project  = process.env.VERTEX_PROJECT;
  const location = process.env.VERTEX_LOCATION;

  if (!project || !location) {
    throw new Error(
      'Vertex AI configuration error: VERTEX_PROJECT and VERTEX_LOCATION environment variables are required'
    );
  }

  const ai = new GoogleGenAI({ vertexai: true, project, location });

  const apiModel = VERTEX_IMAGE_MODEL_MAP[modelId] || VERTEX_IMAGE_MODEL_MAP['vertex-nano-banana-2'];
  console.log(`[Vertex Image] Using model: ${apiModel} (${modelId})`);

  let imageBytes;

  if (modelId === 'vertex-imagen4') {
    // ── Imagen path ──────────────────────────────────────────────────────────
    const arMap = { '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' };
    const aspectRatio = arMap[options.aspect_ratio] || '9:16';

    const response = await ai.models.generateImages({
      model: apiModel,
      prompt,
      config: { numberOfImages: 1, aspectRatio },
    });

    imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) throw new Error('Vertex AI Imagen returned no image bytes');

  } else {
    // ── Gemini flash-image path (Nano Banana 2) ──────────────────────────────
    const response = await ai.models.generateContent({
      model: apiModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    });

    const parts = response?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart) throw new Error('Vertex AI Nano Banana returned no image in response');
    imageBytes = imagePart.inlineData.data; // already base64
  }

  // ── Write temp file & upload to S3 ────────────────────────────────────────
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const fileName  = `vertex_image_${Date.now()}.png`;
  const localPath = path.join(TMP_DIR, fileName);

  try {
    fs.writeFileSync(localPath, Buffer.from(imageBytes, 'base64'));
    console.log(`[Vertex Image] Saved temp file: ${localPath}`);
    const presignedUrl = await uploadToS3(localPath, 'image/png', 'images');
    console.log(`[Vertex Image] Uploaded to S3`);
    return presignedUrl;
  } finally {
    if (fs.existsSync(localPath)) {
      try { fs.unlinkSync(localPath); } catch {}
    }
  }
}
