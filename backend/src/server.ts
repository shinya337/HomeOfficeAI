import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionRoutes } from './handlers/session-handler.js';
import { createAnalyzeRoutes, type AnalyzeHandlerDependencies } from './handlers/analyze-handler.js';
import { createDeviceRoutes, createDeviceCache, type DeviceCache } from './handlers/device-handler.js';
import { createSessionManager, SessionManagerService } from './services/session-manager.js';
import { createAnalyzeHandler, type AnalyzeHandlerService } from './services/analyze-handler.js';
import { createDeviceStateService } from './services/device-state-service.js';
import { createDynamicToolBuilder } from './services/dynamic-tool-builder.js';
import {
  loadIntegrationConfig,
  createAgentClient,
  createNatureRemoClient,
  createRateLimitMonitor,
  createApplianceService,
  createLightService,
  createAirconService,
  type ApplianceService,
} from './config/index.js';
import {
  createAlexaService,
  loadAlexaConfig,
  type AlexaService,
} from './config/component-imports.js';
// Use local ActionDispatcher which takes allowedDevices (Req 7.1, 7.2)
import { createActionDispatcher } from './dispatcher/action-dispatcher.js';
// Firebase Auth integration (Task 6.1, Requirements: 3.5, 4.4)
import { type FirebaseServices, getFirebaseServices, resetFirebaseServices } from './config/firebase-config.js';
import { createAuthMiddleware } from './middleware/auth-middleware.js';
import { createCredentialRoutes } from './handlers/credential-handler.js';
import { createCredentialService, type CredentialService } from './services/credential-service.js';
import { createEncryptionService } from './services/encryption-service.js';
import { loadCredentialEncryptionKey } from './config/credential-env.js';

// Load environment variables
dotenv.config();

// Types for user device fetching (Task 10.2-fix-1)
import type { Device } from './types/device-types.js';
import type { AuthenticatedUser } from './types/auth-types.js';

/**
 * Callback to fetch devices using a user's Nature Remo token.
 * Returns the same shape as DeviceHandlerService.getDevices().
 *
 * Task 10.2-fix-1
 */
export type UserDeviceFetcher = (
  token: string
) => Promise<
  | { ok: true; devices: readonly Device[] }
  | { ok: false; error: { code: string; message: string; retryAfter?: number } }
>;

/**
 * Map an appliance type string to a valid DeviceType.
 * Unknown types default to 'IR' (custom remote).
 * Task 10.2-fix-1
 */
function toDeviceType(applianceType: string): Device['type'] {
  const validTypes = ['LIGHT', 'AC', 'TV', 'IR'] as const;
  if (validTypes.includes(applianceType as typeof validTypes[number])) {
    return applianceType as Device['type'];
  }
  return 'IR';
}

/**
 * Convert an ApplianceInfo-like object to a Device.
 * Task 10.2-fix-1
 */
function toDevice(appliance: { id: string; nickname: string; type: string }): Device {
  return {
    id: appliance.id,
    name: appliance.nickname,
    type: toDeviceType(appliance.type),
  };
}

/**
 * Send an error response for appliance API failures.
 * Handles rate limit (429) and general API errors (503).
 * Task 10.2-fix-1
 */
function sendApplianceErrorResponse(
  res: Response,
  error: { message: string; cause?: { code?: string; message?: string; retryAfter?: number } }
): void {
  const cause = error.cause;
  if (cause && cause.code === 'RATE_LIMIT') {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: cause.message,
        ...(cause.retryAfter !== undefined && { retryAfter: cause.retryAfter }),
      },
    });
    return;
  }
  res.status(503).json({
    error: {
      code: 'NATURE_API_ERROR',
      message: error.message,
    },
  });
}

// Singleton instances for the server
let sharedSessionManager: SessionManagerService | null = null;
let sharedAnalyzeHandler: AnalyzeHandlerService | null = null;
let sharedDeviceCache: DeviceCache | null = null;
let sharedApplianceService: ApplianceService | null = null;
let sharedAlexaService: AlexaService | null = null;
let alexaServiceInitPromise: Promise<AlexaService> | null = null;
let sharedCredentialService: CredentialService | null = null;

/**
 * Get or create the shared session manager instance
 */
export function getSessionManager(): SessionManagerService {
  if (sharedSessionManager === null) {
    sharedSessionManager = createSessionManager();
  }
  return sharedSessionManager;
}

/**
 * Reset the session manager (useful for testing)
 */
export function resetSessionManager(): void {
  sharedSessionManager = null;
}

/**
 * Get or create the shared device cache instance (5min TTL)
 */
export function getDeviceCache(): DeviceCache {
  if (sharedDeviceCache === null) {
    sharedDeviceCache = createDeviceCache();
  }
  return sharedDeviceCache;
}

/**
 * Get or create the shared appliance service instance
 * Returns null if Nature Remo token is not configured
 */
export function getApplianceService(): ApplianceService | null {
  if (sharedApplianceService === null) {
    const token = process.env.NATURE_REMO_TOKEN;
    if (!token || token.trim() === '') {
      return null;
    }

    const rateLimitMonitor = createRateLimitMonitor();
    const natureRemoClient = createNatureRemoClient(token, rateLimitMonitor);
    sharedApplianceService = createApplianceService(natureRemoClient);
  }
  return sharedApplianceService;
}

/**
 * Get the shared AlexaService instance.
 * AlexaService is always created (even when not connected), following the design
 * that unconnected instances return AUTH_ERROR on method calls.
 *
 * Uses synchronous init: createAlexaService resolves immediately in test/no-cookie scenarios.
 * Returns null only if AlexaService hasn't been initialized yet (call initAlexaService first).
 *
 * Task 5.1 Requirements: 1.3, 9.2
 */
export function getAlexaService(): AlexaService | null {
  if (sharedAlexaService !== null) {
    return sharedAlexaService;
  }

  // Lazy initialization: start async init and block on it via cache
  if (alexaServiceInitPromise === null) {
    const configResult = loadAlexaConfig();
    if (!configResult.success) {
      console.warn(
        `[Server] Alexa config error: ${configResult.error.message}. AlexaService will not be available.`
      );
      return null;
    }

    alexaServiceInitPromise = createAlexaService(configResult.data);
    // Note: createAlexaService is async. We resolve it and cache the result.
    // For synchronous access, we rely on the promise being awaited during server init.
    alexaServiceInitPromise.then((service) => {
      sharedAlexaService = service;
    });
  }

  return sharedAlexaService;
}

/**
 * Initialize AlexaService asynchronously.
 * Should be called during server startup to ensure the service is ready.
 *
 * Task 5.1 Requirements: 1.3, 9.2
 */
export async function initAlexaService(): Promise<AlexaService | null> {
  if (sharedAlexaService !== null) {
    return sharedAlexaService;
  }

  const configResult = loadAlexaConfig();
  if (!configResult.success) {
    console.warn(
      `[Server] Alexa config error: ${configResult.error.message}. AlexaService will not be available.`
    );
    return null;
  }

  try {
    sharedAlexaService = await createAlexaService(configResult.data);
    alexaServiceInitPromise = Promise.resolve(sharedAlexaService);
    console.log(
      `[Server] AlexaService initialized (connected: ${sharedAlexaService.isConnected()})`
    );
    return sharedAlexaService;
  } catch (error) {
    console.warn('[Server] Failed to initialize AlexaService:', error);
    return null;
  }
}

/**
 * Reset the AlexaService (useful for testing)
 */
export function resetAlexaService(): void {
  sharedAlexaService = null;
  alexaServiceInitPromise = null;
}

/**
 * Reset Firebase integration state (useful for testing).
 * Clears shared credential service and Firebase services singleton.
 *
 * Task 6.1 Requirements: 3.5, 4.4
 */
export function resetFirebaseIntegration(): void {
  sharedCredentialService = null;
  resetFirebaseServices();
}

/**
 * Reset the appliance service singleton (useful for testing).
 * Task 10.2-fix-1
 */
export function resetApplianceServiceSingleton(): void {
  sharedApplianceService = null;
}

/**
 * Get or create the shared analyze handler instance
 * This lazy-loads the handler with all required dependencies
 */
export function getAnalyzeHandler(): AnalyzeHandlerService | null {
  if (sharedAnalyzeHandler === null) {
    // Load configuration
    const configResult = loadIntegrationConfig();
    if (!configResult.ok) {
      console.warn(
        `[Server] Integration config not available: ${configResult.error.message}. ` +
        'Analyze endpoint will not be functional until environment is properly configured.'
      );
      return null;
    }

    const config = configResult.value;

    try {
      // Create dependencies
      // 1. Create Nature Remo client chain (optional - IoT features disabled without token)
      let applianceService: ReturnType<typeof createApplianceService> | null = null;
      let lightService: ReturnType<typeof createLightService> | null = null;
      let realAirconService: ReturnType<typeof createAirconService> | null = null;

      try {
        const rateLimitMonitor = createRateLimitMonitor();
        const natureRemoClient = createNatureRemoClient(
          config.agentConfig.natureRemoToken,
          rateLimitMonitor
        );
        applianceService = createApplianceService(natureRemoClient);
        lightService = createLightService(natureRemoClient);
        realAirconService = createAirconService(natureRemoClient);
      } catch {
        console.warn('[Server] Nature Remo not configured. IoT features disabled, Web Speech API fallback active.');
      }

      // 2. Get AlexaService if available (Task 5.1, Req 1.3, 9.2)
      const alexaService = getAlexaService();

      // 3. Create DeviceStateService with new allowedDevices support (Req 6.1)
      const deviceStateService = createDeviceStateService({
        ...(applianceService ? { applianceService } : {}),
        ...(alexaService ? { alexaService } : {}),
      });

      // 4. Create DynamicToolBuilder for dynamic tool generation (Req 4.1, 4.2)
      const dynamicToolBuilder = createDynamicToolBuilder();
      const agentClient = createAgentClient(config.agentConfig);

      // 5. Create ActionDispatcher (IoT services are optional)
      const airconServiceAdapter = realAirconService ? {
        async setTemperature(applianceId: string, temperature: number, mode?: string) {
          const settings: { temperature?: string; operation_mode?: string } = {
            temperature: String(temperature),
          };
          if (mode) {
            settings.operation_mode = mode;
          }
          const result = await realAirconService!.updateSettings(applianceId, settings);
          if (result.success) {
            return { success: true as const, data: { applianceId, temperature } };
          }
          return result;
        },
        async powerOff(applianceId: string) {
          const result = await realAirconService!.updateSettings(applianceId, { button: 'power-off' });
          if (result.success) {
            return { success: true as const, data: { applianceId } };
          }
          return result;
        },
      } : null;

      // ActionDispatcher factory: creates a new dispatcher per-request
      // with session's allowedDevices and optional session-specific IoT services (Req 7.1, 7.2, Task 6.3)
      const actionDispatcherFactory = (
        allowedDevices: readonly import('./types/device-types.js').AllowedDevice[],
        sessionIoTServices?: import('./types/session-types.js').SessionIoTServices,
      ) =>
        createActionDispatcher(allowedDevices, {
          ...(sessionIoTServices?.lightService ?? lightService ? { lightService: sessionIoTServices?.lightService ?? lightService! } : {}),
          ...(sessionIoTServices?.airconService ?? airconServiceAdapter ? { airconService: sessionIoTServices?.airconService ?? airconServiceAdapter! } : {}),
          ...(alexaService ? { alexaService } : {}),
        });

      sharedAnalyzeHandler = createAnalyzeHandler({
        sessionManager: getSessionManager(),
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      });
    } catch (error) {
      console.warn('[Server] Failed to create analyze handler:', error);
      return null;
    }
  }
  return sharedAnalyzeHandler;
}

/**
 * Reset the analyze handler (useful for testing)
 */
export function resetAnalyzeHandler(): void {
  sharedAnalyzeHandler = null;
}

/**
 * Set a custom analyze handler (useful for testing/mocking)
 */
export function setAnalyzeHandler(handler: AnalyzeHandlerService): void {
  sharedAnalyzeHandler = handler;
}

/**
 * Resolve CORS allowed origins from ALLOWED_ORIGINS environment variable.
 * If ALLOWED_ORIGINS is set, parse comma-separated origins.
 * If not set or empty, return default localhost development ports.
 * Requirements: 3.4, 3.5, 6.1, 6.2, 6.3, 6.4
 */
export function resolveAllowedOrigins(): string[] {
  const envValue = process.env['ALLOWED_ORIGINS'];
  if (envValue !== undefined && envValue.trim() !== '') {
    return envValue
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '');
  }
  return ['http://localhost:5173', 'http://localhost:5174'];
}

/**
 * Attempt to initialize Firebase services from environment variables.
 * Returns null if Firebase is not configured (graceful degradation).
 *
 * Task 6.1 Requirements: 3.5
 */
function tryInitializeFirebaseServices(): FirebaseServices | null {
  try {
    return getFirebaseServices();
  } catch {
    return null;
  }
}

/**
 * Get or create the shared CredentialService instance.
 * Creates encryption service from environment and credential service with Firestore.
 * Returns null if encryption key is not configured.
 *
 * Task 6.1 Requirements: 4.4
 */
function getOrCreateCredentialService(
  firebaseServices: FirebaseServices
): CredentialService | null {
  if (sharedCredentialService !== null) {
    return sharedCredentialService;
  }

  const keyResult = loadCredentialEncryptionKey();
  if (!keyResult.ok) {
    console.warn(
      `[Server] Credential encryption key not available: ${keyResult.error.message}. ` +
      'Credential routes will not be functional.'
    );
    return null;
  }

  const encryptionService = createEncryptionService(keyResult.value);
  sharedCredentialService = createCredentialService({
    firestore: firebaseServices.firestore,
    encryptionService,
  });

  console.log('[Server] CredentialService initialized with encryption');
  return sharedCredentialService;
}

/**
 * Options for createApp
 */
export interface CreateAppOptions {
  /** Path to the frontend build output directory for static file serving.
   *  When provided and the directory exists, enables static file serving and SPA fallback.
   *  Requirements: 1.3, 1.4 */
  frontendDistPath?: string;
  /** Firebase Admin SDK services for auth middleware and credential management.
   *  When provided, enables auth middleware on /api routes and credential endpoints.
   *  When omitted, attempts to initialize from environment variables.
   *  Task 6.1 Requirements: 3.5, 4.4 */
  firebaseServices?: FirebaseServices;
  /** Credential service for fetching user IoT tokens.
   *  When provided, enables user-specific device fetching in /api/devices.
   *  Task 10.2-fix-1 */
  credentialService?: CredentialService;
  /** Callback to fetch devices using a user's Nature Remo token.
   *  When provided with credentialService, enables user-specific device lists.
   *  Task 10.2-fix-1 */
  userDeviceFetcher?: UserDeviceFetcher;
}

/**
 * Create and configure Express application
 * Requirements: 5.1, 5.3, 5.4, 1.3, 1.4
 */
export function createApp(options?: CreateAppOptions): Express {
  const app = express();

  // CORS configuration - dynamically resolved from ALLOWED_ORIGINS env var
  // Requirements: 3.4, 3.5, 6.1, 6.2, 6.3, 6.4
  app.use(
    cors({
      origin: resolveAllowedOrigins(),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // JSON body parser with 10MB limit for Base64 image data
  // Requirement: 5.4
  app.use(express.json({ limit: '10mb' }));

  // Firebase Auth middleware integration (Task 6.1, Requirements: 3.5, 4.4)
  // Apply optional auth middleware to all /api routes when Firebase is available
  const firebaseServices = options?.firebaseServices ?? tryInitializeFirebaseServices();

  if (firebaseServices !== null) {
    const authMiddleware = createAuthMiddleware(firebaseServices.auth);
    const optionalAuth = authMiddleware.createOptionalAuthMiddleware();
    const requireAuth = authMiddleware.createRequireAuthMiddleware();

    // Apply optional auth to all /api routes (after JSON parser, before route handlers)
    app.use('/api', optionalAuth);

    // Register credential routes with require auth guard (Task 6.1, Requirements: 3.5, 4.4)
    const credentialService = getOrCreateCredentialService(firebaseServices);
    if (credentialService !== null) {
      app.use('/api/credentials', requireAuth, createCredentialRoutes({ credentialService }));
    }

    console.log('[Server] Firebase Auth middleware enabled on /api routes');
  } else {
    console.warn(
      '[Server] Firebase services not available. Auth middleware and credential routes disabled.'
    );
  }

  // Health check endpoint (moved to /api/health for Cloud Run compatibility)
  // Requirement: 2.4
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Echo endpoint for testing JSON parsing
  app.post('/api/echo', (req: Request, res: Response) => {
    res.json({ received: req.body });
  });

  // Session API routes
  // Requirements: 1.2, 1.4, 1.6, 5.5, 3.1, 3.2, 3.4
  const sessionManager = getSessionManager();
  const deviceCache = getDeviceCache();
  app.use('/api/session', createSessionRoutes({
    sessionManager,
    getCachedDevices: () => deviceCache.get(),
    alexaService: getAlexaService(),
  }));

  // Device API routes
  // Requirements: 1.1, 1.2, 1.3, 1.4
  // Task 10.2-fix-1: Support user-specific Nature Remo tokens from Firestore
  const applianceService = getApplianceService();
  const deviceCredentialService = options?.credentialService ?? (firebaseServices !== null ? getOrCreateCredentialService(firebaseServices) : null);
  const userDeviceFetcher = options?.userDeviceFetcher;

  if (applianceService !== null || deviceCredentialService !== null) {
    // Register device routes that support both global and user-specific tokens
    // When a user is authenticated and has a saved token, use their token.
    // Otherwise fall back to the global applianceService.
    if (applianceService !== null && deviceCredentialService === null) {
      // Simple case: no credential service, just use global
      app.use('/api', createDeviceRoutes({
        applianceService,
        getCachedDevices: () => deviceCache.get(),
        setCachedDevices: (devices) => deviceCache.set(devices),
        alexaService: getAlexaService(),
      }));
    } else {
      // Enhanced case: check for user-specific token before falling back to global
      // Task 10.2-fix-1
      app.get('/api/devices', async (req: Request, res: Response) => {
        try {
          const user = (req as unknown as { user?: AuthenticatedUser | null }).user;

          // If authenticated user, try to get their saved Nature Remo token
          if (user !== null && user !== undefined && deviceCredentialService !== null) {
            const tokenResult = await deviceCredentialService.getDecryptedToken(user.uid, 'nature-remo');

            if (tokenResult.ok) {
              // User has a saved token -> fetch devices using their token
              if (userDeviceFetcher !== undefined) {
                const result = await userDeviceFetcher(tokenResult.value);
                if (result.ok) {
                  deviceCache.set(result.devices);
                  res.json({ devices: result.devices });
                  return;
                }
                // User's token fetch failed -> return the error
                const status = result.error.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 503;
                res.status(status).json({ error: result.error });
                return;
              }
              // No userDeviceFetcher provided -> create default using NatureRemoClient
              const rateLimitMonitor = createRateLimitMonitor();
              const userNatureRemoClient = createNatureRemoClient(tokenResult.value, rateLimitMonitor);
              const userApplianceService = createApplianceService(userNatureRemoClient);
              const userResult = await userApplianceService.getAppliances();

              if (userResult.success) {
                const devices: Device[] = userResult.data.map(toDevice);
                deviceCache.set(devices);
                res.json({ devices });
                return;
              }
              // User's token API failed -> return error
              sendApplianceErrorResponse(res, userResult.error);
              return;
            }
            // User has no saved token (NOT_FOUND or error) -> fall through to global
          }

          // Fall back to global applianceService (guest mode or user without token)
          if (applianceService !== null) {
            // Check cache first
            const cached = deviceCache.get();
            if (cached !== null) {
              res.json({ devices: cached });
              return;
            }

            const result = await applianceService.getAppliances();
            if (result.success) {
              const devices: Device[] = result.data.map(toDevice);

              // Append Alexa devices if available
              const alexaService = getAlexaService();
              if (alexaService && alexaService.isConnected()) {
                const alexaResult = alexaService.getDevices();
                if (alexaResult.success) {
                  for (const alexaDevice of alexaResult.data) {
                    devices.push({
                      id: alexaDevice.serialNumber,
                      name: alexaDevice.name,
                      type: 'ALEXA',
                    });
                  }
                }
              }

              deviceCache.set(devices);
              res.json({ devices });
              return;
            }

            sendApplianceErrorResponse(res, result.error);
            return;
          }

          // No global token and user has no saved token -> empty list
          res.json({ devices: [] });
        } catch (error) {
          console.error('[Server] Device fetch error:', error);
          res.status(500).json({
            error: {
              code: 'INTERNAL_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
          });
        }
      });
    }
  } else {
    // No global token and no credential service -> always return empty list
    app.get('/api/devices', (_req: Request, res: Response) => {
      res.json({ devices: [] });
    });
  }

  // Analyze API route
  // Requirements: 3.1, 3.3, 3.4, 4.3, 4.4, 6.5
  const analyzeHandler = getAnalyzeHandler();
  if (analyzeHandler !== null) {
    const analyzeRouteDeps: AnalyzeHandlerDependencies = {
      sessionManager,
      analyzeHandler,
    };
    app.use('/api', createAnalyzeRoutes(analyzeRouteDeps));
  } else {
    // Fallback endpoint when analyze handler is not available
    app.post('/api/analyze', (_req: Request, res: Response) => {
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Analyze service is not configured. Check server environment.',
        },
      });
    });
  }

  // Static file serving and SPA fallback
  // Requirements: 1.3, 1.4
  // Only enabled when frontendDistPath is provided and the directory exists
  const frontendDistPath = options?.frontendDistPath;
  if (frontendDistPath !== undefined && fs.existsSync(frontendDistPath)) {
    // Serve static files from the frontend build output directory
    app.use(express.static(frontendDistPath));

    // SPA fallback: serve index.html for all non-API routes
    // This must come after all API routes and static file middleware
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  }

  return app;
}

/**
 * Start HTTP server on specified port.
 * Initializes AlexaService before starting to ensure it's ready for requests.
 * Requirement: 5.1
 */
export async function startServer(port: number = 3001): Promise<ReturnType<Express['listen']>> {
  // Initialize AlexaService before creating the app (Req 9.2)
  // This ensures the service is ready when the first request arrives.
  await initAlexaService();

  // Default frontend dist path for production container
  // Requirements: 1.3, 1.4
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultFrontendDistPath = path.resolve(currentDir, '..', 'frontend-dist');
  const app = createApp({ frontendDistPath: defaultFrontendDistPath });

  return app.listen(port, () => {
    console.log(`HomeOffice API server running on port ${port}`);
    if (fs.existsSync(defaultFrontendDistPath)) {
      console.log(`Serving static files from ${defaultFrontendDistPath}`);
    }
  });
}

// Main entry point - start server if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  startServer(port);
}
