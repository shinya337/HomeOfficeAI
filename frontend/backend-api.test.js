/**
 * API Client Module Tests
 *
 * TDD tests for API client functions that communicate with the backend.
 * Tests use mocked fetch to verify correct request/response handling.
 *
 * Requirements: 1.1, 1.3, 2.1, 2.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally before importing the module
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after setting up the mock
const { startSession, endSession, analyze, getDevices, getSessionStatus, ApiError } = await import(
  './backend-api.js'
);

describe('API Client Module', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('startSession', () => {
    it('should call POST /api/session/start', async () => {
      const mockResponse = {
        sessionId: 'test-session-123',
        status: 'active',
        startedAt: '2026-02-04T10:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startSession();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return session response with sessionId, status, and startedAt', async () => {
      const mockResponse = {
        sessionId: 'abc-123',
        status: 'active',
        startedAt: '2026-02-04T12:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startSession();

      expect(result.sessionId).toBe('abc-123');
      expect(result.status).toBe('active');
      expect(result.startedAt).toBe('2026-02-04T12:00:00.000Z');
    });

    it('should throw ApiError on server error (500)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: { code: 'INTERNAL_ERROR', message: 'Server error' },
          }),
      });

      const error = await startSession().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('Server error');
      expect(error.status).toBe(500);
    });

    it('should throw ApiError with default message on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const error = await startSession().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Network error');
    });

    it('should include allowedDeviceIds in request body when provided', async () => {
      const mockResponse = {
        sessionId: 'test-session-456',
        status: 'active',
        startedAt: '2026-02-05T10:00:00.000Z',
        allowedDevices: [
          { id: 'device-1', type: 'LIGHT' },
          { id: 'device-2', type: 'AC' },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const allowedDeviceIds = ['device-1', 'device-2'];
      const result = await startSession(allowedDeviceIds);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ allowedDeviceIds }),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return allowedDevices in response when provided', async () => {
      const mockResponse = {
        sessionId: 'test-session-789',
        status: 'active',
        startedAt: '2026-02-05T11:00:00.000Z',
        allowedDevices: [
          { id: 'light-001', type: 'LIGHT' },
          { id: 'ac-001', type: 'AC' },
          { id: 'tv-001', type: 'TV' },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startSession(['light-001', 'ac-001', 'tv-001']);

      expect(result.allowedDevices).toEqual([
        { id: 'light-001', type: 'LIGHT' },
        { id: 'ac-001', type: 'AC' },
        { id: 'tv-001', type: 'TV' },
      ]);
    });

    it('should work without allowedDeviceIds for backward compatibility', async () => {
      const mockResponse = {
        sessionId: 'test-session-compat',
        status: 'active',
        startedAt: '2026-02-05T12:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startSession();

      // Should NOT include body when no allowedDeviceIds provided
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(result.sessionId).toBe('test-session-compat');
    });

    it('should send empty body when empty allowedDeviceIds array provided', async () => {
      const mockResponse = {
        sessionId: 'test-session-empty',
        status: 'active',
        startedAt: '2026-02-05T13:00:00.000Z',
        allowedDevices: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startSession([]);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ allowedDeviceIds: [] }),
      });
      expect(result.allowedDevices).toEqual([]);
    });
  });

  describe('endSession', () => {
    it('should call POST /api/session/end', async () => {
      const mockResponse = {
        sessionId: 'test-session-123',
        status: 'ended',
        startedAt: '2026-02-04T10:00:00.000Z',
        endedAt: '2026-02-04T11:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await endSession();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/session/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return session response with endedAt when session ends', async () => {
      const mockResponse = {
        sessionId: 'xyz-789',
        status: 'ended',
        startedAt: '2026-02-04T10:00:00.000Z',
        endedAt: '2026-02-04T11:30:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await endSession();

      expect(result.status).toBe('ended');
      expect(result.endedAt).toBe('2026-02-04T11:30:00.000Z');
    });

    it('should throw ApiError when no active session (400)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: { code: 'NO_ACTIVE_SESSION', message: 'No active session to end' },
          }),
      });

      const error = await endSession().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NO_ACTIVE_SESSION');
      expect(error.status).toBe(400);
    });
  });

  describe('analyze', () => {
    it('should call POST /api/analyze with base64 image', async () => {
      const mockResponse = {
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      const result = await analyze(base64Image);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: {
            base64: base64Image,
            mimeType: 'image/jpeg',
          },
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should detect and use correct mimeType for png images', async () => {
      const mockResponse = {
        success: true,
        action: { tool: 'light_control', params: { power: 'on' } },
        result: { executed: true, message: 'Light turned on' },
        nextIntervalMs: 30000,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...';
      await analyze(base64Image);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: {
            base64: base64Image,
            mimeType: 'image/png',
          },
        }),
      });
    });

    it('should default to image/jpeg when mimeType cannot be detected', async () => {
      const mockResponse = {
        success: true,
        action: { tool: 'do_nothing', params: {} },
        result: { executed: false, message: 'No action needed' },
        nextIntervalMs: 30000,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Base64 without data URI prefix
      const rawBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD...';
      await analyze(rawBase64);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: {
            base64: rawBase64,
            mimeType: 'image/jpeg',
          },
        }),
      });
    });

    it('should return analyze response with action and nextIntervalMs', async () => {
      const mockResponse = {
        success: true,
        action: { tool: 'continue_monitoring', params: {} },
        result: { executed: false, message: 'User appears busy, checking again soon' },
        nextIntervalMs: 5000,
        deviceState: {
          light: { power: 'on' },
          aircon: { temperature: '24', mode: 'cool' },
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await analyze('data:image/jpeg;base64,test');

      expect(result.success).toBe(true);
      expect(result.action.tool).toBe('continue_monitoring');
      expect(result.nextIntervalMs).toBe(5000);
      expect(result.deviceState.light.power).toBe('on');
    });

    it('should throw ApiError when no active session (400)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: { code: 'NO_ACTIVE_SESSION', message: 'No active session' },
          }),
      });

      const error = await analyze('data:image/jpeg;base64,test').catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NO_ACTIVE_SESSION');
      expect(error.status).toBe(400);
    });

    it('should throw ApiError on AI error (500)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: { code: 'AI_ERROR', message: 'AI analysis failed' },
          }),
      });

      const error = await analyze('data:image/jpeg;base64,test').catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('AI_ERROR');
      expect(error.status).toBe(500);
    });
  });

  describe('ApiError', () => {
    it('should have code, message, and status properties', () => {
      const error = new ApiError('TEST_CODE', 'Test message', 400);

      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.status).toBe(400);
      expect(error instanceof Error).toBe(true);
    });

    it('should be catchable as Error', () => {
      const error = new ApiError('ERROR', 'message', 500);

      expect(() => {
        throw error;
      }).toThrow(Error);
    });
  });

  describe('getDevices', () => {
    it('should call GET /api/devices', async () => {
      const mockResponse = {
        devices: [
          { id: 'device-1', name: 'Living Room Light', type: 'LIGHT' },
          { id: 'device-2', name: 'Bedroom AC', type: 'AC' },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getDevices();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/devices', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return device list with id, name, and type', async () => {
      const mockResponse = {
        devices: [
          { id: 'light-001', name: 'Office Light', type: 'LIGHT' },
          { id: 'ac-001', name: 'Office AC', type: 'AC' },
          { id: 'tv-001', name: 'Living Room TV', type: 'TV' },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getDevices();

      expect(result.devices).toHaveLength(3);
      expect(result.devices[0]).toEqual({ id: 'light-001', name: 'Office Light', type: 'LIGHT' });
      expect(result.devices[1]).toEqual({ id: 'ac-001', name: 'Office AC', type: 'AC' });
      expect(result.devices[2]).toEqual({ id: 'tv-001', name: 'Living Room TV', type: 'TV' });
    });

    it('should throw ApiError with NATURE_API_ERROR on 503', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error: { code: 'NATURE_API_ERROR', message: 'Nature Remo API is unavailable' },
          }),
      });

      const error = await getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NATURE_API_ERROR');
      expect(error.message).toBe('Nature Remo API is unavailable');
      expect(error.status).toBe(503);
    });

    it('should throw ApiError with RATE_LIMIT_EXCEEDED on 429', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded',
              retryAfter: 60,
            },
          }),
      });

      const error = await getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.status).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    it('should throw ApiError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const error = await getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Network error');
    });

    it('should return empty devices array when no devices registered', async () => {
      const mockResponse = {
        devices: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getDevices();

      expect(result.devices).toEqual([]);
    });
  });

  // Task 10.2: getSessionStatus for page reload state restoration
  // Requirement 2.3: Store selection state in session scope (restoration)
  describe('getSessionStatus', () => {
    it('should call GET /api/session/status', async () => {
      const mockResponse = {
        hasActiveSession: false,
        session: null,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await getSessionStatus();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/session/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should return hasActiveSession: false when no active session', async () => {
      const mockResponse = {
        hasActiveSession: false,
        session: null,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getSessionStatus();

      expect(result.hasActiveSession).toBe(false);
      expect(result.session).toBeNull();
    });

    it('should return session with allowedDevices when session is active', async () => {
      const mockResponse = {
        hasActiveSession: true,
        session: {
          sessionId: 'test-session-123',
          status: 'active',
          startedAt: '2026-02-05T10:00:00.000Z',
          allowedDevices: [
            { id: 'light-1', type: 'LIGHT' },
            { id: 'ac-1', type: 'AC' },
          ],
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getSessionStatus();

      expect(result.hasActiveSession).toBe(true);
      expect(result.session.sessionId).toBe('test-session-123');
      expect(result.session.allowedDevices).toEqual([
        { id: 'light-1', type: 'LIGHT' },
        { id: 'ac-1', type: 'AC' },
      ]);
    });

    it('should return session without allowedDevices for legacy sessions', async () => {
      const mockResponse = {
        hasActiveSession: true,
        session: {
          sessionId: 'legacy-session',
          status: 'active',
          startedAt: '2026-02-05T09:00:00.000Z',
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getSessionStatus();

      expect(result.hasActiveSession).toBe(true);
      expect(result.session.sessionId).toBe('legacy-session');
      expect(result.session.allowedDevices).toBeUndefined();
    });

    it('should throw ApiError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const error = await getSessionStatus().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Network error');
    });

    it('should throw ApiError on server error (500)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: { code: 'INTERNAL_ERROR', message: 'Server error' },
          }),
      });

      const error = await getSessionStatus().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.status).toBe(500);
    });
  });
});
