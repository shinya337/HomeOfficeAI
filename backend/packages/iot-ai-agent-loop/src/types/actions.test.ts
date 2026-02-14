/**
 * AgentAction, ActionResult, エラー型の型定義テスト
 *
 * Requirements: 6.2, 6.3
 */
import { describe, it, expect } from 'vitest';
import type {
  AgentAction,
  LightControlAction,
  AirconControlAction,
  ContinueMonitoringAction,
  DoNothingAction,
  LightControlParams,
  AirconControlParams,
  ActionResult,
  NextInterval,
  AgentError,
  ActionDispatchError,
  ApplianceConfig,
} from './actions.js';
import type { AgentConfigError } from '../config/config-loader.js';

describe('ApplianceConfig 共通型定義', () => {
  it('lightApplianceId と airconApplianceId を持つこと', () => {
    const config: ApplianceConfig = {
      lightApplianceId: 'light-001',
      airconApplianceId: 'aircon-001',
    };
    expect(config.lightApplianceId).toBe('light-001');
    expect(config.airconApplianceId).toBe('aircon-001');
  });

  it('readonly プロパティであること', () => {
    const config: ApplianceConfig = {
      lightApplianceId: 'light-001',
      airconApplianceId: 'aircon-001',
    };
    // readonly であることはコンパイル時に保証される
    // ランタイムでは値が正しく保持されていることを確認
    expect(config).toEqual({
      lightApplianceId: 'light-001',
      airconApplianceId: 'aircon-001',
    });
  });
});

describe('AgentAction 型定義', () => {
  describe('LightControlAction', () => {
    it('tool=light_control とパラメータを持つこと（appliance_idなし）', () => {
      const action: LightControlAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };
      expect(action.tool).toBe('light_control');
      expect(action.params.action).toBe('on');
      // appliance_id がパラメータに含まれないことを確認
      expect(Object.keys(action.params)).toEqual(['action']);
    });

    it('action が "off" を取れること', () => {
      const action: LightControlAction = {
        tool: 'light_control',
        params: { action: 'off' },
      };
      expect(action.params.action).toBe('off');
    });
  });

  describe('AirconControlAction', () => {
    it('tool=aircon_control と必須パラメータを持つこと（appliance_idなし）', () => {
      const action: AirconControlAction = {
        tool: 'aircon_control',
        params: { temperature: 26 },
      };
      expect(action.tool).toBe('aircon_control');
      expect(action.params.temperature).toBe(26);
      // appliance_id がパラメータに含まれないことを確認
      expect('appliance_id' in action.params).toBe(false);
    });

    it('オプションの mode を持てること', () => {
      const action: AirconControlAction = {
        tool: 'aircon_control',
        params: { temperature: 24, mode: 'cool' },
      };
      expect(action.params.mode).toBe('cool');
    });
  });

  describe('ContinueMonitoringAction', () => {
    it('tool=continue_monitoring で空パラメータを持つこと', () => {
      const action: ContinueMonitoringAction = {
        tool: 'continue_monitoring',
        params: {},
      };
      expect(action.tool).toBe('continue_monitoring');
      expect(action.params).toEqual({});
    });
  });

  describe('DoNothingAction', () => {
    it('tool=do_nothing で空パラメータを持つこと', () => {
      const action: DoNothingAction = {
        tool: 'do_nothing',
        params: {},
      };
      expect(action.tool).toBe('do_nothing');
      expect(action.params).toEqual({});
    });
  });

  describe('AgentAction discriminated union', () => {
    it('tool フィールドで判別できること', () => {
      const actions: AgentAction[] = [
        { tool: 'light_control', params: { action: 'on' } },
        { tool: 'aircon_control', params: { temperature: 25 } },
        { tool: 'continue_monitoring', params: {} },
        { tool: 'do_nothing', params: {} },
      ];

      const toolNames = actions.map((a) => a.tool);
      expect(toolNames).toEqual([
        'light_control',
        'aircon_control',
        'continue_monitoring',
        'do_nothing',
      ]);
    });

    it('switch文で網羅的に判別できること', () => {
      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      let result = '';
      switch (action.tool) {
        case 'light_control':
          result = 'light';
          break;
        case 'aircon_control':
          result = 'aircon';
          break;
        case 'continue_monitoring':
          result = 'continue';
          break;
        case 'do_nothing':
          result = 'nothing';
          break;
      }
      expect(result).toBe('light');
    });
  });
});

describe('ActionResult 型定義', () => {
  it('executed=true の ActionResult を作成できること', () => {
    const result: ActionResult = {
      executed: true,
      nextInterval: 'normal',
      message: '照明をONにしました',
    };
    expect(result.executed).toBe(true);
    expect(result.nextInterval).toBe('normal');
    expect(result.message).toBe('照明をONにしました');
  });

  it('executed=false の ActionResult を作成できること', () => {
    const result: ActionResult = {
      executed: false,
      nextInterval: 'short',
      message: '継続監視モードに移行',
    };
    expect(result.executed).toBe(false);
    expect(result.nextInterval).toBe('short');
  });

  it('NextInterval が "normal" と "short" を取れること', () => {
    const intervals: NextInterval[] = ['normal', 'short'];
    expect(intervals).toHaveLength(2);
  });
});

describe('AgentError 型定義', () => {
  it('全エラーコードを持てること', () => {
    const codes: AgentError['code'][] = [
      'AUTH_ERROR',
      'API_ERROR',
      'PARSE_ERROR',
      'TIMEOUT',
      'UNKNOWN',
    ];
    expect(codes).toHaveLength(5);
  });

  it('retryable プロパティを持つこと', () => {
    const error: AgentError = {
      code: 'TIMEOUT',
      message: 'リクエストがタイムアウトしました',
      retryable: true,
    };
    expect(error.retryable).toBe(true);
  });

  it('retryable=false のエラーを作成できること', () => {
    const error: AgentError = {
      code: 'AUTH_ERROR',
      message: '認証エラー',
      retryable: false,
    };
    expect(error.retryable).toBe(false);
  });
});

describe('ActionDispatchError 型定義', () => {
  it('IOT_ERROR コードを持てること', () => {
    const error: ActionDispatchError = {
      code: 'IOT_ERROR',
      message: 'IoT操作に失敗しました',
    };
    expect(error.code).toBe('IOT_ERROR');
  });

  it('RATE_LIMIT コードを持てること', () => {
    const error: ActionDispatchError = {
      code: 'RATE_LIMIT',
      message: 'レート制限に達しました',
    };
    expect(error.code).toBe('RATE_LIMIT');
  });

  it('UNKNOWN コードを持てること', () => {
    const error: ActionDispatchError = {
      code: 'UNKNOWN',
      message: '不明なエラー',
    };
    expect(error.code).toBe('UNKNOWN');
  });

  it('originalError を保持できること', () => {
    const originalError = { code: 'API_ERROR', message: 'API error' };
    const error: ActionDispatchError = {
      code: 'IOT_ERROR',
      message: 'IoT操作に失敗しました',
      originalError,
    };
    expect(error.originalError).toEqual(originalError);
  });
});

describe('AgentConfigError 型定義', () => {
  it('MISSING_PROJECT_ID コードを持てること', () => {
    const error: AgentConfigError = {
      code: 'MISSING_PROJECT_ID',
      message: 'GOOGLE_CLOUD_PROJECT が未設定です',
      suggestion: '.env ファイルに GOOGLE_CLOUD_PROJECT を設定してください',
    };
    expect(error.code).toBe('MISSING_PROJECT_ID');
    expect(error.suggestion).toContain('.env');
  });

  it('MISSING_TOKEN コードを持てること', () => {
    const error: AgentConfigError = {
      code: 'MISSING_TOKEN',
      message: 'NATURE_REMO_TOKEN が未設定です',
      suggestion: '.env ファイルに NATURE_REMO_TOKEN を設定してください',
    };
    expect(error.code).toBe('MISSING_TOKEN');
  });
});
