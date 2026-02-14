/**
 * Firebase Admin SDK Initialization Service
 *
 * Provides singleton management for Firebase Admin SDK services
 * following the existing get/reset pattern (same as getApplianceService).
 *
 * Uses Application Default Credentials (ADC) for authentication.
 * Requires GOOGLE_CLOUD_PROJECT environment variable for projectId.
 *
 * Requirements: 3.1
 */
import { initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// =============================================================================
// Types
// =============================================================================

/**
 * Firebase Admin SDK service instances.
 * Provides access to the Firebase App, Auth, and Firestore.
 */
export interface FirebaseServices {
  readonly app: App;
  readonly auth: Auth;
  readonly firestore: Firestore;
}

// =============================================================================
// Singleton State
// =============================================================================

let sharedFirebaseServices: FirebaseServices | null = null;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Initialize Firebase Admin SDK with Application Default Credentials.
 *
 * Reads GOOGLE_CLOUD_PROJECT from environment variables for the projectId.
 * Throws if the environment variable is not set or empty.
 *
 * @returns FirebaseServices with app, auth, and firestore instances
 * @throws Error if GOOGLE_CLOUD_PROJECT is not configured
 */
export function initializeFirebaseServices(): FirebaseServices {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;

  if (!projectId || projectId.trim() === '') {
    throw new Error(
      'GOOGLE_CLOUD_PROJECT 環境変数が設定されていません。' +
        'Firebase Admin SDK の初期化に必要です。'
    );
  }

  const app = initializeApp({
    credential: applicationDefault(),
    projectId,
  });

  const auth = getAuth(app);
  const firestore = getFirestore(app);

  const services: FirebaseServices = {
    app,
    auth,
    firestore,
  };

  sharedFirebaseServices = services;
  return services;
}

/**
 * Get the shared Firebase services instance (singleton).
 * Lazily initializes on first call.
 *
 * Follows the same get/reset pattern as getApplianceService().
 *
 * @returns FirebaseServices singleton instance
 * @throws Error if GOOGLE_CLOUD_PROJECT is not configured
 */
export function getFirebaseServices(): FirebaseServices {
  if (sharedFirebaseServices === null) {
    sharedFirebaseServices = initializeFirebaseServices();
  }
  return sharedFirebaseServices;
}

/**
 * Reset the Firebase services singleton (useful for testing).
 *
 * Follows the same get/reset pattern as resetApplianceService().
 */
export function resetFirebaseServices(): void {
  sharedFirebaseServices = null;
}
