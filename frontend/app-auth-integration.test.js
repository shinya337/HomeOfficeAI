/**
 * App Auth Integration Tests
 *
 * TDD: Tests for Task 8.3 - Integration of auth module with app.js
 *
 * Requirements covered:
 * - 1.2: ログイン成功時のUI反映（onAuthStateChanged → UI更新）
 * - 1.3: ログアウト時にセッション終了処理と連携
 * - 1.4: ページリロード後も認証状態を維持（auth module初期化をapp.jsに統合）
 *
 * Tests the following integration points:
 * - initAuth() initializes the auth module and auth UI
 * - Auth state change listener updates backend-api token provider
 * - Logout triggers session end when a session is active
 * - clearSessionId is called on logout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  initAuth,
  _getAuthInstance,
  _getAuthUIInstance,
} from './app-auth-integration.js';

// Mock the auth module
vi.mock('./auth.js', () => ({
  getFirebaseConfig: vi.fn(() => ({
    apiKey: 'test-key',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test-project',
  })),
  createAuth: vi.fn(),
}));

// Mock the auth-ui module
vi.mock('./auth-ui.js', () => ({
  createAuthUI: vi.fn(),
}));

// Mock the backend-api module
vi.mock('./backend-api.js', () => ({
  setAuthTokenProvider: vi.fn(),
  clearSessionId: vi.fn(),
  getSessionId: vi.fn(),
  endSession: vi.fn(),
}));

import { getFirebaseConfig, createAuth } from './auth.js';
import { createAuthUI } from './auth-ui.js';
import {
  setAuthTokenProvider,
  clearSessionId,
  getSessionId,
  endSession,
} from './backend-api.js';

describe('App Auth Integration (Task 8.3)', () => {
  /** @type {HTMLElement} */
  let headerContainer;
  let mockAuth;
  let mockAuthUI;
  let authStateListeners;

  beforeEach(() => {
    vi.clearAllMocks();
    authStateListeners = [];

    // Set up DOM with the settings button as reference point
    document.body.innerHTML = `
      <div class="office-space" id="officeSpace">
        <button class="settings-button" id="settingsButton" aria-label="設定"></button>
      </div>
    `;
    headerContainer = document.getElementById('officeSpace');

    // Create mock auth instance
    mockAuth = {
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
      getIdToken: vi.fn().mockResolvedValue(null),
      getAuthState: vi.fn(() => ({ user: null, isAuthenticated: false, isLoading: true })),
      onAuthStateChange: vi.fn((listener) => {
        authStateListeners.push(listener);
        return () => {
          authStateListeners = authStateListeners.filter((l) => l !== listener);
        };
      }),
    };

    // Create mock auth UI instance
    mockAuthUI = {
      mount: vi.fn(),
      unmount: vi.fn(),
    };

    createAuth.mockReturnValue(mockAuth);
    createAuthUI.mockReturnValue(mockAuthUI);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('initAuth - Auth module initialization (Requirement 1.4)', () => {
    it('should call getFirebaseConfig to get the Firebase config', () => {
      initAuth(headerContainer);

      expect(getFirebaseConfig).toHaveBeenCalled();
    });

    it('should call createAuth with the Firebase config', () => {
      initAuth(headerContainer);

      expect(createAuth).toHaveBeenCalledWith({
        apiKey: 'test-key',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test-project',
      });
    });

    it('should call createAuthUI with the auth instance', () => {
      initAuth(headerContainer);

      expect(createAuthUI).toHaveBeenCalledWith(mockAuth);
    });

    it('should mount the auth UI into the header container', () => {
      initAuth(headerContainer);

      expect(mockAuthUI.mount).toHaveBeenCalledWith(headerContainer);
    });

    it('should register an auth state change listener', () => {
      initAuth(headerContainer);

      expect(mockAuth.onAuthStateChange).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should return the auth instance', () => {
      const result = initAuth(headerContainer);

      expect(result).toBe(mockAuth);
    });

    it('should expose the auth instance via _getAuthInstance after initialization', () => {
      initAuth(headerContainer);

      expect(_getAuthInstance()).toBe(mockAuth);
    });

    it('should expose the auth UI instance via _getAuthUIInstance after initialization', () => {
      initAuth(headerContainer);

      expect(_getAuthUIInstance()).toBe(mockAuthUI);
    });
  });

  describe('Auth state change - Token provider update (Requirement 1.2)', () => {
    it('should set auth token provider to auth.getIdToken when user logs in', () => {
      initAuth(headerContainer);

      // Simulate login
      const loginState = {
        user: { uid: 'user-1', displayName: 'Test', email: 'test@test.com', photoURL: null },
        isAuthenticated: true,
        isLoading: false,
      };
      authStateListeners.forEach((l) => l(loginState));

      expect(setAuthTokenProvider).toHaveBeenCalledWith(mockAuth.getIdToken);
    });

    it('should set auth token provider to null when user logs out', () => {
      initAuth(headerContainer);

      // Simulate logout
      const logoutState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };
      authStateListeners.forEach((l) => l(logoutState));

      expect(setAuthTokenProvider).toHaveBeenCalledWith(null);
    });

    it('should not set auth token provider during loading state', () => {
      initAuth(headerContainer);

      // Simulate loading state
      const loadingState = {
        user: null,
        isAuthenticated: false,
        isLoading: true,
      };
      authStateListeners.forEach((l) => l(loadingState));

      expect(setAuthTokenProvider).not.toHaveBeenCalled();
    });
  });

  describe('Logout - Session termination (Requirement 1.3)', () => {
    it('should call endSession when user logs out while a session is active', async () => {
      getSessionId.mockReturnValue('active-session-123');
      endSession.mockResolvedValue({ sessionId: 'active-session-123', status: 'ended' });

      initAuth(headerContainer);

      // Simulate user was logged in first
      const loginState = {
        user: { uid: 'user-1', displayName: 'Test', email: 'test@test.com', photoURL: null },
        isAuthenticated: true,
        isLoading: false,
      };
      authStateListeners.forEach((l) => l(loginState));

      // Now simulate logout
      const logoutState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };
      authStateListeners.forEach((l) => l(logoutState));

      // Wait for async endSession
      await vi.waitFor(() => {
        expect(endSession).toHaveBeenCalled();
      });
    });

    it('should call clearSessionId when user logs out', () => {
      getSessionId.mockReturnValue(null);

      initAuth(headerContainer);

      // Simulate logout
      const logoutState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };
      authStateListeners.forEach((l) => l(logoutState));

      expect(clearSessionId).toHaveBeenCalled();
    });

    it('should not call endSession when user logs out with no active session', () => {
      getSessionId.mockReturnValue(null);

      initAuth(headerContainer);

      // Simulate logout (without prior login)
      const logoutState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };
      authStateListeners.forEach((l) => l(logoutState));

      expect(endSession).not.toHaveBeenCalled();
    });

    it('should still call clearSessionId even if endSession fails', async () => {
      getSessionId.mockReturnValue('session-456');
      endSession.mockRejectedValue(new Error('Network error'));

      initAuth(headerContainer);

      // Simulate login then logout
      const loginState = {
        user: { uid: 'u1', displayName: 'U', email: 'u@test.com', photoURL: null },
        isAuthenticated: true,
        isLoading: false,
      };
      authStateListeners.forEach((l) => l(loginState));

      const logoutState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };
      authStateListeners.forEach((l) => l(logoutState));

      // Wait for async error handling
      await vi.waitFor(() => {
        expect(clearSessionId).toHaveBeenCalled();
      });
    });
  });

  describe('Graceful degradation', () => {
    it('should handle missing Firebase config gracefully (empty config values)', () => {
      getFirebaseConfig.mockReturnValue({ apiKey: '', authDomain: '', projectId: '' });

      // Should not throw even with empty config
      expect(() => initAuth(headerContainer)).not.toThrow();
    });

    it('should handle createAuth throwing an error gracefully', () => {
      createAuth.mockImplementation(() => {
        throw new Error('Firebase initialization failed');
      });

      // Should not throw - returns null on failure
      const result = initAuth(headerContainer);
      expect(result).toBeNull();
    });
  });
});
