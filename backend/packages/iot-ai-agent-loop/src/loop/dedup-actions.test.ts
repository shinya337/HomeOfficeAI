/**
 * 重複アクション防止ロジック テスト
 *
 * - isSameAction: ツール名+パラメータ完全一致で同一判定
 * - isDeviceControlAction: デバイス制御アクション判定
 * - do_nothing/continue_monitoringは重複チェック対象外
 * - デバイス制御アクション実行時にlastActionを更新
 *
 * Requirements: 5.1, 5.2, 5.5, 5.6, 5.7
 */
import { describe, it, expect } from 'vitest';
import { isSameAction, isDeviceControlAction, updateLastAction, updateCachedDeviceState } from './dedup-actions.js';
import type { AgentAction } from '../types/actions.js';
import type { DeviceState } from '../services/device-state-service.js';

// =============================================================================
// isSameAction テスト (Req 5.5)
// =============================================================================

describe('isSameAction', () => {
  it('同一のlight_controlアクション（ツール名+パラメータ完全一致）をtrueと判定する', () => {
    const a: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const b: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    expect(isSameAction(a, b)).toBe(true);
  });

  it('同一のaircon_controlアクション（ツール名+パラメータ完全一致）をtrueと判定する', () => {
    const a: AgentAction = { tool: 'aircon_control', params: { temperature: 26, mode: 'cool' } };
    const b: AgentAction = { tool: 'aircon_control', params: { temperature: 26, mode: 'cool' } };
    expect(isSameAction(a, b)).toBe(true);
  });

  it('異なるパラメータ値のlight_controlをfalseと判定する', () => {
    const a: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const b: AgentAction = { tool: 'light_control', params: { action: 'off' } };
    expect(isSameAction(a, b)).toBe(false);
  });

  it('異なるパラメータ値のaircon_controlをfalseと判定する', () => {
    const a: AgentAction = { tool: 'aircon_control', params: { temperature: 26, mode: 'cool' } };
    const b: AgentAction = { tool: 'aircon_control', params: { temperature: 28, mode: 'cool' } };
    expect(isSameAction(a, b)).toBe(false);
  });

  it('異なるツール名をfalseと判定する', () => {
    const a: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const b: AgentAction = { tool: 'aircon_control', params: { temperature: 26 } };
    expect(isSameAction(a, b)).toBe(false);
  });

  it('aircon_controlでmodeの有無が異なる場合はfalseと判定する', () => {
    const a: AgentAction = { tool: 'aircon_control', params: { temperature: 26, mode: 'cool' } };
    const b: AgentAction = { tool: 'aircon_control', params: { temperature: 26 } };
    expect(isSameAction(a, b)).toBe(false);
  });

  it('do_nothing同士をtrueと判定する', () => {
    const a: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    const b: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    expect(isSameAction(a, b)).toBe(true);
  });

  it('continue_monitoring同士をtrueと判定する', () => {
    const a: AgentAction = { tool: 'continue_monitoring', params: {} as Record<string, never> };
    const b: AgentAction = { tool: 'continue_monitoring', params: {} as Record<string, never> };
    expect(isSameAction(a, b)).toBe(true);
  });
});

// =============================================================================
// isDeviceControlAction テスト (Req 5.6)
// =============================================================================

describe('isDeviceControlAction', () => {
  it('light_controlをデバイス制御アクションと判定する', () => {
    const action: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    expect(isDeviceControlAction(action)).toBe(true);
  });

  it('aircon_controlをデバイス制御アクションと判定する', () => {
    const action: AgentAction = { tool: 'aircon_control', params: { temperature: 26 } };
    expect(isDeviceControlAction(action)).toBe(true);
  });

  it('do_nothingをデバイス制御アクションでないと判定する', () => {
    const action: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    expect(isDeviceControlAction(action)).toBe(false);
  });

  it('continue_monitoringをデバイス制御アクションでないと判定する', () => {
    const action: AgentAction = { tool: 'continue_monitoring', params: {} as Record<string, never> };
    expect(isDeviceControlAction(action)).toBe(false);
  });
});

// =============================================================================
// updateLastAction テスト (Req 5.7)
// =============================================================================

describe('updateLastAction', () => {
  it('デバイス制御アクション実行時にlastActionを更新する', () => {
    const action: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const result = updateLastAction(undefined, action);
    expect(result).toEqual(action);
  });

  it('aircon_control実行時にlastActionを更新する', () => {
    const prev: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const action: AgentAction = { tool: 'aircon_control', params: { temperature: 26, mode: 'cool' } };
    const result = updateLastAction(prev, action);
    expect(result).toEqual(action);
  });

  it('do_nothing実行時はlastActionを更新しない（前回の値を維持）', () => {
    const prev: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const action: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    const result = updateLastAction(prev, action);
    expect(result).toEqual(prev);
  });

  it('continue_monitoring実行時はlastActionを更新しない（前回の値を維持）', () => {
    const prev: AgentAction = { tool: 'aircon_control', params: { temperature: 26 } };
    const action: AgentAction = { tool: 'continue_monitoring', params: {} as Record<string, never> };
    const result = updateLastAction(prev, action);
    expect(result).toEqual(prev);
  });

  it('lastActionがundefinedでdo_nothing実行時はundefinedのまま', () => {
    const action: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    const result = updateLastAction(undefined, action);
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// updateCachedDeviceState テスト (Task 6.2)
// =============================================================================

describe('updateCachedDeviceState', () => {
  const baseCachedState: DeviceState = {
    light: { power: 'off' },
    aircon: { temperature: '26', mode: 'cool' },
  };

  it('light_control(on)実行成功後にcachedDeviceState.light.powerをonに論理更新する', () => {
    const action: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const result = updateCachedDeviceState(baseCachedState, action);
    expect(result).toEqual({
      light: { power: 'on' },
      aircon: { temperature: '26', mode: 'cool' },
    });
  });

  it('light_control(off)実行成功後にcachedDeviceState.light.powerをoffに論理更新する', () => {
    const cached: DeviceState = { light: { power: 'on' }, aircon: null };
    const action: AgentAction = { tool: 'light_control', params: { action: 'off' } };
    const result = updateCachedDeviceState(cached, action);
    expect(result).toEqual({
      light: { power: 'off' },
      aircon: null,
    });
  });

  it('aircon_control実行成功後にcachedDeviceState.airconのtemperatureとmodeを論理更新する', () => {
    const action: AgentAction = { tool: 'aircon_control', params: { temperature: 28, mode: 'warm' } };
    const result = updateCachedDeviceState(baseCachedState, action);
    expect(result).toEqual({
      light: { power: 'off' },
      aircon: { temperature: '28', mode: 'warm' },
    });
  });

  it('aircon_controlでmodeが未指定の場合は既存modeを維持する', () => {
    const action: AgentAction = { tool: 'aircon_control', params: { temperature: 22 } };
    const result = updateCachedDeviceState(baseCachedState, action);
    expect(result).toEqual({
      light: { power: 'off' },
      aircon: { temperature: '22', mode: 'cool' },
    });
  });

  it('cachedDeviceStateがundefinedの場合はundefinedを返す', () => {
    const action: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const result = updateCachedDeviceState(undefined, action);
    expect(result).toBeUndefined();
  });

  it('非デバイス制御アクション（do_nothing）の場合はキャッシュをそのまま返す', () => {
    const action: AgentAction = { tool: 'do_nothing', params: {} as Record<string, never> };
    const result = updateCachedDeviceState(baseCachedState, action);
    expect(result).toEqual(baseCachedState);
  });

  it('light_controlでlight状態がnullの場合はnullのまま返す', () => {
    const cached: DeviceState = { light: null, aircon: { temperature: '26', mode: 'cool' } };
    const action: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    const result = updateCachedDeviceState(cached, action);
    expect(result).toEqual(cached);
  });

  it('aircon_controlでaircon状態がnullの場合はnullのまま返す', () => {
    const cached: DeviceState = { light: { power: 'on' }, aircon: null };
    const action: AgentAction = { tool: 'aircon_control', params: { temperature: 28 } };
    const result = updateCachedDeviceState(cached, action);
    expect(result).toEqual(cached);
  });
});
