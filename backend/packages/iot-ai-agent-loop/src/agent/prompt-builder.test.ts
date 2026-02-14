/**
 * PromptBuilder テスト
 *
 * デバイス状態を含む動的システムプロンプト構築の純粋関数テスト。
 * 状態あり / なし(undefined) / null 各パターンをカバーする。
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
import { describe, it, expect } from 'vitest';
import { buildPrompt, BASE_PROMPT } from './prompt-builder.js';
import type { DeviceState } from '../services/device-state-service.js';

describe('buildPrompt', () => {
  // ==========================================================================
  // Req 2.4: デバイス状態がundefinedの場合は基本プロンプトのみ
  // ==========================================================================
  describe('deviceState が undefined の場合', () => {
    it('基本プロンプトのみを返す', () => {
      const result = buildPrompt(undefined);
      expect(result).toBe(BASE_PROMPT);
    });

    it('引数なしで呼び出した場合も基本プロンプトのみを返す', () => {
      const result = buildPrompt();
      expect(result).toBe(BASE_PROMPT);
    });
  });

  // ==========================================================================
  // Req 2.1, 2.2, 2.3: デバイス状態ありの場合
  // ==========================================================================
  describe('deviceState が提供された場合', () => {
    it('基本プロンプトにデバイス状態セクションが追加される (Req 2.1)', () => {
      const state: DeviceState = {
        light: { power: 'on' },
        aircon: { temperature: '26', mode: 'cool' },
      };
      const result = buildPrompt(state);
      expect(result).toContain(BASE_PROMPT);
      expect(result).toContain('現在のデバイス状態');
    });

    it('照明の電源状態（ON）がプロンプトに含まれる (Req 2.2)', () => {
      const state: DeviceState = {
        light: { power: 'on' },
        aircon: null,
      };
      const result = buildPrompt(state);
      expect(result).toContain('照明');
      expect(result).toMatch(/ON/i);
    });

    it('照明の電源状態（OFF）がプロンプトに含まれる (Req 2.2)', () => {
      const state: DeviceState = {
        light: { power: 'off' },
        aircon: null,
      };
      const result = buildPrompt(state);
      expect(result).toContain('照明');
      expect(result).toMatch(/OFF/i);
    });

    it('エアコンの設定温度と運転モードがプロンプトに含まれる (Req 2.3)', () => {
      const state: DeviceState = {
        light: null,
        aircon: { temperature: '26', mode: 'cool' },
      };
      const result = buildPrompt(state);
      expect(result).toContain('エアコン');
      expect(result).toContain('26');
      expect(result).toContain('cool');
    });

    it('照明・エアコン両方の状態が含まれる', () => {
      const state: DeviceState = {
        light: { power: 'on' },
        aircon: { temperature: '22', mode: 'warm' },
      };
      const result = buildPrompt(state);
      expect(result).toContain('照明');
      expect(result).toContain('ON');
      expect(result).toContain('エアコン');
      expect(result).toContain('22');
      expect(result).toContain('warm');
    });
  });

  // ==========================================================================
  // デバイスの状態が null の場合は「不明」として表記
  // ==========================================================================
  describe('デバイスの状態が null の場合', () => {
    it('照明が null の場合「不明」と表記される', () => {
      const state: DeviceState = {
        light: null,
        aircon: { temperature: '26', mode: 'cool' },
      };
      const result = buildPrompt(state);
      expect(result).toContain('照明');
      expect(result).toContain('不明');
    });

    it('エアコンが null の場合「不明」と表記される', () => {
      const state: DeviceState = {
        light: { power: 'on' },
        aircon: null,
      };
      const result = buildPrompt(state);
      expect(result).toContain('エアコン');
      expect(result).toContain('不明');
    });

    it('照明・エアコン両方 null の場合、両方「不明」と表記される', () => {
      const state: DeviceState = {
        light: null,
        aircon: null,
      };
      const result = buildPrompt(state);
      // デバイス状態セクション自体は含まれる
      expect(result).toContain('現在のデバイス状態');
      // 両方「不明」が含まれる（照明とエアコンの2箇所）
      const matches = result.match(/不明/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Alexa状態のフォーマット
  // ==========================================================================
  describe('Alexa状態のフォーマット', () => {
    it('接続中・再生中の場合「接続中 / 再生中」と表記される', () => {
      const state: DeviceState = {
        light: null,
        aircon: null,
        alexa: { connected: true, playerState: 'PLAYING' },
      };
      const result = buildPrompt(state);
      expect(result).toContain('Alexa: 接続中 / 再生中');
    });

    it('接続中・一時停止の場合「接続中 / 一時停止」と表記される', () => {
      const state: DeviceState = {
        light: null,
        aircon: null,
        alexa: { connected: true, playerState: 'PAUSED' },
      };
      const result = buildPrompt(state);
      expect(result).toContain('Alexa: 接続中 / 一時停止');
    });

    it('接続中・アイドルの場合「接続中 / アイドル」と表記される', () => {
      const state: DeviceState = {
        light: null,
        aircon: null,
        alexa: { connected: true, playerState: 'IDLE' },
      };
      const result = buildPrompt(state);
      expect(result).toContain('Alexa: 接続中 / アイドル');
    });

    it('未接続の場合「未接続」と表記される', () => {
      const state: DeviceState = {
        light: null,
        aircon: null,
        alexa: { connected: false },
      };
      const result = buildPrompt(state);
      expect(result).toContain('Alexa: 未接続');
    });

    it('alexaがnullの場合はAlexa状態行が表示されない', () => {
      const state: DeviceState = {
        light: null,
        aircon: null,
        alexa: null,
      };
      const result = buildPrompt(state);
      expect(result).not.toContain('- Alexa:');
    });

    it('alexaがundefinedの場合はAlexa状態行が表示されない', () => {
      const state: DeviceState = {
        light: null,
        aircon: null,
      };
      const result = buildPrompt(state);
      expect(result).not.toContain('- Alexa:');
    });

    it('全デバイスの状態が正しく出力される', () => {
      const state: DeviceState = {
        light: { power: 'on' },
        aircon: { temperature: '24', mode: 'cool' },
        alexa: { connected: true, playerState: 'IDLE' },
      };
      const result = buildPrompt(state);
      expect(result).toContain('照明: ON');
      expect(result).toContain('エアコン: 設定温度 24℃ / モード cool');
      expect(result).toContain('Alexa: 接続中 / アイドル');
    });
  });

  // ==========================================================================
  // break_mode ツール記載確認
  // ==========================================================================
  describe('4モード記載確認', () => {
    it('break_modeの記載がプロンプトに含まれる', () => {
      const result = buildPrompt();
      expect(result).toContain('break_mode');
    });

    it('focus_modeの記載がプロンプトに含まれる', () => {
      const result = buildPrompt();
      expect(result).toContain('focus_mode');
    });

    it('away_modeの記載がプロンプトに含まれる', () => {
      const result = buildPrompt();
      expect(result).toContain('away_mode');
    });

    it('wake_modeの記載がプロンプトに含まれる', () => {
      const result = buildPrompt();
      expect(result).toContain('wake_mode');
    });

    it('離席検出時のアクションセクションが含まれる', () => {
      const result = buildPrompt();
      expect(result).toContain('離席検出時のアクション');
    });

    it('居眠り検出時のアクションセクションが含まれる', () => {
      const result = buildPrompt();
      expect(result).toContain('居眠り検出時のアクション');
      expect(result).toContain('仮眠フェーズ');
      expect(result).toContain('覚醒フェーズ');
    });

    it('away_mode実行後の復帰ルールが履歴セクションに含まれる', () => {
      const actions = [{ tool: 'away_mode' as const, params: { reason: '離席を検出' } }];
      const result = buildPrompt(undefined, actions);
      expect(result).toContain('away_mode実行後にユーザーが戻った場合');
      expect(result).toContain('focus_mode');
    });

    it('wake_mode実行後の復帰ルールが履歴セクションに含まれる', () => {
      const actions = [{ tool: 'wake_mode' as const, params: { reason: '居眠り検出' } }];
      const result = buildPrompt(undefined, actions);
      expect(result).toContain('wake_mode実行後にユーザーが起きて作業を始めた場合');
      expect(result).toContain('focus_mode');
    });
  });

  // ==========================================================================
  // 確認監視（continue_monitoring）必須化ルール
  // ==========================================================================
  describe('モード切り替え確認監視ルール', () => {
    it('共通ルールセクション「モード切り替えの共通ルール」が含まれる', () => {
      const result = buildPrompt();
      expect(result).toContain('モード切り替えの共通ルール');
    });

    it('break_modeにcontinue_monitoringで2回以上確認のルールが含まれる', () => {
      const result = buildPrompt();
      expect(result).toMatch(/break_mode.*continue_monitoring.*2回以上/s);
    });

    it('focus_mode復帰時にcontinue_monitoringで2回以上確認のルールが含まれる', () => {
      const result = buildPrompt();
      expect(result).toMatch(/focus_mode（復帰時）.*continue_monitoring.*2回以上/s);
    });

    it('セッション開始時のfocus_modeは例外として即時可能と記載されている', () => {
      const result = buildPrompt();
      expect(result).toContain('セッション開始時は即時');
    });

    it('履歴にbreak_mode確認ルールが含まれる', () => {
      const actions = [{ tool: 'continue_monitoring' as const, params: { reason: '休憩の兆候' } }];
      const result = buildPrompt(undefined, actions);
      expect(result).toContain('continue_monitoringが2回以上連続 かつ 毎回食事・休憩の兆候が確認できる');
    });

    it('履歴の復帰ルールにcontinue_monitoringでの確認が記載されている', () => {
      const actions = [{ tool: 'break_mode' as const, params: { reason: '休憩検出' } }];
      const result = buildPrompt(undefined, actions);
      expect(result).toContain('break_modeの後、休憩から復帰した場合: continue_monitoringで2回以上確認後');
    });
  });
});
