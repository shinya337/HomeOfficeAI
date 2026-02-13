/**
 * Integration Configuration
 *
 * Loads environment variables and provides configuration for integrating
 * with existing iot-ai-agent-loop components (AgentClient, ActionDispatcher,
 * DeviceStateService, dedup-actions).
 *
 * Required environment variables:
 * - GOOGLE_CLOUD_PROJECT: Google Cloud project ID for Vertex AI
 * - NATURE_REMO_TOKEN: Nature Remo Cloud API access token
 *
 * Optional environment variables:
 * - VERTEX_AI_LOCATION: Vertex AI region (default: us-central1)
 * - GEMINI_MODEL: Gemini model name (default: gemini-2.0-flash)
 *
 * Note: LIGHT_APPLIANCE_ID and AIRCON_APPLIANCE_ID have been removed.
 * Device IDs are now dynamically obtained from session's allowedDevices.
 * See Requirements: 7.1, 7.2, 7.3
 *
 * Requirements: 3.1, 4.1, 4.2, 4.5, 7.1, 7.2, 7.3
 */
import 'dotenv/config';
import type { Result } from '../types/action-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Agent configuration for Vertex AI
 */
export interface AgentConfig {
  readonly projectId: string;
  readonly location: string;
  readonly model: string;
  readonly natureRemoToken: string;
}

/**
 * Combined integration configuration
 *
 * Note: ApplianceConfig has been removed as device IDs are now obtained
 * dynamically from session's allowedDevices (Req 7.1, 7.2).
 */
export interface IntegrationConfig {
  readonly agentConfig: AgentConfig;
}

/**
 * Integration configuration error codes
 */
export type IntegrationConfigErrorCode =
  | 'MISSING_PROJECT_ID'
  | 'MISSING_TOKEN';

/**
 * Integration configuration error
 */
export interface IntegrationConfigError {
  readonly code: IntegrationConfigErrorCode;
  readonly message: string;
  readonly suggestion: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Default Vertex AI location/region */
const DEFAULT_LOCATION = 'us-central1';

/** Default Gemini model name */
const DEFAULT_MODEL = 'gemini-2.0-flash';

// =============================================================================
// Validation helpers
// =============================================================================

/**
 * Check if a string value is valid (non-empty, non-whitespace)
 */
function isValidString(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Load integration configuration from environment variables.
 *
 * This configuration is used to:
 * - Initialize AgentClient for AI image analysis (Req 3.1)
 * - Configure ActionDispatcher for IoT control (Req 4.1, 4.2)
 * - Set up DeviceStateService for device state retrieval
 * - Enable dedup-actions logic for duplicate action prevention (Req 4.5)
 *
 * Note: Device IDs (LIGHT_APPLIANCE_ID, AIRCON_APPLIANCE_ID) are no longer
 * loaded from environment variables. They are now obtained dynamically
 * from session's allowedDevices (Req 7.1, 7.2).
 *
 * @returns Result with IntegrationConfig on success, IntegrationConfigError on failure
 */
export function loadIntegrationConfig(): Result<IntegrationConfig, IntegrationConfigError> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION ?? DEFAULT_LOCATION;
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const natureRemoToken = process.env.NATURE_REMO_TOKEN;

  // Validate GOOGLE_CLOUD_PROJECT (required)
  if (!isValidString(projectId)) {
    return {
      ok: false,
      error: {
        code: 'MISSING_PROJECT_ID',
        message: 'GOOGLE_CLOUD_PROJECT 環境変数が設定されていません。',
        suggestion:
          '.env ファイルに GOOGLE_CLOUD_PROJECT=<your-project-id> を設定するか、' +
          '環境変数として export GOOGLE_CLOUD_PROJECT=<your-project-id> を実行してください。',
      },
    };
  }

  // NATURE_REMO_TOKEN is optional - IoT features are disabled when not set

  // Note: LIGHT_APPLIANCE_ID and AIRCON_APPLIANCE_ID validation removed (Req 7.1, 7.2)
  // Device IDs are now obtained dynamically from session's allowedDevices

  return {
    ok: true,
    value: {
      agentConfig: {
        projectId,
        location,
        model,
        natureRemoToken: natureRemoToken ?? '',
      },
    },
  };
}
