/**
 * Configuration Loader for Nature Remo API Experiment
 *
 * Loads environment variables and provides configuration to the application.
 * Implements Result pattern for explicit error handling.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import 'dotenv/config';

/**
 * Application configuration
 */
export interface Config {
  natureRemoToken: string;
}

/**
 * Configuration error with suggestion for resolution
 */
export interface ConfigError {
  code: 'TOKEN_NOT_SET' | 'ENV_FILE_NOT_FOUND';
  message: string;
  suggestion: string;
}

/**
 * Result type for explicit success/failure handling
 */
export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Load application configuration from environment variables.
 *
 * @returns Result with Config on success, ConfigError on failure
 */
export function loadConfig(): Result<Config, ConfigError> {
  const rawToken = process.env['NATURE_REMO_TOKEN'];
  const token = rawToken?.trim();

  if (!token) {
    return {
      success: false,
      error: {
        code: 'TOKEN_NOT_SET',
        message: 'NATURE_REMO_TOKEN 環境変数が設定されていません',
        suggestion: 'backend/.env.sample を参照して .env ファイルを作成してください',
      },
    };
  }

  return {
    success: true,
    data: {
      natureRemoToken: token,
    },
  };
}
