/**
 * Preferences Service
 *
 * Provides Firestore-based read/write operations for user preferences
 * (camera, voice, device selection).
 *
 * Data model: users/{uid}/preferences/settings
 * - camera: boolean
 * - voice: boolean
 * - selectedDevices: { id, type, allowedTools? }[]
 * - updatedAt: ISO 8601 timestamp
 */
import type { Result } from '../types/action-types.js';
import type { UserPreferences, PreferencesError } from '../types/auth-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Dependencies for the preferences service.
 */
export interface PreferencesServiceDeps {
  readonly firestore: FirebaseFirestore.Firestore;
}

/**
 * Service interface for managing user preferences in Firestore.
 */
export interface PreferencesService {
  savePreferences(
    uid: string,
    preferences: Omit<UserPreferences, 'updatedAt'>
  ): Promise<Result<void, PreferencesError>>;

  getPreferences(
    uid: string
  ): Promise<Result<UserPreferences | null, PreferencesError>>;
}

// =============================================================================
// Constants
// =============================================================================

const USERS_COLLECTION = 'users';
const PREFERENCES_SUBCOLLECTION = 'preferences';
const SETTINGS_DOC = 'settings';

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a preferences service backed by Firestore.
 *
 * @param deps - Dependencies (Firestore instance)
 * @returns PreferencesService instance
 */
export function createPreferencesService(
  deps: PreferencesServiceDeps
): PreferencesService {
  const { firestore } = deps;

  function getSettingsDoc(uid: string) {
    return firestore
      .collection(USERS_COLLECTION)
      .doc(uid)
      .collection(PREFERENCES_SUBCOLLECTION)
      .doc(SETTINGS_DOC);
  }

  async function savePreferences(
    uid: string,
    preferences: Omit<UserPreferences, 'updatedAt'>
  ): Promise<Result<void, PreferencesError>> {
    try {
      const docRef = getSettingsDoc(uid);
      await docRef.set(
        {
          camera: preferences.camera,
          voice: preferences.voice,
          selectedDevices: preferences.selectedDevices,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message:
            error instanceof Error
              ? `設定の保存に失敗しました: ${error.message}`
              : '設定の保存に失敗しました: 不明なエラー',
        },
      };
    }
  }

  async function getPreferences(
    uid: string
  ): Promise<Result<UserPreferences | null, PreferencesError>> {
    try {
      const docRef = getSettingsDoc(uid);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        return { ok: true, value: null };
      }

      const data = snapshot.data();
      const prefs: UserPreferences = {
        camera: data?.['camera'] as boolean ?? false,
        voice: data?.['voice'] as boolean ?? false,
        selectedDevices: (data?.['selectedDevices'] as UserPreferences['selectedDevices']) ?? [],
        updatedAt: (data?.['updatedAt'] as string) ?? '',
      };

      return { ok: true, value: prefs };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message:
            error instanceof Error
              ? `設定の取得に失敗しました: ${error.message}`
              : '設定の取得に失敗しました: 不明なエラー',
        },
      };
    }
  }

  return {
    savePreferences,
    getPreferences,
  };
}
