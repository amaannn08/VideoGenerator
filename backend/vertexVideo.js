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
 * @param {string|null} imageUrl - Optional reference image URL for I2V (S3 presigned URL)
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

  const ai = new GoogleGenAI({ vertexai: true, project, location });

  // Build request — top-level prompt/image, config nested
  const params = {
    model: 'veo-3.1-generate-001',
    prompt,
    config: {
      durationSeconds: duration,
      numberOfVideos: 1,
    },
  };

  if (imageUrl) {
    // Vertex AI requires base64 imageBytes — fetch the S3 image and convert
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch reference image: ${imgRes.status}`);
    const imgBuffer = await imgRes.buffer();
    const mimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
    params.image = {
      imageBytes: imgBuffer.toString('base64'),
      mimeType,
    };
  }

  console.log(`[Vertex Video] Starting generation: model=veo-3.1-generate-001 duration=${duration}s i2v=${!!imageUrl}`);

  let operation = await ai.models.generateVideos(params);
  console.log(`[Vertex Video] Operation started: ${operation.name}`);

  let localPath = null;
  try {
    // Poll using the SDK's getVideosOperation — pass the whole operation object back
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      operation = await ai.operations.getVideosOperation({ operation });

      if (operation.done) {
        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) {
          throw new Error('Vertex AI returned a completed operation but no video URI was found');
        }

        console.log(`[Vertex Video] Generation complete, downloading from GCS: ${videoUri}`);

        // Download the video from GCS URI using authenticated fetch
        const videoRes = await fetch(videoUri, {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        });
        if (!videoRes.ok) throw new Error(`Failed to download video from GCS: ${videoRes.status}`);
        const videoBuffer = await videoRes.buffer();

        // Write to temp file and upload to S3
        if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
        const fileName = `vertex_video_${Date.now()}.mp4`;
        localPath = path.join(TMP_DIR, fileName);
        fs.writeFileSync(localPath, videoBuffer);
        console.log(`[Vertex Video] Saved temp file: ${localPath}`);

        const presignedUrl = await uploadToS3(localPath, 'video/mp4', s3Prefix);
        console.log(`[Vertex Video] Uploaded to S3`);
        return presignedUrl;
      }

      console.log(`[Vertex Video] Poll ${attempt + 1}/${POLL_ATTEMPTS}: still pending…`);
    }

    throw new Error('Vertex AI video generation timed out after 600s');
  } finally {
    if (localPath && fs.existsSync(localPath)) {
      try { fs.unlinkSync(localPath); } catch {}
    }
  }
}

async function getAccessToken() {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
