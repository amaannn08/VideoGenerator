import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { uploadToS3 } from './s3.js';

const TMP_DIR = '/tmp/ai-video-gen';

// Gemini image model — called via REST API (not Vertex SDK)
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

/**
 * Generates an image via Gemini REST API and returns a presigned S3 URL.
 *
 * @param {string} prompt   - Image generation prompt
 * @param {object} options  - { aspect_ratio: '9:16'|'16:9'|'1:1' }
 * @param {string} modelId  - Internal model ID (unused beyond routing, kept for API compat)
 * @returns {Promise<string>} Presigned S3 URL for the generated image
 */
export async function generateVertexImage(prompt, options = {}, modelId = 'vertex-nano-banana-2') {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is required');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt + ' 9:16 aspect ratio' }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Gemini image API failed');
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData || p.inline_data);
  if (!imagePart) throw new Error('No image returned from Gemini');

  const inline = imagePart.inlineData || imagePart.inline_data;
  const imageBytes = inline.data;
  const ext = (inline.mimeType || inline.mime_type || 'image/jpeg').split('/')[1] || 'jpeg';

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const fileName = `vertex_image_${Date.now()}.${ext}`;
  const localPath = path.join(TMP_DIR, fileName);

  try {
    fs.writeFileSync(localPath, Buffer.from(imageBytes, 'base64'));
    console.log(`[Vertex Image] Saved: ${localPath}`);
    const presignedUrl = await uploadToS3(localPath, `image/${ext}`, 'images');
    console.log(`[Vertex Image] Uploaded to S3`);
    return presignedUrl;
  } finally {
    if (fs.existsSync(localPath)) {
      try { fs.unlinkSync(localPath); } catch {}
    }
  }
}
