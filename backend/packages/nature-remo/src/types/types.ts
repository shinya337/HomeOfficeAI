/**
 * Common Type Definitions for Nature Remo API
 *
 * This module defines all shared types used across the application:
 * - Result type for explicit success/failure handling
 * - ApiError type for API error responses
 * - Device, Appliance, and related types for API responses
 *
 * Requirements: 1.1, 6.1, 6.2, 6.3, 6.4
 */

// ============================================================================
// Result Type (Discriminated Union)
// ============================================================================

/**
 * Result type for explicit success/failure handling.
 * Uses discriminated union pattern for type-safe error handling.
 *
 * @example
 * ```typescript
 * const result: Result<Device[], ApiError> = await client.getDevices();
 * if (result.success) {
 *   console.log(result.data); // TypeScript knows this is Device[]
 * } else {
 *   console.error(result.error.message); // TypeScript knows this is ApiError
 * }
 * ```
 */
export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

// ============================================================================
// API Error Types
// ============================================================================

/**
 * API error codes for Nature Remo API responses.
 *
 * - RATE_LIMIT: 429 - Rate limit exceeded (30 requests / 5 minutes)
 * - UNAUTHORIZED: 401 - Invalid or expired access token
 * - NOT_FOUND: 404 - Resource not found
 * - NETWORK_ERROR: Network connection failed
 * - UNKNOWN: Unexpected error occurred
 */
export type ApiErrorCode =
  | 'RATE_LIMIT'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

/**
 * API error with optional retry information.
 */
export interface ApiError {
  /** Error code identifying the type of error */
  code: ApiErrorCode;
  /** Human-readable error message */
  message: string;
  /** Seconds until rate limit resets (only for RATE_LIMIT errors) */
  retryAfter?: number;
}

// ============================================================================
// Rate Limit Types
// ============================================================================

/**
 * Rate limit information extracted from API response headers.
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in the time window (typically 30) */
  limit: number;
  /** Remaining requests in the current time window */
  remaining: number;
  /** Time when the rate limit will reset */
  resetAt: Date;
}

// ============================================================================
// Device Types
// ============================================================================

/**
 * Sensor event data with value and timestamp.
 */
export interface SensorEvent {
  /** Sensor value */
  val: number;
  /** ISO 8601 timestamp when the value was recorded */
  created_at: string;
}

/**
 * Sensor values from Nature Remo device.
 * All sensors are optional as not all devices have all sensors.
 */
export interface SensorValues {
  /** Temperature sensor (te) in Celsius */
  te?: SensorEvent;
  /** Humidity sensor (hu) in percentage */
  hu?: SensorEvent;
  /** Illumination sensor (il) in lux */
  il?: SensorEvent;
  /** Motion sensor (mo) */
  mo?: SensorEvent;
}

/**
 * Nature Remo device (hardware unit).
 * Corresponds to GET /1/devices response.
 */
export interface Device {
  /** Unique device identifier */
  id: string;
  /** User-defined device name */
  name: string;
  /** Firmware version string */
  firmware_version: string;
  /** Latest sensor readings */
  newest_events: SensorValues;
  /** Temperature offset for calibration */
  temperature_offset?: number;
  /** Humidity offset for calibration */
  humidity_offset?: number;
}

// ============================================================================
// Appliance Types
// ============================================================================

/**
 * Aircon operation modes.
 */
export type AirconMode = 'cool' | 'warm' | 'dry' | 'blow' | 'auto';

/**
 * Aircon air volume settings.
 */
export type AirconVolume = 'auto' | '1' | '2' | '3' | '4';

/**
 * Temperature unit.
 */
export type TempUnit = 'c' | 'f';

/**
 * Current aircon settings.
 * Corresponds to settings field in Appliance for type=AC.
 */
export interface AirconSettings {
  /** Temperature setting (e.g., "26") */
  temp: string;
  /** Temperature unit */
  temp_unit: TempUnit;
  /** Operation mode */
  mode: AirconMode;
  /** Air volume */
  vol: string;
  /** Vertical air direction */
  dir: string;
  /** Horizontal air direction */
  dirh: string;
  /** Button state (empty string when on, "power-off" when off) */
  button: string;
  /** ISO 8601 timestamp of last update */
  updated_at: string;
}

/**
 * Input for updating aircon settings.
 * All fields are optional - only specified fields will be updated.
 */
export interface AirconSettingsInput {
  /** Temperature to set (e.g., "26") */
  temperature?: string;
  /** Operation mode to set */
  operation_mode?: AirconMode;
  /** Air volume to set */
  air_volume?: AirconVolume;
  /** Button action ("" to turn on, "power-off" to turn off) */
  button?: '' | 'power-off';
}

// ============================================================================
// Light Types
// ============================================================================

/**
 * Light power state.
 */
export type LightPower = 'on' | 'off';

/**
 * Light button definition.
 */
export interface LightButton {
  /** Button identifier */
  name: string;
  /** Display label */
  label: string;
  /** Image URL if available */
  image?: string;
}

/**
 * Current light state.
 */
export interface LightState {
  /** Power state */
  power: LightPower;
  /** Brightness level (percentage as string, e.g., "80") */
  brightness?: string;
  /** Color temperature */
  color_temp?: string;
}

/**
 * Light appliance configuration.
 */
export interface Light {
  /** Available buttons for this light */
  buttons: LightButton[];
  /** Current light state */
  state?: LightState;
}

// ============================================================================
// Appliance Types
// ============================================================================

/**
 * Appliance type identifier.
 */
export type ApplianceType = 'AC' | 'LIGHT' | 'TV' | 'IR' | string;

/**
 * Registered appliance (home device controlled via IR).
 * Corresponds to GET /1/appliances response item.
 */
export interface Appliance {
  /** Unique appliance identifier */
  id: string;
  /** User-defined nickname */
  nickname: string;
  /** Appliance type */
  type: ApplianceType;
  /** Associated Nature Remo device */
  device: Device;
  /** Aircon settings (only for type=AC) */
  settings?: AirconSettings;
  /** Light configuration (only for type=LIGHT) */
  light?: Light;
  /** Model information */
  model?: {
    id: string;
    name: string;
    manufacturer: string;
  };
  /** IR signals for custom appliances */
  signals?: Array<{
    id: string;
    name: string;
    image: string;
  }>;
}

// ============================================================================
// Service Error Types
// ============================================================================

/**
 * Service layer error codes.
 */
export type ServiceErrorCode =
  | 'API_ERROR'
  | 'NOT_AIRCON'
  | 'NOT_LIGHT'
  | 'APPLIANCE_NOT_FOUND'
  | 'SIGNAL_NOT_FOUND'
  | 'NO_DEVICES';

/**
 * Service layer error.
 */
export interface ServiceError {
  /** Error code identifying the type of error */
  code: ServiceErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original API error if applicable */
  cause?: ApiError;
}
