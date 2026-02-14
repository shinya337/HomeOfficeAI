/**
 * Auth UI Module for HomeOffice.ai
 *
 * Manages the login button, user avatar, dropdown menu, and guest mode badge display
 * in the header area. Subscribes to auth state changes to update the DOM.
 *
 * Requirements:
 * - 2.1: ヘッダー領域にGoogleログインボタンを表示する(未ログイン時)
 * - 2.2: ログイン時にアバター画像と表示名に切り替える
 * - 2.3: アバタークリックでドロップダウンメニューを表示する
 * - 2.4: 既存UIレイアウトを崩さない統合
 * - 2.5: 「ゲストモード」バッジ表示
 */

/**
 * Google "G" icon as an SVG string.
 * @returns {string}
 */
function googleIconSVG() {
  return `<svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.96 23.96 0 000 24c0 3.77.9 7.35 2.56 10.53l7.97-5.94z"/>
    <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.94C6.51 42.62 14.62 48 24 48z"/>
  </svg>`;
}

/**
 * Create the auth UI component.
 *
 * @param {Object} auth - The auth module from createAuth()
 * @param {() => Promise<void>} auth.signIn
 * @param {() => Promise<void>} auth.signOut
 * @param {() => Object} auth.getAuthState
 * @param {(listener: Function) => () => void} auth.onAuthStateChange
 * @returns {{ mount: (container: HTMLElement) => void, unmount: () => void }}
 */
export function createAuthUI(auth) {
  /** @type {HTMLElement|null} */
  let rootElement = null;
  /** @type {(() => void)|null} */
  let unsubscribe = null;
  /** @type {((e: Event) => void)|null} */
  let documentClickHandler = null;

  // Inner DOM references
  /** @type {HTMLElement|null} */
  let loginButton = null;
  /** @type {HTMLElement|null} */
  let userInfo = null;
  /** @type {HTMLElement|null} */
  let guestBadge = null;

  // Current user state for dropdown rendering
  /** @type {Object|null} */
  let currentUser = null;

  /**
   * Build the auth UI DOM structure.
   * @returns {HTMLElement}
   */
  function buildDOM() {
    const el = document.createElement('div');
    el.className = 'auth-ui';

    el.innerHTML = `
      <button class="auth-login-button hidden" aria-label="Googleでログイン">
        ${googleIconSVG()}
        <span class="auth-login-text">ログイン</span>
      </button>
      <span class="auth-guest-badge hidden">ゲスト</span>
      <div class="auth-user-info hidden">
        <div class="auth-user-avatar-container"></div>
        <span class="auth-user-name"></span>
      </div>
    `;

    return el;
  }

  /**
   * Build the dropdown menu DOM for the authenticated user.
   * @param {Object} user
   * @returns {HTMLElement}
   */
  function buildDropdownDOM(user) {
    const dropdown = document.createElement('div');
    dropdown.className = 'auth-dropdown-menu hidden';

    dropdown.innerHTML = `
      <div class="auth-dropdown-header">
        <span class="auth-dropdown-name">${user.displayName || ''}</span>
        <span class="auth-dropdown-email">${user.email || ''}</span>
      </div>
      <div class="auth-dropdown-divider"></div>
      <button class="auth-dropdown-logout" type="button">ログアウト</button>
    `;

    return dropdown;
  }

  /**
   * Toggle the dropdown menu visibility.
   */
  function toggleDropdown() {
    if (!rootElement) return;
    const dropdown = rootElement.querySelector('.auth-dropdown-menu');
    if (!dropdown) return;
    dropdown.classList.toggle('hidden');
  }

  /**
   * Close the dropdown menu.
   */
  function closeDropdown() {
    if (!rootElement) return;
    const dropdown = rootElement.querySelector('.auth-dropdown-menu');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  }

  /**
   * Handle click outside of the dropdown to close it.
   * @param {Event} event
   */
  function handleDocumentClick(event) {
    if (!rootElement) return;
    const userInfoEl = rootElement.querySelector('.auth-user-info');
    const dropdown = rootElement.querySelector('.auth-dropdown-menu');
    if (!userInfoEl || !dropdown) return;

    // If click is inside user info or dropdown, do nothing (handled by other handlers)
    if (userInfoEl.contains(/** @type {Node} */ (event.target)) ||
        dropdown.contains(/** @type {Node} */ (event.target))) {
      return;
    }

    closeDropdown();
  }

  /**
   * Handle logout button click in dropdown.
   */
  function handleLogoutClick() {
    closeDropdown();
    auth.signOut().catch((error) => {
      console.error('[AuthUI] Sign-out failed:', error);
    });
  }

  /**
   * Update the dropdown when auth state changes.
   * @param {{ user: Object|null, isAuthenticated: boolean, isLoading: boolean }} state
   */
  function updateDropdown(state) {
    if (!rootElement) return;

    // Remove existing dropdown
    const existingDropdown = rootElement.querySelector('.auth-dropdown-menu');
    if (existingDropdown) {
      existingDropdown.remove();
    }

    if (state.isAuthenticated && state.user) {
      currentUser = state.user;

      // Build and insert dropdown
      const dropdown = buildDropdownDOM(state.user);
      const userInfoEl = rootElement.querySelector('.auth-user-info');
      if (userInfoEl) {
        userInfoEl.style.cursor = 'pointer';
        userInfoEl.appendChild(dropdown);

        // Wire up logout click
        const logoutBtn = dropdown.querySelector('.auth-dropdown-logout');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleLogoutClick();
          });
        }
      }
    } else {
      currentUser = null;
    }
  }

  /**
   * Verify that the three critical child elements (.auth-login-button,
   * .auth-guest-badge, .auth-user-info) exist inside rootElement.  If any
   * are missing (e.g. removed by a browser extension, DOM mutation, or race
   * condition), rebuild the entire inner DOM so the UI can recover.
   *
   * @returns {boolean} true if all elements are present after the check
   */
  function ensureDOMIntegrity() {
    if (!rootElement) return false;

    const hasLoginButton = rootElement.querySelector('.auth-login-button') !== null;
    const hasGuestBadge = rootElement.querySelector('.auth-guest-badge') !== null;
    const hasUserInfo = rootElement.querySelector('.auth-user-info') !== null;

    if (hasLoginButton && hasGuestBadge && hasUserInfo) {
      return true;
    }

    // One or more critical elements are missing -- rebuild the inner HTML
    // while preserving the rootElement's position in the DOM tree.

    // Remove old element references and event listeners
    const oldBtn = rootElement.querySelector('.auth-login-button');
    if (oldBtn) {
      oldBtn.removeEventListener('click', handleLoginClick);
    }
    const oldUserInfo = rootElement.querySelector('.auth-user-info');
    if (oldUserInfo) {
      oldUserInfo.removeEventListener('click', handleUserInfoClick);
    }

    // Rebuild from scratch
    const fresh = buildDOM();
    rootElement.innerHTML = fresh.innerHTML;
    rootElement.className = fresh.className;

    // Re-wire click handlers on the newly built elements
    const newBtn = rootElement.querySelector('.auth-login-button');
    if (newBtn) {
      newBtn.addEventListener('click', handleLoginClick);
    }
    const newUserInfo = rootElement.querySelector('.auth-user-info');
    if (newUserInfo) {
      newUserInfo.addEventListener('click', handleUserInfoClick);
    }

    return true;
  }

  /**
   * Update the UI based on the current auth state.
   * @param {{ user: Object|null, isAuthenticated: boolean, isLoading: boolean }} state
   */
  function updateUI(state) {
    if (!rootElement) return;

    // Ensure DOM integrity -- rebuild if critical children are missing
    ensureDOMIntegrity();

    loginButton = rootElement.querySelector('.auth-login-button');
    userInfo = rootElement.querySelector('.auth-user-info');
    guestBadge = rootElement.querySelector('.auth-guest-badge');

    if (state.isLoading) {
      // Hide everything during loading
      if (loginButton) loginButton.classList.add('hidden');
      if (userInfo) userInfo.classList.add('hidden');
      if (guestBadge) guestBadge.classList.add('hidden');
      return;
    }

    if (state.isAuthenticated && state.user) {
      // Authenticated: show user info, hide login
      if (loginButton) loginButton.classList.add('hidden');
      if (guestBadge) guestBadge.classList.add('hidden');
      if (userInfo) userInfo.classList.remove('hidden');

      // Update avatar
      const avatarContainer = rootElement.querySelector('.auth-user-avatar-container');
      if (avatarContainer) {
        avatarContainer.innerHTML = '';

        if (state.user.photoURL) {
          const img = document.createElement('img');
          img.className = 'auth-user-avatar';
          img.src = state.user.photoURL;
          img.alt = state.user.displayName || 'User';
          avatarContainer.appendChild(img);
        } else {
          // Fallback: show first character of displayName
          const fallback = document.createElement('div');
          fallback.className = 'auth-user-avatar auth-user-avatar-fallback';
          fallback.textContent = (state.user.displayName || '?').charAt(0).toUpperCase();
          avatarContainer.appendChild(fallback);
        }
      }

      // Update display name
      const nameEl = rootElement.querySelector('.auth-user-name');
      if (nameEl) {
        nameEl.textContent = state.user.displayName || '';
      }
    } else {
      // Guest: show login button only
      if (loginButton) loginButton.classList.remove('hidden');
      if (guestBadge) guestBadge.classList.add('hidden');
      if (userInfo) userInfo.classList.add('hidden');

      // Clear authenticated user DOM content to ensure clean guest state.
      // Without this, stale avatar/name content remains in the hidden element
      // and can cause visual artifacts if the hidden class is overridden.
      const avatarContainer = rootElement.querySelector('.auth-user-avatar-container');
      if (avatarContainer) {
        avatarContainer.innerHTML = '';
      }
      const nameEl = rootElement.querySelector('.auth-user-name');
      if (nameEl) {
        nameEl.textContent = '';
      }
    }

    // Update dropdown (add/remove based on auth state)
    updateDropdown(state);
  }

  /**
   * Handle login button click.
   */
  function handleLoginClick() {
    auth.signIn().catch((error) => {
      console.error('[AuthUI] Sign-in failed:', error);
    });
  }

  /**
   * Handle user info area click (toggle dropdown).
   * @param {Event} event
   */
  function handleUserInfoClick(event) {
    event.stopPropagation();
    toggleDropdown();
  }

  return {
    /**
     * Mount the auth UI into the given container element.
     * Inserts before the settings button to maintain layout.
     * @param {HTMLElement} container
     */
    mount(container) {
      rootElement = buildDOM();

      // Insert before the settings button
      const settingsButton = container.querySelector('.settings-button');
      if (settingsButton) {
        container.insertBefore(rootElement, settingsButton);
      } else {
        container.appendChild(rootElement);
      }

      // Wire up click handler for login button
      const btn = rootElement.querySelector('.auth-login-button');
      if (btn) {
        btn.addEventListener('click', handleLoginClick);
      }

      // Wire up click handler for user info (dropdown toggle)
      const userInfoEl = rootElement.querySelector('.auth-user-info');
      if (userInfoEl) {
        userInfoEl.addEventListener('click', handleUserInfoClick);
      }

      // Register document-level click handler for closing dropdown on outside click
      documentClickHandler = handleDocumentClick;
      document.addEventListener('click', documentClickHandler);

      // Subscribe to auth state changes
      unsubscribe = auth.onAuthStateChange((state) => {
        updateUI(state);
      });

      // Render initial state
      updateUI(auth.getAuthState());
    },

    /**
     * Remove the auth UI from the DOM and clean up listeners.
     */
    unmount() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      // Remove document-level click handler
      if (documentClickHandler) {
        document.removeEventListener('click', documentClickHandler);
        documentClickHandler = null;
      }

      if (rootElement) {
        const btn = rootElement.querySelector('.auth-login-button');
        if (btn) {
          btn.removeEventListener('click', handleLoginClick);
        }

        const userInfoEl = rootElement.querySelector('.auth-user-info');
        if (userInfoEl) {
          userInfoEl.removeEventListener('click', handleUserInfoClick);
        }

        rootElement.remove();
        rootElement = null;
      }

      currentUser = null;
    },
  };
}
