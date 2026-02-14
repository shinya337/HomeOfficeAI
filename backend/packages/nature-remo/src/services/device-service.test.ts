/**
 * Device Service Tests
 *
 * TDD tests for DeviceService implementation.
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDeviceService,
  type DeviceService,
  type DeviceInfo,
  type SensorValuesFormatted,
} from './device-service.js';
import type { NatureRemoClient } from '../client/nature-remo-client.js';
import type { Device, Result, ApiError } from '../types/types.js';

// Mock NatureRemoClient factory
function createMockClient(
  getDevicesResult: Result<Device[], ApiError>
): NatureRemoClient {
  return {
    getDevices: vi.fn().mockResolvedValue(getDevicesResult),
    getAppliances: vi.fn(),
    updateAirconSettings: vi.fn(),
    controlLight: vi.fn(),
  };
}

// Sample device data
const sampleDevice: Device = {
  id: 'device-001',
  name: 'Living Room Remo',
  firmware_version: 'Remo/1.0.62-g8e2b5c7',
  newest_events: {
    te: { val: 25.4, created_at: '2026-01-22T10:00:00Z' },
    hu: { val: 60, created_at: '2026-01-22T10:00:00Z' },
    il: { val: 150.5, created_at: '2026-01-22T10:00:00Z' },
  },
};

const sampleDeviceNoSensors: Device = {
  id: 'device-002',
  name: 'Bedroom Remo Mini',
  firmware_version: 'Remo-mini/1.0.45',
  newest_events: {},
};

describe('DeviceService', () => {
  describe('createDeviceService', () => {
    it('should create a DeviceService instance', () => {
      const mockClient = createMockClient({
        success: true,
        data: [],
      });
      const service = createDeviceService(mockClient);
      expect(service).toBeDefined();
      expect(typeof service.getDevices).toBe('function');
    });
  });

  describe('getDevices', () => {
    describe('Requirement 2.1: デバイス一覧取得', () => {
      it('should call NatureRemoClient.getDevices()', async () => {
        const mockClient = createMockClient({
          success: true,
          data: [sampleDevice],
        });
        const service = createDeviceService(mockClient);

        await service.getDevices();

        expect(mockClient.getDevices).toHaveBeenCalledTimes(1);
      });
    });

    describe('Requirement 2.2: デバイス情報の抽出', () => {
      it('should extract id, name, and firmwareVersion from devices', async () => {
        const mockClient = createMockClient({
          success: true,
          data: [sampleDevice],
        });
        const service = createDeviceService(mockClient);

        const result = await service.getDevices();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveLength(1);
          expect(result.data[0]).toMatchObject({
            id: 'device-001',
            name: 'Living Room Remo',
            firmwareVersion: 'Remo/1.0.62-g8e2b5c7',
          });
        }
      });

      it('should handle multiple devices', async () => {
        const mockClient = createMockClient({
          success: true,
          data: [sampleDevice, sampleDeviceNoSensors],
        });
        const service = createDeviceService(mockClient);

        const result = await service.getDevices();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveLength(2);
          expect(result.data[0].id).toBe('device-001');
          expect(result.data[1].id).toBe('device-002');
        }
      });
    });

    describe('Requirement 2.3: センサー値の読み取り', () => {
      it('should extract temperature (te), humidity (hu), and illumination (il)', async () => {
        const mockClient = createMockClient({
          success: true,
          data: [sampleDevice],
        });
        const service = createDeviceService(mockClient);

        const result = await service.getDevices();

        expect(result.success).toBe(true);
        if (result.success) {
          const sensors = result.data[0].sensors;
          expect(sensors).not.toBeNull();
          expect(sensors?.temperature).toBe(25.4);
          expect(sensors?.humidity).toBe(60);
          expect(sensors?.illumination).toBe(150.5);
        }
      });

      it('should return null sensors for devices without sensor data', async () => {
        const mockClient = createMockClient({
          success: true,
          data: [sampleDeviceNoSensors],
        });
        const service = createDeviceService(mockClient);

        const result = await service.getDevices();

        expect(result.success).toBe(true);
        if (result.success) {
          const sensors = result.data[0].sensors;
          expect(sensors).toBeNull();
        }
      });

      it('should handle partial sensor data', async () => {
        const deviceWithPartialSensors: Device = {
          id: 'device-003',
          name: 'Kitchen Remo',
          firmware_version: 'Remo/1.0.60',
          newest_events: {
            te: { val: 22.5, created_at: '2026-01-22T10:00:00Z' },
            // No humidity or illumination
          },
        };
        const mockClient = createMockClient({
          success: true,
          data: [deviceWithPartialSensors],
        });
        const service = createDeviceService(mockClient);

        const result = await service.getDevices();

        expect(result.success).toBe(true);
        if (result.success) {
          const sensors = result.data[0].sensors;
          expect(sensors).not.toBeNull();
          expect(sensors?.temperature).toBe(22.5);
          expect(sensors?.humidity).toBeNull();
          expect(sensors?.illumination).toBeNull();
        }
      });
    });

    describe('Requirement 2.4: 0件時のハンドリング', () => {
      it('should return empty array with noDevicesMessage when no devices', async () => {
        const mockClient = createMockClient({
          success: true,
          data: [],
        });
        const service = createDeviceService(mockClient);

        const result = await service.getDevices();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveLength(0);
        }
      });
    });

    describe('Error handling', () => {
      it('should propagate API errors', async () => {
        const mockClient = createMockClient({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'アクセストークンが無効です',
          },
        });
        const service = createDeviceService(mockClient);

        const result = await service.getDevices();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('API_ERROR');
          expect(result.error.cause?.code).toBe('UNAUTHORIZED');
        }
      });

      it('should handle network errors', async () => {
        const mockClient = createMockClient({
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'ネットワーク接続を確認してください',
          },
        });
        const service = createDeviceService(mockClient);

        const result = await service.getDevices();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('API_ERROR');
          expect(result.error.cause?.code).toBe('NETWORK_ERROR');
        }
      });
    });
  });

  describe('getNoDevicesMessage', () => {
    it('should return the correct message for no devices', () => {
      const mockClient = createMockClient({
        success: true,
        data: [],
      });
      const service = createDeviceService(mockClient);

      const message = service.getNoDevicesMessage();

      expect(message).toBe('登録済みデバイスがありません');
    });
  });

  describe('formatDeviceForDisplay', () => {
    let service: DeviceService;

    beforeEach(() => {
      const mockClient = createMockClient({
        success: true,
        data: [],
      });
      service = createDeviceService(mockClient);
    });

    it('should format device with sensors for display', () => {
      const deviceInfo: DeviceInfo = {
        id: 'device-001',
        name: 'Living Room Remo',
        firmwareVersion: 'Remo/1.0.62',
        sensors: {
          temperature: 25.4,
          humidity: 60,
          illumination: 150,
        },
      };

      const formatted = service.formatDeviceForDisplay(deviceInfo);

      expect(formatted).toEqual({
        ID: 'device-001',
        Name: 'Living Room Remo',
        Firmware: 'Remo/1.0.62',
        Temperature: '25.4°C',
        Humidity: '60%',
        Illumination: '150 lux',
      });
    });

    it('should format device without sensors', () => {
      const deviceInfo: DeviceInfo = {
        id: 'device-002',
        name: 'Bedroom Remo',
        firmwareVersion: 'Remo/1.0.45',
        sensors: null,
      };

      const formatted = service.formatDeviceForDisplay(deviceInfo);

      expect(formatted).toEqual({
        ID: 'device-002',
        Name: 'Bedroom Remo',
        Firmware: 'Remo/1.0.45',
        Temperature: '-',
        Humidity: '-',
        Illumination: '-',
      });
    });

    it('should format device with partial sensors', () => {
      const deviceInfo: DeviceInfo = {
        id: 'device-003',
        name: 'Kitchen Remo',
        firmwareVersion: 'Remo/1.0.60',
        sensors: {
          temperature: 22.5,
          humidity: null,
          illumination: null,
        },
      };

      const formatted = service.formatDeviceForDisplay(deviceInfo);

      expect(formatted).toEqual({
        ID: 'device-003',
        Name: 'Kitchen Remo',
        Firmware: 'Remo/1.0.60',
        Temperature: '22.5°C',
        Humidity: '-',
        Illumination: '-',
      });
    });
  });
});
