/**
 * Device-related type definitions
 *
 * Types for device management in the dynamic device permission feature.
 * Requirements: 1.2 (device info), 3.2 (allowed devices in session)
 */

/**
 * Device types supported by the system
 * Maps to Nature Remo appliance types
 */
export type DeviceType = 'LIGHT' | 'AC' | 'TV' | 'IR' | 'ALEXA';

/**
 * Device information returned from Nature Remo API
 */
export interface Device {
  readonly id: string;
  readonly name: string;
  readonly type: DeviceType;
}

/**
 * Allowed device information stored in session
 * Subset of Device without name (used for permission management)
 */
export interface AllowedDevice {
  readonly id: string;
  readonly type: DeviceType;
  readonly allowedTools?: readonly string[];  // undefined = 全ツール許可
}

/**
 * Response for GET /api/devices endpoint
 */
export interface DeviceListResponse {
  readonly devices: readonly Device[];
}

/**
 * Error codes for device-related operations
 */
export type DeviceErrorCode = 'NATURE_API_ERROR' | 'RATE_LIMIT_EXCEEDED' | 'INTERNAL_ERROR';

/**
 * Error response for device-related operations
 */
export interface DeviceErrorResponse {
  readonly error: {
    readonly code: DeviceErrorCode;
    readonly message: string;
    readonly retryAfter?: number; // Retry time in seconds (for rate limit)
  };
}
