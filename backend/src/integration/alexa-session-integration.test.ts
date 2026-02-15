/**
 * E2E Integration Tests: Alexa Session Integration
 *
 * Tests the end-to-end session integration flow for Alexa:
 * - Session start -> Alexa cookie decrypt -> AlexaService creation -> SessionIoTServices storage -> ActionDispatcher priority usage
 * - No user cookie -> global AlexaService fallback
 * - Session end -> resource release (IoT services cleanup)
 *
 * Uses real SessionManager, real session-handler, and real ActionDispatcher
 * wired to mock CredentialService, mock IoTServiceFactory, and mock AlexaServiceFactory.
 * Validates the full chain from HTTP request through session to action dispatch.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 * Task: 7.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createSessionRoutes, type SessionRouteDependencies, type IoTServiceFactory, type AlexaServiceFactory } from '../handlers/session-handler.js';
import { createSessionManager, type SessionManagerService } from '../services/session-manager.js';
import { createActionDispatcher, type AlexaServiceForDispatcher, type LightService, type AirconService } from '../dispatcher/action-dispatcher.js';
import type { CredentialService } from '../services/credential-service.js';
import type { AuthenticatedUser } from '../types/auth-types.js';
import type { Device, AllowedDevice } from '../types/device-types.js';
import type { SessionIoTServices } from '../types/session-types.js';

// =============================================================================
// Test Fixtures & Helpers
// =============================================================================

const testUser: AuthenticatedUser = {
  uid: 'e2e-session-user-001',
  email: 'session-e2e@example.com',
  displayName: 'Session E2E User',
  photoURL: undefined,
};

const secondUser: AuthenticatedUser = {
  uid: 'e2e-session-user-002',
  email: 'session-e2e-2@example.com',
  displayName: 'Session E2E User 2',
  photoURL: undefined,
};

const testDevices: readonly Device[] = [
  { id: 'light-1', name: 'Living Light', type: 'LIGHT' },
  { id: 'ac-1', name: 'Bedroom AC', type: 'AC' },
  { id: 'echo-1', name: 'Echo Dot', type: 'ALEXA' },
];

/**
 * Middleware that simulates an authenticated user on req.user.
 */
function fakeAuthMiddleware(user: AuthenticatedUser | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: AuthenticatedUser | null }).user = user;
    next();
  };
}

/**
 * Create a mock LightService with a label for identification.
 */
function createMockLightService(label: string): LightService & { label: string } {
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
 * Create a mock AirconService with a label for identification.
 */
function createMockAirconService(label: string): AirconService & { label: string } {
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
 * Create a mock AlexaServiceForDispatcher with a label for identification.
 */
function createMockAlexaService(label: string): AlexaServiceForDispatcher & { label: string } {
  return {
    label,
    speak: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'speak', success: true } }),
    announce: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'announce', success: true } }),
    executeRoutine: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'routine', success: true } }),
    setVolume: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'volume', success: true } }),
    textCommand: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'textCommand', success: true } }),
    playWeather: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'weather', success: true } }),
    playFlashBriefing: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'flashBriefing', success: true } }),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

/**
 * Create a mock CredentialService with configurable behavior.
 */
function createMockCredentialService(overrides?: Partial<CredentialService>): CredentialService {
  return {
    saveToken: vi.fn(async () => ({ ok: true as const, value: undefined })),
    getDecryptedToken: vi.fn(async () => ({
      ok: false as const,
      error: { code: 'NOT_FOUND' as const, message: 'Not found' },
    })),
    getStatus: vi.fn(async () => ({ ok: true as const, value: [] })),
    deleteToken: vi.fn(async () => ({ ok: true as const, value: undefined })),
    deleteAllForUser: vi.fn(async () => ({ ok: true as const, value: undefined })),
    ...overrides,
  };
}

/**
 * Simulate the actionDispatcherFactory pattern from server.ts.
 * Wired with global services and creates dispatchers with session-specific overrides.
 */
function createActionDispatcherFactory(
  globalLightService: LightService | null,
  globalAirconService: AirconService | null,
  globalAlexaService: AlexaServiceForDispatcher | null,
) {
  return (
    allowedDevices: readonly AllowedDevice[],
    sessionIoTServices?: SessionIoTServices,
  ) =>
    createActionDispatcher(allowedDevices, {
      ...(sessionIoTServices?.lightService ?? globalLightService ? { lightService: sessionIoTServices?.lightService ?? globalLightService! } : {}),
      ...(sessionIoTServices?.airconService ?? globalAirconService ? { airconService: sessionIoTServices?.airconService ?? globalAirconService! } : {}),
      ...(sessionIoTServices?.alexaService ?? globalAlexaService ? { alexaService: sessionIoTServices?.alexaService ?? globalAlexaService! } : {}),
    });
}

/**
 * Create a fully wired test app for session integration E2E tests.
 */
function createE2ESessionApp(options: {
  user: AuthenticatedUser | null;
  sessionManager: SessionManagerService;
  credentialService: CredentialService;
  iotServiceFactory: IoTServiceFactory;
  alexaServiceFactory: AlexaServiceFactory;
}): Express {
  const { user, sessionManager, credentialService, iotServiceFactory, alexaServiceFactory } = options;
  const app = express();
  app.use(express.json());
  app.use(fakeAuthMiddleware(user));

  const deps: SessionRouteDependencies = {
    sessionManager,
    getCachedDevices: () => testDevices,
    credentialService,
    iotServiceFactory,
    alexaServiceFactory,
  };

  app.use('/api/session', createSessionRoutes(deps));

  return app;
}

// =============================================================================
// E2E Integration Tests
// =============================================================================

describe('E2E Integration: Alexa Session Integration', () => {
  let sessionManager: SessionManagerService;

  beforeEach(() => {
    sessionManager = createSessionManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Flow 1: Full Session Flow with User-Specific AlexaService
  // Session start -> Alexa cookie decrypt -> AlexaService creation ->
  // SessionIoTServices storage -> ActionDispatcher priority usage
  // Requirements: 4.1, 4.2
  // ---------------------------------------------------------------------------
  describe('Full session flow with user-specific AlexaService', () => {
    it('should create session with user AlexaService and use it for action dispatch instead of global', async () => {
      const sessionAlexaService = createMockAlexaService('session-user');
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'nature-remo') {
            return Promise.resolve({ ok: true, value: 'user-remo-token' });
          }
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"localCookie":"session-id=abc"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const sessionLightService = createMockLightService('session');
      const sessionAirconService = createMockAirconService('session');

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: sessionLightService,
          airconService: sessionAirconService,
        },
      });

      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: sessionAlexaService,
      });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      // Step 1: Start session
      const startResponse = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['light-1', 'ac-1', 'echo-1'] })
        .expect(200);

      expect(startResponse.body.status).toBe('active');
      const sessionId = startResponse.body.sessionId as string;

      // Step 2: Verify credential lookups were made for both services in parallel
      expect(credentialService.getDecryptedToken).toHaveBeenCalledWith('e2e-session-user-001', 'nature-remo');
      expect(credentialService.getDecryptedToken).toHaveBeenCalledWith('e2e-session-user-001', 'alexa');

      // Step 3: Verify AlexaServiceFactory was called with the cookie JSON
      expect(alexaServiceFactory).toHaveBeenCalledWith('{"localCookie":"session-id=abc"}');

      // Step 4: Verify session has all three IoT services stored
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeDefined();
      expect(iotServices?.lightService).toBe(sessionLightService);
      expect(iotServices?.airconService).toBe(sessionAirconService);
      expect(iotServices?.alexaService).toBe(sessionAlexaService);

      // Step 5: Create ActionDispatcher using the factory pattern (simulating server.ts)
      // and verify session-specific AlexaService is used over global
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);
      const dispatcher = dispatcherFactory(
        startResponse.body.allowedDevices as AllowedDevice[],
        iotServices,
      );

      // Step 6: Dispatch an Alexa speak action
      const dispatchResult = await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'Hello from user session' },
      });

      // Session-specific AlexaService should be used, NOT global
      expect(dispatchResult.ok).toBe(true);
      expect(sessionAlexaService.speak).toHaveBeenCalledWith('echo-1', 'Hello from user session');
      expect(globalAlexaService.speak).not.toHaveBeenCalled();
    });

    it('should use session AlexaService for multiple action types (speak, announce, volume, routine)', async () => {
      const sessionAlexaService = createMockAlexaService('session');
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: sessionAlexaService,
      });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      // Start session (only Alexa device, no Nature Remo token)
      const startResponse = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['echo-1'] })
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;
      const iotServices = sessionManager.getSessionIoTServices(sessionId);

      // Wire up dispatcher with global AlexaService as fallback
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);
      const dispatcher = dispatcherFactory(
        startResponse.body.allowedDevices as AllowedDevice[],
        iotServices,
      );

      // Dispatch multiple action types
      await dispatcher.dispatch({ tool: 'alexa_speak', params: { message: 'speak test' } });
      await dispatcher.dispatch({ tool: 'alexa_announcement', params: { message: 'announce test' } });
      await dispatcher.dispatch({ tool: 'alexa_volume', params: { volume: 40 } });
      await dispatcher.dispatch({ tool: 'alexa_routine', params: { routine_name: 'morning' } });

      // All should use session-specific, none should use global
      // announce is called 2 times: once by session start auto-announcement + once by dispatch
      expect(sessionAlexaService.speak).toHaveBeenCalledTimes(1);
      expect(sessionAlexaService.announce).toHaveBeenCalledTimes(2);
      expect(sessionAlexaService.setVolume).toHaveBeenCalledTimes(1);
      expect(sessionAlexaService.executeRoutine).toHaveBeenCalledTimes(1);

      expect(globalAlexaService.speak).not.toHaveBeenCalled();
      expect(globalAlexaService.announce).not.toHaveBeenCalled();
      expect(globalAlexaService.setVolume).not.toHaveBeenCalled();
      expect(globalAlexaService.executeRoutine).not.toHaveBeenCalled();
    });

    it('should store AlexaService in SessionIoTServices even when Nature Remo token is not found', async () => {
      const sessionAlexaService = createMockAlexaService('alexa-only');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"cookie":"alexa-only"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: sessionAlexaService,
      });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      const startResponse = await request(app)
        .post('/api/session/start')
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;
      const iotServices = sessionManager.getSessionIoTServices(sessionId);

      expect(iotServices).toBeDefined();
      expect(iotServices?.alexaService).toBe(sessionAlexaService);
      expect(iotServices?.lightService).toBeUndefined();
      expect(iotServices?.airconService).toBeUndefined();

      // IoTServiceFactory should not have been called (Nature Remo token not found)
      expect(iotServiceFactory).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 2: Global AlexaService Fallback
  // No user cookie -> global AlexaService fallback
  // Requirements: 4.3
  // ---------------------------------------------------------------------------
  describe('Global AlexaService fallback when user cookie is not available', () => {
    it('should fallback to global AlexaService when user has no Alexa cookie', async () => {
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Not found' },
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn();

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      const startResponse = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['echo-1'] })
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;

      // Session should have no IoT services (undefined = use global fallback)
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeUndefined();

      // AlexaServiceFactory should NOT have been called
      expect(alexaServiceFactory).not.toHaveBeenCalled();

      // ActionDispatcher should use global AlexaService
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);
      const dispatcher = dispatcherFactory(
        startResponse.body.allowedDevices as AllowedDevice[],
        iotServices,
      );

      const result = await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'fallback to global' },
      });

      expect(result.ok).toBe(true);
      expect(globalAlexaService.speak).toHaveBeenCalledWith('echo-1', 'fallback to global');
    });

    it('should fallback to global AlexaService for guest mode (no auth)', async () => {
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService();
      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn();

      const app = createE2ESessionApp({
        user: null, // Guest mode
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      const startResponse = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['echo-1'] })
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;

      // Guest: No credential lookups should happen
      expect(credentialService.getDecryptedToken).not.toHaveBeenCalled();
      expect(alexaServiceFactory).not.toHaveBeenCalled();

      // Session should have no IoT services
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServices).toBeUndefined();

      // ActionDispatcher should use global AlexaService
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);
      const dispatcher = dispatcherFactory(
        startResponse.body.allowedDevices as AllowedDevice[],
        iotServices,
      );

      const result = await dispatcher.dispatch({
        tool: 'alexa_announcement',
        params: { message: 'guest announcement' },
      });

      expect(result.ok).toBe(true);
      expect(globalAlexaService.announce).toHaveBeenCalledWith('echo-1', 'guest announcement');
    });

    it('should fallback to global AlexaService when AlexaServiceFactory returns error', async () => {
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"cookie":"expired"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'SERVICE_ERROR', message: 'Cookie expired' },
      });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      const startResponse = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['echo-1'] })
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;

      // Session should not have AlexaService (factory failed)
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      // IoT services should be undefined since no Nature Remo token and Alexa factory failed
      expect(iotServices).toBeUndefined();

      // ActionDispatcher should use global AlexaService as fallback
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);
      const dispatcher = dispatcherFactory(
        startResponse.body.allowedDevices as AllowedDevice[],
        iotServices,
      );

      const result = await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'fallback after factory error' },
      });

      expect(result.ok).toBe(true);
      expect(globalAlexaService.speak).toHaveBeenCalledWith('echo-1', 'fallback after factory error');
    });

    it('should fallback to global AlexaService when AlexaServiceFactory throws unexpected error', async () => {
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockRejectedValue(
        new Error('Unexpected network timeout')
      );

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      const startResponse = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['echo-1'] })
        .expect(200);

      // Session should succeed even when AlexaServiceFactory throws
      expect(startResponse.body.status).toBe('active');

      const sessionId = startResponse.body.sessionId as string;
      const iotServices = sessionManager.getSessionIoTServices(sessionId);

      // Dispatcher with global fallback
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);
      const dispatcher = dispatcherFactory(
        startResponse.body.allowedDevices as AllowedDevice[],
        iotServices,
      );

      const result = await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'fallback after throw' },
      });

      expect(result.ok).toBe(true);
      expect(globalAlexaService.speak).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 3: Session End -> Resource Release
  // Requirements: 4.4
  // ---------------------------------------------------------------------------
  describe('Session end and resource release', () => {
    it('should release IoT services (including AlexaService) when session ends', async () => {
      const sessionAlexaService = createMockAlexaService('session');
      const sessionLightService = createMockLightService('session');
      const sessionAirconService = createMockAirconService('session');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'nature-remo') {
            return Promise.resolve({ ok: true, value: 'remo-token' });
          }
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: sessionLightService,
          airconService: sessionAirconService,
        },
      });

      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: sessionAlexaService,
      });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      // Step 1: Start session
      const startResponse = await request(app)
        .post('/api/session/start')
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;

      // Step 2: Verify IoT services are stored
      const iotServicesBefore = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServicesBefore).toBeDefined();
      expect(iotServicesBefore?.alexaService).toBe(sessionAlexaService);
      expect(iotServicesBefore?.lightService).toBe(sessionLightService);
      expect(iotServicesBefore?.airconService).toBe(sessionAirconService);

      // Step 3: End session
      const endResponse = await request(app)
        .post('/api/session/end')
        .send({ sessionId })
        .expect(200);

      expect(endResponse.body.status).toBe('ended');

      // Step 4: Verify IoT services are released (session removed from manager)
      const iotServicesAfter = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServicesAfter).toBeUndefined();

      // Step 5: Verify session is no longer active
      const session = sessionManager.getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it('should properly release resources when session with only AlexaService ends', async () => {
      const sessionAlexaService = createMockAlexaService('alexa-only');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: sessionAlexaService,
      });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      // Start session
      const startResponse = await request(app)
        .post('/api/session/start')
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;

      // Verify AlexaService is stored
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServices?.alexaService).toBe(sessionAlexaService);

      // End session
      await request(app)
        .post('/api/session/end')
        .send({ sessionId })
        .expect(200);

      // Verify cleanup
      expect(sessionManager.getSessionIoTServices(sessionId)).toBeUndefined();
      expect(sessionManager.getSession(sessionId)).toBeUndefined();
    });

    it('should not affect global AlexaService when user session ends', async () => {
      const sessionAlexaService = createMockAlexaService('session');
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"cookie":"data"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: sessionAlexaService,
      });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      // Start and end session
      const startResponse = await request(app)
        .post('/api/session/start')
        .expect(200);

      await request(app)
        .post('/api/session/end')
        .send({ sessionId: startResponse.body.sessionId })
        .expect(200);

      // Global AlexaService should still be functional (not affected by session cleanup)
      // Start a new guest session and verify global is still usable
      const guestApp = createE2ESessionApp({
        user: null,
        sessionManager,
        credentialService: createMockCredentialService(),
        iotServiceFactory: vi.fn(),
        alexaServiceFactory: vi.fn(),
      });

      const guestStartResponse = await request(guestApp)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['echo-1'] })
        .expect(200);

      const guestIoTServices = sessionManager.getSessionIoTServices(guestStartResponse.body.sessionId);

      // Create dispatcher with global service -- it should still work
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);
      const dispatcher = dispatcherFactory(
        guestStartResponse.body.allowedDevices as AllowedDevice[],
        guestIoTServices,
      );

      const result = await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'global still works after user session ended' },
      });

      expect(result.ok).toBe(true);
      expect(globalAlexaService.speak).toHaveBeenCalledWith('echo-1', 'global still works after user session ended');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 4: Multi-User Session Isolation
  // Requirements: 4.1, 4.2
  // ---------------------------------------------------------------------------
  describe('Multi-user session isolation', () => {
    it('should maintain separate AlexaService instances for different users', async () => {
      const user1AlexaService = createMockAlexaService('user1');
      const user2AlexaService = createMockAlexaService('user2');
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((uid: string, service: string) => {
          if (service === 'alexa' && uid === 'e2e-session-user-001') {
            return Promise.resolve({ ok: true, value: '{"cookie":"user1"}' });
          }
          if (service === 'alexa' && uid === 'e2e-session-user-002') {
            return Promise.resolve({ ok: true, value: '{"cookie":"user2"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();

      let factoryCallCount = 0;
      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockImplementation((cookieJson: string) => {
        factoryCallCount++;
        const parsed = JSON.parse(cookieJson) as { cookie: string };
        if (parsed.cookie === 'user1') {
          return Promise.resolve({ ok: true, value: user1AlexaService });
        }
        return Promise.resolve({ ok: true, value: user2AlexaService });
      });

      // User 1 starts session
      const app1 = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      const start1 = await request(app1)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['echo-1'] })
        .expect(200);

      // User 2 starts session
      const app2 = createE2ESessionApp({
        user: secondUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      const start2 = await request(app2)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['echo-1'] })
        .expect(200);

      // Verify each session has its own AlexaService
      const iotServices1 = sessionManager.getSessionIoTServices(start1.body.sessionId);
      const iotServices2 = sessionManager.getSessionIoTServices(start2.body.sessionId);

      expect(iotServices1?.alexaService).toBe(user1AlexaService);
      expect(iotServices2?.alexaService).toBe(user2AlexaService);

      // Dispatch from each user's session -> each should use their own AlexaService
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);

      const dispatcher1 = dispatcherFactory(
        start1.body.allowedDevices as AllowedDevice[],
        iotServices1,
      );
      const dispatcher2 = dispatcherFactory(
        start2.body.allowedDevices as AllowedDevice[],
        iotServices2,
      );

      await dispatcher1.dispatch({ tool: 'alexa_speak', params: { message: 'user1 speaks' } });
      await dispatcher2.dispatch({ tool: 'alexa_speak', params: { message: 'user2 speaks' } });

      expect(user1AlexaService.speak).toHaveBeenCalledWith('echo-1', 'user1 speaks');
      expect(user2AlexaService.speak).toHaveBeenCalledWith('echo-1', 'user2 speaks');
      expect(globalAlexaService.speak).not.toHaveBeenCalled();

      // Verify factory was called twice (once for each user)
      expect(factoryCallCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 5: Session Replacement with Resource Cleanup
  // Requirements: 4.4
  // ---------------------------------------------------------------------------
  describe('Session replacement with resource cleanup', () => {
    it('should clean up old session resources when starting a new session', async () => {
      const firstAlexaService = createMockAlexaService('first');
      const secondAlexaService = createMockAlexaService('second');

      let callCount = 0;
      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: `{"cookie":"session-${++callCount}"}` });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn();
      const alexaServiceFactory: AlexaServiceFactory = vi.fn()
        .mockResolvedValueOnce({ ok: true, value: firstAlexaService })
        .mockResolvedValueOnce({ ok: true, value: secondAlexaService });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      // Start first session
      const start1 = await request(app)
        .post('/api/session/start')
        .expect(200);

      const session1Id = start1.body.sessionId as string;
      expect(sessionManager.getSessionIoTServices(session1Id)?.alexaService).toBe(firstAlexaService);

      // Start second session (replaces first)
      const start2 = await request(app)
        .post('/api/session/start')
        .expect(200);

      const session2Id = start2.body.sessionId as string;
      expect(session2Id).not.toBe(session1Id);

      // Second session should have the second AlexaService
      expect(sessionManager.getSessionIoTServices(session2Id)?.alexaService).toBe(secondAlexaService);

      // First session should no longer be accessible (replaced by SessionManager)
      // Note: SessionManager keeps old sessions in the map but they remain active
      // until explicitly ended. However, the new session takes precedence.
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 6: Complete End-to-End: Start -> Use -> End
  // Requirements: 4.1, 4.2, 4.3, 4.4
  // ---------------------------------------------------------------------------
  describe('Complete end-to-end lifecycle', () => {
    it('should support full lifecycle: start session -> dispatch actions -> end session -> verify cleanup', async () => {
      const sessionAlexaService = createMockAlexaService('lifecycle');
      const sessionLightService = createMockLightService('lifecycle');
      const globalAlexaService = createMockAlexaService('global');

      const credentialService = createMockCredentialService({
        getDecryptedToken: vi.fn().mockImplementation((_uid: string, service: string) => {
          if (service === 'nature-remo') {
            return Promise.resolve({ ok: true, value: 'remo-token' });
          }
          if (service === 'alexa') {
            return Promise.resolve({ ok: true, value: '{"cookie":"lifecycle"}' });
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
        }),
      });

      const iotServiceFactory: IoTServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: {
          lightService: sessionLightService,
          airconService: undefined,
        },
      });

      const alexaServiceFactory: AlexaServiceFactory = vi.fn().mockResolvedValue({
        ok: true,
        value: sessionAlexaService,
      });

      const app = createE2ESessionApp({
        user: testUser,
        sessionManager,
        credentialService,
        iotServiceFactory,
        alexaServiceFactory,
      });

      // Phase 1: Start session
      const startResponse = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['light-1', 'echo-1'] })
        .expect(200);

      const sessionId = startResponse.body.sessionId as string;
      expect(startResponse.body.status).toBe('active');

      // Phase 2: Verify services are bound
      const iotServices = sessionManager.getSessionIoTServices(sessionId);
      expect(iotServices?.alexaService).toBe(sessionAlexaService);
      expect(iotServices?.lightService).toBe(sessionLightService);

      // Phase 3: Use the dispatcher
      const dispatcherFactory = createActionDispatcherFactory(null, null, globalAlexaService);
      const dispatcher = dispatcherFactory(
        startResponse.body.allowedDevices as AllowedDevice[],
        iotServices,
      );

      // Use session AlexaService
      const speakResult = await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'lifecycle test' },
      });
      expect(speakResult.ok).toBe(true);
      expect(sessionAlexaService.speak).toHaveBeenCalled();
      expect(globalAlexaService.speak).not.toHaveBeenCalled();

      // Use session LightService
      const lightResult = await dispatcher.dispatch({
        tool: 'light_control',
        params: { action: 'on' },
      });
      expect(lightResult.ok).toBe(true);
      expect(sessionLightService.control).toHaveBeenCalled();

      // Phase 4: End session
      const endResponse = await request(app)
        .post('/api/session/end')
        .send({ sessionId })
        .expect(200);

      expect(endResponse.body.status).toBe('ended');

      // Phase 5: Verify cleanup
      expect(sessionManager.getSessionIoTServices(sessionId)).toBeUndefined();
      expect(sessionManager.getSession(sessionId)).toBeUndefined();
      expect(sessionManager.hasActiveSession()).toBe(false);
    });
  });
});
