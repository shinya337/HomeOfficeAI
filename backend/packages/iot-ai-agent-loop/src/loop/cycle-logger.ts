/**
 * CycleLogger - サイクルログ出力
 *
 * 各サイクルの分析結果を構造化してコンソールにログ出力する。
 * - タイムスタンプ、選択されたTool名、パラメータ、実行結果をフォーマットする
 * - エラー時のログフォーマットも提供する
 *
 * Requirements: 3.5
 */

import type { AgentAction, ActionResult } from '../types/actions.js';

// =============================================================================
// Types
// =============================================================================

export interface CycleLogEntry {
  readonly cycleNumber: number;
  readonly imageFile: string;
  readonly action: AgentAction;
  readonly result: ActionResult;
  readonly timestamp?: Date;
}

export interface ErrorLogEntry {
  readonly cycleNumber: number;
  readonly imageFile: string;
  readonly phase: string;
  readonly errorMessage: string;
  readonly timestamp?: Date;
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * パラメータオブジェクトを可読文字列に変換する。
 */
function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return '(none)';
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

/**
 * サイクル結果を構造化ログ文字列にフォーマットする。
 */
export function formatCycleLog(entry: CycleLogEntry): string {
  const ts = (entry.timestamp ?? new Date()).toISOString();
  const params = formatParams(entry.action.params as unknown as Record<string, unknown>);
  return `[MonitorLoop] ${ts} | Cycle #${entry.cycleNumber} | image=${entry.imageFile} | tool=${entry.action.tool} | params={${params}} | result=${entry.result.message}`;
}

/**
 * エラーログを構造化ログ文字列にフォーマットする。
 */
export function formatErrorLog(entry: ErrorLogEntry): string {
  const ts = (entry.timestamp ?? new Date()).toISOString();
  return `[MonitorLoop] ${ts} | Cycle #${entry.cycleNumber} | image=${entry.imageFile} | phase=${entry.phase} | error=${entry.errorMessage}`;
}

// =============================================================================
// Skip Log (Req 5.3)
// =============================================================================

export interface SkipLogEntry {
  readonly cycleNumber: number;
  readonly imageFile: string;
  readonly skippedAction: AgentAction;
  readonly reason: string;
  readonly timestamp?: Date;
}

/**
 * アクションスキップログを構造化ログ文字列にフォーマットする。
 */
export function formatSkipLog(entry: SkipLogEntry): string {
  const ts = (entry.timestamp ?? new Date()).toISOString();
  const params = formatParams(entry.skippedAction.params as unknown as Record<string, unknown>);
  return `[MonitorLoop] ${ts} | Cycle #${entry.cycleNumber} | image=${entry.imageFile} | SKIPPED | tool=${entry.skippedAction.tool} | params={${params}} | reason=${entry.reason}`;
}

// =============================================================================
// Console Output
// =============================================================================

/**
 * サイクル結果をコンソールに出力する。
 */
export function logCycleResult(entry: CycleLogEntry): void {
  console.log(formatCycleLog(entry));
}

/**
 * エラーログをコンソールに出力する。
 */
export function logError(entry: ErrorLogEntry): void {
  console.error(formatErrorLog(entry));
}

/**
 * アクションスキップログをコンソールに出力する。
 * スキップ時は通常の次回監視間隔でサイクルを継続する。
 */
export function logActionSkipped(entry: SkipLogEntry): void {
  console.log(formatSkipLog(entry));
}
