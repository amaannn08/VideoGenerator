import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { uploadToS3 } from './s3.js';

const TMP_DIR = '/tmp/ai-video-gen';

/**
 * Generates an image via Vertex AI Imagen 3 using @google/genai SDK (supports ADC).
 */
export async function generateVertexImage(prompt, options = {}, modelId = 'vertex-nano-banana-2') {
  const project = process.env.VERTEX_PROJECT;
  const location = process.env.VERTEX_LOCATION || 'us-central1';

  if (!project) {
    throw new Error('VERTEX_PROJECT environment variable is required');
  }

  const ai = new GoogleGenAI({ vertexai: true, project, location });

  const result = await ai.models.generateImages({
    model: 'imagen-3.0-generate-002',
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '9:16',
      safetyFilterLevel: 'block_few',
      personGeneration: 'allow_all',
    },
  });

  const imageData = result.generatedImages?.[0];
  console.log('[Vertex Image] Response keys:', JSON.stringify(Object.keys(result || {})));
  console.log('[Vertex Image] First image keys:', JSON.stringify(Object.keys(imageData || {})));
  if (!imageData) {
    throw new Error('No image returned from Vertex Imagen');
  }

  // SDK may return imageBytes directly or nested under image.imageBytes
  const bytes = imageData.imageBytes || imageData.image?.imageBytes || imageData.image?.bytesBase64Encoded;
  if (!bytes) {
    console.error('[Vertex Image] Full response:', JSON.stringify(result, null, 2));
    throw new Error(`No image bytes in response. Keys: ${Object.keys(imageData).join(', ')}`);
  }

  const mimeType = imageData.mimeType || imageData.image?.mimeType || 'image/png';
  const ext = mimeType.split('/')[1] || 'png';

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const fileName = `vertex_image_${Date.now()}.${ext}`;
  const localPath = path.join(TMP_DIR, fileName);

  try {
    fs.writeFileSync(localPath, Buffer.from(bytes, 'base64'));
    console.log(`[Vertex Image] Saved: ${localPath}`);

    try {
      const presignedUrl = await uploadToS3(localPath, mimeType, 'images');
      console.log(`[Vertex Image] Uploaded to S3`);
      return presignedUrl;
    } catch (s3Error) {
      // S3 not available locally — serve the file directly via backend
      console.warn(`[Vertex Image] S3 unavailable, serving locally: ${s3Error.message}`);
      const fileName = path.basename(localPath);
      return `http://localhost:${process.env.PORT || 3000}/tmp/${fileName}`;
    }
  } finally {
    // Don't delete if S3 failed — file is being served locally
  }
}
