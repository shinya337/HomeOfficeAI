/**
 * Action Types for ActionDispatcher
 *
 * Defines AgentAction discriminated union with TV control support,
 * ActionResult, and error types for the action dispatcher.
 *
 * Requirements: 5.4 (TV control action type definition)
 * Requirements: 7.1, 7.2 (ApplianceConfig removed - device IDs from session)
 *
 * Note: ApplianceConfig has been removed. Device IDs are now obtained
 * dynamically from session's allowedDevices instead of environment variables.
 */

// =============================================================================
// AgentAction Types (Discriminated Union)
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
 * Light control parameters
 * action は標準ボタン (LightButton) またはプリセットシグナル名 (e.g., "安らぎ", "読書", "家事")
 */
export interface LightControlParams {
  readonly action: string;
  readonly reason?: string;
}

/**
 * Aircon control parameters
 */
export interface AirconControlParams {
  readonly temperature: number;
  readonly mode?: string;
  readonly reason?: string;
}

/**
 * TV control parameters
 * - power: on/off (both map to 'power' button - toggle behavior)
 * - channel: channel number as string (e.g., "1", "2", ..., "12")
 * - volume: "up" or "down"
 *
 * Requirements: 5.4 (TV control action type)
 */
export interface TvControlParams {
  readonly action: 'power' | 'channel' | 'volume';
  readonly value: string;
  readonly reason?: string;
}

/**
 * Light control action
 */
export interface LightControlAction {
  readonly tool: 'light_control';
  readonly params: LightControlParams;
}

/**
 * Aircon control action
 */
export interface AirconControlAction {
  readonly tool: 'aircon_control';
  readonly params: AirconControlParams;
}

/**
 * TV control action
 *
 * Requirements: 5.4 (TV control action in AgentAction union)
 */
export interface TvControlAction {
  readonly tool: 'tv_control';
  readonly params: TvControlParams;
}

/**
 * Continue monitoring parameters
 */
export interface ContinueMonitoringParams {
  readonly reason?: string;
}

/**
 * Continue monitoring action (short interval re-analysis)
 */
export interface ContinueMonitoringAction {
  readonly tool: 'continue_monitoring';
  readonly params: ContinueMonitoringParams;
}

/**
 * Do nothing parameters
 */
export interface DoNothingParams {
  readonly reason?: string;
}

/**
 * Do nothing action (normal interval monitoring)
 */
export interface DoNothingAction {
  readonly tool: 'do_nothing';
  readonly params: DoNothingParams;
}

// =============================================================================
// Alexa Action Types (Req 8.1, 8.2, 8.3)
// =============================================================================

/**
 * Alexa speak (TTS) parameters
 */
export interface AlexaSpeakParams {
  readonly message: string;
  readonly reason?: string;
}

/**
 * Alexa speak action - text-to-speech on Alexa device
 */
export interface AlexaSpeakAction {
  readonly tool: 'alexa_speak';
  readonly params: AlexaSpeakParams;
}

/**
 * Alexa announcement parameters (voice + screen display)
 */
export interface AlexaAnnouncementParams {
  readonly message: string;
  readonly reason?: string;
}

/**
 * Alexa announcement action - voice + screen text on Echo Show etc.
 */
export interface AlexaAnnouncementAction {
  readonly tool: 'alexa_announcement';
  readonly params: AlexaAnnouncementParams;
}

/**
 * Alexa routine parameters
 */
export interface AlexaRoutineParams {
  readonly routine_name: string;
  readonly reason?: string;
}

/**
 * Alexa routine action - trigger a named Alexa routine
 */
export interface AlexaRoutineAction {
  readonly tool: 'alexa_routine';
  readonly params: AlexaRoutineParams;
}

/**
 * Alexa volume parameters
 */
export interface AlexaVolumeParams {
  readonly volume: number;
  readonly reason?: string;
}

/**
 * Alexa volume action - set device volume (0-100)
 */
export interface AlexaVolumeAction {
  readonly tool: 'alexa_volume';
  readonly params: AlexaVolumeParams;
}

/**
 * Alexa info parameters
 */
export interface AlexaInfoParams {
  readonly info_type: 'weather' | 'flashbriefing';
  readonly reason?: string;
}

/**
 * Alexa info action - play weather or flash briefing
 */
export interface AlexaInfoAction {
  readonly tool: 'alexa_info';
  readonly params: AlexaInfoParams;
}

/**
 * Alexa text command parameters - sends text as if spoken to Alexa
 */
export interface AlexaTextCommandParams {
  readonly text: string;
  readonly reason?: string;
}

/**
 * Alexa text command action - simulate voice command via text
 */
export interface AlexaTextCommandAction {
  readonly tool: 'alexa_textcommand';
  readonly params: AlexaTextCommandParams;
}

// =============================================================================
// Break Mode Action Types
// =============================================================================

/**
 * Break mode parameters
 */
export interface BreakModeParams {
  readonly reason?: string;
}

/**
 * Break mode action - orchestrates lighting + Alexa speak + BGM for break time
 */
export interface BreakModeAction {
  readonly tool: 'break_mode';
  readonly params: BreakModeParams;
}

/**
 * Focus mode parameters
 */
export interface FocusModeParams {
  readonly reason?: string;
}

/**
 * Focus mode action - orchestrates lighting + Alexa speak + jazz BGM for work start
 */
export interface FocusModeAction {
  readonly tool: 'focus_mode';
  readonly params: FocusModeParams;
}

/**
 * Away mode parameters
 */
export interface AwayModeParams {
  readonly reason?: string;
}

/**
 * Away mode action - orchestrates light OFF + announcement + BGM stop + aircon OFF for user away
 */
export interface AwayModeAction {
  readonly tool: 'away_mode';
  readonly params: AwayModeParams;
}

/**
 * Wake mode parameters
 */
export interface WakeModeParams {
  readonly reason?: string;
}

/**
 * Wake mode action - orchestrates nap phase (light OFF + BGM stop + announce) →
 * 2min wait → wake phase (light full + announce + energetic BGM)
 */
export interface WakeModeAction {
  readonly tool: 'wake_mode';
  readonly params: WakeModeParams;
}

/**
 * Agent action discriminated union
 * Extended to include TvControlAction, Alexa action types, BreakModeAction, FocusModeAction, AwayModeAction, and WakeModeAction
 */
export type AgentAction =
  | LightControlAction
  | AirconControlAction
  | TvControlAction
  | AlexaSpeakAction
  | AlexaAnnouncementAction
  | AlexaRoutineAction
  | AlexaVolumeAction
  | AlexaInfoAction
  | AlexaTextCommandAction
  | BreakModeAction
  | FocusModeAction
  | AwayModeAction
  | WakeModeAction
  | ContinueMonitoringAction
  | DoNothingAction;

// =============================================================================
// ActionResult Types
// =============================================================================

/**
 * Next monitoring interval
 */
export type NextInterval = 'normal' | 'short' | 'nap';

/**
 * Result of action execution
 */
export interface ActionResult {
  readonly executed: boolean;
  readonly nextInterval: NextInterval;
  readonly message: string;
  readonly speechTexts?: readonly string[];
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Action dispatch error codes
 */
export type ActionDispatchErrorCode = 'IOT_ERROR' | 'RATE_LIMIT' | 'UNKNOWN';

/**
 * Action dispatch error
 */
export interface ActionDispatchError {
  readonly code: ActionDispatchErrorCode;
  readonly message: string;
  readonly originalError?: unknown;
}

// =============================================================================
// Result Type
// =============================================================================

/**
 * Result type for success/failure handling
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Helper to create success result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Helper to create error result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
