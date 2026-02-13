/**
 * Response Parser - Function Callレスポンスの解析とAgentAction変換
 *
 * generateContentのレスポンスからFunctionCallPartを抽出し、
 * 型安全なAgentAction（discriminated union）に変換する。
 *
 * - FunctionCallPartの抽出
 * - FunctionCall（name + args）→ AgentAction変換（パラメータバリデーション付き）
 * - Function Callを含まないレスポンスのdo_nothingフォールバック
 * - 解析失敗時のPARSE_ERRORエラー分類
 *
 * Requirements: 2.3, 2.5
 */

import type { AgentAction, AgentError } from '../types/actions.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result型（ok/value/error パターン）
 */
type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * 抽出されたFunctionCall情報
 */
interface ExtractedFunctionCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/**
 * GenerateContentレスポンス型（Vertex AI SDK互換）
 */
interface GenerateContentResponseData {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
  }>;
}

// =============================================================================
// Constants
// =============================================================================

/** do_nothingフォールバック */
const DO_NOTHING_FALLBACK: ExtractedFunctionCall = {
  name: 'do_nothing',
  args: {},
};

// =============================================================================
// parseFunctionCallResponse
// =============================================================================

/**
 * GenerateContentレスポンスから全FunctionCallPartを抽出する（並列Function Calling対応）。
 *
 * Gemini APIは1レスポンスで複数のFunction Callを返す「並列Function Calling」をサポート。
 * Function Callを含まないレスポンス（テキストのみ、空candidates等）は空配列を返す。
 * do_nothingフォールバックは呼び出し側（agent-client）で行う。
 *
 * @param response - generateContentのレスポンスデータ
 * @returns ExtractedFunctionCall[]（全functionCallのname + args）
 */
export function parseFunctionCallResponse(
  response: GenerateContentResponseData
): Result<ExtractedFunctionCall[], AgentError> {
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    return { ok: true, value: [] };
  }

  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    return { ok: true, value: [] };
  }

  const parts = firstCandidate.content.parts;
  if (!parts || parts.length === 0) {
    return { ok: true, value: [] };
  }

  // 全FunctionCallPartを収集（並列Function Calling対応）
  const functionCalls: ExtractedFunctionCall[] = [];
  for (const part of parts) {
    if (part.functionCall) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      });
    }
  }

  return { ok: true, value: functionCalls };
}

// =============================================================================
// convertToAgentAction
// =============================================================================

/**
 * FunctionCall（name + args）を型安全なAgentAction（discriminated union）に変換する。
 *
 * 各Toolのパラメータをバリデーションし、不正な場合はPARSE_ERRORを返す。
 *
 * @param name - Tool名
 * @param args - Toolのパラメータ
 * @returns Result<AgentAction, AgentError>
 */
export function convertToAgentAction(
  name: string,
  args: Record<string, unknown>
): Result<AgentAction, AgentError> {
  const safeArgs = args ?? {};

  switch (name) {
    case 'light_control':
      return parseLightControlParams(safeArgs);

    case 'aircon_control':
      return parseAirconControlParams(safeArgs);

    case 'continue_monitoring': {
      const reason = typeof safeArgs['reason'] === 'string' ? safeArgs['reason'] : undefined;
      return {
        ok: true,
        value: { tool: 'continue_monitoring', params: reason ? { reason } : {} },
      };
    }

    case 'do_nothing': {
      const reason = typeof safeArgs['reason'] === 'string' ? safeArgs['reason'] : undefined;
      return {
        ok: true,
        value: { tool: 'do_nothing', params: reason ? { reason } : {} },
      };
    }

    case 'break_mode': {
      const reason = typeof safeArgs['reason'] === 'string' ? safeArgs['reason'] : undefined;
      return {
        ok: true,
        value: { tool: 'break_mode', params: reason ? { reason } : {} },
      };
    }

    case 'focus_mode': {
      const reason = typeof safeArgs['reason'] === 'string' ? safeArgs['reason'] : undefined;
      return {
        ok: true,
        value: { tool: 'focus_mode', params: reason ? { reason } : {} },
      };
    }

    case 'away_mode': {
      const reason = typeof safeArgs['reason'] === 'string' ? safeArgs['reason'] : undefined;
      return {
        ok: true,
        value: { tool: 'away_mode', params: reason ? { reason } : {} },
      };
    }

    case 'wake_mode': {
      const reason = typeof safeArgs['reason'] === 'string' ? safeArgs['reason'] : undefined;
      return {
        ok: true,
        value: { tool: 'wake_mode', params: reason ? { reason } : {} },
      };
    }

    default:
      // 動的ツール（Alexa, TV等）: パラメータをそのままパススルー
      return {
        ok: true,
        value: { tool: name, params: safeArgs } as AgentAction,
      };
  }
}

// =============================================================================
// Parameter Validation Helpers
// =============================================================================

/**
 * light_controlパラメータをバリデーションしてLightControlActionに変換する
 *
 * appliance_idはApplianceConfigで管理するため、パーサーでは不要。
 * argsにappliance_idが含まれていても無視する。
 */
function parseLightControlParams(
  args: Record<string, unknown>
): Result<AgentAction, AgentError> {
  const action = args['action'];

  if (typeof action !== 'string' || action.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: `light_control: actionは空でない文字列である必要があります（受信: ${String(action)}）`,
        retryable: false,
      },
    };
  }

  const reason = typeof args['reason'] === 'string' ? args['reason'] : undefined;

  return {
    ok: true,
    value: {
      tool: 'light_control',
      params: {
        action,
        ...(reason ? { reason } : {}),
      },
    },
  };
}

/**
 * aircon_controlパラメータをバリデーションしてAirconControlActionに変換する
 *
 * appliance_idはApplianceConfigで管理するため、パーサーでは不要。
 * argsにappliance_idが含まれていても無視する。
 */
function parseAirconControlParams(
  args: Record<string, unknown>
): Result<AgentAction, AgentError> {
  const temperature = args['temperature'];
  const mode = args['mode'];
  const reason = typeof args['reason'] === 'string' ? args['reason'] : undefined;

  if (typeof temperature !== 'number' || Number.isNaN(temperature)) {
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: `aircon_control: temperatureが必須です（number）（受信: ${String(temperature)}）`,
        retryable: false,
      },
    };
  }

  const params: { temperature: number; mode?: string; reason?: string } = {
    temperature,
  };

  if (typeof mode === 'string') {
    params.mode = mode;
  }

  if (reason) {
    params.reason = reason;
  }

  return {
    ok: true,
    value: {
      tool: 'aircon_control',
      params,
    },
  };
}
