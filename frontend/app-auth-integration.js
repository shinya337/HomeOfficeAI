/**
 * App Auth Integration Module for HomeOffice.ai
 *
 * Integrates the Firebase Auth module, Auth UI, and backend API client
 * with the main application. Handles:
 * - Auth module initialization from Firebase config
 * - Auth UI mounting into the header
 * - Auth state change listener for token provider and session management
 * - Logout triggers session termination when a session is active
 *
 * Requirements:
 * - 1.2: ログイン成功時のUI反映（onAuthStateChanged → UI全体更新）
 * - 1.3: ログアウト時にセッション終了処理と連携
 * - 1.4: ページリロード後も認証状態を維持（auth module初期化をapp.jsに統合）
 */

import { getFirebaseConfig, createAuth } from './auth.js';
import { createAuthUI } from './auth-ui.js';
import {
  setAuthTokenProvider,
  clearSessionId,
  getSessionId,
  endSession,
} from './backend-api.js';

/** @type {ReturnType<typeof createAuth> | null} */
let authInstance = null;

/** @type {ReturnType<typeof createAuthUI> | null} */
let authUIInstance = null;

/**
 * Initialize the auth module and auth UI, and register
 * an auth state change listener that updates the backend
 * API token provider and handles logout session cleanup.
 *
 * @param {HTMLElement} headerContainer - The container element where auth UI will be mounted
 * @returns {ReturnType<typeof createAuth> | null} The auth instance, or null on failure
 */
export function initAuth(headerContainer) {
  try {
    const config = getFirebaseConfig();
    const auth = createAuth(config);
    authInstance = auth;

    const authUI = createAuthUI(auth);
    authUIInstance = authUI;
    authUI.mount(headerContainer);

    // Track whether user was previously authenticated to detect logout transitions
    let wasAuthenticated = false;

    auth.onAuthStateChange((state) => {
      // Skip loading state - Firebase is still restoring session
      if (state.isLoading) {
        return;
      }

      if (state.isAuthenticated) {
        // User logged in: set the token provider so all API requests include the ID token
        setAuthTokenProvider(auth.getIdToken);
        wasAuthenticated = true;
      } else {
        // User logged out (or was never logged in)
        setAuthTokenProvider(null);

        // If transitioning from authenticated to unauthenticated, handle session cleanup
        if (wasAuthenticated) {
          const activeSessionId = getSessionId();
          if (activeSessionId) {
            endSession().catch((error) => {
              console.error('[App] Failed to end session on logout:', error);
            }).finally(() => {
              clearSessionId();
            });
          } else {
            clearSessionId();
          }
        } else {
          // Initial load as guest -- still clear any stale session state
          clearSessionId();
        }

        wasAuthenticated = false;
      }
    });

    return auth;
  } catch (error) {
    console.error('[App] Auth initialization failed:', error);
    authInstance = null;
    authUIInstance = null;
    return null;
  }
}

/**
 * Get the current auth instance (for testing/debugging).
 * @returns {ReturnType<typeof createAuth> | null}
 */
export function _getAuthInstance() {
  return authInstance;
}

/**
 * Get the current auth UI instance (for testing/debugging).
 * @returns {ReturnType<typeof createAuthUI> | null}
 */
export function _getAuthUIInstance() {
  return authUIInstance;
}
