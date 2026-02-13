/**
 * Tests for common type definitions
 *
 * Requirements: 1.1, 6.1, 6.2, 6.3, 6.4
 * - Result type (success/failure discriminated union)
 * - ApiError type (RATE_LIMIT, UNAUTHORIZED, NOT_FOUND, NETWORK_ERROR, UNKNOWN)
 * - Device, Appliance, AirconSettings, LightState API response types
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  Result,
  ApiError,
  ApiErrorCode,
  Device,
  SensorValues,
  Appliance,
  AirconSettings,
  LightState,
  AirconSettingsInput,
  RateLimitInfo,
} from './types.js';

describe('Common Type Definitions', () => {
  describe('Result type', () => {
    it('should represent success state with data', () => {
      const successResult: Result<string, Error> = {
        success: true,
        data: 'test data',
      };

      expect(successResult.success).toBe(true);
      if (successResult.success) {
        expect(successResult.data).toBe('test data');
      }
    });

    it('should represent failure state with error', () => {
      const errorResult: Result<string, ApiError> = {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is invalid',
        },
      };

      expect(errorResult.success).toBe(false);
      if (!errorResult.success) {
        expect(errorResult.error.code).toBe('UNAUTHORIZED');
        expect(errorResult.error.message).toBe('Access token is invalid');
      }
    });

    it('should support type narrowing via success check', () => {
      const result: Result<number, ApiError> = {
        success: true,
        data: 42,
      };

      // Type narrowing test
      if (result.success) {
        // TypeScript should narrow to { success: true; data: number }
        const value: number = result.data;
        expect(value).toBe(42);
      } else {
        // TypeScript should narrow to { success: false; error: ApiError }
        const _error: ApiError = result.error;
      }
    });
  });

  describe('ApiError type', () => {
    it('should support RATE_LIMIT error with retryAfter', () => {
      const error: ApiError = {
        code: 'RATE_LIMIT',
        message: 'Rate limit exceeded',
        retryAfter: 300,
      };

      expect(error.code).toBe('RATE_LIMIT');
      expect(error.retryAfter).toBe(300);
    });

    it('should support UNAUTHORIZED error', () => {
      const error: ApiError = {
        code: 'UNAUTHORIZED',
        message: 'Access token is invalid',
      };

      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.retryAfter).toBeUndefined();
    });

    it('should support NOT_FOUND error', () => {
      const error: ApiError = {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      };

      expect(error.code).toBe('NOT_FOUND');
    });

    it('should support NETWORK_ERROR error', () => {
      const error: ApiError = {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed',
      };

      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('should support UNKNOWN error', () => {
      const error: ApiError = {
        code: 'UNKNOWN',
        message: 'An unexpected error occurred',
      };

      expect(error.code).toBe('UNKNOWN');
    });

    it('should have all required error codes as literal types', () => {
      const codes: ApiErrorCode[] = [
        'RATE_LIMIT',
        'UNAUTHORIZED',
        'NOT_FOUND',
        'NETWORK_ERROR',
        'UNKNOWN',
      ];

      expect(codes).toHaveLength(5);
    });
  });

  describe('Device type', () => {
    it('should represent a Nature Remo device', () => {
      const device: Device = {
        id: 'device-123',
        name: 'Living Room Remo',
        firmware_version: '1.0.0',
        newest_events: {
          te: { val: 25.5, created_at: '2026-01-22T00:00:00Z' },
          hu: { val: 60, created_at: '2026-01-22T00:00:00Z' },
          il: { val: 100, created_at: '2026-01-22T00:00:00Z' },
        },
      };

      expect(device.id).toBe('device-123');
      expect(device.name).toBe('Living Room Remo');
      expect(device.firmware_version).toBe('1.0.0');
      expect(device.newest_events.te?.val).toBe(25.5);
      expect(device.newest_events.hu?.val).toBe(60);
      expect(device.newest_events.il?.val).toBe(100);
    });

    it('should allow missing sensor values', () => {
      const device: Device = {
        id: 'device-456',
        name: 'Bedroom Remo',
        firmware_version: '1.0.0',
        newest_events: {},
      };

      expect(device.newest_events.te).toBeUndefined();
      expect(device.newest_events.hu).toBeUndefined();
      expect(device.newest_events.il).toBeUndefined();
    });
  });

  describe('SensorValues type', () => {
    it('should represent sensor event data', () => {
      const sensor: SensorValues = {
        te: { val: 22.5, created_at: '2026-01-22T00:00:00Z' },
        hu: { val: 45, created_at: '2026-01-22T00:00:00Z' },
        il: { val: 200, created_at: '2026-01-22T00:00:00Z' },
      };

      expect(sensor.te?.val).toBe(22.5);
      expect(sensor.hu?.val).toBe(45);
      expect(sensor.il?.val).toBe(200);
    });
  });

  describe('Appliance type', () => {
    it('should represent an aircon appliance', () => {
      const appliance: Appliance = {
        id: 'appliance-ac-1',
        nickname: 'Living Room AC',
        type: 'AC',
        device: {
          id: 'device-123',
          name: 'Living Room Remo',
          firmware_version: '1.0.0',
          newest_events: {},
        },
        settings: {
          temp: '26',
          temp_unit: 'c',
          mode: 'cool',
          vol: 'auto',
          dir: 'auto',
          dirh: 'auto',
          button: '',
          updated_at: '2026-01-22T00:00:00Z',
        },
      };

      expect(appliance.id).toBe('appliance-ac-1');
      expect(appliance.type).toBe('AC');
      expect(appliance.settings?.temp).toBe('26');
      expect(appliance.settings?.mode).toBe('cool');
    });

    it('should represent a light appliance', () => {
      const appliance: Appliance = {
        id: 'appliance-light-1',
        nickname: 'Desk Light',
        type: 'LIGHT',
        device: {
          id: 'device-123',
          name: 'Living Room Remo',
          firmware_version: '1.0.0',
          newest_events: {},
        },
        light: {
          buttons: [
            { name: 'on', label: 'ON' },
            { name: 'off', label: 'OFF' },
          ],
          state: {
            power: 'on',
            brightness: '100',
          },
        },
      };

      expect(appliance.id).toBe('appliance-light-1');
      expect(appliance.type).toBe('LIGHT');
      expect(appliance.light?.state?.power).toBe('on');
    });

    it('should support generic IR appliance', () => {
      const appliance: Appliance = {
        id: 'appliance-ir-1',
        nickname: 'TV Remote',
        type: 'IR',
        device: {
          id: 'device-123',
          name: 'Living Room Remo',
          firmware_version: '1.0.0',
          newest_events: {},
        },
      };

      expect(appliance.type).toBe('IR');
      expect(appliance.settings).toBeUndefined();
      expect(appliance.light).toBeUndefined();
    });
  });

  describe('AirconSettings type', () => {
    it('should represent aircon settings', () => {
      const settings: AirconSettings = {
        temp: '25',
        temp_unit: 'c',
        mode: 'cool',
        vol: '2',
        dir: 'auto',
        dirh: 'auto',
        button: '',
        updated_at: '2026-01-22T00:00:00Z',
      };

      expect(settings.temp).toBe('25');
      expect(settings.mode).toBe('cool');
      expect(settings.vol).toBe('2');
    });
  });

  describe('AirconSettingsInput type', () => {
    it('should accept partial settings for update', () => {
      const input: AirconSettingsInput = {
        temperature: '26',
        operation_mode: 'cool',
      };

      expect(input.temperature).toBe('26');
      expect(input.operation_mode).toBe('cool');
      expect(input.air_volume).toBeUndefined();
    });

    it('should support power-off button', () => {
      const input: AirconSettingsInput = {
        button: 'power-off',
      };

      expect(input.button).toBe('power-off');
    });

    it('should support all operation modes', () => {
      const modes: AirconSettingsInput['operation_mode'][] = [
        'cool',
        'warm',
        'dry',
        'blow',
        'auto',
        undefined,
      ];

      expect(modes).toContain('cool');
      expect(modes).toContain('warm');
      expect(modes).toContain('dry');
      expect(modes).toContain('blow');
      expect(modes).toContain('auto');
    });

    it('should support air volume options', () => {
      const volumes: AirconSettingsInput['air_volume'][] = [
        'auto',
        '1',
        '2',
        '3',
        '4',
        undefined,
      ];

      expect(volumes).toContain('auto');
      expect(volumes).toContain('1');
    });
  });

  describe('LightState type', () => {
    it('should represent light state', () => {
      const state: LightState = {
        power: 'on',
        brightness: '80',
      };

      expect(state.power).toBe('on');
      expect(state.brightness).toBe('80');
    });

    it('should allow optional brightness', () => {
      const state: LightState = {
        power: 'off',
      };

      expect(state.power).toBe('off');
      expect(state.brightness).toBeUndefined();
    });
  });

  describe('RateLimitInfo type', () => {
    it('should represent rate limit information', () => {
      const info: RateLimitInfo = {
        limit: 30,
        remaining: 25,
        resetAt: new Date('2026-01-22T00:05:00Z'),
      };

      expect(info.limit).toBe(30);
      expect(info.remaining).toBe(25);
      expect(info.resetAt.toISOString()).toBe('2026-01-22T00:05:00.000Z');
    });
  });
});
