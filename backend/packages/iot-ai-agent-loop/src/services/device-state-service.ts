/**
 * DeviceStateService
 *
 * Nature Remo APIからデバイスの現在状態を取得し、
 * iot-ai-agent-loopのResult型に変換して返す。
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
import type { Result } from '../../../vertex-ai-vision/src/types/result.js';
import { ok, err } from '../../../vertex-ai-vision/src/types/result.js';
import type { ApplianceService, ApplianceInfo } from '../../../nature-remo/src/services/appliance-service.js';
import { adaptNatureRemoResult } from '../types/result-adapter.js';
import type { ApplianceConfig } from '../types/actions.js';

// =============================================================================
// Domain Types
// =============================================================================

/**
 * 照明デバイスの状態
 */
export interface LightDeviceState {
  readonly power: 'on' | 'off';
}

/**
 * エアコンデバイスの状態
 */
export interface AirconDeviceState {
  readonly temperature: string;
  readonly mode: string;
}

/**
 * Alexaデバイスの状態
 */
export interface AlexaDeviceState {
  readonly connected: boolean;
  readonly playerState?: string;
}

/**
 * デバイス全体の状態
 */
export interface DeviceState {
  readonly light: LightDeviceState | null;
  readonly aircon: AirconDeviceState | null;
  readonly alexa?: AlexaDeviceState | null;
}

/**
 * デバイス状態取得エラー
 */
export interface DeviceStateError {
  readonly code: 'API_ERROR' | 'APPLIANCE_NOT_FOUND';
  readonly message: string;
}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * DeviceStateService インターフェース
 */
export interface DeviceStateService {
  getDeviceState(): Promise<Result<DeviceState, DeviceStateError>>;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * アプライアンス一覧から指定IDの照明状態を抽出する
 */
function extractLightState(
  appliances: readonly ApplianceInfo[],
  lightApplianceId: string
): LightDeviceState | null {
  const lightAppliance = appliances.find(
    (a) => a.id === lightApplianceId && a.type === 'LIGHT'
  );
  if (!lightAppliance?.lightState) {
    return null;
  }
  return { power: lightAppliance.lightState.power };
}

/**
 * アプライアンス一覧から指定IDのエアコン状態を抽出する
 */
function extractAirconState(
  appliances: readonly ApplianceInfo[],
  airconApplianceId: string
): AirconDeviceState | null {
  const airconAppliance = appliances.find(
    (a) => a.id === airconApplianceId && a.type === 'AC'
  );
  if (!airconAppliance?.airconSettings) {
    return null;
  }
  return {
    temperature: airconAppliance.airconSettings.temperature,
    mode: airconAppliance.airconSettings.mode,
  };
}

/**
 * DeviceStateService を作成する。
 *
 * @param config - ApplianceConfig（appliance_idの設定）
 * @param applianceService - Nature Remo ApplianceService
 */
export function createDeviceStateService(
  config: ApplianceConfig,
  applianceService: ApplianceService
): DeviceStateService {
  return {
    async getDeviceState(): Promise<Result<DeviceState, DeviceStateError>> {
      // Nature Remo APIからアプライアンス一覧を取得（Req 1.1）
      const nativeResult = await applianceService.getAppliances();

      // nature-remoのResult型をiot-ai-agent-loop形式に変換（Req 1.6）
      const result = adaptNatureRemoResult(nativeResult);

      if (!result.ok) {
        // API失敗時はDeviceStateErrorを返す（Req 1.4）
        return err<DeviceStateError>({
          code: 'API_ERROR',
          message: result.error.message,
        });
      }

      const appliances = result.value;

      // 照明の電源状態を抽出（Req 1.2）
      const light = extractLightState(appliances, config.lightApplianceId);

      // エアコンの設定温度・運転モードを抽出（Req 1.3）
      const aircon = extractAirconState(appliances, config.airconApplianceId);

      return ok<DeviceState>({ light, aircon });
    },
  };
}
