/**
 * API Client Module Tests
 *
 * TDD tests for API client functions that communicate with the backend.
 * Tests use mocked fetch to verify correct request/response handling.
 *
 * Requirements: 1.1, 1.3, 2.1, 2.3, 3.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally before importing the module
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after setting up the mock
const {
  startSession,
  endSession,
  analyze,
  getDevices,
  getSessionStatus,
  saveCredential,
  getCredentialStatus,
  deleteCredential,
  startAlexaAuth,
  getAlexaAuthStatus,
  setAuthTokenProvider,
  getSessionId,
  clearSessionId,
  ApiError,
} = await import('./backend-api.js');

describe('API Client Module', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setAuthTokenProvider(null);
    clearSessionId();
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
      expect(mockFetch).toHaveBeenCalledWith('/api/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should use relative URL (empty API_BASE) for same-origin requests', async () => {
      const mockResponse = {
        sessionId: 'test-session-origin',
        status: 'active',
        startedAt: '2026-02-13T10:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await startSession();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe('/api/session/start');
      expect(calledUrl).not.toContain('http://localhost');
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
      expect(mockFetch).toHaveBeenCalledWith('/api/session/start', {
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
      expect(mockFetch).toHaveBeenCalledWith('/api/session/start', {
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

      expect(mockFetch).toHaveBeenCalledWith('/api/session/start', {
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
      expect(mockFetch).toHaveBeenCalledWith('/api/session/end', {
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
      expect(mockFetch).toHaveBeenCalledWith('/api/analyze', {
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

      expect(mockFetch).toHaveBeenCalledWith('/api/analyze', {
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

      expect(mockFetch).toHaveBeenCalledWith('/api/analyze', {
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
      expect(mockFetch).toHaveBeenCalledWith('/api/devices', {
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
      expect(mockFetch).toHaveBeenCalledWith('/api/session/status', {
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

  // Task 7.2: Firebase IDトークン付与とsessionId管理
  // Requirement 3.1: IDトークン検証
  describe('setAuthTokenProvider', () => {
    afterEach(() => {
      // Reset auth token provider after each test
      setAuthTokenProvider(null);
    });

    it('should accept a getIdToken function', () => {
      const mockGetIdToken = vi.fn().mockResolvedValue('test-token');
      // Should not throw
      expect(() => setAuthTokenProvider(mockGetIdToken)).not.toThrow();
    });

    it('should accept null to clear the provider', () => {
      expect(() => setAuthTokenProvider(null)).not.toThrow();
    });
  });

  describe('Authorization header injection', () => {
    afterEach(() => {
      setAuthTokenProvider(null);
    });

    it('should add Authorization Bearer header to startSession when token is available', async () => {
      const mockGetIdToken = vi.fn().mockResolvedValue('firebase-id-token-123');
      setAuthTokenProvider(mockGetIdToken);

      const mockResponse = {
        sessionId: 'auth-session-1',
        status: 'active',
        startedAt: '2026-02-14T10:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await startSession();

      expect(mockGetIdToken).toHaveBeenCalled();
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer firebase-id-token-123');
    });

    it('should omit Authorization header in guest mode (getIdToken returns null)', async () => {
      const mockGetIdToken = vi.fn().mockResolvedValue(null);
      setAuthTokenProvider(mockGetIdToken);

      const mockResponse = {
        sessionId: 'guest-session-1',
        status: 'active',
        startedAt: '2026-02-14T10:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await startSession();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('should omit Authorization header when no token provider is set', async () => {
      // No setAuthTokenProvider call
      const mockResponse = {
        sessionId: 'no-provider-session',
        status: 'active',
        startedAt: '2026-02-14T10:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await startSession();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('should add Authorization header to endSession', async () => {
      const mockGetIdToken = vi.fn().mockResolvedValue('token-for-end');
      setAuthTokenProvider(mockGetIdToken);

      const mockResponse = {
        sessionId: 'end-session-1',
        status: 'ended',
        startedAt: '2026-02-14T10:00:00.000Z',
        endedAt: '2026-02-14T11:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await endSession();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer token-for-end');
    });

    it('should add Authorization header to analyze', async () => {
      const mockGetIdToken = vi.fn().mockResolvedValue('token-for-analyze');
      setAuthTokenProvider(mockGetIdToken);

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

      await analyze('data:image/jpeg;base64,test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer token-for-analyze');
    });

    it('should add Authorization header to getDevices', async () => {
      const mockGetIdToken = vi.fn().mockResolvedValue('token-for-devices');
      setAuthTokenProvider(mockGetIdToken);

      const mockResponse = { devices: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await getDevices();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer token-for-devices');
    });

    it('should add Authorization header to getSessionStatus', async () => {
      const mockGetIdToken = vi.fn().mockResolvedValue('token-for-status');
      setAuthTokenProvider(mockGetIdToken);

      const mockResponse = { hasActiveSession: false, session: null };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await getSessionStatus();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer token-for-status');
    });

    it('should call getIdToken on every request to get a fresh token', async () => {
      let callCount = 0;
      const mockGetIdToken = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(`token-${callCount}`);
      });
      setAuthTokenProvider(mockGetIdToken);

      // First request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ devices: [] }),
      });
      await getDevices();

      // Second request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ devices: [] }),
      });
      await getDevices();

      expect(mockGetIdToken).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer token-1');
      expect(mockFetch.mock.calls[1][1].headers['Authorization']).toBe('Bearer token-2');
    });
  });

  describe('sessionId management', () => {
    afterEach(() => {
      setAuthTokenProvider(null);
    });

    it('should store sessionId from startSession response', async () => {
      const mockResponse = {
        sessionId: 'stored-session-id-abc',
        status: 'active',
        startedAt: '2026-02-14T10:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await startSession();

      expect(getSessionId()).toBe('stored-session-id-abc');
    });

    it('should include sessionId in analyze request body', async () => {
      // First, start a session to store sessionId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: 'session-for-analyze',
            status: 'active',
            startedAt: '2026-02-14T10:00:00.000Z',
          }),
      });
      await startSession();

      // Then analyze
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            action: { tool: 'do_nothing', params: {} },
            result: { executed: false, message: 'ok' },
            nextIntervalMs: 30000,
          }),
      });
      await analyze('data:image/jpeg;base64,test');

      const [, analyzeOptions] = mockFetch.mock.calls[1];
      const body = JSON.parse(analyzeOptions.body);
      expect(body.sessionId).toBe('session-for-analyze');
    });

    it('should include sessionId in endSession request body', async () => {
      // First, start a session to store sessionId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: 'session-to-end',
            status: 'active',
            startedAt: '2026-02-14T10:00:00.000Z',
          }),
      });
      await startSession();

      // Then end session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: 'session-to-end',
            status: 'ended',
            startedAt: '2026-02-14T10:00:00.000Z',
            endedAt: '2026-02-14T11:00:00.000Z',
          }),
      });
      await endSession();

      const [, endOptions] = mockFetch.mock.calls[1];
      const body = JSON.parse(endOptions.body);
      expect(body.sessionId).toBe('session-to-end');
    });

    it('should clear sessionId after endSession', async () => {
      // Start session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: 'session-to-clear',
            status: 'active',
            startedAt: '2026-02-14T10:00:00.000Z',
          }),
      });
      await startSession();
      expect(getSessionId()).toBe('session-to-clear');

      // End session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: 'session-to-clear',
            status: 'ended',
            startedAt: '2026-02-14T10:00:00.000Z',
            endedAt: '2026-02-14T11:00:00.000Z',
          }),
      });
      await endSession();

      expect(getSessionId()).toBeNull();
    });

    it('should return null from getSessionId when no session is active', () => {
      expect(getSessionId()).toBeNull();
    });

    it('should omit sessionId from analyze when no session has been started', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            action: { tool: 'do_nothing', params: {} },
            result: { executed: false, message: 'ok' },
            nextIntervalMs: 30000,
          }),
      });
      await analyze('data:image/jpeg;base64,test');

      const [, analyzeOptions] = mockFetch.mock.calls[0];
      const body = JSON.parse(analyzeOptions.body);
      expect(body.sessionId).toBeUndefined();
    });
  });

  // Task 9.1: Credential API functions
  // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
  describe('saveCredential', () => {
    it('should call PUT /api/credentials/:service with token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await saveCredential('nature-remo', 'ory_at_test_token');

      expect(mockFetch).toHaveBeenCalledWith('/api/credentials/nature-remo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'ory_at_test_token' }),
      });
      expect(result.ok).toBe(true);
    });

    it('should throw ApiError on validation error (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { code: 'INVALID_INPUT', message: 'Token is required' },
        }),
      });

      const error = await saveCredential('nature-remo', '').catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.status).toBe(400);
    });

    it('should throw ApiError on auth error (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        }),
      });

      const error = await saveCredential('nature-remo', 'token').catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('AUTH_REQUIRED');
      expect(error.status).toBe(401);
    });

    it('should include Authorization header when token provider is set', async () => {
      setAuthTokenProvider(vi.fn().mockResolvedValue('firebase-token'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await saveCredential('nature-remo', 'test-token');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer firebase-token');
    });
  });

  describe('getCredentialStatus', () => {
    it('should call GET /api/credentials/status', async () => {
      const mockResponse = {
        credentials: [
          { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T10:00:00Z' },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getCredentialStatus();

      expect(mockFetch).toHaveBeenCalledWith('/api/credentials/status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].service).toBe('nature-remo');
      expect(result.credentials[0].configured).toBe(true);
    });

    it('should return empty credentials array when none configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ credentials: [] }),
      });

      const result = await getCredentialStatus();
      expect(result.credentials).toEqual([]);
    });

    it('should throw ApiError on auth error (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        }),
      });

      const error = await getCredentialStatus().catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('deleteCredential', () => {
    it('should call DELETE /api/credentials/:service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await deleteCredential('nature-remo');

      expect(mockFetch).toHaveBeenCalledWith('/api/credentials/nature-remo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result.ok).toBe(true);
    });

    it('should throw ApiError on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: { code: 'INTERNAL_ERROR', message: 'Server error' },
        }),
      });

      const error = await deleteCredential('nature-remo').catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.status).toBe(500);
    });

    it('should throw ApiError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const error = await deleteCredential('nature-remo').catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NETWORK_ERROR');
    });
  });

  // Task 5.1: Alexa Proxy認証用API関数
  // Requirements: 2.3
  describe('startAlexaAuth', () => {
    it('should call POST /api/alexa-auth/start', async () => {
      const mockResponse = {
        sessionId: 'alexa-proxy-session-123',
        proxyUrl: '/api/alexa-auth/proxy/alexa-proxy-session-123/',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startAlexaAuth();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/alexa-auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return sessionId and proxyUrl from response', async () => {
      const mockResponse = {
        sessionId: 'proxy-abc',
        proxyUrl: '/api/alexa-auth/proxy/proxy-abc/',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startAlexaAuth();

      expect(result.sessionId).toBe('proxy-abc');
      expect(result.proxyUrl).toBe('/api/alexa-auth/proxy/proxy-abc/');
    });

    it('should include Authorization header when token provider is set', async () => {
      setAuthTokenProvider(vi.fn().mockResolvedValue('firebase-alexa-token'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessionId: 'auth-session', proxyUrl: '/api/alexa-auth/proxy/auth-session/' }),
      });

      await startAlexaAuth();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer firebase-alexa-token');
    });

    it('should throw ApiError on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: { code: 'PROXY_START_FAILED', message: 'Failed to start proxy server' },
        }),
      });

      const error = await startAlexaAuth().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('PROXY_START_FAILED');
      expect(error.status).toBe(500);
    });

    it('should throw ApiError on auth error (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        }),
      });

      const error = await startAlexaAuth().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.status).toBe(401);
    });

    it('should throw ApiError on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: { code: 'PROXY_START_FAILED', message: 'Failed to start proxy' },
        }),
      });

      const error = await startAlexaAuth().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('PROXY_START_FAILED');
      expect(error.status).toBe(500);
    });

    it('should throw ApiError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const error = await startAlexaAuth().catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Network error');
    });
  });

  describe('getAlexaAuthStatus', () => {
    it('should call GET /api/alexa-auth/status/:sessionId', async () => {
      const mockResponse = {
        status: 'active',
        completed: false,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getAlexaAuthStatus('proxy-session-xyz');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/alexa-auth/status/proxy-session-xyz', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return completed: true when authentication is done', async () => {
      const mockResponse = {
        status: 'completed',
        completed: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getAlexaAuthStatus('completed-session');

      expect(result.status).toBe('completed');
      expect(result.completed).toBe(true);
    });

    it('should return timeout status when session timed out', async () => {
      const mockResponse = {
        status: 'timeout',
        completed: false,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getAlexaAuthStatus('timeout-session');

      expect(result.status).toBe('timeout');
      expect(result.completed).toBe(false);
    });

    it('should return failed status when authentication failed', async () => {
      const mockResponse = {
        status: 'failed',
        completed: false,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getAlexaAuthStatus('failed-session');

      expect(result.status).toBe('failed');
      expect(result.completed).toBe(false);
    });

    it('should include Authorization header when token provider is set', async () => {
      setAuthTokenProvider(vi.fn().mockResolvedValue('firebase-status-token'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'active', completed: false }),
      });

      await getAlexaAuthStatus('session-id');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer firebase-status-token');
    });

    it('should throw ApiError on session not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        }),
      });

      const error = await getAlexaAuthStatus('nonexistent-session').catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.status).toBe(404);
    });

    it('should throw ApiError on auth error (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        }),
      });

      const error = await getAlexaAuthStatus('session-id').catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.status).toBe(401);
    });

    it('should throw ApiError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const error = await getAlexaAuthStatus('session-id').catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Network error');
    });
  });
});
