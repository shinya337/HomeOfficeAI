/**
 * Cloud Functions Index Module Tests
 *
 * Verifies that the Cloud Functions entry point correctly exports
 * the onAccountDelete trigger function.
 *
 * Note: Full integration testing with Firebase emulators is out of scope
 * for unit tests. These tests verify the module structure and exports.
 *
 * Requirements: 7.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin and firebase-functions before importing index
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn().mockReturnValue([]),
}));

vi.mock('firebase-admin/firestore', () => {
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  return {
    getFirestore: vi.fn().mockReturnValue({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({ get: mockGet }),
          delete: mockDelete,
        }),
      }),
    }),
  };
});

vi.mock('firebase-functions/v1', () => {
  const onDeleteFn = vi.fn().mockImplementation((handler: unknown) => handler);
  return {
    auth: {
      user: vi.fn().mockReturnValue({
        onDelete: onDeleteFn,
      }),
    },
  };
});

describe('Cloud Functions index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export onAccountDelete as a function', async () => {
    const indexModule = await import('./index.js');
    expect(indexModule.onAccountDelete).toBeDefined();
    expect(typeof indexModule.onAccountDelete).toBe('function');
  });

  it('should initialize Firebase Admin SDK', async () => {
    // Force re-import to trigger initialization
    vi.resetModules();

    // Re-mock after reset
    vi.doMock('firebase-admin/app', () => ({
      initializeApp: vi.fn(),
      getApps: vi.fn().mockReturnValue([]),
    }));
    vi.doMock('firebase-admin/firestore', () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
      return {
        getFirestore: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockReturnValue({ get: mockGet }),
              delete: mockDelete,
            }),
          }),
        }),
      };
    });
    vi.doMock('firebase-functions/v1', () => ({
      auth: {
        user: vi.fn().mockReturnValue({
          onDelete: vi.fn().mockImplementation((handler: unknown) => handler),
        }),
      },
    }));

    await import('./index.js');

    const adminApp = await import('firebase-admin/app');
    expect(adminApp.initializeApp).toHaveBeenCalled();
  });

  it('should register auth.user().onDelete() trigger', async () => {
    vi.resetModules();

    const onDeleteMock = vi.fn().mockImplementation((handler: unknown) => handler);
    vi.doMock('firebase-admin/app', () => ({
      initializeApp: vi.fn(),
      getApps: vi.fn().mockReturnValue([]),
    }));
    vi.doMock('firebase-admin/firestore', () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
      return {
        getFirestore: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockReturnValue({ get: mockGet }),
              delete: mockDelete,
            }),
          }),
        }),
      };
    });
    vi.doMock('firebase-functions/v1', () => ({
      auth: {
        user: vi.fn().mockReturnValue({
          onDelete: onDeleteMock,
        }),
      },
    }));

    await import('./index.js');

    expect(onDeleteMock).toHaveBeenCalledTimes(1);
    expect(typeof onDeleteMock.mock.calls[0]?.[0]).toBe('function');
  });
});
