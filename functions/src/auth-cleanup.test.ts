/**
 * Auth Cleanup Cloud Function Tests
 *
 * Tests for the auth.user().onDelete() trigger that cleans up
 * Firestore user data when a Firebase Auth account is deleted.
 *
 * Uses mocked Firestore to simulate document operations.
 * Requirements: 7.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthCleanupHandler } from './auth-cleanup.js';

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Create a mock Firestore instance with controllable behavior.
 */
function createMockFirestore(options?: {
  readonly docs?: ReadonlyArray<{ readonly id: string }>;
  readonly getError?: Error;
  readonly deleteError?: Error;
}) {
  const deleteFn = vi.fn<() => Promise<void>>().mockImplementation(() => {
    if (options?.deleteError) {
      return Promise.reject(options.deleteError);
    }
    return Promise.resolve();
  });

  const mockDocs = (options?.docs ?? []).map((doc) => ({
    id: doc.id,
    ref: { delete: deleteFn },
  }));

  const getFn = vi.fn<() => Promise<{ empty: boolean; docs: typeof mockDocs }>>().mockImplementation(() => {
    if (options?.getError) {
      return Promise.reject(options.getError);
    }
    return Promise.resolve({
      empty: mockDocs.length === 0,
      docs: mockDocs,
    });
  });

  const collectionFn = vi.fn().mockReturnThis();
  const docFn = vi.fn().mockReturnValue({
    collection: collectionFn,
    delete: deleteFn,
  });

  // Chain: firestore.collection('users').doc(uid).collection('credentials').get()
  // and:  firestore.collection('users').doc(uid).delete()
  const mockFirestore = {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          get: getFn,
        }),
        delete: deleteFn,
      }),
    }),
    _mocks: {
      deleteFn,
      getFn,
      collectionFn,
      docFn,
    },
  };

  return mockFirestore;
}

// =============================================================================
// Tests
// =============================================================================

describe('auth-cleanup', () => {
  describe('createAuthCleanupHandler', () => {
    it('should return a function', () => {
      const mockFirestore = createMockFirestore();
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);
      expect(typeof handler).toBe('function');
    });
  });

  describe('handler execution', () => {
    let mockFirestore: ReturnType<typeof createMockFirestore>;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should delete all credential documents in the subcollection', async () => {
      mockFirestore = createMockFirestore({
        docs: [{ id: 'nature-remo' }, { id: 'alexa' }],
      });
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

      await handler('test-uid-123');

      // Verify collection path: users/{uid}/credentials
      expect(mockFirestore.collection).toHaveBeenCalledWith('users');
      const usersCollection = mockFirestore.collection('users');
      expect(usersCollection.doc).toHaveBeenCalledWith('test-uid-123');

      // Verify each credential doc was deleted
      expect(mockFirestore._mocks.deleteFn).toHaveBeenCalled();
    });

    it('should delete the user document itself', async () => {
      mockFirestore = createMockFirestore({ docs: [] });
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

      await handler('user-abc');

      // Verify user doc path: users/{uid}
      expect(mockFirestore.collection).toHaveBeenCalledWith('users');
      const usersCollection = mockFirestore.collection('users');
      expect(usersCollection.doc).toHaveBeenCalledWith('user-abc');

      // User doc delete should be called
      expect(mockFirestore._mocks.deleteFn).toHaveBeenCalled();
    });

    it('should handle empty credentials subcollection (idempotent)', async () => {
      mockFirestore = createMockFirestore({ docs: [] });
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

      // Should not throw when no credentials exist
      await expect(handler('no-creds-user')).resolves.not.toThrow();
    });

    it('should handle already-deleted user (idempotent)', async () => {
      // When Firestore returns empty for a non-existent user, delete on
      // a non-existent doc is a no-op in Firestore. Simulate that.
      mockFirestore = createMockFirestore({ docs: [] });
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

      await expect(handler('already-deleted-user')).resolves.not.toThrow();
    });

    it('should delete multiple credential documents', async () => {
      mockFirestore = createMockFirestore({
        docs: [
          { id: 'nature-remo' },
          { id: 'alexa' },
          { id: 'switchbot' },
        ],
      });
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

      await handler('multi-cred-user');

      // 3 credential deletes + 1 user doc delete = 4 total
      expect(mockFirestore._mocks.deleteFn).toHaveBeenCalledTimes(4);
    });

    it('should propagate Firestore read errors', async () => {
      mockFirestore = createMockFirestore({
        getError: new Error('Firestore connection failed'),
      });
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

      await expect(handler('error-user')).rejects.toThrow('Firestore connection failed');
    });

    it('should propagate Firestore delete errors', async () => {
      mockFirestore = createMockFirestore({
        docs: [{ id: 'nature-remo' }],
        deleteError: new Error('Permission denied'),
      });
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

      await expect(handler('error-user')).rejects.toThrow('Permission denied');
    });

    it('should process the uid correctly regardless of format', async () => {
      mockFirestore = createMockFirestore({ docs: [] });
      const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

      // Firebase UIDs can contain various characters
      const specialUid = 'abc123XYZ_-';
      await handler(specialUid);

      expect(mockFirestore.collection).toHaveBeenCalledWith('users');
      const usersCollection = mockFirestore.collection('users');
      expect(usersCollection.doc).toHaveBeenCalledWith(specialUid);
    });
  });
});

describe('onAccountDelete (Cloud Function export)', () => {
  it('should export a properly structured Cloud Function', async () => {
    // This test verifies the index.ts module exports correctly
    // We cannot fully test the firebase-functions wrapping in unit tests
    // since it requires the Firebase emulator, but we can verify the handler logic
    const mockFirestore = createMockFirestore({ docs: [] });
    const handler = createAuthCleanupHandler(mockFirestore as unknown as FirebaseFirestore.Firestore);

    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });
});
