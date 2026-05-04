import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { uploadToS3 } from './s3.js';

const TMP_DIR = '/tmp/ai-video-gen';

const POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 10_000;

/**
 * Generates a video via Google Vertex AI (Veo 3.1) and returns a presigned S3 URL.
 *
 * @param {string} prompt - Video generation prompt
 * @param {string|null} imageUrl - Optional reference image URL for I2V
 * @param {number} duration - Duration in seconds (5 or 8)
 * @param {string} s3Prefix - S3 key prefix (default: 'videos')
 * @param {object} options - Reserved for future use
 * @returns {Promise<string>} Presigned S3 URL for the generated video
 */
export async function generateVeoVertexVideo(
  prompt,
  imageUrl,
  duration,
  s3Prefix = 'videos',
  options = {}
) {
  const project = process.env.VERTEX_PROJECT;
  const location = process.env.VERTEX_LOCATION;

  if (!project || !location) {
    throw new Error(
      'Vertex AI configuration error: VERTEX_PROJECT and VERTEX_LOCATION environment variables are required'
    );
  }

  const genaiClient = new GoogleGenAI({ vertexai: true, project, location });

  // Build the generation request
  const request = {
    model: 'veo-3.1-generate-001',
    prompt,
    config: {
      durationSeconds: duration,
    },
  };

  if (imageUrl) {
    // Vertex AI requires base64 imageBytes — fetch the image and convert
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch reference image: ${imgRes.status}`);
    const imgBuffer = await imgRes.buffer();
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    request.image = {
      imageBytes: imgBuffer.toString('base64'),
      mimeType,
    };
  }

  console.log(`[Vertex Video] Starting generation: model=veo-3.1-generate-001 duration=${duration}s`);

  const operation = await genaiClient.models.generateVideos(request);
  const operationName = operation.name;

  console.log(`[Vertex Video] Operation started: ${operationName}`);

  let localPath = null;
  try {
    // Poll until done or timeout
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      const op = await genaiClient.operations.get({ name: operationName });

      if (op.done) {
        const videoBytes = op.response?.generatedSamples?.[0]?.video?.videoBytes;
        if (!videoBytes) {
          throw new Error('Vertex AI returned a completed operation but no videoBytes were found');
        }

        // Write base64 video to temp file
        if (!fs.existsSync(TMP_DIR)) {
          fs.mkdirSync(TMP_DIR, { recursive: true });
        }
        const fileName = `vertex_video_${Date.now()}.mp4`;
        localPath = path.join(TMP_DIR, fileName);
        fs.writeFileSync(localPath, Buffer.from(videoBytes, 'base64'));
        console.log(`[Vertex Video] Saved temp file: ${localPath}`);

        const presignedUrl = await uploadToS3(localPath, 'video/mp4', s3Prefix);
        console.log(`[Vertex Video] Uploaded to S3, returning presigned URL`);
        return presignedUrl;
      }

      console.log(`[Vertex Video] Poll ${attempt + 1}/${POLL_ATTEMPTS}: still pending...`);
    }

    throw new Error('Vertex AI video generation timed out after 600s');
  } finally {
    if (localPath && fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
        console.log(`[Vertex Video] Cleaned up temp file: ${localPath}`);
      } catch (e) {
        console.warn(`[Vertex Video] Failed to clean up temp file: ${e.message}`);
      }
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
