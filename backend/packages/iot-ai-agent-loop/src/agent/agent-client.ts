/**
 * AgentClient - Vertex AI Gemini API Function Calling クライアント
 *
 * 画像データとシステムプロンプトをVertex AI Gemini APIに送信し、
 * Function Callingでエージェントのアクションを選択させる。
 *
 * - GenerativeModelをtoolsとtoolConfig（FunctionCallingMode.ANY）で初期化
 * - 画像データ（Base64）とシステムプロンプトをgenerateContentに送信
 * - Function Callレスポンスを型安全なAgentActionに変換（response-parser経由）
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1
 */

import {
  VertexAI,
  FunctionCallingMode,
  type FunctionDeclaration,
} from '@google-cloud/vertexai';
import { getToolDeclarations } from '../tools/tool-definitions.js';
import { parseFunctionCallResponse, convertToAgentAction } from './response-parser.js';
import type { AgentAction, AgentError } from '../types/actions.js';
import type { ImageData } from '../../../vertex-ai-vision/src/types/models.js';

// =============================================================================
// Types
// =============================================================================

/**
 * AgentClient設定
 */
export interface AgentClientConfig {
  readonly projectId: string;
  readonly location: string;
  readonly model: string;
}

/**
 * Result型（ok/value/error パターン）
 */
type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * GenerativeModel インターフェース（DI用）
 */
export interface GenerativeModelInterface {
  generateContent(request: unknown): Promise<GenerateContentResponse>;
}

/**
 * generateContent レスポンス型
 */
interface GenerateContentResponse {
  response: {
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
  };
}

/**
 * AgentClientService インターフェース
 *
 * analyze() は並列Function Calling対応で AgentAction[] を返す。
 * Gemini APIが1レスポンスで返す複数のFunction Callを全て変換する。
 */
export interface AgentClientService {
  analyze(
    imageData: ImageData,
    systemPrompt: string,
    tools?: readonly FunctionDeclaration[]
  ): Promise<Result<AgentAction[], AgentError>>;
}

// =============================================================================
// Constants
// =============================================================================

/** 認証エラーコード */
const AUTH_ERROR_CODES = new Set([
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'FORBIDDEN',
  'INVALID_API_KEY',
]);

// VALID_TOOL_NAMES は response-parser.ts に移動済み

// =============================================================================
// Error Classification
// =============================================================================

/**
 * エラーをAgentErrorに分類する
 */
function classifyError(error: unknown): AgentError {
  if (!(error instanceof Error)) {
    return {
      code: 'UNKNOWN',
      message: String(error),
      retryable: false,
    };
  }

  const errorCode = (error as Error & { code?: string }).code;
  const errorName = error.name;

  // タイムアウト
  if (errorName === 'AbortError' || errorCode === 'ABORT_ERR') {
    return {
      code: 'TIMEOUT',
      message: `リクエストがタイムアウトしました: ${error.message}`,
      retryable: true,
    };
  }

  // 認証エラー
  if (errorCode && AUTH_ERROR_CODES.has(errorCode)) {
    return {
      code: 'AUTH_ERROR',
      message: `認証エラー: ${error.message}`,
      retryable: false,
    };
  }

  // API エラー
  return {
    code: 'API_ERROR',
    message: `APIエラー: ${error.message}`,
    retryable: true,
  };
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * AgentClientを生成する（DI対応）
 *
 * @param config - AgentClient設定
 * @param model - テスト用のGenerativeModelインスタンス（省略時はVertexAI SDKで生成）
 * @returns AgentClientService
 */
export function createAgentClient(
  config: AgentClientConfig,
  model?: GenerativeModelInterface
): AgentClientService {
  // モデル初期化: DI or SDK
  let generativeModel: GenerativeModelInterface;
  if (model) {
    generativeModel = model;
  } else {
    const vertexAI = new VertexAI({
      project: config.projectId,
      location: config.location,
    });
    const toolDeclarations = getToolDeclarations();
    generativeModel = vertexAI.getGenerativeModel({
      model: config.model,
      tools: [{ functionDeclarations: toolDeclarations }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.ANY,
        },
      },
    });
  }

  return {
    async analyze(
      imageData: ImageData,
      systemPrompt: string,
      tools?: readonly FunctionDeclaration[]
    ): Promise<Result<AgentAction[], AgentError>> {
      try {
        // generateContent リクエスト構築 (Req 2.1, 2.2)
        const request: Record<string, unknown> = {
          contents: [
            {
              role: 'user' as const,
              parts: [
                { text: systemPrompt },
                {
                  inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.base64,
                  },
                },
              ],
            },
          ],
        };

        // 動的ツールが渡された場合、per-requestでtools+toolConfigを設定 (Req 4.2)
        if (tools && tools.length > 0) {
          request.tools = [{ functionDeclarations: tools }];
          request.toolConfig = {
            functionCallingConfig: { mode: FunctionCallingMode.ANY },
          };
        }

        const response = await generativeModel.generateContent(request);

        // レスポンスから全FunctionCallを抽出（並列Function Calling対応）(Req 2.3)
        const parseResult = parseFunctionCallResponse(response.response);
        if (!parseResult.ok) {
          return parseResult;
        }

        // 空配列の場合は do_nothing フォールバック (Req 2.5)
        const extractedCalls = parseResult.value;
        if (extractedCalls.length === 0) {
          return { ok: true, value: [{ tool: 'do_nothing', params: {} }] };
        }

        // 全FunctionCallを型安全なAgentActionに変換 (Req 2.3, 2.5)
        const actions: AgentAction[] = [];
        for (const { name, args } of extractedCalls) {
          const actionResult = convertToAgentAction(name, args);
          if (!actionResult.ok) {
            return actionResult as Result<AgentAction[], AgentError>;
          }
          actions.push(actionResult.value);
        }

        return { ok: true, value: actions };
      } catch (error) {
        return {
          ok: false,
          error: classifyError(error),
        };
      }
    },
  };
}
