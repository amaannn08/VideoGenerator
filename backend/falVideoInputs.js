/**
 * Fal video request builders — per-endpoint whitelisted inputs (see fal.ai model Schema pages).
 */

const VEO_LITE_I2V_MAX_BYTES = 8 * 1024 * 1024;
const VEO_MIN_SHORT_SIDE = 720;

/** @param {unknown} err */
export function extractFalErrorDetailTypes(err) {
  const detail = err?.body?.detail;
  if (!Array.isArray(detail)) return [];
  return detail.map((d) => d?.type).filter(Boolean);
}

/** @param {unknown} err */
export function firstFalErrorDetail(err) {
  const d = err?.body?.detail?.[0];
  if (!d || typeof d !== 'object') return null;
  return {
    type: d.type,
    msg: d.msg,
    url: d.url,
  };
}

/** @param {unknown} err */
export function serializeFalError(err) {
  const d = firstFalErrorDetail(err);
  return {
    error: err?.message || String(err),
    falType: d?.type ?? null,
    falDetailUrl: d?.url ?? null,
    falMsg: d?.msg ?? null,
    requestId: err?.requestId ?? null,
  };
}

/** @param {unknown} err */
export function isNoMediaGeneratedError(err) {
  return extractFalErrorDetailTypes(err).includes('no_media_generated');
}

/**
 * PNG/JPEG/WebP dimension probe for preflight (no native deps).
 * @param {ArrayBuffer} buf
 * @returns {{ width: number, height: number } | null}
 */
export function probeImageDimensions(buf) {
  const u = new Uint8Array(buf);
  if (u.length < 24) return null;
  // PNG
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) {
    const dv = new DataView(buf);
    return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
  }
  // JPEG
  if (u[0] === 0xff && u[1] === 0xd8) {
    let o = 2;
    while (o < u.length - 8) {
      if (u[o] !== 0xff) {
        o++;
        continue;
      }
      const m = u[o + 1];
      if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
        const h = (u[o + 5] << 8) | u[o + 6];
        const w = (u[o + 7] << 8) | u[o + 8];
        return { width: w, height: h };
      }
      const seg = (u[o + 2] << 8) | u[o + 3];
      o += 2 + seg;
    }
  }
  // WebP
  if (u.length >= 30 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46) {
    const chunk = String.fromCharCode(u[12], u[15], u[14], u[13]);
    if (chunk === 'VP8X' && u[20] & 0x10) {
      const w = 1 + ((u[24] | (u[25] << 8) | (u[26] << 16)) & 0xffffff);
      const h = 1 + ((u[27] | (u[28] << 8) | (u[29] << 16)) & 0xffffff);
      return { width: w, height: h };
    }
    if (chunk === 'VP8 ' && u.length >= 30) {
      const w = u[26] | (u[27] << 8);
      const h = u[28] | (u[29] << 8);
      return { width: w, height: h };
    }
  }
  return null;
}

/**
 * @param {ArrayBuffer} imageBuffer
 * @param {{ resolution?: string, aspectRatio?: string }} opts
 */
export function assertVeoI2vImagePreflight(imageBuffer, opts) {
  if (imageBuffer.byteLength > VEO_LITE_I2V_MAX_BYTES) {
    throw new Error(
      `Input image exceeds ${VEO_LITE_I2V_MAX_BYTES / (1024 * 1024)}MB (Veo limit). Re-export a smaller frame.`
    );
  }
  const dim = probeImageDimensions(imageBuffer);
  if (dim) {
    const short = Math.min(dim.width, dim.height);
    if (short < VEO_MIN_SHORT_SIDE) {
      throw new Error(
        `Input image shorter side is ${short}px; Veo expects at least ${VEO_MIN_SHORT_SIDE}px. Use a higher-resolution keyframe.`
      );
    }
  }
}

function omitNulls(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/**
 * @param {import('./models.js').FAL_VIDEO_MODELS[number]} modelDef
 * @param {object} ctx
 */
export function buildFalVideoInput(modelDef, ctx) {
  const {
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
    options,
  } = ctx;

  const kind = modelDef.videoInputKind || modelDef.inputSchema;
  const durationStr = `${snappedDur}s`;
  const klingDurStr = `${snappedDur}`;

  if (kind === 'kling-v3') {
    if (!useI2V) {
      return omitNulls({
        prompt: finalPrompt,
        duration: klingDurStr,
        generate_audio: shouldGenAudio,
      });
    }
    const mp = options?.multi_prompt;
    if (Array.isArray(mp) && mp.length > 0) {
      return omitNulls({
        start_image_url: finalImageUrl,
        multi_prompt: mp,
        duration: klingDurStr,
        generate_audio: shouldGenAudio,
      });
    }
    return omitNulls({
      start_image_url: finalImageUrl,
      prompt: finalPrompt,
      duration: klingDurStr,
      generate_audio: shouldGenAudio,
    });
  }

  if (kind === 'sora') {
    const allowedT2v = modelDef.allowedDurationsT2v || [4, 8, 12, 16, 20];
    const allowedI2v = modelDef.allowedDurationsI2v || [4, 8, 12, 16, 20];
    const allowed = useI2V ? allowedI2v : allowedT2v;
    const dur = allowed.reduce((prev, curr) =>
      Math.abs(curr - snappedDur) < Math.abs(prev - snappedDur) ? curr : prev
    );
    const ar = aspectRatio === '16:9' || aspectRatio === '9:16' ? aspectRatio : '9:16';
    if (!useI2V) {
      return omitNulls({
        prompt: finalPrompt,
        duration: dur,
        aspect_ratio: ar,
        resolution: resolution || '1080p',
      });
    }
    return omitNulls({
      image_url: finalImageUrl,
      prompt: finalPrompt,
      duration: dur,
      aspect_ratio: ar,
      resolution: resolution || 'auto',
      generate_audio: shouldGenAudio,
    });
  }

  if (kind === 'veo') {
    let durStr = durationStr;
    let res = resolution || '720p';
    if (res === '1080p' && modelDef.veo1080pRequires8s !== false) {
      durStr = '8s';
    }
    const base = omitNulls({
      prompt: finalPrompt,
      aspect_ratio: aspectRatio,
      duration: durStr,
      resolution: res,
      generate_audio: shouldGenAudio,
      negative_prompt: negativePrompt || undefined,
      seed: options?.seed,
      auto_fix: options?.auto_fix !== false,
      safety_tolerance: options?.safety_tolerance != null ? String(options.safety_tolerance) : '4',
    });
    if (!useI2V) return omitNulls(base);
    return omitNulls({ ...base, image_url: finalImageUrl });
  }

  if (kind === 'veo2') {
    const allowed = [5, 6, 7, 8];
    const d = allowed.reduce((prev, curr) =>
      Math.abs(curr - snappedDur) < Math.abs(prev - snappedDur) ? curr : prev
    );
    const ds = `${d}s`;
    const ar = aspectRatio === '16:9' || aspectRatio === '9:16' || aspectRatio === '1:1' ? aspectRatio : '9:16';
    if (!useI2V) {
      return omitNulls({
        prompt: finalPrompt,
        aspect_ratio: ar,
        duration: ds,
        negative_prompt: negativePrompt || undefined,
        enhance_prompt: options?.enhance_prompt !== false,
        auto_fix: options?.auto_fix !== false,
        seed: options?.seed,
      });
    }
    return omitNulls({
      image_url: finalImageUrl,
      prompt: finalPrompt,
      duration: ds,
    });
  }

  if (kind === 'minimax') {
    if (!useI2V) return omitNulls({ prompt: finalPrompt });
    return omitNulls({
      prompt: finalPrompt,
      image_url: finalImageUrl,
      prompt_optimizer: options?.prompt_optimizer !== false,
    });
  }

  if (kind === 'wan-i2v') {
    if (!useI2V) throw new Error('WAN I2V model requires an image');
    return omitNulls({
      prompt: finalPrompt,
      image_url: finalImageUrl,
      aspect_ratio: aspectRatio === '16:9' || aspectRatio === '9:16' || aspectRatio === '1:1' ? aspectRatio : 'auto',
      resolution: resolution === '480p' || resolution === '720p' ? resolution : '720p',
      negative_prompt: negativePrompt || undefined,
    });
  }

  if (kind === 'seedance') {
    if (!useI2V) throw new Error('Seedance I2V requires an image');
    const clamped = Math.min(15, Math.max(4, snappedDur));
    return omitNulls({
      prompt: finalPrompt,
      image_url: finalImageUrl,
      resolution: ['480p', '720p', '1080p'].includes(resolution) ? resolution : '720p',
      duration: clamped,
      aspect_ratio:
        aspectRatio === 'auto' ||
        ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(aspectRatio)
          ? aspectRatio
          : 'auto',
      generate_audio: shouldGenAudio,
      seed: options?.seed,
    });
  }

  if (kind === 'happy-horse') {
    if (!useI2V) throw new Error('Happy Horse I2V requires an image');
    const d = Math.min(15, Math.max(3, snappedDur));
    return omitNulls({
      image_url: finalImageUrl,
      prompt: finalPrompt,
      resolution: resolution === '720p' || resolution === '1080p' ? resolution : '1080p',
      duration: d,
      seed: options?.seed,
      enable_safety_checker: options?.enable_safety_checker !== false,
    });
  }

  if (kind === 'luma-ray2') {
    const lumaDur = snappedDur >= 9 ? '9s' : '5s';
    const lumaRes = ['540p', '720p', '1080p'].includes(resolution) ? resolution : '720p';
    if (!useI2V) {
      return omitNulls({
        prompt: finalPrompt,
        aspect_ratio: aspectRatio,
        resolution: lumaRes,
        duration: lumaDur,
        loop: options?.loop === true,
      });
    }
    return omitNulls({
      prompt: finalPrompt,
      image_url: finalImageUrl,
      end_image_url: options?.end_image_url,
      aspect_ratio: aspectRatio,
      resolution: lumaRes,
      duration: lumaDur,
      loop: options?.loop === true,
    });
  }

  if (kind === 'mochi') {
    return omitNulls({
      prompt: finalPrompt,
      negative_prompt: negativePrompt || undefined,
      seed: options?.seed,
      enable_prompt_expansion: options?.enable_prompt_expansion !== false,
    });
  }

  if (kind === 'hunyuan') {
    return omitNulls({
      prompt: finalPrompt,
      seed: options?.seed,
      aspect_ratio: aspectRatio === '9:16' || aspectRatio === '16:9' ? aspectRatio : '9:16',
      resolution: ['480p', '580p', '720p'].includes(resolution) ? resolution : '720p',
      num_frames: options?.num_frames === 85 ? 85 : 129,
      enable_safety_checker: options?.enable_safety_checker !== false,
      pro_mode: options?.pro_mode === true,
    });
  }

  throw new Error(`Unknown videoInputKind/inputSchema: ${kind} (endpoint ${endpoint})`);
}
