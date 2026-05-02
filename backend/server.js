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
import { FAL_IMAGE_MODELS, FAL_VIDEO_MODELS, DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID } from './models.js';

// Google Auth client for Translation API only
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Configure fal with API key
dotenv.config();
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

// Ensure tmp directory exists
const TMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR);
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

async function withRetry(operation, maxRetries = 3, delayMs = 3000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (e) {
      lastError = e;
      console.warn(`[Retry] Attempt ${attempt}/${maxRetries} failed: ${e.message}`);
      if (attempt < maxRetries) {
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  throw lastError;
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
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const authTokens = new Map(); // token -> expiresAt

function randomToken() {
  return Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
}

app.post('/api/auth/login', (req, res) => {
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
  authTokens.set(token, Date.now() + TOKEN_TTL_MS);
  res.json({ token, expiresIn: TOKEN_TTL_MS });
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token || !authTokens.has(token)) return res.status(401).json({ valid: false });
  if (Date.now() > authTokens.get(token)) {
    authTokens.delete(token);
    return res.status(401).json({ valid: false, reason: 'expired' });
  }
  res.json({ valid: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. SCENE SPLITTING
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/scenes', async (req, res) => {
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

app.post('/api/scenes/generate-one', async (req, res) => {
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
// 1b. SINGLE SCENE GENERATION FROM FREE-TEXT PROMPT
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/scenes/generate-one', async (req, res) => {
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
// EXTRACT CHARACTER FROM SCRIPT
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/extract/character', async (req, res) => {
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

app.post('/api/extract/environments', async (req, res) => {
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

app.post('/api/translate', async (req, res) => {
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

app.post('/api/prompts/image', async (req, res) => {
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

app.post('/api/prompts/video', async (req, res) => {
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

app.post('/api/image', async (req, res) => {
  try {
    const { imagePrompt, referenceImage, modelId, options } = req.body;
    if (!imagePrompt) return res.status(400).json({ error: 'imagePrompt is required' });
    const publicUrl = await withRetry(() => generateFalImage(imagePrompt, referenceImage, modelId || DEFAULT_IMAGE_MODEL_ID, options));
    res.json({ imageUrl: publicUrl });
  } catch (error) {
    console.error(`Error in /api/image [model=${req.body?.modelId}]:`, error.message);
    if (error.body) {
      console.error('Error body:', JSON.stringify(error.body, null, 2));
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/video', async (req, res) => {
  try {
    const { videoPrompt, imageUrl, duration, dialogue, modelId, options } = req.body;
    if (!videoPrompt) return res.status(400).json({ error: 'videoPrompt is required' });
    const publicUrl = await withRetry(() => generateFalVideo(videoPrompt, imageUrl, duration, 'videos', { ...options, dialogue, modelId }));
    res.json({ videoUrl: publicUrl });
  } catch (error) {
    console.error(`Error in /api/video [model=${req.body?.modelId}]:`, error.message);
    if (error.body) {
      console.error('Error body:', JSON.stringify(error.body, null, 2));
    }
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVE MODEL REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/models', (_req, res) => {
  res.json({ imageModels: FAL_IMAGE_MODELS, videoModels: FAL_VIDEO_MODELS });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAL IMAGE GENERATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

async function generateFalImage(imagePrompt, referenceImageUrl, modelId, options = {}) {
  const modelDef = FAL_IMAGE_MODELS.find(m => m.id === modelId) || FAL_IMAGE_MODELS[0];
  const useEdit = modelDef.supportsRef && referenceImageUrl?.startsWith('http') && modelDef.editEndpoint;
  const endpoint = useEdit ? modelDef.editEndpoint : modelDef.id;

  const arParam = modelDef.arParam || 'image_size';
  const arValue = options.aspect_ratio || modelDef.arValue || 'portrait_16_9';

  const input = { 
    prompt: imagePrompt, 
    [arParam]: arValue,
    ...(options.negative_prompt ? { negative_prompt: options.negative_prompt } : {})
  };
  if (useEdit) {
    input.image_url = referenceImageUrl;
  }

  console.log(`[fal image] endpoint=${endpoint} useEdit=${useEdit} ar=${arValue}`);
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
  const { dialogue, modelId } = options;
  const finalPrompt = toVeoPrompt(prompt, dialogue);
  const modelDef = FAL_VIDEO_MODELS.find(m => m.id === modelId) || FAL_VIDEO_MODELS[0];

  const durInt = parseInt(duration) || 5;
  const allowed = modelDef.allowedDurations || [5];
  // Snap to nearest allowed duration
  const snappedDur = allowed.reduce((prev, curr) => 
    Math.abs(curr - durInt) < Math.abs(prev - durInt) ? curr : prev
  );

  const durationStr = `${snappedDur}s`;
  const klingDurationStr = `${snappedDur}`;
  const veoDurationStr = `${snappedDur}s`;

  let finalImageUrl = imageUrl;
  const hasPublicImage = finalImageUrl?.startsWith('http');

  // If the image is an unsigned S3 URL, Fal AI cannot download it (returns Unprocessable Entity)
  if (hasPublicImage && finalImageUrl.includes('.s3.') && !finalImageUrl.includes('X-Amz-Credential')) {
    try {
      const key = extractS3KeyFromUrl(finalImageUrl);
      if (key) {
        finalImageUrl = await getPresignedReadUrlForKey(key);
      }
    } catch (e) {
      console.warn('Failed to presign S3 image URL for video generation:', e.message);
      throw new Error('Cannot use this image for video generation because your local environment lacks AWS credentials to make the S3 image publicly accessible to Fal AI.');
    }
  }

  const useI2V = hasPublicImage && modelDef.supportsI2V;
  const endpoint = useI2V ? modelDef.i2vEndpoint : modelDef.id;

  // Build model-specific input — each model has a different schema
  const aspectRatio = options.aspect_ratio || '9:16';
  const resolution = options.resolution || '720p';
  const negativePrompt = options.negative_prompt || '';
  const cfgScale = options.cfg_scale !== undefined ? options.cfg_scale : 0.5;
  const shouldGenAudio = options.generate_audio !== undefined ? options.generate_audio : modelDef.hasAudio;

  let input;
  if (modelDef.inputSchema === 'minimax') {
    // Minimax only accepts prompt (+ optional prompt_optimizer)
    input = useI2V
      ? { prompt: finalPrompt, image_url: finalImageUrl }
      : { prompt: finalPrompt };
  } else if (modelDef.inputSchema === 'kling') {
    // Kling duration is "5" or "10" (no 's' suffix)
    const base = { 
      prompt: finalPrompt, 
      duration: klingDurationStr, 
      cfg_scale: cfgScale,
      aspect_ratio: aspectRatio,
      negative_prompt: negativePrompt,
      generate_audio: shouldGenAudio
    };
    input = useI2V ? { ...base, image_url: finalImageUrl } : base;
  } else if (modelDef.inputSchema === 'wan') {
    // WAN 2.1 I2V — no duration field, uses aspect_ratio + resolution
    const base = { 
      prompt: finalPrompt, 
      aspect_ratio: aspectRatio, 
      resolution: resolution,
      negative_prompt: negativePrompt
    };
    input = useI2V ? { ...base, image_url: finalImageUrl } : base;
  } else if (modelDef.inputSchema === 'veo') {
    // Veo 3.1 — duration as "Xs", aspect_ratio, resolution, generate_audio
    const base = { 
      prompt: finalPrompt, 
      aspect_ratio: aspectRatio, 
      duration: durationStr, 
      resolution: resolution,
      negative_prompt: negativePrompt,
      generate_audio: shouldGenAudio
    };
    input = useI2V ? { ...base, image_url: finalImageUrl } : base;
  } else {
    // Default: Luma Ray2, Hunyuan — duration as "Xs", aspect_ratio, resolution
    const base = { 
      prompt: finalPrompt, 
      aspect_ratio: aspectRatio, 
      duration: durationStr, 
      resolution: resolution,
      negative_prompt: negativePrompt,
      generate_audio: shouldGenAudio
    };
    input = useI2V ? { ...base, image_url: finalImageUrl } : base;
  }

  console.log(`[fal video] endpoint=${endpoint} i2v=${useI2V} dur=${durationStr} schema=${modelDef.inputSchema||'default'}`);
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

app.post('/api/video', async (req, res) => {
  try {
    const { videoPrompt, imageUrl, duration, dialogue, modelId } = req.body;
    if (!videoPrompt) return res.status(400).json({ error: 'videoPrompt is required' });
    const videoUrl = await generateFalVideo(videoPrompt, imageUrl, duration, 'videos', { dialogue, modelId: modelId || DEFAULT_VIDEO_MODEL_ID });
    res.json({ videoUrl });
  } catch (error) {
    console.error('Error in /api/video:', error);
    if (error.body && error.body.detail) {
      console.error('Validation details:', JSON.stringify(error.body.detail, null, 2));
    }
    res.status(500).json({ error: error.message });
  }
});

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

app.post('/api/merge', async (req, res) => {
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

app.post('/api/auto-run', async (req, res) => {
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
            const s3Url = await generateFalImage(
              sceneResults[i].imagePrompt,
              refImageUrl,
              imageModelId || DEFAULT_IMAGE_MODEL_ID
            );
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
          await withRetry(async () => {
            const videoUrl = await generateFalVideo(
              sceneResults[i].videoPrompt,
              sceneResults[i].imageUrl,
              sceneResults[i].duration,
              `sessions/${sessionId || 'temp'}/videos`,
              { dialogue: sceneResults[i].dialogue, modelId: videoModelId || DEFAULT_VIDEO_MODEL_ID }
            );
            const genId = Math.random().toString(36).substr(2, 9);
            const generation = { id: genId, videoUrl, createdAt: Date.now(), isFinal: true };
            sceneResults[i].videoGenerations = [...(sceneResults[i].videoGenerations || []), generation];
            sceneResults[i].videoUrl = videoUrl;
            sceneResults[i].status = 'video_done';
            await saveProgress();
            sendEvent({ type: 'scene_progress', sceneId, stage: 'video', status: 'done', data: { videoUrl, generationId: genId } });
          }, 3, 5000);
        } catch (e) {
          sendEvent({ type: 'error', sceneId, stage: 'video', message: `Failed after retries: ${e.message}` });
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

app.post('/api/sessions', async (req, res) => {
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

app.get('/api/sessions', async (req, res) => {
  try {
    const result = await query('SELECT id, narrative_arc, updated_at FROM sessions ORDER BY updated_at DESC');
    res.json({ sessions: result.rows });
  } catch (error) {
    console.error('Error fetching all sessions:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
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

app.put('/api/sessions/:id', async (req, res) => {
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

app.delete('/api/sessions/:id', async (req, res) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// 8. MEDIA URL REFRESH (S3 presigned URL rotation)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/media/refresh', async (req, res) => {
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

app.post('/api/media/refresh-batch', async (req, res) => {
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
