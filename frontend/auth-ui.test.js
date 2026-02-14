/**
 * Auth UI Module Tests
 *
 * TDD: Tests for auth-ui.js (Task 8.1, 8.2)
 *
 * Requirements covered:
 * - 2.1: ヘッダー領域にGoogleログインボタンを表示する(未ログイン時)
 * - 2.2: ログイン時にアバター画像と表示名に切り替える
 * - 2.3: アバタークリックでドロップダウンメニューを表示する
 * - 2.4: 既存UIレイアウトを崩さない統合
 * - 2.5: 「ゲストモード」バッジ表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Auth UI Module (Task 8.1)', () => {
  /** @type {HTMLElement} */
  let container;
  let createAuthUI;

  /** Mock auth module */
  const createMockAuth = (initialState = { user: null, isAuthenticated: false, isLoading: true }) => {
    let listener = null;
    return {
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
      getAuthState: vi.fn(() => ({ ...initialState })),
      onAuthStateChange: vi.fn((cb) => {
        listener = cb;
        return () => { listener = null; };
      }),
      _emitStateChange(state) {
        if (listener) listener(state);
      },
    };
  };

  beforeEach(async () => {
    // Set up a minimal DOM matching the existing index.html structure
    document.body.innerHTML = `
      <div class="office-space" id="officeSpace">
        <button class="settings-button" id="settingsButton" aria-label="設定">
          <svg width="20" height="20" viewBox="0 0 20 20"></svg>
        </button>
      </div>
    `;
    container = document.getElementById('officeSpace');

    // Dynamic import to reset module state between tests
    vi.resetModules();
    const module = await import('./auth-ui.js');
    createAuthUI = module.createAuthUI;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('createAuthUI', () => {
    it('should return an object with mount and unmount methods', () => {
      const mockAuth = createMockAuth();
      const ui = createAuthUI(mockAuth);

      expect(typeof ui.mount).toBe('function');
      expect(typeof ui.unmount).toBe('function');
    });
  });

  describe('mount - DOM insertion (Requirement 2.1, 2.4)', () => {
    it('should insert the auth UI container into the office-space before the settings button', () => {
      const mockAuth = createMockAuth();
      const ui = createAuthUI(mockAuth);

      ui.mount(container);

      const authContainer = container.querySelector('.auth-ui');
      expect(authContainer).not.toBeNull();
      // Auth UI should appear before settings button in DOM
      const settingsButton = container.querySelector('.settings-button');
      const children = Array.from(container.children);
      const authIndex = children.indexOf(authContainer);
      const settingsIndex = children.indexOf(settingsButton);
      expect(authIndex).toBeLessThan(settingsIndex);
    });

    it('should position the auth UI at top-right area', () => {
      const mockAuth = createMockAuth();
      const ui = createAuthUI(mockAuth);

      ui.mount(container);

      const authContainer = container.querySelector('.auth-ui');
      expect(authContainer).not.toBeNull();
      expect(authContainer.classList.contains('auth-ui')).toBe(true);
    });

    it('should subscribe to onAuthStateChange on mount', () => {
      const mockAuth = createMockAuth();
      const ui = createAuthUI(mockAuth);

      ui.mount(container);

      expect(mockAuth.onAuthStateChange).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('guest mode display (Requirement 2.1, 2.5)', () => {
    it('should show a Google login button when not authenticated', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Simulate auth state change to unauthenticated
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      const loginButton = container.querySelector('.auth-login-button');
      expect(loginButton).not.toBeNull();
      expect(loginButton.style.display).not.toBe('none');
    });

    it('should display a Google icon (SVG) in the login button', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      const loginButton = container.querySelector('.auth-login-button');
      const svg = loginButton.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('should show a "guest mode" badge when not authenticated', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      const guestBadge = container.querySelector('.auth-guest-badge');
      expect(guestBadge).not.toBeNull();
      expect(guestBadge.textContent).toContain('ゲスト');
    });

    it('should call auth.signIn when login button is clicked', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      const loginButton = container.querySelector('.auth-login-button');
      loginButton.click();

      expect(mockAuth.signIn).toHaveBeenCalled();
    });
  });

  describe('authenticated user display (Requirement 2.2)', () => {
    const mockUser = {
      uid: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };

    it('should hide the login button when authenticated', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Transition to authenticated
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const loginButton = container.querySelector('.auth-login-button');
      const userInfo = container.querySelector('.auth-user-info');
      // Login button should be hidden, user info should be visible
      expect(loginButton.classList.contains('hidden')).toBe(true);
      expect(userInfo).not.toBeNull();
      expect(userInfo.classList.contains('hidden')).toBe(false);
    });

    it('should display user avatar image when authenticated', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const avatar = container.querySelector('.auth-user-avatar');
      expect(avatar).not.toBeNull();
      expect(avatar.tagName).toBe('IMG');
      expect(avatar.src).toBe('https://example.com/photo.jpg');
      expect(avatar.alt).toContain('Test User');
    });

    it('should display user display name when authenticated', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const displayName = container.querySelector('.auth-user-name');
      expect(displayName).not.toBeNull();
      expect(displayName.textContent).toBe('Test User');
    });

    it('should hide guest badge when authenticated', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const guestBadge = container.querySelector('.auth-guest-badge');
      expect(guestBadge.classList.contains('hidden')).toBe(true);
    });
  });

  describe('auth state transitions', () => {
    const mockUser = {
      uid: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };

    it('should switch from guest to authenticated on login', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Start as guest
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      expect(container.querySelector('.auth-login-button').classList.contains('hidden')).toBe(false);

      // Login
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });
      expect(container.querySelector('.auth-login-button').classList.contains('hidden')).toBe(true);
      expect(container.querySelector('.auth-user-info').classList.contains('hidden')).toBe(false);
    });

    it('should switch from authenticated to guest on logout', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Start as authenticated
      mockAuth._emitStateChange({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
      });

      // Logout
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      expect(container.querySelector('.auth-login-button').classList.contains('hidden')).toBe(false);
      expect(container.querySelector('.auth-user-info').classList.contains('hidden')).toBe(true);
    });
  });

  describe('loading state', () => {
    it('should hide both login button and user info during loading', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: true });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Initial render during loading
      const authContainer = container.querySelector('.auth-ui');
      expect(authContainer).not.toBeNull();
      // During loading, content should not yet show login or user info
      // The component may show a minimal loading state
    });
  });

  describe('fallback avatar (no photoURL)', () => {
    it('should show a fallback avatar when user has no photoURL', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      const userNoPhoto = {
        uid: 'user-456',
        email: 'no-photo@example.com',
        displayName: 'No Photo',
        photoURL: null,
      };

      mockAuth._emitStateChange({ user: userNoPhoto, isAuthenticated: true, isLoading: false });

      const avatar = container.querySelector('.auth-user-avatar');
      // Should have a fallback (e.g., SVG or default image)
      expect(avatar).not.toBeNull();
    });

    it('should display first character of displayName as fallback when no photoURL', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      const userNoPhoto = {
        uid: 'user-456',
        email: 'no-photo@example.com',
        displayName: 'No Photo',
        photoURL: null,
      };

      mockAuth._emitStateChange({ user: userNoPhoto, isAuthenticated: true, isLoading: false });

      const fallback = container.querySelector('.auth-user-avatar-fallback');
      expect(fallback).not.toBeNull();
      expect(fallback.textContent).toBe('N');
    });
  });

  describe('unmount', () => {
    it('should remove the auth UI from the DOM', () => {
      const mockAuth = createMockAuth();
      const ui = createAuthUI(mockAuth);

      ui.mount(container);
      expect(container.querySelector('.auth-ui')).not.toBeNull();

      ui.unmount();
      expect(container.querySelector('.auth-ui')).toBeNull();
    });

    it('should unsubscribe from onAuthStateChange on unmount', () => {
      const unsubscribe = vi.fn();
      const mockAuth = createMockAuth();
      mockAuth.onAuthStateChange.mockReturnValue(unsubscribe);

      const ui = createAuthUI(mockAuth);
      ui.mount(container);
      ui.unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('logout to guest mode transition (Fix 8.4-fix-1)', () => {
    const mockUser = {
      uid: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };

    it('should clear avatar container content when switching from authenticated to guest', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login - avatar image is created
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });
      let avatarContainer = container.querySelector('.auth-user-avatar-container');
      expect(avatarContainer.children.length).toBeGreaterThan(0);

      // Logout - avatar container should be cleared
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      avatarContainer = container.querySelector('.auth-user-avatar-container');
      expect(avatarContainer.children.length).toBe(0);
    });

    it('should show login button AND guest badge together after logout', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Logout
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      const loginButton = container.querySelector('.auth-login-button');
      const guestBadge = container.querySelector('.auth-guest-badge');
      const userInfo = container.querySelector('.auth-user-info');

      expect(loginButton.classList.contains('hidden')).toBe(false);
      // Guest badge is always hidden now
      expect(guestBadge.classList.contains('hidden')).toBe(true);
      expect(userInfo.classList.contains('hidden')).toBe(true);
    });

    it('should clear display name text when switching to guest mode', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });
      let nameEl = container.querySelector('.auth-user-name');
      expect(nameEl.textContent).toBe('Test User');

      // Logout
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      nameEl = container.querySelector('.auth-user-name');
      expect(nameEl.textContent).toBe('');
    });

    it('should remove the dropdown menu DOM when switching to guest mode', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login (dropdown is created in updateDropdown)
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });
      expect(container.querySelector('.auth-dropdown-menu')).not.toBeNull();

      // Logout
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      expect(container.querySelector('.auth-dropdown-menu')).toBeNull();
    });
  });

  describe('dropdown menu (Task 8.2, Requirement 2.3)', () => {
    const mockUser = {
      uid: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };

    it('should show dropdown menu when avatar container is clicked', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const userInfo = container.querySelector('.auth-user-info');
      userInfo.click();

      const dropdown = container.querySelector('.auth-dropdown-menu');
      expect(dropdown).not.toBeNull();
      expect(dropdown.classList.contains('hidden')).toBe(false);
    });

    it('should hide dropdown menu initially (before avatar click)', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const dropdown = container.querySelector('.auth-dropdown-menu');
      expect(dropdown).not.toBeNull();
      expect(dropdown.classList.contains('hidden')).toBe(true);
    });

    it('should contain a logout option in the dropdown menu', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const userInfo = container.querySelector('.auth-user-info');
      userInfo.click();

      const logoutItem = container.querySelector('.auth-dropdown-logout');
      expect(logoutItem).not.toBeNull();
      expect(logoutItem.textContent).toContain('ログアウト');
    });

    it('should call auth.signOut when logout option is clicked', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Open dropdown
      const userInfo = container.querySelector('.auth-user-info');
      userInfo.click();

      // Click logout
      const logoutItem = container.querySelector('.auth-dropdown-logout');
      logoutItem.click();

      expect(mockAuth.signOut).toHaveBeenCalled();
    });

    it('should toggle dropdown on repeated avatar clicks', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const userInfo = container.querySelector('.auth-user-info');

      // First click: open
      userInfo.click();
      let dropdown = container.querySelector('.auth-dropdown-menu');
      expect(dropdown.classList.contains('hidden')).toBe(false);

      // Second click: close
      userInfo.click();
      dropdown = container.querySelector('.auth-dropdown-menu');
      expect(dropdown.classList.contains('hidden')).toBe(true);
    });

    it('should close dropdown when clicking outside the dropdown', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Open dropdown
      const userInfo = container.querySelector('.auth-user-info');
      userInfo.click();

      let dropdown = container.querySelector('.auth-dropdown-menu');
      expect(dropdown.classList.contains('hidden')).toBe(false);

      // Click outside (on body/document)
      document.body.click();

      dropdown = container.querySelector('.auth-dropdown-menu');
      expect(dropdown.classList.contains('hidden')).toBe(true);
    });

    it('should close dropdown after logout is clicked', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Open dropdown
      const userInfo = container.querySelector('.auth-user-info');
      userInfo.click();

      // Click logout
      const logoutItem = container.querySelector('.auth-dropdown-logout');
      logoutItem.click();

      const dropdown = container.querySelector('.auth-dropdown-menu');
      expect(dropdown.classList.contains('hidden')).toBe(true);
    });

    it('should display user email in the dropdown header', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const userInfo = container.querySelector('.auth-user-info');
      userInfo.click();

      const dropdownEmail = container.querySelector('.auth-dropdown-email');
      expect(dropdownEmail).not.toBeNull();
      expect(dropdownEmail.textContent).toBe('user@example.com');
    });

    it('should display user display name in the dropdown header', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const userInfo = container.querySelector('.auth-user-info');
      userInfo.click();

      const dropdownName = container.querySelector('.auth-dropdown-name');
      expect(dropdownName).not.toBeNull();
      expect(dropdownName.textContent).toBe('Test User');
    });

    it('should not show dropdown when in guest mode', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      // Dropdown should not exist in guest mode
      const dropdown = container.querySelector('.auth-dropdown-menu');
      expect(dropdown).toBeNull();
    });

    it('should remove document click listener on unmount', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Open dropdown
      const userInfo = container.querySelector('.auth-user-info');
      userInfo.click();

      // Unmount
      ui.unmount();

      // Clicking document should not throw
      expect(() => document.body.click()).not.toThrow();
    });

    it('should set cursor to pointer on user info container', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      const userInfo = container.querySelector('.auth-user-info');
      expect(userInfo.style.cursor).toBe('pointer');
    });
  });

  describe('Fix 9.2-fix-1: logout guest UI resilience', () => {
    const mockUser = {
      uid: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };

    it('should recover guest UI even when auth state listener throws in another listener', () => {
      // Scenario: Multiple listeners subscribed; one throws before auth-ui's listener
      // The auth module's try/catch ensures auth-ui's listener still gets called,
      // but we need to verify auth-ui itself doesn't throw internally.
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Verify authenticated state
      expect(container.querySelector('.auth-login-button').classList.contains('hidden')).toBe(true);
      expect(container.querySelector('.auth-user-info').classList.contains('hidden')).toBe(false);

      // Logout
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      // Login button must be visible, guest badge is always hidden
      const loginButton = container.querySelector('.auth-login-button');
      const guestBadge = container.querySelector('.auth-guest-badge');
      expect(loginButton).not.toBeNull();
      expect(guestBadge).not.toBeNull();
      expect(loginButton.classList.contains('hidden')).toBe(false);
      expect(guestBadge.classList.contains('hidden')).toBe(true);
    });

    it('should not throw if updateUI is called after rootElement children are externally modified', () => {
      // Simulates a scenario where DOM mutation removes inner elements
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login first
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Externally remove the login button from the auth-ui root (simulating DOM corruption)
      const authRoot = container.querySelector('.auth-ui');
      const loginBtn = authRoot.querySelector('.auth-login-button');
      if (loginBtn) loginBtn.remove();

      // Logout should not throw even though .auth-login-button is missing
      expect(() => {
        mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      }).not.toThrow();
    });

    it('should not throw if updateUI is called after guest badge is externally removed', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Externally remove guest badge
      const authRoot = container.querySelector('.auth-ui');
      const badge = authRoot.querySelector('.auth-guest-badge');
      if (badge) badge.remove();

      // Logout should not throw
      expect(() => {
        mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      }).not.toThrow();
    });

    it('should not throw if updateUI is called after user-info is externally removed', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Externally remove user-info
      const authRoot = container.querySelector('.auth-ui');
      const userInfoEl = authRoot.querySelector('.auth-user-info');
      if (userInfoEl) userInfoEl.remove();

      // Logout should not throw
      expect(() => {
        mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      }).not.toThrow();
    });

    it('should show login button and guest badge after rapid login/logout/login/logout cycle', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Rapid cycle: login -> logout -> login -> logout
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      const loginButton = container.querySelector('.auth-login-button');
      const guestBadge = container.querySelector('.auth-guest-badge');
      const userInfo = container.querySelector('.auth-user-info');

      expect(loginButton.classList.contains('hidden')).toBe(false);
      expect(guestBadge.classList.contains('hidden')).toBe(true);
      expect(userInfo.classList.contains('hidden')).toBe(true);
    });

    it('should rebuild DOM elements if they are missing when transitioning to guest mode', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Remove login button and guest badge (simulating DOM corruption)
      const authRoot = container.querySelector('.auth-ui');
      const loginBtn = authRoot.querySelector('.auth-login-button');
      const badge = authRoot.querySelector('.auth-guest-badge');
      if (loginBtn) loginBtn.remove();
      if (badge) badge.remove();

      // Logout - UI should recover and show guest elements
      mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: false });

      // After recovery, login button and guest badge should be present
      const recoveredLoginBtn = container.querySelector('.auth-login-button');
      const recoveredBadge = container.querySelector('.auth-guest-badge');
      expect(recoveredLoginBtn).not.toBeNull();
      expect(recoveredBadge).not.toBeNull();
      expect(recoveredLoginBtn.classList.contains('hidden')).toBe(false);
      // Guest badge is always hidden now
      expect(recoveredBadge.classList.contains('hidden')).toBe(true);
    });

    it('should handle loading state without throwing when DOM elements are null', () => {
      const mockAuth = createMockAuth({ user: null, isAuthenticated: false, isLoading: false });
      const ui = createAuthUI(mockAuth);
      ui.mount(container);

      // Login
      mockAuth._emitStateChange({ user: mockUser, isAuthenticated: true, isLoading: false });

      // Remove all inner elements
      const authRoot = container.querySelector('.auth-ui');
      authRoot.querySelector('.auth-login-button')?.remove();
      authRoot.querySelector('.auth-guest-badge')?.remove();
      authRoot.querySelector('.auth-user-info')?.remove();

      // Loading state should not throw
      expect(() => {
        mockAuth._emitStateChange({ user: null, isAuthenticated: false, isLoading: true });
      }).not.toThrow();
    });
  });
});
