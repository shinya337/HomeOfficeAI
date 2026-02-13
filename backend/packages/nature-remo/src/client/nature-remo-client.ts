/**
 * Nature Remo Cloud API Client
 *
 * Handles authenticated requests to the Nature Remo Cloud API.
 * Implements Result pattern for explicit error handling.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4, 6.5
 */

import type {
  Result,
  ApiError,
  Device,
  Appliance,
  AirconSettings,
  AirconSettingsInput,
  LightState,
} from '../types/types.js';
import type { RateLimitMonitor } from './rate-limit-monitor.js';

// Re-export types for convenience
export type { RateLimitMonitor } from './rate-limit-monitor.js';

/**
 * Nature Remo Light API で使用可能なボタン値
 * https://developer.nature.global/docs/light
 */
export type LightButton =
  | 'on'
  | 'off'
  | 'on-100'
  | 'on-favorite'
  | 'night'
  | 'bright-up'
  | 'bright-down'
  | 'colortemp-up'
  | 'colortemp-down';

/** Nature Remo Cloud API base URL */
const BASE_URL = 'https://api.nature.global';

/**
 * Nature Remo API Client interface.
 * Provides methods to interact with the Nature Remo Cloud API.
 */
export interface NatureRemoClient {
  /**
   * Get all registered devices.
   * @returns Result with Device array on success, ApiError on failure
   */
  getDevices(): Promise<Result<Device[], ApiError>>;

  /**
   * Get all registered appliances.
   * @returns Result with Appliance array on success, ApiError on failure
   */
  getAppliances(): Promise<Result<Appliance[], ApiError>>;

  /**
   * Update aircon settings.
   * @param applianceId - Target appliance ID
   * @param settings - Settings to update
   * @returns Result with updated AirconSettings on success, ApiError on failure
   */
  updateAirconSettings(
    applianceId: string,
    settings: AirconSettingsInput
  ): Promise<Result<AirconSettings, ApiError>>;

  /**
   * Control a light appliance.
   * @param applianceId - Target appliance ID
   * @param button - Light button command
   * @returns Result with LightState on success, ApiError on failure
   */
  controlLight(
    applianceId: string,
    button: LightButton
  ): Promise<Result<LightState, ApiError>>;

  /**
   * Send a signal (custom IR command).
   * @param signalId - Target signal ID
   * @returns Result with empty object on success, ApiError on failure
   */
  sendSignal(signalId: string): Promise<Result<Record<string, never>, ApiError>>;
}

/**
 * Create a Nature Remo API client instance.
 *
 * @param token - Access token for API authentication
 * @param rateLimitMonitor - Rate limit monitor instance
 * @returns NatureRemoClient instance
 * @throws Error if token is empty or whitespace only (Requirement 1.3)
 */
export function createNatureRemoClient(
  token: string,
  rateLimitMonitor: RateLimitMonitor
): NatureRemoClient {
  // Validate token (Requirement 1.3)
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new Error('NATURE_REMO_TOKEN 環境変数が設定されていません');
  }

  /**
   * Make an authenticated GET request to the API.
   */
  async function get<T>(endpoint: string): Promise<Result<T, ApiError>> {
    const url = `${BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedToken}`,
          Accept: 'application/json',
        },
      });

      return handleResponse<T>(response);
    } catch (error) {
      return handleNetworkError();
    }
  }

  /**
   * Make an authenticated POST request to the API.
   */
  async function post<T>(
    endpoint: string,
    body: string
  ): Promise<Result<T, ApiError>> {
    const url = `${BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${trimmedToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
      });

      return handleResponse<T>(response);
    } catch (error) {
      return handleNetworkError();
    }
  }

  /**
   * Handle API response and convert to Result type.
   */
  async function handleResponse<T>(
    response: Response
  ): Promise<Result<T, ApiError>> {
    // Update rate limit monitor from headers (Requirement 6.5)
    rateLimitMonitor.updateFromHeaders(response.headers);

    if (response.ok) {
      const data = await response.json();
      return { success: true, data: data as T };
    }

    // Handle error responses
    return handleErrorResponse(response);
  }

  /**
   * Handle error response and return appropriate ApiError.
   */
  async function handleErrorResponse<T>(
    response: Response
  ): Promise<Result<T, ApiError>> {
    const status = response.status;

    // 401 Unauthorized (Requirement 6.2)
    if (status === 401) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'アクセストークンが無効です',
        },
      };
    }

    // 404 Not Found (Requirement 6.3)
    if (status === 404) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'リソースが見つかりません',
        },
      };
    }

    // 429 Rate Limit (Requirement 6.1)
    if (status === 429) {
      const resetHeader = response.headers.get('X-Rate-Limit-Reset');
      let retryAfter: number | undefined;

      if (resetHeader) {
        const resetTime = parseInt(resetHeader, 10);
        if (!isNaN(resetTime)) {
          retryAfter = Math.max(0, resetTime - Math.floor(Date.now() / 1000));
        }
      }

      const error: ApiError = {
        code: 'RATE_LIMIT',
        message: `レート制限に達しました${retryAfter !== undefined ? `。${retryAfter}秒後に再試行してください` : ''}`,
      };

      if (retryAfter !== undefined) {
        error.retryAfter = retryAfter;
      }

      return {
        success: false,
        error,
      };
    }

    // Unknown error
    return {
      success: false,
      error: {
        code: 'UNKNOWN',
        message: `予期しないエラーが発生しました (HTTP ${status})`,
      },
    };
  }

  /**
   * Handle network errors (Requirement 6.4).
   */
  function handleNetworkError<T>(): Result<T, ApiError> {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'ネットワーク接続を確認してください',
      },
    };
  }

  /**
   * Build URL-encoded form data from settings object.
   */
  function buildFormData(
    params: Record<string, string | undefined>
  ): string {
    const entries: string[] = [];

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }

    return entries.join('&');
  }

  // Return the client interface
  return {
    async getDevices(): Promise<Result<Device[], ApiError>> {
      return get<Device[]>('/1/devices');
    },

    async getAppliances(): Promise<Result<Appliance[], ApiError>> {
      return get<Appliance[]>('/1/appliances');
    },

    async updateAirconSettings(
      applianceId: string,
      settings: AirconSettingsInput
    ): Promise<Result<AirconSettings, ApiError>> {
      const body = buildFormData({
        temperature: settings.temperature,
        operation_mode: settings.operation_mode,
        air_volume: settings.air_volume,
        button: settings.button,
      });

      return post<AirconSettings>(
        `/1/appliances/${encodeURIComponent(applianceId)}/aircon_settings`,
        body
      );
    },

    async controlLight(
      applianceId: string,
      button: LightButton
    ): Promise<Result<LightState, ApiError>> {
      const body = `button=${encodeURIComponent(button)}`;

      return post<LightState>(
        `/1/appliances/${encodeURIComponent(applianceId)}/light`,
        body
      );
    },

    async sendSignal(signalId: string): Promise<Result<Record<string, never>, ApiError>> {
      return post<Record<string, never>>(
        `/1/signals/${encodeURIComponent(signalId)}/send`,
        ''
      );
    },
  };
}
