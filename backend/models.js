export const MODELS = {
  // Text & Prompt Generation (unchanged)
  TEXT_MODEL: 'deepseek-chat',
};

// ─── fal.ai Image Model Registry ─────────────────────────────────────────────
export const FAL_IMAGE_MODELS = [
  {
    id: 'fal-ai/nano-banana-2',
    label: 'Nano Banana 2',
    sublabel: 'Fast Text-to-Image',
    supportsRef: false,
    editEndpoint: null,
    tags: ['fast'],
    recommended: true,
    speed: 'fast',
    arParam: 'aspect_ratio',
    arValue: '9:16'
  },
  {
    id: 'fal-ai/flux/dev',
    label: 'FLUX.1 Dev',
    sublabel: 'Black Forest Labs · Open weights',
    supportsRef: true,
    editEndpoint: 'fal-ai/flux/dev/image-to-image',
    tags: ['fast', 'reference'],
    recommended: false,
    speed: 'fast',
    arParam: 'image_size',
    arValue: 'portrait_16_9'
  },
  {
    id: 'fal-ai/flux-pro/v1.1',
    label: 'FLUX 1.1 Pro',
    sublabel: 'Black Forest Labs · High quality',
    supportsRef: false,
    editEndpoint: null,
    tags: ['high-quality'],
    recommended: false,
    speed: 'medium',
    arParam: 'image_size',
    arValue: 'portrait_16_9'
  },
  {
    id: 'fal-ai/flux-pro/v1.1-ultra',
    label: 'FLUX 1.1 Pro Ultra',
    sublabel: 'Black Forest Labs · 2K resolution',
    supportsRef: false,
    editEndpoint: null,
    tags: ['2K', 'cinematic'],
    recommended: false,
    speed: 'medium',
    arParam: 'aspect_ratio', // Ultra takes aspect_ratio
    arValue: '9:16'
  },
  {
    id: 'fal-ai/recraft-v3',
    label: 'Recraft V3',
    sublabel: 'Recraft · Great text & styles',
    supportsRef: false,
    editEndpoint: null,
    tags: ['typography'],
    recommended: false,
    speed: 'medium',
    arParam: 'image_size',
    arValue: 'portrait_16_9'
  }
];

export const FAL_VIDEO_MODELS = [
  {
    // Luma Ray 2 — NOT the deprecated fal-ai/luma-dream-machine
    id: 'fal-ai/luma-dream-machine/ray-2',
    label: 'Luma Ray 2',
    sublabel: 'Luma · Text & Image to Video',
    supportsI2V: true,
    i2vEndpoint: 'fal-ai/luma-dream-machine/ray-2/image-to-video',
    inputSchema: 'luma',   // duration: "5s", aspect_ratio, resolution
    hasAudio: false,
    maxDuration: 5,
    recommended: true,
    speed: 'medium',
  },
  {
    // WAN 2.1 — open model, great I2V, no account approval required
    id: 'fal-ai/wan-i2v',
    label: 'WAN 2.1 I2V',
    sublabel: 'Alibaba · Open Source',
    supportsI2V: true,
    i2vEndpoint: 'fal-ai/wan-i2v',
    inputSchema: 'wan',   // prompt, image_url, aspect_ratio, resolution
    hasAudio: false,
    maxDuration: 6,
    recommended: false,
    speed: 'medium',
  },
  {
    // Kling 2.5 Pro — requires Fal account approval (may 401 without)
    id: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    label: 'Kling 2.5 Pro',
    sublabel: 'Kuaishou · V2.5 Pro (Needs approval)',
    supportsI2V: true,
    i2vEndpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    inputSchema: 'kling',
    hasAudio: false,
    maxDuration: 5,
    recommended: false,
    speed: 'medium',
  },
  {
    // Correct Minimax endpoint — NOT the deprecated fal-ai/minimax-video
    id: 'fal-ai/minimax/video-01',
    label: 'Minimax Video 01',
    sublabel: 'Minimax · Hailuo T2V',
    supportsI2V: false,
    inputSchema: 'minimax', // only prompt + prompt_optimizer, no duration/aspect_ratio
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
    inputSchema: 'luma',   // similar schema: duration as "Xs"
    hasAudio: false,
    maxDuration: 5,
    recommended: false,
    speed: 'medium',
  }
];

export const DEFAULT_IMAGE_MODEL_ID = FAL_IMAGE_MODELS[0].id;
export const DEFAULT_VIDEO_MODEL_ID = FAL_VIDEO_MODELS[0].id;
