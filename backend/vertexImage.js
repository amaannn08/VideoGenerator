import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { uploadToS3 } from './s3.js';

const TMP_DIR = '/tmp/ai-video-gen';

/**
 * Generates an image via Google Vertex AI (Imagen 4) and returns a presigned S3 URL.
 *
 * @param {string} prompt - Image generation prompt
 * @param {object} options - { aspect_ratio: '9:16'|'16:9'|'1:1' }
 * @returns {Promise<string>} Presigned S3 URL for the generated image
 */
export async function generateVertexImage(prompt, options = {}) {
  const project = process.env.VERTEX_PROJECT;
  const location = process.env.VERTEX_LOCATION;

  if (!project || !location) {
    throw new Error(
      'Vertex AI configuration error: VERTEX_PROJECT and VERTEX_LOCATION environment variables are required'
    );
  }

  const ai = new GoogleGenAI({ vertexai: true, project, location });

  // Map aspect ratio to Imagen format
  const arMap = { '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' };
  const aspectRatio = arMap[options.aspect_ratio] || '9:16';

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio,
    },
  });

  const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    throw new Error('Vertex AI Imagen returned no image bytes');
  }

  // Write base64 image to temp file and upload to S3
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const fileName = `vertex_image_${Date.now()}.png`;
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
