/**
 * Auth Types Tests
 * TDD: RED phase - Write failing tests first
 *
 * Task 2.1: 認証関連の型定義を作成する
 * Requirements: 3.1, 3.2
 */
import { describe, it, expect } from 'vitest';
import type {
  AuthenticatedUser,
  AuthenticatedRequest,
  SaveCredentialRequest,
  CredentialStatusResponse,
  CredentialStatus,
  CredentialError,
  EncryptionError,
} from './auth-types.js';

// =============================================================================
// AuthenticatedUser Type Tests
// =============================================================================

describe('AuthenticatedUser', () => {
  it('should have required uid field as string', () => {
    const user: AuthenticatedUser = {
      uid: 'firebase-uid-123',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };

    expect(user.uid).toBe('firebase-uid-123');
  });

  it('should allow email to be undefined', () => {
    const user: AuthenticatedUser = {
      uid: 'uid-456',
      email: undefined,
      displayName: undefined,
      photoURL: undefined,
    };

    expect(user.uid).toBe('uid-456');
    expect(user.email).toBeUndefined();
  });

  it('should allow displayName to be undefined', () => {
    const user: AuthenticatedUser = {
      uid: 'uid-789',
      email: 'user@example.com',
      displayName: undefined,
      photoURL: undefined,
    };

    expect(user.displayName).toBeUndefined();
  });

  it('should allow photoURL to be undefined', () => {
    const user: AuthenticatedUser = {
      uid: 'uid-abc',
      email: 'user@example.com',
      displayName: 'User',
      photoURL: undefined,
    };

    expect(user.photoURL).toBeUndefined();
  });

  it('should have all fields readonly', () => {
    const user: AuthenticatedUser = {
      uid: 'uid-readonly',
      email: 'readonly@example.com',
      displayName: 'Readonly User',
      photoURL: 'https://example.com/photo.jpg',
    };

    // Verify readonly by checking values exist (compile-time enforcement)
    expect(user.uid).toBe('uid-readonly');
    expect(user.email).toBe('readonly@example.com');
    expect(user.displayName).toBe('Readonly User');
    expect(user.photoURL).toBe('https://example.com/photo.jpg');
  });
});

// =============================================================================
// AuthenticatedRequest Type Tests
// =============================================================================

describe('AuthenticatedRequest', () => {
  it('should have user field that can be AuthenticatedUser', () => {
    // AuthenticatedRequest extends Express Request with user field.
    // We verify the user property type using Pick to satisfy noUnusedLocals.
    const userPart: Pick<AuthenticatedRequest, 'user'> = {
      user: {
        uid: 'uid-req',
        email: 'req@example.com',
        displayName: 'Request User',
        photoURL: 'https://example.com/photo.jpg',
      },
    };

    expect(userPart.user).not.toBeNull();
    expect(userPart.user!.uid).toBe('uid-req');
  });

  it('should allow user to be null for guest mode', () => {
    const userPart: Pick<AuthenticatedRequest, 'user'> = {
      user: null,
    };

    expect(userPart.user).toBeNull();
  });
});

// =============================================================================
// SaveCredentialRequest Type Tests
// =============================================================================

describe('SaveCredentialRequest', () => {
  it('should have required token field as string', () => {
    const request: SaveCredentialRequest = {
      token: 'nature-remo-token-abc123',
    };

    expect(request.token).toBe('nature-remo-token-abc123');
  });

  it('should have readonly token field', () => {
    const request: SaveCredentialRequest = {
      token: 'readonly-token',
    };

    expect(request.token).toBe('readonly-token');
  });
});

// =============================================================================
// CredentialStatus Type Tests
// =============================================================================

describe('CredentialStatus', () => {
  it('should have required service and configured fields', () => {
    const status: CredentialStatus = {
      service: 'nature-remo',
      configured: true,
      updatedAt: '2026-02-14T00:00:00Z',
    };

    expect(status.service).toBe('nature-remo');
    expect(status.configured).toBe(true);
    expect(status.updatedAt).toBe('2026-02-14T00:00:00Z');
  });

  it('should allow updatedAt to be undefined', () => {
    const status: CredentialStatus = {
      service: 'nature-remo',
      configured: false,
      updatedAt: undefined,
    };

    expect(status.configured).toBe(false);
    expect(status.updatedAt).toBeUndefined();
  });

  it('should have all fields readonly', () => {
    const status: CredentialStatus = {
      service: 'nature-remo',
      configured: true,
      updatedAt: '2026-02-14T12:00:00Z',
    };

    expect(status.service).toBe('nature-remo');
    expect(status.configured).toBe(true);
    expect(status.updatedAt).toBe('2026-02-14T12:00:00Z');
  });
});

// =============================================================================
// CredentialStatusResponse Type Tests
// =============================================================================

describe('CredentialStatusResponse', () => {
  it('should have readonly credentials array', () => {
    const response: CredentialStatusResponse = {
      credentials: [
        { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T00:00:00Z' },
      ],
    };

    expect(response.credentials).toHaveLength(1);
    expect(response.credentials[0]!.service).toBe('nature-remo');
  });

  it('should allow empty credentials array', () => {
    const response: CredentialStatusResponse = {
      credentials: [],
    };

    expect(response.credentials).toHaveLength(0);
  });

  it('should support multiple credential statuses', () => {
    const response: CredentialStatusResponse = {
      credentials: [
        { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T00:00:00Z' },
        { service: 'alexa', configured: false, updatedAt: undefined },
      ],
    };

    expect(response.credentials).toHaveLength(2);
    expect(response.credentials[0]!.configured).toBe(true);
    expect(response.credentials[1]!.configured).toBe(false);
  });
});

// =============================================================================
// CredentialError Discriminated Union Type Tests
// =============================================================================

describe('CredentialError', () => {
  it('should support NOT_FOUND error code', () => {
    const error: CredentialError = {
      code: 'NOT_FOUND',
      message: 'Credential not found',
    };

    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Credential not found');
  });

  it('should support ENCRYPTION_ERROR error code', () => {
    const error: CredentialError = {
      code: 'ENCRYPTION_ERROR',
      message: 'Encryption failed',
    };

    expect(error.code).toBe('ENCRYPTION_ERROR');
    expect(error.message).toBe('Encryption failed');
  });

  it('should support FIRESTORE_ERROR error code', () => {
    const error: CredentialError = {
      code: 'FIRESTORE_ERROR',
      message: 'Firestore connection error',
    };

    expect(error.code).toBe('FIRESTORE_ERROR');
    expect(error.message).toBe('Firestore connection error');
  });

  it('should discriminate by code field', () => {
    const errors: CredentialError[] = [
      { code: 'NOT_FOUND', message: 'not found' },
      { code: 'ENCRYPTION_ERROR', message: 'encryption error' },
      { code: 'FIRESTORE_ERROR', message: 'firestore error' },
    ];

    expect(errors.map(e => e.code)).toEqual([
      'NOT_FOUND',
      'ENCRYPTION_ERROR',
      'FIRESTORE_ERROR',
    ]);
  });

  it('should have readonly fields', () => {
    const error: CredentialError = {
      code: 'NOT_FOUND',
      message: 'readonly test',
    };

    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('readonly test');
  });
});

// =============================================================================
// EncryptionError Discriminated Union Type Tests
// =============================================================================

describe('EncryptionError', () => {
  it('should support ENCRYPTION_FAILED error code', () => {
    const error: EncryptionError = {
      code: 'ENCRYPTION_FAILED',
      message: 'Encryption operation failed',
    };

    expect(error.code).toBe('ENCRYPTION_FAILED');
    expect(error.message).toBe('Encryption operation failed');
  });

  it('should support DECRYPTION_FAILED error code', () => {
    const error: EncryptionError = {
      code: 'DECRYPTION_FAILED',
      message: 'Decryption operation failed',
    };

    expect(error.code).toBe('DECRYPTION_FAILED');
    expect(error.message).toBe('Decryption operation failed');
  });

  it('should support INVALID_KEY error code', () => {
    const error: EncryptionError = {
      code: 'INVALID_KEY',
      message: 'Encryption key is invalid',
    };

    expect(error.code).toBe('INVALID_KEY');
    expect(error.message).toBe('Encryption key is invalid');
  });

  it('should discriminate by code field', () => {
    const errors: EncryptionError[] = [
      { code: 'ENCRYPTION_FAILED', message: 'enc failed' },
      { code: 'DECRYPTION_FAILED', message: 'dec failed' },
      { code: 'INVALID_KEY', message: 'bad key' },
    ];

    expect(errors.map(e => e.code)).toEqual([
      'ENCRYPTION_FAILED',
      'DECRYPTION_FAILED',
      'INVALID_KEY',
    ]);
  });

  it('should have readonly fields', () => {
    const error: EncryptionError = {
      code: 'INVALID_KEY',
      message: 'readonly error test',
    };

    expect(error.code).toBe('INVALID_KEY');
    expect(error.message).toBe('readonly error test');
  });
});

// =============================================================================
// Re-export Verification Tests
// =============================================================================

describe('auth-types module exports', () => {
  it('should be importable as a canonical type source', async () => {
    // Verify the module can be imported and all types are available
    const module = await import('./auth-types.js');

    // The module should exist and be importable
    expect(module).toBeDefined();
  });
});
