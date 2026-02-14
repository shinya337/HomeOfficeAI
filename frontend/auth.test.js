/**
 * Firebase Auth Module Tests
 *
 * TDD: RED phase - Tests for Firebase Auth authentication module (Task 7.1)
 *
 * Requirements covered:
 * - 1.1: signInWithPopup + GoogleAuthProvider でGoogleログインフロー開始
 * - 1.2: ログイン成功時にユーザー情報(uid, displayName, photoURL)を取得
 * - 1.3: signOut でログアウト
 * - 1.4: onAuthStateChanged で認証状態の維持・復元
 * - 1.5: サインイン失敗時のエラーハンドリング
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase/app and firebase/auth modules
const mockApp = { name: '[DEFAULT]' };
const mockAuth = { currentUser: null };

const mockSignInWithPopup = vi.fn();
const mockSignOutFn = vi.fn();
const mockOnAuthStateChanged = vi.fn();
const mockGetIdToken = vi.fn();
const mockInitializeApp = vi.fn(() => mockApp);
const mockInitializeAuth = vi.fn(() => mockAuth);
const MockGoogleAuthProvider = vi.fn();

vi.mock('firebase/app', () => ({
  initializeApp: (...args) => mockInitializeApp(...args),
}));

vi.mock('firebase/auth', () => ({
  initializeAuth: (...args) => mockInitializeAuth(...args),
  signInWithPopup: (...args) => mockSignInWithPopup(...args),
  signOut: (...args) => mockSignOutFn(...args),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
  getIdToken: (...args) => mockGetIdToken(...args),
  GoogleAuthProvider: MockGoogleAuthProvider,
  browserLocalPersistence: 'browserLocalPersistence',
  browserSessionPersistence: 'browserSessionPersistence',
  browserPopupRedirectResolver: 'browserPopupRedirectResolver',
}));

describe('Auth Module (Task 7.1)', () => {
  let createAuth;

  const testConfig = {
    apiKey: 'test-api-key',
    authDomain: 'test-project.firebaseapp.com',
    projectId: 'test-project',
  };

  const mockFirebaseUser = {
    uid: 'test-uid-123',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://example.com/photo.jpg',
    getIdToken: mockGetIdToken,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset mocks
    mockInitializeApp.mockReturnValue(mockApp);
    mockInitializeAuth.mockReturnValue(mockAuth);
    mockSignInWithPopup.mockResolvedValue({ user: mockFirebaseUser });
    mockSignOutFn.mockResolvedValue(undefined);
    mockGetIdToken.mockResolvedValue('mock-id-token-abc');
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      // Default: don't call callback immediately (simulate no user)
      return vi.fn(); // unsubscribe function
    });

    // Re-mock the modules for each test
    vi.doMock('firebase/app', () => ({
      initializeApp: (...args) => mockInitializeApp(...args),
    }));
    vi.doMock('firebase/auth', () => ({
      initializeAuth: (...args) => mockInitializeAuth(...args),
      signInWithPopup: (...args) => mockSignInWithPopup(...args),
      signOut: (...args) => mockSignOutFn(...args),
      onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
      getIdToken: (...args) => mockGetIdToken(...args),
      GoogleAuthProvider: MockGoogleAuthProvider,
      browserLocalPersistence: 'browserLocalPersistence',
      browserSessionPersistence: 'browserSessionPersistence',
      browserPopupRedirectResolver: 'browserPopupRedirectResolver',
    }));

    const module = await import('./auth.js');
    createAuth = module.createAuth;
  });

  describe('Firebase initialization', () => {
    it('should initialize Firebase App with the provided config', () => {
      createAuth(testConfig);

      expect(mockInitializeApp).toHaveBeenCalledWith(testConfig);
    });

    it('should initialize Firebase Auth with initializeAuth for bundle optimization', () => {
      createAuth(testConfig);

      expect(mockInitializeAuth).toHaveBeenCalledWith(
        mockApp,
        expect.objectContaining({
          persistence: expect.any(Array),
          popupRedirectResolver: 'browserPopupRedirectResolver',
        })
      );
    });

    it('should set up onAuthStateChanged listener on creation', () => {
      createAuth(testConfig);

      expect(mockOnAuthStateChanged).toHaveBeenCalledWith(
        mockAuth,
        expect.any(Function)
      );
    });
  });

  describe('getFirebaseConfig', () => {
    it('should export getFirebaseConfig that reads Vite environment variables', async () => {
      const module = await import('./auth.js');
      expect(module.getFirebaseConfig).toBeDefined();
      expect(typeof module.getFirebaseConfig).toBe('function');
    });
  });

  describe('initial auth state', () => {
    it('should start with loading state', () => {
      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.isLoading).toBe(true);
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('signIn (Requirement 1.1)', () => {
    it('should call signInWithPopup with GoogleAuthProvider', async () => {
      const auth = createAuth(testConfig);

      await auth.signIn();

      expect(mockSignInWithPopup).toHaveBeenCalledWith(
        mockAuth,
        expect.any(MockGoogleAuthProvider)
      );
    });

    it('should update auth state on successful sign-in via onAuthStateChanged callback', () => {
      // Simulate onAuthStateChanged calling back with a user
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(mockFirebaseUser);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual({
        uid: 'test-uid-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
      });
    });
  });

  describe('signOut (Requirement 1.3)', () => {
    it('should call Firebase signOut', async () => {
      const auth = createAuth(testConfig);

      await auth.signOut();

      expect(mockSignOutFn).toHaveBeenCalledWith(mockAuth);
    });

    it('should update auth state on sign-out via onAuthStateChanged callback', () => {
      // Simulate onAuthStateChanged calling back with null (signed out)
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(null);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('onAuthStateChanged / Observer pattern (Requirement 1.4)', () => {
    it('should notify listeners when auth state changes to signed in', () => {
      let authStateCallback;
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        authStateCallback = callback;
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const listener = vi.fn();
      auth.onAuthStateChange(listener);

      // Simulate Firebase auth state change
      authStateCallback(mockFirebaseUser);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          isAuthenticated: true,
          isLoading: false,
          user: {
            uid: 'test-uid-123',
            email: 'test@example.com',
            displayName: 'Test User',
            photoURL: 'https://example.com/photo.jpg',
          },
        })
      );
    });

    it('should notify listeners when auth state changes to signed out', () => {
      let authStateCallback;
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        authStateCallback = callback;
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const listener = vi.fn();
      auth.onAuthStateChange(listener);

      // Simulate sign out
      authStateCallback(null);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          isAuthenticated: false,
          isLoading: false,
          user: null,
        })
      );
    });

    it('should support multiple listeners', () => {
      let authStateCallback;
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        authStateCallback = callback;
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      auth.onAuthStateChange(listener1);
      auth.onAuthStateChange(listener2);

      authStateCallback(mockFirebaseUser);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should return an unsubscribe function that removes the listener', () => {
      let authStateCallback;
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        authStateCallback = callback;
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const listener = vi.fn();
      const unsubscribe = auth.onAuthStateChange(listener);

      // Unsubscribe
      unsubscribe();

      // Trigger auth state change
      authStateCallback(mockFirebaseUser);

      // Listener should NOT be called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });

    it('should restore auth state on page reload via onAuthStateChanged', () => {
      // Simulate Firebase restoring an existing session
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        // Firebase calls with existing user on reload
        callback(mockFirebaseUser);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.user.uid).toBe('test-uid-123');
    });
  });

  describe('getIdToken (Requirement 1.2 - backend API token)', () => {
    it('should return null when user is not signed in', async () => {
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(null);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const token = await auth.getIdToken();

      expect(token).toBeNull();
    });

    it('should return ID token when user is signed in', async () => {
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(mockFirebaseUser);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const token = await auth.getIdToken();

      expect(token).toBe('mock-id-token-abc');
      expect(mockGetIdToken).toHaveBeenCalledWith(mockFirebaseUser);
    });
  });

  describe('error handling (Requirement 1.5)', () => {
    it('should throw error when signIn fails with popup closed', async () => {
      const popupClosedError = new Error('popup-closed');
      popupClosedError.code = 'auth/popup-closed-by-user';
      mockSignInWithPopup.mockRejectedValue(popupClosedError);

      const auth = createAuth(testConfig);

      await expect(auth.signIn()).rejects.toThrow();
    });

    it('should throw error when signIn fails with network error', async () => {
      const networkError = new Error('network-error');
      networkError.code = 'auth/network-request-failed';
      mockSignInWithPopup.mockRejectedValue(networkError);

      const auth = createAuth(testConfig);

      await expect(auth.signIn()).rejects.toThrow();
    });

    it('should throw error when signIn fails with account exists', async () => {
      const existsError = new Error('account-exists');
      existsError.code = 'auth/account-exists-with-different-credential';
      mockSignInWithPopup.mockRejectedValue(existsError);

      const auth = createAuth(testConfig);

      await expect(auth.signIn()).rejects.toThrow();
    });

    it('should not change auth state on signIn failure', async () => {
      mockSignInWithPopup.mockRejectedValue(new Error('sign-in-failed'));
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        // No user
        callback(null);
        return vi.fn();
      });

      const auth = createAuth(testConfig);

      try {
        await auth.signIn();
      } catch {
        // Expected
      }

      const state = auth.getAuthState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('return value shape', () => {
    it('should return object with signIn, signOut, getIdToken, getAuthState, onAuthStateChange', () => {
      const auth = createAuth(testConfig);

      expect(typeof auth.signIn).toBe('function');
      expect(typeof auth.signOut).toBe('function');
      expect(typeof auth.getIdToken).toBe('function');
      expect(typeof auth.getAuthState).toBe('function');
      expect(typeof auth.onAuthStateChange).toBe('function');
    });
  });

  describe('mapUser - photoURL from providerData fallback (Fix 8.4-fix-1)', () => {
    it('should use providerData photoURL when user.photoURL is null', () => {
      const firebaseUserNoRootPhoto = {
        uid: 'uid-no-root-photo',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: null,
        providerData: [
          {
            providerId: 'google.com',
            uid: 'google-uid',
            displayName: 'Test User',
            email: 'test@example.com',
            photoURL: 'https://lh3.googleusercontent.com/photo123',
          },
        ],
      };

      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(firebaseUserNoRootPhoto);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.user.photoURL).toBe('https://lh3.googleusercontent.com/photo123');
    });

    it('should use providerData displayName when user.displayName is null', () => {
      const firebaseUserNoRootName = {
        uid: 'uid-no-root-name',
        email: 'test@example.com',
        displayName: null,
        photoURL: null,
        providerData: [
          {
            providerId: 'google.com',
            uid: 'google-uid',
            displayName: 'Google Display Name',
            email: 'test@example.com',
            photoURL: 'https://lh3.googleusercontent.com/photo456',
          },
        ],
      };

      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(firebaseUserNoRootName);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.user.displayName).toBe('Google Display Name');
    });

    it('should prefer root user photoURL over providerData when both are available', () => {
      const firebaseUserWithBoth = {
        uid: 'uid-both',
        email: 'test@example.com',
        displayName: 'Root Name',
        photoURL: 'https://root-photo-url.com/photo.jpg',
        providerData: [
          {
            providerId: 'google.com',
            uid: 'google-uid',
            displayName: 'Provider Name',
            email: 'test@example.com',
            photoURL: 'https://lh3.googleusercontent.com/provider-photo',
          },
        ],
      };

      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(firebaseUserWithBoth);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.user.photoURL).toBe('https://root-photo-url.com/photo.jpg');
    });

    it('should return null photoURL when neither root nor providerData has it', () => {
      const firebaseUserNoPhoto = {
        uid: 'uid-no-photo',
        email: 'test@example.com',
        displayName: 'No Photo User',
        photoURL: null,
        providerData: [
          {
            providerId: 'google.com',
            uid: 'google-uid',
            displayName: 'No Photo Provider',
            email: 'test@example.com',
            photoURL: null,
          },
        ],
      };

      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(firebaseUserNoPhoto);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.user.photoURL).toBeNull();
    });

    it('should handle empty providerData array gracefully', () => {
      const firebaseUserEmptyProviders = {
        uid: 'uid-empty-providers',
        email: 'test@example.com',
        displayName: null,
        photoURL: null,
        providerData: [],
      };

      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        callback(firebaseUserEmptyProviders);
        return vi.fn();
      });

      const auth = createAuth(testConfig);
      const state = auth.getAuthState();

      expect(state.user.photoURL).toBeNull();
      expect(state.user.displayName).toBeNull();
    });
  });

  describe('setState - listener error isolation (Fix 8.4-fix-1)', () => {
    it('should continue notifying subsequent listeners even if an earlier listener throws', () => {
      let authStateCallback;
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        authStateCallback = callback;
        return vi.fn();
      });

      const auth = createAuth(testConfig);

      const errorListener = vi.fn(() => {
        throw new Error('listener error');
      });
      const normalListener = vi.fn();

      auth.onAuthStateChange(errorListener);
      auth.onAuthStateChange(normalListener);

      // Trigger state change - both listeners should be notified
      authStateCallback(mockFirebaseUser);

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });
});
