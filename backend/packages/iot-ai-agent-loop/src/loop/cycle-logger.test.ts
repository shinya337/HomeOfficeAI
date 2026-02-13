/**
 * CycleLogger テスト
 *
 * 各サイクルの分析結果を構造化してコンソールにログ出力する。
 * - タイムスタンプ、選択されたTool名、パラメータ、実行結果をフォーマットする
 * - エラー時のログフォーマットも提供する
 *
 * Requirements: 3.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatCycleLog, formatErrorLog, logCycleResult, logError, formatSkipLog, logActionSkipped } from './cycle-logger.js';
import type { AgentAction } from '../types/actions.js';
import type { ActionResult } from '../types/actions.js';

// =============================================================================
// formatCycleLog テスト
// =============================================================================

describe('formatCycleLog', () => {
  it('do_nothing アクションのログを正しくフォーマットする', () => {
    const action: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    const result: ActionResult = { executed: false, nextInterval: 'normal', message: '異常なし' };

    const log = formatCycleLog({
      cycleNumber: 1,
      imageFile: 'test.jpg',
      action,
      result,
      timestamp: new Date('2026-01-29T10:00:00Z'),
    });

    expect(log).toContain('2026-01-29T10:00:00');
    expect(log).toContain('Cycle #1');
    expect(log).toContain('test.jpg');
    expect(log).toContain('do_nothing');
    expect(log).toContain('異常なし');
  });

  it('light_control アクションのログにパラメータが含まれる', () => {
    const action: AgentAction = {
      tool: 'light_control',
      params: { appliance_id: 'light-1', action: 'on' },
    };
    const result: ActionResult = { executed: true, nextInterval: 'normal', message: '照明ON' };

    const log = formatCycleLog({
      cycleNumber: 5,
      imageFile: 'room.png',
      action,
      result,
      timestamp: new Date('2026-01-29T10:05:00Z'),
    });

    expect(log).toContain('light_control');
    expect(log).toContain('appliance_id');
    expect(log).toContain('light-1');
    expect(log).toContain('on');
    expect(log).toContain('照明ON');
  });

  it('aircon_control アクションのログにパラメータが含まれる', () => {
    const action: AgentAction = {
      tool: 'aircon_control',
      params: { appliance_id: 'aircon-1', temperature: 26, mode: 'cool' },
    };
    const result: ActionResult = { executed: true, nextInterval: 'normal', message: 'エアコン設定' };

    const log = formatCycleLog({
      cycleNumber: 3,
      imageFile: 'desk.jpg',
      action,
      result,
      timestamp: new Date('2026-01-29T10:15:00Z'),
    });

    expect(log).toContain('aircon_control');
    expect(log).toContain('26');
    expect(log).toContain('cool');
  });

  it('continue_monitoring アクションのログをフォーマットする', () => {
    const action: AgentAction = { tool: 'continue_monitoring', params: {} as Record<string, never> };
    const result: ActionResult = { executed: false, nextInterval: 'short', message: '継続監視' };

    const log = formatCycleLog({
      cycleNumber: 2,
      imageFile: 'snap.jpg',
      action,
      result,
      timestamp: new Date('2026-01-29T10:10:00Z'),
    });

    expect(log).toContain('continue_monitoring');
    expect(log).toContain('継続監視');
  });

  it('timestamp が未指定の場合、現在時刻を使用する', () => {
    const action: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    const result: ActionResult = { executed: false, nextInterval: 'normal', message: '異常なし' };

    const log = formatCycleLog({
      cycleNumber: 1,
      imageFile: 'test.jpg',
      action,
      result,
    });

    // ISO 文字列が含まれることだけ確認
    expect(log).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

// =============================================================================
// formatErrorLog テスト
// =============================================================================

describe('formatErrorLog', () => {
  it('エラーログをフォーマットする', () => {
    const log = formatErrorLog({
      cycleNumber: 3,
      imageFile: 'test.jpg',
      phase: '画像読み込み',
      errorMessage: 'ファイルが見つかりません',
      timestamp: new Date('2026-01-29T10:00:00Z'),
    });

    expect(log).toContain('2026-01-29T10:00:00');
    expect(log).toContain('Cycle #3');
    expect(log).toContain('画像読み込み');
    expect(log).toContain('ファイルが見つかりません');
  });
});

// =============================================================================
// logCycleResult / logError テスト（console出力）
// =============================================================================

describe('logCycleResult', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('console.log にフォーマット済みログを出力する', () => {
    const action: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    const result: ActionResult = { executed: false, nextInterval: 'normal', message: '異常なし' };

    logCycleResult({
      cycleNumber: 1,
      imageFile: 'test.jpg',
      action,
      result,
      timestamp: new Date('2026-01-29T10:00:00Z'),
    });

    expect(console.log).toHaveBeenCalledTimes(1);
    const output = vi.mocked(console.log).mock.calls[0][0];
    expect(output).toContain('[MonitorLoop]');
    expect(output).toContain('do_nothing');
  });
});

describe('logError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('console.error にエラーログを出力する', () => {
    logError({
      cycleNumber: 2,
      imageFile: 'broken.jpg',
      phase: 'AI分析',
      errorMessage: 'タイムアウト',
      timestamp: new Date('2026-01-29T10:00:00Z'),
    });

    expect(console.error).toHaveBeenCalledTimes(1);
    const output = vi.mocked(console.error).mock.calls[0][0];
    expect(output).toContain('[MonitorLoop]');
    expect(output).toContain('AI分析');
  });
});

// =============================================================================
// formatSkipLog テスト (Req 5.3)
// =============================================================================

describe('formatSkipLog', () => {
  it('スキップされたlight_controlアクションのログをフォーマットする', () => {
    const skippedAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };

    const log = formatSkipLog({
      cycleNumber: 5,
      imageFile: 'room.jpg',
      skippedAction,
      reason: '直前アクションと同一',
      timestamp: new Date('2026-01-29T12:00:00Z'),
    });

    expect(log).toContain('[MonitorLoop]');
    expect(log).toContain('2026-01-29T12:00:00');
    expect(log).toContain('Cycle #5');
    expect(log).toContain('room.jpg');
    expect(log).toContain('SKIPPED');
    expect(log).toContain('light_control');
    expect(log).toContain('action=on');
    expect(log).toContain('直前アクションと同一');
  });

  it('スキップされたaircon_controlアクションのログにパラメータが含まれる', () => {
    const skippedAction: AgentAction = { tool: 'aircon_control', params: { temperature: 26, mode: 'cool' } };

    const log = formatSkipLog({
      cycleNumber: 10,
      imageFile: 'desk.png',
      skippedAction,
      reason: '直前アクションと同一',
      timestamp: new Date('2026-01-29T12:30:00Z'),
    });

    expect(log).toContain('aircon_control');
    expect(log).toContain('temperature=26');
    expect(log).toContain('cool');
    expect(log).toContain('SKIPPED');
  });

  it('timestampが未指定の場合、現在時刻を使用する', () => {
    const skippedAction: AgentAction = { tool: 'light_control', params: { action: 'off' } };

    const log = formatSkipLog({
      cycleNumber: 1,
      imageFile: 'test.jpg',
      skippedAction,
      reason: '重複',
    });

    expect(log).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(log).toContain('SKIPPED');
  });
});

// =============================================================================
// logActionSkipped テスト (Req 5.3, 5.4)
// =============================================================================

describe('logActionSkipped', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('console.log にスキップログを出力する', () => {
    const skippedAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };

    logActionSkipped({
      cycleNumber: 3,
      imageFile: 'snap.jpg',
      skippedAction,
      reason: '直前アクションと同一',
      timestamp: new Date('2026-01-29T13:00:00Z'),
    });

    expect(console.log).toHaveBeenCalledTimes(1);
    const output = vi.mocked(console.log).mock.calls[0][0];
    expect(output).toContain('[MonitorLoop]');
    expect(output).toContain('SKIPPED');
    expect(output).toContain('light_control');
  });
});
