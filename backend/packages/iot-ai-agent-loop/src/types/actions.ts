/**
 * AgentAction, ActionResult, エラー型定義
 *
 * AIエージェントが選択するアクション（discriminated union）と
 * アクション実行結果、各種エラー型を定義する。
 *
 * Requirements: 4.3, 6.2, 6.3
 */

// =============================================================================
// 共通設定型
// =============================================================================

/**
 * アプライアンスID共通設定
 *
 * 照明・エアコンのappliance_idを一元管理する。
 * DeviceStateService、ActionDispatcher、MonitorLoopに注入される。
 */
export interface ApplianceConfig {
  readonly lightApplianceId: string;
  readonly airconApplianceId: string;
}

// =============================================================================
// AgentAction 型（Discriminated Union）
// =============================================================================

/**
 * Nature Remo Light API で使用可能なボタン値
 */
export type LightButton =
  | 'on'
  | 'off'
  | 'on-100'
  | 'on-favorite'
  | 'night'
  | 'bright-up'
  | 'bright-down'
  | 'colortemp-up'
  | 'colortemp-down';

/**
 * 照明制御パラメータ
 *
 * action は標準ボタン (LightButton) またはプリセットシグナル名 (e.g., "安らぎ", "読書", "家事")
 * appliance_idはApplianceConfigで管理するため、操作のみを保持する。
 */
export interface LightControlParams {
  readonly action: string;
  readonly reason?: string;
}

/**
 * エアコン制御パラメータ
 *
 * appliance_idはApplianceConfigで管理するため、温度・モードのみを保持する。
 */
export interface AirconControlParams {
  readonly temperature: number;
  readonly mode?: string;
  readonly reason?: string;
}

/**
 * 照明制御アクション
 */
export interface LightControlAction {
  readonly tool: 'light_control';
  readonly params: LightControlParams;
}

/**
 * エアコン制御アクション
 */
export interface AirconControlAction {
  readonly tool: 'aircon_control';
  readonly params: AirconControlParams;
}

/**
 * 継続監視アクション（5秒後に再分析）
 */
export interface ContinueMonitoringAction {
  readonly tool: 'continue_monitoring';
  readonly params: { readonly reason?: string };
}

/**
 * 何もしないアクション（通常監視継続）
 */
export interface DoNothingAction {
  readonly tool: 'do_nothing';
  readonly params: { readonly reason?: string };
}

/**
 * 休憩モードアクション（照明+音声+BGMを一括実行）
 */
export interface BreakModeAction {
  readonly tool: 'break_mode';
  readonly params: { readonly reason?: string };
}

/**
 * 集中モードアクション（照明全灯+音声+ジャズBGMを一括実行）
 */
export interface FocusModeAction {
  readonly tool: 'focus_mode';
  readonly params: { readonly reason?: string };
}

/**
 * 離席モードアクション（照明OFF+アナウンス+BGM停止+エアコンOFFを一括実行）
 */
export interface AwayModeAction {
  readonly tool: 'away_mode';
  readonly params: { readonly reason?: string };
}

/**
 * 覚醒モードアクション（仮眠フェーズ→2分後→覚醒フェーズを一括実行）
 */
export interface WakeModeAction {
  readonly tool: 'wake_mode';
  readonly params: { readonly reason?: string };
}

/**
 * AIが選択するアクション（discriminated union by tool field）
 */
export type AgentAction =
  | LightControlAction
  | AirconControlAction
  | BreakModeAction
  | FocusModeAction
  | AwayModeAction
  | WakeModeAction
  | ContinueMonitoringAction
  | DoNothingAction;

// =============================================================================
// ActionResult 型
// =============================================================================

/**
 * 次の監視間隔
 */
export type NextInterval = 'normal' | 'short';

/**
 * アクション実行結果
 */
export interface ActionResult {
  readonly executed: boolean;
  readonly nextInterval: NextInterval;
  readonly message: string;
}

// =============================================================================
// エラー型
// =============================================================================

/**
 * AIエージェントエラー
 *
 * - AUTH_ERROR: Gemini API 認証エラー
 * - API_ERROR: Gemini API 呼び出しエラー
 * - PARSE_ERROR: Function Call レスポンス解析エラー
 * - TIMEOUT: リクエストタイムアウト
 * - UNKNOWN: 予期しないエラー
 */
export interface AgentError {
  readonly code: 'AUTH_ERROR' | 'API_ERROR' | 'PARSE_ERROR' | 'TIMEOUT' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * アクションディスパッチエラー
 *
 * - IOT_ERROR: IoTデバイス操作エラー
 * - RATE_LIMIT: Nature Remo APIレート制限
 * - UNKNOWN: 予期しないエラー
 */
export interface ActionDispatchError {
  readonly code: 'IOT_ERROR' | 'RATE_LIMIT' | 'UNKNOWN';
  readonly message: string;
  readonly originalError?: unknown;
}
