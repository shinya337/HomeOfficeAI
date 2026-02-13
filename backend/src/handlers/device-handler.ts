/**
 * Device Handler
 *
 * HTTP handler for GET /api/devices endpoint.
 * Retrieves device list from Nature Remo API with caching.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { Router, Request, Response } from 'express';
import type { ApplianceService, ApplianceInfo } from '../config/component-imports.js';
import type { Device, DeviceType, DeviceListResponse, DeviceErrorResponse } from '../types/device-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Device cache interface for in-memory caching
 */
export interface DeviceCache {
  /**
   * Get cached devices if available and not expired
   * @returns Cached devices or null if cache is empty/expired
   */
  get(): readonly Device[] | null;

  /**
   * Set devices in cache
   * @param devices - Devices to cache
   */
  set(devices: readonly Device[]): void;

  /**
   * Clear the cache
   */
  clear(): void;
}

/**
 * AlexaService interface for device listing (subset of full AlexaService)
 */
export interface AlexaServiceForDevices {
  getDevices(): { success: true; data: readonly { serialNumber: string; name: string; family: string }[] } | { success: false; error: unknown };
  isConnected(): boolean;
}

/**
 * Dependencies for DeviceHandler
 */
export interface DeviceHandlerDependencies {
  readonly applianceService: ApplianceService;
  readonly getCachedDevices: () => readonly Device[] | null;
  readonly setCachedDevices: (devices: readonly Device[]) => void;
  readonly alexaService?: AlexaServiceForDevices | null;
}

/**
 * Device handler service interface
 */
interface DeviceHandlerService {
  /**
   * Get all devices from Nature Remo API or cache
   */
  getDevices(): Promise<
    | { ok: true; devices: readonly Device[] }
    | { ok: false; error: DeviceErrorResponse['error'] }
  >;
}

// ============================================================================
// Cache Implementation
// ============================================================================

/** Default cache TTL: 5 minutes (Requirement: rate limit mitigation) */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Create a device cache with TTL
 *
 * @param ttlMs - Time to live in milliseconds (default: 5 minutes)
 * @returns DeviceCache instance
 */
export function createDeviceCache(ttlMs: number = DEFAULT_CACHE_TTL_MS): DeviceCache {
  let cachedDevices: readonly Device[] | null = null;
  let cacheTimestamp: number = 0;

  return {
    get(): readonly Device[] | null {
      if (cachedDevices === null) {
        return null;
      }

      const now = Date.now();
      if (now - cacheTimestamp > ttlMs) {
        // Cache expired
        cachedDevices = null;
        cacheTimestamp = 0;
        return null;
      }

      return cachedDevices;
    },

    set(devices: readonly Device[]): void {
      cachedDevices = devices;
      cacheTimestamp = Date.now();
    },

    clear(): void {
      cachedDevices = null;
      cacheTimestamp = 0;
    },
  };
}

// ============================================================================
// Handler Implementation
// ============================================================================

/**
 * Map ApplianceInfo type to DeviceType
 * Handles string type from Nature Remo API
 */
function mapToDeviceType(applianceType: string): DeviceType {
  const validTypes: DeviceType[] = ['LIGHT', 'AC', 'TV', 'IR'];
  if (validTypes.includes(applianceType as DeviceType)) {
    return applianceType as DeviceType;
  }
  // Unknown types default to IR (custom remote)
  return 'IR';
}

/**
 * Convert ApplianceInfo to Device
 * Normalizes the response format (nickname -> name)
 */
function toDevice(appliance: ApplianceInfo): Device {
  return {
    id: appliance.id,
    name: appliance.nickname,
    type: mapToDeviceType(appliance.type),
  };
}

/**
 * Create device handler service
 *
 * @param deps - Dependencies including applianceService and cache functions
 * @returns DeviceHandlerService
 */
export function createDeviceHandler(deps: DeviceHandlerDependencies): DeviceHandlerService {
  const { applianceService, getCachedDevices, setCachedDevices, alexaService } = deps;

  return {
    async getDevices() {
      // Check cache first
      const cached = getCachedDevices();
      if (cached !== null) {
        return { ok: true, devices: cached };
      }

      // Fetch from Nature Remo API
      const result = await applianceService.getAppliances();

      if (!result.success) {
        // Check for rate limit error (Requirement 1.4)
        const cause = result.error.cause;
        if (cause && cause.code === 'RATE_LIMIT') {
          return {
            ok: false as const,
            error: {
              code: 'RATE_LIMIT_EXCEEDED' as const,
              message: cause.message,
              ...(cause.retryAfter !== undefined && { retryAfter: cause.retryAfter }),
            },
          };
        }

        // API error (Requirement 1.3)
        return {
          ok: false as const,
          error: {
            code: 'NATURE_API_ERROR' as const,
            message: result.error.message,
          },
        };
      }

      // Convert to normalized Device format (Requirement 1.2)
      const devices: Device[] = result.data.map(toDevice);

      // Append Alexa devices if available
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

      // Cache the result
      setCachedDevices(devices);

      return { ok: true, devices };
    },
  };
}

// ============================================================================
// Express Routes
// ============================================================================

/**
 * Create Express router for device endpoints
 *
 * @param deps - Dependencies for the handler
 * @returns Express Router with /devices route
 */
export function createDeviceRoutes(deps: DeviceHandlerDependencies): Router {
  const router = Router();
  const handler = createDeviceHandler(deps);

  /**
   * GET /api/devices
   *
   * Returns list of registered devices from Nature Remo.
   *
   * Success Response (200):
   * { devices: [{ id, name, type }] }
   *
   * Error Responses:
   * - 503: Nature Remo API error
   * - 429: Rate limit exceeded (includes retryAfter)
   */
  router.get('/devices', async (_req: Request, res: Response) => {
    const result = await handler.getDevices();

    if (!result.ok) {
      const status = result.error.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 503;
      const response: DeviceErrorResponse = { error: result.error };
      res.status(status).json(response);
      return;
    }

    const response: DeviceListResponse = { devices: result.devices };
    res.json(response);
  });

  return router;
}
