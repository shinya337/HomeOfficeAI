/**
 * Credential Service
 *
 * Provides Firestore-based CRUD operations for user IoT credentials
 * with server-side encryption via EncryptionService.
 *
 * Data model: users/{uid}/credentials/{service}
 * - encryptedToken: AES-256-GCM encrypted token (Base64)
 * - updatedAt: ISO 8601 timestamp
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 7.2, 7.4, 7.5
 */
import type { Result } from '../types/action-types.js';
import type { CredentialError, CredentialStatus } from '../types/auth-types.js';
import type { EncryptionService } from './encryption-service.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Dependencies for the credential service.
 */
export interface CredentialServiceDeps {
  readonly firestore: FirebaseFirestore.Firestore;
  readonly encryptionService: EncryptionService;
}

/**
 * Service interface for managing user IoT credentials in Firestore.
 */
export interface CredentialService {
  saveToken(
    uid: string,
    service: string,
    token: string
  ): Promise<Result<void, CredentialError>>;

  getDecryptedToken(
    uid: string,
    service: string
  ): Promise<Result<string, CredentialError>>;

  getStatus(
    uid: string
  ): Promise<Result<readonly CredentialStatus[], CredentialError>>;

  deleteToken(
    uid: string,
    service: string
  ): Promise<Result<void, CredentialError>>;

  deleteAllForUser(
    uid: string
  ): Promise<Result<void, CredentialError>>;
}

// =============================================================================
// Constants
// =============================================================================

/** Firestore collection name for users */
const USERS_COLLECTION = 'users';

/** Firestore subcollection name for credentials */
const CREDENTIALS_SUBCOLLECTION = 'credentials';

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a credential service backed by Firestore with encryption.
 *
 * @param deps - Dependencies (Firestore instance and encryption service)
 * @returns CredentialService instance
 */
export function createCredentialService(
  deps: CredentialServiceDeps
): CredentialService {
  const { firestore, encryptionService } = deps;

  /**
   * Get a reference to the credentials subcollection for a user.
   */
  function getCredentialsCollection(uid: string) {
    return firestore
      .collection(USERS_COLLECTION)
      .doc(uid)
      .collection(CREDENTIALS_SUBCOLLECTION);
  }

  /**
   * Get a reference to a specific credential document.
   */
  function getCredentialDoc(uid: string, service: string) {
    return getCredentialsCollection(uid).doc(service);
  }

  async function saveToken(
    uid: string,
    service: string,
    token: string
  ): Promise<Result<void, CredentialError>> {
    // Encrypt the token before storing
    const encryptResult = encryptionService.encrypt(token);
    if (!encryptResult.ok) {
      return {
        ok: false,
        error: {
          code: 'ENCRYPTION_ERROR',
          message: encryptResult.error.message,
        },
      };
    }

    try {
      const docRef = getCredentialDoc(uid, service);
      await docRef.set(
        {
          encryptedToken: encryptResult.value,
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
              ? `Firestoreへの書き込みに失敗しました: ${error.message}`
              : 'Firestoreへの書き込みに失敗しました: 不明なエラー',
        },
      };
    }
  }

  async function getDecryptedToken(
    uid: string,
    service: string
  ): Promise<Result<string, CredentialError>> {
    try {
      const docRef = getCredentialDoc(uid, service);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        return {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `クレデンシャルが見つかりません: ${service}`,
          },
        };
      }

      const data = snapshot.data();
      const encryptedToken = data?.['encryptedToken'] as string | undefined;

      if (encryptedToken === undefined) {
        return {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `クレデンシャルにトークンが含まれていません: ${service}`,
          },
        };
      }

      // Decrypt the token
      const decryptResult = encryptionService.decrypt(encryptedToken);
      if (!decryptResult.ok) {
        return {
          ok: false,
          error: {
            code: 'ENCRYPTION_ERROR',
            message: decryptResult.error.message,
          },
        };
      }

      return { ok: true, value: decryptResult.value };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message:
            error instanceof Error
              ? `Firestoreからの読み取りに失敗しました: ${error.message}`
              : 'Firestoreからの読み取りに失敗しました: 不明なエラー',
        },
      };
    }
  }

  async function getStatus(
    uid: string
  ): Promise<Result<readonly CredentialStatus[], CredentialError>> {
    try {
      const collectionRef = getCredentialsCollection(uid);
      const snapshot = await collectionRef.get();

      if (snapshot.empty) {
        return { ok: true, value: [] };
      }

      const statuses: CredentialStatus[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          service: doc.id,
          configured: true,
          updatedAt: (data['updatedAt'] as string | undefined),
        };
      });

      return { ok: true, value: statuses };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message:
            error instanceof Error
              ? `Firestoreからのステータス取得に失敗しました: ${error.message}`
              : 'Firestoreからのステータス取得に失敗しました: 不明なエラー',
        },
      };
    }
  }

  async function deleteToken(
    uid: string,
    service: string
  ): Promise<Result<void, CredentialError>> {
    try {
      const docRef = getCredentialDoc(uid, service);
      await docRef.delete();

      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message:
            error instanceof Error
              ? `Firestoreからの削除に失敗しました: ${error.message}`
              : 'Firestoreからの削除に失敗しました: 不明なエラー',
        },
      };
    }
  }

  async function deleteAllForUser(
    uid: string
  ): Promise<Result<void, CredentialError>> {
    try {
      // First, delete all credential documents in the subcollection
      const collectionRef = getCredentialsCollection(uid);
      const snapshot = await collectionRef.get();

      const deletePromises = snapshot.docs.map((doc) => doc.ref.delete());
      await Promise.all(deletePromises);

      // Then delete the user document itself
      const userDocRef = firestore.collection(USERS_COLLECTION).doc(uid);
      await userDocRef.delete();

      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'FIRESTORE_ERROR',
          message:
            error instanceof Error
              ? `ユーザーデータの全削除に失敗しました: ${error.message}`
              : 'ユーザーデータの全削除に失敗しました: 不明なエラー',
        },
      };
    }
  }

  return {
    saveToken,
    getDecryptedToken,
    getStatus,
    deleteToken,
    deleteAllForUser,
  };
}
