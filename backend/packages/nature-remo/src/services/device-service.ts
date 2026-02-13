/**
 * Device Service for Nature Remo
 *
 * Provides device information retrieval and formatting.
 * Extracts device metadata and sensor values from API responses.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import type {
  Result,
  Device,
  ServiceError,
} from '../types/types.js';
import type { NatureRemoClient } from '../client/nature-remo-client.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Formatted sensor values for display.
 */
export interface SensorValuesFormatted {
  /** Temperature in Celsius (or null if not available) */
  temperature: number | null;
  /** Humidity in percentage (or null if not available) */
  humidity: number | null;
  /** Illumination in lux (or null if not available) */
  illumination: number | null;
}

/**
 * Processed device information for display.
 */
export interface DeviceInfo {
  /** Unique device identifier */
  id: string;
  /** User-defined device name */
  name: string;
  /** Firmware version string */
  firmwareVersion: string;
  /** Sensor values (or null if no sensors) */
  sensors: SensorValuesFormatted | null;
}

/**
 * Device information formatted for console.table display.
 */
export interface DeviceDisplayRow {
  ID: string;
  Name: string;
  Firmware: string;
  Temperature: string;
  Humidity: string;
  Illumination: string;
}

/**
 * Device service interface.
 * Provides methods to retrieve and format device information.
 */
export interface DeviceService {
  /**
   * Get all registered devices with formatted information.
   * @returns Result with DeviceInfo array on success, ServiceError on failure
   */
  getDevices(): Promise<Result<DeviceInfo[], ServiceError>>;

  /**
   * Get the message to display when no devices are found.
   * @returns Message string
   */
  getNoDevicesMessage(): string;

  /**
   * Format a device for display in console.table.
   * @param device - DeviceInfo to format
   * @returns Formatted row for display
   */
  formatDeviceForDisplay(device: DeviceInfo): DeviceDisplayRow;
}

// ============================================================================
// Implementation
// ============================================================================

/** Message when no devices are registered (Requirement 2.4) */
const NO_DEVICES_MESSAGE = '登録済みデバイスがありません';

/**
 * Create a DeviceService instance.
 *
 * @param client - NatureRemoClient for API calls
 * @returns DeviceService instance
 */
export function createDeviceService(client: NatureRemoClient): DeviceService {
  /**
   * Extract sensor values from device newest_events.
   * Returns null if no sensor data is available.
   */
  function extractSensorValues(device: Device): SensorValuesFormatted | null {
    const events = device.newest_events;

    // Check if any sensor data exists
    if (!events || (!events.te && !events.hu && !events.il)) {
      return null;
    }

    return {
      temperature: events.te?.val ?? null,
      humidity: events.hu?.val ?? null,
      illumination: events.il?.val ?? null,
    };
  }

  /**
   * Transform API Device to DeviceInfo.
   */
  function transformDevice(device: Device): DeviceInfo {
    return {
      id: device.id,
      name: device.name,
      firmwareVersion: device.firmware_version,
      sensors: extractSensorValues(device),
    };
  }

  /**
   * Format a sensor value for display.
   */
  function formatSensorValue(
    value: number | null | undefined,
    unit: string
  ): string {
    if (value === null || value === undefined) {
      return '-';
    }
    return `${value}${unit}`;
  }

  // Return service interface
  return {
    async getDevices(): Promise<Result<DeviceInfo[], ServiceError>> {
      // Call API (Requirement 2.1)
      const apiResult = await client.getDevices();

      if (!apiResult.success) {
        return {
          success: false,
          error: {
            code: 'API_ERROR',
            message: apiResult.error.message,
            cause: apiResult.error,
          },
        };
      }

      // Transform devices (Requirements 2.2, 2.3)
      const devices = apiResult.data.map(transformDevice);

      return {
        success: true,
        data: devices,
      };
    },

    getNoDevicesMessage(): string {
      return NO_DEVICES_MESSAGE;
    },

    formatDeviceForDisplay(device: DeviceInfo): DeviceDisplayRow {
      const sensors = device.sensors;

      return {
        ID: device.id,
        Name: device.name,
        Firmware: device.firmwareVersion,
        Temperature: formatSensorValue(sensors?.temperature, '\u00B0C'),
        Humidity: formatSensorValue(sensors?.humidity, '%'),
        Illumination: formatSensorValue(sensors?.illumination, ' lux'),
      };
    },
  };
}
