/**
 * ActionDispatcher テスト
 *
 * AgentActionをIoTサービス呼び出しに変換して実行する機能を検証する。
 * ApplianceConfigからappliance_idを注入してサービスを呼び出す。
 *
 * Requirements: 4.1, 4.2, 4.5, 6.2
 */
import { describe, it, expect, vi } from 'vitest';
import { createActionDispatcher } from './action-dispatcher.js';
import type { AgentAction } from '../types/actions.js';
import type { ApplianceConfig } from '../types/actions.js';
import type { LightService } from '../../../nature-remo/src/services/light-service.js';
import type { AirconService } from '../../../nature-remo/src/services/aircon-service.js';

// =============================================================================
// テストヘルパー
// =============================================================================

function createMockLightService(): LightService {
  return {
    control: vi.fn(),
  };
}

function createMockAirconService(): AirconService {
  return {
    updateSettings: vi.fn(),
  };
}

const testConfig: ApplianceConfig = {
  lightApplianceId: 'config-light-id',
  airconApplianceId: 'config-aircon-id',
};

// =============================================================================
// light_control テスト
// =============================================================================

describe('ActionDispatcher', () => {
  describe('light_control アクション', () => {
    it('configのlightApplianceIdを使用してLightService.control()を呼び出す', async () => {
      const lightService = createMockLightService();
      vi.mocked(lightService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'config-light-id', action: 'on', success: true },
      });
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      await dispatcher.dispatch(action);

      expect(lightService.control).toHaveBeenCalledWith('config-light-id', 'on');
    });

    it('照明ON成功時に executed=true, nextInterval=normal を返す', async () => {
      const lightService = createMockLightService();
      vi.mocked(lightService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'config-light-id', action: 'on', success: true },
      });
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
      }
    });

    it('照明OFF成功時も executed=true を返す', async () => {
      const lightService = createMockLightService();
      vi.mocked(lightService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'config-light-id', action: 'off', success: true },
      });
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'off' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
      }
    });

    it('LightService エラー時に IOT_ERROR を返す', async () => {
      const lightService = createMockLightService();
      vi.mocked(lightService.control).mockResolvedValue({
        success: false,
        error: { code: 'NOT_LIGHT', message: '照明ではありません' },
      });
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({ code: 'NOT_LIGHT', message: '照明ではありません' });
      }
    });

    it('LightService レート制限エラー時に RATE_LIMIT を返す', async () => {
      const lightService = createMockLightService();
      vi.mocked(lightService.control).mockResolvedValue({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Rate limit exceeded',
          cause: { code: 'RATE_LIMIT', message: 'Rate limit exceeded' },
        },
      });
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMIT');
      }
    });
  });

  // =============================================================================
  // aircon_control テスト
  // =============================================================================

  describe('aircon_control アクション', () => {
    it('configのairconApplianceIdを使用してAirconService.updateSettings()を呼び出す', async () => {
      const lightService = createMockLightService();
      const airconService = createMockAirconService();
      vi.mocked(airconService.updateSettings).mockResolvedValue({
        success: true,
        data: {
          applianceId: 'config-aircon-id',
          temperature: '26',
          mode: 'cool',
          volume: 'auto',
          power: 'on',
        },
      });
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 26, mode: 'cool' },
      };

      await dispatcher.dispatch(action);

      expect(airconService.updateSettings).toHaveBeenCalledWith('config-aircon-id', {
        temperature: '26',
        operation_mode: 'cool',
        button: '',
      });
    });

    it('エアコン設定成功時に executed=true, nextInterval=normal を返す', async () => {
      const lightService = createMockLightService();
      const airconService = createMockAirconService();
      vi.mocked(airconService.updateSettings).mockResolvedValue({
        success: true,
        data: {
          applianceId: 'config-aircon-id',
          temperature: '26',
          mode: 'cool',
          volume: 'auto',
          power: 'on',
        },
      });
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 26 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
      }
    });

    it('mode未指定時はoperation_modeを含めない', async () => {
      const lightService = createMockLightService();
      const airconService = createMockAirconService();
      vi.mocked(airconService.updateSettings).mockResolvedValue({
        success: true,
        data: {
          applianceId: 'config-aircon-id',
          temperature: '24',
          mode: 'auto',
          volume: 'auto',
          power: 'on',
        },
      });
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 24 },
      };

      await dispatcher.dispatch(action);

      expect(airconService.updateSettings).toHaveBeenCalledWith('config-aircon-id', {
        temperature: '24',
        button: '',
      });
    });

    it('AirconService エラー時に IOT_ERROR を返す', async () => {
      const lightService = createMockLightService();
      const airconService = createMockAirconService();
      vi.mocked(airconService.updateSettings).mockResolvedValue({
        success: false,
        error: { code: 'NOT_AIRCON', message: 'エアコンではありません' },
      });
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 26 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({ code: 'NOT_AIRCON', message: 'エアコンではありません' });
      }
    });

    it('AirconService レート制限エラー時に RATE_LIMIT を返す', async () => {
      const lightService = createMockLightService();
      const airconService = createMockAirconService();
      vi.mocked(airconService.updateSettings).mockResolvedValue({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Rate limit exceeded',
          cause: { code: 'RATE_LIMIT', message: 'Rate limit exceeded' },
        },
      });
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 26 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMIT');
      }
    });
  });

  // =============================================================================
  // continue_monitoring テスト
  // =============================================================================

  describe('continue_monitoring アクション', () => {
    it('IoT操作を行わず nextInterval=short を返す', async () => {
      const lightService = createMockLightService();
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'continue_monitoring',
        params: {} as Record<string, never>,
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(false);
        expect(result.value.nextInterval).toBe('short');
      }
      expect(lightService.control).not.toHaveBeenCalled();
      expect(airconService.updateSettings).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // do_nothing テスト
  // =============================================================================

  describe('do_nothing アクション', () => {
    it('IoT操作を行わず nextInterval=normal を返す', async () => {
      const lightService = createMockLightService();
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'do_nothing',
        params: {} as Record<string, never>,
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(false);
        expect(result.value.nextInterval).toBe('normal');
      }
      expect(lightService.control).not.toHaveBeenCalled();
      expect(airconService.updateSettings).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // エラーハンドリング テスト
  // =============================================================================

  describe('エラーハンドリング', () => {
    it('IoTエラー時に例外をthrowしない（Resultとして返す）', async () => {
      const lightService = createMockLightService();
      vi.mocked(lightService.control).mockResolvedValue({
        success: false,
        error: { code: 'API_ERROR', message: 'Connection failed' },
      });
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      // Should not throw
      const result = await dispatcher.dispatch(action);
      expect(result.ok).toBe(false);
    });

    it('予期しない例外をキャッチしてUNKNOWNエラーとして返す', async () => {
      const lightService = createMockLightService();
      vi.mocked(lightService.control).mockRejectedValue(new Error('Unexpected error'));
      const airconService = createMockAirconService();
      const dispatcher = createActionDispatcher(testConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      const result = await dispatcher.dispatch(action);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
      }
    });
  });

  // =============================================================================
  // ApplianceConfig注入 テスト
  // =============================================================================

  describe('ApplianceConfig からの appliance_id 注入', () => {
    it('異なるconfigで異なるappliance_idがLightServiceに渡される', async () => {
      const lightService = createMockLightService();
      vi.mocked(lightService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'custom-light', action: 'on', success: true },
      });
      const airconService = createMockAirconService();
      const customConfig: ApplianceConfig = {
        lightApplianceId: 'custom-light',
        airconApplianceId: 'custom-aircon',
      };
      const dispatcher = createActionDispatcher(customConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      await dispatcher.dispatch(action);

      expect(lightService.control).toHaveBeenCalledWith('custom-light', 'on');
    });

    it('異なるconfigで異なるappliance_idがAirconServiceに渡される', async () => {
      const lightService = createMockLightService();
      const airconService = createMockAirconService();
      vi.mocked(airconService.updateSettings).mockResolvedValue({
        success: true,
        data: {
          applianceId: 'custom-aircon',
          temperature: '22',
          mode: 'heat',
          volume: 'auto',
          power: 'on',
        },
      });
      const customConfig: ApplianceConfig = {
        lightApplianceId: 'custom-light',
        airconApplianceId: 'custom-aircon',
      };
      const dispatcher = createActionDispatcher(customConfig, { lightService, airconService });

      const action: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 22, mode: 'heat' },
      };

      await dispatcher.dispatch(action);

      expect(airconService.updateSettings).toHaveBeenCalledWith('custom-aircon', {
        temperature: '22',
        operation_mode: 'heat',
        button: '',
      });
    });
  });
});
