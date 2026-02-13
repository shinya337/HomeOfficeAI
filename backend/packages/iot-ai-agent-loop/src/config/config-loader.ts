/**
 * ConfigLoader - 統合設定ローダー
 *
 * IoT AI Agent Loopに必要な環境変数を統合的に読み込みバリデーションする。
 * 既存のvertex-ai-visionモジュールのconfig-loaderパターンを踏襲し、
 * Result型で結果を返す。
 *
 * Requirements: 5.5, 6.1, 6.3
 */

import 'dotenv/config';

// =============================================================================
// Types
// =============================================================================

/**
 * Agent設定
 */
export interface AgentConfig {
  readonly projectId: string;
  readonly location: string;
  readonly model: string;
  readonly natureRemoToken: string;
}

/**
 * Agent設定エラーコード
 */
export type AgentConfigErrorCode = 'MISSING_PROJECT_ID' | 'MISSING_TOKEN';

/**
 * Agent設定エラー
 */
export interface AgentConfigError {
  readonly code: AgentConfigErrorCode;
  readonly message: string;
  readonly suggestion: string;
}

/**
 * Result型（ok/value/error パターン）
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// =============================================================================
// Constants
// =============================================================================

/** Default Vertex AI location/region */
const DEFAULT_LOCATION = 'us-central1';

/** Default Gemini model name */
const DEFAULT_MODEL = 'gemini-2.0-flash';

// =============================================================================
// Implementation
// =============================================================================

/**
 * 環境変数から統合設定を読み込む。
 *
 * 必須環境変数:
 * - GOOGLE_CLOUD_PROJECT: Google Cloud プロジェクトID
 * - NATURE_REMO_TOKEN: Nature Remo Cloud API トークン
 *
 * オプション環境変数:
 * - VERTEX_AI_LOCATION (デフォルト: us-central1): Vertex AI リージョン
 * - GEMINI_MODEL (デフォルト: gemini-2.0-flash): Gemini モデル名
 *
 * @returns Result<AgentConfig, AgentConfigError>
 */
export function loadAgentConfig(): Result<AgentConfig, AgentConfigError> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION ?? DEFAULT_LOCATION;
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const natureRemoToken = process.env.NATURE_REMO_TOKEN;

  // Validate GOOGLE_CLOUD_PROJECT (required)
  if (!projectId || projectId.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'MISSING_PROJECT_ID',
        message: 'GOOGLE_CLOUD_PROJECT 環境変数が設定されていません。',
        suggestion:
          '.env ファイルに GOOGLE_CLOUD_PROJECT=<your-project-id> を設定するか、' +
          '環境変数として export GOOGLE_CLOUD_PROJECT=<your-project-id> を実行してください。',
      },
    };
  }

  // Validate NATURE_REMO_TOKEN (required)
  if (!natureRemoToken || natureRemoToken.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'NATURE_REMO_TOKEN 環境変数が設定されていません。',
        suggestion:
          '.env ファイルに NATURE_REMO_TOKEN=<your-token> を設定するか、' +
          '環境変数として export NATURE_REMO_TOKEN=<your-token> を実行してください。' +
          ' トークンは https://home.nature.global/ から取得できます。',
      },
    };
  }

  return {
    ok: true,
    value: {
      projectId,
      location,
      model,
      natureRemoToken,
    },
  };
}
