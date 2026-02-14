/**
 * Tests for AES-256-GCM Encryption Service
 *
 * Validates encrypt/decrypt round-trip, invalid key rejection,
 * tampered data detection, and error handling.
 *
 * Requirements: 7.2, 7.3
 */
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createEncryptionService } from './encryption-service.js';

// =============================================================================
// Test Helpers
// =============================================================================

/** Generate a valid 32-byte encryption key */
function validKey(): Buffer {
  return randomBytes(32);
}

// =============================================================================
// Tests
// =============================================================================

describe('createEncryptionService', () => {
  it('should throw when created with a key shorter than 32 bytes', () => {
    const shortKey = randomBytes(16);
    expect(() => createEncryptionService(shortKey)).toThrow();
  });

  it('should throw when created with a key longer than 32 bytes', () => {
    const longKey = randomBytes(64);
    expect(() => createEncryptionService(longKey)).toThrow();
  });

  it('should succeed when created with an exactly 32-byte key', () => {
    const key = validKey();
    expect(() => createEncryptionService(key)).not.toThrow();
  });
});

describe('EncryptionService.encrypt', () => {
  it('should return a Base64-encoded string on success', () => {
    const service = createEncryptionService(validKey());
    const result = service.encrypt('hello world');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Verify it is valid Base64
      expect(() => Buffer.from(result.value, 'base64')).not.toThrow();
      const decoded = Buffer.from(result.value, 'base64');
      // Minimum size: 12 (IV) + 1 (at least 1 byte ciphertext) + 16 (authTag) = 29 bytes
      expect(decoded.length).toBeGreaterThanOrEqual(29);
    }
  });

  it('should produce different ciphertexts for the same plaintext (random IV)', () => {
    const service = createEncryptionService(validKey());
    const result1 = service.encrypt('same text');
    const result2 = service.encrypt('same text');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.value).not.toBe(result2.value);
    }
  });

  it('should handle empty string encryption', () => {
    const service = createEncryptionService(validKey());
    const result = service.encrypt('');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoded = Buffer.from(result.value, 'base64');
      // 12 (IV) + 0 (empty plaintext ciphertext) + 16 (authTag) = 28 bytes
      expect(decoded.length).toBe(28);
    }
  });

  it('should handle long plaintext encryption', () => {
    const service = createEncryptionService(validKey());
    const longText = 'a'.repeat(10000);
    const result = service.encrypt(longText);

    expect(result.ok).toBe(true);
  });

  it('should handle Unicode plaintext encryption', () => {
    const service = createEncryptionService(validKey());
    const result = service.encrypt('Nature Remo');

    expect(result.ok).toBe(true);
  });
});

describe('EncryptionService.decrypt', () => {
  it('should round-trip encrypt and decrypt successfully', () => {
    const service = createEncryptionService(validKey());
    const plaintext = 'ory_at_super_secret_token_12345';

    const encrypted = service.encrypt(plaintext);
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = service.decrypt(encrypted.value);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value).toBe(plaintext);
    }
  });

  it('should round-trip empty string correctly', () => {
    const service = createEncryptionService(validKey());
    const encrypted = service.encrypt('');
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = service.decrypt(encrypted.value);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value).toBe('');
    }
  });

  it('should round-trip Unicode text correctly', () => {
    const service = createEncryptionService(validKey());
    const original = 'Nature Remo';
    const encrypted = service.encrypt(original);
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = service.decrypt(encrypted.value);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value).toBe(original);
    }
  });

  it('should fail to decrypt with a different key', () => {
    const key1 = validKey();
    const key2 = validKey();
    const service1 = createEncryptionService(key1);
    const service2 = createEncryptionService(key2);

    const encrypted = service1.encrypt('secret data');
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = service2.decrypt(encrypted.value);
    expect(decrypted.ok).toBe(false);
    if (!decrypted.ok) {
      expect(decrypted.error.code).toBe('DECRYPTION_FAILED');
    }
  });

  it('should detect tampered ciphertext (modified byte)', () => {
    const service = createEncryptionService(validKey());
    const encrypted = service.encrypt('sensitive data');
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    // Tamper with the ciphertext: flip a byte in the middle
    const buf = Buffer.from(encrypted.value, 'base64');
    const tamperIndex = 15; // somewhere in the ciphertext portion (after 12-byte IV)
    buf[tamperIndex] = (buf[tamperIndex]! ^ 0xff) & 0xff;
    const tampered = buf.toString('base64');

    const decrypted = service.decrypt(tampered);
    expect(decrypted.ok).toBe(false);
    if (!decrypted.ok) {
      expect(decrypted.error.code).toBe('DECRYPTION_FAILED');
    }
  });

  it('should detect tampered auth tag', () => {
    const service = createEncryptionService(validKey());
    const encrypted = service.encrypt('authenticated data');
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    // Tamper with the auth tag (last 16 bytes)
    const buf = Buffer.from(encrypted.value, 'base64');
    buf[buf.length - 1] = (buf[buf.length - 1]! ^ 0xff) & 0xff;
    const tampered = buf.toString('base64');

    const decrypted = service.decrypt(tampered);
    expect(decrypted.ok).toBe(false);
    if (!decrypted.ok) {
      expect(decrypted.error.code).toBe('DECRYPTION_FAILED');
    }
  });

  it('should fail on invalid Base64 input', () => {
    const service = createEncryptionService(validKey());
    const decrypted = service.decrypt('!!!not-base64!!!');

    expect(decrypted.ok).toBe(false);
    if (!decrypted.ok) {
      expect(decrypted.error.code).toBe('DECRYPTION_FAILED');
    }
  });

  it('should fail on data too short to contain IV + authTag', () => {
    const service = createEncryptionService(validKey());
    // Only 10 bytes -- less than IV (12) + authTag (16)
    const shortData = randomBytes(10).toString('base64');

    const decrypted = service.decrypt(shortData);
    expect(decrypted.ok).toBe(false);
    if (!decrypted.ok) {
      expect(decrypted.error.code).toBe('DECRYPTION_FAILED');
    }
  });

  it('should fail on empty string input', () => {
    const service = createEncryptionService(validKey());
    const decrypted = service.decrypt('');

    expect(decrypted.ok).toBe(false);
    if (!decrypted.ok) {
      expect(decrypted.error.code).toBe('DECRYPTION_FAILED');
    }
  });
});
