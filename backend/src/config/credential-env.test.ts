/**
 * Tests for Credential Environment Configuration
 *
 * Validates loading and validation of CREDENTIAL_ENCRYPTION_KEY
 * from environment variables.
 *
 * Requirements: 7.3
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadCredentialEncryptionKey,
  type CredentialEnvError,
} from './credential-env.js';

describe('loadCredentialEncryptionKey', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return a 32-byte Buffer when a valid Base64-encoded key is provided', () => {
    // Generate a valid 32-byte key encoded as Base64
    const validKey = Buffer.from('a'.repeat(32)).toString('base64');
    process.env.CREDENTIAL_ENCRYPTION_KEY = validKey;

    const result = loadCredentialEncryptionKey();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Buffer);
      expect(result.value.length).toBe(32);
    }
  });

  it('should return an error when CREDENTIAL_ENCRYPTION_KEY is not set', () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;

    const result = loadCredentialEncryptionKey();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_KEY');
      expect(result.error.message).toBeTruthy();
      expect(result.error.suggestion).toBeTruthy();
    }
  });

  it('should return an error when CREDENTIAL_ENCRYPTION_KEY is an empty string', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = '';

    const result = loadCredentialEncryptionKey();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_KEY');
    }
  });

  it('should return an error when CREDENTIAL_ENCRYPTION_KEY is whitespace only', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = '   ';

    const result = loadCredentialEncryptionKey();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_KEY');
    }
  });

  it('should return an error when the decoded key is not exactly 32 bytes', () => {
    // 16 bytes instead of 32
    const shortKey = Buffer.from('a'.repeat(16)).toString('base64');
    process.env.CREDENTIAL_ENCRYPTION_KEY = shortKey;

    const result = loadCredentialEncryptionKey();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_KEY_LENGTH');
      expect(result.error.message).toContain('32');
    }
  });

  it('should return an error when the key is not valid Base64', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = '!!!not-valid-base64!!!';

    const result = loadCredentialEncryptionKey();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Invalid base64 may decode to wrong length or be caught as invalid
      expect(['INVALID_KEY_LENGTH', 'INVALID_BASE64']).toContain(
        result.error.code
      );
    }
  });

  it('should accept a properly generated 32-byte random key', async () => {
    // Simulate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    const { randomBytes } = await import('node:crypto');
    const key = randomBytes(32).toString('base64');
    process.env.CREDENTIAL_ENCRYPTION_KEY = key;

    const result = loadCredentialEncryptionKey();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(32);
    }
  });
});
