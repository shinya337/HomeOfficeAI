/**
 * DeviceStateService テスト
 *
 * Nature Remo APIからデバイス状態を取得するサービスのユニットテスト。
 * 正常取得、API失敗、デバイス未発見の各ケースを検証する。
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
import { describe, it, expect, vi } from 'vitest';
import { createDeviceStateService } from './device-state-service.js';
import type { ApplianceService, ApplianceInfo } from '../../../nature-remo/src/services/appliance-service.js';
import type { ServiceError, Result } from '../../../nature-remo/src/types/types.js';
import type { ApplianceConfig } from '../types/actions.js';

// =============================================================================
// テストヘルパー
// =============================================================================

function createMockApplianceService(
  result: Result<ApplianceInfo[], ServiceError>
): ApplianceService {
  return {
    getAppliances: vi.fn().mockResolvedValue(result),
    getApplianceById: vi.fn(),
  };
}

const defaultConfig: ApplianceConfig = {
  lightApplianceId: 'light-001',
  airconApplianceId: 'aircon-001',
};

function makeLightAppliance(id: string, power: 'on' | 'off'): ApplianceInfo {
  return {
    id,
    nickname: 'テスト照明',
    type: 'LIGHT',
    lightState: { power },
  };
}

function makeAirconAppliance(
  id: string,
  temperature: string,
  mode: string
): ApplianceInfo {
  return {
    id,
    nickname: 'テストエアコン',
    type: 'AC',
    airconSettings: { temperature, mode, volume: 'auto', power: 'on' },
  };
}

// =============================================================================
// テスト
// =============================================================================

describe('DeviceStateService', () => {
  describe('createDeviceStateService (Req 1.5)', () => {
    it('ApplianceConfigとApplianceServiceを受け取りサービスを生成すること', () => {
      const mockService = createMockApplianceService({
        success: true,
        data: [],
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      expect(service).toBeDefined();
      expect(typeof service.getDeviceState).toBe('function');
    });
  });

  describe('正常取得 (Req 1.1, 1.2, 1.3, 1.6)', () => {
    it('照明の電源状態（ON）を抽出すること', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      const mockService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toEqual({ power: 'on' });
      }
    });

    it('照明の電源状態（OFF）を抽出すること', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'off'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      const mockService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toEqual({ power: 'off' });
      }
    });

    it('エアコンの設定温度・運転モードを抽出すること', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      const mockService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.aircon).toEqual({ temperature: '26', mode: 'cool' });
      }
    });

    it('Result型（ok形式）で成功を返すこと', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '28', 'warm'),
      ];
      const mockService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          light: { power: 'on' },
          aircon: { temperature: '28', mode: 'warm' },
        });
      }
    });
  });

  describe('デバイス未発見 (Req 1.4)', () => {
    it('照明が見つからない場合はlight: nullを返すこと', async () => {
      const appliances: ApplianceInfo[] = [
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      const mockService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toBeNull();
        expect(result.value.aircon).toEqual({ temperature: '26', mode: 'cool' });
      }
    });

    it('エアコンが見つからない場合はaircon: nullを返すこと', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
      ];
      const mockService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toEqual({ power: 'on' });
        expect(result.value.aircon).toBeNull();
      }
    });

    it('両方のデバイスが見つからない場合は両方nullを返すこと', async () => {
      const mockService = createMockApplianceService({
        success: true,
        data: [],
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toBeNull();
        expect(result.value.aircon).toBeNull();
      }
    });

    it('異なるIDのデバイスが存在する場合はnullを返すこと', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-999', 'on'),
        makeAirconAppliance('aircon-999', '26', 'cool'),
      ];
      const mockService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toBeNull();
        expect(result.value.aircon).toBeNull();
      }
    });
  });

  describe('API失敗 (Req 1.4, 1.6)', () => {
    it('API失敗時はDeviceStateErrorを返すこと', async () => {
      const mockService = createMockApplianceService({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Nature Remo APIに接続できません',
        },
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.message).toContain('Nature Remo');
      }
    });

    it('RATE_LIMITエラー時もDeviceStateErrorを返すこと', async () => {
      const mockService = createMockApplianceService({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'レート制限',
          cause: { code: 'RATE_LIMIT', message: 'レート制限超過' },
        },
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('API_ERROR');
      }
    });
  });

  describe('adaptNatureRemoResult変換 (Req 1.6)', () => {
    it('nature-remoのResult型がiot-ai-agent-loopのResult型に変換されること', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      const mockService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService(defaultConfig, mockService);

      const result = await service.getDeviceState();

      // iot-ai-agent-loop形式（ok/value/error）であること
      expect('ok' in result).toBe(true);
      if (result.ok) {
        expect('value' in result).toBe(true);
      }
    });
  });
});
