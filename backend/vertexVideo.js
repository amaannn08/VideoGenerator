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

  // Vertex uses source: { prompt, image? } — not top-level prompt
  const source = { prompt };

  if (imageUrl) {
    // Fetch S3 image and convert to base64 imageBytes
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch reference image: ${imgRes.status}`);
    const imgBuffer = await imgRes.buffer();
    const mimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
    source.image = {
      imageBytes: imgBuffer.toString('base64'),
      mimeType,
    };
  }

  const params = {
    model: 'veo-3.1-generate-001',
    source,
    config: {
      numberOfVideos: 1,
      durationSeconds: duration,
    },
  };

  console.log(`[Vertex Video] Starting: duration=${duration}s i2v=${!!imageUrl}`);

  let operation = await ai.models.generateVideos(params);
  console.log(`[Vertex Video] Operation started: ${operation.name}`);

  let localPath = null;
  try {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      // Use ai.operations.get (not getVideosOperation) per official SDK samples
      operation = await ai.operations.get({ operation });

      if (operation.done) {
        const video = operation.response?.generatedVideos?.[0]?.video;
        if (!video) {
          throw new Error('Vertex AI returned a completed operation but no video was found');
        }

        if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
        const fileName = `vertex_video_${Date.now()}.mp4`;
        localPath = path.join(TMP_DIR, fileName);

        if (video.videoBytes) {
          // base64 inline bytes
          fs.writeFileSync(localPath, Buffer.from(video.videoBytes, 'base64'));
        } else if (video.uri) {
          // GCS URI — download with auth
          console.log(`[Vertex Video] Downloading from: ${video.uri}`);
          const token = await getAccessToken();
          const videoRes = await fetch(video.uri, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);
          const buf = await videoRes.buffer();
          fs.writeFileSync(localPath, buf);
        } else {
          // Use SDK's files.download as fallback
          await ai.files.download({
            file: operation.response.generatedVideos[0],
            downloadPath: localPath,
          });
        }

        const presignedUrl = await uploadToS3(localPath, 'video/mp4', s3Prefix);
        console.log(`[Vertex Video] Uploaded to S3`);
        return presignedUrl;
      }

      console.log(`[Vertex Video] Poll ${attempt + 1}/${POLL_ATTEMPTS}: pending…`);
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
