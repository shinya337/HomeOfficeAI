/**
 * ActionDispatcher
 *
 * AgentActionをIoTサービス呼び出しに変換して実行する。
 * ApplianceConfigからappliance_idを取得してサービスに渡す。
 * light_control → LightService.control()
 * aircon_control → AirconService.updateSettings()
 * continue_monitoring / do_nothing → IoT操作なし
 *
 * Requirements: 4.1, 4.2, 4.5, 6.2
 */
import type { Result } from '../../../vertex-ai-vision/src/types/result.js';
import { ok, err } from '../../../vertex-ai-vision/src/types/result.js';
import type { LightService } from '../../../nature-remo/src/services/light-service.js';
import type { AirconService } from '../../../nature-remo/src/services/aircon-service.js';
import type { ServiceError } from '../../../nature-remo/src/types/types.js';
import { adaptNatureRemoResult } from '../types/result-adapter.js';
import type {
  AgentAction,
  ActionResult,
  ActionDispatchError,
  ApplianceConfig,
} from '../types/actions.js';

// =============================================================================
// Service Interface
// =============================================================================

/**
 * ActionDispatcher 依存関係
 */
export interface ActionDispatcherDependencies {
  readonly lightService: LightService;
  readonly airconService: AirconService;
}

/**
 * ActionDispatcher サービスインターフェース
 */
export interface ActionDispatcherService {
  dispatch(action: AgentAction): Promise<Result<ActionResult, ActionDispatchError>>;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * ServiceError を ActionDispatchError にマッピングする。
 * RATE_LIMIT（causeのcode）→ RATE_LIMIT、その他 → IOT_ERROR
 */
function mapServiceError(serviceError: ServiceError): ActionDispatchError {
  const isRateLimit =
    serviceError.cause?.code === 'RATE_LIMIT';

  return {
    code: isRateLimit ? 'RATE_LIMIT' : 'IOT_ERROR',
    message: serviceError.message,
    originalError: serviceError,
  };
}

/**
 * ActionDispatcher を作成する。
 *
 * @param config - ApplianceConfig（appliance_idの設定）
 * @param deps - LightService, AirconServiceの依存関係
 */
export function createActionDispatcher(
  config: ApplianceConfig,
  deps: ActionDispatcherDependencies
): ActionDispatcherService {
  return {
    async dispatch(action: AgentAction): Promise<Result<ActionResult, ActionDispatchError>> {
      try {
        switch (action.tool) {
          case 'light_control': {
            const nativeResult = await deps.lightService.control(
              config.lightApplianceId,
              action.params.action
            );
            const result = adaptNatureRemoResult(nativeResult);
            if (result.ok) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: `照明を${action.params.action === 'on' ? 'ON' : 'OFF'}にしました (${config.lightApplianceId})`,
              });
            }
            const dispatchError = mapServiceError(result.error as ServiceError);
            return err(dispatchError);
          }

          case 'aircon_control': {
            const settings: { temperature: string; operation_mode?: string; button: '' } = {
              temperature: String(action.params.temperature),
              button: '',
            };
            if (action.params.mode !== undefined) {
              settings.operation_mode = action.params.mode;
            }
            const nativeResult = await deps.airconService.updateSettings(
              config.airconApplianceId,
              settings
            );
            const result = adaptNatureRemoResult(nativeResult);
            if (result.ok) {
              return ok<ActionResult>({
                executed: true,
                nextInterval: 'normal',
                message: `エアコンを設定しました: ${action.params.temperature}度 (${config.airconApplianceId})`,
              });
            }
            const dispatchError = mapServiceError(result.error as ServiceError);
            return err(dispatchError);
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
