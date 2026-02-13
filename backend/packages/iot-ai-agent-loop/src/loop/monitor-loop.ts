/**
 * MonitorLoop - 動的間隔の監視ループ制御
 *
 * 画像分析 → AI行動選択 → IoTアクション実行のサイクルを
 * 動的な間隔で繰り返す。
 *
 * - 通常30秒間隔（NORMAL_INTERVAL_MS = 30,000）でサイクルを実行
 * - continue_monitoring 選択時は5秒間隔（SHORT_INTERVAL_MS = 5,000）
 * - do_nothing / IoTアクション後は通常間隔に復帰
 * - 連続監視が上限回数に達した場合、自動的に通常間隔に復帰
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.4
 */

import type { Result } from '../../../vertex-ai-vision/src/types/result.js';
import type { ImageData } from '../../../vertex-ai-vision/src/types/models.js';
import type { ImageError } from '../../../vertex-ai-vision/src/types/result.js';
import type { AgentClientService } from '../agent/agent-client.js';
import type { ActionDispatcherService } from '../dispatcher/action-dispatcher.js';
import type { AgentAction, AgentError } from '../types/actions.js';
import type { DeviceStateService, DeviceState } from '../services/device-state-service.js';
import { logCycleResult, logError, logActionSkipped } from './cycle-logger.js';
import { isSameAction, isDeviceControlAction, updateLastAction, updateCachedDeviceState } from './dedup-actions.js';
import * as path from 'node:path';

// =============================================================================
// Constants
// =============================================================================

/** 通常監視間隔: 30秒 */
export const NORMAL_INTERVAL_MS = 30_000;

/** 短縮監視間隔: 5秒 */
export const SHORT_INTERVAL_MS = 5_000;

/** 連続監視の上限回数（デフォルト） */
export const DEFAULT_MAX_CONTINUOUS_CYCLES = 30;

// =============================================================================
// Types
// =============================================================================

/**
 * 監視ループの状態
 */
/** 直近のアクション履歴として保持する最大件数 */
const MAX_ACTION_HISTORY = 10;

export interface LoopState {
  readonly mode: 'normal' | 'continuous';
  readonly currentImageIndex: number;
  readonly cycleCount: number;
  readonly continuousCount: number;
  readonly lastAction?: AgentAction;
  readonly cachedDeviceState?: DeviceState;
  readonly recentActions: AgentAction[];
}

/**
 * MonitorLoop 設定
 */
export interface MonitorLoopConfig {
  readonly imageDir: string;
  readonly normalIntervalMs: number;
  readonly shortIntervalMs: number;
  readonly maxContinuousCycles: number;
}

/**
 * ImageLoader サービスインターフェース
 */
export interface ImageLoaderService {
  loadImage(filePath: string): Promise<Result<ImageData, ImageError>>;
}

/**
 * MonitorLoop 依存関係
 */
export interface MonitorLoopDependencies {
  readonly agentClient: AgentClientService;
  readonly actionDispatcher: ActionDispatcherService;
  readonly imageLoader: ImageLoaderService;
  readonly imageFiles: string[];
  readonly deviceStateService?: DeviceStateService;
  readonly buildPrompt?: (deviceState?: DeviceState, recentActions?: AgentAction[]) => string;
}

/**
 * MonitorLoop サービスインターフェース
 */
export interface MonitorLoopService {
  start(): void;
  stop(): void;
  getState(): LoopState;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `あなたはホームオフィスの監視AIエージェントです。
ユーザーのデスク周りの画像を分析し、ユーザーの作業状態を判断してください。

状態の例:
- 集中して作業中: do_nothing（介入不要）
- 非集中・ぼんやり: continue_monitoring（5秒後に再確認）
- 居眠り: light_control（照明で刺激）またはaircon_control（温度で刺激）
- 離席: do_nothing（介入不要）

適切なToolを1つ選択してください。`;

// =============================================================================
// Implementation
// =============================================================================

/**
 * MonitorLoop を作成する。
 */
export function createMonitorLoop(
  config: MonitorLoopConfig,
  deps: MonitorLoopDependencies
): MonitorLoopService {
  // Mutable state
  let state: LoopState = {
    mode: 'normal',
    currentImageIndex: 0,
    cycleCount: 0,
    continuousCount: 0,
    recentActions: [],
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  /**
   * 1サイクルを実行する
   */
  async function executeCycle(): Promise<void> {
    if (!running) return;

    const cycleNumber = state.cycleCount + 1;
    const imageFile = deps.imageFiles[state.currentImageIndex];
    const imagePath = path.join(config.imageDir, imageFile);

    // デバイス状態取得（Req 1.1, 1.4, 2.1, 2.4, 2.5）
    let deviceState: DeviceState | undefined;
    if (deps.deviceStateService) {
      if (state.mode === 'normal') {
        // normalモードではAPIからデバイス状態を取得
        const deviceStateResult = await deps.deviceStateService.getDeviceState();
        if (deviceStateResult.ok) {
          deviceState = deviceStateResult.value;
        } else {
          // 取得失敗時はundefinedのまま（フォールバック）
          deviceState = undefined;
        }
        // cachedDeviceStateを更新（成功時は値、失敗時はundefined）
        state = { ...state, cachedDeviceState: deviceState };
      } else {
        // continuousモードではキャッシュ済み状態を使用
        deviceState = state.cachedDeviceState;
      }
    }

    // 動的プロンプト構築（デバイス状態 + アクション履歴を渡す）
    const systemPrompt = deps.buildPrompt
      ? deps.buildPrompt(deviceState, state.recentActions)
      : SYSTEM_PROMPT;

    // 画像読み込み
    const imageResult = await deps.imageLoader.loadImage(imagePath);
    if (!imageResult.ok) {
      logError({
        cycleNumber,
        imageFile,
        phase: '画像読み込み',
        errorMessage: imageResult.error.message,
      });
      // cycleCount はインクリメントし、画像インデックスも進める
      state = {
        ...state,
        cycleCount: cycleNumber,
        currentImageIndex: (state.currentImageIndex + 1) % deps.imageFiles.length,
      };
      scheduleNext('normal');
      return;
    }

    // AI分析（並列Function Calling対応: AgentAction[]を返す）
    const analyzeResult = await deps.agentClient.analyze(imageResult.value, systemPrompt);
    if (!analyzeResult.ok) {
      logError({
        cycleNumber,
        imageFile,
        phase: 'AI分析',
        errorMessage: analyzeResult.error.message,
      });
      state = {
        ...state,
        cycleCount: cycleNumber,
        currentImageIndex: (state.currentImageIndex + 1) % deps.imageFiles.length,
      };
      scheduleNext('normal');
      return;
    }

    let actions = analyzeResult.value;

    // デバイス制御と非デバイスアクション(do_nothing/continue_monitoring)が混在時、デバイス制御を優先
    const deviceActions = actions.filter(a => isDeviceControlAction(a));
    if (deviceActions.length > 0 && deviceActions.length < actions.length) {
      actions = deviceActions;
    }

    // 各アクションを順次処理
    let nextInterval: 'normal' | 'short' = 'normal';
    const executedActions: AgentAction[] = [];

    for (const action of actions) {
      // 重複チェック（Req 5.2, 5.3, 5.4, 5.6）
      if (
        isDeviceControlAction(action) &&
        state.lastAction !== undefined &&
        isSameAction(action, state.lastAction)
      ) {
        logActionSkipped({
          cycleNumber,
          imageFile,
          skippedAction: action,
          reason: '直前のアクションと同一のため重複スキップ',
        });
        continue;
      }

      // アクションディスパッチ（エラーでも継続）
      const dispatchResult = await deps.actionDispatcher.dispatch(action);

      if (dispatchResult.ok) {
        if (dispatchResult.value.nextInterval === 'short') {
          nextInterval = 'short';
        }
        logCycleResult({
          cycleNumber,
          imageFile,
          action,
          result: dispatchResult.value,
        });
        // デバイス制御アクション実行成功後にlastActionを更新（Req 5.7）
        state = { ...state, lastAction: updateLastAction(state.lastAction, action) };
        // cachedDeviceStateの論理更新
        state = { ...state, cachedDeviceState: updateCachedDeviceState(state.cachedDeviceState, action) };
      } else {
        logError({
          cycleNumber,
          imageFile,
          phase: 'ディスパッチ',
          errorMessage: dispatchResult.error.message,
        });
        // 実行失敗時はcachedDeviceStateを更新しない
      }

      executedActions.push(action);
    }

    // 全アクションがスキップされた場合は通常間隔
    if (executedActions.length === 0 && actions.length > 0) {
      state = {
        ...state,
        cycleCount: cycleNumber,
        currentImageIndex: (state.currentImageIndex + 1) % deps.imageFiles.length,
        continuousCount: 0,
      };
      scheduleNext('normal');
      return;
    }

    // アクション履歴を蓄積（最大 MAX_ACTION_HISTORY 件）
    const updatedHistory = [...state.recentActions, ...actions].slice(-MAX_ACTION_HISTORY);
    state = { ...state, recentActions: updatedHistory };

    // LoopState 更新
    if (nextInterval === 'short') {
      const newContinuousCount = state.continuousCount + 1;
      if (newContinuousCount >= config.maxContinuousCycles) {
        // 上限到達 → normal に復帰
        console.log(`[MonitorLoop] 連続監視上限（${config.maxContinuousCycles}回）到達。通常間隔に復帰します。`);
        state = {
          ...state,
          mode: 'normal',
          currentImageIndex: (state.currentImageIndex + 1) % deps.imageFiles.length,
          cycleCount: state.cycleCount + 1,
          continuousCount: 0,
        };
        scheduleNext('normal');
      } else {
        state = {
          ...state,
          mode: 'continuous',
          currentImageIndex: (state.currentImageIndex + 1) % deps.imageFiles.length,
          cycleCount: state.cycleCount + 1,
          continuousCount: newContinuousCount,
        };
        scheduleNext('short');
      }
    } else {
      state = {
        ...state,
        mode: 'normal',
        currentImageIndex: (state.currentImageIndex + 1) % deps.imageFiles.length,
        cycleCount: state.cycleCount + 1,
        continuousCount: 0,
      };
      scheduleNext('normal');
    }
  }

  /**
   * 次のサイクルをスケジュールする
   */
  function scheduleNext(interval: 'normal' | 'short'): void {
    if (!running) return;
    const ms = interval === 'short' ? config.shortIntervalMs : config.normalIntervalMs;
    timer = setTimeout(() => {
      executeCycle();
    }, ms);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      // 最初のサイクルは即座に実行
      executeCycle();
    },

    stop(): void {
      running = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },

    getState(): LoopState {
      return { ...state };
    },
  };
}

// =============================================================================
// Signal Handling
// =============================================================================

/**
 * SIGINT/SIGTERM シグナルハンドラを登録する。
 * シグナル受信時にループを安全に停止する。
 *
 * @returns cleanup 関数（ハンドラの解除用）
 */
export function setupSignalHandlers(loop: MonitorLoopService): () => void {
  const handleSignal = (signal: string) => {
    const loopState = loop.getState();
    console.log(
      `[MonitorLoop] ${signal} を受信しました。監視ループを停止します。（合計 ${loopState.cycleCount} サイクル実行）`
    );
    loop.stop();
    process.exit(0);
  };

  const sigintHandler = () => handleSignal('SIGINT');
  const sigtermHandler = () => handleSignal('SIGTERM');

  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);

  return () => {
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigtermHandler);
  };
}
