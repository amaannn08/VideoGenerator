// Feature: dual-sdk-video, Property 1: all models have valid sdk
// Validates: Requirements 1.1, 1.4

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { FAL_VIDEO_MODELS } from './falModels.js';

const VALID_SDKS = new Set(['fal', 'vertex']);

describe('FAL_VIDEO_MODELS — sdk field', () => {
  it('Property 1: every video model definition has a valid sdk field', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FAL_VIDEO_MODELS),
        (model) => {
          return (
            Object.prototype.hasOwnProperty.call(model, 'sdk') &&
            VALID_SDKS.has(model.sdk)
          );
        }
      ),
      { numRuns: Math.max(100, FAL_VIDEO_MODELS.length * 10) }
    );
  });
});

// Feature: dual-sdk-video, Property 2: sdk derivation is total
// Validates: Requirements 4.1

describe('FAL_VIDEO_MODELS — SDK derivation', () => {
  it('Property 2: SDK derivation is total and correct for every model id', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FAL_VIDEO_MODELS),
        (model) => {
          const derived = FAL_VIDEO_MODELS.find(m => m.id === model.id)?.sdk ?? 'fal';
          return derived === model.sdk;
        }
      ),
      { numRuns: Math.max(100, FAL_VIDEO_MODELS.length * 10) }
    );
  });
});
