/**
 * Response Parser テスト - Task 3.2
 *
 * Function Callレスポンスの解析とAgentAction変換を検証する。
 * - FunctionCallPartからAgentAction（discriminated union）への型安全な変換
 * - Function Callを含まないレスポンスのdo_nothingフォールバック
 * - 不正なレスポンスのPARSE_ERRORエラー分類
 *
 * Requirements: 2.3, 2.5
 */

import { describe, it, expect } from 'vitest';
import {
  parseFunctionCallResponse,
  convertToAgentAction,
} from './response-parser.js';
import type { AgentAction } from '../types/actions.js';

// =============================================================================
// Types for test data
// =============================================================================

/**
 * テスト用のGenerateContentレスポンスを生成するヘルパー
 */
function createFunctionCallResponse(name: string, args: Record<string, unknown>) {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              functionCall: { name, args },
            },
          ],
        },
      },
    ],
  };
}

function createTextOnlyResponse(text: string) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
      },
    ],
  };
}

function createEmptyResponse() {
  return { candidates: [] };
}

function createNoCandidatesResponse() {
  return {};
}

// =============================================================================
// parseFunctionCallResponse テスト
// =============================================================================

describe('parseFunctionCallResponse', () => {
  describe('FunctionCallPartの抽出 (Req 2.3)', () => {
    it('レスポンスからFunctionCallを抽出する', () => {
      const response = createFunctionCallResponse('light_control', {
        action: 'on',
      });

      const result = parseFunctionCallResponse(response);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([{
          name: 'light_control',
          args: { action: 'on' },
        }]);
      }
    });

    it('複数partsの中からFunctionCallPartを検索して抽出する', () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'ユーザーは居眠りしています。' },
                {
                  functionCall: {
                    name: 'light_control',
                    args: { action: 'on' },
                  },
                },
              ],
            },
          },
        ],
      };

      const result = parseFunctionCallResponse(response);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].name).toBe('light_control');
      }
    });

    it('複数のFunctionCallを全て収集する（並列Function Calling）', () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'alexa_speak',
                    args: { message: 'ごゆっくりどうぞ' },
                  },
                },
                {
                  functionCall: {
                    name: 'light_control',
                    args: { action: '安らぎ' },
                  },
                },
                {
                  functionCall: {
                    name: 'alexa_textcommand',
                    args: { text: 'リラックスの音楽をかけて' },
                  },
                },
              ],
            },
          },
        ],
      };

      const result = parseFunctionCallResponse(response);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0].name).toBe('alexa_speak');
        expect(result.value[1].name).toBe('light_control');
        expect(result.value[2].name).toBe('alexa_textcommand');
      }
    });
  });

  describe('空配列フォールバック (Req 2.5)', () => {
    it('テキストのみのレスポンスは空配列を返す', () => {
      const response = createTextOnlyResponse('ユーザーは集中して作業中です。');

      const result = parseFunctionCallResponse(response);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('空のcandidatesは空配列を返す', () => {
      const response = createEmptyResponse();

      const result = parseFunctionCallResponse(response);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('candidatesが存在しないレスポンスは空配列を返す', () => {
      const response = createNoCandidatesResponse();

      const result = parseFunctionCallResponse(response);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('空のpartsは空配列を返す', () => {
      const response = {
        candidates: [{ content: { parts: [] } }],
      };

      const result = parseFunctionCallResponse(response);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });
});

// =============================================================================
// convertToAgentAction テスト
// =============================================================================

describe('convertToAgentAction', () => {
  describe('light_control変換', () => {
    it('appliance_idなしのlight_controlをLightControlActionに変換する (Req 3.5)', () => {
      const result = convertToAgentAction('light_control', {
        action: 'on',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action: AgentAction = result.value;
        expect(action.tool).toBe('light_control');
        expect(action.params).toEqual({
          action: 'on',
        });
      }
    });

    it('light_controlでaction: "off"を正しく変換する (appliance_idなし)', () => {
      const result = convertToAgentAction('light_control', {
        action: 'off',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('light_control');
        if (result.value.tool === 'light_control') {
          expect(result.value.params.action).toBe('off');
        }
      }
    });

    it('light_controlでappliance_idが含まれていても無視して正しく変換する', () => {
      const result = convertToAgentAction('light_control', {
        appliance_id: 'light-001',
        action: 'on',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('light_control');
        expect(result.value.params).toEqual({ action: 'on' });
        expect(result.value.params).not.toHaveProperty('appliance_id');
      }
    });

    it('light_controlでプリセットシグナル名も有効な値として受け付ける', () => {
      const result = convertToAgentAction('light_control', {
        action: '安らぎ',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('light_control');
        expect(result.value.params).toEqual({ action: '安らぎ' });
      }
    });

    it('light_controlでactionが空文字の場合はPARSE_ERRORを返す', () => {
      const result = convertToAgentAction('light_control', {
        action: '',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });

    it('light_controlでactionが欠落している場合はPARSE_ERRORを返す', () => {
      const result = convertToAgentAction('light_control', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });
  });

  describe('aircon_control変換', () => {
    it('appliance_idなしのaircon_controlをAirconControlActionに変換する (Req 3.5)', () => {
      const result = convertToAgentAction('aircon_control', {
        temperature: 26,
        mode: 'cool',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action: AgentAction = result.value;
        expect(action.tool).toBe('aircon_control');
        expect(action.params).toEqual({
          temperature: 26,
          mode: 'cool',
        });
      }
    });

    it('aircon_controlでmodeが省略されていても正しく変換する (appliance_idなし)', () => {
      const result = convertToAgentAction('aircon_control', {
        temperature: 24,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('aircon_control');
        if (result.value.tool === 'aircon_control') {
          expect(result.value.params.temperature).toBe(24);
          expect(result.value.params.mode).toBeUndefined();
        }
      }
    });

    it('aircon_controlでappliance_idが含まれていても無視して正しく変換する', () => {
      const result = convertToAgentAction('aircon_control', {
        appliance_id: 'aircon-001',
        temperature: 26,
        mode: 'cool',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('aircon_control');
        expect(result.value.params).toEqual({ temperature: 26, mode: 'cool' });
        expect(result.value.params).not.toHaveProperty('appliance_id');
      }
    });

    it('aircon_controlでtemperatureが欠落している場合はPARSE_ERRORを返す', () => {
      const result = convertToAgentAction('aircon_control', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });

    it('aircon_controlでtemperatureが数値でない場合はPARSE_ERRORを返す', () => {
      const result = convertToAgentAction('aircon_control', {
        temperature: 'hot',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });
  });

  describe('continue_monitoring変換', () => {
    it('continue_monitoringのFunctionCallをContinueMonitoringActionに変換する', () => {
      const result = convertToAgentAction('continue_monitoring', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('continue_monitoring');
        expect(result.value.params).toEqual({});
      }
    });

    it('continue_monitoringでargsがundefinedでも正しく変換する', () => {
      const result = convertToAgentAction('continue_monitoring', undefined as unknown as Record<string, unknown>);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('continue_monitoring');
        expect(result.value.params).toEqual({});
      }
    });
  });

  describe('do_nothing変換', () => {
    it('do_nothingのFunctionCallをDoNothingActionに変換する', () => {
      const result = convertToAgentAction('do_nothing', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('do_nothing');
        expect(result.value.params).toEqual({});
      }
    });
  });

  describe('break_mode変換', () => {
    it('break_modeのFunctionCallをBreakModeActionに変換する', () => {
      const result = convertToAgentAction('break_mode', {
        reason: '食事中を検出',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('break_mode');
        expect(result.value.params).toEqual({ reason: '食事中を検出' });
      }
    });

    it('break_modeでreasonが省略されていても正しく変換する', () => {
      const result = convertToAgentAction('break_mode', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('break_mode');
        expect(result.value.params).toEqual({});
      }
    });
  });

  describe('focus_mode変換', () => {
    it('focus_modeのFunctionCallをFocusModeActionに変換する', () => {
      const result = convertToAgentAction('focus_mode', {
        reason: '作業開始を検出',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('focus_mode');
        expect(result.value.params).toEqual({ reason: '作業開始を検出' });
      }
    });

    it('focus_modeでreasonが省略されていても正しく変換する', () => {
      const result = convertToAgentAction('focus_mode', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('focus_mode');
        expect(result.value.params).toEqual({});
      }
    });
  });

  describe('away_mode変換', () => {
    it('away_modeのFunctionCallをAwayModeActionに変換する', () => {
      const result = convertToAgentAction('away_mode', {
        reason: '離席を検出',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('away_mode');
        expect(result.value.params).toEqual({ reason: '離席を検出' });
      }
    });

    it('away_modeでreasonが省略されていても正しく変換する', () => {
      const result = convertToAgentAction('away_mode', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('away_mode');
        expect(result.value.params).toEqual({});
      }
    });
  });

  describe('wake_mode変換', () => {
    it('wake_modeのFunctionCallをWakeModeActionに変換する', () => {
      const result = convertToAgentAction('wake_mode', {
        reason: '居眠りを3回連続確認',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('wake_mode');
        expect(result.value.params).toEqual({ reason: '居眠りを3回連続確認' });
      }
    });

    it('wake_modeでreasonが省略されていても正しく変換する', () => {
      const result = convertToAgentAction('wake_mode', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('wake_mode');
        expect(result.value.params).toEqual({});
      }
    });
  });

  describe('動的ツールのパススルー', () => {
    it('未知のTool名はパラメータ付きでパススルーされる', () => {
      const result = convertToAgentAction('alexa_speak', { message: 'こんにちは' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('alexa_speak');
        expect(result.value.params).toEqual({ message: 'こんにちは' });
      }
    });

    it('未知のTool名で空パラメータの場合もパススルーされる', () => {
      const result = convertToAgentAction('unknown_tool', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('unknown_tool');
        expect(result.value.params).toEqual({});
      }
    });
  });
});
