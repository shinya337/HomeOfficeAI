/**
 * Session Handler
 *
 * Express routes for session management API endpoints.
 * Requirements: 1.2, 1.4, 1.6, 5.5, 3.1, 3.2, 3.4, 6.1, 6.2, 6.3, 6.5
 *
 * Endpoints:
 * - POST /api/session/start - Start a new session (with optional allowedDeviceIds)
 * - POST /api/session/end - End the current session
 * - GET /api/session/status - Get current session status (includes allowedDevices)
 */
import { Router, Request, Response } from 'express';
import type { SessionManagerService } from '../services/session-manager.js';
import type {
  SessionResponse,
  SessionStatusResponse,
  ErrorResponse,
} from '../types/api-types.js';
import { ErrorCodes } from '../types/api-types.js';
import type { Device, AllowedDevice } from '../types/device-types.js';
import type { CredentialService } from '../services/credential-service.js';
import type { SessionIoTServices, AlexaServiceForDispatcher } from '../types/session-types.js';
import type { AuthenticatedUser } from '../types/auth-types.js';
import type { Result } from '../types/action-types.js';

/**
 * Error type for IoT service factory
 */
export interface IoTServiceFactoryError {
  readonly code: 'INVALID_TOKEN' | 'SERVICE_ERROR';
  readonly message: string;
}

/**
 * Factory function to create IoT services from a user's Nature Remo token.
 * Called during session start when a logged-in user has a stored token.
 *
 * @param token - Decrypted Nature Remo token
 * @returns Result with SessionIoTServices on success, error on failure
 *
 * Task 6.2, Requirements: 6.2, 6.5
 */
export type IoTServiceFactory = (
  token: string
) => Promise<Result<SessionIoTServices, IoTServiceFactoryError>>;

/**
 * Error type for Alexa service factory
 */
export interface AlexaServiceFactoryError {
  readonly code: 'INVALID_COOKIE' | 'SERVICE_ERROR';
  readonly message: string;
}

/**
 * Factory function to create AlexaServiceForDispatcher from a user's Alexa cookie JSON.
 * Called during session start when a logged-in user has a stored Alexa cookie.
 *
 * @param cookieJson - Decrypted Alexa cookie JSON string
 * @returns Result with AlexaServiceForDispatcher on success, error on failure
 *
 * Task 4.3, Requirements: 4.1, 4.4
 */
export type AlexaServiceFactory = (
  cookieJson: string
) => Promise<Result<AlexaServiceForDispatcher, AlexaServiceFactoryError>>;

/**
 * Dependencies for session routes
 */
export interface SessionRouteDependencies {
  readonly sessionManager: SessionManagerService;
  readonly getCachedDevices: () => readonly Device[] | null;
  /** Credential service for fetching user IoT tokens (Task 6.2) */
  readonly credentialService?: CredentialService;
  /** Factory for creating user-specific IoT services from a token (Task 6.2) */
  readonly iotServiceFactory?: IoTServiceFactory;
  /** Factory for creating user-specific AlexaService from an Alexa cookie (Task 4.3) */
  readonly alexaServiceFactory?: AlexaServiceFactory;
}

/**
 * Request body for POST /api/session/start
 * Requirement 3.1: Allow specifying device IDs at session start
 */
interface StartSessionRequestBody {
  readonly allowedDeviceIds?: readonly string[];
  readonly deviceToolOverrides?: Record<string, string[]>;
}

/**
 * Extended error response with invalid device IDs
 */
interface DeviceValidationErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly invalidIds?: readonly string[];
  };
}

/**
 * Type guard to check if deps is SessionRouteDependencies
 */
function isSessionRouteDependencies(
  deps: SessionRouteDependencies | SessionManagerService
): deps is SessionRouteDependencies {
  return 'sessionManager' in deps && 'getCachedDevices' in deps;
}

/**
 * Send Alexa announcement (fire-and-forget) using session's AlexaService.
 * Uses the first ALEXA device from allowedDevices for the serial number.
 * Logs errors but never throws.
 */
function sendAlexaAnnouncement(
  alexaService: AlexaServiceForDispatcher,
  allowedDevices: readonly AllowedDevice[],
  message: string
): void {
  const alexaDevice = allowedDevices.find(d => d.type === 'ALEXA');
  if (!alexaDevice) {
    console.warn('[Session] No ALEXA device in allowedDevices for announcement');
    return;
  }
  alexaService.announce(alexaDevice.id, message).catch((err: unknown) => {
    console.error('[Session] Alexa announcement failed:', err);
  });
}

/**
 * Validate device IDs against cached device list
 * Returns validated AllowedDevice array or error info
 */
function validateDeviceIds(
  deviceIds: readonly string[],
  cachedDevices: readonly Device[] | null
): { ok: true; devices: readonly AllowedDevice[] } | { ok: false; invalidIds: readonly string[] } | { ok: false; cacheUnavailable: true } {
  if (cachedDevices === null) {
    return { ok: false, cacheUnavailable: true };
  }

  const deviceMap = new Map(cachedDevices.map(d => [d.id, d]));
  const invalidIds: string[] = [];
  const validDevices: AllowedDevice[] = [];

  for (const id of deviceIds) {
    const device = deviceMap.get(id);
    if (device) {
      validDevices.push({ id: device.id, type: device.type });
    } else {
      invalidIds.push(id);
    }
  }

  if (invalidIds.length > 0) {
    return { ok: false, invalidIds };
  }

  return { ok: true, devices: validDevices };
}

/**
 * Build SessionResponse from SessionState
 * Requirement 3.4: Include allowedDevices in response
 */
function buildSessionResponse(session: {
  sessionId: string;
  status: 'active' | 'ended';
  startedAt: string;
  endedAt?: string;
  allowedDevices?: readonly AllowedDevice[];
}): SessionResponse {
  const base: SessionResponse = {
    sessionId: session.sessionId,
    status: session.status,
    startedAt: session.startedAt,
  };

  // Add endedAt if present
  const withEndedAt = session.endedAt !== undefined
    ? { ...base, endedAt: session.endedAt }
    : base;

  // Add allowedDevices if present (Requirement 3.4)
  if (session.allowedDevices !== undefined) {
    return { ...withEndedAt, allowedDevices: session.allowedDevices };
  }

  return withEndedAt;
}

/**
 * Create Express router with session API routes
 *
 * @param deps - Dependencies including SessionManager and device cache accessor
 * @returns Express Router with session endpoints
 */
export function createSessionRoutes(
  deps: SessionRouteDependencies | SessionManagerService
): Router {
  // Support both old and new signatures for backward compatibility
  const { sessionManager, getCachedDevices, credentialService, iotServiceFactory, alexaServiceFactory } = isSessionRouteDependencies(deps)
    ? { ...deps, credentialService: deps.credentialService, iotServiceFactory: deps.iotServiceFactory, alexaServiceFactory: deps.alexaServiceFactory }
    : { sessionManager: deps, getCachedDevices: () => null, credentialService: undefined, iotServiceFactory: undefined, alexaServiceFactory: undefined };

  const router = Router();

  /**
   * POST /api/session/start
   * Start a new session with optional allowed devices
   * Requirements: 1.2, 3.1, 3.4, 6.1, 6.2, 6.3, 6.5
   */
  router.post('/start', async (req: Request, res: Response) => {
    try {
      const body = req.body as StartSessionRequestBody | undefined;
      const allowedDeviceIds = body?.allowedDeviceIds;
      const deviceToolOverrides = body?.deviceToolOverrides;

      // If allowedDeviceIds is specified, validate them
      let allowedDevices: readonly AllowedDevice[] | undefined;

      if (allowedDeviceIds !== undefined) {
        // Empty array = no devices selected (IoT-less mode)
        if (allowedDeviceIds.length === 0) {
          allowedDevices = [];
        } else {
          const cachedDevices = getCachedDevices();
          const validationResult = validateDeviceIds(allowedDeviceIds, cachedDevices);

          if (!validationResult.ok) {
            if ('cacheUnavailable' in validationResult) {
              const errorResponse: ErrorResponse = {
                error: {
                  code: 'DEVICE_CACHE_UNAVAILABLE',
                  message: 'Device cache is not available. Please fetch device list first.',
                },
              };
              res.status(503).json(errorResponse);
              return;
            }

            const errorResponse: DeviceValidationErrorResponse = {
              error: {
                code: 'INVALID_DEVICE_ID',
                message: 'One or more device IDs are invalid',
                invalidIds: validationResult.invalidIds,
              },
            };
            res.status(400).json(errorResponse);
            return;
          }

          // Apply deviceToolOverrides to set allowedTools per device
          if (deviceToolOverrides) {
            allowedDevices = validationResult.devices.map(device => {
              const tools = deviceToolOverrides[device.id];
              return tools ? { ...device, allowedTools: tools } : device;
            });
          } else {
            allowedDevices = validationResult.devices;
          }
        }
      }

      // Resolve user identity from auth middleware (Task 6.2, Requirements: 6.1, 6.2, 6.3, 6.5)
      const user = (req as unknown as { user?: AuthenticatedUser | null }).user;
      const uid = user?.uid ?? null;

      // Resolve IoT services for the session
      let sessionIoTServices: SessionIoTServices | undefined;

      if (uid !== null && credentialService !== undefined) {
        // Authenticated user: fetch Nature Remo and Alexa credentials in parallel (Task 4.3, Req 4.1)
        const [natureRemoTokenResult, alexaCookieResult] = await Promise.all([
          iotServiceFactory !== undefined
            ? credentialService.getDecryptedToken(uid, 'nature-remo')
            : Promise.resolve({ ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'no factory' } }),
          alexaServiceFactory !== undefined
            ? credentialService.getDecryptedToken(uid, 'alexa')
            : Promise.resolve({ ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'no factory' } }),
        ]);

        // Process Nature Remo token
        if (natureRemoTokenResult.ok && iotServiceFactory !== undefined) {
          const factoryResult = await iotServiceFactory(natureRemoTokenResult.value);

          if (factoryResult.ok) {
            sessionIoTServices = factoryResult.value;
          } else {
            // Token invalid (Nature Remo API error): abort session start (Requirement 6.5)
            const errorResponse: ErrorResponse = {
              error: {
                code: 'INVALID_IOT_TOKEN',
                message: factoryResult.error.message,
              },
            };
            res.status(400).json(errorResponse);
            return;
          }
        }
        // If token NOT_FOUND or FIRESTORE_ERROR: sessionIoTServices remains undefined (fallback to global)

        // Process Alexa cookie (Task 4.3, Requirements: 4.1, 4.4, 5.2)
        // AlexaService creation failure is non-blocking — session continues without it
        if (alexaCookieResult.ok && alexaServiceFactory !== undefined) {
          try {
            const alexaResult = await alexaServiceFactory(alexaCookieResult.value);
            if (alexaResult.ok) {
              // Merge AlexaService into sessionIoTServices
              if (sessionIoTServices !== undefined) {
                sessionIoTServices = { ...sessionIoTServices, alexaService: alexaResult.value };
              } else {
                sessionIoTServices = {
                  lightService: undefined,
                  airconService: undefined,
                  alexaService: alexaResult.value,
                };
              }
            } else {
              console.warn(`[Session] Failed to create user AlexaService for ${uid}: ${alexaResult.error.message}`);
            }
          } catch (error) {
            console.error(`[Session] Unexpected error creating AlexaService for ${uid}:`, error);
          }
        }
      }
      // Guest mode (uid === null): sessionIoTServices remains undefined (use global)

      // Start session with user identity and optional IoT services
      const session = sessionManager.startSession(uid, allowedDevices, sessionIoTServices);
      const response = buildSessionResponse(session);

      // Alexa announcement on session start (fire-and-forget)
      // Use the session's user-specific AlexaService for the announcement
      const sessionAlexa = sessionIoTServices?.alexaService;
      if (sessionAlexa?.isConnected() && allowedDevices !== undefined) {
        sendAlexaAnnouncement(sessionAlexa, allowedDevices, '今日も頑張りましょう');
      }

      res.json(response);
    } catch (error) {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      res.status(500).json(errorResponse);
    }
  });

  /**
   * POST /api/session/end
   * End a session by sessionId (or the first active session for backward compatibility)
   * Requirements: 1.4, 5.5 (400 error when no active session)
   */
  router.post('/end', (req: Request, res: Response) => {
    try {
      // Support sessionId in request body; fall back to first active session
      const bodySessionId = (req.body as { sessionId?: string } | undefined)?.sessionId;
      const targetSessionId = bodySessionId ?? sessionManager.getStatus()?.sessionId;

      if (targetSessionId === undefined) {
        const errorResponse: ErrorResponse = {
          error: {
            code: ErrorCodes.NO_ACTIVE_SESSION,
            message: 'No active session to end',
          },
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Get session's AlexaService BEFORE ending (endSession deletes iotServices)
      const sessionIoT = sessionManager.getSessionIoTServices(targetSessionId);
      const endAlexaService = sessionIoT?.alexaService;

      const result = sessionManager.endSession(targetSessionId);

      if (!result.ok) {
        const errorResponse: ErrorResponse = {
          error: {
            code: ErrorCodes.NO_ACTIVE_SESSION,
            message: result.error.message,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }

      const response = buildSessionResponse(result.value);

      // Alexa announcement on session end (fire-and-forget)
      // Use the session's user-specific AlexaService retrieved before endSession
      if (endAlexaService?.isConnected() && result.value.allowedDevices !== undefined) {
        sendAlexaAnnouncement(endAlexaService, result.value.allowedDevices, 'お疲れ様でした');
      }

      res.json(response);
    } catch (error) {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      res.status(500).json(errorResponse);
    }
  });

  /**
   * GET /api/session/status
   * Get current session status including allowedDevices for state restoration
   * Requirements: 1.6, 3.2, 3.4
   */
  router.get('/status', (_req: Request, res: Response) => {
    try {
      const session = sessionManager.getStatus();

      const sessionData: SessionResponse | null = session !== null
        ? buildSessionResponse(session)
        : null;

      const response: SessionStatusResponse = {
        hasActiveSession: session !== null,
        session: sessionData,
      };

      res.json(response);
    } catch (error) {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      res.status(500).json(errorResponse);
    }
  });

  return router;
}
