/**
 * Firebase Auth Module for HomeOffice.ai
 *
 * Provides Firebase Authentication (Google Login) functionality.
 * Uses the modular Firebase SDK with `initializeAuth()` for bundle optimization.
 *
 * Requirements:
 * - 1.1: signInWithPopup + GoogleAuthProvider でGoogleログインフロー開始
 * - 1.2: ログイン成功時のUI反映（uid, displayName, photoURL取得）
 * - 1.3: signOut でログアウト
 * - 1.4: onAuthStateChanged で認証状態の永続化・復元
 * - 1.5: サインイン失敗時のエラーハンドリング
 */

import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  getIdToken,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth';

/**
 * @typedef {Object} AuthUser
 * @property {string} uid
 * @property {string|null} email
 * @property {string|null} displayName
 * @property {string|null} photoURL
 */

/**
 * @typedef {Object} AuthState
 * @property {AuthUser|null} user
 * @property {boolean} isAuthenticated
 * @property {boolean} isLoading
 */

/**
 * @typedef {(state: AuthState) => void} AuthStateListener
 */

/**
 * Read Firebase config from Vite environment variables.
 *
 * @returns {{ apiKey: string, authDomain: string, projectId: string }}
 */
export function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  };
}

/**
 * Create the authentication module.
 *
 * Initializes Firebase App and Auth, sets up onAuthStateChanged listener,
 * and returns an API object for sign-in, sign-out, token retrieval, and
 * state observation.
 *
 * @param {Object} firebaseConfig - Firebase configuration object
 * @returns {{
 *   signIn: () => Promise<void>,
 *   signOut: () => Promise<void>,
 *   getIdToken: () => Promise<string|null>,
 *   getAuthState: () => AuthState,
 *   onAuthStateChange: (listener: AuthStateListener) => () => void
 * }}
 */
export function createAuth(firebaseConfig) {
  // Initialize Firebase App
  const app = initializeApp(firebaseConfig);

  // Initialize Auth with initializeAuth for bundle optimization (tree-shaking)
  const auth = initializeAuth(app, {
    persistence: [browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });

  // Internal state
  /** @type {AuthState} */
  let currentState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
  };

  /** @type {import('firebase/auth').User | null} */
  let currentFirebaseUser = null;

  /** @type {Set<AuthStateListener>} */
  const listeners = new Set();

  /**
   * Map a Firebase User to our AuthUser type.
   * Falls back to providerData[0] for displayName and photoURL when the
   * root User object properties are null (known Firebase behavior with
   * some Google accounts).
   * @param {import('firebase/auth').User | null} firebaseUser
   * @returns {AuthUser | null}
   */
  function mapUser(firebaseUser) {
    if (!firebaseUser) {
      return null;
    }
    // providerData[0] contains the Google profile info and is always populated
    // on Google sign-in, even when the root User properties are null.
    const provider = (firebaseUser.providerData && firebaseUser.providerData.length > 0)
      ? firebaseUser.providerData[0]
      : null;
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || (provider && provider.email) || null,
      displayName: firebaseUser.displayName || (provider && provider.displayName) || null,
      photoURL: firebaseUser.photoURL || (provider && provider.photoURL) || null,
    };
  }

  /**
   * Update internal state and notify all listeners.
   * Each listener is wrapped in try/catch to ensure that a failing listener
   * does not prevent subsequent listeners from being notified.
   * @param {AuthState} newState
   */
  function setState(newState) {
    currentState = newState;
    for (const listener of listeners) {
      try {
        listener(currentState);
      } catch (error) {
        console.error('[Auth] Listener error:', error);
      }
    }
  }

  // Set up onAuthStateChanged listener
  onAuthStateChanged(auth, (firebaseUser) => {
    currentFirebaseUser = firebaseUser;
    setState({
      user: mapUser(firebaseUser),
      isAuthenticated: firebaseUser !== null,
      isLoading: false,
    });
  });

  return {
    /**
     * Sign in with Google via popup.
     * @returns {Promise<void>}
     * @throws {Error} On sign-in failure (popup closed, network error, etc.)
     */
    async signIn() {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // State update happens via onAuthStateChanged callback
    },

    /**
     * Sign out the current user.
     * @returns {Promise<void>}
     */
    async signOut() {
      await firebaseSignOut(auth);
      // State update happens via onAuthStateChanged callback
    },

    /**
     * Get the Firebase ID token for the current user.
     * Returns null if no user is signed in.
     * @returns {Promise<string|null>}
     */
    async getIdToken() {
      if (!currentFirebaseUser) {
        return null;
      }
      return getIdToken(currentFirebaseUser);
    },

    /**
     * Get the current authentication state.
     * @returns {AuthState}
     */
    getAuthState() {
      return { ...currentState };
    },

    /**
     * Subscribe to authentication state changes.
     * @param {AuthStateListener} listener
     * @returns {() => void} Unsubscribe function
     */
    onAuthStateChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
