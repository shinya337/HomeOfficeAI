/**
 * LightService Tests
 *
 * TDD tests for light control service.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLightService,
  type LightService,
  type LightOperationResult,
} from './light-service.js';
import type { NatureRemoClient } from '../client/nature-remo-client.js';
import type { Appliance, LightState, Device } from '../types/types.js';

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
 * Create a mock light appliance for testing.
 */
function createMockLightAppliance(
  id: string = 'light-1',
  state?: Partial<LightState>
): Appliance {
  return {
    id,
    nickname: 'Test Light',
    type: 'LIGHT',
    device: createMockDevice(),
    light: {
      buttons: [
        { name: 'on', label: 'On' },
        { name: 'off', label: 'Off' },
      ],
      state: {
        power: 'on',
        ...state,
      },
    },
  };
}

/**
 * Create a mock aircon appliance for testing.
 */
function createMockAirconAppliance(id: string = 'aircon-1'): Appliance {
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
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('LightService', () => {
  let mockClient: NatureRemoClient;
  let service: LightService;

  beforeEach(() => {
    mockClient = createMockClient();
    service = createLightService(mockClient);
  });

  describe('control', () => {
    // -------------------------------------------------------------------------
    // Requirement 5.1: 照明タイプの検証
    // POST /1/appliances/{id}/light エンドポイントを呼び出す
    // -------------------------------------------------------------------------
    describe('Requirement 5.1: Validate appliance is LIGHT type and call API', () => {
      it('should accept LIGHT type appliance', async () => {
        const light = createMockLightAppliance('light-1');
        const lightState: LightState = {
          power: 'on',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });
        mockClient.controlLight = vi
          .fn()
          .mockResolvedValue({ success: true, data: lightState });

        const result = await service.control('light-1', 'on');

        expect(result.success).toBe(true);
      });

      it('should call controlLight API with correct appliance ID', async () => {
        const light = createMockLightAppliance('light-1');
        const lightState: LightState = {
          power: 'on',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });
        mockClient.controlLight = vi
          .fn()
          .mockResolvedValue({ success: true, data: lightState });

        await service.control('light-1', 'on');

        expect(mockClient.controlLight).toHaveBeenCalledWith('light-1', 'on');
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 5.2: 点灯操作 (button=on)
    // -------------------------------------------------------------------------
    describe('Requirement 5.2: Send on button parameter', () => {
      it('should send button=on parameter to API', async () => {
        const light = createMockLightAppliance('light-1');
        const lightState: LightState = {
          power: 'on',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });
        mockClient.controlLight = vi
          .fn()
          .mockResolvedValue({ success: true, data: lightState });

        await service.control('light-1', 'on');

        expect(mockClient.controlLight).toHaveBeenCalledWith('light-1', 'on');
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 5.3: 消灯操作 (button=off)
    // -------------------------------------------------------------------------
    describe('Requirement 5.3: Send off button parameter', () => {
      it('should send button=off parameter to API', async () => {
        const light = createMockLightAppliance('light-1');
        const lightState: LightState = {
          power: 'off',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });
        mockClient.controlLight = vi
          .fn()
          .mockResolvedValue({ success: true, data: lightState });

        await service.control('light-1', 'off');

        expect(mockClient.controlLight).toHaveBeenCalledWith('light-1', 'off');
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 5.4: 操作結果の返却
    // -------------------------------------------------------------------------
    describe('Requirement 5.4: Return operation result on success', () => {
      it('should return formatted result on turn on success', async () => {
        const light = createMockLightAppliance('light-1');
        const lightState: LightState = {
          power: 'on',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });
        mockClient.controlLight = vi
          .fn()
          .mockResolvedValue({ success: true, data: lightState });

        const result = await service.control('light-1', 'on');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            applianceId: 'light-1',
            action: 'on',
            success: true,
          });
        }
      });

      it('should return formatted result on turn off success', async () => {
        const light = createMockLightAppliance('light-1');
        const lightState: LightState = {
          power: 'off',
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });
        mockClient.controlLight = vi
          .fn()
          .mockResolvedValue({ success: true, data: lightState });

        const result = await service.control('light-1', 'off');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            applianceId: 'light-1',
            action: 'off',
            success: true,
          });
        }
      });
    });

    // -------------------------------------------------------------------------
    // Requirement 5.5: 照明以外が指定された場合のエラー処理
    // -------------------------------------------------------------------------
    describe('Requirement 5.5: Error handling for non-LIGHT appliance', () => {
      it('should return NOT_LIGHT error for AC type', async () => {
        const aircon = createMockAirconAppliance('aircon-1');

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [aircon] });

        const result = await service.control('aircon-1', 'on');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_LIGHT');
          expect(result.error.message).toContain('照明ではありません');
        }
      });

      it('should return NOT_LIGHT error for TV type', async () => {
        const tv: Appliance = {
          id: 'tv-1',
          nickname: 'Test TV',
          type: 'TV',
          device: createMockDevice(),
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [tv] });

        const result = await service.control('tv-1', 'on');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_LIGHT');
        }
      });

      it('should return NOT_LIGHT error for IR type', async () => {
        const ir: Appliance = {
          id: 'ir-1',
          nickname: 'Custom IR',
          type: 'IR',
          device: createMockDevice(),
        };

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [ir] });

        const result = await service.control('ir-1', 'on');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_LIGHT');
        }
      });
    });

    // -------------------------------------------------------------------------
    // Additional Error Cases
    // -------------------------------------------------------------------------
    describe('Error handling', () => {
      it('should return APPLIANCE_NOT_FOUND for unknown ID', async () => {
        const light = createMockLightAppliance('light-1');

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });

        const result = await service.control('unknown-id', 'on');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('APPLIANCE_NOT_FOUND');
        }
      });

      it('should propagate API errors from getAppliances', async () => {
        mockClient.getAppliances = vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
        });

        const result = await service.control('light-1', 'on');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('API_ERROR');
        }
      });

      it('should propagate API errors from controlLight', async () => {
        const light = createMockLightAppliance('light-1');

        mockClient.getAppliances = vi
          .fn()
          .mockResolvedValue({ success: true, data: [light] });
        mockClient.controlLight = vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'RATE_LIMIT', message: 'Rate limit exceeded' },
        });

        const result = await service.control('light-1', 'on');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('API_ERROR');
        }
      });
    });
  });
});
