/**
 * Result 型とエラー型定義
 *
 * 明示的なエラーハンドリングのための discriminated union パターンを提供。
 * 例外は予期せぬエラーのみに使用し、通常のエラーは Result 型で表現する。
 */

// =============================================================================
// Result 型
// =============================================================================

/**
 * 成功を表す Result 型
 */
export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * 失敗を表す Result 型
 */
export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * 成功または失敗を表す Result 型（discriminated union）
 */
export type Result<T, E> = Success<T> | Failure<E>;

/**
 * 成功 Result を作成するヘルパー関数
 */
export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

/**
 * 失敗 Result を作成するヘルパー関数
 */
export function err<E>(error: E): Failure<E> {
  return { ok: false, error };
}

/**
 * Result が成功かどうかを判定する型ガード
 */
export function isOk<T, E>(result: Result<T, E>): result is Success<T> {
  return result.ok;
}

/**
 * Result が失敗かどうかを判定する型ガード
 */
export function isErr<T, E>(result: Result<T, E>): result is Failure<E> {
  return !result.ok;
}

// =============================================================================
// ImageError 型
// =============================================================================

/**
 * 画像エラーコード
 */
export type ImageErrorCode = 'FILE_NOT_FOUND' | 'READ_ERROR' | 'UNSUPPORTED_FORMAT';

/**
 * 画像読み込みエラー
 *
 * - FILE_NOT_FOUND: 指定されたファイルパスが存在しない
 * - READ_ERROR: ファイルの読み込みに失敗した
 * - UNSUPPORTED_FORMAT: サポートされていない画像形式
 */
export interface ImageError {
  /** エラーコード */
  readonly code: ImageErrorCode;
  /** エラーメッセージ */
  readonly message: string;
  /** 対象ファイルパス */
  readonly filePath: string;
}

// =============================================================================
// VisionError 型
// =============================================================================

/**
 * Vision API エラーコード
 */
export type VisionErrorCode = 'AUTH_ERROR' | 'CONNECTION_ERROR' | 'TIMEOUT' | 'API_ERROR' | 'UNKNOWN';

/**
 * Vision API エラー
 *
 * - AUTH_ERROR: 認証エラー（ADC 未設定、権限不足等）
 * - CONNECTION_ERROR: ネットワーク接続エラー
 * - TIMEOUT: リクエストタイムアウト
 * - API_ERROR: API から返されたエラー
 * - UNKNOWN: 予期しないエラー
 */
export interface VisionError {
  /** エラーコード */
  readonly code: VisionErrorCode;
  /** エラーメッセージ */
  readonly message: string;
  /** リトライ可能かどうか */
  readonly retryable: boolean;
  /** 元のエラー詳細（デバッグ用） */
  readonly cause?: unknown;
}

// =============================================================================
// ConfigError 型
// =============================================================================

/**
 * 設定エラーコード
 */
export type ConfigErrorCode = 'PROJECT_ID_NOT_SET' | 'INVALID_CONFIG';

/**
 * 設定エラー
 *
 * - PROJECT_ID_NOT_SET: GOOGLE_CLOUD_PROJECT 環境変数が未設定
 * - INVALID_CONFIG: 設定値が無効
 */
export interface ConfigError {
  /** エラーコード */
  readonly code: ConfigErrorCode;
  /** エラーメッセージ */
  readonly message: string;
  /** 解決策の提案 */
  readonly suggestion: string;
}
