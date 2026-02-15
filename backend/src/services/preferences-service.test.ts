/**
 * Preferences Service Tests
 *
 * Tests for Firestore-based user preferences read/write operations.
 * Uses Firestore mocks to verify:
 * - Preferences save (write to Firestore)
 * - Preferences retrieval (read from Firestore, null when not saved)
 * - Firestore error handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPreferencesService } from './preferences-service.js';

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
  });

  const firestore = {
    collection: vi.fn((collectionPath: string) => ({
      doc: vi.fn((docId: string) => {
        const fullPath = `${collectionPath}/${docId}`;
        return {
          ...mockDocRef(fullPath),
          collection: vi.fn((subCollectionPath: string) => {
            const subPath = `${fullPath}/${subCollectionPath}`;
            return {
              doc: vi.fn((subDocId: string) => mockDocRef(`${subPath}/${subDocId}`)),
            };
          }),
        };
      }),
    })),
    _storage: storage,
  };

  return firestore as unknown as FirebaseFirestore.Firestore & {
    _storage: Map<string, Record<string, unknown>>;
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('preferences-service', () => {
  let firestore: ReturnType<typeof createMockFirestore>;

  beforeEach(() => {
    firestore = createMockFirestore();
  });

  describe('createPreferencesService', () => {
    it('should return an object with savePreferences and getPreferences', () => {
      const service = createPreferencesService({ firestore });

      expect(typeof service.savePreferences).toBe('function');
      expect(typeof service.getPreferences).toBe('function');
    });
  });

  describe('savePreferences', () => {
    it('should save preferences to Firestore', async () => {
      const service = createPreferencesService({ firestore });
      const result = await service.savePreferences('user-123', {
        camera: true,
        voice: false,
        selectedDevices: [{ id: 'dev-1', type: 'LIGHT' }],
      });

      expect(result.ok).toBe(true);

      const stored = firestore._storage.get('users/user-123/preferences/settings');
      expect(stored).toBeDefined();
      expect(stored!['camera']).toBe(true);
      expect(stored!['voice']).toBe(false);
      expect(stored!['selectedDevices']).toEqual([{ id: 'dev-1', type: 'LIGHT' }]);
      expect(stored!['updatedAt']).toBeDefined();
    });

    it('should overwrite existing preferences', async () => {
      const service = createPreferencesService({ firestore });

      await service.savePreferences('user-123', {
        camera: true,
        voice: true,
        selectedDevices: [],
      });

      await service.savePreferences('user-123', {
        camera: false,
        voice: false,
        selectedDevices: [{ id: 'dev-2', type: 'AC' }],
      });

      const stored = firestore._storage.get('users/user-123/preferences/settings');
      expect(stored!['camera']).toBe(false);
      expect(stored!['voice']).toBe(false);
      expect(stored!['selectedDevices']).toEqual([{ id: 'dev-2', type: 'AC' }]);
    });

    it('should return FIRESTORE_ERROR when Firestore write fails', async () => {
      const brokenFirestore = createMockFirestore();
      brokenFirestore.collection = vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({
              set: vi.fn(async () => {
                throw new Error('Firestore connection error');
              }),
              get: vi.fn(async () => ({ exists: false, data: () => undefined })),
            })),
          })),
        })),
      })) as unknown as typeof brokenFirestore.collection;

      const service = createPreferencesService({ firestore: brokenFirestore });
      const result = await service.savePreferences('user-123', {
        camera: true,
        voice: true,
        selectedDevices: [],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FIRESTORE_ERROR');
      }
    });

    it('should save selectedDevices with allowedTools', async () => {
      const service = createPreferencesService({ firestore });
      const result = await service.savePreferences('user-123', {
        camera: true,
        voice: true,
        selectedDevices: [
          { id: 'alexa-1', type: 'ALEXA', allowedTools: ['alexa_speak'] },
        ],
      });

      expect(result.ok).toBe(true);
      const stored = firestore._storage.get('users/user-123/preferences/settings');
      expect(stored!['selectedDevices']).toEqual([
        { id: 'alexa-1', type: 'ALEXA', allowedTools: ['alexa_speak'] },
      ]);
    });
  });

  describe('getPreferences', () => {
    it('should return null when no preferences exist', async () => {
      const service = createPreferencesService({ firestore });
      const result = await service.getPreferences('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should return saved preferences', async () => {
      const service = createPreferencesService({ firestore });

      await service.savePreferences('user-123', {
        camera: true,
        voice: false,
        selectedDevices: [{ id: 'dev-1', type: 'LIGHT' }],
      });

      const result = await service.getPreferences('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.camera).toBe(true);
        expect(result.value!.voice).toBe(false);
        expect(result.value!.selectedDevices).toEqual([{ id: 'dev-1', type: 'LIGHT' }]);
        expect(result.value!.updatedAt).toBeDefined();
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
            })),
          })),
        })),
      })) as unknown as typeof brokenFirestore.collection;

      const service = createPreferencesService({ firestore: brokenFirestore });
      const result = await service.getPreferences('user-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FIRESTORE_ERROR');
      }
    });

    it('should isolate preferences between users', async () => {
      const service = createPreferencesService({ firestore });

      await service.savePreferences('user-A', {
        camera: true,
        voice: true,
        selectedDevices: [],
      });

      await service.savePreferences('user-B', {
        camera: false,
        voice: false,
        selectedDevices: [{ id: 'dev-1', type: 'AC' }],
      });

      const resultA = await service.getPreferences('user-A');
      const resultB = await service.getPreferences('user-B');

      expect(resultA.ok).toBe(true);
      expect(resultB.ok).toBe(true);
      if (resultA.ok && resultB.ok) {
        expect(resultA.value!.camera).toBe(true);
        expect(resultB.value!.camera).toBe(false);
      }
    });
  });
});
