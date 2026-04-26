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
import { initDb, query } from './db.js';

dotenv.config();

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

async function downloadFile(url, destPath) {
  const fetchUrl = url.includes('?') ? `${url}&key=${GOOGLE_API_KEY}` : `${url}?key=${GOOGLE_API_KEY}`;
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
// 2a. IMAGE PROMPT GENERATION
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/prompts/image', async (req, res) => {
  try {
    const { scene, character, previousSceneImageDesc, sceneIndex = 0, totalScenes = 1, customInstruction } = req.body;
    if (!scene) return res.status(400).json({ error: 'scene is required' });

    const promptText = SYSTEM_PROMPTS.getImagePromptGenerationPrompt(
      scene, character, previousSceneImageDesc, sceneIndex, totalScenes, customInstruction
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
    const { scene, character, sceneIndex = 0, totalScenes = 1, customInstruction } = req.body;
    if (!scene) return res.status(400).json({ error: 'scene is required' });

    const promptText = SYSTEM_PROMPTS.getVideoPromptGenerationPrompt(
      scene, character, sceneIndex, totalScenes, customInstruction
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
    const { imagePrompt, referenceImage } = req.body;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.IMAGE_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;

    const parts = [];

    // Attach reference image for visual character continuity (Gemini is multimodal)
    if (referenceImage && referenceImage.startsWith('/tmp/')) {
      const base64Data = tmpFileToBase64(referenceImage);
      if (base64Data) {
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: 'image/jpeg'
          }
        });
        parts.push({ text: 'Use the provided image as a strict visual reference for the character\'s face, skin tone, body build, clothing, and overall style. The generated image MUST maintain perfect visual continuity with this reference.' });
      }
    } else if (referenceImage && referenceImage.startsWith('data:')) {
      const mimeType = referenceImage.match(/data:(.*?);/)[1];
      const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: { data: base64Data, mimeType }
      });
      parts.push({ text: 'Use the provided image as a strict visual reference for the character\'s face, skin tone, body build, clothing, and overall style. The generated image MUST maintain perfect visual continuity with this reference.' });
    }

    parts.push({ text: imagePrompt + ' 9:16 aspect ratio' });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Gemini Image API failed');

    const imageParts = data.candidates?.[0]?.content?.parts?.filter(p => p.inlineData || p.inline_data) || [];
    if (!imageParts.length) throw new Error('No image returned from Gemini');

    const inline = imageParts[0].inlineData || imageParts[0].inline_data;
    const base64Data = inline.data;
    const ext = (inline.mimeType || inline.mime_type || 'image/jpeg').split('/')[1] || 'jpeg';
    const fileName = `image_${Date.now()}.${ext}`;
    const localPath = path.join(TMP_DIR, fileName);
    fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));

    res.json({ imageUrl: `/tmp/${fileName}` });
  } catch (error) {
    console.error('Error in /api/image:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. VIDEO GENERATION (Veo 3)
// ─────────────────────────────────────────────────────────────────────────────

async function generateVideo(videoPrompt, imageUrl, duration) {
  let imageBase64, imageMimeType;
  if (imageUrl && imageUrl.startsWith('/tmp/')) {
    const fileName = path.basename(imageUrl);
    const localPath = path.join(TMP_DIR, fileName);
    if (fs.existsSync(localPath)) {
      imageBase64 = fs.readFileSync(localPath).toString('base64');
      const ext = path.extname(fileName).slice(1) || 'jpeg';
      imageMimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    }
  } else if (imageUrl && imageUrl.startsWith('data:')) {
    const commaIdx = imageUrl.indexOf(',');
    const meta = imageUrl.slice(5, commaIdx);
    imageMimeType = meta.split(';')[0];
    imageBase64 = imageUrl.slice(commaIdx + 1);
  }

  const instanceData = { prompt: videoPrompt };
  if (imageBase64) {
    instanceData.image = { bytesBase64Encoded: imageBase64, mimeType: imageMimeType };
  }

  const durationSeconds = (() => {
    const d = parseInt(duration);
    if (isNaN(d)) return 8;
    if (d <= 4) return 4;
    if (d <= 6) return 6;
    return 8;
  })();

  const initUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.VIDEO_MODEL}:predictLongRunning?key=${GOOGLE_API_KEY}`;

  const initRes = await fetch(initUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [instanceData],
      parameters: {
        aspectRatio: '9:16',
        durationSeconds,
        sampleCount: 1
      }
    })
  });

  const initData = await initRes.json();
  if (!initRes.ok) throw new Error(initData.error?.message || 'Veo 3 init failed');

  const operationName = initData.name;
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GOOGLE_API_KEY}`;

  // Poll up to ~5 minutes
  let videoUri = null;
  let videoBase64 = null;
  let videoMime = null;

  // Recursively search any object for a video payload (URI or base64)
  function findVideo(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 10) return null;
    // Any string URI field that looks like a video link
    if (obj.uri && typeof obj.uri === 'string' && obj.uri.length > 10) return { uri: obj.uri };
    // Base64 encoded video
    if (obj.bytesBase64Encoded && typeof obj.bytesBase64Encoded === 'string') {
      return { bytesBase64Encoded: obj.bytesBase64Encoded, mimeType: obj.mimeType || obj.encoding || 'video/mp4' };
    }
    // Walk children
    for (const val of Object.values(obj)) {
      const found = Array.isArray(val)
        ? val.map(item => findVideo(item, depth + 1)).find(Boolean)
        : findVideo(val, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(pollUrl);
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();

    if (pollData.error) throw new Error(pollData.error.message);

    if (pollData.done) {
      const gvr = pollData.response?.generateVideoResponse;
      // Log the FULL response so we can see the exact structure
      console.log('[Veo3] FULL pollData.response:', JSON.stringify(pollData.response));
      console.log('[Veo3] generateVideoResponse:', JSON.stringify(gvr));

      // Check for content filtering / RAI rejection
      const filtered = gvr?.raiMediaFilteredReasons || gvr?.filteredReasons;
      if (filtered) throw new Error(`Veo 3 content filtered: ${JSON.stringify(filtered)}`);

      // Try all known response paths — also search entire pollData not just .response
      const video =
        gvr?.generatedSamples?.[0]?.video ||
        gvr?.generatedSamples?.[0] ||
        gvr?.videos?.[0]?.video ||
        gvr?.videos?.[0] ||
        findVideo(gvr) ||
        findVideo(pollData);   // last resort: entire response tree

      if (!video) {
        throw new Error(`Veo 3 returned done=true but no video found. Keys: ${JSON.stringify(Object.keys(pollData.response || {}))}`);
      }

      if (video.uri) videoUri = video.uri;
      else if (video.bytesBase64Encoded) {
        videoBase64 = video.bytesBase64Encoded;
        videoMime = video.mimeType || 'video/mp4';
      }
      break;
    }
  }

  if (!videoUri && !videoBase64) throw new Error('Veo 3 timed out after 5 minutes');

  const fileName = `video_${Date.now()}.mp4`;
  const localPath = path.join(TMP_DIR, fileName);

  if (videoUri) {
    await downloadFile(videoUri, localPath);
  } else {
    fs.writeFileSync(localPath, Buffer.from(videoBase64, 'base64'));
  }

  return `/tmp/${fileName}`;
}

app.post('/api/video', async (req, res) => {
  try {
    const { videoPrompt, imageUrl, duration } = req.body;
    const videoUrl = await generateVideo(videoPrompt, imageUrl, duration);
    res.json({ videoUrl });
  } catch (error) {
    console.error('Error in /api/video:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MERGE VIDEOS (FFmpeg)
// ─────────────────────────────────────────────────────────────────────────────

async function mergeVideos(videoUrls) {
  const localPaths = videoUrls.map(url => {
    if (url.startsWith('/tmp/')) return path.join(__dirname, url);
    return path.join(__dirname, url);
  });

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

  return `/tmp/${mergedFileName}`;
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
  const { scenes, globalCharacter, sessionId } = req.body;

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
              scene, globalCharacter, previousSceneImageDesc, i, totalScenes
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
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.IMAGE_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
            const parts = [];
  
            // Pass previous scene's actual image for visual reference
            const prevScene = i > 0 ? sceneResults[i - 1] : null;
            if (prevScene?.imageUrl && prevScene.imageUrl.startsWith('/tmp/')) {
              const base64Data = tmpFileToBase64(prevScene.imageUrl);
              if (base64Data) {
                parts.push({ inlineData: { data: base64Data, mimeType: 'image/jpeg' } });
                parts.push({ text: 'Use the provided image as a strict visual reference for the character\'s face, skin tone, body build, clothing, and overall style. Maintain perfect visual continuity with this reference.' });
              }
            }
  
            parts.push({ text: sceneResults[i].imagePrompt + ' 9:16 aspect ratio' });
  
            const response = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
              }),
            });
  
            const gemData = await response.json();
            if (!response.ok) throw new Error(gemData.error?.message || 'Gemini Image API failed');
  
            const imageParts = gemData.candidates?.[0]?.content?.parts?.filter(p => p.inlineData || p.inline_data) || [];
            if (!imageParts.length) throw new Error('No image returned from Gemini');
  
            const inline = imageParts[0].inlineData || imageParts[0].inline_data;
            const ext = (inline.mimeType || inline.mime_type || 'image/jpeg').split('/')[1] || 'jpeg';
            const fileName = `image_${Date.now()}.${ext}`;
            const localPath = path.join(TMP_DIR, fileName);
            fs.writeFileSync(localPath, Buffer.from(inline.data, 'base64'));
  
            sceneResults[i].imageUrl = `/tmp/${fileName}`;
            sceneResults[i].status = 'image_done';
            await saveProgress();
            sendEvent({ type: 'scene_progress', sceneId, stage: 'image', status: 'done', data: { imageUrl: `/tmp/${fileName}` } });
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
            const promptText = SYSTEM_PROMPTS.getVideoPromptGenerationPrompt(
              scene, globalCharacter, i, totalScenes
            );
  
            const completion = await openai.chat.completions.create({
              messages: [{ role: 'user', content: promptText }],
              model: MODELS.TEXT_MODEL,
            });
  
            let data = extractJson(completion.choices[0].message.content);
            if (!data) data = JSON.parse(completion.choices[0].message.content);
  
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
      if (sceneResults[i].videoUrl) {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'video', status: 'done', data: { videoUrl: sceneResults[i].videoUrl } });
      } else {
        sendEvent({ type: 'scene_progress', sceneId, stage: 'video', status: 'generating' });
        try {
          await withRetry(async () => {
            const videoUrl = await generateVideo(
              sceneResults[i].videoPrompt,
              sceneResults[i].imageUrl,
              sceneResults[i].duration
            );
            sceneResults[i].videoUrl = videoUrl;
            sceneResults[i].status = 'video_done';
            await saveProgress();
            sendEvent({ type: 'scene_progress', sceneId, stage: 'video', status: 'done', data: { videoUrl } });
          }, 3, 5000); // 3 retries, 5s delay between attempts
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

    // ── Step 5: Merge all completed videos ────────────────────────────────
    const completedVideoUrls = sceneResults
      .filter(s => s.videoUrl)
      .map(s => s.videoUrl);

    if (completedVideoUrls.length === 0) {
      sendEvent({ type: 'error', stage: 'merge', message: 'No videos were generated successfully' });
      res.end();
      return;
    }

    sendEvent({ type: 'merge', status: 'merging' });

    try {
      const mergedVideoUrl = await mergeVideos(completedVideoUrls);
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
    const { script, globalCharacter, narrativeArc, scenes, mergedVideo } = req.body;
    const sessionId = Math.random().toString(36).substr(2, 9);
    
    await query(
      'INSERT INTO sessions (id, script, global_character, narrative_arc, scenes, merged_video) VALUES ($1, $2, $3, $4, $5::jsonb, $6)',
      [sessionId, script || '', globalCharacter || '', narrativeArc || '', JSON.stringify(scenes || []), mergedVideo || null]
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
    res.json({
      id: row.id,
      script: row.script,
      globalCharacter: row.global_character,
      narrativeArc: row.narrative_arc,
      scenes: row.scenes,
      mergedVideo: row.merged_video
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.put('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { script, globalCharacter, narrativeArc, scenes, mergedVideo } = req.body;
    
    const result = await query(
      `UPDATE sessions 
       SET script = COALESCE($1, script), 
           global_character = COALESCE($2, global_character), 
           narrative_arc = COALESCE($3, narrative_arc), 
           scenes = COALESCE($4::jsonb, scenes), 
           merged_video = COALESCE($5, merged_video),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING id`,
      [script, globalCharacter, narrativeArc, scenes ? JSON.stringify(scenes) : null, mergedVideo, id]
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

// ─────────────────────────────────────────────────────────────────────────────
// STATIC FILE SERVING
// ─────────────────────────────────────────────────────────────────────────────

app.use('/tmp', express.static(TMP_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
