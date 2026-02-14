/**
 * Credential Service Tests
 *
 * Tests for Firestore-based credential CRUD operations with encryption integration.
 * Uses Firestore mocks to verify:
 * - Token save (encrypt then write to Firestore)
 * - Token retrieval (read from Firestore then decrypt)
 * - Status retrieval (return configured/unconfigured without token values)
 * - Token deletion (delete specific credential document)
 * - Full user cleanup (delete all credentials subcollection + user document)
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 7.2, 7.4, 7.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCredentialService } from './credential-service.js';
import type { EncryptionService } from './encryption-service.js';

// =============================================================================
// Firestore Mock Setup
// =============================================================================

function createMockFirestore() {
  const storage = new Map<string, Record<string, unknown>>();

  const mockDocRef = (path: string) => ({
    get: vi.fn(async () => {
      const data = storage.get(path);
      return {
        exists: data !== undefined,
        data: () => data,
      };
    }),
    set: vi.fn(async (data: Record<string, unknown>, _options?: unknown) => {
      storage.set(path, { ...data });
    }),
    delete: vi.fn(async () => {
      storage.delete(path);
    }),
  });

  const mockCollectionRef = (basePath: string) => ({
    get: vi.fn(async () => {
      const docs: Array<{
        id: string;
        ref: ReturnType<typeof mockDocRef>;
        data: () => Record<string, unknown>;
      }> = [];
      for (const [key, value] of storage.entries()) {
        if (key.startsWith(basePath + '/') && key.split('/').length === basePath.split('/').length + 1) {
          const id = key.split('/').pop()!;
          docs.push({
            id,
            ref: mockDocRef(key),
            data: () => value,
          });
        }
      }
      return { docs, empty: docs.length === 0 };
    }),
  });

  const firestore = {
    collection: vi.fn((collectionPath: string) => ({
      doc: vi.fn((docId: string) => {
        const fullPath = `${collectionPath}/${docId}`;
        const ref = mockDocRef(fullPath);
        return {
          ...ref,
          collection: vi.fn((subCollectionPath: string) => {
            const subPath = `${fullPath}/${subCollectionPath}`;
            return {
              ...mockCollectionRef(subPath),
              doc: vi.fn((subDocId: string) => mockDocRef(`${subPath}/${subDocId}`)),
            };
          }),
        };
      }),
    })),
    _storage: storage,
  };

  return firestore as unknown as FirebaseFirestore.Firestore & { _storage: Map<string, Record<string, unknown>> };
}

// =============================================================================
// Encryption Service Mock
// =============================================================================

function createMockEncryptionService(): EncryptionService {
  return {
    encrypt: vi.fn((plaintext: string) => ({
      ok: true as const,
      value: `encrypted:${plaintext}`,
    })),
    decrypt: vi.fn((encryptedData: string) => {
      if (encryptedData.startsWith('encrypted:')) {
        return {
          ok: true as const,
          value: encryptedData.replace('encrypted:', ''),
        };
      }
      return {
        ok: false as const,
        error: {
          code: 'DECRYPTION_FAILED' as const,
          message: 'Failed to decrypt',
        },
      };
    }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('credential-service', () => {
  let firestore: ReturnType<typeof createMockFirestore>;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    firestore = createMockFirestore();
    encryptionService = createMockEncryptionService();
  });

  describe('createCredentialService', () => {
    it('should return an object with all required methods', () => {
      const service = createCredentialService({ firestore, encryptionService });

      expect(service).toBeDefined();
      expect(typeof service.saveToken).toBe('function');
      expect(typeof service.getDecryptedToken).toBe('function');
      expect(typeof service.getStatus).toBe('function');
      expect(typeof service.deleteToken).toBe('function');
      expect(typeof service.deleteAllForUser).toBe('function');
    });
  });

  describe('saveToken', () => {
    it('should encrypt the token and save to Firestore', async () => {
      const service = createCredentialService({ firestore, encryptionService });
      const result = await service.saveToken('user-123', 'nature-remo', 'my-secret-token');

      expect(result.ok).toBe(true);
      expect(encryptionService.encrypt).toHaveBeenCalledWith('my-secret-token');

      // Verify the encrypted value was stored in Firestore
      const storedData = firestore._storage.get('users/user-123/credentials/nature-remo');
      expect(storedData).toBeDefined();
      expect(storedData!['encryptedToken']).toBe('encrypted:my-secret-token');
      expect(storedData!['updatedAt']).toBeDefined();
    });

    it('should return ENCRYPTION_ERROR when encryption fails', async () => {
      const failingEncryption: EncryptionService = {
        encrypt: vi.fn(() => ({
          ok: false as const,
          error: {
            code: 'ENCRYPTION_FAILED' as const,
            message: 'Key invalid',
          },
        })),
        decrypt: vi.fn(() => ({
          ok: true as const,
          value: '',
        })),
      };

      const service = createCredentialService({
        firestore,
        encryptionService: failingEncryption,
      });

      const result = await service.saveToken('user-123', 'nature-remo', 'my-token');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENCRYPTION_ERROR');
      }
    });

    it('should return FIRESTORE_ERROR when Firestore write fails', async () => {
      const brokenFirestore = createMockFirestore();
      // Override collection to throw on set
      brokenFirestore.collection = vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({
              set: vi.fn(async () => {
                throw new Error('Firestore connection error');
              }),
              get: vi.fn(async () => ({ exists: false, data: () => undefined })),
              delete: vi.fn(),
            })),
          })),
        })),
      })) as unknown as typeof brokenFirestore.collection;

      const service = createCredentialService({
        firestore: brokenFirestore,
        encryptionService,
      });

      const result = await service.saveToken('user-123', 'nature-remo', 'my-token');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FIRESTORE_ERROR');
      }
    });

    it('should overwrite existing token when saving again', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      await service.saveToken('user-123', 'nature-remo', 'first-token');
      await service.saveToken('user-123', 'nature-remo', 'second-token');

      const storedData = firestore._storage.get('users/user-123/credentials/nature-remo');
      expect(storedData!['encryptedToken']).toBe('encrypted:second-token');
    });
  });

  describe('getDecryptedToken', () => {
    it('should read from Firestore and decrypt the token', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      // First save a token
      await service.saveToken('user-123', 'nature-remo', 'my-secret-token');

      // Then retrieve it
      const result = await service.getDecryptedToken('user-123', 'nature-remo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('my-secret-token');
      }
    });

    it('should return NOT_FOUND when credential does not exist', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      const result = await service.getDecryptedToken('user-123', 'nature-remo');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return ENCRYPTION_ERROR when decryption fails', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      // Directly store invalid encrypted data in Firestore
      firestore._storage.set('users/user-123/credentials/nature-remo', {
        encryptedToken: 'invalid-data-not-encrypted',
        updatedAt: new Date().toISOString(),
      });

      const result = await service.getDecryptedToken('user-123', 'nature-remo');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ENCRYPTION_ERROR');
      }
    });

    it('should return FIRESTORE_ERROR when Firestore read fails', async () => {
      const brokenFirestore = createMockFirestore();
      brokenFirestore.collection = vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({
              get: vi.fn(async () => {
                throw new Error('Firestore read error');
              }),
              set: vi.fn(),
              delete: vi.fn(),
            })),
          })),
        })),
      })) as unknown as typeof brokenFirestore.collection;

      const service = createCredentialService({
        firestore: brokenFirestore,
        encryptionService,
      });

      const result = await service.getDecryptedToken('user-123', 'nature-remo');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FIRESTORE_ERROR');
      }
    });
  });

  describe('getStatus', () => {
    it('should return empty array when no credentials exist', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      const result = await service.getStatus('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return configured status for saved credentials without token values', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      await service.saveToken('user-123', 'nature-remo', 'my-token');

      const result = await service.getStatus('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.service).toBe('nature-remo');
        expect(result.value[0]!.configured).toBe(true);
        expect(result.value[0]!.updatedAt).toBeDefined();
        // Verify that the token value is NOT included in the status
        const statusObj = result.value[0] as unknown as Record<string, unknown>;
        expect(statusObj['token']).toBeUndefined();
        expect(statusObj['encryptedToken']).toBeUndefined();
      }
    });

    it('should return multiple credential statuses', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      await service.saveToken('user-123', 'nature-remo', 'token-1');
      await service.saveToken('user-123', 'alexa', 'token-2');

      const result = await service.getStatus('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        const services = result.value.map((s) => s.service).sort();
        expect(services).toEqual(['alexa', 'nature-remo']);
        expect(result.value.every((s) => s.configured === true)).toBe(true);
      }
    });

    it('should return FIRESTORE_ERROR when Firestore list fails', async () => {
      const brokenFirestore = createMockFirestore();
      brokenFirestore.collection = vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            get: vi.fn(async () => {
              throw new Error('Firestore list error');
            }),
            doc: vi.fn(() => ({
              get: vi.fn(),
              set: vi.fn(),
              delete: vi.fn(),
            })),
          })),
        })),
      })) as unknown as typeof brokenFirestore.collection;

      const service = createCredentialService({
        firestore: brokenFirestore,
        encryptionService,
      });

      const result = await service.getStatus('user-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FIRESTORE_ERROR');
      }
    });
  });

  describe('deleteToken', () => {
    it('should delete a specific credential document', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      await service.saveToken('user-123', 'nature-remo', 'my-token');
      expect(firestore._storage.has('users/user-123/credentials/nature-remo')).toBe(true);

      const result = await service.deleteToken('user-123', 'nature-remo');

      expect(result.ok).toBe(true);
      expect(firestore._storage.has('users/user-123/credentials/nature-remo')).toBe(false);
    });

    it('should succeed even when credential does not exist (idempotent)', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      const result = await service.deleteToken('user-123', 'nature-remo');

      expect(result.ok).toBe(true);
    });

    it('should return FIRESTORE_ERROR when Firestore delete fails', async () => {
      const brokenFirestore = createMockFirestore();
      brokenFirestore.collection = vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({
              delete: vi.fn(async () => {
                throw new Error('Firestore delete error');
              }),
              get: vi.fn(),
              set: vi.fn(),
            })),
          })),
        })),
      })) as unknown as typeof brokenFirestore.collection;

      const service = createCredentialService({
        firestore: brokenFirestore,
        encryptionService,
      });

      const result = await service.deleteToken('user-123', 'nature-remo');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FIRESTORE_ERROR');
      }
    });
  });

  describe('deleteAllForUser', () => {
    it('should delete all credentials and user document', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      await service.saveToken('user-123', 'nature-remo', 'token-1');
      await service.saveToken('user-123', 'alexa', 'token-2');

      expect(firestore._storage.has('users/user-123/credentials/nature-remo')).toBe(true);
      expect(firestore._storage.has('users/user-123/credentials/alexa')).toBe(true);

      const result = await service.deleteAllForUser('user-123');

      expect(result.ok).toBe(true);
      expect(firestore._storage.has('users/user-123/credentials/nature-remo')).toBe(false);
      expect(firestore._storage.has('users/user-123/credentials/alexa')).toBe(false);
    });

    it('should succeed when user has no credentials (idempotent)', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      const result = await service.deleteAllForUser('user-123');

      expect(result.ok).toBe(true);
    });

    it('should return FIRESTORE_ERROR when Firestore operation fails', async () => {
      const brokenFirestore = createMockFirestore();
      brokenFirestore.collection = vi.fn(() => ({
        doc: vi.fn(() => ({
          delete: vi.fn(async () => {
            throw new Error('Firestore batch error');
          }),
          collection: vi.fn(() => ({
            get: vi.fn(async () => {
              throw new Error('Firestore list error');
            }),
            doc: vi.fn(() => ({
              get: vi.fn(),
              set: vi.fn(),
              delete: vi.fn(),
            })),
          })),
        })),
      })) as unknown as typeof brokenFirestore.collection;

      const service = createCredentialService({
        firestore: brokenFirestore,
        encryptionService,
      });

      const result = await service.deleteAllForUser('user-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FIRESTORE_ERROR');
      }
    });
  });

  describe('encryption integration', () => {
    it('should encrypt before saving and decrypt after reading (round-trip)', async () => {
      const service = createCredentialService({ firestore, encryptionService });
      const originalToken = 'ory_at_abc123xyz789';

      await service.saveToken('user-456', 'nature-remo', originalToken);

      // Verify encrypted data is stored (not plaintext)
      const storedData = firestore._storage.get('users/user-456/credentials/nature-remo');
      expect(storedData!['encryptedToken']).not.toBe(originalToken);
      expect(storedData!['encryptedToken']).toBe(`encrypted:${originalToken}`);

      // Verify decrypted value matches original
      const result = await service.getDecryptedToken('user-456', 'nature-remo');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(originalToken);
      }
    });

    it('should call encryption service encrypt exactly once per save', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      await service.saveToken('user-123', 'nature-remo', 'token');

      expect(encryptionService.encrypt).toHaveBeenCalledTimes(1);
      expect(encryptionService.encrypt).toHaveBeenCalledWith('token');
    });

    it('should call encryption service decrypt exactly once per retrieval', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      await service.saveToken('user-123', 'nature-remo', 'token');
      await service.getDecryptedToken('user-123', 'nature-remo');

      expect(encryptionService.decrypt).toHaveBeenCalledTimes(1);
    });

    it('should NOT call encryption service during status retrieval', async () => {
      const service = createCredentialService({ firestore, encryptionService });

      await service.saveToken('user-123', 'nature-remo', 'token');

      // Reset mock call count
      vi.mocked(encryptionService.decrypt).mockClear();

      await service.getStatus('user-123');

      expect(encryptionService.decrypt).not.toHaveBeenCalled();
    });
  });
});
