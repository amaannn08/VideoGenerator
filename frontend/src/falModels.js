// Mirrors backend/models.js — single source of truth for UI
export const FAL_IMAGE_MODELS = [
  {
    id: 'fal-ai/nano-banana-2',
    label: 'Nano Banana 2',
    sublabel: 'Fast Text-to-Image',
    supportsRef: false,
    tags: ['fast'],
    recommended: true,
    speed: 'fast',
  },
  {
    id: 'fal-ai/flux/dev',
    label: 'FLUX.1 Dev',
    sublabel: 'Black Forest Labs · Open weights',
    supportsRef: true,
    tags: ['fast', 'reference'],
    recommended: false,
    speed: 'fast',
  },
  {
    id: 'fal-ai/flux-pro/v1.1',
    label: 'FLUX 1.1 Pro',
    sublabel: 'Black Forest Labs · High quality',
    supportsRef: false,
    tags: ['high-quality'],
    recommended: false,
    speed: 'medium',
  },
  {
    id: 'fal-ai/flux-pro/v1.1-ultra',
    label: 'FLUX 1.1 Pro Ultra',
    sublabel: 'Black Forest Labs · 2K resolution',
    supportsRef: false,
    tags: ['2K', 'cinematic'],
    recommended: false,
    speed: 'medium',
  },
  {
    id: 'fal-ai/recraft-v3',
    label: 'Recraft V3',
    sublabel: 'Recraft · Great text & styles',
    supportsRef: false,
    tags: ['typography'],
    recommended: false,
    speed: 'medium',
  }
];

export const FAL_VIDEO_MODELS = [
  {
    id: 'fal-ai/luma-dream-machine/ray-2',
    label: 'Luma Ray 2',
    sublabel: 'Luma · Text & Image to Video',
    supportsI2V: true,
    hasAudio: false,
    maxDuration: 5,
    recommended: true,
    speed: 'medium',
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    label: 'Kling 2.5 Standard',
    sublabel: 'Kuaishou · V2.5 Standard (I2V)',
    supportsI2V: true,
    hasAudio: false,
    maxDuration: 5,
    recommended: false,
    speed: 'fast',
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    label: 'Kling 2.5 Pro',
    sublabel: 'Kuaishou · V2.5 Pro Motion',
    supportsI2V: true,
    hasAudio: false,
    maxDuration: 5,
    recommended: false,
    speed: 'medium',
  },
  {
    id: 'fal-ai/minimax/video-01',
    label: 'Minimax Video 01',
    sublabel: 'Minimax · Hailuo T2V',
    supportsI2V: false,
    hasAudio: false,
    maxDuration: 5,
    recommended: false,
    speed: 'fast',
  },
  {
    id: 'fal-ai/hunyuan-video',
    label: 'Hunyuan Video',
    sublabel: 'Tencent · Open Source',
    supportsI2V: false,
    hasAudio: false,
    maxDuration: 5,
    recommended: false,
    speed: 'medium',
  }
];

export const DEFAULT_IMAGE_MODEL_ID = FAL_IMAGE_MODELS[0].id;
export const DEFAULT_VIDEO_MODEL_ID = FAL_VIDEO_MODELS[0].id;
