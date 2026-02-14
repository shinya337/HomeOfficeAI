/**
 * Credential Environment Configuration
 *
 * Loads and validates the CREDENTIAL_ENCRYPTION_KEY environment variable
 * used for AES-256-GCM encryption of IoT credentials stored in Firestore.
 *
 * The key must be a Base64-encoded 32-byte value.
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Requirements: 7.3
 */
import type { Result } from '../types/action-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Error codes for credential environment configuration
 */
export type CredentialEnvErrorCode =
  | 'MISSING_KEY'
  | 'INVALID_KEY_LENGTH'
  | 'INVALID_BASE64';

/**
 * Error returned when credential encryption key validation fails
 */
export interface CredentialEnvError {
  readonly code: CredentialEnvErrorCode;
  readonly message: string;
  readonly suggestion: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Required key length in bytes for AES-256 */
const REQUIRED_KEY_LENGTH = 32;

/** Environment variable name */
const ENV_KEY_NAME = 'CREDENTIAL_ENCRYPTION_KEY';

// =============================================================================
// Implementation
// =============================================================================

/**
 * Load and validate the credential encryption key from environment variables.
 *
 * Expects CREDENTIAL_ENCRYPTION_KEY to be set as a Base64-encoded 32-byte value.
 *
 * @returns Result with a 32-byte Buffer on success, CredentialEnvError on failure
 */
export function loadCredentialEncryptionKey(): Result<Buffer, CredentialEnvError> {
  const rawValue = process.env[ENV_KEY_NAME];

  // Check if the key is set and non-empty
  if (rawValue === undefined || rawValue.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'MISSING_KEY',
        message: `${ENV_KEY_NAME} 環境変数が設定されていません。`,
        suggestion:
          `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" で生成し、` +
          `.env ファイルに ${ENV_KEY_NAME}=<generated-key> を設定してください。`,
      },
    };
  }

  // Validate Base64 format
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  const trimmedValue = rawValue.trim();
  if (!base64Regex.test(trimmedValue)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_BASE64',
        message: `${ENV_KEY_NAME} が有効なBase64文字列ではありません。`,
        suggestion:
          `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" で正しい形式のキーを生成してください。`,
      },
    };
  }

  // Decode and validate length
  const keyBuffer = Buffer.from(trimmedValue, 'base64');

  if (keyBuffer.length !== REQUIRED_KEY_LENGTH) {
    return {
      ok: false,
      error: {
        code: 'INVALID_KEY_LENGTH',
        message: `${ENV_KEY_NAME} のデコード後の長さが ${keyBuffer.length} バイトです。${REQUIRED_KEY_LENGTH} バイトである必要があります。`,
        suggestion:
          `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" で正確に32バイトのキーを生成してください。`,
      },
    };
  }

  return {
    ok: true,
    value: keyBuffer,
  };
}
