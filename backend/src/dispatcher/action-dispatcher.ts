/**
 * ActionDispatcher - TV Control Extension + Dynamic Device ID + Alexa Integration
 *
 * Dispatches agent actions to IoT services including TV control and Alexa devices.
 * Converts AgentAction to specific service calls (TV, Light, Aircon, Alexa).
 * Device IDs are obtained dynamically from session's allowedDevices.
 *
 * Requirements: 5.4 (Action Dispatcher extension for TV control)
 * Requirements: 5.5, 7.1, 7.2, 7.4 (Dynamic device ID from session)
 * Requirements: 9.1-9.5, 10.4, 11.5 (Alexa action dispatch)
 *
 * Note: Environment variable fallback for device IDs has been removed.
 * Device IDs are now always obtained from session's allowedDevices.
 * See Requirements: 7.1, 7.2
 */

import type {
  AgentAction,
  ActionResult,
  ActionDispatchError,
  Result,
  LightButton,
} from '../types/action-types.js';
import { ok, err } from '../types/action-types.js';
import type { AllowedDevice, DeviceType } from '../types/device-types.js';
import { resolveRelaxSignal, resolveNormalSignal, signalToLabel } from '../services/signal-resolver.js';

// =============================================================================
// Service Interfaces
// =============================================================================

/**
 * Service error from Nature Remo services
 */
export interface ServiceError {
  readonly code: string;
  readonly message: string;
  readonly cause?: {
    readonly code: string;
    readonly message: string;
  };
}

/**
 * TV operation result
 */
export interface TvOperationResult {
  readonly applianceId: string;
  readonly button: string;
  readonly success: boolean;
}

/**
 * TV Service interface
 * Mirrors the pattern of LightService and AirconService
 */
export interface TvService {
  /**
   * Control TV using button commands
   *
   * @param applianceId - Target TV appliance ID
   * @param button - Button name (e.g., "power", "vol-up", "vol-down", "1"-"12")
   * @returns Result with TvOperationResult on success, ServiceError on failure
   */
  control(
    applianceId: string,
    button: string
  ): Promise<{ success: true; data: TvOperationResult } | { success: false; error: ServiceError }>;
}

/**
 * Light Service interface
 */
export interface LightService {
  /**
   * Control light
   *
   * @param applianceId - Target light appliance ID
   * @param action - Light button command
   * @returns Success/failure result
   */
  control(
    applianceId: string,
    action: LightButton
  ): Promise<{ success: true; data: { applianceId: string; power: string } } | { success: false; error: ServiceError }>;

  /**
   * Send a named signal registered on the appliance.
   *
   * @param applianceId - Target appliance ID
   * @param signalName - Signal name (e.g., "安らぎ", "読書", "家事")
   * @returns Success/failure result
   */
  sendNamedSignal(
    applianceId: string,
    signalName: string
  ): Promise<{ success: true; data: { applianceId: string; signalName: string; success: boolean } } | { success: false; error: ServiceError }>;
}

/**
 * Aircon Service interface
 */
export interface AirconService {
  /**
   * Control aircon temperature and mode
   *
   * @param applianceId - Target aircon appliance ID
   * @param temperature - Target temperature
   * @param mode - Operation mode (optional)
   * @returns Success/failure result
   */
  setTemperature(
    applianceId: string,
    temperature: number,
    mode?: string
  ): Promise<{ success: true; data: { applianceId: string; temperature: number } } | { success: false; error: ServiceError }>;

  /**
   * Power off aircon
   *
   * @param applianceId - Target aircon appliance ID
   * @returns Success/failure result
   */
  powerOff(
    applianceId: string
  ): Promise<{ success: true; data: { applianceId: string } } | { success: false; error: ServiceError }>;
}

/**
 * AlexaService error type for dispatcher integration
 * Mirrors AlexaServiceError from experiments module (Req 11.5)
 */
interface AlexaServiceError {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * Alexa operation result type for dispatcher integration
 */
export interface AlexaOperationResult {
  readonly deviceSerialNumber: string;
  readonly command: string;
  readonly success: boolean;
}

/**
 * Alexa result type for dispatcher integration
 */
export type AlexaResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: AlexaServiceError };

/**
 * AlexaService interface for ActionDispatcher (Req 9.2)
 * Subset of the full AlexaService from experiments module.
 * Only includes methods needed for action dispatch.
 */
export interface AlexaServiceForDispatcher {
  speak(
    deviceSerialNumber: string,
    message: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  announce(
    deviceSerialNumber: string,
    message: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  executeRoutine(
    routineName: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  setVolume(
    deviceSerialNumber: string,
    volume: number
  ): Promise<AlexaResult<AlexaOperationResult>>;

  textCommand(
    deviceSerialNumber: string,
    text: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  playWeather(
    deviceSerialNumber: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  playFlashBriefing(
    deviceSerialNumber: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  isConnected(): boolean;
}

/**
 * ActionDispatcher dependencies
 */
export interface ActionDispatcherDependencies {
  readonly tvService?: TvService;
  readonly lightService?: LightService;
  readonly airconService?: AirconService;
  readonly alexaService?: AlexaServiceForDispatcher;
}

/**
 * ActionDispatcher service interface
 */
interface ActionDispatcherService {
  dispatch(action: AgentAction): Promise<Result<ActionResult, ActionDispatchError>>;
}

// =============================================================================
// Device ID Resolution
// =============================================================================

/**
 * Get device ID for a specific device type from allowedDevices list.
 * When multiple devices of the same type exist, returns the first one.
 *
 * Requirements: 5.5, 7.4 (Dynamic device ID retrieval)
 *
 * @param allowedDevices - List of allowed devices from session
 * @param type - Device type to look up
 * @returns Device ID if found, undefined otherwise
 */
export function getDeviceIdForType(
  allowedDevices: readonly AllowedDevice[],
  type: DeviceType
): string | undefined {
  const device = allowedDevices.find((d) => d.type === type);
  return device?.id;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Map ServiceError to ActionDispatchError
 * RATE_LIMIT from cause.code maps to RATE_LIMIT, others to IOT_ERROR
 */
function mapServiceError(serviceError: ServiceError): ActionDispatchError {
  const isRateLimit = serviceError.cause?.code === 'RATE_LIMIT';

  return {
    code: isRateLimit ? 'RATE_LIMIT' : 'IOT_ERROR',
    message: serviceError.message,
    originalError: serviceError,
  };
}

/**
 * Map AlexaServiceError to ActionDispatchError (Req 11.5)
 * All Alexa errors map to IOT_ERROR since they are IoT device errors.
 */
function mapAlexaServiceError(alexaError: AlexaServiceError): ActionDispatchError {
  return {
    code: 'IOT_ERROR',
    message: alexaError.message,
    originalError: alexaError,
  };
}

/**
 * Convert TV control params to Nature Remo button name
 */
function getTvButton(action: string, value: string): string {
  switch (action) {
    case 'power':
      // Nature Remo TV uses toggle button for power
      return 'power';
    case 'channel':
      // Channel number is sent directly as button name
      return value;
    case 'volume':
      // Volume up/down maps to vol-up/vol-down buttons
      return value === 'up' ? 'vol-up' : 'vol-down';
    default:
      return value;
  }
}

/**
 * Generate success message for TV control
 */
function getTvSuccessMessage(action: string, value: string, applianceId: string, reason?: string): string {
  let base: string;
  switch (action) {
    case 'power':
      base = `テレビの電源を操作しました (${applianceId})`;
      break;
    case 'channel':
      base = `テレビのチャンネルを${value}に変更しました (${applianceId})`;
      break;
    case 'volume':
      base = `テレビの音量を${value === 'up' ? '上げ' : '下げ'}ました (${applianceId})`;
      break;
    default:
      base = `テレビを操作しました (${applianceId})`;
      break;
  }
  return reason ? `${base} | ${reason}` : base;
}

/**
 * Set of standard Light API button values
 */
const STANDARD_LIGHT_BUTTONS: ReadonlySet<string> = new Set([
  'on', 'off', 'on-100', 'on-favorite', 'night',
  'bright-up', 'bright-down', 'colortemp-up', 'colortemp-down',
]);

/**
 * Light button action label map for human-readable messages.
 * Standard buttons only -- custom signal labels are generated dynamically
 * via signalToLabel() at dispatch time.
 */
const LIGHT_ACTION_LABEL: Record<string, string> = {
  on: 'ON',
  off: 'OFF',
  'on-100': '全灯',
  'on-favorite': 'お気に入り',
  night: '常夜灯',
  'bright-up': '明るく',
  'bright-down': '暗く',
  'colortemp-up': '寒色',
  'colortemp-down': '暖色',
};

/**
 * Append reason to a message if present
 */
function withReason(message: string, reason?: string): string {
  return reason ? `${message} | ${reason}` : message;
}

/** サブアクション間のディレイ（Nature Remo API処理待ち） */
const SUB_ACTION_DELAY_MS = 1_500;

/** Alexa speak後のディレイ（読み上げ完了待ち） */
const SPEAK_WAIT_MS = 5_000;

/** 仮眠フェーズの待機時間（2分） */
const NAP_DURATION_MS = 120_000;

/**
 * 指定ミリ秒待機する
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create ActionDispatcher with dynamic device ID resolution from session's allowedDevices.
 *
 * Device IDs are obtained from allowedDevices only.
 * If no matching device is found, the action returns a NO_DEVICE error.
 *
 * Requirements: 5.4 (TV control)
 * Requirements: 5.5, 7.1, 7.2, 7.4 (Dynamic device ID from session)
 *
 * Note: Environment variable fallback has been removed (Req 7.1, 7.2).
 *
 * @param allowedDevices - List of allowed devices from session
 * @param deps - Service dependencies (TvService, LightService, AirconService)
 * @returns ActionDispatcherService instance
 */
export function createActionDispatcher(
  allowedDevices: readonly AllowedDevice[],
  deps: ActionDispatcherDependencies
): ActionDispatcherService {
  // Resolve device IDs from allowedDevices (no fallback to config)
  const resolveTvId = (): string | undefined => {
    return getDeviceIdForType(allowedDevices, 'TV');
  };

  const resolveLightId = (): string | undefined => {
    return getDeviceIdForType(allowedDevices, 'LIGHT');
  };

  const resolveAirconId = (): string | undefined => {
    return getDeviceIdForType(allowedDevices, 'AC');
  };

  const resolveAlexaId = (): string | undefined => {
    return getDeviceIdForType(allowedDevices, 'ALEXA');
  };

  return {
    async dispatch(action: AgentAction): Promise<Result<ActionResult, ActionDispatchError>> {
      try {
        switch (action.tool) {
          case 'tv_control': {
            const tvId = resolveTvId();
            if (!tvId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'TVデバイスが許可されていません。セッション開始時にTVを選択してください。',
              });
            }
            if (!deps.tvService) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'TVサービスが設定されていません。',
              });
            }
            const button = getTvButton(action.params.action, action.params.value);
            const result = await deps.tvService.control(tvId, button);

            if (result.success) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: getTvSuccessMessage(
                  action.params.action,
                  action.params.value,
                  tvId,
                  action.params.reason
                ),
              });
            }

            return err(mapServiceError(result.error));
          }

          case 'light_control': {
            const lightId = resolveLightId();
            if (!lightId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: '照明デバイスが許可されていません。セッション開始時に照明を選択してください。',
              });
            }
            // Dynamic label: use static label for standard buttons, signalToLabel() for custom signals
            const lightLabel = LIGHT_ACTION_LABEL[action.params.action]
              ?? (STANDARD_LIGHT_BUTTONS.has(action.params.action) ? action.params.action : signalToLabel(action.params.action));
            const lightMsg = withReason(`照明を${lightLabel}にしました (${lightId})`, action.params.reason);
            if (!deps.lightService) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: lightMsg,
              });
            }

            // 標準ボタンかプリセットシグナル名かで呼び分け
            if (STANDARD_LIGHT_BUTTONS.has(action.params.action)) {
              const result = await deps.lightService.control(lightId, action.params.action as LightButton);
              if (result.success) {
                return ok<ActionResult>({
                  executed: true,
                  nextInterval: 'normal',
                  message: lightMsg,
                });
              }
              return err(mapServiceError(result.error));
            } else {
              const result = await deps.lightService.sendNamedSignal(lightId, action.params.action);
              if (result.success) {
                return ok<ActionResult>({
                  executed: true,
                  nextInterval: 'normal',
                  message: lightMsg,
                });
              }
              return err(mapServiceError(result.error));
            }
          }

          case 'aircon_control': {
            const airconId = resolveAirconId();
            if (!airconId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'エアコンデバイスが許可されていません。セッション開始時にエアコンを選択してください。',
              });
            }
            const airconMsg = withReason(`エアコンを設定しました: ${action.params.temperature}度 (${airconId})`, action.params.reason);
            if (!deps.airconService) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: airconMsg,
              });
            }
            const result = await deps.airconService.setTemperature(
              airconId,
              action.params.temperature,
              action.params.mode
            );
            if (result.success) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: airconMsg,
              });
            }
            return err(mapServiceError(result.error));
          }

          // =================================================================
          // Alexa Actions (Req 9.1-9.5, 10.4, 11.5)
          // =================================================================

          case 'alexa_speak': {
            const alexaId = resolveAlexaId();
            if (!alexaId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaデバイスが許可されていません。セッション開始時にAlexaを選択してください。',
              });
            }
            if (!deps.alexaService) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaサービスが設定されていません。',
              });
            }
            const speakResult = await deps.alexaService.speak(alexaId, action.params.message);
            if (speakResult.success) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: withReason(`Alexaでspeakを実行しました: "${action.params.message}" (${alexaId})`, action.params.reason),
              });
            }
            return err(mapAlexaServiceError(speakResult.error));
          }

          case 'alexa_announcement': {
            const alexaId = resolveAlexaId();
            if (!alexaId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaデバイスが許可されていません。セッション開始時にAlexaを選択してください。',
              });
            }
            if (!deps.alexaService) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaサービスが設定されていません。',
              });
            }
            const announceResult = await deps.alexaService.announce(alexaId, action.params.message);
            if (announceResult.success) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: withReason(`Alexaでannouncementを実行しました: "${action.params.message}" (${alexaId})`, action.params.reason),
              });
            }
            return err(mapAlexaServiceError(announceResult.error));
          }

          case 'alexa_routine': {
            const alexaId = resolveAlexaId();
            if (!alexaId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaデバイスが許可されていません。セッション開始時にAlexaを選択してください。',
              });
            }
            if (!deps.alexaService) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaサービスが設定されていません。',
              });
            }
            const routineResult = await deps.alexaService.executeRoutine(action.params.routine_name);
            if (routineResult.success) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: withReason(`Alexaでroutineを実行しました: "${action.params.routine_name}"`, action.params.reason),
              });
            }
            return err(mapAlexaServiceError(routineResult.error));
          }

          case 'alexa_volume': {
            const alexaId = resolveAlexaId();
            if (!alexaId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaデバイスが許可されていません。セッション開始時にAlexaを選択してください。',
              });
            }
            if (!deps.alexaService) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaサービスが設定されていません。',
              });
            }
            const volumeResult = await deps.alexaService.setVolume(alexaId, action.params.volume);
            if (volumeResult.success) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: withReason(`Alexaの音量を${action.params.volume}に設定しました (${alexaId})`, action.params.reason),
              });
            }
            return err(mapAlexaServiceError(volumeResult.error));
          }

          case 'alexa_info': {
            const alexaId = resolveAlexaId();
            if (!alexaId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaデバイスが許可されていません。セッション開始時にAlexaを選択してください。',
              });
            }
            if (!deps.alexaService) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaサービスが設定されていません。',
              });
            }
            if (action.params.info_type === 'weather') {
              const weatherResult = await deps.alexaService.playWeather(alexaId);
              if (weatherResult.success) {
                return ok<ActionResult>({
                  executed: true,
                  nextInterval: 'normal',
                  message: withReason(`Alexaで天気予報を再生しました (${alexaId})`, action.params.reason),
                });
              }
              return err(mapAlexaServiceError(weatherResult.error));
            } else {
              const briefingResult = await deps.alexaService.playFlashBriefing(alexaId);
              if (briefingResult.success) {
                return ok<ActionResult>({
                  executed: true,
                  nextInterval: 'normal',
                  message: withReason(`Alexaでフラッシュブリーフィングを再生しました (${alexaId})`, action.params.reason),
                });
              }
              return err(mapAlexaServiceError(briefingResult.error));
            }
          }

          case 'alexa_textcommand': {
            const alexaId = resolveAlexaId();
            if (!alexaId) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaデバイスが許可されていません。セッション開始時にAlexaを選択してください。',
              });
            }
            if (!deps.alexaService) {
              return err<ActionDispatchError>({
                code: 'IOT_ERROR',
                message: 'Alexaサービスが設定されていません。',
              });
            }
            const textCmdResult = await deps.alexaService.textCommand(alexaId, action.params.text);
            if (textCmdResult.success) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: withReason(`Alexaにコマンドを送信しました: "${action.params.text}" (${alexaId})`, action.params.reason),
              });
            }
            return err(mapAlexaServiceError(textCmdResult.error));
          }

          // =================================================================
          // Break Mode (orchestrated action)
          // =================================================================

          case 'break_mode': {
            const results: string[] = [];
            const errors: string[] = [];

            // Sub-action 1: Light → relax signal (dynamic) or on-favorite (fallback)
            const lightId = resolveLightId();
            if (lightId && deps.lightService) {
              const lightDevice = allowedDevices.find(d => d.type === 'LIGHT');
              const lightSignals = lightDevice?.signals ?? [];
              const relaxSignal = resolveRelaxSignal(lightSignals);

              try {
                if (relaxSignal !== null) {
                  // Relax signal found: use sendNamedSignal
                  const lightResult = await deps.lightService.sendNamedSignal(lightId, relaxSignal);
                  if (lightResult.success) {
                    results.push(`照明を${signalToLabel(relaxSignal)}に変更`);
                  } else {
                    errors.push(`照明エラー: ${lightResult.error.message}`);
                  }
                } else {
                  // No relax signal: fallback to on-favorite standard button
                  const lightResult = await deps.lightService.control(lightId, 'on-favorite');
                  if (lightResult.success) {
                    results.push('照明をお気に入りモードに変更');
                  } else {
                    errors.push(`照明エラー: ${lightResult.error.message}`);
                  }
                }
              } catch (e) {
                errors.push(`照明エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            // Sub-action 2: Alexa speak → 休憩モードアナウンス
            const alexaId = resolveAlexaId();
            if (alexaId && deps.alexaService) {
              // 照明操作後にディレイ（Nature Remo API処理待ち）
              await delay(SUB_ACTION_DELAY_MS);

              try {
                const speakResult = await deps.alexaService.speak(alexaId, '休憩モードに切り替えます。ごゆっくりどうぞ。');
                if (speakResult.success) {
                  results.push('Alexaで音声メッセージを再生');
                } else {
                  errors.push(`Alexa speak エラー: ${speakResult.error.message}`);
                }
              } catch (e) {
                errors.push(`Alexa speak エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }

              // speak完了待ち（Alexaが読み上げ終わるまで待機）
              await delay(SPEAK_WAIT_MS);

              // Sub-action 3: Alexa textcommand → リラックスの音楽をかけて
              try {
                const bgmResult = await deps.alexaService.textCommand(alexaId, 'リラックスの音楽をかけて');
                if (bgmResult.success) {
                  results.push('リラックスBGMを再生');
                } else {
                  errors.push(`Alexa BGM エラー: ${bgmResult.error.message}`);
                }
              } catch (e) {
                errors.push(`Alexa BGM エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            // 実行詳細はログに出力
            console.log(`[ActionDispatcher] break_mode 実行結果: ${results.join(', ') || 'なし'}${errors.length > 0 ? ` | エラー: ${errors.join('; ')}` : ''}`);

            return ok<ActionResult>({
              executed: true,
              nextInterval: 'normal',
              message: action.params.reason || '休憩モードを開始しました',
              speechTexts: ['休憩モードに切り替えます。ごゆっくりどうぞ。'],
            });
          }

          // =================================================================
          // Focus Mode (orchestrated action)
          // =================================================================

          case 'focus_mode': {
            const focusResults: string[] = [];
            const focusErrors: string[] = [];

            // Sub-action 1: Light → normal signal (dynamic) or on-100 (fallback)
            const focusLightId = resolveLightId();
            console.log(`[ActionDispatcher] focus_mode: lightId=${focusLightId ?? 'なし'}, lightService=${deps.lightService ? 'あり' : 'なし'}`);
            if (focusLightId && deps.lightService) {
              const focusLightDevice = allowedDevices.find(d => d.type === 'LIGHT');
              const focusLightSignals = focusLightDevice?.signals ?? [];
              const normalSignal = resolveNormalSignal(focusLightSignals);

              try {
                if (normalSignal !== null) {
                  // Normal signal found: use sendNamedSignal
                  const lightResult = await deps.lightService.sendNamedSignal(focusLightId, normalSignal);
                  console.log(`[ActionDispatcher] focus_mode: 照明結果=`, JSON.stringify(lightResult));
                  if (lightResult.success) {
                    focusResults.push(`照明を${signalToLabel(normalSignal)}に変更`);
                  } else {
                    focusErrors.push(`照明エラー: ${lightResult.error.message}`);
                  }
                } else {
                  // No normal signal: fallback to on-100 standard button
                  const lightResult = await deps.lightService.control(focusLightId, 'on-100');
                  console.log(`[ActionDispatcher] focus_mode: 照明結果(fallback)=`, JSON.stringify(lightResult));
                  if (lightResult.success) {
                    focusResults.push('照明を全灯に変更');
                  } else {
                    focusErrors.push(`照明エラー: ${lightResult.error.message}`);
                  }
                }
              } catch (e) {
                console.log(`[ActionDispatcher] focus_mode: 照明例外=`, e);
                focusErrors.push(`照明エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            // Sub-action 2: Alexa speak → 集中モードアナウンス
            const focusAlexaId = resolveAlexaId();
            if (focusAlexaId && deps.alexaService) {
              // 照明操作後にディレイ（Nature Remo API処理待ち）
              await delay(SUB_ACTION_DELAY_MS);

              try {
                const speakResult = await deps.alexaService.speak(focusAlexaId, '集中モードに切り替えます。');
                if (speakResult.success) {
                  focusResults.push('Alexaで音声メッセージを再生');
                } else {
                  focusErrors.push(`Alexa speak エラー: ${speakResult.error.message}`);
                }
              } catch (e) {
                focusErrors.push(`Alexa speak エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }

              // speak完了待ち（Alexaが読み上げ終わるまで待機）
              await delay(SPEAK_WAIT_MS);

              // Sub-action 3: Alexa textcommand → 集中できるジャズをかけて
              try {
                const bgmResult = await deps.alexaService.textCommand(focusAlexaId, '集中できるジャズをかけて');
                if (bgmResult.success) {
                  focusResults.push('ジャズBGMを再生');
                } else {
                  focusErrors.push(`Alexa BGM エラー: ${bgmResult.error.message}`);
                }
              } catch (e) {
                focusErrors.push(`Alexa BGM エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            // 実行詳細はログに出力
            console.log(`[ActionDispatcher] focus_mode 実行結果: ${focusResults.join(', ') || 'なし'}${focusErrors.length > 0 ? ` | エラー: ${focusErrors.join('; ')}` : ''}`);

            return ok<ActionResult>({
              executed: true,
              nextInterval: 'normal',
              message: action.params.reason || '集中モードを開始しました',
              speechTexts: ['集中モードに切り替えます'],
            });
          }

          // =================================================================
          // Away Mode (orchestrated action)
          // =================================================================

          case 'away_mode': {
            const awayResults: string[] = [];
            const awayErrors: string[] = [];

            // Sub-action 1: Light → off
            const awayLightId = resolveLightId();
            if (awayLightId && deps.lightService) {
              try {
                const lightResult = await deps.lightService.control(awayLightId, 'off');
                if (lightResult.success) {
                  awayResults.push('照明をOFFに変更');
                } else {
                  awayErrors.push(`照明エラー: ${lightResult.error.message}`);
                }
              } catch (e) {
                awayErrors.push(`照明エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            // Sub-action 2: Alexa speak → 離席モードアナウンス + BGM停止
            const awayAlexaId = resolveAlexaId();
            if (awayAlexaId && deps.alexaService) {
              // 照明操作後にディレイ（Nature Remo API処理待ち）
              await delay(SUB_ACTION_DELAY_MS);

              try {
                const speakResult = await deps.alexaService.speak(awayAlexaId, '離席モードに切り替えます。');
                if (speakResult.success) {
                  awayResults.push('Alexaで音声メッセージを再生');
                } else {
                  awayErrors.push(`Alexa speak エラー: ${speakResult.error.message}`);
                }
              } catch (e) {
                awayErrors.push(`Alexa speak エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }

              // speak完了待ち（Alexaが読み上げ終わるまで待機）
              await delay(SPEAK_WAIT_MS);

              // Sub-action 3: Alexa textcommand → BGM停止
              try {
                const bgmResult = await deps.alexaService.textCommand(awayAlexaId, '音楽を止めて');
                if (bgmResult.success) {
                  awayResults.push('BGMを停止');
                } else {
                  awayErrors.push(`Alexa BGM停止 エラー: ${bgmResult.error.message}`);
                }
              } catch (e) {
                awayErrors.push(`Alexa BGM停止 エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            // Sub-action 4: Aircon → power off
            const awayAirconId = resolveAirconId();
            if (awayAirconId && deps.airconService) {
              try {
                const airconResult = await deps.airconService.powerOff(awayAirconId);
                if (airconResult.success) {
                  awayResults.push('エアコンをOFF');
                } else {
                  awayErrors.push(`エアコンエラー: ${airconResult.error.message}`);
                }
              } catch (e) {
                awayErrors.push(`エアコンエラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            // 実行詳細はログに出力
            console.log(`[ActionDispatcher] away_mode 実行結果: ${awayResults.join(', ') || 'なし'}${awayErrors.length > 0 ? ` | エラー: ${awayErrors.join('; ')}` : ''}`);

            return ok<ActionResult>({
              executed: true,
              nextInterval: 'normal',
              message: action.params.reason || '離席モードを開始しました',
              speechTexts: ['離席モードに切り替えます'],
            });
          }

          // =================================================================
          // Wake Mode (orchestrated 2-phase action)
          // =================================================================

          case 'wake_mode': {
            const wakeResults: string[] = [];
            const wakeErrors: string[] = [];

            const wakeLightId = resolveLightId();
            const wakeAlexaId = resolveAlexaId();
            const hasIoTDevices = !!(wakeLightId && deps.lightService) || !!(wakeAlexaId && deps.alexaService);

            if (hasIoTDevices) {
              // === Phase 1: 仮眠フェーズ (IoTデバイスあり) ===

              // Sub-action 1: Light → off
              if (wakeLightId && deps.lightService) {
                try {
                  const lightResult = await deps.lightService.control(wakeLightId, 'off');
                  if (lightResult.success) {
                    wakeResults.push('照明をOFFに変更');
                  } else {
                    wakeErrors.push(`照明エラー: ${lightResult.error.message}`);
                  }
                } catch (e) {
                  wakeErrors.push(`照明エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }

              // Sub-action 2: BGM停止
              if (wakeAlexaId && deps.alexaService) {
                await delay(SUB_ACTION_DELAY_MS);

                try {
                  const stopResult = await deps.alexaService.textCommand(wakeAlexaId, '音楽を止めて');
                  if (stopResult.success) {
                    wakeResults.push('BGMを停止');
                  } else {
                    wakeErrors.push(`BGM停止エラー: ${stopResult.error.message}`);
                  }
                } catch (e) {
                  wakeErrors.push(`BGM停止エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }

                // Sub-action 3: 仮眠アナウンス
                await delay(SUB_ACTION_DELAY_MS);

                try {
                  const napSpeakResult = await deps.alexaService.speak(wakeAlexaId, '仮眠モードに入ります。2分後に起こします。');
                  if (napSpeakResult.success) {
                    wakeResults.push('仮眠アナウンスを再生');
                  } else {
                    wakeErrors.push(`仮眠アナウンスエラー: ${napSpeakResult.error.message}`);
                  }
                } catch (e) {
                  wakeErrors.push(`仮眠アナウンスエラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }

              // === 2分間待機 (IoTデバイスあり時のみ) ===
              await delay(NAP_DURATION_MS);

              // === Phase 2: 覚醒フェーズ (IoTデバイスあり) ===

              // Sub-action 4: Light → on-100 (全灯)
              if (wakeLightId && deps.lightService) {
                try {
                  const lightOnResult = await deps.lightService.control(wakeLightId, 'on-100');
                  if (lightOnResult.success) {
                    wakeResults.push('照明を全灯に変更');
                  } else {
                    wakeErrors.push(`照明全灯エラー: ${lightOnResult.error.message}`);
                  }
                } catch (e) {
                  wakeErrors.push(`照明全灯エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }

              // Sub-action 5: 覚醒アナウンス
              if (wakeAlexaId && deps.alexaService) {
                await delay(SUB_ACTION_DELAY_MS);

                try {
                  const wakeSpeakResult = await deps.alexaService.speak(wakeAlexaId, '起きてストレッチしましょう。');
                  if (wakeSpeakResult.success) {
                    wakeResults.push('覚醒アナウンスを再生');
                  } else {
                    wakeErrors.push(`覚醒アナウンスエラー: ${wakeSpeakResult.error.message}`);
                  }
                } catch (e) {
                  wakeErrors.push(`覚醒アナウンスエラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }

                // Sub-action 6: 覚醒BGM
                await delay(SPEAK_WAIT_MS);

                try {
                  const bgmResult = await deps.alexaService.textCommand(wakeAlexaId, '元気が出る音楽をかけて');
                  if (bgmResult.success) {
                    wakeResults.push('覚醒BGMを再生');
                  } else {
                    wakeErrors.push(`覚醒BGMエラー: ${bgmResult.error.message}`);
                  }
                } catch (e) {
                  wakeErrors.push(`覚醒BGMエラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }
            }

            // 実行詳細はログに出力
            console.log(`[ActionDispatcher] wake_mode 実行結果: ${wakeResults.join(', ') || 'なし'}${wakeErrors.length > 0 ? ` | エラー: ${wakeErrors.join('; ')}` : ''} | IoT: ${hasIoTDevices}`);

            return ok<ActionResult>({
              executed: true,
              // IoTなし: フロントエンドが仮眠→覚醒のタイミングを制御
              // IoTあり: サーバー側で2分待機済み、通常間隔で次の分析
              nextInterval: hasIoTDevices ? 'normal' : 'nap',
              message: action.params.reason || '覚醒モードを開始しました',
              speechTexts: ['仮眠モードに入ります。2分後に起こします。', '起きてストレッチしましょう。'],
            });
          }

          case 'continue_monitoring': {
            const reason = action.params.reason;
            return ok<ActionResult>({
              executed: false,
              nextInterval: 'short',
              message: reason || '継続監視モードに移行します（5秒後に再分析）',
            });
          }

          case 'do_nothing': {
            const reason = action.params.reason;
            return ok<ActionResult>({
              executed: false,
              nextInterval: 'normal',
              message: reason || '異常なし。通常監視を継続します',
            });
          }
        }
      } catch (error) {
        return err<ActionDispatchError>({
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error',
          originalError: error,
        });
      }
    },
  };
}
