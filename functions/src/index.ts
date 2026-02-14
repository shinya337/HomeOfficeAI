/**
 * Cloud Functions Entry Point
 *
 * Exports Firebase Cloud Functions triggers for HomeOffice.ai.
 *
 * - onAccountDelete: Cleans up Firestore user data when a Firebase Auth
 *   account is deleted (auth.user().onDelete() trigger).
 *
 * Requirements: 7.5
 */
import { auth } from 'firebase-functions/v1';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createAuthCleanupHandler } from './auth-cleanup.js';

// Initialize Firebase Admin SDK (idempotent)
if (getApps().length === 0) {
  initializeApp();
}

const firestore = getFirestore();
const cleanupHandler = createAuthCleanupHandler(firestore);

/**
 * Cloud Function: onAccountDelete
 *
 * Triggered when a Firebase Auth user account is deleted.
 * Deletes all associated Firestore data:
 * - users/{uid}/credentials/* (all credential documents)
 * - users/{uid} (user document)
 *
 * Idempotent: Does not fail if documents are already deleted.
 */
export const onAccountDelete = auth.user().onDelete(async (user) => {
  const uid = user.uid;
  console.log(`[auth-cleanup] Cleaning up data for deleted user: ${uid}`);

  try {
    await cleanupHandler(uid);
    console.log(`[auth-cleanup] Successfully cleaned up data for user: ${uid}`);
  } catch (error) {
    console.error(
      `[auth-cleanup] Failed to clean up data for user: ${uid}`,
      error
    );
    throw error;
  }
});
