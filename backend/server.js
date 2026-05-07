import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fetch from 'node-fetch';
import { MODELS } from './models.js';
import { SYSTEM_PROMPTS } from './prompts.js';
import { toVeoPrompt } from './veoPrompt.js';
import { initDb, query } from './db.js';
import { fal } from '@fal-ai/client';
import { GoogleAuth } from 'google-auth-library';
import {
  FAL_IMAGE_MODELS,
  FAL_VIDEO_MODELS,
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
  findVideoModel,
} from './models.js';
import {
  buildFalVideoInput,
  assertVeoI2vImagePreflight,
  isNoMediaGeneratedError,
  serializeFalError,
  probeImageDimensions,
} from './falVideoInputs.js';
import { generateVeoVertexVideo } from './vertexVideo.js';
import { generateVertexImage } from './vertexImage.js';

// Google Auth client for Translation API only
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Configure fal with API key
dotenv.config();
if (!process.env.FAL_KEY) {
  console.error('[Fal] CRITICAL: FAL_KEY is missing from environment variables!');
} else {
  console.log(`[Fal] API Key loaded (starts with: ${process.env.FAL_KEY.substring(0, 5)}...)`);
}
fal.config({ credentials: process.env.FAL_KEY });

// Language code map for Google Translate
const LANG_CODES = {
  Hindi: 'hi', English: 'en', Tamil: 'ta', Telugu: 'te',
  Bengali: 'bn', Marathi: 'mr', Punjabi: 'pa', Urdu: 'ur',
  Gujarati: 'gu', Kannada: 'kn', Malayalam: 'ml', Sanskrit: 'sa',
};
import { uploadToS3, extractS3KeyFromUrl, getPresignedReadUrlForKey } from './s3.js';

// Render deployment: decode base64 credentials to a temp file
if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  const creds = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
  const credsPath = '/tmp/credentials.json';
  fs.writeFileSync(credsPath, creds);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure tmp directory exists in a writable location for AWS
const TMP_DIR = '/tmp/ai-video-gen';
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Lightweight process health endpoint for load balancers and CI checks.
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Initialize PostgreSQL database
initDb();

// Init DeepSeek
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function withRetry(operation, maxRetries = 3, delayMs = 3000, isRetriableError = null) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (e) {
      lastError = e;
      const falDetail = e?.body != null ? ` ${JSON.stringify(e.body)}` : '';
      console.warn(`[Retry] Attempt ${attempt}/${maxRetries} failed: ${e.message}${falDetail}`);
      const retriable = isRetriableError ? isRetriableError(e) : true;
      if (!retriable || attempt >= maxRetries) break;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw lastError;
}

/** Infer image/* MIME so fal.storage.upload does not default to application/octet-stream (.octet URLs). */
function sniffImageMimeType(arrayBuffer) {
  const b = new Uint8Array(arrayBuffer.slice(0, 16));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    const tag = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (tag === 'WEBP') return 'image/webp';
  }
  return 'image/png';
}

function mimeTypeFromFilePath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return null;
}

function extractJson(text) {
  try {
    // Strip markdown fences if present
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to find JSON object within the text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return null;
  }
}

function normalizeCharacterList(input) {
  if (Array.isArray(input)) {
    return input
      .filter((item) => item && typeof item === 'object')
      .map((item, idx) => ({
        id: item.id || `char_${idx + 1}`,
        name: item.name || '',
        description: item.description || '',
        keyFeature: item.keyFeature || '',
        referenceImageUrl: item.referenceImageUrl || null,
      }))
      .filter((item) => item.name || item.description || item.keyFeature);
  }

  if (input && typeof input === 'object') {
    return normalizeCharacterList([input]);
  }

  if (typeof input === 'string' && input.trim()) {
    return normalizeCharacterList([{ description: input.trim() }]);
  }

  return [];
}

async function downloadFile(url, destPath) {
  const fetchUrl = url.includes('generativelanguage') ? (url.includes('?') ? `${url}&key=${GOOGLE_API_KEY}` : `${url}?key=${GOOGLE_API_KEY}`) : url;
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${fetchUrl}: ${res.statusText}`);
  const fileStream = fs.createWriteStream(destPath);
  return new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

// Read a local /tmp/ file as base64
function tmpFileToBase64(tmpUrl) {
  if (!tmpUrl || !tmpUrl.startsWith('/tmp/')) return null;
  const fileName = path.basename(tmpUrl);
  const localPath = path.join(TMP_DIR, fileName);
  if (!fs.existsSync(localPath)) return null;
  return fs.readFileSync(localPath).toString('base64');
}

function getErrorMessage(error) {
  if (error?.message) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH (Database Persistent)
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function randomToken() {
  return Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
}

// Middleware to check authentication
async function authenticate(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }

  try {
    const result = await query('SELECT username, expires_at FROM auth_tokens WHERE token = $1', [token]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { expires_at } = result.rows[0];
    if (Date.now() > parseInt(expires_at)) {
      await query('DELETE FROM auth_tokens WHERE token = $1', [token]);
      return res.status(401).json({ error: 'Token expired' });
    }

    // Token valid
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal auth error' });
  }
}

// Debug logging middleware for AWS headers
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development' || true) { // Enabled for now to debug your issue
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (req.headers['x-auth-token']) {
      console.log(`  [Auth] x-auth-token present`);
    } else if (req.url.startsWith('/api') && !req.url.includes('/auth/')) {
      console.log(`  [Auth] WARNING: x-auth-token MISSING for protected route`);
    }
  }
  next();
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const validUser = process.env.APP_USERNAME;
    const validPass = process.env.APP_PASSWORD;

    if (!validUser || !validPass) {
      return res.status(500).json({ error: 'Auth not configured on server' });
    }

    if (username !== validUser || password !== validPass) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = randomToken();
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    
    await query('INSERT INTO auth_tokens (token, username, expires_at) VALUES ($1, $2, $3)', [token, username, expiresAt]);
    
    res.json({ token, expiresIn: TOKEN_TTL_MS });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ valid: false });
  
  try {
    const result = await query('SELECT expires_at FROM auth_tokens WHERE token = $1', [token]);
    if (result.rows.length === 0) return res.status(401).json({ valid: false });
    
    if (Date.now() > parseInt(result.rows[0].expires_at)) {
      await query('DELETE FROM auth_tokens WHERE token = $1', [token]);
      return res.status(401).json({ valid: false, reason: 'expired' });
    }
    
    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({ valid: false });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. SCENE SPLITTING
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/scenes', authenticate, async (req, res) => {
  try {
    const { script, sceneCount = 3 } = req.body;
    if (!script) return res.status(400).json({ error: 'script is required' });

    const prompt = SYSTEM_PROMPTS.getSceneSplitPrompt(script, sceneCount);

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODELS.TEXT_MODEL,
    });

    let data = extractJson(completion.choices[0].message.content);
    if (!data) data = JSON.parse(completion.choices[0].message.content);

    // Support both old array format and new object format
    const scenes = Array.isArray(data) ? data : (data.scenes || []);
    const character = data.character || '';
    const narrativeArc = data.narrativeArc || '';

    res.json({ scenes, character, narrativeArc });
  } catch (error) {
    console.error('Error in /api/scenes:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b. SINGLE SCENE GENERATION FROM FREE-TEXT PROMPT
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/scenes/generate-one', authenticate, async (req, res) => {
  try {
    const { userPrompt, globalCharacter, sceneIndex = 0, totalScenes = 1 } = req.body;
    if (!userPrompt) return res.status(400).json({ error: 'userPrompt is required' });

    const promptText = SYSTEM_PROMPTS.getSceneFromPromptPrompt(userPrompt, globalCharacter, sceneIndex, totalScenes);

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: promptText }],
      model: MODELS.TEXT_MODEL,
    });

    let data = extractJson(completion.choices[0].message.content);
    if (!data) data = JSON.parse(completion.choices[0].message.content);

    res.json({ scene: data });
  } catch (error) {
    console.error('Error in /api/scenes/generate-one:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a. IMAGE PROMPT GENERATION
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT CHARACTER FROM SCRIPT
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/extract/character', authenticate, async (req, res) => {
  try {
    const { script } = req.body;
    if (!script) return res.status(400).json({ error: 'script is required' });

    const promptText = SYSTEM_PROMPTS.getCharacterExtractPrompt(script);
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: promptText }],
      model: MODELS.TEXT_MODEL,
    });

    let data = extractJson(completion.choices[0].message.content);
    if (!data) data = JSON.parse(completion.choices[0].message.content);
    const characters = normalizeCharacterList(data?.characters || data?.character || data);
    res.json({ characters, character: characters[0] || null });
  } catch (error) {
    console.error('Error in /api/extract/character:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT ENVIRONMENTS FROM SCRIPT
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/extract/environments', authenticate, async (req, res) => {
  try {
    const { script } = req.body;
    if (!script) return res.status(400).json({ error: 'script is required' });

    const promptText = SYSTEM_PROMPTS.getEnvironmentExtractPrompt(script);
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: promptText }],
      model: MODELS.TEXT_MODEL,
    });

    let data = extractJson(completion.choices[0].message.content);
    if (!data) data = JSON.parse(completion.choices[0].message.content);
    res.json({ environments: data.environments || [] });
  } catch (error) {
    console.error('Error in /api/extract/environments:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATE DIALOGUE (Google Cloud Translation API v2)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/translate', authenticate, async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (!targetLanguage) return res.json({ translatedText: text });

    const langCode = LANG_CODES[targetLanguage] || targetLanguage.toLowerCase().slice(0, 2);

    const client = await googleAuth.getClient();
    const token = await client.getAccessToken();

    const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: text, target: langCode, format: 'text' }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Translation API failed');

    const translatedText = result.data?.translations?.[0]?.translatedText || text;
    res.json({ translatedText });
  } catch (error) {
    console.error('Error in /api/translate:', error);
    // Fallback: return original text so pipeline doesn't break
    res.json({ translatedText: req.body.text, warning: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a. IMAGE PROMPT GENERATION
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/prompts/image', authenticate, async (req, res) => {
  try {
    const { scene, character, previousSceneImageDesc, sceneIndex = 0, totalScenes = 1, customInstruction, environment } = req.body;
    if (!scene) return res.status(400).json({ error: 'scene is required' });

    const promptText = SYSTEM_PROMPTS.getImagePromptGenerationPrompt(
      scene, character, previousSceneImageDesc, sceneIndex, totalScenes, customInstruction, environment
    );

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: promptText }],
      model: MODELS.TEXT_MODEL,
    });

    let data = extractJson(completion.choices[0].message.content);
    if (!data) data = JSON.parse(completion.choices[0].message.content);
    res.json({ imagePrompt: data.imagePrompt });
  } catch (error) {
    console.error('Error in /api/prompts/image:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2b. VIDEO PROMPT GENERATION
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/prompts/video', authenticate, async (req, res) => {
  try {
    const { scene, character, sceneIndex = 0, totalScenes = 1, customInstruction, environment, targetLanguage } = req.body;
    if (!scene) return res.status(400).json({ error: 'scene is required' });

    // Auto-translate dialogue if targetLanguage is set and dialogue exists
    let processedScene = scene;
    const dialogueText = scene.dialogue?.text || '';
    if (dialogueText && targetLanguage && targetLanguage !== (scene.dialogue?.language || 'Hindi')) {
      try {
        const langCode = LANG_CODES[targetLanguage] || targetLanguage.toLowerCase().slice(0, 2);
        const client = await googleAuth.getClient();
        const token = await client.getAccessToken();
        const tRes = await fetch('https://translation.googleapis.com/language/translate/v2', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: dialogueText, target: langCode, format: 'text' }),
        });
        const tData = await tRes.json();
        const translatedText = tData.data?.translations?.[0]?.translatedText;
        if (translatedText) {
          processedScene = {
            ...scene,
            dialogue: {
              ...scene.dialogue,
              text: translatedText,
              language: targetLanguage,
              phonetic: translatedText,
            },
          };
        }
      } catch (tErr) {
        console.warn('[Translation] Failed, using original dialogue:', tErr.message);
      }
    }

    const promptText = SYSTEM_PROMPTS.getVideoPromptGenerationPrompt(
      processedScene, character, sceneIndex, totalScenes, customInstruction, environment, targetLanguage
    );

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: promptText }],
      model: MODELS.TEXT_MODEL,
    });

    let data = extractJson(completion.choices[0].message.content);
    if (!data) data = JSON.parse(completion.choices[0].message.content);
    res.json({ videoPrompt: data.videoPrompt, duration: data.duration });
  } catch (error) {
    console.error('Error in /api/prompts/video:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. IMAGE GENERATION (Gemini Flash)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/image', authenticate, async (req, res) => {
  try {
    const { imagePrompt, referenceImage, modelId, options } = req.body;
    if (!imagePrompt) return res.status(400).json({ error: 'imagePrompt is required' });
    // If the requested modelId is unknown (e.g. stale localStorage), fall back to default
    const knownIds = FAL_IMAGE_MODELS.map(m => m.id);
    const resolvedModelId = knownIds.includes(modelId) ? modelId : DEFAULT_IMAGE_MODEL_ID;
    if (modelId && !knownIds.includes(modelId)) {
      console.warn(`[Image] Unknown modelId "${modelId}", falling back to default: ${DEFAULT_IMAGE_MODEL_ID}`);
    }
    const modelDef = FAL_IMAGE_MODELS.find(m => m.id === resolvedModelId);
    const sdk = modelDef?.sdk ?? 'fal';
    let publicUrl;
    if (sdk === 'vertex') {
      publicUrl = await generateVertexImage(imagePrompt, options || {}, resolvedModelId);
    } else {
      publicUrl = await withRetry(() => generateFalImage(imagePrompt, referenceImage, resolvedModelId, options));
    }
    res.json({ imageUrl: publicUrl });
  } catch (error) {
    console.error(`Error in /api/image [model=${req.body?.modelId}]:`, error.message);
    if (error.body) {
      console.error('Error body:', JSON.stringify(error.body, null, 2));
    }
    res.status(500).json(serializeFalError(error));
  }
});

app.get('/api/models', authenticate, (_req, res) => {
  res.json({ imageModels: FAL_IMAGE_MODELS, videoModels: FAL_VIDEO_MODELS });
});

app.post('/api/video', authenticate, async (req, res) => {
  try {
    const { videoPrompt, imageUrl, duration, dialogue, modelId, options, characterName } = req.body;
    if (!videoPrompt) return res.status(400).json({ error: 'videoPrompt is required' });

    const modelDef = findVideoModel(modelId || DEFAULT_VIDEO_MODEL_ID);
    const sdk = modelDef.sdk ?? 'fal';

    if (sdk === 'vertex') {
      // Vertex has its own internal poll loop — no withRetry wrapper
      const publicUrl = await generateVeoVertexVideo(videoPrompt, imageUrl, duration, 'videos', { dialogue, knownNames: characterName ? [characterName] : [] });
      return res.json({ videoUrl: publicUrl });
    }

    if (sdk === 'fal') {
      const publicUrl = await withRetry(
        () => generateFalVideo(videoPrompt, imageUrl, duration, 'videos', { ...options, dialogue, modelId: modelId || DEFAULT_VIDEO_MODEL_ID }),
        3,
        3000,
        (e) => !isNoMediaGeneratedError(e)
      );
      return res.json({ videoUrl: publicUrl });
    }

    return res.status(400).json({ error: `Unknown sdk: ${sdk}` });
  } catch (error) {
    console.error(`Error in /api/video [model=${req.body?.modelId}]:`, error.message);
    if (error.body) {
      console.error('Error body:', JSON.stringify(error.body, null, 2));
    }
    res.status(500).json(serializeFalError(error));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FAL IMAGE GENERATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

async function generateFalImage(imagePrompt, referenceImageUrl, modelId, options = {}) {
  const modelDef = FAL_IMAGE_MODELS.find(m => m.id === modelId) || FAL_IMAGE_MODELS[0];
  const useEdit = modelDef.supportsRef && referenceImageUrl?.startsWith('http') && modelDef.editEndpoint;
  const endpoint = useEdit ? modelDef.editEndpoint : modelDef.id;

  const arParam = modelDef.arParam || 'image_size';
  let arValue = options.aspect_ratio || modelDef.arValue || '9:16';

  console.log(`[Fal Debug] Initial: model=${modelId} arParam=${arParam} arValue=${arValue}`);

  // Force-normalize common strings
  const arMap = {
    'portrait_16_9': '9:16',
    'landscape_16_9': '16:9',
    'square': '1:1'
  };
  const reverseArMap = {
    '9:16': 'portrait_16_9',
    '16:9': 'landscape_16_9',
    '1:1': 'square'
  };

  if (arParam === 'aspect_ratio' && arMap[arValue]) {
    console.log(`[Fal Debug] Mapping ${arValue} -> ${arMap[arValue]} for aspect_ratio`);
    arValue = arMap[arValue];
  } else if (arParam === 'image_size' && reverseArMap[arValue]) {
    console.log(`[Fal Debug] Mapping ${arValue} -> ${reverseArMap[arValue]} for image_size`);
    arValue = reverseArMap[arValue];
  }

  const input = {
    prompt: imagePrompt,
    [arParam]: arValue,
    ...(options.negative_prompt ? { negative_prompt: options.negative_prompt } : {}),
  };
  if (modelDef.defaultStyle) {
    input.style = options.style || modelDef.defaultStyle;
  }
  if (options.resolution && modelDef.id.includes('nano-banana')) {
    input.resolution = options.resolution;
  }
  if (useEdit) {
    const refField = modelDef.editImageField || 'image_url';
    if (refField === 'image_urls') {
      input.image_urls = [referenceImageUrl];
    } else {
      input.image_url = referenceImageUrl;
    }
  }

  console.log(`[fal image] Final Config: endpoint=${endpoint} param=${arParam} value=${arValue}`);
  const result = await fal.subscribe(endpoint, { input, logs: false });
  const falUrl = result.data?.images?.[0]?.url;
  if (!falUrl) throw new Error('No image returned from fal');

  console.log(`[fal image] got url: ${falUrl}`);

  // Try S3 upload; if credentials are missing (local dev) return the raw Fal URL directly
  try {
    const resp = await fetch(falUrl);
    if (!resp.ok) throw new Error(`Failed to download fal image: ${resp.statusText}`);
    const fileName = `image_${Date.now()}.png`;
    const localPath = path.join(TMP_DIR, fileName);
    fs.writeFileSync(localPath, Buffer.from(await resp.arrayBuffer()));
    return await uploadToS3(localPath, 'image/png', 'images');
  } catch (err) {
    console.warn('[Image Fallback] Returning raw Fal URL:', err.message);
    return falUrl;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. VIDEO GENERATION (fal.ai — Veo 3.1 / Kling / Sora / etc.)
// ─────────────────────────────────────────────────────────────────────────────

async function generateFalVideo(prompt, imageUrl, duration, s3Prefix = 'videos', options = {}) {
  const { dialogue, modelId: rawModelId } = options;
  const truncatedPrompt = prompt.substring(0, 2000);
  const finalPrompt = toVeoPrompt(truncatedPrompt, dialogue);
  const modelDef = findVideoModel(rawModelId || DEFAULT_VIDEO_MODEL_ID);

  const durInt = parseInt(String(duration), 10) || 5;
  const hasPublicImageEarly = imageUrl?.startsWith('http');
  const wouldI2v = hasPublicImageEarly && modelDef.supportsI2V;
  const allowedList =
    wouldI2v && modelDef.allowedDurationsI2v?.length
      ? modelDef.allowedDurationsI2v
      : modelDef.allowedDurations || [5];
  const snappedDur = allowedList.reduce((prev, curr) =>
    Math.abs(curr - durInt) < Math.abs(prev - durInt) ? curr : prev
  );

  let finalImageUrl = imageUrl;

  if (finalImageUrl && finalImageUrl.startsWith('http') && !finalImageUrl.includes('fal.media')) {
    try {
      console.log(`[Fal Video] Proxying image through Fal storage for reliability...`);
      const resp = await fetch(finalImageUrl);
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const headerCt = resp.headers.get('content-type')?.split(';')[0]?.trim();
        let mime = headerCt && headerCt !== 'application/octet-stream' ? headerCt : sniffImageMimeType(buffer);
        finalImageUrl = await fal.storage.upload(new Blob([buffer], { type: mime }));
        console.log(`[Fal Video] Image proxied to Fal: ${finalImageUrl}`);
      }
    } catch (e) {
      console.warn('[Fal Video] Failed to proxy image to Fal storage:', e.message);
    }
  } else if (finalImageUrl && !finalImageUrl.startsWith('http')) {
    try {
      const localPath = finalImageUrl.startsWith('/') ? finalImageUrl : path.join(TMP_DIR, path.basename(finalImageUrl));
      if (fs.existsSync(localPath)) {
        const raw = fs.readFileSync(localPath);
        const mime = mimeTypeFromFilePath(localPath) || sniffImageMimeType(raw);
        finalImageUrl = await fal.storage.upload(new Blob([raw], { type: mime }));
      }
    } catch (e) {
      console.warn('[Fal Video] Failed to upload local image:', e.message);
    }
  }

  const hasPublicImage = finalImageUrl?.startsWith('http');
  const useI2V = hasPublicImage && modelDef.supportsI2V;
  if (modelDef.supportsI2V && !useI2V) {
    throw new Error('This video model requires a reference image URL for image-to-video.');
  }
  const endpoint = useI2V ? (modelDef.i2vEndpoint || modelDef.id) : modelDef.id;

  const arMap = { portrait_16_9: '9:16', landscape_16_9: '16:9', square: '1:1' };
  const inputAR = options.aspect_ratio || modelDef.arValue || '9:16';
  let aspectRatio = arMap[inputAR] || inputAR;

  const resolution = options.resolution || '720p';

  const negativePrompt = options.negative_prompt || '';
  const cfgScale = options.cfg_scale !== undefined ? options.cfg_scale : 0.5;
  const shouldGenAudio = options.generate_audio !== undefined ? options.generate_audio : modelDef.hasAudio;

  if (modelDef.videoInputKind === 'veo' && useI2V && finalImageUrl?.startsWith('http')) {
    try {
      const ir = await fetch(finalImageUrl);
      if (ir.ok) {
        const buf = await ir.arrayBuffer();
        assertVeoI2vImagePreflight(buf);
        if (options.veo_aspect_auto === true) {
          const dim = probeImageDimensions(buf);
          if (dim && dim.width > 0 && dim.height > 0) {
            const r = dim.width / dim.height;
            if (Math.abs(r - 9 / 16) < 0.04) aspectRatio = '9:16';
            else if (Math.abs(r - 16 / 9) < 0.04) aspectRatio = '16:9';
            else aspectRatio = 'auto';
          }
        }
      }
    } catch (e) {
      if (e.message?.includes('Input image') || e.message?.includes('exceeds')) throw e;
      console.warn('[Fal Video] Veo image preflight skipped:', e.message);
    }
  }

  console.log(`[Fal Video Debug] model=${modelDef.id} endpoint=${endpoint} ar=${aspectRatio} i2v=${useI2V}`);

  const input = buildFalVideoInput(modelDef, {
    finalPrompt,
    finalImageUrl,
    useI2V,
    endpoint,
    aspectRatio,
    resolution,
    negativePrompt,
    cfgScale,
    shouldGenAudio,
    snappedDur,
    options: { ...options, cfg_scale: cfgScale },
  });

  console.log(`[Fal Video Debug] Final Input:`, JSON.stringify(input, null, 2));
  const result = await fal.subscribe(endpoint, { input, logs: false });
  const falUrl = result.data?.video?.url;
  if (!falUrl) throw new Error(`No video returned from fal (endpoint: ${endpoint})`);

  const resp = await fetch(falUrl);
  if (!resp.ok) throw new Error(`Failed to download fal video: ${resp.statusText}`);
  const fileName = `video_${Date.now()}.mp4`;
  const localPath = path.join(TMP_DIR, fileName);
  fs.writeFileSync(localPath, Buffer.from(await resp.arrayBuffer()));
  console.log(`[fal video] saved to ${localPath}`);
  try {
    return await uploadToS3(localPath, 'video/mp4', s3Prefix);
  } catch (s3Error) {
    console.warn('[S3 Upload Fallback] S3 upload failed, returning raw Fal URL instead:', s3Error.message);
    return falUrl;
  }
}

// Duplicate removed

// ─────────────────────────────────────────────────────────────────────────────
// 5. MERGE VIDEOS (FFmpeg)
// ─────────────────────────────────────────────────────────────────────────────

async function mergeVideos(videoUrls, s3Prefix = 'merged') {
  const localPaths = [];
  for (const url of videoUrls) {
    if (url.startsWith('http')) {
      const fileName = path.basename(new URL(url).pathname);
      const localPath = path.join(TMP_DIR, fileName);
      if (!fs.existsSync(localPath)) {
        await downloadFile(url, localPath);
      }
      localPaths.push(localPath);
    } else if (url.startsWith('/tmp/')) {
      localPaths.push(path.join(__dirname, url));
    } else {
      localPaths.push(path.join(__dirname, url));
    }
  }

  const mergedFileName = `merged_${Date.now()}.mp4`;
  const mergedPath = path.join(TMP_DIR, mergedFileName);
  const concatTextPath = path.join(TMP_DIR, `concat_${Date.now()}.txt`);
  const concatText = localPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatTextPath, concatText);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatTextPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions('-c copy')
      .save(mergedPath)
      .on('end', () => {
        fs.unlinkSync(concatTextPath);
        resolve();
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(err);
      });
  });

  const publicUrl = await uploadToS3(mergedPath, 'video/mp4', s3Prefix);
  return publicUrl;
}

app.post('/api/merge', authenticate, async (req, res) => {
  try {
    const { videoUrls } = req.body;
    if (!videoUrls || videoUrls.length === 0) return res.status(400).json({ error: 'No videos provided' });
    const videoUrl = await mergeVideos(videoUrls);
    res.json({ videoUrl });
  } catch (error) {
    console.error('Error in /api/merge:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. AUTO-RUN PIPELINE (SSE) — The "Run Everything" endpoint
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/auto-run', authenticate, async (req, res) => {
  const { scenes, globalCharacter, globalCharacters, globalEnvironments, targetLanguage, sessionId, imageModelId, videoModelId } = req.body;

  if (!scenes || scenes.length === 0) {
    return res.status(400).json({ error: 'scenes array is required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function sendEvent(eventData) {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
  }

  // Track whether the client disconnected
  let cancelled = false;
  req.on('close', () => { cancelled = true; });

  const totalScenes = scenes.length;
  const normalizedCharacters = normalizeCharacterList(globalCharacters?.length ? globalCharacters : globalCharacter);
  const fallbackCharacter = normalizedCharacters[0] || normalizeCharacterList(globalCharacter)[0] || { description: '' };
  const resolveSceneCharacter = (scene) => (
    normalizedCharacters.find(c => c.id && c.id === scene?.selectedCharacterId) || fallbackCharacter
  );
  const resolveSceneEnvironment = (scene) => (
    (globalEnvironments || []).find(e => e.id && e.id === scene?.selectedEnvironmentId) ||
    (globalEnvironments || []).find(e =>
      scene?.location && e.name && scene.location.toLowerCase().includes(e.name.toLowerCase())
    ) ||
    (globalEnvironments || [])[0] ||
    null
  );

  try {
    // We need to track the accumulated scene data as we go
    const sceneResults = scenes.map(s => ({ ...s }));

    const saveProgress = async () => {
      if (!sessionId) return;
      try {
        await query('UPDATE sessions SET scenes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [JSON.stringify(sceneResults), sessionId]);
      } catch (err) {
        console.error('Error saving progress to DB:', err);
      }
    };

    for (let i = 0; i < totalScenes; i++) {
      if (cancelled) break;
      const scene = sceneResults[i];
      const sceneId = scene.id;

      // ── Step 1: Image Prompt ──────────────────────────────────────────────
      if (sceneResults[i].imagePrompt && sceneResults[i].status !== 'draft' && sceneResults[i].status !== 'generating_image_prompt') {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'image_prompt', status: 'done', data: { imagePrompt: sceneResults[i].imagePrompt } });
      } else {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'image_prompt', status: 'generating' });
        try {
          await withRetry(async () => {
            const prevScene = i > 0 ? sceneResults[i - 1] : null;
            const previousSceneImageDesc = prevScene?.imagePrompt
              ? `Previous scene image showed: ${prevScene.imagePrompt.substring(0, 300)}...`
              : null;
  
            const promptText = SYSTEM_PROMPTS.getImagePromptGenerationPrompt(
              scene, resolveSceneCharacter(scene), previousSceneImageDesc, i, totalScenes, null, resolveSceneEnvironment(scene)
            );
  
            const completion = await openai.chat.completions.create({
              messages: [{ role: 'user', content: promptText }],
              model: MODELS.TEXT_MODEL,
            });
  
            let data = extractJson(completion.choices[0].message.content);
            if (!data) data = JSON.parse(completion.choices[0].message.content);
  
            sceneResults[i].imagePrompt = data.imagePrompt;
            sceneResults[i].status = 'image_prompt_ready';
            await saveProgress();
            sendEvent({ type: 'scene_progress', sceneId, stage: 'image_prompt', status: 'done', data: { imagePrompt: data.imagePrompt } });
          });
        } catch (e) {
          sendEvent({ type: 'error', sceneId, stage: 'image_prompt', message: `Failed after retries: ${e.message}` });
          continue; // Skip to next scene
        }
      }

      if (cancelled) break;

      // ── Step 2: Generate Image ────────────────────────────────────────────
      if (sceneResults[i].imageUrl) {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'image', status: 'done', data: { imageUrl: sceneResults[i].imageUrl } });
      } else {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'image', status: 'generating' });
        try {
          await withRetry(async () => {
            const prevScene = i > 0 ? sceneResults[i - 1] : null;
            const refImageUrl = prevScene?.imageUrl?.startsWith('http') ? prevScene.imageUrl : null;
            const knownImgIds = FAL_IMAGE_MODELS.map(m => m.id);
            const resolvedImgModelId = knownImgIds.includes(imageModelId) ? imageModelId : DEFAULT_IMAGE_MODEL_ID;
            const imgModelDef = FAL_IMAGE_MODELS.find(m => m.id === resolvedImgModelId);
            const imgSdk = imgModelDef?.sdk ?? 'fal';
            let s3Url;
            if (imgSdk === 'vertex') {
              s3Url = await generateVertexImage(sceneResults[i].imagePrompt, {}, resolvedImgModelId);
            } else {
              s3Url = await generateFalImage(sceneResults[i].imagePrompt, refImageUrl, resolvedImgModelId);
            }
            sceneResults[i].imageUrl = s3Url;
            sceneResults[i].status = 'image_done';
            await saveProgress();
            sendEvent({ type: 'scene_progress', sceneId, stage: 'image', status: 'done', data: { imageUrl: s3Url } });
          });
        } catch (e) {
          sendEvent({ type: 'error', sceneId, stage: 'image', message: `Failed after retries: ${e.message}` });
          continue;
        }
      }

      if (cancelled) break;

      // ── Step 3: Video Prompt ──────────────────────────────────────────────
      if (sceneResults[i].videoPrompt && sceneResults[i].status !== 'image_done' && sceneResults[i].status !== 'generating_video_prompt') {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'video_prompt', status: 'done', data: { videoPrompt: sceneResults[i].videoPrompt, duration: sceneResults[i].duration } });
      } else {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'video_prompt', status: 'generating' });
        try {
          await withRetry(async () => {
            // Translate dialogue if targetLanguage set
            let processedScene = { ...scene };
            const dialogueText = scene.dialogue?.text || '';
            if (dialogueText && targetLanguage && targetLanguage !== (scene.dialogue?.language || 'Hindi')) {
              try {
                const langCode = LANG_CODES[targetLanguage] || targetLanguage.toLowerCase().slice(0, 2);
                const client = await googleAuth.getClient();
                const token = await client.getAccessToken();
                const tRes = await fetch('https://translation.googleapis.com/language/translate/v2', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token.token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ q: dialogueText, target: langCode, format: 'text' }),
                });
                const tData = await tRes.json();
                const translated = tData.data?.translations?.[0]?.translatedText;
                if (translated) {
                  processedScene = {
                    ...processedScene,
                    dialogue: {
                      ...scene.dialogue,
                      text: translated,
                      language: targetLanguage,
                      phonetic: translated,
                    },
                  };
                }
              } catch (tErr) {
                console.warn('[Auto-run translation] Failed:', tErr.message);
              }
            }

            const promptText = SYSTEM_PROMPTS.getVideoPromptGenerationPrompt(
              processedScene, resolveSceneCharacter(scene), i, totalScenes, null, resolveSceneEnvironment(scene), targetLanguage
            );
  
            const completion = await openai.chat.completions.create({
              messages: [{ role: 'user', content: promptText }],
              model: MODELS.TEXT_MODEL,
            });
  
            let data = extractJson(completion.choices[0].message.content);
            if (!data) data = JSON.parse(completion.choices[0].message.content);
  
            sceneResults[i].dialogue = processedScene.dialogue || sceneResults[i].dialogue;
            sceneResults[i].videoPrompt = data.videoPrompt;
            sceneResults[i].duration = data.duration || scene.duration;
            sceneResults[i].status = 'video_prompt_ready';
            await saveProgress();
            sendEvent({ type: 'scene_progress', sceneId, stage: 'video_prompt', status: 'done', data: { videoPrompt: data.videoPrompt, duration: data.duration } });
          });
        } catch (e) {
          sendEvent({ type: 'error', sceneId, stage: 'video_prompt', message: `Failed after retries: ${e.message}` });
          continue;
        }
      }

      if (cancelled) break;

      // ── Step 4: Generate Video ────────────────────────────────────────────
      const existingFinalGen = sceneResults[i].videoGenerations?.find(g => g.isFinal);
      if (existingFinalGen) {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'video', status: 'done', data: { videoUrl: existingFinalGen.videoUrl } });
      } else {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'video', status: 'generating' });
        try {
          await withRetry(
            async () => {
              const sr = sceneResults[i];
              const videoModelDef = findVideoModel(videoModelId || DEFAULT_VIDEO_MODEL_ID);
              const videoSdk = videoModelDef.sdk ?? 'fal';
              const videoUrl = videoSdk === 'vertex'
                ? await generateVeoVertexVideo(
                    sr.videoPrompt,
                    sr.imageUrl,
                    sr.duration,
                    `sessions/${sessionId || 'temp'}/videos`,
                    { dialogue: sr.dialogue, knownNames: sr.characterName ? [sr.characterName] : (fallbackCharacter?.name ? [fallbackCharacter.name] : []) }
                  )
                : await generateFalVideo(
                    sr.videoPrompt,
                    sr.imageUrl,
                    sr.duration,
                    `sessions/${sessionId || 'temp'}/videos`,
                    {
                      dialogue: sr.dialogue,
                      modelId: videoModelId || DEFAULT_VIDEO_MODEL_ID,
                      aspect_ratio: sr.aspectRatio || sr.aspect_ratio || '9:16',
                      resolution: sr.resolution || '720p',
                      generate_audio: sr.generate_audio,
                      negative_prompt: sr.negative_prompt,
                      cfg_scale: sr.cfg_scale,
                    }
                  );
              const genId = Math.random().toString(36).substr(2, 9);
              const generation = { id: genId, videoUrl, createdAt: Date.now(), isFinal: true };
              sceneResults[i].videoGenerations = [...(sceneResults[i].videoGenerations || []), generation];
              sceneResults[i].videoUrl = videoUrl;
              sceneResults[i].status = 'video_done';
              await saveProgress();
              sendEvent({ type: 'scene_progress', sceneId, stage: 'video', status: 'done', data: { videoUrl, generationId: genId } });
            },
            3,
            5000,
            (e) => !isNoMediaGeneratedError(e)
          );
        } catch (e) {
          const fal = serializeFalError(e);
          sendEvent({
            type: 'error',
            sceneId,
            stage: 'video',
            message: `Failed after retries: ${fal.falMsg || fal.error}`,
            data: fal,
          });
          continue;
        }
      }
    }

    if (cancelled) {
      sendEvent({ type: 'cancelled', message: 'Pipeline was stopped by user' });
      res.end();
      return;
    }

    // ── Step 5: Merge final videos ────────────────────────────────────────
    const completedVideoUrls = sceneResults
      .map(s => {
        const finalGen = s.videoGenerations?.find(g => g.isFinal);
        return finalGen?.videoUrl || s.videoUrl;
      })
      .filter(Boolean);

    if (completedVideoUrls.length === 0) {
      sendEvent({ type: 'error', stage: 'merge', message: 'No videos were generated successfully' });
      res.end();
      return;
    }

    sendEvent({ type: 'merge', status: 'merging' });

    try {
      const mergedVideoUrl = await mergeVideos(completedVideoUrls, `sessions/${sessionId || 'temp'}/merged`);
      sendEvent({ type: 'pipeline_complete', data: { mergedVideoUrl, sceneResults } });
    } catch (e) {
      sendEvent({ type: 'error', stage: 'merge', message: e.message });
    }

  } catch (error) {
    console.error('Error in /api/auto-run:', error);
    sendEvent({ type: 'error', stage: 'pipeline', message: error.message });
  }

  res.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/sessions', authenticate, async (req, res) => {
  try {
    const { script, globalCharacter, globalCharacters, narrativeArc, scenes, mergedVideo, globalEnvironments, targetLanguage } = req.body;
    const sessionId = Math.random().toString(36).substr(2, 9);
    const normalizedCharacters = normalizeCharacterList(globalCharacters?.length ? globalCharacters : globalCharacter);
    const charValue = normalizedCharacters.length ? JSON.stringify(normalizedCharacters) : '';

    await query(
      'INSERT INTO sessions (id, script, global_character, narrative_arc, scenes, merged_video, global_environments, target_language) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8)',
      [sessionId, script || '', charValue, narrativeArc || '', JSON.stringify(scenes || []), mergedVideo || null, JSON.stringify(globalEnvironments || []), targetLanguage || 'Hindi']
    );

    res.json({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/api/sessions', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT id, name, narrative_arc, updated_at FROM sessions ORDER BY updated_at DESC');
    res.json({ sessions: result.rows });
  } catch (error) {
    console.error('Error fetching all sessions:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/api/sessions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM sessions WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const row = result.rows[0];

    let parsedCharacterData = row.global_character;
    try {
      parsedCharacterData = JSON.parse(parsedCharacterData);
    } catch {
      // Keep as-is for normalization below.
    }
    const globalCharacters = normalizeCharacterList(parsedCharacterData);
    const globalCharacter = globalCharacters[0] || { name: '', description: '', keyFeature: '', referenceImageUrl: null };

    res.json({
      id: row.id,
      script: row.script,
      globalCharacters,
      globalCharacter,
      narrativeArc: row.narrative_arc,
      scenes: row.scenes,
      mergedVideo: row.merged_video,
      globalEnvironments: row.global_environments || [],
      targetLanguage: row.target_language || 'Hindi',
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.put('/api/sessions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { script, globalCharacter, globalCharacters, narrativeArc, scenes, mergedVideo, globalEnvironments, targetLanguage } = req.body;
    const charValue = (globalCharacter !== undefined || globalCharacters !== undefined)
      ? JSON.stringify(normalizeCharacterList(globalCharacters?.length ? globalCharacters : globalCharacter))
      : null;

    const result = await query(
      `UPDATE sessions
       SET script = COALESCE($1, script),
           global_character = COALESCE($2, global_character),
           narrative_arc = COALESCE($3, narrative_arc),
           scenes = COALESCE($4::jsonb, scenes),
           merged_video = COALESCE($5, merged_video),
           global_environments = COALESCE($6::jsonb, global_environments),
           target_language = COALESCE($7, target_language),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING id`,
      [script, charValue, narrativeArc, scenes ? JSON.stringify(scenes) : null, mergedVideo,
       globalEnvironments ? JSON.stringify(globalEnvironments) : null, targetLanguage, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.delete('/api/sessions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM sessions WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.patch('/api/sessions/:id/rename', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const result = await query(
      'UPDATE sessions SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
      [name.trim(), id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error renaming session:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. MEDIA URL REFRESH (S3 presigned URL rotation)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/media/refresh', authenticate, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    const key = extractS3KeyFromUrl(url);
    if (!key) {
      return res.status(400).json({ error: 'Could not extract S3 key from URL' });
    }

    const signedUrl = await getPresignedReadUrlForKey(key);
    res.json({ url: signedUrl });
  } catch (error) {
    console.error('Error refreshing media URL:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.post('/api/media/refresh-batch', authenticate, async (req, res) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls array is required' });
    }

    const uniqueUrls = [...new Set(urls.filter(u => typeof u === 'string' && u.startsWith('http')))];
    const refreshed = {};

    await Promise.all(uniqueUrls.map(async (url) => {
      try {
        const key = extractS3KeyFromUrl(url);
        if (!key) return;
        refreshed[url] = await getPresignedReadUrlForKey(key);
      } catch (err) {
        console.warn(`[Media refresh] Failed for URL: ${url}. ${getErrorMessage(err)}`);
      }
    }));

    res.json({ urls: refreshed });
  } catch (error) {
    console.error('Error refreshing media URLs in batch:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATIC FILE SERVING
// ─────────────────────────────────────────────────────────────────────────────

app.use('/tmp', express.static(TMP_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
