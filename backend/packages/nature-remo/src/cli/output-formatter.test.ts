/**
 * CLI Output Formatter Tests
 *
 * Tests for console output formatting functions.
 * Following TDD methodology - RED phase.
 *
 * Requirements: 2.2, 2.3, 3.2, 3.3, 3.4, 4.5, 5.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDevicesOutput,
  formatAppliancesOutput,
  formatAirconResult,
  formatLightResult,
  formatErrorMessage,
  type DeviceDisplayData,
  type ApplianceDisplayData,
  type AirconResultData,
  type LightResultData,
} from './output-formatter.js';
import type { ApiError, ServiceError } from '../types/types.js';

// ============================================================================
// Device List Formatting Tests (Requirements 2.2, 2.3)
// ============================================================================

describe('formatDevicesOutput', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should format device list using console.table', () => {
    const devices: DeviceDisplayData[] = [
      {
        id: 'device-1',
        name: 'Living Room Remo',
        firmwareVersion: 'Remo/1.0.0',
        temperature: 25.5,
        humidity: 60,
        illumination: 100,
      },
    ];

    formatDevicesOutput(devices);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const tableData = consoleSpy.mock.calls[0][0] as Array<Record<string, string>>;
    expect(tableData).toHaveLength(1);
    expect(tableData[0]).toHaveProperty('ID', 'device-1');
    expect(tableData[0]).toHaveProperty('Name', 'Living Room Remo');
    expect(tableData[0]).toHaveProperty('Firmware', 'Remo/1.0.0');
  });

  it('should format temperature with degree Celsius', () => {
    const devices: DeviceDisplayData[] = [
      {
        id: 'device-1',
        name: 'Remo',
        firmwareVersion: '1.0',
        temperature: 26.3,
        humidity: null,
        illumination: null,
      },
    ];

    formatDevicesOutput(devices);

    const tableData = consoleSpy.mock.calls[0][0] as Array<Record<string, string>>;
    expect(tableData[0]).toHaveProperty('Temperature', '26.3\u00B0C');
  });

  it('should format humidity with percentage', () => {
    const devices: DeviceDisplayData[] = [
      {
        id: 'device-1',
        name: 'Remo',
        firmwareVersion: '1.0',
        temperature: null,
        humidity: 55,
        illumination: null,
      },
    ];

    formatDevicesOutput(devices);

    const tableData = consoleSpy.mock.calls[0][0] as Array<Record<string, string>>;
    expect(tableData[0]).toHaveProperty('Humidity', '55%');
  });

  it('should format illumination with lux', () => {
    const devices: DeviceDisplayData[] = [
      {
        id: 'device-1',
        name: 'Remo',
        firmwareVersion: '1.0',
        temperature: null,
        humidity: null,
        illumination: 250,
      },
    ];

    formatDevicesOutput(devices);

    const tableData = consoleSpy.mock.calls[0][0] as Array<Record<string, string>>;
    expect(tableData[0]).toHaveProperty('Illumination', '250 lux');
  });

  it('should display dash for null sensor values', () => {
    const devices: DeviceDisplayData[] = [
      {
        id: 'device-1',
        name: 'Remo',
        firmwareVersion: '1.0',
        temperature: null,
        humidity: null,
        illumination: null,
      },
    ];

    formatDevicesOutput(devices);

    const tableData = consoleSpy.mock.calls[0][0] as Array<Record<string, string>>;
    expect(tableData[0]).toHaveProperty('Temperature', '-');
    expect(tableData[0]).toHaveProperty('Humidity', '-');
    expect(tableData[0]).toHaveProperty('Illumination', '-');
  });

  it('should handle multiple devices', () => {
    const devices: DeviceDisplayData[] = [
      {
        id: 'device-1',
        name: 'Remo 1',
        firmwareVersion: '1.0',
        temperature: 25,
        humidity: 50,
        illumination: 100,
      },
      {
        id: 'device-2',
        name: 'Remo 2',
        firmwareVersion: '2.0',
        temperature: 22,
        humidity: 45,
        illumination: 200,
      },
    ];

    formatDevicesOutput(devices);

    const tableData = consoleSpy.mock.calls[0][0] as Array<Record<string, string>>;
    expect(tableData).toHaveLength(2);
    expect(tableData[0]).toHaveProperty('Name', 'Remo 1');
    expect(tableData[1]).toHaveProperty('Name', 'Remo 2');
  });

  it('should return no devices message when list is empty', () => {
    const result = formatDevicesOutput([]);

    expect(result).toBe('no-devices');
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Appliance List Formatting Tests (Requirements 3.2, 3.3, 3.4)
// ============================================================================

describe('formatAppliancesOutput', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should format appliances grouped by type', () => {
    const appliances: ApplianceDisplayData[] = [
      { id: 'ac-1', nickname: 'Aircon', type: 'AC' },
      { id: 'light-1', nickname: 'Ceiling Light', type: 'LIGHT' },
      { id: 'tv-1', nickname: 'TV', type: 'TV' },
    ];

    formatAppliancesOutput(appliances);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('AC');
    expect(output).toContain('LIGHT');
    expect(output).toContain('TV');
  });

  it('should display aircon with current settings', () => {
    const appliances: ApplianceDisplayData[] = [
      {
        id: 'ac-1',
        nickname: 'Living Aircon',
        type: 'AC',
        airconSettings: {
          temperature: '26',
          mode: 'cool',
          volume: 'auto',
          power: 'on',
        },
      },
    ];

    formatAppliancesOutput(appliances);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('Living Aircon');
    expect(output).toContain('26');
    expect(output).toContain('cool');
    expect(output).toContain('auto');
    expect(output).toContain('on');
  });

  it('should display aircon with power off state', () => {
    const appliances: ApplianceDisplayData[] = [
      {
        id: 'ac-1',
        nickname: 'Bedroom Aircon',
        type: 'AC',
        airconSettings: {
          temperature: '24',
          mode: 'warm',
          volume: '2',
          power: 'off',
        },
      },
    ];

    formatAppliancesOutput(appliances);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('off');
  });

  it('should display light with on/off state', () => {
    const appliances: ApplianceDisplayData[] = [
      {
        id: 'light-1',
        nickname: 'Desk Light',
        type: 'LIGHT',
        lightState: {
          power: 'on',
          brightness: '80',
        },
      },
    ];

    formatAppliancesOutput(appliances);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('Desk Light');
    expect(output).toContain('on');
    expect(output).toContain('80');
  });

  it('should display light without brightness when not available', () => {
    const appliances: ApplianceDisplayData[] = [
      {
        id: 'light-1',
        nickname: 'Simple Light',
        type: 'LIGHT',
        lightState: {
          power: 'off',
        },
      },
    ];

    formatAppliancesOutput(appliances);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('Simple Light');
    expect(output).toContain('off');
  });

  it('should display appliance ID for each item', () => {
    const appliances: ApplianceDisplayData[] = [
      { id: 'unique-id-12345', nickname: 'Test Device', type: 'IR' },
    ];

    formatAppliancesOutput(appliances);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('unique-id-12345');
  });

  it('should return no appliances message when list is empty', () => {
    const result = formatAppliancesOutput([]);

    expect(result).toBe('no-appliances');
  });
});

// ============================================================================
// Aircon Operation Result Formatting Tests (Requirement 4.5)
// ============================================================================

describe('formatAirconResult', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should display success message for aircon operation', () => {
    const result: AirconResultData = {
      applianceId: 'ac-123',
      temperature: '26',
      mode: 'cool',
      volume: 'auto',
      power: 'on',
    };

    formatAirconResult(result);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('26');
    expect(output).toContain('cool');
    expect(output).toContain('auto');
  });

  it('should display power off message clearly', () => {
    const result: AirconResultData = {
      applianceId: 'ac-123',
      temperature: '26',
      mode: 'cool',
      volume: 'auto',
      power: 'off',
    };

    formatAirconResult(result);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('off');
  });

  it('should include mode in Japanese-friendly format', () => {
    const modes = ['cool', 'warm', 'dry', 'blow', 'auto'] as const;

    for (const mode of modes) {
      consoleLogSpy.mockClear();

      const result: AirconResultData = {
        applianceId: 'ac-123',
        temperature: '26',
        mode,
        volume: 'auto',
        power: 'on',
      };

      formatAirconResult(result);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain(mode);
    }
  });
});

// ============================================================================
// Light Operation Result Formatting Tests (Requirement 5.4)
// ============================================================================

describe('formatLightResult', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should display light on success message', () => {
    const result: LightResultData = {
      applianceId: 'light-456',
      action: 'on',
      success: true,
    };

    formatLightResult(result);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toMatch(/on|点灯/i);
  });

  it('should display light off success message', () => {
    const result: LightResultData = {
      applianceId: 'light-456',
      action: 'off',
      success: true,
    };

    formatLightResult(result);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toMatch(/off|消灯/i);
  });
});

// ============================================================================
// Error Message Formatting Tests (User-friendly errors)
// ============================================================================

describe('formatErrorMessage', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should format unauthorized error (401)', () => {
    const error: ApiError = {
      code: 'UNAUTHORIZED',
      message: 'Invalid access token',
    };

    formatErrorMessage(error);

    const output = consoleErrorSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('アクセストークンが無効です');
  });

  it('should format not found error (404)', () => {
    const error: ApiError = {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    };

    formatErrorMessage(error);

    const output = consoleErrorSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('リソースが見つかりません');
  });

  it('should format rate limit error (429) with retry time', () => {
    const error: ApiError = {
      code: 'RATE_LIMIT',
      message: 'Rate limit exceeded',
      retryAfter: 120,
    };

    formatErrorMessage(error);

    const output = consoleErrorSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('レート制限');
    expect(output).toContain('120');
  });

  it('should format network error', () => {
    const error: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network connection failed',
    };

    formatErrorMessage(error);

    const output = consoleErrorSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('ネットワーク接続を確認してください');
  });

  it('should format not aircon error', () => {
    const error: ServiceError = {
      code: 'NOT_AIRCON',
      message: 'Not an aircon appliance',
    };

    formatErrorMessage(error);

    const output = consoleErrorSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('エアコンではありません');
  });

  it('should format not light error', () => {
    const error: ServiceError = {
      code: 'NOT_LIGHT',
      message: 'Not a light appliance',
    };

    formatErrorMessage(error);

    const output = consoleErrorSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('照明ではありません');
  });

  it('should format appliance not found error', () => {
    const error: ServiceError = {
      code: 'APPLIANCE_NOT_FOUND',
      message: 'Appliance not found: abc123',
    };

    formatErrorMessage(error);

    const output = consoleErrorSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('家電が見つかりません');
  });

  it('should format unknown error with original message', () => {
    const error: ApiError = {
      code: 'UNKNOWN',
      message: 'Some unexpected error occurred',
    };

    formatErrorMessage(error);

    const output = consoleErrorSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('エラー');
    expect(output).toContain('Some unexpected error occurred');
  });
});
