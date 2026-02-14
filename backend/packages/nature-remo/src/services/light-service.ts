/**
 * Light Service
 *
 * Provides light control functionality (on/off operations).
 * Validates appliance type and sends control commands to the API.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import type { NatureRemoClient, LightButton } from '../client/nature-remo-client.js';
import type { Result, ServiceError } from '../types/types.js';

// ============================================================================
// Service Interface Types
// ============================================================================

/**
 * Light operation result.
 */
export interface LightOperationResult {
  /** Appliance ID that was operated */
  applianceId: string;
  /** Action performed */
  action: LightButton;
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * Named signal operation result.
 */
export interface SignalOperationResult {
  /** Appliance ID that was operated */
  applianceId: string;
  /** Signal name that was sent */
  signalName: string;
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * LightService interface.
 */
export interface LightService {
  /**
   * Control a light appliance.
   *
   * @param applianceId - Target appliance ID
   * @param action - Light button command
   * @returns Result with LightOperationResult on success, ServiceError on failure
   */
  control(
    applianceId: string,
    action: LightButton
  ): Promise<Result<LightOperationResult, ServiceError>>;

  /**
   * Send a named signal registered on the appliance.
   *
   * @param applianceId - Target appliance ID
   * @param signalName - Signal name to match (e.g., "安らぎ", "読書", "家事")
   * @returns Result with SignalOperationResult on success, ServiceError on failure
   */
  sendNamedSignal(
    applianceId: string,
    signalName: string
  ): Promise<Result<SignalOperationResult, ServiceError>>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a LightService instance.
 *
 * @param client - NatureRemoClient for API calls
 * @returns LightService instance
 */
export function createLightService(client: NatureRemoClient): LightService {
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
    async control(
      applianceId: string,
      action: LightButton
    ): Promise<Result<LightOperationResult, ServiceError>> {
      // Step 1: Fetch appliances to validate type (Requirement 5.1, 5.5)
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

      // Validate appliance is LIGHT type (Requirement 5.5)
      if (appliance.type !== 'LIGHT') {
        return {
          success: false,
          error: {
            code: 'NOT_LIGHT',
            message: `指定した家電は照明ではありません: ${appliance.nickname} (${appliance.type})`,
          },
        };
      }

      // Step 2: Send control command to API (Requirement 5.1, 5.2, 5.3)
      const controlResult = await client.controlLight(applianceId, action);

      if (!controlResult.success) {
        return {
          success: false,
          error: wrapApiError(controlResult.error),
        };
      }

      // Step 3: Return formatted result (Requirement 5.4)
      return {
        success: true,
        data: {
          applianceId,
          action,
          success: true,
        },
      };
    },

    async sendNamedSignal(
      applianceId: string,
      signalName: string
    ): Promise<Result<SignalOperationResult, ServiceError>> {
      const appliancesResult = await client.getAppliances();

      if (!appliancesResult.success) {
        return {
          success: false,
          error: wrapApiError(appliancesResult.error),
        };
      }

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

      const signal = appliance.signals?.find((s) => s.name === signalName);

      if (!signal) {
        return {
          success: false,
          error: {
            code: 'SIGNAL_NOT_FOUND',
            message: `シグナルが見つかりません: ${signalName} (appliance: ${appliance.nickname})`,
          },
        };
      }

      const sendResult = await client.sendSignal(signal.id);

      if (!sendResult.success) {
        return {
          success: false,
          error: wrapApiError(sendResult.error),
        };
      }

      return {
        success: true,
        data: {
          applianceId,
          signalName,
          success: true,
        },
      };
    },
  };
}
