// Feature: dual-sdk-video, Property 1: all models have valid sdk
// Validates: Requirements 1.1, 1.4

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { FAL_VIDEO_MODELS } from './models.js';

const VALID_SDKS = new Set(['fal', 'vertex']);

describe('FAL_VIDEO_MODELS — sdk field', () => {
  it('Property 1: every video model definition has a valid sdk field', () => {
    // Iterate over the static array using fast-check's constant arbitrary
    // so we get proper property-test framing with 100+ iterations.
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
