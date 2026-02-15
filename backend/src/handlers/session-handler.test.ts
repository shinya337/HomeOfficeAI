/**
 * Session Handler Tests
 *
 * TDD tests for session API endpoints.
 * Requirements: 1.2, 1.4, 1.6, 5.5, 3.1, 3.2, 3.4, 6.1, 6.2, 6.3, 6.5
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { createSessionRoutes, type SessionRouteDependencies, type AlexaServiceFactory } from './session-handler.js';
import {
  createSessionManager,
  SessionManagerService,
} from '../services/session-manager.js';
import { resetSessionManager } from '../server.js';
import type { Device } from '../types/device-types.js';
import type { CredentialService } from '../services/credential-service.js';
import type { AuthenticatedUser } from '../types/auth-types.js';
import type { IoTServiceFactory } from './session-handler.js';
import type { AlexaServiceForDispatcher } from '../types/session-types.js';

describe('Session Handler', () => {
  let app: Express;
  let sessionManager: SessionManagerService;
  let mockGetCachedDevices: () => readonly Device[] | null;

  const testDevices: readonly Device[] = [
    { id: 'device-1', name: 'Living Light', type: 'LIGHT' },
    { id: 'device-2', name: 'Bedroom AC', type: 'AC' },
    { id: 'device-3', name: 'TV', type: 'TV' },
  ];

  beforeEach(() => {
    // Reset shared session manager to avoid test pollution
    resetSessionManager();
    app = express();
    app.use(express.json());
    sessionManager = createSessionManager();
    mockGetCachedDevices = vi.fn(() => testDevices);
    const deps: SessionRouteDependencies = {
      sessionManager,
      getCachedDevices: mockGetCachedDevices,
    };
    app.use('/api/session', createSessionRoutes(deps));
  });

  afterEach(() => {
    // Clean up after each test
    resetSessionManager();
  });

  describe('POST /api/session/start', () => {
    it('should start a new session and return session data', async () => {
      const response = await request(app).post('/api/session/start').expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.status).toBe('active');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).not.toHaveProperty('endedAt');
    });

    it('should return Content-Type: application/json', async () => {
      const response = await request(app).post('/api/session/start').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should replace existing active session with new one', async () => {
      // Start first session
      const first = await request(app).post('/api/session/start').expect(200);

      // Start second session
      const second = await request(app).post('/api/session/start').expect(200);

      // Should have different session IDs
      expect(second.body.sessionId).not.toBe(first.body.sessionId);
      expect(second.body.status).toBe('active');
    });
  });

  describe('POST /api/session/end', () => {
    it('should end an active session and return ended session data', async () => {
      // Start a session first
      await request(app).post('/api/session/start').expect(200);

      // End the session
      const response = await request(app).post('/api/session/end').expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.status).toBe('ended');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).toHaveProperty('endedAt');
    });

    it('should return 400 error when no active session exists', async () => {
      const response = await request(app).post('/api/session/end').expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NO_ACTIVE_SESSION');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 400 error when trying to end already ended session', async () => {
      // Start and end a session
      await request(app).post('/api/session/start').expect(200);
      await request(app).post('/api/session/end').expect(200);

      // Try to end again
      const response = await request(app).post('/api/session/end').expect(400);

      expect(response.body.error.code).toBe('NO_ACTIVE_SESSION');
    });

    it('should return Content-Type: application/json for error responses', async () => {
      const response = await request(app).post('/api/session/end').expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('GET /api/session/status', () => {
    it('should return hasActiveSession: false when no session exists', async () => {
      const response = await request(app).get('/api/session/status').expect(200);

      expect(response.body.hasActiveSession).toBe(false);
      expect(response.body.session).toBeNull();
    });

    it('should return hasActiveSession: true with session data when active', async () => {
      // Start a session
      const startResponse = await request(app)
        .post('/api/session/start')
        .expect(200);

      const response = await request(app).get('/api/session/status').expect(200);

      expect(response.body.hasActiveSession).toBe(true);
      expect(response.body.session).not.toBeNull();
      expect(response.body.session.sessionId).toBe(startResponse.body.sessionId);
      expect(response.body.session.status).toBe('active');
    });

    it('should return hasActiveSession: false after session is ended', async () => {
      // Start and end a session
      await request(app).post('/api/session/start').expect(200);
      await request(app).post('/api/session/end').expect(200);

      const response = await request(app).get('/api/session/status').expect(200);

      expect(response.body.hasActiveSession).toBe(false);
      expect(response.body.session).toBeNull();
    });

    it('should return Content-Type: application/json', async () => {
      const response = await request(app).get('/api/session/status').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 with JSON error for internal errors', async () => {
      // Create a mock session manager that throws errors
      const errorManager: SessionManagerService = {
        startSession: () => {
          throw new Error('Internal error');
        },
        endSession: () => {
          throw new Error('Internal error');
        },
        getStatus: () => {
          throw new Error('Internal error');
        },
        getSession: () => undefined,
        getActiveSessionByUid: () => undefined,
        hasActiveSession: () => false,
        addRecentAction: () => {},
        getRecentActions: () => [],
        getSessionIoTServices: () => undefined,
        cleanupExpiredSessions: () => {},
      };

      const errorApp = express();
      errorApp.use(express.json());
      const errorDeps: SessionRouteDependencies = {
        sessionManager: errorManager,
        getCachedDevices: () => testDevices,
      };
      errorApp.use('/api/session', createSessionRoutes(errorDeps));

      const response = await request(errorApp)
        .post('/api/session/start')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return 500 for GET /status internal errors', async () => {
      const errorManager: SessionManagerService = {
        startSession: () => {
          throw new Error('Internal error');
        },
        endSession: () => ({ ok: false, error: { code: 'SESSION_NOT_FOUND' as const, message: 'error' } }),
        getStatus: () => {
          throw new Error('Internal error');
        },
        getSession: () => undefined,
        getActiveSessionByUid: () => undefined,
        hasActiveSession: () => {
          throw new Error('Internal error');
        },
        addRecentAction: () => {},
        getRecentActions: () => [],
        getSessionIoTServices: () => undefined,
        cleanupExpiredSessions: () => {},
      };

      const errorApp = express();
      errorApp.use(express.json());
      const errorDeps: SessionRouteDependencies = {
        sessionManager: errorManager,
        getCachedDevices: () => testDevices,
      };
      errorApp.use('/api/session', createSessionRoutes(errorDeps));

      const response = await request(errorApp)
        .get('/api/session/status')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  /**
   * Tests for allowedDevices feature
   * Requirements: 3.1, 3.2, 3.4
   */
  describe('POST /api/session/start with allowedDeviceIds', () => {
    it('should accept allowedDeviceIds in request body and save to session', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1', 'device-2'] })
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.status).toBe('active');
      expect(response.body).toHaveProperty('allowedDevices');
      expect(response.body.allowedDevices).toHaveLength(2);
      expect(response.body.allowedDevices).toContainEqual({ id: 'device-1', type: 'LIGHT' });
      expect(response.body.allowedDevices).toContainEqual({ id: 'device-2', type: 'AC' });
    });

    it('should return 400 with invalid device IDs when some IDs do not exist', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1', 'invalid-id', 'another-invalid'] })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('INVALID_DEVICE_ID');
      expect(response.body.error).toHaveProperty('invalidIds');
      expect(response.body.error.invalidIds).toContain('invalid-id');
      expect(response.body.error.invalidIds).toContain('another-invalid');
      expect(response.body.error.invalidIds).not.toContain('device-1');
    });

    it('should allow empty allowedDeviceIds array (no device control)', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: [] })
        .expect(200);

      expect(response.body.status).toBe('active');
      expect(response.body.allowedDevices).toEqual([]);
    });

    it('should allow all devices when allowedDeviceIds is not specified (backward compatibility)', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({})
        .expect(200);

      expect(response.body.status).toBe('active');
      // allowedDevices should be undefined when not specified (backward compatibility)
      expect(response.body.allowedDevices).toBeUndefined();
    });

    it('should validate device IDs against cached device list', async () => {
      // Mock no cached devices
      const noCacheApp = express();
      noCacheApp.use(express.json());
      const noCacheDeps: SessionRouteDependencies = {
        sessionManager: createSessionManager(),
        getCachedDevices: () => null,
      };
      noCacheApp.use('/api/session', createSessionRoutes(noCacheDeps));

      const response = await request(noCacheApp)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1'] })
        .expect(503);

      expect(response.body.error.code).toBe('DEVICE_CACHE_UNAVAILABLE');
    });

    it('should include all requested valid device types in response', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1', 'device-2', 'device-3'] })
        .expect(200);

      expect(response.body.allowedDevices).toHaveLength(3);
      const types = response.body.allowedDevices.map((d: { type: string }) => d.type);
      expect(types).toContain('LIGHT');
      expect(types).toContain('AC');
      expect(types).toContain('TV');
    });
  });

  describe('GET /api/session/status with allowedDevices', () => {
    it('should return allowedDevices in session status when session has them', async () => {
      // Start session with allowed devices
      await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1'] })
        .expect(200);

      const statusResponse = await request(app)
        .get('/api/session/status')
        .expect(200);

      expect(statusResponse.body.hasActiveSession).toBe(true);
      expect(statusResponse.body.session).toHaveProperty('allowedDevices');
      expect(statusResponse.body.session.allowedDevices).toHaveLength(1);
      expect(statusResponse.body.session.allowedDevices[0]).toEqual({ id: 'device-1', type: 'LIGHT' });
    });

    it('should not include allowedDevices in status when session started without them', async () => {
      // Start session without allowed devices (backward compatibility)
      await request(app)
        .post('/api/session/start')
        .send({})
        .expect(200);

      const statusResponse = await request(app)
        .get('/api/session/status')
        .expect(200);

      expect(statusResponse.body.hasActiveSession).toBe(true);
      expect(statusResponse.body.session.allowedDevices).toBeUndefined();
    });
  });

  /**
   * Tests for signal propagation to AllowedDevice during session start
   * Task 1.2, Requirements: 1.1, 1.2, 1.3, 1.4 (dynamic-light-signals)
   */
  describe('POST /api/session/start with signal propagation (Task 1.2)', () => {
    const testDevicesWithSignals: readonly Device[] = [
      { id: 'device-1', name: 'Living Light', type: 'LIGHT', signals: ['安らぎ', '通常', '読書'] },
      { id: 'device-2', name: 'Bedroom AC', type: 'AC' },
      { id: 'device-3', name: 'TV', type: 'TV' },
    ];

    // Req 1.1, 1.3: validateDeviceIds で LIGHT の signals が AllowedDevice に伝搬される
    it('should propagate signals from cached Device to AllowedDevice for LIGHT devices', async () => {
      const signalApp = express();
      signalApp.use(express.json());
      const signalDeps: SessionRouteDependencies = {
        sessionManager: createSessionManager(),
        getCachedDevices: () => testDevicesWithSignals,
      };
      signalApp.use('/api/session', createSessionRoutes(signalDeps));

      const response = await request(signalApp)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1', 'device-2'] })
        .expect(200);

      expect(response.body.allowedDevices).toHaveLength(2);
      // LIGHT device should have signals
      const lightDevice = response.body.allowedDevices.find((d: { id: string }) => d.id === 'device-1');
      expect(lightDevice).toBeDefined();
      expect(lightDevice.signals).toEqual(['安らぎ', '通常', '読書']);
      // AC device should not have signals
      const acDevice = response.body.allowedDevices.find((d: { id: string }) => d.id === 'device-2');
      expect(acDevice).toBeDefined();
      expect(acDevice.signals).toBeUndefined();
    });

    // Req 1.2: signals なしの照明で空配列として AllowedDevice に含まれる
    it('should propagate empty signals array for LIGHT without signals', async () => {
      const devicesNoSignals: readonly Device[] = [
        { id: 'device-1', name: 'Basic Light', type: 'LIGHT', signals: [] },
      ];

      const signalApp = express();
      signalApp.use(express.json());
      const signalDeps: SessionRouteDependencies = {
        sessionManager: createSessionManager(),
        getCachedDevices: () => devicesNoSignals,
      };
      signalApp.use('/api/session', createSessionRoutes(signalDeps));

      const response = await request(signalApp)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1'] })
        .expect(200);

      expect(response.body.allowedDevices).toHaveLength(1);
      expect(response.body.allowedDevices[0].signals).toEqual([]);
    });

    // Req 1.4: ユーザー固有のシグナルが他ユーザーと混在しない
    it('should keep signals per user (isolated by cached device list)', async () => {
      const userADevices: readonly Device[] = [
        { id: 'light-a', name: 'User A Light', type: 'LIGHT', signals: ['安らぎ', '通常'] },
      ];
      const userBDevices: readonly Device[] = [
        { id: 'light-b', name: 'User B Light', type: 'LIGHT', signals: ['リラックス', 'ノーマル', '読書'] },
      ];

      // User A session
      const appA = express();
      appA.use(express.json());
      appA.use('/api/session', createSessionRoutes({
        sessionManager: createSessionManager(),
        getCachedDevices: () => userADevices,
      }));

      const responseA = await request(appA)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['light-a'] })
        .expect(200);

      expect(responseA.body.allowedDevices[0].signals).toEqual(['安らぎ', '通常']);

      // User B session (different cached devices)
      const appB = express();
      appB.use(express.json());
      appB.use('/api/session', createSessionRoutes({
        sessionManager: createSessionManager(),
        getCachedDevices: () => userBDevices,
      }));

      const responseB = await request(appB)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['light-b'] })
        .expect(200);

      expect(responseB.body.allowedDevices[0].signals).toEqual(['リラックス', 'ノーマル', '読書']);
    });

    // Signals should persist through deviceToolOverrides application
    it('should preserve signals when deviceToolOverrides are applied', async () => {
      const signalApp = express();
      signalApp.use(express.json());
      const signalDeps: SessionRouteDependencies = {
        sessionManager: createSessionManager(),
        getCachedDevices: () => testDevicesWithSignals,
      };
      signalApp.use('/api/session', createSessionRoutes(signalDeps));

      const response = await request(signalApp)
        .post('/api/session/start')
        .send({
          allowedDeviceIds: ['device-1'],
          deviceToolOverrides: { 'device-1': ['light_control'] },
        })
        .expect(200);

      expect(response.body.allowedDevices).toHaveLength(1);
      expect(response.body.allowedDevices[0].signals).toEqual(['安らぎ', '通常', '読書']);
      expect(response.body.allowedDevices[0].allowedTools).toEqual(['light_control']);
    });

    // Signals should appear in session status
    it('should include signals in session status response', async () => {
      const signalApp = express();
      signalApp.use(express.json());
      const signalDeps: SessionRouteDependencies = {
        sessionManager: createSessionManager(),
        getCachedDevices: () => testDevicesWithSignals,
      };
      signalApp.use('/api/session', createSessionRoutes(signalDeps));

      await request(signalApp)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1'] })
        .expect(200);

      const statusResponse = await request(signalApp)
        .get('/api/session/status')
        .expect(200);

      expect(statusResponse.body.hasActiveSession).toBe(true);
      expect(statusResponse.body.session.allowedDevices[0].signals).toEqual(['安らぎ', '通常', '読書']);
    });
  });

  /**
   * Tests for IoT client dynamic generation at session start
   * Task 6.2, Requirements: 6.1, 6.2, 6.3, 6.5
   */
  describe('POST /api/session/start with IoT client dynamic generation', () => {
    const testUser: AuthenticatedUser = {
      uid: 'test-uid-123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: undefined,
    };

    const mockLightService = {
      control: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', power: 'on' } }),
      sendNamedSignal: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', signalName: 'test', success: true } }),
    };

    const mockAirconService = {
      setTemperature: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1', temperature: 25 } }),
      powerOff: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1' } }),
    };

    /**
     * Middleware that simulates auth middleware by setting req.user
     */
    function fakeAuthMiddleware(user: AuthenticatedUser | null) {
      return (req: Request, _res: Response, next: NextFunction) => {
        (req as unknown as { user: AuthenticatedUser | null }).user = user;
        next();
      };
    }

    /**
     * Create test app with credential service and IoT factory for IoT dynamic generation tests
     */
    function createTestAppWithCredentials(options: {
      user: AuthenticatedUser | null;
      credentialService: CredentialService;
      iotServiceFactory: IoTServiceFactory;
    }): Express {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(options.user));

      const deps: SessionRouteDependencies = {
        sessionManager: createSessionManager(),
        getCachedDevices: () => testDevices,
        credentialService: options.credentialService,
        iotServiceFactory: options.iotServiceFactory,
      };
      testApp.use('/api/session', createSessionRoutes(deps));
      return testApp;
    }

    it('should use global IoT client for guest mode (no req.user)', async () => {
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn(),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };
      const mockFactory: IoTServiceFactory = vi.fn();

      const testApp = createTestAppWithCredentials({
        user: null,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      });

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');
      // Guest mode: credentialService should NOT be called
      expect(mockCredentialService.getDecryptedToken).not.toHaveBeenCalled();
      // Guest mode: iotServiceFactory should NOT be called
      expect(mockFactory).not.toHaveBeenCalled();
    });

    it('should create user-specific IoT services when user has a valid token', async () => {
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'user-nature-remo-token',
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: mockLightService,
          airconService: mockAirconService,
        },
      });

      const testApp = createTestAppWithCredentials({
        user: testUser,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      });

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');
      // Should have called credentialService to get the token
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith(
        'test-uid-123',
        'nature-remo'
      );
      // Should have called factory with the user token
      expect(mockFactory).toHaveBeenCalledWith('user-nature-remo-token');
    });

    it('should fallback to global IoT client when user token is NOT_FOUND', async () => {
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'クレデンシャルが見つかりません: nature-remo' },
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockFactory: IoTServiceFactory = vi.fn();

      const testApp = createTestAppWithCredentials({
        user: testUser,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      });

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');
      // Should have tried to get the token
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith(
        'test-uid-123',
        'nature-remo'
      );
      // Should NOT have called factory (fallback to global)
      expect(mockFactory).not.toHaveBeenCalled();
    });

    it('should return error and abort session when user token is invalid (API error)', async () => {
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'invalid-token',
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'INVALID_TOKEN', message: 'Nature Remo APIエラー: 401 Unauthorized' },
      });

      const testApp = createTestAppWithCredentials({
        user: testUser,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      });

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('INVALID_IOT_TOKEN');
      expect(response.body.error.message).toContain('Nature Remo');
    });

    it('should pass IoT services to session manager when user has valid token', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'user-nature-remo-token',
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: mockLightService,
          airconService: mockAirconService,
        },
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      // Verify the session has IoT services bound
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(mockLightService);
      expect(iotServices?.airconService).toBe(mockAirconService);
    });

    it('should not bind IoT services to session for guest mode', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn(),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };
      const mockFactory: IoTServiceFactory = vi.fn();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(null));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      // Verify no IoT services bound to session
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeUndefined();
    });

    it('should not bind IoT services when token is NOT_FOUND (fallback to global)', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'not found' },
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };
      const mockFactory: IoTServiceFactory = vi.fn();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      // Verify no IoT services bound (global fallback)
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeUndefined();
    });

    it('should pass uid to session manager for authenticated user', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'not found' },
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };
      const mockFactory: IoTServiceFactory = vi.fn();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      // Verify session has uid set
      const session = localSessionManager.getSession(response.body.sessionId as string);
      expect(session?.uid).toBe('test-uid-123');
    });

    it('should pass uid as null for guest mode', async () => {
      const localSessionManager = createSessionManager();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(null));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      // Verify session has uid null for guest
      const session = localSessionManager.getSession(response.body.sessionId as string);
      expect(session?.uid).toBeNull();
    });

    it('should fallback to global when credential service encounters Firestore error', async () => {
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'FIRESTORE_ERROR', message: 'Firestore接続エラー' },
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };
      const mockFactory: IoTServiceFactory = vi.fn();

      const testApp = createTestAppWithCredentials({
        user: testUser,
        credentialService: mockCredentialService,
        iotServiceFactory: mockFactory,
      });

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      // Firestore error => graceful fallback to global
      expect(response.body.status).toBe('active');
      expect(mockFactory).not.toHaveBeenCalled();
    });

    it('should work without credential service (backward compatibility)', async () => {
      // No credential service or factory provided (old deps format)
      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: createSessionManager(),
        getCachedDevices: () => testDevices,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');
    });
  });

  /**
   * Tests for Alexa cookie loading at session start
   * Task 4.3, Requirements: 4.1, 4.4, 5.2
   */
  describe('POST /api/session/start with Alexa cookie loading', () => {
    const testUser: AuthenticatedUser = {
      uid: 'alexa-test-uid',
      email: 'alexa@example.com',
      displayName: 'Alexa Test User',
      photoURL: undefined,
    };

    const mockLightService = {
      control: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', power: 'on' } }),
      sendNamedSignal: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', signalName: 'test', success: true } }),
    };

    const mockAirconService = {
      setTemperature: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1', temperature: 25 } }),
      powerOff: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1' } }),
    };

    const mockAlexaService: AlexaServiceForDispatcher = {
      speak: vi.fn().mockResolvedValue({ success: true, data: { message: 'hello' } }),
      announce: vi.fn().mockResolvedValue({ success: true, data: { message: 'hello' } }),
      executeRoutine: vi.fn().mockResolvedValue({ success: true, data: { utterance: 'routine' } }),
      setVolume: vi.fn().mockResolvedValue({ success: true, data: { volume: 50 } }),
      textCommand: vi.fn().mockResolvedValue({ success: true, data: { command: 'test' } }),
      playWeather: vi.fn().mockResolvedValue({ success: true, data: { message: 'weather' } }),
      playFlashBriefing: vi.fn().mockResolvedValue({ success: true, data: { message: 'briefing' } }),
      isConnected: vi.fn().mockReturnValue(true),
    };

    /**
     * Middleware that simulates auth middleware by setting req.user
     */
    function fakeAuthMiddleware(user: AuthenticatedUser | null) {
      return (req: Request, _res: Response, next: NextFunction) => {
        (req as unknown as { user: AuthenticatedUser | null }).user = user;
        next();
      };
    }

    it('should fetch Alexa cookie in parallel with Nature Remo token and store AlexaService in session', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn()
          .mockImplementation((_uid: string, service: string) => {
            if (service === 'nature-remo') {
              return Promise.resolve({ ok: true, value: 'nature-remo-token' });
            }
            if (service === 'alexa') {
              return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
            }
            return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
          }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: { lightService: mockLightService, airconService: mockAirconService },
      });

      const mockAlexaFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: mockAlexaService,
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');

      // Should have called credentialService for both nature-remo and alexa
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('alexa-test-uid', 'nature-remo');
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('alexa-test-uid', 'alexa');

      // Should have called alexaServiceFactory with the cookie JSON
      expect(mockAlexaFactory).toHaveBeenCalledWith('{"cookie":"data"}');

      // Session should have both Nature Remo and Alexa services
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(mockLightService);
      expect(iotServices?.airconService).toBe(mockAirconService);
      expect(iotServices?.alexaService).toBe(mockAlexaService);
    });

    it('should continue session without AlexaService when Alexa cookie is NOT_FOUND', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn()
          .mockImplementation((_uid: string, service: string) => {
            if (service === 'nature-remo') {
              return Promise.resolve({ ok: true, value: 'nature-remo-token' });
            }
            return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
          }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: { lightService: mockLightService, airconService: mockAirconService },
      });

      const mockAlexaFactory: AlexaServiceFactory = vi.fn();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');

      // AlexaServiceFactory should NOT be called when cookie not found
      expect(mockAlexaFactory).not.toHaveBeenCalled();

      // Session should have Nature Remo services but no Alexa
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(mockLightService);
      expect(iotServices?.alexaService).toBeUndefined();
    });

    it('should continue session without AlexaService when AlexaServiceFactory fails', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn()
          .mockImplementation((_uid: string, service: string) => {
            if (service === 'nature-remo') {
              return Promise.resolve({ ok: true, value: 'nature-remo-token' });
            }
            if (service === 'alexa') {
              return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
            }
            return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
          }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: { lightService: mockLightService, airconService: mockAirconService },
      });

      const mockAlexaFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'SERVICE_ERROR', message: 'Failed to create AlexaService' },
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');

      // Session should proceed without Alexa (non-blocking)
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(mockLightService);
      expect(iotServices?.alexaService).toBeUndefined();
    });

    it('should store only AlexaService when Nature Remo token is NOT_FOUND but Alexa cookie exists', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn()
          .mockImplementation((_uid: string, service: string) => {
            if (service === 'alexa') {
              return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
            }
            return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
          }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn();

      const mockAlexaFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: mockAlexaService,
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');

      // Session should have AlexaService even without Nature Remo
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.alexaService).toBe(mockAlexaService);
      // Nature Remo factory should not be called (token not found)
      expect(mockIoTFactory).not.toHaveBeenCalled();
    });

    it('should not call alexaServiceFactory for guest mode', async () => {
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn(),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn();
      const mockAlexaFactory: AlexaServiceFactory = vi.fn();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(null));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: createSessionManager(),
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');
      expect(mockCredentialService.getDecryptedToken).not.toHaveBeenCalled();
      expect(mockAlexaFactory).not.toHaveBeenCalled();
    });

    it('should continue session when AlexaServiceFactory throws an unexpected error', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn()
          .mockImplementation((_uid: string, service: string) => {
            if (service === 'nature-remo') {
              return Promise.resolve({ ok: true, value: 'nature-remo-token' });
            }
            if (service === 'alexa') {
              return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
            }
            return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
          }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: { lightService: mockLightService, airconService: mockAirconService },
      });

      // Factory throws an unexpected error
      const mockAlexaFactory: AlexaServiceFactory = vi.fn().mockRejectedValue(
        new Error('Unexpected connection timeout')
      );

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');

      // Session should proceed without Alexa (non-blocking)
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(mockLightService);
      expect(iotServices?.alexaService).toBeUndefined();
    });

    it('should work without alexaServiceFactory (backward compatibility)', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'nature-remo-token',
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: { lightService: mockLightService, airconService: mockAirconService },
      });

      // No alexaServiceFactory provided
      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');

      // Session should still work with Nature Remo services
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(mockLightService);
      expect(iotServices?.alexaService).toBeUndefined();
    });

    it('should continue session when both Nature Remo token NOT_FOUND and Alexa cookie NOT_FOUND', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'not found' },
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn();
      const mockAlexaFactory: AlexaServiceFactory = vi.fn();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');
      // Neither factory should be called since both tokens are NOT_FOUND
      expect(mockIoTFactory).not.toHaveBeenCalled();
      expect(mockAlexaFactory).not.toHaveBeenCalled();
      // Session should have no IoT services (global fallback)
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeUndefined();
    });

    it('should verify SessionIoTServices has all three properties when both services succeed', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn()
          .mockImplementation((_uid: string, service: string) => {
            if (service === 'nature-remo') {
              return Promise.resolve({ ok: true, value: 'remo-token' });
            }
            if (service === 'alexa') {
              return Promise.resolve({ ok: true, value: '{"cookie":"valid"}' });
            }
            return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
          }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: { lightService: mockLightService, airconService: mockAirconService },
      });

      const mockAlexaFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: mockAlexaService,
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);

      // All three properties of SessionIoTServices should be defined
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(mockLightService);
      expect(iotServices?.airconService).toBe(mockAirconService);
      expect(iotServices?.alexaService).toBe(mockAlexaService);
    });

    it('should handle Alexa credential FIRESTORE_ERROR gracefully (continue without AlexaService)', async () => {
      const localSessionManager = createSessionManager();
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn()
          .mockImplementation((_uid: string, service: string) => {
            if (service === 'nature-remo') {
              return Promise.resolve({ ok: true, value: 'remo-token' });
            }
            if (service === 'alexa') {
              return Promise.resolve({ ok: false, error: { code: 'FIRESTORE_ERROR', message: 'Firestore connection timeout' } });
            }
            return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
          }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: { lightService: mockLightService, airconService: mockAirconService },
      });

      const mockAlexaFactory: AlexaServiceFactory = vi.fn();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: localSessionManager,
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      const response = await request(testApp)
        .post('/api/session/start')
        .expect(200);

      expect(response.body.status).toBe('active');
      // AlexaFactory should NOT be called when Alexa credential lookup fails
      expect(mockAlexaFactory).not.toHaveBeenCalled();
      // Session should have Nature Remo services only
      const sessionId = response.body.sessionId as string;
      const iotServices = localSessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(mockLightService);
      expect(iotServices?.airconService).toBe(mockAirconService);
      expect(iotServices?.alexaService).toBeUndefined();
    });

    it('should call credential lookups for both nature-remo and alexa exactly once each', async () => {
      const mockCredentialService: CredentialService = {
        getDecryptedToken: vi.fn()
          .mockImplementation((_uid: string, service: string) => {
            if (service === 'nature-remo') {
              return Promise.resolve({ ok: true, value: 'remo-token' });
            }
            if (service === 'alexa') {
              return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
            }
            return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
          }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockIoTFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: { lightService: mockLightService, airconService: mockAirconService },
      });

      const mockAlexaFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: mockAlexaService,
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.use(fakeAuthMiddleware(testUser));
      testApp.use('/api/session', createSessionRoutes({
        sessionManager: createSessionManager(),
        getCachedDevices: () => testDevices,
        credentialService: mockCredentialService,
        iotServiceFactory: mockIoTFactory,
        alexaServiceFactory: mockAlexaFactory,
      }));

      await request(testApp)
        .post('/api/session/start')
        .expect(200);

      // Verify exactly 2 calls to getDecryptedToken (one for each service)
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledTimes(2);
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('alexa-test-uid', 'nature-remo');
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('alexa-test-uid', 'alexa');
    });
  });
});
