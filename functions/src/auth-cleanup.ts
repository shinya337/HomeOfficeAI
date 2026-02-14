/**
 * Auth Cleanup Handler
 *
 * Provides the core logic for cleaning up Firestore user data
 * when a Firebase Auth account is deleted.
 *
 * Deletes:
 * 1. All documents in users/{uid}/credentials subcollection
 * 2. The users/{uid} document itself
 *
 * Idempotent: Does not throw if documents are already deleted.
 *
 * Requirements: 7.5
 */

// =============================================================================
// Constants
// =============================================================================

/** Firestore collection name for users */
const USERS_COLLECTION = 'users';

/** Firestore subcollection name for credentials */
const CREDENTIALS_SUBCOLLECTION = 'credentials';

// =============================================================================
// Types
// =============================================================================

/**
 * Auth cleanup handler function type.
 * Takes a user UID and deletes all associated Firestore data.
 */
export type AuthCleanupHandler = (uid: string) => Promise<void>;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create an auth cleanup handler with the given Firestore instance.
 *
 * The handler deletes all credential documents in the user's subcollection
 * and the user document itself. It is idempotent -- deleting a non-existent
 * document in Firestore is a no-op.
 *
 * @param firestore - Firestore instance from Firebase Admin SDK
 * @returns Handler function that accepts a uid and performs cleanup
 */
export function createAuthCleanupHandler(
  firestore: FirebaseFirestore.Firestore
): AuthCleanupHandler {
  return async (uid: string): Promise<void> => {
    // Get reference to the user's credentials subcollection
    const credentialsRef = firestore
      .collection(USERS_COLLECTION)
      .doc(uid)
      .collection(CREDENTIALS_SUBCOLLECTION);

    // Fetch all credential documents
    const snapshot = await credentialsRef.get();

    // Delete all credential documents in parallel
    if (!snapshot.empty) {
      const deletePromises = snapshot.docs.map((doc) => doc.ref.delete());
      await Promise.all(deletePromises);
    }

    // Delete the user document itself
    const userDocRef = firestore.collection(USERS_COLLECTION).doc(uid);
    await userDocRef.delete();
  };
}
