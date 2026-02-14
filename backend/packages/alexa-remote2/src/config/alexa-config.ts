/**
 * Configuration Loader for Alexa Remote2 Module
 *
 * Loads AlexaServiceConfig from environment variables.
 * Provides sensible defaults for amazon.co.jp region.
 *
 * Environment Variables:
 * - ALEXA_COOKIE_FILE_PATH: Path to Cookie persistence file (default: ./.alexa-cookie.json)
 * - ALEXA_PROXY_OWN_IP: Proxy server IP for Cookie authentication (optional)
 * - ALEXA_PROXY_PORT: Proxy server port for Cookie authentication (optional)
 *
 * Requirements: 1.4, 2.1
 */

import 'dotenv/config';
import type { AlexaServiceConfig } from '../types/alexa-types.js';

// ============================================================================
// Config Error Types
// ============================================================================

/**
 * Configuration error codes.
 */
export type AlexaConfigErrorCode = 'INVALID_CONFIG';

/**
 * Configuration error with message and suggestion.
 */
export interface AlexaConfigError {
  /** Error code */
  readonly code: AlexaConfigErrorCode;
  /** Human-readable error message */
  readonly message: string;
  /** Suggestion for resolution */
  readonly suggestion: string;
}

/**
 * Result type for config loading.
 */
export type AlexaConfigResult =
  | { readonly success: true; readonly data: AlexaServiceConfig }
  | { readonly success: false; readonly error: AlexaConfigError };

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_COOKIE_FILE_PATH = './.alexa-cookie.json';

// ============================================================================
// Config Loader
// ============================================================================

/**
 * Load AlexaServiceConfig from environment variables.
 *
 * @returns AlexaConfigResult with config on success, error on failure
 */
export function loadAlexaConfig(): AlexaConfigResult {
  const rawCookiePath = process.env['ALEXA_COOKIE_FILE_PATH'];
  const cookieFilePath = rawCookiePath?.trim() || DEFAULT_COOKIE_FILE_PATH;

  const rawProxyIp = process.env['ALEXA_PROXY_OWN_IP'];
  const proxyOwnIp = rawProxyIp?.trim() || undefined;

  const rawProxyPort = process.env['ALEXA_PROXY_PORT'];
  let proxyPort: number | undefined;

  if (rawProxyPort !== undefined && rawProxyPort !== '') {
    const parsed = Number(rawProxyPort);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONFIG',
          message: `ALEXA_PROXY_PORT must be a valid integer, got: "${rawProxyPort}"`,
          suggestion: 'Set ALEXA_PROXY_PORT to a valid port number (e.g., 3001)',
        },
      };
    }
    proxyPort = parsed;
  }

  const config: AlexaServiceConfig = {
    amazonPage: 'amazon.co.jp',
    acceptLanguage: 'ja-JP',
    cookieFilePath,
    ...(proxyOwnIp !== undefined ? { proxyOwnIp } : {}),
    ...(proxyPort !== undefined ? { proxyPort } : {}),
  };

  return {
    success: true,
    data: config,
  };
}
