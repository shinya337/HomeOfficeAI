import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

// Load environment variables
dotenv.config();

// Singleton instances for the server
let sharedSessionManager: SessionManagerService | null = null;
let sharedAnalyzeHandler: AnalyzeHandlerService | null = null;
let sharedDeviceCache: DeviceCache | null = null;
let sharedApplianceService: ApplianceService | null = null;
let sharedAlexaService: AlexaService | null = null;
let alexaServiceInitPromise: Promise<AlexaService> | null = null;

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

    // Create dependencies
    // 1. Create Nature Remo client chain
    const rateLimitMonitor = createRateLimitMonitor();
    const natureRemoClient = createNatureRemoClient(
      config.agentConfig.natureRemoToken,
      rateLimitMonitor
    );
    const applianceService = createApplianceService(natureRemoClient);

    // 2. Get AlexaService if available (Task 5.1, Req 1.3, 9.2)
    const alexaService = getAlexaService();

    // 3. Create DeviceStateService with new allowedDevices support (Req 6.1)
    const deviceStateService = createDeviceStateService({
      applianceService,
      ...(alexaService ? { alexaService } : {}),
    });

    // 4. Create DynamicToolBuilder for dynamic tool generation (Req 4.1, 4.2)
    const dynamicToolBuilder = createDynamicToolBuilder();

    try {
      const agentClient = createAgentClient(config.agentConfig);

      // 5. Create LightService and AirconService for ActionDispatcher
      const lightService = createLightService(natureRemoClient);
      const realAirconService = createAirconService(natureRemoClient);

      // Adapter: bridge real AirconService.updateSettings() to dispatcher's setTemperature()/powerOff()
      const airconServiceAdapter = {
        async setTemperature(applianceId: string, temperature: number, mode?: string) {
          const settings: { temperature?: string; operation_mode?: string } = {
            temperature: String(temperature),
          };
          if (mode) {
            settings.operation_mode = mode;
          }
          const result = await realAirconService.updateSettings(applianceId, settings);
          if (result.success) {
            return { success: true as const, data: { applianceId, temperature } };
          }
          return result;
        },
        async powerOff(applianceId: string) {
          const result = await realAirconService.updateSettings(applianceId, { button: 'power-off' });
          if (result.success) {
            return { success: true as const, data: { applianceId } };
          }
          return result;
        },
      };

      // ActionDispatcher factory: creates a new dispatcher per-request
      // with session's allowedDevices (Req 7.1, 7.2)
      const actionDispatcherFactory = (allowedDevices: readonly import('./types/device-types.js').AllowedDevice[]) =>
        createActionDispatcher(allowedDevices, {
          lightService,
          airconService: airconServiceAdapter,
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
 * Create and configure Express application
 * Requirements: 5.1, 5.3, 5.4
 */
export function createApp(): Express {
  const app = express();

  // CORS configuration - allow requests from frontend (localhost:5173)
  // Requirement: 5.3
  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:8080'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // JSON body parser with 10MB limit for Base64 image data
  // Requirement: 5.4
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
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
  const applianceService = getApplianceService();
  if (applianceService !== null) {
    app.use('/api', createDeviceRoutes({
      applianceService,
      getCachedDevices: () => deviceCache.get(),
      setCachedDevices: (devices) => deviceCache.set(devices),
      alexaService: getAlexaService(),
    }));
  } else {
    // Fallback endpoint when Nature Remo is not configured — return empty list
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

  const app = createApp();

  return app.listen(port, () => {
    console.log(`HomeOffice API server running on port ${port}`);
  });
}

// Main entry point - start server if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  startServer(port);
}
