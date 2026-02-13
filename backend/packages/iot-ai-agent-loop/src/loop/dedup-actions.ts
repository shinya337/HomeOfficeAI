/**
 * 重複アクション防止ロジック（純粋関数）
 *
 * - isSameAction: ツール名とパラメータ値の完全一致で同一性を判定
 * - isDeviceControlAction: デバイス制御アクション（light_control/aircon_control）判定
 * - updateLastAction: デバイス制御アクション実行時にlastActionを更新
 *
 * Requirements: 5.1, 5.2, 5.5, 5.6, 5.7
 */

import type { AgentAction } from '../types/actions.js';
import type { DeviceState } from '../services/device-state-service.js';

/**
 * 2つのAgentActionが同一かどうかを判定する。
 * ツール名とパラメータ値の完全一致（JSON比較）で同一性を判定する。
 *
 * @param a - 比較対象アクションA
 * @param b - 比較対象アクションB
 * @returns 同一の場合true
 */
export function isSameAction(a: AgentAction, b: AgentAction): boolean {
  if (a.tool !== b.tool) return false;
  return JSON.stringify(a.params) === JSON.stringify(b.params);
}

/**
 * デバイス制御アクション（IoT/Alexa系）かどうかを判定する。
 * do_nothing/continue_monitoringは重複チェックの対象外とするため、
 * この関数でフィルタリングする。
 *
 * Alexa系ツール（alexa_speak, alexa_textcommand, alexa_info等）も
 * デバイス制御アクションとして扱い、重複防止の対象とする。
 *
 * @param action - 判定対象アクション
 * @returns デバイス制御アクションの場合true
 */
export function isDeviceControlAction(action: AgentAction): boolean {
  return action.tool !== 'do_nothing' && action.tool !== 'continue_monitoring';
}

/**
 * デバイス制御アクション実行時にlastActionを更新する。
 * 非デバイス制御アクション（do_nothing/continue_monitoring）の場合は
 * 前回のlastActionをそのまま維持する。
 *
 * @param currentLastAction - 現在のlastAction（undefined可）
 * @param executedAction - 今回実行されたアクション
 * @returns 更新後のlastAction
 */
export function updateLastAction(
  currentLastAction: AgentAction | undefined,
  executedAction: AgentAction
): AgentAction | undefined {
  if (isDeviceControlAction(executedAction)) {
    return executedAction;
  }
  return currentLastAction;
}

/**
 * デバイス制御アクション実行成功後にcachedDeviceStateを論理的に更新する。
 *
 * - light_control: power値を実行パラメータで更新
 * - aircon_control: temperature/mode値を実行パラメータで更新
 * - 非デバイス制御アクション: キャッシュをそのまま返す
 * - cachedがundefined: undefinedを返す
 * - 対象デバイス状態がnull: 更新せずそのまま返す
 *
 * @param cached - 現在のキャッシュ済みデバイス状態
 * @param executedAction - 実行成功したアクション
 * @returns 論理更新後のDeviceState
 */
export function updateCachedDeviceState(
  cached: DeviceState | undefined,
  executedAction: AgentAction
): DeviceState | undefined {
  if (cached === undefined) return undefined;
  if (!isDeviceControlAction(executedAction)) return cached;

  if (executedAction.tool === 'light_control') {
    if (cached.light === null) return cached;
    // 'off' 以外のボタン操作は照明ONとして扱う
    const power = executedAction.params.action === 'off' ? 'off' : 'on';
    return {
      ...cached,
      light: { power },
    };
  }

  if (executedAction.tool === 'aircon_control') {
    if (cached.aircon === null) return cached;
    return {
      ...cached,
      aircon: {
        temperature: String(executedAction.params.temperature),
        mode: executedAction.params.mode ?? cached.aircon.mode,
      },
    };
  }

  return cached;
}
