/**
 * Alexa Proxy Handler Tests
 *
 * Supertest-based HTTP endpoint tests for Alexa Proxy authentication API.
 * Tests cover:
 * - POST /api/alexa-auth/start (proxy session start with requireAuth)
 * - GET /api/alexa-auth/status/:sessionId (session status polling)
 * - Require Auth guard on all endpoints
 * - Session owner verification (other user's session access rejected)
 * - Error responses: 401, 404, 500
 * - proxyUrl format validation (design spec compliance)
 * - Error message propagation from AlexaProxyService
 * - Non-Error thrown exception handling
 * - Response body structure completeness
 *
 * Requirements: 1.1, 1.5, 5.3, 5.5
 * Tasks: 3.1, 3.4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createAlexaProxyRoutes } from './alexa-proxy-handler.js';
import type { AlexaProxyService, ProxySession, AlexaProxyError } from '../types/alexa-proxy-types.js';
import type { AuthenticatedUser } from '../types/auth-types.js';
import type { Result } from '../types/action-types.js';

// =============================================================================
// Mock helpers
// =============================================================================

/**
 * Create a mock AlexaProxyService with all methods as vi.fn()
 */
function createMockAlexaProxyService(): {
  [K in keyof AlexaProxyService]: ReturnType<typeof vi.fn>;
} {
  return {
    startProxySession: vi.fn(),
    getProxySession: vi.fn(),
    stopProxySession: vi.fn(),
  };
}

/**
 * Middleware that simulates an authenticated user (req.user set).
 */
function mockAuthMiddleware(user: AuthenticatedUser | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: AuthenticatedUser | null }).user = user;
    next();
  };
}

/**
 * Middleware that simulates the requireAuth guard:
 * If req.user is null, returns 401; otherwise passes through.
 */
function mockRequireAuthGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as unknown as { user: AuthenticatedUser | null }).user;
    if (user === null || user === undefined) {
      res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'このエンドポイントには認証が必要です。',
      });
      return;
    }
    next();
  };
}

const testUser: AuthenticatedUser = {
  uid: 'test-uid-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
};

const anotherUser: AuthenticatedUser = {
  uid: 'another-uid-456',
  email: 'another@example.com',
  displayName: 'Another User',
  photoURL: undefined,
};

// =============================================================================
// Tests
// =============================================================================

describe('Alexa Proxy Handler', () => {
  let app: Express;
  let mockProxyService: ReturnType<typeof createMockAlexaProxyService>;

  /**
   * Helper to create an Express app with authentication simulation.
   * @param user - The user to set on req.user (null for guest)
   */
  function createTestApp(user: AuthenticatedUser | null): Express {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(mockAuthMiddleware(user));
    testApp.use(mockRequireAuthGuard());
    testApp.use(
      '/api/alexa-auth',
      createAlexaProxyRoutes({ alexaProxyService: mockProxyService })
    );
    return testApp;
  }

  beforeEach(() => {
    mockProxyService = createMockAlexaProxyService();
    app = createTestApp(testUser);
  });

  // ===========================================================================
  // POST /api/alexa-auth/start
  // ===========================================================================

  describe('POST /api/alexa-auth/start', () => {
    it('should start a proxy session and return sessionId and proxyUrl', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-abc-123',
        uid: 'test-uid-123',
        proxyPort: 12345,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.startProxySession.mockResolvedValue({
        ok: true,
        value: proxySession,
      } satisfies Result<ProxySession, AlexaProxyError>);

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(response.body).toEqual({
        sessionId: 'session-abc-123',
        proxyUrl: '/api/alexa-auth/proxy/session-abc-123/',
      });
      expect(mockProxyService.startProxySession).toHaveBeenCalledWith('test-uid-123');
    });

    it('should use req.user.uid to start proxy session (user isolation)', async () => {
      const anotherApp = createTestApp(anotherUser);
      const proxySession: ProxySession = {
        sessionId: 'session-def-456',
        uid: 'another-uid-456',
        proxyPort: 54321,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.startProxySession.mockResolvedValue({
        ok: true,
        value: proxySession,
      });

      await request(anotherApp)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(mockProxyService.startProxySession).toHaveBeenCalledWith('another-uid-456');
    });

    it('should return 500 when proxy start fails', async () => {
      mockProxyService.startProxySession.mockResolvedValue({
        ok: false,
        error: {
          code: 'PROXY_START_FAILED',
          message: 'Proxyの起動に失敗しました: Connection refused',
        },
      } satisfies Result<ProxySession, AlexaProxyError>);

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body.error).toBe('PROXY_START_FAILED');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 500 when an unexpected error is thrown', async () => {
      mockProxyService.startProxySession.mockRejectedValue(new Error('Unexpected failure'));

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
      expect(response.body).toHaveProperty('message');
    });

    it('should return Content-Type: application/json', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-xyz',
        uid: 'test-uid-123',
        proxyPort: 9999,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.startProxySession.mockResolvedValue({
        ok: true,
        value: proxySession,
      });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // ===========================================================================
  // GET /api/alexa-auth/status/:sessionId
  // ===========================================================================

  describe('GET /api/alexa-auth/status/:sessionId', () => {
    it('should return session status with completed: false when active', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-abc-123',
        uid: 'test-uid-123',
        proxyPort: 12345,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-abc-123')
        .expect(200);

      expect(response.body).toEqual({
        status: 'active',
        completed: false,
      });
      expect(mockProxyService.getProxySession).toHaveBeenCalledWith('session-abc-123');
    });

    it('should return completed: true when status is completed', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-abc-123',
        uid: 'test-uid-123',
        proxyPort: 12345,
        status: 'completed',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-abc-123')
        .expect(200);

      expect(response.body).toEqual({
        status: 'completed',
        completed: true,
      });
    });

    it('should return completed: false when status is failed', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-abc-123',
        uid: 'test-uid-123',
        proxyPort: 12345,
        status: 'failed',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-abc-123')
        .expect(200);

      expect(response.body).toEqual({
        status: 'failed',
        completed: false,
      });
    });

    it('should return completed: false when status is timeout', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-abc-123',
        uid: 'test-uid-123',
        proxyPort: 12345,
        status: 'timeout',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-abc-123')
        .expect(200);

      expect(response.body).toEqual({
        status: 'timeout',
        completed: false,
      });
    });

    it('should return 404 when session not found', async () => {
      mockProxyService.getProxySession.mockReturnValue(undefined);

      const response = await request(app)
        .get('/api/alexa-auth/status/nonexistent-session')
        .expect(404);

      expect(response.body.error).toBe('SESSION_NOT_FOUND');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 401 when session belongs to another user', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-other-user',
        uid: 'another-uid-456',
        proxyPort: 12345,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-other-user')
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body).toHaveProperty('message');
    });

    it('should return Content-Type: application/json', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-abc-123',
        uid: 'test-uid-123',
        proxyPort: 12345,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-abc-123')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // ===========================================================================
  // Require Auth Guard (all endpoints)
  // ===========================================================================

  describe('Require Auth guard', () => {
    let guestApp: Express;

    beforeEach(() => {
      guestApp = createTestApp(null);
    });

    it('should return 401 for POST /api/alexa-auth/start without auth', async () => {
      const response = await request(guestApp)
        .post('/api/alexa-auth/start')
        .expect(401);

      expect(response.body.error).toBe('AUTH_REQUIRED');
      expect(mockProxyService.startProxySession).not.toHaveBeenCalled();
    });

    it('should return 401 for GET /api/alexa-auth/status/:sessionId without auth', async () => {
      const response = await request(guestApp)
        .get('/api/alexa-auth/status/some-session')
        .expect(401);

      expect(response.body.error).toBe('AUTH_REQUIRED');
      expect(mockProxyService.getProxySession).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error code to HTTP status mapping
  // ===========================================================================

  describe('Error code to HTTP status mapping', () => {
    it('should map SESSION_NOT_FOUND to 404', async () => {
      mockProxyService.startProxySession.mockResolvedValue({
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        },
      });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(404);

      expect(response.body.error).toBe('SESSION_NOT_FOUND');
    });

    it('should map SAVE_FAILED to 500', async () => {
      mockProxyService.startProxySession.mockResolvedValue({
        ok: false,
        error: {
          code: 'SAVE_FAILED',
          message: 'Save failed',
        },
      });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body.error).toBe('SAVE_FAILED');
    });

    it('should map TIMEOUT to 500', async () => {
      mockProxyService.startProxySession.mockResolvedValue({
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: 'Timeout',
        },
      });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body.error).toBe('TIMEOUT');
    });
  });

  // ===========================================================================
  // Task 3.4: Comprehensive additional tests
  // ===========================================================================

  describe('POST /api/alexa-auth/start - comprehensive coverage', () => {
    it('should return proxyUrl matching design spec pattern /api/alexa-auth/proxy/{sessionId}/', async () => {
      const proxySession: ProxySession = {
        sessionId: 'cuid2-style-id-xyz789',
        uid: 'test-uid-123',
        proxyPort: 45678,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.startProxySession.mockResolvedValue({
        ok: true,
        value: proxySession,
      });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      // proxyUrl must follow the design spec pattern with trailing slash
      expect(response.body.proxyUrl).toBe('/api/alexa-auth/proxy/cuid2-style-id-xyz789/');
      expect(response.body.proxyUrl).toMatch(/^\/api\/alexa-auth\/proxy\/[^/]+\/$/);
    });

    it('should return only sessionId and proxyUrl in success response (no extra fields)', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-clean',
        uid: 'test-uid-123',
        proxyPort: 11111,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.startProxySession.mockResolvedValue({
        ok: true,
        value: proxySession,
      });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      // Response should contain exactly sessionId and proxyUrl, nothing else
      // (no proxyPort or uid leak)
      expect(Object.keys(response.body)).toEqual(['sessionId', 'proxyUrl']);
      expect(response.body).not.toHaveProperty('proxyPort');
      expect(response.body).not.toHaveProperty('uid');
      expect(response.body).not.toHaveProperty('status');
    });

    it('should propagate error message from AlexaProxyService in error responses', async () => {
      const errorMessage = 'Proxyの起動に失敗しました: Port allocation failed';
      mockProxyService.startProxySession.mockResolvedValue({
        ok: false,
        error: {
          code: 'PROXY_START_FAILED',
          message: errorMessage,
        },
      });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body.message).toBe(errorMessage);
    });

    it('should handle non-Error thrown exceptions with a generic error message', async () => {
      // When a non-Error value is thrown (e.g., string), the handler should
      // return a generic Japanese error message instead of the thrown value
      mockProxyService.startProxySession.mockRejectedValue('string-error-not-Error-instance');

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
      expect(response.body.message).toBe('サーバー内部エラーが発生しました。');
    });

    it('should include Error.message in 500 response for Error instances', async () => {
      mockProxyService.startProxySession.mockRejectedValue(
        new Error('Database connection lost')
      );

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
      expect(response.body.message).toBe('Database connection lost');
    });

    it('should call startProxySession exactly once per request', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-once',
        uid: 'test-uid-123',
        proxyPort: 22222,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.startProxySession.mockResolvedValue({
        ok: true,
        value: proxySession,
      });

      await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(mockProxyService.startProxySession).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/alexa-auth/status/:sessionId - comprehensive coverage', () => {
    it('should include sessionId in 404 error message for traceability', async () => {
      mockProxyService.getProxySession.mockReturnValue(undefined);

      const response = await request(app)
        .get('/api/alexa-auth/status/trace-session-id-999')
        .expect(404);

      expect(response.body.error).toBe('SESSION_NOT_FOUND');
      expect(response.body.message).toContain('trace-session-id-999');
    });

    it('should return only status and completed fields in success response', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-fields',
        uid: 'test-uid-123',
        proxyPort: 33333,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-fields')
        .expect(200);

      // Response should contain exactly status and completed, no extra info leaked
      expect(Object.keys(response.body)).toEqual(['status', 'completed']);
      expect(response.body).not.toHaveProperty('proxyPort');
      expect(response.body).not.toHaveProperty('uid');
      expect(response.body).not.toHaveProperty('sessionId');
    });

    it('should reject access from another user with specific UNAUTHORIZED message', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-owner-check',
        uid: 'another-uid-456',
        proxyPort: 44444,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-owner-check')
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('他のユーザーのセッションにはアクセスできません。');
    });

    it('should pass different sessionId values correctly to getProxySession', async () => {
      const ids = ['sess-aaa', 'sess-bbb', 'sess-ccc'];

      for (const id of ids) {
        const proxySession: ProxySession = {
          sessionId: id,
          uid: 'test-uid-123',
          proxyPort: 55555,
          status: 'active',
          createdAt: '2026-02-14T12:00:00.000Z',
        };
        mockProxyService.getProxySession.mockReturnValue(proxySession);

        await request(app)
          .get(`/api/alexa-auth/status/${id}`)
          .expect(200);

        expect(mockProxyService.getProxySession).toHaveBeenCalledWith(id);
      }
    });

    it('should allow session owner access from a different user app instance', async () => {
      // Create an app for anotherUser, and verify they CAN access their own session
      const anotherApp = createTestApp(anotherUser);

      const proxySession: ProxySession = {
        sessionId: 'session-another-owns',
        uid: 'another-uid-456',
        proxyPort: 66666,
        status: 'completed',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(anotherApp)
        .get('/api/alexa-auth/status/session-another-owns')
        .expect(200);

      expect(response.body.status).toBe('completed');
      expect(response.body.completed).toBe(true);
    });
  });

  describe('Require Auth guard - comprehensive coverage', () => {
    let guestApp: Express;

    beforeEach(() => {
      guestApp = createTestApp(null);
    });

    it('should not call any service methods when auth fails for POST /start', async () => {
      await request(guestApp)
        .post('/api/alexa-auth/start')
        .expect(401);

      expect(mockProxyService.startProxySession).not.toHaveBeenCalled();
      expect(mockProxyService.getProxySession).not.toHaveBeenCalled();
      expect(mockProxyService.stopProxySession).not.toHaveBeenCalled();
    });

    it('should not call any service methods when auth fails for GET /status', async () => {
      await request(guestApp)
        .get('/api/alexa-auth/status/some-session')
        .expect(401);

      expect(mockProxyService.startProxySession).not.toHaveBeenCalled();
      expect(mockProxyService.getProxySession).not.toHaveBeenCalled();
      expect(mockProxyService.stopProxySession).not.toHaveBeenCalled();
    });
  });

  describe('Error response structure consistency', () => {
    it('should always include error and message fields in error responses (500 service error)', async () => {
      mockProxyService.startProxySession.mockResolvedValue({
        ok: false,
        error: {
          code: 'PROXY_START_FAILED',
          message: 'Port allocation failed',
        },
      });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });

    it('should always include error and message fields in error responses (500 thrown)', async () => {
      mockProxyService.startProxySession.mockRejectedValue(new Error('crash'));

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });

    it('should always include error and message fields in 404 session not found', async () => {
      mockProxyService.getProxySession.mockReturnValue(undefined);

      const response = await request(app)
        .get('/api/alexa-auth/status/not-exist')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });

    it('should always include error and message fields in 401 unauthorized', async () => {
      const proxySession: ProxySession = {
        sessionId: 'session-unauth',
        uid: 'another-uid-456',
        proxyPort: 77777,
        status: 'active',
        createdAt: '2026-02-14T12:00:00.000Z',
      };
      mockProxyService.getProxySession.mockReturnValue(proxySession);

      const response = await request(app)
        .get('/api/alexa-auth/status/session-unauth')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });
  });
});
