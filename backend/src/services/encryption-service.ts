/**
 * AES-256-GCM Encryption Service
 *
 * Provides server-side encryption and decryption for IoT credentials
 * stored in Firestore. Uses AES-256-GCM with random IV for authenticated
 * encryption.
 *
 * Format: [IV (12 bytes)][ciphertext][authTag (16 bytes)] -> Base64
 *
 * Requirements: 7.2, 7.3
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Result } from '../types/action-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Error codes for encryption operations
 */
export type EncryptionError =
  | { readonly code: 'ENCRYPTION_FAILED'; readonly message: string }
  | { readonly code: 'DECRYPTION_FAILED'; readonly message: string }
  | { readonly code: 'INVALID_KEY'; readonly message: string };

/**
 * Encryption service interface for AES-256-GCM operations
 */
export interface EncryptionService {
  encrypt(plaintext: string): Result<string, EncryptionError>;
  decrypt(encryptedData: string): Result<string, EncryptionError>;
}

// =============================================================================
// Constants
// =============================================================================

/** AES-256-GCM algorithm identifier */
const ALGORITHM = 'aes-256-gcm' as const;

/** IV length in bytes (recommended for GCM) */
const IV_LENGTH = 12;

/** Auth tag length in bytes */
const AUTH_TAG_LENGTH = 16;

/** Required encryption key length in bytes for AES-256 */
const REQUIRED_KEY_LENGTH = 32;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create an AES-256-GCM encryption service.
 *
 * @param encryptionKey - A 32-byte Buffer used as the encryption key
 * @returns EncryptionService instance
 * @throws Error if the key is not exactly 32 bytes
 */
export function createEncryptionService(
  encryptionKey: Buffer
): EncryptionService {
  if (encryptionKey.length !== REQUIRED_KEY_LENGTH) {
    throw new Error(
      `暗号化キーは${REQUIRED_KEY_LENGTH}バイトである必要があります。` +
        `提供されたキーは${encryptionKey.length}バイトです。`
    );
  }

  function encrypt(plaintext: string): Result<string, EncryptionError> {
    try {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      // Combine: [IV][ciphertext][authTag]
      const combined = Buffer.concat([iv, encrypted, authTag]);

      return { ok: true, value: combined.toString('base64') };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'ENCRYPTION_FAILED',
          message:
            error instanceof Error
              ? `暗号化に失敗しました: ${error.message}`
              : '暗号化に失敗しました: 不明なエラー',
        },
      };
    }
  }

  function decrypt(encryptedData: string): Result<string, EncryptionError> {
    try {
      if (encryptedData === '') {
        return {
          ok: false,
          error: {
            code: 'DECRYPTION_FAILED',
            message: '復号に失敗しました: 入力データが空です。',
          },
        };
      }

      const combined = Buffer.from(encryptedData, 'base64');

      // Minimum size: IV (12) + authTag (16) = 28 bytes (0 bytes ciphertext for empty plaintext)
      const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
      if (combined.length < minLength) {
        return {
          ok: false,
          error: {
            code: 'DECRYPTION_FAILED',
            message: `復号に失敗しました: データが短すぎます（${combined.length}バイト、最低${minLength}バイト必要）。`,
          },
        };
      }

      // Split: [IV (12)][ciphertext (variable)][authTag (16)]
      const iv = combined.subarray(0, IV_LENGTH);
      const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
      const ciphertext = combined.subarray(
        IV_LENGTH,
        combined.length - AUTH_TAG_LENGTH
      );

      const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return { ok: true, value: decrypted.toString('utf8') };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DECRYPTION_FAILED',
          message:
            error instanceof Error
              ? `復号に失敗しました: ${error.message}`
              : '復号に失敗しました: 不明なエラー',
        },
      };
    }
  }

  return { encrypt, decrypt };
}
