/**
 * Credential Handler Tests
 *
 * Supertest-based HTTP endpoint tests for credential management API.
 * Tests cover:
 * - PUT /api/credentials/:service (token save with validation)
 * - GET /api/credentials/status (credential status without raw tokens)
 * - DELETE /api/credentials/:service (token deletion)
 * - Require Auth guard on all endpoints
 * - User isolation via req.user.uid
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 7.4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createCredentialRoutes } from './credential-handler.js';
import type { CredentialService } from '../services/credential-service.js';
import type { AuthenticatedUser } from '../types/auth-types.js';
import type { CredentialStatus, CredentialError } from '../types/auth-types.js';
import type { Result } from '../types/action-types.js';

// =============================================================================
// Mock helpers
// =============================================================================

/**
 * Create a mock CredentialService with all methods as vi.fn()
 */
function createMockCredentialService(): {
  [K in keyof CredentialService]: ReturnType<typeof vi.fn>;
} {
  return {
    saveToken: vi.fn(),
    getDecryptedToken: vi.fn(),
    getStatus: vi.fn(),
    deleteToken: vi.fn(),
    deleteAllForUser: vi.fn(),
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

describe('Credential Handler', () => {
  let app: Express;
  let mockCredentialService: ReturnType<typeof createMockCredentialService>;

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
      '/api/credentials',
      createCredentialRoutes({ credentialService: mockCredentialService })
    );
    return testApp;
  }

  beforeEach(() => {
    mockCredentialService = createMockCredentialService();
    app = createTestApp(testUser);
  });

  // ===========================================================================
  // PUT /api/credentials/:service
  // ===========================================================================

  describe('PUT /api/credentials/:service', () => {
    it('should save a token and return ok: true', async () => {
      mockCredentialService.saveToken.mockResolvedValue({
        ok: true,
        value: undefined,
      } satisfies Result<void, CredentialError>);

      const response = await request(app)
        .put('/api/credentials/nature-remo')
        .send({ token: 'test-token-value' })
        .expect(200);

      expect(response.body).toEqual({ ok: true });
      expect(mockCredentialService.saveToken).toHaveBeenCalledWith(
        'test-uid-123',
        'nature-remo',
        'test-token-value'
      );
    });

    it('should use req.user.uid to call credential service (user isolation)', async () => {
      const anotherApp = createTestApp(anotherUser);
      mockCredentialService.saveToken.mockResolvedValue({
        ok: true,
        value: undefined,
      });

      await request(anotherApp)
        .put('/api/credentials/nature-remo')
        .send({ token: 'another-token' })
        .expect(200);

      expect(mockCredentialService.saveToken).toHaveBeenCalledWith(
        'another-uid-456',
        'nature-remo',
        'another-token'
      );
    });

    it('should return 400 when token is empty string', async () => {
      const response = await request(app)
        .put('/api/credentials/nature-remo')
        .send({ token: '' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('INVALID_INPUT');
      expect(mockCredentialService.saveToken).not.toHaveBeenCalled();
    });

    it('should return 400 when token is missing from body', async () => {
      const response = await request(app)
        .put('/api/credentials/nature-remo')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('INVALID_INPUT');
      expect(mockCredentialService.saveToken).not.toHaveBeenCalled();
    });

    it('should return 400 when token is whitespace only', async () => {
      const response = await request(app)
        .put('/api/credentials/nature-remo')
        .send({ token: '   ' })
        .expect(400);

      expect(response.body.error).toBe('INVALID_INPUT');
      expect(mockCredentialService.saveToken).not.toHaveBeenCalled();
    });

    it('should return 400 when token is not a string', async () => {
      const response = await request(app)
        .put('/api/credentials/nature-remo')
        .send({ token: 12345 })
        .expect(400);

      expect(response.body.error).toBe('INVALID_INPUT');
      expect(mockCredentialService.saveToken).not.toHaveBeenCalled();
    });

    it('should return 500 when credential service returns error', async () => {
      mockCredentialService.saveToken.mockResolvedValue({
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message: 'Firestoreへの書き込みに失敗しました',
        },
      } satisfies Result<void, CredentialError>);

      const response = await request(app)
        .put('/api/credentials/nature-remo')
        .send({ token: 'valid-token' })
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });

    it('should return Content-Type: application/json', async () => {
      mockCredentialService.saveToken.mockResolvedValue({
        ok: true,
        value: undefined,
      });

      const response = await request(app)
        .put('/api/credentials/nature-remo')
        .send({ token: 'test-token' })
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // ===========================================================================
  // GET /api/credentials/status
  // ===========================================================================

  describe('GET /api/credentials/status', () => {
    it('should return credential statuses without raw token values', async () => {
      const statuses: readonly CredentialStatus[] = [
        { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T12:00:00.000Z' },
      ];
      mockCredentialService.getStatus.mockResolvedValue({
        ok: true,
        value: statuses,
      } satisfies Result<readonly CredentialStatus[], CredentialError>);

      const response = await request(app)
        .get('/api/credentials/status')
        .expect(200);

      expect(response.body).toEqual({
        credentials: [
          { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T12:00:00.000Z' },
        ],
      });
      // Verify no token field is present in the response
      expect(response.body.credentials[0]).not.toHaveProperty('token');
      expect(response.body.credentials[0]).not.toHaveProperty('encryptedToken');
    });

    it('should use req.user.uid to fetch status (user isolation)', async () => {
      mockCredentialService.getStatus.mockResolvedValue({
        ok: true,
        value: [],
      });

      await request(app).get('/api/credentials/status').expect(200);

      expect(mockCredentialService.getStatus).toHaveBeenCalledWith('test-uid-123');
    });

    it('should return empty credentials array when no credentials configured', async () => {
      mockCredentialService.getStatus.mockResolvedValue({
        ok: true,
        value: [],
      });

      const response = await request(app)
        .get('/api/credentials/status')
        .expect(200);

      expect(response.body).toEqual({ credentials: [] });
    });

    it('should return multiple credential statuses', async () => {
      const statuses: readonly CredentialStatus[] = [
        { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T12:00:00.000Z' },
        { service: 'alexa', configured: true, updatedAt: '2026-02-14T13:00:00.000Z' },
      ];
      mockCredentialService.getStatus.mockResolvedValue({
        ok: true,
        value: statuses,
      });

      const response = await request(app)
        .get('/api/credentials/status')
        .expect(200);

      expect(response.body.credentials).toHaveLength(2);
    });

    it('should return 500 when credential service returns error', async () => {
      mockCredentialService.getStatus.mockResolvedValue({
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message: 'Firestoreからのステータス取得に失敗しました',
        },
      });

      const response = await request(app)
        .get('/api/credentials/status')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });

    it('should return Content-Type: application/json', async () => {
      mockCredentialService.getStatus.mockResolvedValue({
        ok: true,
        value: [],
      });

      const response = await request(app)
        .get('/api/credentials/status')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // ===========================================================================
  // DELETE /api/credentials/:service
  // ===========================================================================

  describe('DELETE /api/credentials/:service', () => {
    it('should delete a credential and return ok: true', async () => {
      mockCredentialService.deleteToken.mockResolvedValue({
        ok: true,
        value: undefined,
      } satisfies Result<void, CredentialError>);

      const response = await request(app)
        .delete('/api/credentials/nature-remo')
        .expect(200);

      expect(response.body).toEqual({ ok: true });
      expect(mockCredentialService.deleteToken).toHaveBeenCalledWith(
        'test-uid-123',
        'nature-remo'
      );
    });

    it('should use req.user.uid to delete credential (user isolation)', async () => {
      const anotherApp = createTestApp(anotherUser);
      mockCredentialService.deleteToken.mockResolvedValue({
        ok: true,
        value: undefined,
      });

      await request(anotherApp)
        .delete('/api/credentials/nature-remo')
        .expect(200);

      expect(mockCredentialService.deleteToken).toHaveBeenCalledWith(
        'another-uid-456',
        'nature-remo'
      );
    });

    it('should return 500 when credential service returns FIRESTORE_ERROR', async () => {
      mockCredentialService.deleteToken.mockResolvedValue({
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message: 'Firestoreからの削除に失敗しました',
        },
      });

      const response = await request(app)
        .delete('/api/credentials/nature-remo')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });

    it('should return Content-Type: application/json', async () => {
      mockCredentialService.deleteToken.mockResolvedValue({
        ok: true,
        value: undefined,
      });

      const response = await request(app)
        .delete('/api/credentials/nature-remo')
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

    it('should return 401 for PUT /api/credentials/:service without auth', async () => {
      const response = await request(guestApp)
        .put('/api/credentials/nature-remo')
        .send({ token: 'some-token' })
        .expect(401);

      expect(response.body.error).toBe('AUTH_REQUIRED');
      expect(mockCredentialService.saveToken).not.toHaveBeenCalled();
    });

    it('should return 401 for GET /api/credentials/status without auth', async () => {
      const response = await request(guestApp)
        .get('/api/credentials/status')
        .expect(401);

      expect(response.body.error).toBe('AUTH_REQUIRED');
      expect(mockCredentialService.getStatus).not.toHaveBeenCalled();
    });

    it('should return 401 for DELETE /api/credentials/:service without auth', async () => {
      const response = await request(guestApp)
        .delete('/api/credentials/nature-remo')
        .expect(401);

      expect(response.body.error).toBe('AUTH_REQUIRED');
      expect(mockCredentialService.deleteToken).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error handling (unexpected exceptions)
  // ===========================================================================

  describe('Error handling', () => {
    it('should return 500 when an unexpected error is thrown in PUT', async () => {
      mockCredentialService.saveToken.mockRejectedValue(new Error('Unexpected failure'));

      const response = await request(app)
        .put('/api/credentials/nature-remo')
        .send({ token: 'valid-token' })
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 500 when an unexpected error is thrown in GET status', async () => {
      mockCredentialService.getStatus.mockRejectedValue(new Error('Unexpected failure'));

      const response = await request(app)
        .get('/api/credentials/status')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });

    it('should return 500 when an unexpected error is thrown in DELETE', async () => {
      mockCredentialService.deleteToken.mockRejectedValue(new Error('Unexpected failure'));

      const response = await request(app)
        .delete('/api/credentials/nature-remo')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });
  });
});
