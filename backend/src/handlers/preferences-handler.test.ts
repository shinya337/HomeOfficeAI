/**
 * Preferences Handler Tests
 *
 * Supertest-based HTTP endpoint tests for user preferences API.
 * Tests cover:
 * - PUT /api/preferences (save with validation)
 * - GET /api/preferences (retrieve, null when not saved)
 * - Require Auth guard on all endpoints
 * - User isolation via req.user.uid
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createPreferencesRoutes } from './preferences-handler.js';
import type { PreferencesService } from '../services/preferences-service.js';
import type { AuthenticatedUser, UserPreferences, PreferencesError } from '../types/auth-types.js';
import type { Result } from '../types/action-types.js';

// =============================================================================
// Mock helpers
// =============================================================================

function createMockPreferencesService(): {
  [K in keyof PreferencesService]: ReturnType<typeof vi.fn>;
} {
  return {
    savePreferences: vi.fn(),
    getPreferences: vi.fn(),
  };
}

function mockAuthMiddleware(user: AuthenticatedUser | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: AuthenticatedUser | null }).user = user;
    next();
  };
}

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

describe('Preferences Handler', () => {
  let app: Express;
  let mockPreferencesService: ReturnType<typeof createMockPreferencesService>;

  function createTestApp(user: AuthenticatedUser | null): Express {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(mockAuthMiddleware(user));
    testApp.use(mockRequireAuthGuard());
    testApp.use(
      '/api/preferences',
      createPreferencesRoutes({ preferencesService: mockPreferencesService })
    );
    return testApp;
  }

  beforeEach(() => {
    mockPreferencesService = createMockPreferencesService();
    app = createTestApp(testUser);
  });

  // ===========================================================================
  // PUT /api/preferences
  // ===========================================================================

  describe('PUT /api/preferences', () => {
    it('should save preferences and return ok: true', async () => {
      mockPreferencesService.savePreferences.mockResolvedValue({
        ok: true,
        value: undefined,
      } satisfies Result<void, PreferencesError>);

      const response = await request(app)
        .put('/api/preferences')
        .send({ camera: true, voice: false, selectedDevices: [{ id: 'dev-1', type: 'LIGHT' }] })
        .expect(200);

      expect(response.body).toEqual({ ok: true });
      expect(mockPreferencesService.savePreferences).toHaveBeenCalledWith(
        'test-uid-123',
        {
          camera: true,
          voice: false,
          selectedDevices: [{ id: 'dev-1', type: 'LIGHT' }],
        }
      );
    });

    it('should use req.user.uid for user isolation', async () => {
      const anotherApp = createTestApp(anotherUser);
      mockPreferencesService.savePreferences.mockResolvedValue({
        ok: true,
        value: undefined,
      });

      await request(anotherApp)
        .put('/api/preferences')
        .send({ camera: false, voice: true, selectedDevices: [] })
        .expect(200);

      expect(mockPreferencesService.savePreferences).toHaveBeenCalledWith(
        'another-uid-456',
        expect.objectContaining({ camera: false })
      );
    });

    it('should return 400 when camera is missing', async () => {
      const response = await request(app)
        .put('/api/preferences')
        .send({ voice: true, selectedDevices: [] })
        .expect(400);

      expect(response.body.error).toBe('INVALID_INPUT');
      expect(mockPreferencesService.savePreferences).not.toHaveBeenCalled();
    });

    it('should return 400 when voice is missing', async () => {
      const response = await request(app)
        .put('/api/preferences')
        .send({ camera: true, selectedDevices: [] })
        .expect(400);

      expect(response.body.error).toBe('INVALID_INPUT');
    });

    it('should return 400 when selectedDevices is missing', async () => {
      const response = await request(app)
        .put('/api/preferences')
        .send({ camera: true, voice: true })
        .expect(400);

      expect(response.body.error).toBe('INVALID_INPUT');
    });

    it('should return 400 when camera is not boolean', async () => {
      const response = await request(app)
        .put('/api/preferences')
        .send({ camera: 'yes', voice: true, selectedDevices: [] })
        .expect(400);

      expect(response.body.error).toBe('INVALID_INPUT');
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app)
        .put('/api/preferences')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('INVALID_INPUT');
    });

    it('should return 500 when service returns error', async () => {
      mockPreferencesService.savePreferences.mockResolvedValue({
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message: '設定の保存に失敗しました',
        },
      } satisfies Result<void, PreferencesError>);

      const response = await request(app)
        .put('/api/preferences')
        .send({ camera: true, voice: true, selectedDevices: [] })
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });

    it('should return 500 when unexpected error is thrown', async () => {
      mockPreferencesService.savePreferences.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app)
        .put('/api/preferences')
        .send({ camera: true, voice: true, selectedDevices: [] })
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });

    it('should preserve allowedTools in selectedDevices', async () => {
      mockPreferencesService.savePreferences.mockResolvedValue({
        ok: true,
        value: undefined,
      });

      await request(app)
        .put('/api/preferences')
        .send({
          camera: true,
          voice: true,
          selectedDevices: [{ id: 'alexa-1', type: 'ALEXA', allowedTools: ['alexa_speak'] }],
        })
        .expect(200);

      expect(mockPreferencesService.savePreferences).toHaveBeenCalledWith(
        'test-uid-123',
        {
          camera: true,
          voice: true,
          selectedDevices: [{ id: 'alexa-1', type: 'ALEXA', allowedTools: ['alexa_speak'] }],
        }
      );
    });
  });

  // ===========================================================================
  // GET /api/preferences
  // ===========================================================================

  describe('GET /api/preferences', () => {
    it('should return preferences when saved', async () => {
      const prefs: UserPreferences = {
        camera: true,
        voice: false,
        selectedDevices: [{ id: 'dev-1', type: 'LIGHT' }],
        updatedAt: '2026-02-15T00:00:00.000Z',
      };
      mockPreferencesService.getPreferences.mockResolvedValue({
        ok: true,
        value: prefs,
      } satisfies Result<UserPreferences | null, PreferencesError>);

      const response = await request(app)
        .get('/api/preferences')
        .expect(200);

      expect(response.body).toEqual({ preferences: prefs });
    });

    it('should return null when no preferences saved', async () => {
      mockPreferencesService.getPreferences.mockResolvedValue({
        ok: true,
        value: null,
      });

      const response = await request(app)
        .get('/api/preferences')
        .expect(200);

      expect(response.body).toEqual({ preferences: null });
    });

    it('should use req.user.uid for user isolation', async () => {
      mockPreferencesService.getPreferences.mockResolvedValue({
        ok: true,
        value: null,
      });

      await request(app).get('/api/preferences').expect(200);

      expect(mockPreferencesService.getPreferences).toHaveBeenCalledWith('test-uid-123');
    });

    it('should return 500 when service returns error', async () => {
      mockPreferencesService.getPreferences.mockResolvedValue({
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message: '設定の取得に失敗しました',
        },
      });

      const response = await request(app)
        .get('/api/preferences')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });

    it('should return 500 when unexpected error is thrown', async () => {
      mockPreferencesService.getPreferences.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app)
        .get('/api/preferences')
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
    });
  });

  // ===========================================================================
  // Require Auth Guard
  // ===========================================================================

  describe('Require Auth guard', () => {
    let guestApp: Express;

    beforeEach(() => {
      guestApp = createTestApp(null);
    });

    it('should return 401 for PUT /api/preferences without auth', async () => {
      const response = await request(guestApp)
        .put('/api/preferences')
        .send({ camera: true, voice: true, selectedDevices: [] })
        .expect(401);

      expect(response.body.error).toBe('AUTH_REQUIRED');
      expect(mockPreferencesService.savePreferences).not.toHaveBeenCalled();
    });

    it('should return 401 for GET /api/preferences without auth', async () => {
      const response = await request(guestApp)
        .get('/api/preferences')
        .expect(401);

      expect(response.body.error).toBe('AUTH_REQUIRED');
      expect(mockPreferencesService.getPreferences).not.toHaveBeenCalled();
    });
  });
});
