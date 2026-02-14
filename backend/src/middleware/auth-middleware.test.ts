/**
 * Tests for Auth Middleware (Optional Auth + Require Auth Guard)
 *
 * Optional Auth validates three key scenarios:
 * 1. Valid token: user info attached to req.user
 * 2. No token: req.user = null (guest mode), request passes through
 * 3. Invalid/expired token: 401 response with appropriate error code
 *
 * Require Auth Guard validates:
 * 1. Authenticated user (req.user set): passes through to next handler
 * 2. Guest user (req.user === null): returns 401 AUTH_REQUIRED
 * 3. Undefined user (req.user not set): returns 401 AUTH_REQUIRED
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import { createAuthMiddleware } from './auth-middleware.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockAuth(overrides: Partial<Auth> = {}): Auth {
  return {
    verifyIdToken: vi.fn(),
    ...overrides,
  } as unknown as Auth;
}

function createMockRequest(headers: Record<string, string> = {}): Request {
  return {
    headers,
  } as unknown as Request;
}

function createMockResponse(): Response & {
  statusCode: number;
  body: unknown;
} {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function createMockNext(): NextFunction & { called: boolean } {
  const next = vi.fn() as unknown as NextFunction & { called: boolean };
  Object.defineProperty(next, 'called', {
    get() {
      return (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0;
    },
  });
  return next;
}

const VALID_DECODED_TOKEN: DecodedIdToken = {
  uid: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg',
  aud: 'test-project',
  auth_time: 1000,
  exp: 9999999999,
  firebase: {
    identities: {},
    sign_in_provider: 'google.com',
  },
  iat: 1000,
  iss: 'https://securetoken.google.com/test-project',
  sub: 'user-123',
};

// =============================================================================
// Tests
// =============================================================================

describe('auth-middleware', () => {
  let mockAuth: Auth;

  beforeEach(() => {
    mockAuth = createMockAuth();
    vi.clearAllMocks();
  });

  describe('createAuthMiddleware', () => {
    it('should return an object with createOptionalAuthMiddleware and createRequireAuthMiddleware', () => {
      const factory = createAuthMiddleware(mockAuth);

      expect(factory).toHaveProperty('createOptionalAuthMiddleware');
      expect(factory).toHaveProperty('createRequireAuthMiddleware');
      expect(typeof factory.createOptionalAuthMiddleware).toBe('function');
      expect(typeof factory.createRequireAuthMiddleware).toBe('function');
    });
  });

  describe('optionalAuthMiddleware', () => {
    describe('valid token', () => {
      it('should extract Bearer token from Authorization header and verify it', async () => {
        const verifyIdToken = vi.fn().mockResolvedValue(VALID_DECODED_TOKEN);
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer valid-token-123',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect(verifyIdToken).toHaveBeenCalledWith('valid-token-123');
      });

      it('should set req.user with decoded token information when token is valid', async () => {
        const verifyIdToken = vi.fn().mockResolvedValue(VALID_DECODED_TOKEN);
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer valid-token',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect((req as unknown as { user: unknown }).user).toEqual({
          uid: 'user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          photoURL: 'https://example.com/avatar.jpg',
        });
      });

      it('should call next() after setting req.user for valid token', async () => {
        const verifyIdToken = vi.fn().mockResolvedValue(VALID_DECODED_TOKEN);
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer valid-token',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect(next.called).toBe(true);
      });

      it('should handle decoded token with missing optional fields', async () => {
        // With exactOptionalPropertyTypes, optional fields must be omitted (not set to undefined)
        const { email: _e, name: _n, picture: _p, ...rest } =
          VALID_DECODED_TOKEN;
        const minimalToken: DecodedIdToken = rest;
        const verifyIdToken = vi.fn().mockResolvedValue(minimalToken);
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer valid-token',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect((req as unknown as { user: unknown }).user).toEqual({
          uid: 'user-123',
          email: undefined,
          displayName: undefined,
          photoURL: undefined,
        });
        expect(next.called).toBe(true);
      });
    });

    describe('no token (guest mode)', () => {
      it('should set req.user to null when no Authorization header is present', async () => {
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({});
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect((req as unknown as { user: unknown }).user).toBeNull();
      });

      it('should call next() for guest mode requests', async () => {
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({});
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect(next.called).toBe(true);
      });

      it('should not call verifyIdToken when no Authorization header exists', async () => {
        const verifyIdToken = vi.fn();
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({});
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect(verifyIdToken).not.toHaveBeenCalled();
      });

      it('should treat empty Authorization header as guest mode', async () => {
        const verifyIdToken = vi.fn();
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({ authorization: '' });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect((req as unknown as { user: unknown }).user).toBeNull();
        expect(next.called).toBe(true);
        expect(verifyIdToken).not.toHaveBeenCalled();
      });

      it('should treat non-Bearer Authorization header as guest mode', async () => {
        const verifyIdToken = vi.fn();
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({ authorization: 'Basic abc123' });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect((req as unknown as { user: unknown }).user).toBeNull();
        expect(next.called).toBe(true);
        expect(verifyIdToken).not.toHaveBeenCalled();
      });
    });

    describe('invalid/expired token', () => {
      it('should return 401 with TOKEN_EXPIRED error for expired tokens', async () => {
        const verifyIdToken = vi.fn().mockRejectedValue(
          Object.assign(new Error('Token expired'), {
            code: 'auth/id-token-expired',
          })
        );
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer expired-token',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({
          error: 'TOKEN_EXPIRED',
          message: expect.any(String),
        });
      });

      it('should return 401 with INVALID_TOKEN error for invalid tokens', async () => {
        const verifyIdToken = vi.fn().mockRejectedValue(
          Object.assign(new Error('Invalid argument'), {
            code: 'auth/argument-error',
          })
        );
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer invalid-token',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({
          error: 'INVALID_TOKEN',
          message: expect.any(String),
        });
      });

      it('should return 401 with INVALID_TOKEN for unknown auth errors', async () => {
        const verifyIdToken = vi.fn().mockRejectedValue(
          Object.assign(new Error('Unknown error'), {
            code: 'auth/unknown-error',
          })
        );
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer bad-token',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({
          error: 'INVALID_TOKEN',
          message: expect.any(String),
        });
      });

      it('should not call next() when token verification fails', async () => {
        const verifyIdToken = vi.fn().mockRejectedValue(
          Object.assign(new Error('Invalid'), {
            code: 'auth/argument-error',
          })
        );
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer bad-token',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        expect(next.called).toBe(false);
      });

      it('should handle Bearer token with empty value as invalid', async () => {
        const verifyIdToken = vi.fn().mockRejectedValue(
          Object.assign(new Error('Invalid argument'), {
            code: 'auth/argument-error',
          })
        );
        mockAuth = createMockAuth({ verifyIdToken });
        const { createOptionalAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createOptionalAuthMiddleware();

        const req = createMockRequest({
          authorization: 'Bearer ',
        });
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        // Empty Bearer token should be treated as guest mode (no token provided)
        expect((req as unknown as { user: unknown }).user).toBeNull();
        expect(next.called).toBe(true);
      });
    });
  });

  describe('requireAuthMiddleware', () => {
    describe('authenticated user', () => {
      it('should call next() when req.user is set with valid user info', () => {
        const { createRequireAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createRequireAuthMiddleware();

        const req = createMockRequest();
        (req as unknown as { user: { uid: string; email: string; displayName: string; photoURL: string } }).user = {
          uid: 'user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          photoURL: 'https://example.com/avatar.jpg',
        };
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next.called).toBe(true);
      });

      it('should not return any error response when user is authenticated', () => {
        const { createRequireAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createRequireAuthMiddleware();

        const req = createMockRequest();
        (req as unknown as { user: { uid: string } }).user = { uid: 'user-456' };
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(res.statusCode).toBe(200);
        expect(res.body).toBeUndefined();
      });
    });

    describe('guest user (req.user === null)', () => {
      it('should return 401 when req.user is null', () => {
        const { createRequireAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createRequireAuthMiddleware();

        const req = createMockRequest();
        (req as unknown as { user: null }).user = null;
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(res.statusCode).toBe(401);
      });

      it('should return AUTH_REQUIRED error code when req.user is null', () => {
        const { createRequireAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createRequireAuthMiddleware();

        const req = createMockRequest();
        (req as unknown as { user: null }).user = null;
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(res.body).toEqual({
          error: 'AUTH_REQUIRED',
          message: expect.any(String),
        });
      });

      it('should not call next() when req.user is null', () => {
        const { createRequireAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createRequireAuthMiddleware();

        const req = createMockRequest();
        (req as unknown as { user: null }).user = null;
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next.called).toBe(false);
      });
    });

    describe('undefined user (req.user not set)', () => {
      it('should return 401 when req.user is undefined (middleware not applied before)', () => {
        const { createRequireAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createRequireAuthMiddleware();

        // Do NOT set req.user -- simulating require auth guard without optional auth middleware
        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({
          error: 'AUTH_REQUIRED',
          message: expect.any(String),
        });
      });

      it('should not call next() when req.user is undefined', () => {
        const { createRequireAuthMiddleware } = createAuthMiddleware(mockAuth);
        const middleware = createRequireAuthMiddleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next.called).toBe(false);
      });
    });
  });
});
