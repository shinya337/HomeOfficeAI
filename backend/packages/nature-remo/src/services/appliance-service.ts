/**
 * Appliance Service
 *
 * Provides appliance listing and lookup functionality.
 * Formats appliance data with type-specific information (AC settings, light state).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import type { NatureRemoClient } from '../client/nature-remo-client.js';
import type {
  Result,
  ServiceError,
  Appliance,
  AirconSettings,
  LightState,
} from '../types/types.js';

// ============================================================================
// Service Interface Types
// ============================================================================

/**
 * Formatted aircon settings for display.
 */
export interface AirconCurrentSettings {
  /** Temperature setting */
  temperature: string;
  /** Operation mode */
  mode: string;
  /** Air volume */
  volume: string;
  /** Power state */
  power: 'on' | 'off';
}

/**
 * Formatted light state for display.
 */
export interface LightCurrentState {
  /** Power state */
  power: 'on' | 'off';
  /** Brightness level (optional) */
  brightness?: string;
}

/**
 * Formatted appliance information for display.
 */
export interface ApplianceInfo {
  /** Unique appliance identifier */
  id: string;
  /** User-defined nickname */
  nickname: string;
  /** Appliance type */
  type: string;
  /** Aircon settings (only for AC type with settings) */
  airconSettings?: AirconCurrentSettings;
  /** Light state (only for LIGHT type with state) */
  lightState?: LightCurrentState;
  /** Custom signal names (only for LIGHT type) */
  signals?: readonly string[];
}

/**
 * ApplianceService interface.
 */
export interface ApplianceService {
  /**
   * Get all registered appliances.
   * @returns Result with ApplianceInfo array on success, ServiceError on failure
   */
  getAppliances(): Promise<Result<ApplianceInfo[], ServiceError>>;

  /**
   * Get a specific appliance by ID.
   * @param id - Appliance ID to find
   * @returns Result with ApplianceInfo on success, ServiceError on failure
   */
  getApplianceById(id: string): Promise<Result<ApplianceInfo, ServiceError>>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create an ApplianceService instance.
 *
 * @param client - NatureRemoClient for API calls
 * @returns ApplianceService instance
 */
export function createApplianceService(client: NatureRemoClient): ApplianceService {
  /**
   * Format aircon settings for display.
   * Converts API response format to user-friendly format.
   */
  function formatAirconSettings(settings: AirconSettings): AirconCurrentSettings {
    return {
      temperature: settings.temp,
      mode: settings.mode,
      volume: settings.vol,
      power: settings.button === 'power-off' ? 'off' : 'on',
    };
  }

  /**
   * Format light state for display.
   */
  function formatLightState(state: LightState): LightCurrentState {
    const result: LightCurrentState = {
      power: state.power,
    };

    if (state.brightness !== undefined) {
      result.brightness = state.brightness;
    }

    return result;
  }

  /**
   * Convert raw Appliance to formatted ApplianceInfo.
   */
  function toApplianceInfo(appliance: Appliance): ApplianceInfo {
    const info: ApplianceInfo = {
      id: appliance.id,
      nickname: appliance.nickname,
      type: appliance.type,
    };

    // Add aircon settings if AC type and settings exist (Req 3.3)
    if (appliance.type === 'AC' && appliance.settings) {
      info.airconSettings = formatAirconSettings(appliance.settings);
    }

    // Add light state if LIGHT type and state exists (Req 3.4)
    if (appliance.type === 'LIGHT' && appliance.light?.state) {
      info.lightState = formatLightState(appliance.light.state);
    }

    // Extract signal names for LIGHT type (dynamic-light-signals Req 1.1, 1.2)
    if (appliance.type === 'LIGHT') {
      info.signals = appliance.signals?.map(s => s.name) ?? [];
    }

    return info;
  }

  /**
   * Wrap API error in ServiceError.
   */
  function wrapApiError(apiError: { code: string; message: string }): ServiceError {
    return {
      code: 'API_ERROR',
      message: apiError.message,
      cause: apiError as ServiceError['cause'],
    };
  }

  return {
    async getAppliances(): Promise<Result<ApplianceInfo[], ServiceError>> {
      // Call API to get appliances (Req 3.1)
      const result = await client.getAppliances();

      if (!result.success) {
        return {
          success: false,
          error: wrapApiError(result.error),
        };
      }

      // Format each appliance (Req 3.2, 3.3, 3.4)
      const applianceInfos = result.data.map(toApplianceInfo);

      return {
        success: true,
        data: applianceInfos,
      };
    },

    async getApplianceById(id: string): Promise<Result<ApplianceInfo, ServiceError>> {
      // Fetch all appliances
      const result = await client.getAppliances();

      if (!result.success) {
        return {
          success: false,
          error: wrapApiError(result.error),
        };
      }

      // Find appliance by ID
      const appliance = result.data.find((a) => a.id === id);

      if (!appliance) {
        return {
          success: false,
          error: {
            code: 'APPLIANCE_NOT_FOUND',
            message: `家電が見つかりません: ${id}`,
          },
        };
      }

      return {
        success: true,
        data: toApplianceInfo(appliance),
      };
    },
  };
}
