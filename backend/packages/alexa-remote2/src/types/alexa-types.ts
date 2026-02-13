/**
 * Type Definitions for Alexa Remote2 Module
 *
 * This module defines all shared types used across the Alexa experiment:
 * - AlexaOperationResult: Result of Alexa device operations
 * - AlexaRoutineInfo: Alexa routine metadata
 * - AlexaServiceConfig: Connection and authentication configuration
 * - AlexaServiceError: Service layer error with code, message, cause
 * - AlexaResult: Discriminated union for success/failure handling
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

// ============================================================================
// Operation Result Types
// ============================================================================

/**
 * Result of an Alexa device operation.
 * Returned by all AlexaService command methods.
 */
export interface AlexaOperationResult {
  /** Serial number of the target Alexa device */
  readonly deviceSerialNumber: string;
  /** Command that was executed (e.g., 'speak', 'announce', 'volume') */
  readonly command: string;
  /** Whether the operation completed successfully */
  readonly success: boolean;
}

/**
 * Metadata for an Alexa routine.
 * Returned by getRoutines().
 */
export interface AlexaRoutineInfo {
  /** User-defined routine name */
  readonly name: string;
  /** Unique routine identifier */
  readonly id: string;
}

/**
 * Player state for an Alexa device.
 * Returned by AlexaService.getPlayerInfo().
 */
export interface AlexaPlayerState {
  readonly state: 'PLAYING' | 'PAUSED' | 'IDLE';
}

/**
 * Basic info for an Alexa device.
 * Returned by AlexaService.getDevices().
 */
export interface AlexaDeviceInfo {
  /** Device serial number (used as device ID) */
  readonly serialNumber: string;
  /** Device account name */
  readonly name: string;
  /** Device family (e.g., KNIGHT, VOX) */
  readonly family: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for AlexaService connection.
 * Loaded from environment variables via loadAlexaConfig().
 */
export interface AlexaServiceConfig {
  /** Amazon region page (fixed: 'amazon.co.jp') */
  readonly amazonPage: 'amazon.co.jp';
  /** Accept-Language header (fixed: 'ja-JP') */
  readonly acceptLanguage: 'ja-JP';
  /** Path to Cookie persistence file */
  readonly cookieFilePath: string;
  /** Proxy server IP for initial Cookie authentication (optional) */
  readonly proxyOwnIp?: string;
  /** Proxy server port for initial Cookie authentication (optional) */
  readonly proxyPort?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for AlexaService operations.
 *
 * - AUTH_ERROR: Cookie expired or invalid, re-authentication required
 * - TIMEOUT: Alexa API request timed out
 * - ALEXA_ERROR: Unknown alexa-remote2 error
 * - RATE_LIMIT: API call rate limit exceeded
 * - ROUTINE_NOT_FOUND: Specified routine name not found
 * - VOLUME_OUT_OF_RANGE: Volume value outside 0-100 range
 */
export type AlexaServiceErrorCode =
  | 'AUTH_ERROR'
  | 'TIMEOUT'
  | 'ALEXA_ERROR'
  | 'RATE_LIMIT'
  | 'ROUTINE_NOT_FOUND'
  | 'VOLUME_OUT_OF_RANGE';

/**
 * Service layer error for Alexa operations.
 * Follows the same pattern as Nature Remo ServiceError.
 */
export interface AlexaServiceError {
  /** Error code identifying the type of error */
  readonly code: AlexaServiceErrorCode;
  /** Human-readable error message */
  readonly message: string;
  /** Original error if applicable */
  readonly cause?: unknown;
}

// ============================================================================
// Result Type
// ============================================================================

/**
 * Result type for AlexaService operations.
 * Uses discriminated union pattern for type-safe error handling.
 *
 * @example
 * ```typescript
 * const result: AlexaResult<AlexaOperationResult> = await service.speak(deviceSN, 'Hello');
 * if (result.success) {
 *   console.log(result.data.command); // 'speak'
 * } else {
 *   console.error(result.error.code); // 'AUTH_ERROR' | 'TIMEOUT' | ...
 * }
 * ```
 */
export type AlexaResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: AlexaServiceError };
