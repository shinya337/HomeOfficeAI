/**
 * Camera Capture Module Tests
 *
 * TDD tests for camera capture functionality.
 * Tests use mocked Canvas and Video elements to verify correct capture behavior.
 *
 * Requirements: 2.2, 2.3
 * - 2.2: Capture still images from webcam at 5-minute intervals
 * - 2.3: Base64 encode captured images and send to POST /api/analyze
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Camera Capture Module', () => {
  // Store original globals
  let originalDocument;
  let mockCanvas;
  let mockContext;
  let mockVideo;

  beforeEach(() => {
    // Reset modules to ensure fresh import
    vi.resetModules();

    // Create mock canvas context
    mockContext = {
      drawImage: vi.fn(),
    };

    // Create mock canvas
    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,mockBase64Data'),
      width: 0,
      height: 0,
    };

    // Create mock video element
    mockVideo = {
      videoWidth: 1280,
      videoHeight: 720,
      srcObject: null,
    };

    // Mock document.createElement
    originalDocument = global.document;
    global.document = {
      createElement: vi.fn((tagName) => {
        if (tagName === 'canvas') {
          return mockCanvas;
        }
        if (tagName === 'video') {
          return mockVideo;
        }
        return {};
      }),
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    vi.clearAllMocks();
  });

  describe('captureFrame', () => {
    it('should return null when no video element is provided', async () => {
      const { captureFrame } = await import('./camera-capture.js');

      const result = captureFrame(null);

      expect(result).toBeNull();
    });

    it('should return null when video has no srcObject (stream not set)', async () => {
      const { captureFrame } = await import('./camera-capture.js');
      const videoWithoutStream = { ...mockVideo, srcObject: null };

      const result = captureFrame(videoWithoutStream);

      expect(result).toBeNull();
    });

    it('should return null when video dimensions are 0 (stream not ready)', async () => {
      const { captureFrame } = await import('./camera-capture.js');
      const mockStream = { getTracks: vi.fn(() => []) };
      const videoWithZeroDimensions = {
        ...mockVideo,
        srcObject: mockStream,
        videoWidth: 0,
        videoHeight: 0,
      };

      const result = captureFrame(videoWithZeroDimensions);

      expect(result).toBeNull();
    });

    it('should capture frame and return Base64 JPEG string', async () => {
      const { captureFrame } = await import('./camera-capture.js');
      const mockStream = { getTracks: vi.fn(() => []) };
      const videoWithStream = {
        ...mockVideo,
        srcObject: mockStream,
        videoWidth: 1280,
        videoHeight: 720,
      };

      const result = captureFrame(videoWithStream);

      expect(result).toBe('data:image/jpeg;base64,mockBase64Data');
    });

    it('should create canvas with video dimensions', async () => {
      const { captureFrame } = await import('./camera-capture.js');
      const mockStream = { getTracks: vi.fn(() => []) };
      const videoWithStream = {
        ...mockVideo,
        srcObject: mockStream,
        videoWidth: 1920,
        videoHeight: 1080,
      };

      captureFrame(videoWithStream);

      expect(mockCanvas.width).toBe(1920);
      expect(mockCanvas.height).toBe(1080);
    });

    it('should draw video frame onto canvas', async () => {
      const { captureFrame } = await import('./camera-capture.js');
      const mockStream = { getTracks: vi.fn(() => []) };
      const videoWithStream = {
        ...mockVideo,
        srcObject: mockStream,
        videoWidth: 1280,
        videoHeight: 720,
      };

      captureFrame(videoWithStream);

      expect(mockContext.drawImage).toHaveBeenCalledWith(videoWithStream, 0, 0);
    });

    it('should use image/jpeg as MIME type with 0.8 quality', async () => {
      const { captureFrame } = await import('./camera-capture.js');
      const mockStream = { getTracks: vi.fn(() => []) };
      const videoWithStream = {
        ...mockVideo,
        srcObject: mockStream,
        videoWidth: 1280,
        videoHeight: 720,
      };

      captureFrame(videoWithStream);

      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
    });
  });

  describe('CaptureResult', () => {
    it('should include base64 data and mimeType in result object when using captureFrameWithMetadata', async () => {
      const { captureFrameWithMetadata } = await import('./camera-capture.js');
      const mockStream = { getTracks: vi.fn(() => []) };
      const videoWithStream = {
        ...mockVideo,
        srcObject: mockStream,
        videoWidth: 1280,
        videoHeight: 720,
      };

      const result = captureFrameWithMetadata(videoWithStream);

      expect(result).not.toBeNull();
      expect(result.base64).toBe('data:image/jpeg;base64,mockBase64Data');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should return null from captureFrameWithMetadata when capture fails', async () => {
      const { captureFrameWithMetadata } = await import('./camera-capture.js');

      const result = captureFrameWithMetadata(null);

      expect(result).toBeNull();
    });
  });

  describe('isStreamReady', () => {
    it('should return false when video is null', async () => {
      const { isStreamReady } = await import('./camera-capture.js');

      const result = isStreamReady(null);

      expect(result).toBe(false);
    });

    it('should return false when video has no srcObject', async () => {
      const { isStreamReady } = await import('./camera-capture.js');
      const videoWithoutStream = { ...mockVideo, srcObject: null };

      const result = isStreamReady(videoWithoutStream);

      expect(result).toBe(false);
    });

    it('should return false when video dimensions are 0', async () => {
      const { isStreamReady } = await import('./camera-capture.js');
      const mockStream = { getTracks: vi.fn(() => []) };
      const videoWithZeroDimensions = {
        ...mockVideo,
        srcObject: mockStream,
        videoWidth: 0,
        videoHeight: 0,
      };

      const result = isStreamReady(videoWithZeroDimensions);

      expect(result).toBe(false);
    });

    it('should return true when video has stream and valid dimensions', async () => {
      const { isStreamReady } = await import('./camera-capture.js');
      const mockStream = { getTracks: vi.fn(() => []) };
      const validVideo = {
        ...mockVideo,
        srcObject: mockStream,
        videoWidth: 1280,
        videoHeight: 720,
      };

      const result = isStreamReady(validVideo);

      expect(result).toBe(true);
    });
  });

  describe('CAPTURE_MIME_TYPE constant', () => {
    it('should export CAPTURE_MIME_TYPE as image/jpeg', async () => {
      const { CAPTURE_MIME_TYPE } = await import('./camera-capture.js');

      expect(CAPTURE_MIME_TYPE).toBe('image/jpeg');
    });
  });

  describe('CAPTURE_QUALITY constant', () => {
    it('should export CAPTURE_QUALITY as 0.8', async () => {
      const { CAPTURE_QUALITY } = await import('./camera-capture.js');

      expect(CAPTURE_QUALITY).toBe(0.8);
    });
  });
});
