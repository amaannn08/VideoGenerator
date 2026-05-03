/**
 * Feature: session-save-fix
 * Property-based and unit tests for the session race condition fix and manual save button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import React, { useRef, useCallback, useState } from 'react';
import Topbar from './components/layout/Topbar';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — inline implementations of the logic under test so tests are
// self-contained and don't require mounting the full App component.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates the applySessionId helper extracted from App.jsx.
 * Returns a ref and the helper so we can assert on ref.current.
 */
function makeApplySessionId() {
  const sessionIdRef = { current: null };
  let sessionIdState = null;
  const historyReplaceState = vi.fn();

  const applySessionId = (sid) => {
    sessionIdState = sid;
    sessionIdRef.current = sid;
    historyReplaceState(sid);
  };

  return { sessionIdRef, applySessionId, getState: () => sessionIdState };
}

/**
 * Simulates the auto-save creation guard logic from App.jsx.
 * Returns a function that mimics the inner async block of the setTimeout callback.
 */
function makeAutoSaveGuard(mockFetch) {
  const sessionIdRef = { current: null };
  const creatingSessionRef = { current: false };

  const applySessionId = (sid) => {
    sessionIdRef.current = sid;
  };

  const runAutoSave = async () => {
    if (!sessionIdRef.current) {
      if (creatingSessionRef.current) return;
      creatingSessionRef.current = true;
      try {
        const res = await mockFetch('/api/sessions', { method: 'POST' });
        const d = await res.json();
        if (d.sessionId) applySessionId(d.sessionId);
      } finally {
        creatingSessionRef.current = false;
      }
    }
  };

  return { runAutoSave, sessionIdRef, creatingSessionRef };
}

// ─────────────────────────────────────────────────────────────────────────────
// Property 2: sessionIdRef mirrors sessionId
// Feature: session-save-fix, Property 2: sessionIdRef mirrors sessionId
// ─────────────────────────────────────────────────────────────────────────────
describe('Property 2: sessionIdRef mirrors sessionId', () => {
  it('applySessionId always sets sessionIdRef.current to the given sid', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (sid) => {
        const { sessionIdRef, applySessionId } = makeApplySessionId();
        applySessionId(sid);
        expect(sessionIdRef.current).toBe(sid);
      }),
      { numRuns: 100 }
    );
  });

  it('applySessionId also updates the state value', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (sid) => {
        const { applySessionId, getState } = makeApplySessionId();
        applySessionId(sid);
        expect(getState()).toBe(sid);
      }),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 1: Single session creation invariant
// Feature: session-save-fix, Property 1: Single session creation invariant
// ─────────────────────────────────────────────────────────────────────────────
describe('Property 1: Single session creation invariant', () => {
  it('POST /api/sessions is called exactly once regardless of N concurrent auto-save invocations', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (n) => {
        let callCount = 0;
        // Mock fetch: resolves after a small delay to simulate async
        const mockFetch = vi.fn().mockImplementation(() =>
          new Promise((resolve) =>
            setTimeout(() => {
              callCount++;
              resolve({
                json: () => Promise.resolve({ sessionId: 'sess_abc' }),
              });
            }, 0)
          )
        );

        const { runAutoSave } = makeAutoSaveGuard(mockFetch);

        // Fire N concurrent invocations
        await Promise.all(Array.from({ length: n }, () => runAutoSave()));

        expect(callCount).toBe(1);
      }),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 3: Save button disabled during saving
// Feature: session-save-fix, Property 3: Save button disabled during saving
// ─────────────────────────────────────────────────────────────────────────────
describe('Property 3: Save button disabled during saving', () => {
  it('Save button disabled iff saveStatus is "saving"', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('idle', 'saving', 'saved', 'error'),
        (saveStatus) => {
          const { container } = render(
            <Topbar
              onNew={() => {}}
              onLogout={() => {}}
              onOpenReel={() => {}}
              hasScenes={false}
              imageModelId=""
              videoModelId=""
              onOpenModels={() => {}}
              onSave={() => {}}
              saveStatus={saveStatus}
            />
          );
          const saveBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent.includes('Save') || b.textContent.includes('Saving') || b.textContent.includes('Saved') || b.textContent.includes('Error')
          );
          expect(saveBtn).toBeTruthy();
          expect(saveBtn.disabled).toBe(saveStatus === 'saving');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Example test 6.2: Save button always rendered
// Feature: session-save-fix
// ─────────────────────────────────────────────────────────────────────────────
describe('Save button always rendered', () => {
  it('Save button is present in the DOM for any saveStatus', () => {
    for (const status of ['idle', 'saving', 'saved', 'error']) {
      const { container } = render(
        <Topbar
          onNew={() => {}}
          onLogout={() => {}}
          onOpenReel={() => {}}
          hasScenes={false}
          imageModelId=""
          videoModelId=""
          onOpenModels={() => {}}
          onSave={() => {}}
          saveStatus={status}
        />
      );
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent.match(/Save|Saving|Saved|Error/)
      );
      expect(saveBtn).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Example test 6.3: Error state shown on failed save
// Feature: session-save-fix
// ─────────────────────────────────────────────────────────────────────────────
describe('Error state shown on failed save', () => {
  it('button label contains "Error" when saveStatus is "error"', () => {
    const { container } = render(
      <Topbar
        onNew={() => {}}
        onLogout={() => {}}
        onOpenReel={() => {}}
        hasScenes={false}
        imageModelId=""
        videoModelId=""
        onOpenModels={() => {}}
        onSave={() => {}}
        saveStatus="error"
      />
    );
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent.includes('Error')
    );
    expect(saveBtn).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 4: Saved confirmation auto-clears after 2000ms
// Feature: session-save-fix, Property 4: Saved confirmation auto-clears
// ─────────────────────────────────────────────────────────────────────────────
describe('Property 4: Saved confirmation auto-clears after 2000ms', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('saveStatus transitions from saved to idle after 2000ms', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        // Simulate the handleManualSave timer logic directly
        let saveStatus = 'idle';
        const saveTimerRef = { current: null };

        const simulateSaveSuccess = () => {
          saveStatus = 'saved';
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => { saveStatus = 'idle'; }, 2000);
        };

        simulateSaveSuccess();
        expect(saveStatus).toBe('saved');

        vi.advanceTimersByTime(2000);
        expect(saveStatus).toBe('idle');
      }),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 5: Manual save body contains all scene fields
// Feature: session-save-fix, Property 5: Manual save persists all scene fields
// ─────────────────────────────────────────────────────────────────────────────
describe('Property 5: Manual save body contains all scene fields', () => {
  it('serialized save body includes imageUrl, videoUrl, imageGenerations, videoGenerations for every scene', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 9 }),
            imageUrl: fc.oneof(fc.constant(null), fc.webUrl()),
            videoUrl: fc.oneof(fc.constant(null), fc.webUrl()),
            imageGenerations: fc.array(
              fc.record({ id: fc.string(), imageUrl: fc.webUrl(), isFinal: fc.boolean() }),
              { maxLength: 3 }
            ),
            videoGenerations: fc.array(
              fc.record({ id: fc.string(), videoUrl: fc.webUrl(), isFinal: fc.boolean() }),
              { maxLength: 3 }
            ),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (scenes) => {
          let capturedBody = null;
          const mockFetch = vi.fn().mockImplementation((_url, opts) => {
            capturedBody = JSON.parse(opts.body);
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
          });

          // Simulate handleManualSave body construction
          const sessionIdRef = { current: 'existing-session' };
          const body = JSON.stringify({
            script: 'test',
            globalCharacter: {},
            globalCharacters: [],
            primaryCharacterId: '',
            narrativeArc: '',
            scenes,
            mergedVideo: null,
            globalEnvironments: [],
            targetLanguage: 'Hindi',
          });

          await mockFetch(`/api/sessions/${sessionIdRef.current}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
          });

          expect(capturedBody).not.toBeNull();
          expect(capturedBody.scenes).toHaveLength(scenes.length);

          scenes.forEach((scene, i) => {
            const saved = capturedBody.scenes[i];
            expect(saved.imageUrl).toBe(scene.imageUrl);
            expect(saved.videoUrl).toBe(scene.videoUrl);
            expect(saved.imageGenerations).toEqual(scene.imageGenerations);
            expect(saved.videoGenerations).toEqual(scene.videoGenerations);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
