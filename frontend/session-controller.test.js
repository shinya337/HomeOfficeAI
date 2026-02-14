/**
 * Tests for Session Controller Module
 *
 * TDD tests for session-controller.js - orchestrates session start/end
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.4, 4.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the api-client module
vi.mock('./backend-api.js', () => ({
  startSession: vi.fn(),
  endSession: vi.fn(),
  analyze: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(code, message, status) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

// Mock the camera-capture module
vi.mock('./camera-capture.js', () => ({
  captureFrame: vi.fn(),
  isStreamReady: vi.fn(),
}));

import {
  SessionController,
  DEFAULT_INTERVAL_MS,
  CONTINUE_MONITORING_INTERVAL_MS,
  createSessionController,
} from './session-controller.js';
import * as apiClient from './backend-api.js';
import * as cameraCapture from './camera-capture.js';

describe('SessionController', () => {
  let controller;
  let mockVideoElement;
  let mockCallbacks;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Create a mock video element
    mockVideoElement = {
      srcObject: { id: 'mock-stream' },
      videoWidth: 640,
      videoHeight: 480,
    };

    // Create mock callbacks
    mockCallbacks = {
      onSessionStarted: vi.fn(),
      onSessionEnded: vi.fn(),
      onAnalysisResult: vi.fn(),
      onError: vi.fn(),
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (controller) {
      controller.destroy();
    }
  });

  describe('createSessionController', () => {
    it('should create a new SessionController instance', () => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
      expect(controller).toBeInstanceOf(SessionController);
    });

    it('should accept custom interval configuration', () => {
      controller = createSessionController(mockVideoElement, mockCallbacks, {
        defaultIntervalMs: 30000,
      });
      expect(controller.getConfig().defaultIntervalMs).toBe(30000);
    });
  });

  describe('constants', () => {
    it('should have DEFAULT_INTERVAL_MS of 30 seconds (30000ms)', () => {
      expect(DEFAULT_INTERVAL_MS).toBe(30000);
    });

    it('should have CONTINUE_MONITORING_INTERVAL_MS of 5 seconds (5000ms)', () => {
      expect(CONTINUE_MONITORING_INTERVAL_MS).toBe(5000);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
    });

    it('should call API to start session', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      expect(apiClient.startSession).toHaveBeenCalledTimes(1);
    });

    it('should store session ID on successful start', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-456',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      expect(controller.getSessionId()).toBe('session-456');
    });

    it('should call onSessionStarted callback with session data', async () => {
      const sessionData = {
        sessionId: 'session-789',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      };
      apiClient.startSession.mockResolvedValue(sessionData);
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      expect(mockCallbacks.onSessionStarted).toHaveBeenCalledWith(sessionData);
    });

    it('should perform initial capture and analysis', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,initial');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'light_control', params: { power: 'on' } },
        result: { executed: true, message: 'Light turned on' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      expect(cameraCapture.captureFrame).toHaveBeenCalledWith(mockVideoElement);
      expect(apiClient.analyze).toHaveBeenCalledWith('data:image/jpeg;base64,initial');
    });

    it('should call onAnalysisResult with initial analysis result', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      const analysisResult = {
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      };
      apiClient.analyze.mockResolvedValue(analysisResult);

      await controller.start();

      expect(mockCallbacks.onAnalysisResult).toHaveBeenCalledWith(analysisResult);
    });

    it('should start interval timer with default 30 second interval', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      expect(controller.isRunning()).toBe(true);

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30000);

      // Should have captured again (initial + 1 interval)
      expect(cameraCapture.captureFrame).toHaveBeenCalledTimes(2);
      expect(apiClient.analyze).toHaveBeenCalledTimes(2);
    });

    it('should use nextIntervalMs from analyze response for next capture', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');

      // First analysis returns continue_monitoring (10s interval)
      apiClient.analyze.mockResolvedValueOnce({
        success: true,
        action: { tool: 'continue_monitoring', params: {} },
        result: { executed: false, message: 'Monitoring continues' },
        nextIntervalMs: 5000,
      });

      // Second analysis returns normal interval
      apiClient.analyze.mockResolvedValueOnce({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      // Advance by 5 seconds (the first interval)
      vi.advanceTimersByTime(5000);

      // Should have captured again
      expect(apiClient.analyze).toHaveBeenCalledTimes(2);
    });

    it('should call onError and abort session when API start fails', async () => {
      const error = new apiClient.ApiError('SERVER_ERROR', 'Internal server error', 500);
      apiClient.startSession.mockRejectedValue(error);

      await controller.start();

      expect(mockCallbacks.onError).toHaveBeenCalledWith(error);
      expect(controller.getSessionId()).toBeNull();
      expect(controller.isRunning()).toBe(false);
    });

    it('should continue session even if initial capture fails', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(false);
      cameraCapture.captureFrame.mockReturnValue(null);

      await controller.start();

      // Session should still be started
      expect(controller.getSessionId()).toBe('session-123');
      expect(controller.isRunning()).toBe(true);
      // But analyze should not be called
      expect(apiClient.analyze).not.toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();
      await controller.start(); // Second start should be ignored

      expect(apiClient.startSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
    });

    it('should stop the interval timer', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();
      controller.stop();

      expect(controller.isRunning()).toBe(false);

      // Advance time - should not trigger another capture
      vi.advanceTimersByTime(30000);
      expect(apiClient.analyze).toHaveBeenCalledTimes(1); // Only initial
    });

    it('should clear session ID', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();
      controller.stop();

      expect(controller.getSessionId()).toBeNull();
    });

    it('should call onSessionEnded callback', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();
      controller.stop();

      expect(mockCallbacks.onSessionEnded).toHaveBeenCalled();
    });

    it('should do nothing if not running', () => {
      controller.stop();

      expect(mockCallbacks.onSessionEnded).not.toHaveBeenCalled();
    });
  });

  describe('captureAndAnalyze', () => {
    beforeEach(() => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
    });

    it('should capture frame and call analyze API', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,test-image');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'aircon_control', params: { temperature: 24 } },
        result: { executed: true, message: 'Temperature set to 24' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      expect(apiClient.analyze).toHaveBeenCalledWith('data:image/jpeg;base64,test-image');
    });

    it('should skip analysis if capture returns null', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(false);
      cameraCapture.captureFrame.mockReturnValue(null);

      await controller.start();

      expect(apiClient.analyze).not.toHaveBeenCalled();
    });

    it('should handle analyze API errors gracefully', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      const error = new apiClient.ApiError('AI_ERROR', 'AI analysis failed', 500);
      apiClient.analyze.mockRejectedValue(error);

      await controller.start();

      // Should call onError but continue running
      expect(mockCallbacks.onError).toHaveBeenCalledWith(error);
      expect(controller.isRunning()).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should stop and clean up resources', async () => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();
      controller.destroy();

      expect(controller.isRunning()).toBe(false);
      expect(controller.getSessionId()).toBeNull();
    });
  });

  describe('updateVideoElement', () => {
    it('should allow updating the video element reference', async () => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
      const newVideoElement = {
        srcObject: { id: 'new-stream' },
        videoWidth: 1280,
        videoHeight: 720,
      };

      controller.updateVideoElement(newVideoElement);

      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.isStreamReady.mockReturnValue(true);
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      expect(cameraCapture.captureFrame).toHaveBeenCalledWith(newVideoElement);
    });
  });

  /**
   * Tests for endSession method (Task 5.4)
   * Requirements: 1.3, 1.4, 2.4
   * - 1.3: Call POST /api/session/end when ending session
   * - 1.4: Backend sets session status to 'ended'
   * - 2.4: Release camera stream and stop video
   */
  describe('endSession', () => {
    beforeEach(() => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
    });

    it('should call backend API to end session', async () => {
      // Setup and start session
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });
      apiClient.endSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T00:05:00.000Z',
      });

      await controller.start();
      await controller.endSession();

      expect(apiClient.endSession).toHaveBeenCalledTimes(1);
    });

    it('should stop the interval timer when ending session', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });
      apiClient.endSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T00:05:00.000Z',
      });

      await controller.start();
      await controller.endSession();

      expect(controller.isRunning()).toBe(false);

      // Advance time - should not trigger another capture
      vi.advanceTimersByTime(30000);
      expect(apiClient.analyze).toHaveBeenCalledTimes(1); // Only initial
    });

    it('should release camera stream when ending session', async () => {
      // Create mock stream with track.stop()
      const mockTrack = { stop: vi.fn() };
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
      };
      mockVideoElement.srcObject = mockStream;

      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });
      apiClient.endSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T00:05:00.000Z',
      });

      await controller.start();
      await controller.endSession();

      // Verify stream tracks were stopped
      expect(mockStream.getTracks).toHaveBeenCalled();
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('should clear video element srcObject when ending session', async () => {
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
      };
      mockVideoElement.srcObject = mockStream;

      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });
      apiClient.endSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T00:05:00.000Z',
      });

      await controller.start();
      await controller.endSession();

      expect(mockVideoElement.srcObject).toBeNull();
    });

    it('should call onSessionEnded callback with session data', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });
      const endSessionData = {
        sessionId: 'session-123',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T00:05:00.000Z',
      };
      apiClient.endSession.mockResolvedValue(endSessionData);

      await controller.start();
      await controller.endSession();

      expect(mockCallbacks.onSessionEnded).toHaveBeenCalledWith(endSessionData);
    });

    it('should clear session ID after ending session', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });
      apiClient.endSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T00:05:00.000Z',
      });

      await controller.start();
      expect(controller.getSessionId()).toBe('session-123');

      await controller.endSession();
      expect(controller.getSessionId()).toBeNull();
    });

    it('should do nothing if session is not running', async () => {
      apiClient.endSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T00:05:00.000Z',
      });

      await controller.endSession();

      expect(apiClient.endSession).not.toHaveBeenCalled();
      expect(mockCallbacks.onSessionEnded).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });
      const error = new apiClient.ApiError('SERVER_ERROR', 'Internal server error', 500);
      apiClient.endSession.mockRejectedValue(error);

      await controller.start();
      await controller.endSession();

      // Should call onError callback
      expect(mockCallbacks.onError).toHaveBeenCalledWith(error);
      // But still clean up local state
      expect(controller.isRunning()).toBe(false);
      expect(controller.getSessionId()).toBeNull();
    });

    it('should still release camera stream even if API fails', async () => {
      const mockTrack = { stop: vi.fn() };
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
      };
      mockVideoElement.srcObject = mockStream;

      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });
      apiClient.endSession.mockRejectedValue(new apiClient.ApiError('SERVER_ERROR', 'Error', 500));

      await controller.start();
      await controller.endSession();

      // Should still release camera even on API error
      expect(mockTrack.stop).toHaveBeenCalled();
      expect(mockVideoElement.srcObject).toBeNull();
    });
  });

  /**
   * Tests for periodic image capture (Task 5.5)
   * Requirements: 2.2, 2.3, 4.3, 4.4
   * - 2.2: Capture images at regular intervals (30 seconds default)
   * - 2.3: Send captured images to backend API for analysis
   * - 4.3: Schedule next capture for continue_monitoring at 5 seconds
   * - 4.4: Schedule next capture for do_nothing at 30 seconds
   */
  describe('periodic image capture (Task 5.5)', () => {
    let consoleSpy;

    beforeEach(() => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should capture frame at scheduled interval (30 seconds for do_nothing)', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000, // 30 seconds
      });

      await controller.start();

      // Initial capture
      expect(cameraCapture.captureFrame).toHaveBeenCalledTimes(1);
      expect(apiClient.analyze).toHaveBeenCalledTimes(1);

      // Advance by 30 seconds - should trigger second capture
      vi.advanceTimersByTime(30000);

      expect(cameraCapture.captureFrame).toHaveBeenCalledTimes(2);
      expect(apiClient.analyze).toHaveBeenCalledTimes(2);
    });

    it('should capture frame at short interval (5 seconds for continue_monitoring)', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      // First analysis returns continue_monitoring with 10s interval
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'continue_monitoring', params: {} },
        result: { executed: false, message: 'Continue monitoring' },
        nextIntervalMs: 5000, // 5 seconds
      });

      await controller.start();

      // Initial capture
      expect(cameraCapture.captureFrame).toHaveBeenCalledTimes(1);

      // Advance by 5 seconds - should trigger second capture
      vi.advanceTimersByTime(5000);

      expect(cameraCapture.captureFrame).toHaveBeenCalledTimes(2);
      expect(apiClient.analyze).toHaveBeenCalledTimes(2);
    });

    it('should send captured image to backend API', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,captured-frame-data');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      expect(apiClient.analyze).toHaveBeenCalledWith('data:image/jpeg;base64,captured-frame-data');
    });

    it('should log analysis result to console', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'light_control', params: { power: 'on' } },
        result: { executed: true, message: 'Light turned on' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      // Verify analysis result is logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Analysis result'),
        expect.anything()
      );
    });

    it('should log next capture interval to console', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();

      // Verify next capture timing is logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Next capture in')
      );
    });

    it('should handle multiple consecutive captures with varying intervals', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');

      // First: continue_monitoring (10s)
      apiClient.analyze.mockResolvedValueOnce({
        success: true,
        action: { tool: 'continue_monitoring', params: {} },
        result: { executed: false, message: 'Continue monitoring' },
        nextIntervalMs: 5000,
      });

      // Second: light_control, then do_nothing (5min)
      apiClient.analyze.mockResolvedValueOnce({
        success: true,
        action: { tool: 'light_control', params: { power: 'on' } },
        result: { executed: true, message: 'Light on' },
        nextIntervalMs: 30000,
      });

      // Third: do_nothing (5min)
      apiClient.analyze.mockResolvedValueOnce({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();
      expect(apiClient.analyze).toHaveBeenCalledTimes(1);

      // After 10s (continue_monitoring interval) - need to flush promises
      await vi.advanceTimersByTimeAsync(5000);
      expect(apiClient.analyze).toHaveBeenCalledTimes(2);

      // After another 5min (light_control default interval)
      await vi.advanceTimersByTimeAsync(30000);
      expect(apiClient.analyze).toHaveBeenCalledTimes(3);
    });

    it('should use default interval when nextIntervalMs is not provided', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      // Response without nextIntervalMs
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
      });

      await controller.start();

      // Advance by default interval (30 seconds)
      vi.advanceTimersByTime(30000);

      expect(apiClient.analyze).toHaveBeenCalledTimes(2);
    });

    it('should continue periodic captures after analysis error', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');

      // First call fails
      apiClient.analyze.mockRejectedValueOnce(
        new apiClient.ApiError('AI_ERROR', 'AI analysis failed', 500)
      );

      // Second call succeeds
      apiClient.analyze.mockResolvedValueOnce({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();
      expect(mockCallbacks.onError).toHaveBeenCalled();
      expect(controller.isRunning()).toBe(true);

      // Advance by default interval - should retry
      vi.advanceTimersByTime(30000);

      expect(apiClient.analyze).toHaveBeenCalledTimes(2);
    });

    it('should not capture when session is stopped', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.start();
      controller.stop();

      // Advance time - should not trigger capture
      vi.advanceTimersByTime(30000);

      // Only initial capture
      expect(apiClient.analyze).toHaveBeenCalledTimes(1);
    });

    it('should log detailed analysis result with action and device state', async () => {
      apiClient.startSession.mockResolvedValue({
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      });
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      const analysisResult = {
        success: true,
        action: { tool: 'aircon_control', params: { temperature: 25, mode: 'cool' } },
        result: { executed: true, message: 'Air conditioner set to 25C cooling' },
        nextIntervalMs: 30000,
        deviceState: {
          light: { power: 'on' },
          aircon: { temperature: '25', mode: 'cool' },
        },
      };
      apiClient.analyze.mockResolvedValue(analysisResult);

      await controller.start();

      // Should call onAnalysisResult with full result
      expect(mockCallbacks.onAnalysisResult).toHaveBeenCalledWith(analysisResult);
    });
  });

  /**
   * Tests for camera error handling (Task 5.6)
   * Requirements: 2.5
   * - Camera access denied: Show error message and abort session start
   * - Camera not found: Show error message and abort session start
   * - Guide user to change settings
   */
  describe('camera error handling (Task 5.6)', () => {
    beforeEach(() => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
    });

    describe('NotAllowedError (permission denied)', () => {
      it('should call onError with user-friendly message when camera permission is denied', async () => {
        const notAllowedError = new DOMException('Permission denied', 'NotAllowedError');

        // Setup: startWithCamera will throw NotAllowedError
        controller.setGetUserMediaFn(() => Promise.reject(notAllowedError));

        await controller.startWithCamera();

        expect(mockCallbacks.onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'CAMERA_PERMISSION_DENIED',
            message: expect.stringContaining('カメラへのアクセスが拒否されました'),
            userGuidance: expect.stringContaining('ブラウザの設定'),
          })
        );
      });

      it('should not start session when camera permission is denied', async () => {
        const notAllowedError = new DOMException('Permission denied', 'NotAllowedError');
        controller.setGetUserMediaFn(() => Promise.reject(notAllowedError));

        await controller.startWithCamera();

        expect(apiClient.startSession).not.toHaveBeenCalled();
        expect(controller.isRunning()).toBe(false);
        expect(controller.getSessionId()).toBeNull();
      });

      it('should not start interval timer when camera permission is denied', async () => {
        const notAllowedError = new DOMException('Permission denied', 'NotAllowedError');
        controller.setGetUserMediaFn(() => Promise.reject(notAllowedError));

        await controller.startWithCamera();

        vi.advanceTimersByTime(30000);
        expect(cameraCapture.captureFrame).not.toHaveBeenCalled();
      });
    });

    describe('NotFoundError (no camera device)', () => {
      it('should call onError with user-friendly message when no camera is found', async () => {
        const notFoundError = new DOMException('Requested device not found', 'NotFoundError');
        controller.setGetUserMediaFn(() => Promise.reject(notFoundError));

        await controller.startWithCamera();

        expect(mockCallbacks.onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'CAMERA_NOT_FOUND',
            message: expect.stringContaining('カメラが見つかりません'),
            userGuidance: expect.stringContaining('カメラが接続されている'),
          })
        );
      });

      it('should not start session when no camera is found', async () => {
        const notFoundError = new DOMException('Requested device not found', 'NotFoundError');
        controller.setGetUserMediaFn(() => Promise.reject(notFoundError));

        await controller.startWithCamera();

        expect(apiClient.startSession).not.toHaveBeenCalled();
        expect(controller.isRunning()).toBe(false);
      });
    });

    describe('Other camera errors', () => {
      it('should call onError with generic message for unknown camera errors', async () => {
        const genericError = new Error('Unknown camera error');
        controller.setGetUserMediaFn(() => Promise.reject(genericError));

        await controller.startWithCamera();

        expect(mockCallbacks.onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'CAMERA_ERROR',
            message: expect.stringContaining('カメラの起動に失敗しました'),
          })
        );
      });

      it('should handle NotReadableError (camera in use by another app)', async () => {
        const notReadableError = new DOMException('Could not start video source', 'NotReadableError');
        controller.setGetUserMediaFn(() => Promise.reject(notReadableError));

        await controller.startWithCamera();

        expect(mockCallbacks.onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'CAMERA_IN_USE',
            message: expect.stringContaining('カメラは他のアプリケーションで使用中'),
            userGuidance: expect.stringContaining('他のアプリケーション'),
          })
        );
      });

      it('should handle OverconstrainedError (camera constraints not satisfiable)', async () => {
        const overconstrainedError = new DOMException('Constraints could not be satisfied', 'OverconstrainedError');
        controller.setGetUserMediaFn(() => Promise.reject(overconstrainedError));

        await controller.startWithCamera();

        expect(mockCallbacks.onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'CAMERA_CONSTRAINTS_ERROR',
            message: expect.stringContaining('要求された解像度に対応'),
          })
        );
      });
    });

    describe('successful camera access', () => {
      it('should start session when camera access is granted', async () => {
        const mockStream = {
          getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
        };
        controller.setGetUserMediaFn(() => Promise.resolve(mockStream));

        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-camera-test',
          status: 'active',
          startedAt: '2026-02-04T00:00:00.000Z',
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.startWithCamera();

        expect(apiClient.startSession).toHaveBeenCalled();
        expect(controller.isRunning()).toBe(true);
        expect(controller.getSessionId()).toBe('session-camera-test');
      });

      it('should set video element srcObject with camera stream', async () => {
        const mockStream = {
          getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
        };
        controller.setGetUserMediaFn(() => Promise.resolve(mockStream));

        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-camera-test',
          status: 'active',
          startedAt: '2026-02-04T00:00:00.000Z',
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.startWithCamera();

        expect(mockVideoElement.srcObject).toBe(mockStream);
      });
    });

    describe('CameraError class', () => {
      it('should export CameraError class', async () => {
        const { CameraError } = await import('./session-controller.js');
        expect(CameraError).toBeDefined();
      });

      it('should have code, message and userGuidance properties', async () => {
        const { CameraError } = await import('./session-controller.js');
        const error = new CameraError(
          'CAMERA_PERMISSION_DENIED',
          'Test message',
          'Test guidance'
        );

        expect(error.code).toBe('CAMERA_PERMISSION_DENIED');
        expect(error.message).toBe('Test message');
        expect(error.userGuidance).toBe('Test guidance');
      });

      it('should extend Error', async () => {
        const { CameraError } = await import('./session-controller.js');
        const error = new CameraError('CAMERA_ERROR', 'Test', 'Guidance');
        expect(error).toBeInstanceOf(Error);
      });
    });
  });

  /**
   * Tests for resumeExistingSession method (Task 10.3-fix-1)
   * For page reload recovery - resumes analysis loop without creating new session
   */
  describe('resumeExistingSession (Task 10.3-fix-1)', () => {
    beforeEach(() => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
    });

    it('should resume session with provided session ID without calling startSession API', async () => {
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.resumeExistingSession('existing-session-123');

      expect(apiClient.startSession).not.toHaveBeenCalled();
      expect(controller.getSessionId()).toBe('existing-session-123');
      expect(controller.isRunning()).toBe(true);
    });

    it('should perform initial capture and analysis after resume', async () => {
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,resume-frame');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.resumeExistingSession('existing-session-456');

      expect(cameraCapture.captureFrame).toHaveBeenCalledWith(mockVideoElement);
      expect(apiClient.analyze).toHaveBeenCalledWith('data:image/jpeg;base64,resume-frame');
    });

    it('should start interval timer after resume', async () => {
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.resumeExistingSession('existing-session-789');

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30000);

      // Should have captured again (initial + 1 interval)
      expect(apiClient.analyze).toHaveBeenCalledTimes(2);
    });

    it('should call onAnalysisResult callback after resume', async () => {
      const analysisResult = {
        success: true,
        action: { tool: 'light_control', params: { power: 'on' } },
        result: { executed: true, message: 'Light turned on' },
        nextIntervalMs: 30000,
      };
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue(analysisResult);

      await controller.resumeExistingSession('existing-session');

      expect(mockCallbacks.onAnalysisResult).toHaveBeenCalledWith(analysisResult);
    });

    it('should not resume if already running', async () => {
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.resumeExistingSession('session-1');
      await controller.resumeExistingSession('session-2'); // Should be ignored

      expect(controller.getSessionId()).toBe('session-1');
      expect(apiClient.analyze).toHaveBeenCalledTimes(1);
    });

    it('should continue running even if initial analysis fails', async () => {
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockRejectedValue(
        new apiClient.ApiError('AI_ERROR', 'Analysis failed', 500)
      );

      await controller.resumeExistingSession('existing-session');

      expect(mockCallbacks.onError).toHaveBeenCalled();
      expect(controller.isRunning()).toBe(true);
      expect(controller.getSessionId()).toBe('existing-session');
    });

    it('should schedule next capture with default interval when analysis fails', async () => {
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      // First call fails
      apiClient.analyze.mockRejectedValueOnce(
        new apiClient.ApiError('AI_ERROR', 'Analysis failed', 500)
      );
      // Second call succeeds
      apiClient.analyze.mockResolvedValueOnce({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.resumeExistingSession('existing-session');

      // Advance by default interval (should be set via config or default)
      await vi.advanceTimersByTimeAsync(30000);

      expect(apiClient.analyze).toHaveBeenCalledTimes(2);
    });

    it('should be stoppable after resume', async () => {
      cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
      apiClient.analyze.mockResolvedValue({
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      });

      await controller.resumeExistingSession('existing-session');
      controller.stop();

      expect(controller.isRunning()).toBe(false);
      expect(controller.getSessionId()).toBeNull();
    });
  });

  /**
   * Tests for allowed device IDs in session start (Task 10.1)
   * Requirements: 3.1, 3.3
   * - 3.1: Send selected device IDs to session start request
   * - 3.3: Show warning when no devices selected, allow to continue after confirmation
   */
  describe('allowed device IDs in session start (Task 10.1)', () => {
    beforeEach(() => {
      controller = createSessionController(mockVideoElement, mockCallbacks);
    });

    describe('sending allowed device IDs (Requirement 3.1)', () => {
      it('should pass allowedDeviceIds to startSession API when provided', async () => {
        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-with-devices',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
          allowedDevices: [
            { id: 'light-1', type: 'LIGHT' },
            { id: 'ac-1', type: 'AC' },
          ],
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        const allowedDeviceIds = ['light-1', 'ac-1'];
        await controller.start(allowedDeviceIds);

        expect(apiClient.startSession).toHaveBeenCalledWith(allowedDeviceIds);
      });

      it('should include allowedDevices in onSessionStarted callback', async () => {
        const sessionData = {
          sessionId: 'session-123',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
          allowedDevices: [
            { id: 'light-1', type: 'LIGHT' },
            { id: 'ac-1', type: 'AC' },
          ],
        };
        apiClient.startSession.mockResolvedValue(sessionData);
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.start(['light-1', 'ac-1']);

        expect(mockCallbacks.onSessionStarted).toHaveBeenCalledWith(sessionData);
        expect(mockCallbacks.onSessionStarted.mock.calls[0][0].allowedDevices).toEqual([
          { id: 'light-1', type: 'LIGHT' },
          { id: 'ac-1', type: 'AC' },
        ]);
      });

      it('should work without allowedDeviceIds for backward compatibility', async () => {
        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-compat',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.start(); // No allowedDeviceIds

        expect(apiClient.startSession).toHaveBeenCalledWith(undefined);
      });

      it('should pass empty array when explicitly provided', async () => {
        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-empty',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
          allowedDevices: [],
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.start([]); // Empty array

        expect(apiClient.startSession).toHaveBeenCalledWith([]);
      });
    });

    describe('no devices selected warning (Requirement 3.3)', () => {
      it('should call onNoDevicesSelected callback when empty array provided and confirmNoDevices is true', async () => {
        const mockOnNoDevicesSelected = vi.fn().mockResolvedValue(true); // User confirms to continue
        controller = createSessionController(mockVideoElement, {
          ...mockCallbacks,
          onNoDevicesSelected: mockOnNoDevicesSelected,
        });

        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-no-devices',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
          allowedDevices: [],
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.start([]);

        expect(mockOnNoDevicesSelected).toHaveBeenCalled();
        expect(apiClient.startSession).toHaveBeenCalledWith([]);
      });

      it('should abort session start when user cancels no-devices warning', async () => {
        const mockOnNoDevicesSelected = vi.fn().mockResolvedValue(false); // User cancels
        controller = createSessionController(mockVideoElement, {
          ...mockCallbacks,
          onNoDevicesSelected: mockOnNoDevicesSelected,
        });

        await controller.start([]);

        expect(mockOnNoDevicesSelected).toHaveBeenCalled();
        expect(apiClient.startSession).not.toHaveBeenCalled();
        expect(controller.isRunning()).toBe(false);
      });

      it('should proceed without warning when devices are selected', async () => {
        const mockOnNoDevicesSelected = vi.fn();
        controller = createSessionController(mockVideoElement, {
          ...mockCallbacks,
          onNoDevicesSelected: mockOnNoDevicesSelected,
        });

        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-with-devices',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
          allowedDevices: [{ id: 'light-1', type: 'LIGHT' }],
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.start(['light-1']);

        expect(mockOnNoDevicesSelected).not.toHaveBeenCalled();
        expect(apiClient.startSession).toHaveBeenCalled();
      });

      it('should proceed without warning when allowedDeviceIds is undefined (backward compat)', async () => {
        const mockOnNoDevicesSelected = vi.fn();
        controller = createSessionController(mockVideoElement, {
          ...mockCallbacks,
          onNoDevicesSelected: mockOnNoDevicesSelected,
        });

        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-compat',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.start(); // undefined

        expect(mockOnNoDevicesSelected).not.toHaveBeenCalled();
        expect(apiClient.startSession).toHaveBeenCalled();
      });

      it('should proceed if onNoDevicesSelected callback is not provided and devices empty', async () => {
        // No onNoDevicesSelected callback defined - should proceed without warning
        controller = createSessionController(mockVideoElement, mockCallbacks);

        apiClient.startSession.mockResolvedValue({
          sessionId: 'session-no-callback',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
          allowedDevices: [],
        });
        cameraCapture.captureFrame.mockReturnValue('data:image/jpeg;base64,abc123');
        apiClient.analyze.mockResolvedValue({
          success: true,
          action: { tool: 'do_nothing', params: {} },
          result: { executed: false, message: 'No action needed' },
          nextIntervalMs: 30000,
        });

        await controller.start([]);

        // Should still proceed since no callback is set
        expect(apiClient.startSession).toHaveBeenCalledWith([]);
      });
    });
  });
});
