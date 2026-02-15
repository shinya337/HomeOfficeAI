/**
 * AnalyzeHandler Service
 *
 * Handles image analysis requests by coordinating AI analysis and IoT device control.
 * This service:
 * - Validates session state before analysis
 * - Retrieves current device state for context (filtered by allowed devices)
 * - Generates dynamic tool definitions based on allowed devices
 * - Calls AgentClient for AI image analysis with dynamic tools
 * - Dispatches actions via ActionDispatcher
 * - Prevents duplicate device control actions
 * - Logs analysis results
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.5, 6.1, 6.2, 6.3, 6.4
 * Contract: AnalyzeHandlerService
 */

import type { SessionManagerService } from './session-manager.js';
import type { DynamicToolBuilderService } from './dynamic-tool-builder.js';
import type {
  DeviceStateService,
  FilteredDeviceState,
} from './device-state-service.js';
import type {
  AgentClientService,
  ActionDispatcherService,
  AgentAction,
  ActionResult as CoreActionResult,
  AgentError,
} from '../config/index.js';
import type { Result } from '../types/action-types.js';
import { isSameAction, isDeviceControlAction } from '../config/index.js';
import type { ImageData } from '../types/api-types.js';
import { Intervals } from '../types/api-types.js';
import { buildPrompt } from '../../packages/iot-ai-agent-loop/src/agent/prompt-builder.js';
import type { FunctionDeclaration } from '@google-cloud/vertexai';
import type { AllowedDevice } from '../types/device-types.js';
import type { SessionIoTServices } from '../types/session-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended AgentClientService that supports dynamic tool definitions
 * 並列Function Calling対応: AgentAction[] を返す
 */
export interface DynamicAgentClientService {
  analyze(
    imageData: ImageData,
    systemPrompt: string,
    tools?: readonly FunctionDeclaration[]
  ): Promise<Result<AgentAction[], AgentError>>;
}

/**
 * Dependencies required by AnalyzeHandler
 */
export interface AnalyzeHandlerDependencies {
  readonly sessionManager: SessionManagerService;
  readonly agentClient: AgentClientService | DynamicAgentClientService;
  readonly actionDispatcherFactory: (allowedDevices: readonly AllowedDevice[], sessionIoTServices?: SessionIoTServices) => ActionDispatcherService;
  readonly deviceStateService: DeviceStateService;
  /** Optional: when provided, enables dynamic tool generation based on allowed devices (Req 4.1, 4.2) */
  readonly dynamicToolBuilder?: DynamicToolBuilderService;
}

/**
 * Result of action execution (API response format)
 */
export interface ActionResult {
  readonly executed: boolean;
  readonly message: string;
  readonly speechTexts?: readonly string[];
}

/**
 * Successful analysis result
 * 並列Function Calling対応: actions[]/actionResults[] で複数アクションの結果を返す
 * 後方互換のため action/actionResult も先頭アクション/結果を保持
 */
export interface AnalyzeResult {
  readonly action: AgentAction;
  readonly actionResult: ActionResult;
  readonly actions: AgentAction[];
  readonly actionResults: ActionResult[];
  readonly nextIntervalMs: number;
  readonly deviceState?: FilteredDeviceState;
}

/**
 * Analysis error codes
 */
export type AnalyzeErrorCode = 'NO_ACTIVE_SESSION' | 'AI_ERROR' | 'IOT_ERROR';

/**
 * Analysis error
 */
export interface AnalyzeError {
  readonly code: AnalyzeErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * AnalyzeHandler service interface
 */
export interface AnalyzeHandlerService {
  /**
   * Analyze an image and execute appropriate action
   * @param imageData The image to analyze
   * @param sessionId Optional session ID to look up session-specific IoT services (Task 6.3)
   * @returns Result with analysis result or error
   */
  analyze(imageData: ImageData, sessionId?: string): Promise<Result<AnalyzeResult, AnalyzeError>>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Strip data URL prefix from base64 string if present
 * e.g., "data:image/jpeg;base64,/9j/4AAQ..." -> "/9j/4AAQ..."
 */
function stripDataUrlPrefix(base64: string): string {
  const match = base64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : base64;
}

/**
 * Check if action is a duplicate of the most recent device control action
 */
function isDuplicateAction(action: AgentAction, recentActions: AgentAction[]): boolean {
  // Only device control actions are subject to dedup
  if (!isDeviceControlAction(action)) {
    return false;
  }

  // Find the last device control action in history
  for (let i = recentActions.length - 1; i >= 0; i--) {
    const pastAction = recentActions[i];
    if (isDeviceControlAction(pastAction)) {
      return isSameAction(action, pastAction);
    }
  }

  return false;
}

/**
 * Log analysis cycle information (複数アクション対応)
 */
function logAnalysisCycle(
  actions: AgentAction[],
  results: ActionResult[],
  deviceState: FilteredDeviceState | undefined,
): void {
  const timestamp = new Date().toISOString();
  const stateInfo = deviceState
    ? `Light: ${deviceState.light?.power ?? 'unknown'}, Aircon: ${deviceState.aircon?.temperature ?? 'unknown'}C`
    : 'Device state unavailable';

  console.log(`[${timestamp}] Analysis cycle (${actions.length} action(s)):`);
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const result = results[i];
    console.log(`  [${i + 1}] Action: ${action.tool}`);
    console.log(`      Params: ${JSON.stringify(action.params)}`);
    console.log(`      Executed: ${result?.executed ?? false}`);
    console.log(`      Message: ${result?.message ?? 'N/A'}`);
  }
  console.log(`  Device State: ${stateInfo}`);
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create an AnalyzeHandler service instance
 * @param deps Dependencies for the handler
 * @returns AnalyzeHandlerService implementation
 */
export function createAnalyzeHandler(
  deps: AnalyzeHandlerDependencies
): AnalyzeHandlerService {
  const { sessionManager, agentClient, actionDispatcherFactory, deviceStateService, dynamicToolBuilder } = deps;

  return {
    async analyze(imageData: ImageData, sessionId?: string): Promise<Result<AnalyzeResult, AnalyzeError>> {
      // Step 1: Validate session is active (Req 6.2, 6.5)
      if (!sessionManager.hasActiveSession()) {
        return {
          ok: false,
          error: {
            code: 'NO_ACTIVE_SESSION',
            message: 'セッションがアクティブではありません。分析を実行するにはセッションを開始してください。',
            retryable: false,
          },
        };
      }

      // Step 1.5: Get allowed devices and IoT services from session (Req 4.1, Task 6.3)
      let allowedDevices: readonly AllowedDevice[] | undefined;
      let sessionIoTServices: SessionIoTServices | undefined;

      if (sessionId !== undefined) {
        // Look up specific session by sessionId (Task 6.3)
        const session = sessionManager.getSession(sessionId);
        if (session === undefined) {
          return {
            ok: false,
            error: {
              code: 'NO_ACTIVE_SESSION',
              message: `セッションが見つかりません: ${sessionId}`,
              retryable: false,
            },
          };
        }
        allowedDevices = session.allowedDevices;
        sessionIoTServices = sessionManager.getSessionIoTServices(sessionId);
      } else {
        // Backward compatibility: use getStatus() for first active session
        const session = sessionManager.getStatus();
        allowedDevices = session?.allowedDevices;
      }

      // Step 1.6: Create per-request ActionDispatcher with session's allowedDevices and IoT services (Req 7.1, 7.2, Task 6.3)
      const actionDispatcher = actionDispatcherFactory(allowedDevices ?? [], sessionIoTServices);

      // Step 2: Get current device state filtered by allowed devices (Req 6.1, 6.3)
      let deviceState: FilteredDeviceState | undefined;
      const deviceStateResult = await deviceStateService.getDeviceState(allowedDevices);
      if (deviceStateResult.ok) {
        deviceState = deviceStateResult.value;
      }
      // Continue even if device state retrieval fails - just won't have context

      // Step 2.5: Generate dynamic tools based on allowed devices (Req 4.1, 4.2)
      let tools: readonly FunctionDeclaration[] | undefined;
      if (dynamicToolBuilder) {
        tools = dynamicToolBuilder.generateTools(allowedDevices);
      }

      // Step 3: Get recent action history for prompt
      const recentActions = sessionManager.getRecentActions();

      // Step 4: Build prompt with device state, action history, and light signals (Req 3.5, 4.1, 6.3)
      const lightSignals: readonly string[] | undefined =
        allowedDevices !== undefined
          ? (allowedDevices.find(d => d.type === 'LIGHT')?.signals ?? undefined)
          : undefined;
      const prompt = buildPrompt(deviceState, recentActions, lightSignals);

      // Debug: log prompt context and available tools
      console.log(`[AnalyzeHandler] recentActions.length=${recentActions.length}, tools=${tools?.map(t => t.name).join(',') ?? 'default'}`);

      // Step 5: Call AgentClient for AI analysis (Req 3.1, 3.2, 4.2)
      // Strip data URL prefix from base64 if present (Vertex AI expects raw base64)
      const cleanedImageData: ImageData = {
        base64: stripDataUrlPrefix(imageData.base64),
        mimeType: imageData.mimeType,
      };
      // Cast to DynamicAgentClientService to support optional tools parameter
      const dynamicAgentClient = agentClient as DynamicAgentClientService;
      const aiResult = await dynamicAgentClient.analyze(cleanedImageData, prompt, tools);
      if (!aiResult.ok) {
        return {
          ok: false,
          error: {
            code: 'AI_ERROR',
            message: aiResult.error.message,
            retryable: aiResult.error.retryable,
          },
        };
      }

      let actions = aiResult.value;

      // デバイス制御と非デバイスアクション(do_nothing/continue_monitoring)が混在時、デバイス制御を優先
      const deviceControlActions = actions.filter(a => isDeviceControlAction(a));
      if (deviceControlActions.length > 0 && deviceControlActions.length < actions.length) {
        actions = deviceControlActions;
      }

      // Step 6-7: 各アクションを順次ディスパッチ（1つ失敗しても残りを継続）
      let nextIntervalMs = Intervals.DEFAULT;
      const allActionResults: ActionResult[] = [];

      for (const action of actions) {
        // 重複チェック (Req 4.5)
        const isDuplicate = isDuplicateAction(action, recentActions);

        if (isDuplicate) {
          allActionResults.push({
            executed: false,
            message: `重複アクションをスキップしました: ${action.tool}`,
          });
        } else {
          const dispatchResult = await actionDispatcher.dispatch(action);
          if (!dispatchResult.ok) {
            // 1つの失敗で全体をエラーにしない（部分成功を許容）
            allActionResults.push({
              executed: false,
              message: `アクション実行失敗: ${dispatchResult.error.message}`,
            });
          } else {
            allActionResults.push({
              executed: dispatchResult.value.executed,
              message: dispatchResult.value.message,
              ...(dispatchResult.value.speechTexts ? { speechTexts: dispatchResult.value.speechTexts } : {}),
            });
            // いずれかが short なら short、nap なら NAP
            if (dispatchResult.value.nextInterval === 'short') {
              nextIntervalMs = Intervals.CONTINUE_MONITORING;
            } else if (dispatchResult.value.nextInterval === 'nap') {
              nextIntervalMs = Intervals.NAP;
            }
          }
        }

        // Step 8: Record each action in session history
        sessionManager.addRecentAction(action);
      }

      // Step 9: Log analysis result (Req 6.4)
      logAnalysisCycle(actions, allActionResults, deviceState);

      // Return successful result（後方互換: action/actionResultは先頭を返す）
      return {
        ok: true,
        value: {
          action: actions[0],
          actionResult: allActionResults[0] ?? { executed: false, message: 'No action' },
          actions,
          actionResults: allActionResults,
          nextIntervalMs,
          deviceState,
        },
      };
    },
  };
}
