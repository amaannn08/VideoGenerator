/**
 * Unit tests for generateVeoVertexVideo()
 *
 * Tests: 2.1 happy path, 2.2 timeout, 2.3 missing env vars, 2.4 temp file cleanup
 * Validates: Requirements 2.3, 2.4, 2.5, 2.7, 6.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

// ─── Mutable mock state ───────────────────────────────────────────────────────
// Defined at module scope so the vi.mock factory can close over them.
// Individual tests reassign these to control behaviour.
let mockGenerateVideos = vi.fn();
let mockOperationsGet = vi.fn();

vi.mock('@google/genai', () => {
  // Must be a real class so `new GoogleGenAI(...)` works.
  class GoogleGenAI {
    constructor() {
      this.models = {
        generateVideos: (...args) => mockGenerateVideos(...args),
      };
      this.operations = {
        get: (...args) => mockOperationsGet(...args),
      };
    }
  }
  return { GoogleGenAI };
});

// ─── Mock ./s3.js ────────────────────────────────────────────────────────────
const mockUploadToS3 = vi.fn();
vi.mock('./s3.js', () => ({
  uploadToS3: (...args) => mockUploadToS3(...args),
}));

// Import AFTER mocks are registered (top-level await is fine in ESM vitest)
const { generateVeoVertexVideo } = await import('./vertexVideo.js');

// ─── Constants ───────────────────────────────────────────────────────────────
const FAKE_VIDEO_BYTES = Buffer.from('fake-mp4-data').toString('base64');
const FAKE_PRESIGNED_URL = 'https://s3.example.com/videos/vertex_video_123.mp4?sig=abc';
const OPERATION_NAME = 'projects/test-proj/locations/us-central1/operations/op-123';

const completedOperation = () => ({
  name: OPERATION_NAME,
  done: true,
  response: {
    generatedSamples: [{ video: { videoBytes: FAKE_VIDEO_BYTES } }],
  },
});

const pendingOperation = () => ({ name: OPERATION_NAME, done: false });

// ─── Setup / teardown ────────────────────────────────────────────────────────
beforeEach(() => {
  process.env.VERTEX_PROJECT = 'test-project';
  process.env.VERTEX_LOCATION = 'us-central1';

  mockGenerateVideos = vi.fn().mockResolvedValue({ name: OPERATION_NAME });
  mockOperationsGet = vi.fn().mockResolvedValue(completedOperation());
  mockUploadToS3.mockResolvedValue(FAKE_PRESIGNED_URL);

  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  delete process.env.VERTEX_PROJECT;
  delete process.env.VERTEX_LOCATION;
});

// ─── 2.1 Happy path ──────────────────────────────────────────────────────────
// Validates: Requirements 2.3, 2.5
describe('2.1 Vertex_Generator happy path', () => {
  it('returns a presigned URL string when the operation completes on the first poll', async () => {
    const promise = generateVeoVertexVideo('a cinematic sunset', null, 5);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(typeof result).toBe('string');
    expect(result).toBe(FAKE_PRESIGNED_URL);
    expect(mockGenerateVideos).toHaveBeenCalledOnce();
    expect(mockUploadToS3).toHaveBeenCalledOnce();
  });

  it('passes imageUrl as image.uri when provided', async () => {
    const promise = generateVeoVertexVideo(
      'a cinematic sunset',
      'https://example.com/frame.jpg',
      8
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    const callArg = mockGenerateVideos.mock.calls[0][0];
    expect(callArg.image).toEqual({ uri: 'https://example.com/frame.jpg' });
  });

  it('does not include image field when imageUrl is null', async () => {
    const promise = generateVeoVertexVideo('prompt', null, 5);
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    const callArg = mockGenerateVideos.mock.calls[0][0];
    expect(callArg.image).toBeUndefined();
  });
});

// ─── 2.2 Timeout ─────────────────────────────────────────────────────────────
// Validates: Requirement 2.4
describe('2.2 Vertex_Generator timeout', () => {
  it('throws a timeout error after 60 pending polls', async () => {
    mockOperationsGet = vi.fn().mockResolvedValue(pendingOperation());

    // Attach rejection handler immediately so the promise is never "unhandled"
    const promise = generateVeoVertexVideo('a cinematic sunset', null, 5);
    const settled = promise.then(
      (v) => ({ ok: true, value: v }),
      (e) => ({ ok: false, error: e })
    );

    // Advance through all 60 poll intervals (60 × 10 000 ms = 600 000 ms)
    await vi.advanceTimersByTimeAsync(60 * 10_000);

    const result = await settled;
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('Vertex AI video generation timed out after 600s');
    expect(mockOperationsGet).toHaveBeenCalledTimes(60);
  });
});

// ─── 2.3 Missing env vars ────────────────────────────────────────────────────
// Validates: Requirement 6.3
describe('2.3 Vertex_Generator missing env vars', () => {
  it('throws a config error immediately when VERTEX_PROJECT is missing', async () => {
    delete process.env.VERTEX_PROJECT;

    await expect(generateVeoVertexVideo('prompt', null, 5)).rejects.toThrow(/VERTEX_PROJECT/);
    expect(mockGenerateVideos).not.toHaveBeenCalled();
  });

  it('throws a config error immediately when VERTEX_LOCATION is missing', async () => {
    delete process.env.VERTEX_LOCATION;

    await expect(generateVeoVertexVideo('prompt', null, 5)).rejects.toThrow(/VERTEX_LOCATION/);
    expect(mockGenerateVideos).not.toHaveBeenCalled();
  });

  it('throws a config error immediately when both env vars are missing', async () => {
    delete process.env.VERTEX_PROJECT;
    delete process.env.VERTEX_LOCATION;

    await expect(generateVeoVertexVideo('prompt', null, 5)).rejects.toThrow(/VERTEX_PROJECT/);
    expect(mockGenerateVideos).not.toHaveBeenCalled();
  });
});

// ─── 2.4 Temp file cleanup ───────────────────────────────────────────────────
// Validates: Requirement 2.7
describe('2.4 Vertex_Generator temp file cleanup', () => {
  it('deletes the temp file after a successful upload', async () => {
    const writtenPaths = [];
    const deletedPaths = [];

    const writeFileSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((p) => {
      writtenPaths.push(String(p));
    });
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation((p) => {
      deletedPaths.push(String(p));
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const promise = generateVeoVertexVideo('prompt', null, 5);
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(writtenPaths.length).toBeGreaterThan(0);
    const tempPath = writtenPaths[writtenPaths.length - 1];
    expect(deletedPaths).toContain(tempPath);

    writeFileSpy.mockRestore();
    unlinkSpy.mockRestore();
    vi.spyOn(fs, 'existsSync').mockRestore();
  });

  it('deletes the temp file even when the S3 upload fails', async () => {
    const writtenPaths = [];
    const deletedPaths = [];

    const writeFileSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((p) => {
      writtenPaths.push(String(p));
    });
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation((p) => {
      deletedPaths.push(String(p));
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    mockUploadToS3.mockRejectedValue(new Error('S3 upload failed'));

    // Attach rejection handler immediately so the promise is never "unhandled"
    const promise = generateVeoVertexVideo('prompt', null, 5);
    const settled = promise.then(
      (v) => ({ ok: true, value: v }),
      (e) => ({ ok: false, error: e })
    );

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await settled;
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('S3 upload failed');

    expect(writtenPaths.length).toBeGreaterThan(0);
    const tempPath = writtenPaths[writtenPaths.length - 1];
    expect(deletedPaths).toContain(tempPath);

    writeFileSpy.mockRestore();
    unlinkSpy.mockRestore();
    vi.spyOn(fs, 'existsSync').mockRestore();
  });
});
