/**
 * AirconService Tests
 *
 * TDD tests for aircon control service.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAirconService,
  type AirconService,
  type AirconOperationResult,
} from './aircon-service.js';
import type { NatureRemoClient } from '../client/nature-remo-client.js';
import type { Appliance, AirconSettings, Device } from '../types/types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock NatureRemoClient for testing.
 */
function createMockClient(
  overrides?: Partial<NatureRemoClient>
): NatureRemoClient {
  return {
    getDevices: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getAppliances: vi.fn().mockResolvedValue({ success: true, data: [] }),
    updateAirconSettings: vi
      .fn()
      .mockResolvedValue({ success: true, data: {} }),
    controlLight: vi.fn().mockResolvedValue({ success: true, data: {} }),
    ...overrides,
  };
}

/**
 * Create a mock device for testing.
 */
function createMockDevice(): Device {
  return {
    id: 'device-1',
    name: 'Test Device',
    firmware_version: '1.0.0',
    newest_events: {},
  };
}

/**
 * Create a mock aircon appliance for testing.
 */
function createMockAirconAppliance(
  id: string = 'aircon-1',
  settings?: Partial<AirconSettings>
): Appliance {
  return {
    id,
    nickname: 'Test Aircon',
    type: 'AC',
    device: createMockDevice(),
    settings: {
      temp: '26',
      temp_unit: 'c',
      mode: 'cool',
      vol: 'auto',
      dir: 'auto',
      dirh: 'auto',
      button: '',
      updated_at: '2026-01-22T00:00:00Z',
      ...settings,
    },
  };
}

/**
 * Create a mock light appliance for testing.
 */
function createMockLightAppliance(id: string = 'light-1'): Appliance {
  return {
    id,
    nickname: 'Test Light',
    type: 'LIGHT',
    device: createMockDevice(),
    light: {
      buttons: [{ name: 'on', label: 'On' }],
      state: { power: 'on' },
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('AirconService', () => {
  let mockClient: NatureRemoClient;
  let service: AirconService;

  beforeEach(() => {
    mockClient = createMockClient();
    service = createAirconService(mockClient);
  });

  describe('updateSettings', () => {
    // -------------------------------------------------------------------------
    // Requirement 4.1: エアコンタイプの検証
    // -------------------------------------------------------------------------
    describe('Requirement 4.1: Validate appliance is AC type', () => {
      it('should accept AC type appliance', async () => {
        const aircon = createMockAirconAppliance('aircon-1');
        const updatedSettings: AirconSettings = {
          temp: '26',
          temp_unit: 'c',
          mode: 'cool',
          vol: 'auto',
          dir: 'auto',
          dirh: 'auto',
          button: '',
          updated_at: '2026-01-22T00:00:00Z',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi
          .fn()
          .mockResolvedValue({ success: true, data: updatedSettings });

        const result = await service.updateSettings('aircon-1', {
          temperature: '26',
        });

        expect(result.success).toBe(true);
      });

      it('should reject non-AC appliance with NOT_AIRCON error', async () => {
        const light = createMockLightAppliance('light-1');

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });

        const result = await service.updateSettings('light-1', {
          temperature: '26',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_AIRCON');
          expect(result.error.message).toContain('エアコン');
        }
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 4.2: 温度パラメータの送信
    // -------------------------------------------------------------------------
    describe('Requirement 4.2: Send temperature parameter', () => {
      it('should send temperature parameter to API', async () => {
        const aircon = createMockAirconAppliance('aircon-1');
        const updatedSettings: AirconSettings = {
          temp: '24',
          temp_unit: 'c',
          mode: 'cool',
          vol: 'auto',
          dir: 'auto',
          dirh: 'auto',
          button: '',
          updated_at: '2026-01-22T00:00:00Z',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi
          .fn()
          .mockResolvedValue({ success: true, data: updatedSettings });

        await service.updateSettings('aircon-1', { temperature: '24' });

        expect(mockClient.updateAirconSettings).toHaveBeenCalledWith(
          'aircon-1',
          expect.objectContaining({ temperature: '24' })
        );
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 4.3: 運転モード・風量パラメータの送信
    // -------------------------------------------------------------------------
    describe('Requirement 4.3: Send operation_mode and air_volume parameters', () => {
      it('should send operation_mode parameter to API', async () => {
        const aircon = createMockAirconAppliance('aircon-1');
        const updatedSettings: AirconSettings = {
          temp: '26',
          temp_unit: 'c',
          mode: 'warm',
          vol: 'auto',
          dir: 'auto',
          dirh: 'auto',
          button: '',
          updated_at: '2026-01-22T00:00:00Z',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi
          .fn()
          .mockResolvedValue({ success: true, data: updatedSettings });

        await service.updateSettings('aircon-1', { operation_mode: 'warm' });

        expect(mockClient.updateAirconSettings).toHaveBeenCalledWith(
          'aircon-1',
          expect.objectContaining({ operation_mode: 'warm' })
        );
      });

      it('should send air_volume parameter to API', async () => {
        const aircon = createMockAirconAppliance('aircon-1');
        const updatedSettings: AirconSettings = {
          temp: '26',
          temp_unit: 'c',
          mode: 'cool',
          vol: '2',
          dir: 'auto',
          dirh: 'auto',
          button: '',
          updated_at: '2026-01-22T00:00:00Z',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi
          .fn()
          .mockResolvedValue({ success: true, data: updatedSettings });

        await service.updateSettings('aircon-1', { air_volume: '2' });

        expect(mockClient.updateAirconSettings).toHaveBeenCalledWith(
          'aircon-1',
          expect.objectContaining({ air_volume: '2' })
        );
      });

      it('should send multiple parameters at once', async () => {
        const aircon = createMockAirconAppliance('aircon-1');
        const updatedSettings: AirconSettings = {
          temp: '22',
          temp_unit: 'c',
          mode: 'dry',
          vol: '3',
          dir: 'auto',
          dirh: 'auto',
          button: '',
          updated_at: '2026-01-22T00:00:00Z',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi
          .fn()
          .mockResolvedValue({ success: true, data: updatedSettings });

        await service.updateSettings('aircon-1', {
          temperature: '22',
          operation_mode: 'dry',
          air_volume: '3',
        });

        expect(mockClient.updateAirconSettings).toHaveBeenCalledWith(
          'aircon-1',
          expect.objectContaining({
            temperature: '22',
            operation_mode: 'dry',
            air_volume: '3',
          })
        );
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 4.4: 電源オフ操作のサポート
    // -------------------------------------------------------------------------
    describe('Requirement 4.4: Support power-off operation', () => {
      it('should send power-off button parameter', async () => {
        const aircon = createMockAirconAppliance('aircon-1');
        const updatedSettings: AirconSettings = {
          temp: '26',
          temp_unit: 'c',
          mode: 'cool',
          vol: 'auto',
          dir: 'auto',
          dirh: 'auto',
          button: 'power-off',
          updated_at: '2026-01-22T00:00:00Z',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi
          .fn()
          .mockResolvedValue({ success: true, data: updatedSettings });

        await service.updateSettings('aircon-1', { button: 'power-off' });

        expect(mockClient.updateAirconSettings).toHaveBeenCalledWith(
          'aircon-1',
          expect.objectContaining({ button: 'power-off' })
        );
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 4.5: 更新後の設定を返却
    // -------------------------------------------------------------------------
    describe('Requirement 4.5: Return updated settings on success', () => {
      it('should return formatted settings on success', async () => {
        const aircon = createMockAirconAppliance('aircon-1');
        const updatedSettings: AirconSettings = {
          temp: '24',
          temp_unit: 'c',
          mode: 'cool',
          vol: '2',
          dir: 'auto',
          dirh: 'auto',
          button: '',
          updated_at: '2026-01-22T00:00:00Z',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi
          .fn()
          .mockResolvedValue({ success: true, data: updatedSettings });

        const result = await service.updateSettings('aircon-1', {
          temperature: '24',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            applianceId: 'aircon-1',
            temperature: '24',
            mode: 'cool',
            volume: '2',
            power: 'on',
          });
        }
      });

      it('should return power off state when button is power-off', async () => {
        const aircon = createMockAirconAppliance('aircon-1');
        const updatedSettings: AirconSettings = {
          temp: '26',
          temp_unit: 'c',
          mode: 'cool',
          vol: 'auto',
          dir: 'auto',
          dirh: 'auto',
          button: 'power-off',
          updated_at: '2026-01-22T00:00:00Z',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi
          .fn()
          .mockResolvedValue({ success: true, data: updatedSettings });

        const result = await service.updateSettings('aircon-1', {
          button: 'power-off',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.power).toBe('off');
        }
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 4.6: エアコン以外が指定された場合のエラー処理
    // -------------------------------------------------------------------------
    describe('Requirement 4.6: Error handling for non-AC appliance', () => {
      it('should return NOT_AIRCON error for LIGHT type', async () => {
        const light = createMockLightAppliance('light-1');

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });

        const result = await service.updateSettings('light-1', {
          temperature: '26',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_AIRCON');
          expect(result.error.message).toContain('エアコンではありません');
        }
      });

      it('should return NOT_AIRCON error for TV type', async () => {
        const tv: Appliance = {
          id: 'tv-1',
          nickname: 'Test TV',
          type: 'TV',
          device: createMockDevice(),
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [tv] });

        const result = await service.updateSettings('tv-1', {
          temperature: '26',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_AIRCON');
        }
      });

      it('should return NOT_AIRCON error for IR type', async () => {
        const ir: Appliance = {
          id: 'ir-1',
          nickname: 'Custom IR',
          type: 'IR',
          device: createMockDevice(),
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [ir] });

        const result = await service.updateSettings('ir-1', {
          temperature: '26',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_AIRCON');
        }
      });
    });

    // -------------------------------------------------------------------------
    // Additional Error Cases
    // -------------------------------------------------------------------------
    describe('Error handling', () => {
      it('should return APPLIANCE_NOT_FOUND for unknown ID', async () => {
        const aircon = createMockAirconAppliance('aircon-1');

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });

        const result = await service.updateSettings('unknown-id', {
          temperature: '26',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('APPLIANCE_NOT_FOUND');
        }
      });

      it('should propagate API errors', async () => {
        mockClient.getAppliances = vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
        });

        const result = await service.updateSettings('aircon-1', {
          temperature: '26',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('API_ERROR');
        }
      });

      it('should propagate API errors from updateAirconSettings', async () => {
        const aircon = createMockAirconAppliance('aircon-1');

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });
        mockClient.updateAirconSettings = vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'RATE_LIMIT', message: 'Rate limit exceeded' },
        });

        const result = await service.updateSettings('aircon-1', {
          temperature: '26',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('API_ERROR');
        }
      });
    });
  });
});
