export const MODELS = {
  TEXT_MODEL: 'deepseek-chat',
};

export function findVideoModel(modelId) {
  return (
    FAL_VIDEO_MODELS.find((m) => m.id === modelId || m.legacyIds?.includes(modelId)) ||
    FAL_VIDEO_MODELS[0]
  );
}

// ─── Image Model Registry ─────────────────────────────────────────────────────
export const FAL_IMAGE_MODELS = [
  {
    id: 'vertex-nano-banana-2',
    label: 'Nano Banana 2',
    sublabel: 'Google Vertex AI · Fast Image Generation',
    sdk: 'vertex',
    supportsRef: false,
    editEndpoint: null,
    tags: ['fast'],
    recommended: true,
    speed: 'fast',
    arParam: 'aspect_ratio',
    arValue: '9:16',
  },
];

// ─── Video Model Registry ─────────────────────────────────────────────────────
export const FAL_VIDEO_MODELS = [
  {
    id: 'vertex-veo3.1-lite',
    label: 'Veo 3.1 Lite (Vertex AI)',
    sublabel: 'Google Vertex AI · Fast Preview + Native Audio',
    sdk: 'vertex',
    supportsI2V: true,
    allowedDurations: [5, 8],
    hasAudio: true,
    maxDuration: 8,
    recommended: true,
    speed: 'medium',
  },
];

export const DEFAULT_IMAGE_MODEL_ID = 'vertex-nano-banana-2';
export const DEFAULT_VIDEO_MODEL_ID = 'vertex-veo3.1-lite';
