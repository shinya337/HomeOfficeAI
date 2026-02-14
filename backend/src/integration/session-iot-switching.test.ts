/**
 * Integration Tests: Guest/Login Mode IoT Client Switching
 *
 * Tests the end-to-end flow of session start with different authentication
 * modes and IoT token configurations. Validates that the correct IoT services
 * (global vs user-specific) are bound to sessions.
 *
 * Task 10.1, Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { createSessionRoutes, type SessionRouteDependencies, type IoTServiceFactory } from '../handlers/session-handler.js';
import { createSessionManager, type SessionManagerService } from '../services/session-manager.js';
import type { CredentialService } from '../services/credential-service.js';
import type { AuthenticatedUser } from '../types/auth-types.js';
import type { Device } from '../types/device-types.js';
import type { SessionIoTServices } from '../types/session-types.js';

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Test devices available in the global cache
 */
const globalDevices: readonly Device[] = [
  { id: 'global-light-1', name: 'Global Living Light', type: 'LIGHT' },
  { id: 'global-ac-1', name: 'Global AC', type: 'AC' },
];

/**
 * Fake auth middleware that sets req.user for testing
 */
function fakeAuthMiddleware(user: AuthenticatedUser | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: AuthenticatedUser | null }).user = user;
    next();
  };
}

/**
 * Create mock LightService with tracking
 */
function createMockLightService(label: string) {
  return {
    label,
    control: vi.fn().mockResolvedValue({
      success: true,
      data: { applianceId: `${label}-light-1`, power: 'on' },
    }),
    sendNamedSignal: vi.fn().mockResolvedValue({
      success: true,
      data: { applianceId: `${label}-light-1`, signalName: 'test', success: true },
    }),
  };
}

/**
 * Create mock AirconService with tracking
 */
function createMockAirconService(label: string) {
  return {
    label,
    setTemperature: vi.fn().mockResolvedValue({
      success: true,
      data: { applianceId: `${label}-ac-1`, temperature: 25 },
    }),
    powerOff: vi.fn().mockResolvedValue({
      success: true,
      data: { applianceId: `${label}-ac-1` },
    }),
  };
}

/**
 * Create mock CredentialService with configurable behavior
 */
function createMockCredentialService(overrides?: Partial<CredentialService>): CredentialService {
  return {
    getDecryptedToken: vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'not found' },
    }),
    saveToken: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    getStatus: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    deleteToken: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    deleteAllForUser: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    ...overrides,
  };
}

/**
 * Test user fixtures
 */
const userAlice: AuthenticatedUser = {
  uid: 'alice-uid-001',
  email: 'alice@example.com',
  displayName: 'Alice',
  photoURL: undefined,
};

const userBob: AuthenticatedUser = {
  uid: 'bob-uid-002',
  email: 'bob@example.com',
  displayName: 'Bob',
  photoURL: undefined,
};

/**
 * Build a test Express app with full session + auth + credential integration
 */
function createIntegrationApp(options: {
  user: AuthenticatedUser | null;
  sessionManager: SessionManagerService;
  credentialService: CredentialService;
  iotServiceFactory: IoTServiceFactory;
}): Express {
  const app = express();
  app.use(express.json());
  app.use(fakeAuthMiddleware(options.user));

  const deps: SessionRouteDependencies = {
    sessionManager: options.sessionManager,
    getCachedDevices: () => globalDevices,
    credentialService: options.credentialService,
    iotServiceFactory: options.iotServiceFactory,
  };
  app.use('/api/session', createSessionRoutes(deps));
  return app;
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration: Guest/Login Mode Session IoT Switching', () => {
  let sessionManager: SessionManagerService;

  beforeEach(() => {
    sessionManager = createSessionManager();
  });

  // ---------------------------------------------------------------------------
  // Requirement 6.1: Guest mode uses global token
  // ---------------------------------------------------------------------------
  describe('Guest mode: global token for IoT control (Req 6.1)', () => {
    it('should start session without calling credentialService or iotServiceFactory', async () => {
      const credentialService = createMockCredentialService();
      const iotServiceFactory: IoTServiceFactory = vi.fn();

      const app = createIntegrationApp({
        user: null,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['global-light-1', 'global-ac-1'] })
        .expect(200);

      // Session should be active
      expect(response.body.status).toBe('active');
      expect(response.body).toHaveProperty('sessionId');

      // Guest mode: no credential lookup, no factory call
      expect(credentialService.getDecryptedToken).not.toHaveBeenCalled();
      expect(iotServiceFactory).not.toHaveBeenCalled();

      // Session should have no user-specific IoT services (uses global fallback)
      const sessionId = response.body.sessionId as string;
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeUndefined();

      // Session uid should be null
      const session = sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.uid).toBeNull();
    });

    it('should allow IoT device control via session with global services', async () => {
      const credentialService = createMockCredentialService();
      const iotServiceFactory: IoTServiceFactory = vi.fn();

      const app = createIntegrationApp({
        user: null,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['global-light-1'] })
        .expect(200);

      // Verify allowed devices are in the response
      expect(response.body.allowedDevices).toHaveLength(1);
      expect(response.body.allowedDevices[0]).toEqual({
        id: 'global-light-1',
        type: 'LIGHT',
      });

      // hasIoTServices should be false (no user-specific services)
      const session = sessionManager.getSession(response.body.sessionId as string);
      expect(session!.hasIoTServices).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 6.2: Login mode with token uses user's IoT services
  // ---------------------------------------------------------------------------
  describe('Login mode (token configured): user IoT services (Req 6.2)', () => {
    it('should create user-specific IoT services when user has a stored token', async () => {
      const userLightService = createMockLightService('alice');
      const userAirconService = createMockAirconService('alice');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'alice-nature-remo-token-secret',
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: userLightService,
          airconService: userAirconService,
        } satisfies SessionIoTServices,
      });

      const app = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['global-light-1', 'global-ac-1'] })
        .expect(200);

      expect(response.body.status).toBe('active');

      // Credential service should be called with Alice's uid
      expect(credentialService.getDecryptedToken).toHaveBeenCalledWith(
        'alice-uid-001',
        'nature-remo'
      );

      // Factory should be called with the decrypted user token
      expect(iotServiceFactory).toHaveBeenCalledWith('alice-nature-remo-token-secret');

      // Session should have user-specific IoT services bound
      const sessionId = response.body.sessionId as string;
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices!.lightService).toBe(userLightService);
      expect(iotServices!.airconService).toBe(userAirconService);

      // Session uid should match Alice
      const session = sessionManager.getSession(sessionId);
      expect(session!.uid).toBe('alice-uid-001');
      expect(session!.hasIoTServices).toBe(true);
    });

    it('should return user devices from the user token (Req 6.4)', async () => {
      const userLightService = createMockLightService('alice');
      const userAirconService = createMockAirconService('alice');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'alice-token',
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: userLightService,
          airconService: userAirconService,
        },
      });

      const app = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['global-light-1'] })
        .expect(200);

      // The session has user-specific IoT services, so device control
      // should use the user's services, not global
      const sessionId = response.body.sessionId as string;
      const iotServices = sessionManager.getSessionIoTServices(sessionId);

      // Verify user-specific light service is the one bound
      expect(iotServices!.lightService).toBe(userLightService);
      expect((iotServices!.lightService as unknown as { label: string }).label).toBe('alice');
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 6.3: Login mode without token falls back to global
  // ---------------------------------------------------------------------------
  describe('Login mode (token not configured): fallback to global (Req 6.3)', () => {
    it('should fallback to global IoT services when user has no stored token', async () => {
      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'クレデンシャルが見つかりません: nature-remo' },
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();

      const app = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['global-light-1'] })
        .expect(200);

      expect(response.body.status).toBe('active');

      // Credential service was called but returned NOT_FOUND
      expect(credentialService.getDecryptedToken).toHaveBeenCalledWith(
        'alice-uid-001',
        'nature-remo'
      );

      // Factory should NOT have been called (no token to create services with)
      expect(iotServiceFactory).not.toHaveBeenCalled();

      // Session should have no user-specific IoT services (global fallback)
      const sessionId = response.body.sessionId as string;
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeUndefined();

      // Session uid should still be set (authenticated, just no token)
      const session = sessionManager.getSession(sessionId);
      expect(session!.uid).toBe('alice-uid-001');
      expect(session!.hasIoTServices).toBe(false);
    });

    it('should also fallback when Firestore returns an error', async () => {
      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'FIRESTORE_ERROR', message: 'Firestore接続エラー' },
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();

      const app = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .expect(200);

      // Should succeed with global fallback, not abort
      expect(response.body.status).toBe('active');
      expect(iotServiceFactory).not.toHaveBeenCalled();

      const sessionId = response.body.sessionId as string;
      expect(sessionManager.getSessionIoTServices(sessionId)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 6.5: Invalid user token returns error, no fallback
  // ---------------------------------------------------------------------------
  describe('Invalid user token: error without fallback (Req 6.5)', () => {
    it('should return 400 error and NOT start session when user token is invalid', async () => {
      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'invalid-nature-remo-token',
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Nature Remo APIエラー: 401 Unauthorized',
        },
      });

      const app = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['global-light-1'] })
        .expect(400);

      // Error response should indicate invalid IoT token
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('INVALID_IOT_TOKEN');
      expect(response.body.error.message).toContain('Nature Remo');

      // No session should have been created
      expect(sessionManager.getStatus()).toBeNull();
    });

    it('should not fallback to global when token is invalid', async () => {
      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'bad-token',
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Nature Remo token rejected',
        },
      });

      const app = createIntegrationApp({
        user: userBob,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_IOT_TOKEN');

      // Verify factory was called (attempted to create services)
      expect(iotServiceFactory).toHaveBeenCalledWith('bad-token');

      // No active session should exist
      expect(sessionManager.hasActiveSession()).toBe(false);
    });

    it('should return error message from IoT service factory in the response', async () => {
      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'expired-token',
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'トークンの有効期限が切れています。Nature Remoの設定画面から再発行してください。',
        },
      });

      const app = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      const response = await request(app)
        .post('/api/session/start')
        .expect(400);

      // The error message from the factory should be passed through
      expect(response.body.error.message).toContain('トークンの有効期限');
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-session: independent sessions (Req 6.1, 6.2, 6.3)
  // ---------------------------------------------------------------------------
  describe('Multi-session: independent sessions operate concurrently', () => {
    it('should support two different users with independent IoT services', async () => {
      // --- Alice: has a valid token, gets user-specific IoT services ---
      const aliceLightService = createMockLightService('alice');
      const aliceAirconService = createMockAirconService('alice');

      const aliceCredentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'alice-token',
        }),
      });

      const aliceIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: aliceLightService,
          airconService: aliceAirconService,
        },
      });

      const aliceApp = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService: aliceCredentialService,
        iotServiceFactory: aliceIoTFactory,
      });

      // --- Bob: no token, falls back to global ---
      const bobCredentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'not found' },
        }),
      });

      const bobIoTFactory: IoTServiceFactory = vi.fn();

      const bobApp = createIntegrationApp({
        user: userBob,
        sessionManager,
        credentialService: bobCredentialService,
        iotServiceFactory: bobIoTFactory,
      });

      // Start Alice's session
      const aliceResponse = await request(aliceApp)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['global-light-1'] })
        .expect(200);

      const aliceSessionId = aliceResponse.body.sessionId as string;

      // Start Bob's session
      const bobResponse = await request(bobApp)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['global-ac-1'] })
        .expect(200);

      const bobSessionId = bobResponse.body.sessionId as string;

      // Both sessions should be active
      expect(aliceSessionId).not.toBe(bobSessionId);
      expect(sessionManager.getSession(aliceSessionId)).toBeDefined();
      expect(sessionManager.getSession(bobSessionId)).toBeDefined();

      // Alice's session should have user-specific IoT services
      const aliceIoT = sessionManager.getSessionIoTServices(aliceSessionId);
      expect(aliceIoT).toBeDefined();
      expect(aliceIoT!.lightService).toBe(aliceLightService);
      expect(aliceIoT!.airconService).toBe(aliceAirconService);

      // Bob's session should have NO user-specific IoT services (global fallback)
      const bobIoT = sessionManager.getSessionIoTServices(bobSessionId);
      expect(bobIoT).toBeUndefined();

      // Verify session uid assignments
      expect(sessionManager.getSession(aliceSessionId)!.uid).toBe('alice-uid-001');
      expect(sessionManager.getSession(bobSessionId)!.uid).toBe('bob-uid-002');
    });

    it('should support guest and authenticated sessions simultaneously', async () => {
      const userLightService = createMockLightService('alice');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'alice-token',
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: userLightService,
          airconService: undefined,
        },
      });

      // Guest app
      const guestApp = createIntegrationApp({
        user: null,
        sessionManager,
        credentialService: createMockCredentialService(),
        iotServiceFactory: vi.fn(),
      });

      // Alice app
      const aliceApp = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      // Start guest session first
      const guestResponse = await request(guestApp)
        .post('/api/session/start')
        .expect(200);

      const guestSessionId = guestResponse.body.sessionId as string;

      // Then start Alice's session
      const aliceResponse = await request(aliceApp)
        .post('/api/session/start')
        .expect(200);

      const aliceSessionId = aliceResponse.body.sessionId as string;

      // Both sessions should be independently active
      expect(sessionManager.getSession(guestSessionId)).toBeDefined();
      expect(sessionManager.getSession(aliceSessionId)).toBeDefined();

      // Guest: no IoT services, uid null
      expect(sessionManager.getSession(guestSessionId)!.uid).toBeNull();
      expect(sessionManager.getSessionIoTServices(guestSessionId)).toBeUndefined();

      // Alice: IoT services, uid set
      expect(sessionManager.getSession(aliceSessionId)!.uid).toBe('alice-uid-001');
      const aliceIoT = sessionManager.getSessionIoTServices(aliceSessionId);
      expect(aliceIoT).toBeDefined();
      expect(aliceIoT!.lightService).toBe(userLightService);
    });

    it('should clean up IoT services when a session ends', async () => {
      const userLightService = createMockLightService('alice');
      const userAirconService = createMockAirconService('alice');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'alice-token',
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: userLightService,
          airconService: userAirconService,
        },
      });

      const app = createIntegrationApp({
        user: userAlice,
        sessionManager,
        credentialService,
        iotServiceFactory,
      });

      // Start session
      const startResponse = await request(app)
        .post('/api/session/start')
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;

      // IoT services should be bound
      expect(sessionManager.getSessionIoTServices(sessionId)).toBeDefined();

      // End session
      await request(app)
        .post('/api/session/end')
        .send({ sessionId })
        .expect(200);

      // IoT services should be cleaned up after session ends
      expect(sessionManager.getSessionIoTServices(sessionId)).toBeUndefined();
      expect(sessionManager.getSession(sessionId)).toBeUndefined();
    });
  });
});
