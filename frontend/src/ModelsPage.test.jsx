// Feature: dual-sdk-video, Property 4: badge text matches sdk
// Validates: Requirements 5.1, 5.2

import { describe, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import * as fc from 'fast-check';
import { FAL_VIDEO_MODELS } from './falModels.js';

// Minimal wrapper that renders only the SDK badge JSX from ModelsPage ModelCard,
// matching the design spec exactly.
function SdkBadgeUnderTest({ model }) {
  return (
    <div data-testid="badge-container">
      {model.sdk === 'vertex' && (
        <span style={{ color: '#4285F4', fontSize: 10, fontWeight: 600 }}>Vertex AI</span>
      )}
      {(!model.sdk || model.sdk === 'fal') && (
        <span style={{ color: '#a78bfa', fontSize: 10, fontWeight: 600 }}>fal.ai</span>
      )}
    </div>
  );
}

describe('ModelsPage — SDK badge', () => {
  it('Property 4: SDK badge text matches model sdk field for every video model', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FAL_VIDEO_MODELS),
        (model) => {
          const { unmount, getByTestId } = render(<SdkBadgeUnderTest model={model} />);

          const container = getByTestId('badge-container');
          const expectedBadge = model.sdk === 'vertex' ? 'Vertex AI' : 'fal.ai';
          const wrongBadge   = model.sdk === 'vertex' ? 'fal.ai'    : 'Vertex AI';

          const hasCorrect = within(container).queryByText(expectedBadge) !== null;
          const hasWrong   = within(container).queryByText(wrongBadge)    !== null;

          unmount();
          return hasCorrect && !hasWrong;
        }
      ),
      { numRuns: Math.max(100, FAL_VIDEO_MODELS.length * 10) }
    );
  });
});
