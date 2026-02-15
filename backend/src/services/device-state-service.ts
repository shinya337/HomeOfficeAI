/**
 * DeviceStateService
 *
 * Service that retrieves device states filtered by allowed devices.
 * Supports dynamic device permission by only returning states of allowed devices.
 *
 * Requirements:
 * - 6.1: Only retrieve states of allowed devices
 * - 6.2: Do not retrieve/return states of non-allowed devices
 * - 6.3: Provide filtered device states for AI prompt (handled by caller using the filtered result)
 */

import type { AllowedDevice, DeviceType } from '../types/device-types.js';
import type { Result } from '../types/action-types.js';
import type { ApplianceService, ApplianceInfo } from '../../packages/nature-remo/src/services/appliance-service.js';
import type { AlexaService } from '../../packages/alexa-remote2/src/services/alexa-service.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Light device state
 */
export interface LightDeviceState {
  readonly power: 'on' | 'off';
}

/**
 * Aircon device state
 */
export interface AirconDeviceState {
  readonly temperature: string;
  readonly mode: string;
}

/**
 * Alexa device state
 */
export interface AlexaDeviceState {
  readonly connected: boolean;
  readonly playerState?: string;
}

/**
 * Filtered device state returned by the service
 */
export interface FilteredDeviceState {
  readonly light: LightDeviceState | null;
  readonly aircon: AirconDeviceState | null;
  readonly alexa: AlexaDeviceState | null;
}

/**
 * Error type for device state retrieval
 */
export interface DeviceStateError {
  readonly code: 'API_ERROR' | 'APPLIANCE_NOT_FOUND';
  readonly message: string;
}

/**
 * Dependencies for DeviceStateService
 */
export interface DeviceStateServiceDependencies {
  readonly applianceService?: ApplianceService;
  readonly alexaService?: AlexaService;
}

/**
 * DeviceStateService interface
 */
export interface DeviceStateService {
  /**
   * Get device state filtered by allowed devices
   * @param allowedDevices - List of allowed devices. If undefined, returns all device states (backward compatibility)
   */
  getDeviceState(
    allowedDevices: readonly AllowedDevice[] | undefined
  ): Promise<Result<FilteredDeviceState, DeviceStateError>>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the first allowed device ID for a specific type
 * Returns undefined if no allowed device of that type exists
 */
function getFirstAllowedDeviceId(
  allowedDevices: readonly AllowedDevice[] | undefined,
  type: DeviceType
): string | undefined {
  if (allowedDevices === undefined) {
    return undefined; // Will use first available from API
  }
  const device = allowedDevices.find((d) => d.type === type);
  return device?.id;
}

/**
 * Extract light state from appliance info
 */
function extractLightState(
  appliances: readonly ApplianceInfo[],
  allowedDevices: readonly AllowedDevice[] | undefined
): LightDeviceState | null {
  // Find the target light appliance
  let targetAppliance: ApplianceInfo | undefined;

  if (allowedDevices === undefined) {
    // Backward compatibility: use first available light
    targetAppliance = appliances.find((a) => a.type === 'LIGHT');
  } else {
    // Filter by allowed devices: use first allowed light
    const allowedLightId = getFirstAllowedDeviceId(allowedDevices, 'LIGHT');
    if (allowedLightId === undefined) {
      return null; // No LIGHT type in allowed devices
    }
    targetAppliance = appliances.find(
      (a) => a.id === allowedLightId && a.type === 'LIGHT'
    );
  }

  if (!targetAppliance?.lightState) {
    return null;
  }

  return { power: targetAppliance.lightState.power };
}

/**
 * Extract aircon state from appliance info
 */
function extractAirconState(
  appliances: readonly ApplianceInfo[],
  allowedDevices: readonly AllowedDevice[] | undefined
): AirconDeviceState | null {
  // Find the target aircon appliance
  let targetAppliance: ApplianceInfo | undefined;

  if (allowedDevices === undefined) {
    // Backward compatibility: use first available aircon
    targetAppliance = appliances.find((a) => a.type === 'AC');
  } else {
    // Filter by allowed devices: use first allowed aircon
    const allowedAirconId = getFirstAllowedDeviceId(allowedDevices, 'AC');
    if (allowedAirconId === undefined) {
      return null; // No AC type in allowed devices
    }
    targetAppliance = appliances.find(
      (a) => a.id === allowedAirconId && a.type === 'AC'
    );
  }

  if (!targetAppliance?.airconSettings) {
    return null;
  }

  return {
    temperature: targetAppliance.airconSettings.temperature,
    mode: targetAppliance.airconSettings.mode,
  };
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a DeviceStateService instance
 *
 * @param deps - Service dependencies
 * @returns DeviceStateService implementation
 */
/**
 * Check if ALEXA type is allowed
 */
function isAlexaAllowed(
  allowedDevices: readonly AllowedDevice[] | undefined
): boolean {
  if (allowedDevices === undefined) return true; // all devices allowed
  return allowedDevices.some((d) => d.type === 'ALEXA');
}

/**
 * Get Alexa device state (connected status + player state)
 */
async function extractAlexaState(
  alexaService: AlexaService | undefined,
  allowedDevices: readonly AllowedDevice[] | undefined
): Promise<AlexaDeviceState | null> {
  if (!alexaService) return null;
  if (!isAlexaAllowed(allowedDevices)) return null;

  const connected = alexaService.isConnected();
  if (!connected) {
    return { connected: false };
  }

  // Get first device serial for player info
  const devicesResult = alexaService.getDevices();
  if (!devicesResult.success || devicesResult.data.length === 0) {
    return { connected: true };
  }

  const firstDevice = devicesResult.data[0];
  const playerResult = await alexaService.getPlayerInfo(firstDevice.serialNumber);
  if (!playerResult.success) {
    return { connected: true };
  }

  return { connected: true, playerState: playerResult.data.state };
}

export function createDeviceStateService(
  deps: DeviceStateServiceDependencies
): DeviceStateService {
  const { applianceService, alexaService } = deps;

  return {
    async getDeviceState(
      allowedDevices: readonly AllowedDevice[] | undefined
    ): Promise<Result<FilteredDeviceState, DeviceStateError>> {
      // Fetch all appliances from Nature Remo API (if available)
      let appliances: ApplianceInfo[] = [];
      if (applianceService) {
        const apiResult = await applianceService.getAppliances();
        if (!apiResult.success) {
          return {
            ok: false,
            error: {
              code: 'API_ERROR',
              message: apiResult.error.message,
            },
          };
        }
        appliances = apiResult.data;
      }
      // Extract states filtered by allowed devices (Req 6.1, 6.2)
      const light = extractLightState(appliances, allowedDevices);
      const aircon = extractAirconState(appliances, allowedDevices);
      const alexa = await extractAlexaState(alexaService, allowedDevices);

      return {
        ok: true,
        value: { light, aircon, alexa },
      };
    },
  };
}
