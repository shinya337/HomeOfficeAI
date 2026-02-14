/**
 * Aircon Service
 *
 * Provides aircon control functionality.
 * Validates appliance type and sends settings to the API.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import type { NatureRemoClient } from '../client/nature-remo-client.js';
import type {
  Result,
  ServiceError,
  AirconSettings,
  AirconSettingsInput,
} from '../types/types.js';

// ============================================================================
// Service Interface Types
// ============================================================================

/**
 * Aircon operation result with formatted settings.
 */
export interface AirconOperationResult {
  /** Appliance ID that was updated */
  applianceId: string;
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
 * AirconService interface.
 */
export interface AirconService {
  /**
   * Update aircon settings.
   *
   * @param applianceId - Target appliance ID
   * @param settings - Settings to update
   * @returns Result with AirconOperationResult on success, ServiceError on failure
   */
  updateSettings(
    applianceId: string,
    settings: AirconSettingsInput
  ): Promise<Result<AirconOperationResult, ServiceError>>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create an AirconService instance.
 *
 * @param client - NatureRemoClient for API calls
 * @returns AirconService instance
 */
export function createAirconService(client: NatureRemoClient): AirconService {
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

  /**
   * Format API response to AirconOperationResult.
   */
  function formatResult(
    applianceId: string,
    settings: AirconSettings
  ): AirconOperationResult {
    return {
      applianceId,
      temperature: settings.temp,
      mode: settings.mode,
      volume: settings.vol,
      power: settings.button === 'power-off' ? 'off' : 'on',
    };
  }

  return {
    async updateSettings(
      applianceId: string,
      settings: AirconSettingsInput
    ): Promise<Result<AirconOperationResult, ServiceError>> {
      // Step 1: Fetch appliances to validate type (Requirement 4.1, 4.6)
      const appliancesResult = await client.getAppliances();

      if (!appliancesResult.success) {
        return {
          success: false,
          error: wrapApiError(appliancesResult.error),
        };
      }

      // Find the appliance by ID
      const appliance = appliancesResult.data.find((a) => a.id === applianceId);

      if (!appliance) {
        return {
          success: false,
          error: {
            code: 'APPLIANCE_NOT_FOUND',
            message: `家電が見つかりません: ${applianceId}`,
          },
        };
      }

      // Validate appliance is AC type (Requirement 4.1, 4.6)
      if (appliance.type !== 'AC') {
        return {
          success: false,
          error: {
            code: 'NOT_AIRCON',
            message: `指定した家電はエアコンではありません: ${appliance.nickname} (${appliance.type})`,
          },
        };
      }

      // Step 2: Send settings to API (Requirement 4.2, 4.3, 4.4)
      const updateResult = await client.updateAirconSettings(applianceId, settings);

      if (!updateResult.success) {
        return {
          success: false,
          error: wrapApiError(updateResult.error),
        };
      }

      // Step 3: Return formatted result (Requirement 4.5)
      return {
        success: true,
        data: formatResult(applianceId, updateResult.data),
      };
    },
  };
}
