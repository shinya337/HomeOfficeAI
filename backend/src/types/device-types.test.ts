/**
 * Device Types Tests
 * TDD: RED phase - Write failing tests first
 *
 * Task 1.1: デバイス関連の型定義を追加する
 * Requirements: 1.2, 3.2
 */
import { describe, it, expect } from 'vitest';
import type {
  DeviceType,
  Device,
  AllowedDevice,
  DeviceListResponse,
  DeviceErrorResponse,
} from './device-types';
import type { SessionState } from './session-types';

describe('Device Types', () => {
  describe('DeviceType', () => {
    it('should support LIGHT device type', () => {
      const type: DeviceType = 'LIGHT';
      expect(type).toBe('LIGHT');
    });

    it('should support AC device type', () => {
      const type: DeviceType = 'AC';
      expect(type).toBe('AC');
    });

    it('should support TV device type', () => {
      const type: DeviceType = 'TV';
      expect(type).toBe('TV');
    });

    it('should support IR device type', () => {
      const type: DeviceType = 'IR';
      expect(type).toBe('IR');
    });

    it('should support ALEXA device type', () => {
      const type: DeviceType = 'ALEXA';
      expect(type).toBe('ALEXA');
    });

    it('should only allow valid device types', () => {
      const validTypes: DeviceType[] = ['LIGHT', 'AC', 'TV', 'IR', 'ALEXA'];
      expect(validTypes).toHaveLength(5);
      validTypes.forEach((type) => {
        expect(['LIGHT', 'AC', 'TV', 'IR', 'ALEXA']).toContain(type);
      });
    });
  });

  describe('Device', () => {
    it('should have required fields: id, name, type', () => {
      const device: Device = {
        id: 'device-123',
        name: 'リビングの照明',
        type: 'LIGHT',
      };

      expect(device.id).toBe('device-123');
      expect(device.name).toBe('リビングの照明');
      expect(device.type).toBe('LIGHT');
    });

    it('should be readonly', () => {
      const device: Device = {
        id: 'device-123',
        name: 'エアコン',
        type: 'AC',
      };

      // TypeScript compile-time check: readonly properties cannot be modified
      expect(device.id).toBe('device-123');
      expect(device.name).toBe('エアコン');
      expect(device.type).toBe('AC');
    });

    it('should support optional signals field for LIGHT devices', () => {
      const device: Device = {
        id: 'light-1',
        name: 'リビングの照明',
        type: 'LIGHT',
        signals: ['安らぎ', '通常', '読書', '家事'],
      };

      expect(device.signals).toEqual(['安らぎ', '通常', '読書', '家事']);
    });

    it('should allow signals to be undefined for non-LIGHT devices', () => {
      const device: Device = {
        id: 'ac-1',
        name: 'エアコン',
        type: 'AC',
      };

      expect(device.signals).toBeUndefined();
    });

    it('should support empty signals array for LIGHT without custom signals', () => {
      const device: Device = {
        id: 'light-2',
        name: '寝室の照明',
        type: 'LIGHT',
        signals: [],
      };

      expect(device.signals).toEqual([]);
    });
  });

  describe('AllowedDevice', () => {
    it('should have required fields: id, type', () => {
      const allowedDevice: AllowedDevice = {
        id: 'device-456',
        type: 'TV',
      };

      expect(allowedDevice.id).toBe('device-456');
      expect(allowedDevice.type).toBe('TV');
    });

    it('should be readonly', () => {
      const allowedDevice: AllowedDevice = {
        id: 'device-789',
        type: 'IR',
      };

      expect(allowedDevice.id).toBe('device-789');
      expect(allowedDevice.type).toBe('IR');
    });

    it('should support ALEXA device type', () => {
      const allowedDevice: AllowedDevice = {
        id: 'alexa-echo-1',
        type: 'ALEXA',
      };

      expect(allowedDevice.id).toBe('alexa-echo-1');
      expect(allowedDevice.type).toBe('ALEXA');
    });

    it('should support optional signals field for LIGHT devices', () => {
      const allowedDevice: AllowedDevice = {
        id: 'light-1',
        type: 'LIGHT',
        signals: ['安らぎ', '通常', '読書'],
      };

      expect(allowedDevice.signals).toEqual(['安らぎ', '通常', '読書']);
    });

    it('should allow signals to be undefined', () => {
      const allowedDevice: AllowedDevice = {
        id: 'ac-1',
        type: 'AC',
      };

      expect(allowedDevice.signals).toBeUndefined();
    });
  });

  describe('DeviceListResponse', () => {
    it('should have required devices array', () => {
      const response: DeviceListResponse = {
        devices: [
          { id: 'device-1', name: '照明', type: 'LIGHT' },
          { id: 'device-2', name: 'エアコン', type: 'AC' },
        ],
      };

      expect(response.devices).toHaveLength(2);
      expect(response.devices[0].name).toBe('照明');
      expect(response.devices[1].type).toBe('AC');
    });

    it('should allow empty devices array', () => {
      const response: DeviceListResponse = {
        devices: [],
      };

      expect(response.devices).toHaveLength(0);
    });

    it('should have readonly devices array', () => {
      const response: DeviceListResponse = {
        devices: [{ id: 'device-1', name: 'テレビ', type: 'TV' }],
      };

      expect(response.devices).toBeInstanceOf(Array);
    });
  });

  describe('DeviceErrorResponse', () => {
    it('should have error with NATURE_API_ERROR code', () => {
      const response: DeviceErrorResponse = {
        error: {
          code: 'NATURE_API_ERROR',
          message: 'Nature Remo APIへの接続に失敗しました',
        },
      };

      expect(response.error.code).toBe('NATURE_API_ERROR');
      expect(response.error.message).toBe('Nature Remo APIへの接続に失敗しました');
    });

    it('should have error with RATE_LIMIT_EXCEEDED code and retryAfter', () => {
      const response: DeviceErrorResponse = {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'レート制限を超過しました',
          retryAfter: 300,
        },
      };

      expect(response.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.error.retryAfter).toBe(300);
    });

    it('should have error with INTERNAL_ERROR code', () => {
      const response: DeviceErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: '内部エラーが発生しました',
        },
      };

      expect(response.error.code).toBe('INTERNAL_ERROR');
    });

    it('should have optional retryAfter field', () => {
      const responseWithRetry: DeviceErrorResponse = {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'レート制限超過',
          retryAfter: 60,
        },
      };

      const responseWithoutRetry: DeviceErrorResponse = {
        error: {
          code: 'NATURE_API_ERROR',
          message: 'API接続エラー',
        },
      };

      expect(responseWithRetry.error.retryAfter).toBe(60);
      expect(responseWithoutRetry.error.retryAfter).toBeUndefined();
    });
  });

  describe('SessionState with allowedDevices', () => {
    it('should support optional allowedDevices field', () => {
      const sessionWithoutDevices: SessionState = {
        sessionId: 'session-123',
        status: 'active',
        startedAt: '2026-02-05T00:00:00.000Z',
      };

      const sessionWithDevices: SessionState = {
        sessionId: 'session-456',
        status: 'active',
        startedAt: '2026-02-05T00:00:00.000Z',
        allowedDevices: [
          { id: 'device-1', type: 'LIGHT' },
          { id: 'device-2', type: 'AC' },
        ],
      };

      expect(sessionWithoutDevices.allowedDevices).toBeUndefined();
      expect(sessionWithDevices.allowedDevices).toHaveLength(2);
    });

    it('should have allowedDevices as readonly array of AllowedDevice', () => {
      const session: SessionState = {
        sessionId: 'session-789',
        status: 'active',
        startedAt: '2026-02-05T00:00:00.000Z',
        allowedDevices: [
          { id: 'light-1', type: 'LIGHT' },
          { id: 'ac-1', type: 'AC' },
          { id: 'tv-1', type: 'TV' },
          { id: 'ir-1', type: 'IR' },
        ],
      };

      expect(session.allowedDevices).toBeDefined();
      expect(session.allowedDevices![0].id).toBe('light-1');
      expect(session.allowedDevices![0].type).toBe('LIGHT');
      expect(session.allowedDevices![1].type).toBe('AC');
      expect(session.allowedDevices![2].type).toBe('TV');
      expect(session.allowedDevices![3].type).toBe('IR');
    });

    it('should allow empty allowedDevices array', () => {
      const session: SessionState = {
        sessionId: 'session-empty',
        status: 'active',
        startedAt: '2026-02-05T00:00:00.000Z',
        allowedDevices: [],
      };

      expect(session.allowedDevices).toHaveLength(0);
    });

    it('should support ALEXA device type in allowedDevices', () => {
      const session: SessionState = {
        sessionId: 'session-alexa',
        status: 'active',
        startedAt: '2026-02-05T00:00:00.000Z',
        allowedDevices: [
          { id: 'light-1', type: 'LIGHT' },
          { id: 'alexa-1', type: 'ALEXA' },
        ],
      };

      expect(session.allowedDevices).toHaveLength(2);
      expect(session.allowedDevices![1].type).toBe('ALEXA');
    });
  });
});
