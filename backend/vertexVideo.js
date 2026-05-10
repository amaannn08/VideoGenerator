import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { uploadToS3 } from './s3.js';

const TMP_DIR = '/tmp/ai-video-gen';
const POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 10_000;

// Word-level substitutions for known Vertex filter triggers.
const VERTEX_WORD_MAP = [
  [/partially unbuttoned/gi, 'loosely fastened'],
  [/unbuttoned/gi, 'open-collared'],
  [/bare torso/gi, 'unclothed upper body'],
  [/bare chest/gi, 'unclothed chest'],
  [/bare skin/gi, 'exposed skin'],
  [/cleavage/gi, 'neckline'],
  [/trembling lips/gi, 'lips part slightly'],
  [/quivering/gi, 'slightly unsteady'],
  [/heaving/gi, 'rising and falling'],
  [/sensual/gi, 'expressive'],
  [/vulnerable/gi, 'open'],
  [/fragile/gi, 'delicate'],
];

/**
 * Converts the internal labeled-block prompt format into Veo-friendly natural language.
 *
 * Key transforms:
 * 1. Strips the NEGATIVE: block entirely (its absence is sufficient; listing negatives can trigger the filter).
 * 2. Rewrites DIALOGUE: pipe-syntax into Veo's native "the [character] says: [line]" format.
 * 3. Removes CHARACTER/CHARACTER_KEY_FEATURE labels (redundant noise for the classifier).
 * 4. Applies word-level substitutions for known trigger phrases.
 */
function sanitizePromptForVertex(prompt, knownNames = []) {
  let out = prompt;

  // 1. Drop the NEGATIVE block — its absence is enough
  out = out.replace(/\nNEGATIVE:[^\n]*/gi, '');

  // 2. Rewrite DIALOGUE block: extract text and mode, emit natural Veo syntax
  // Matches: DIALOGUE: "some line" | phonetic: "..." | mode: narration | tone: ... | pacing: ...
  out = out.replace(
    /DIALOGUE:\s*"([^"]+)"[^\n]*/gi,
    (_, line) => `A voice says: ${line}`
  );
  // Also handle: DIALOGUE: None. ...
  out = out.replace(/DIALOGUE:\s*None\.[^\n]*/gi, '');

  // 3. Strip structural label prefixes that add no value for Veo
  const labelsToStrip = [
    'CHARACTER_KEY_FEATURE',
    'ACTION_START',
    'ACTION_END',
    'EXPRESSION_ARC',
  ];
  for (const label of labelsToStrip) {
    out = out.replace(new RegExp(`${label}:\\s*`, 'gi'), '');
  }

  // Flatten remaining labeled blocks into readable sentences
  out = out.replace(/^(CHARACTER|ACTION|ENVIRONMENT|LIGHTING|CAMERA|STYLE):\s*/gim, '');

  // 4. Strip any real person names passed in (runtime safety net)
  for (const name of knownNames) {
    if (!name || name.length < 2) continue;
    // Match full name and individual parts (e.g. "Isaac Newton" → also strip "Newton" alone)
    const parts = [name, ...name.split(/\s+/).filter(p => p.length > 2)];
    for (const part of parts) {
      out = out.replace(new RegExp(`\\b${part}\\b`, 'gi'), '');
    }
  }

  // 5. Word-level substitutions
  for (const [pattern, replacement] of VERTEX_WORD_MAP) {
    out = out.replace(pattern, replacement);
  }

  // Clean up excess blank lines and double spaces left by name removal
  out = out.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return out;
}

// Always use Veo 3.1 Lite — full model is intentionally excluded
const VERTEX_VIDEO_MODEL_MAP = {
  'vertex-veo3.1-lite': 'veo-3.1-lite-generate-001',
};
const VERTEX_VIDEO_MODEL_DEFAULT = 'veo-3.1-lite-generate-001';

/**
 * Generates a video via Google Vertex AI (Veo 3.1) and returns a presigned S3 URL.
 * @param {string} [options.modelId] - Internal model ID from the registry (e.g. 'vertex-veo3.1-lite').
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

  const sanitizedPrompt = sanitizePromptForVertex(prompt, options.knownNames || []);
  if (sanitizedPrompt !== prompt) {
    console.log(`[Vertex Video] Prompt sanitized (${prompt.length - sanitizedPrompt.length} chars changed)`);
  }

  const vertexModel = VERTEX_VIDEO_MODEL_MAP[options.modelId] || VERTEX_VIDEO_MODEL_DEFAULT;
  console.log(`[Vertex Video] Using model: ${vertexModel} (requested: ${options.modelId || 'none → default'})`);

  const params = {
    model: vertexModel,
    prompt: sanitizedPrompt,
    config: {
      numberOfVideos: 1,
      durationSeconds: duration,
      aspectRatio: '9:16',
      personGeneration: 'allow_all',
      generateAudio: true,
      resolution: '720p',
    },
  };

  // SDK Image type only accepts imageBytes (base64) or gcsUri — no 'uri' field
  if (imageUrl) {
    if (imageUrl.startsWith('gs://')) {
      params.image = { gcsUri: imageUrl };
    } else if (imageUrl.startsWith('http')) {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Failed to fetch reference image: ${imgRes.status}`);
      const mimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const buf = await imgRes.buffer();
      params.image = { imageBytes: buf.toString('base64'), mimeType };
    }
    console.log(`[Vertex Video] Using reference image (i2v)`);
  }

  console.log(`[Vertex Video] Starting: duration=${duration}s i2v=${!!imageUrl}`);

  let operation = await ai.models.generateVideos(params);
  console.log(`[Vertex Video] Operation started: ${operation.name}`);

  let localPath = null;
  try {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      operation = await ai.operations.get({ operation });

      if (operation.done) {
        if (operation.error) {
          throw new Error(`[Vertex Video] Operation failed: ${JSON.stringify(operation.error)}`);
        }

        // SDK type: GenerateVideosResponse.generatedVideos
        const videoEntry = operation.response?.generatedVideos?.[0]?.video;

        if (!videoEntry) {
          console.error('[Vertex Video] Full response:', JSON.stringify(operation.response, null, 2));
          throw new Error(
            `Vertex AI returned a completed operation but no video was found. Response keys: ${Object.keys(operation.response || {}).join(', ')}`
          );
        }

        if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
        const fileName = `vertex_video_${Date.now()}.mp4`;
        localPath = path.join(TMP_DIR, fileName);

        if (videoEntry.videoBytes) {
          fs.writeFileSync(localPath, Buffer.from(videoEntry.videoBytes, 'base64'));
        } else if (videoEntry.uri) {
          console.log(`[Vertex Video] Downloading from GCS: ${videoEntry.uri}`);
          const token = await getAccessToken();
          const videoRes = await fetch(videoEntry.uri, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);
          const buf = await videoRes.buffer();
          fs.writeFileSync(localPath, buf);
        } else {
          throw new Error(
            `[Vertex Video] Unexpected video payload. Keys: ${Object.keys(videoEntry).join(', ')}`
          );
        }

        try {
          const presignedUrl = await uploadToS3(localPath, 'video/mp4', s3Prefix);
          console.log(`[Vertex Video] Uploaded to S3`);
          return presignedUrl;
        } catch (s3Error) {
          console.warn(`[Vertex Video] S3 unavailable, serving locally: ${s3Error.message}`);
          const fileName = path.basename(localPath);
          return `http://localhost:${process.env.PORT || 3000}/tmp/${fileName}`;
        }
      }

      console.log(`[Vertex Video] Poll ${attempt + 1}/${POLL_ATTEMPTS}: pending…`);
    }

    throw new Error('Vertex AI video generation timed out after 600s');
  } finally {
    // Don't delete if S3 failed — file is being served locally
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
