/**
 * Credential Settings UI Component Tests
 *
 * TDD tests for the IoT credential settings section in the settings modal.
 * Tests DOM creation, auth state reactivity, save/delete API calls, and feedback display.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import the module under test
const { createCredentialSettings } = await import('./credential-settings.js');

// Helper to create a mock auth instance
function createMockAuth({ isAuthenticated = false, user = null } = {}) {
  const listeners = new Set();
  let currentState = {
    user,
    isAuthenticated,
    isLoading: false,
  };

  return {
    getAuthState() {
      return { ...currentState };
    },
    onAuthStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async getIdToken() {
      return isAuthenticated ? 'mock-id-token' : null;
    },
    // Test helper: simulate state change
    _setState(newState) {
      currentState = newState;
      for (const listener of listeners) {
        listener(currentState);
      }
    },
  };
}

// Helper to create a mock backend API
function createMockBackendApi() {
  return {
    saveCredential: vi.fn().mockResolvedValue({ ok: true }),
    getCredentialStatus: vi.fn().mockResolvedValue({
      credentials: [],
    }),
    deleteCredential: vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe('Credential Settings UI', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mockFetch.mockReset();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  describe('createCredentialSettings', () => {
    it('should return an object with mount, unmount, and refresh methods', () => {
      const auth = createMockAuth();
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      expect(settings).toBeDefined();
      expect(typeof settings.mount).toBe('function');
      expect(typeof settings.unmount).toBe('function');
      expect(typeof settings.refresh).toBe('function');
    });

    it('should mount the credential section into a container element', () => {
      const auth = createMockAuth();
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const section = container.querySelector('.credential-settings-section');
      expect(section).not.toBeNull();
    });

    it('should unmount the credential section from the container', () => {
      const auth = createMockAuth();
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      expect(container.querySelector('.credential-settings-section')).not.toBeNull();

      settings.unmount();
      expect(container.querySelector('.credential-settings-section')).toBeNull();
    });
  });

  // Requirement 5.5: IoTクレデンシャル設定セクションを非表示にするか、ログインを促す表示にする
  describe('unauthenticated state (Req 5.5)', () => {
    it('should show login prompt when user is not authenticated', () => {
      const auth = createMockAuth({ isAuthenticated: false });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const loginPrompt = container.querySelector('.credential-login-prompt');
      expect(loginPrompt).not.toBeNull();
      expect(loginPrompt.textContent).toContain('ログイン');
    });

    it('should hide the credential form when not authenticated', () => {
      const auth = createMockAuth({ isAuthenticated: false });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const form = container.querySelector('.credential-form');
      expect(form).toBeNull();
    });

    it('should still show the section title when not authenticated', () => {
      const auth = createMockAuth({ isAuthenticated: false });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const title = container.querySelector('.settings-section-title');
      expect(title).not.toBeNull();
      expect(title.textContent).toContain('IoT');
    });
  });

  // Requirement 5.1: 設定モーダルにIoTクレデンシャル設定セクションを表示する
  describe('authenticated state (Req 5.1)', () => {
    it('should show the credential form when user is authenticated', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const form = container.querySelector('.credential-form');
      expect(form).not.toBeNull();
    });

    it('should not show the login prompt when authenticated', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const loginPrompt = container.querySelector('.credential-login-prompt');
      expect(loginPrompt).toBeNull();
    });

    it('should switch from login prompt to form when user logs in', () => {
      const auth = createMockAuth({ isAuthenticated: false });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      expect(container.querySelector('.credential-login-prompt')).not.toBeNull();
      expect(container.querySelector('.credential-form')).toBeNull();

      // Simulate login
      auth._setState({
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
        isAuthenticated: true,
        isLoading: false,
      });

      expect(container.querySelector('.credential-login-prompt')).toBeNull();
      expect(container.querySelector('.credential-form')).not.toBeNull();
    });

    it('should switch from form to login prompt when user logs out', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      expect(container.querySelector('.credential-form')).not.toBeNull();

      // Simulate logout
      auth._setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });

      expect(container.querySelector('.credential-form')).toBeNull();
      expect(container.querySelector('.credential-login-prompt')).not.toBeNull();
    });
  });

  // Requirement 5.2: Nature Remoトークンの入力フォーム
  describe('token input form (Req 5.2)', () => {
    it('should have a password input field for Nature Remo token', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      expect(input).not.toBeNull();
      expect(input.placeholder).toBeTruthy();
    });

    it('should have a save button', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const saveButton = container.querySelector('.credential-save-button');
      expect(saveButton).not.toBeNull();
      expect(saveButton.textContent).toContain('保存');
    });

    it('should have a delete button', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const deleteButton = container.querySelector('.credential-delete-button');
      expect(deleteButton).not.toBeNull();
    });

    it('should show Nature Remo label', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const label = container.querySelector('.credential-service-label');
      expect(label).not.toBeNull();
      expect(label.textContent).toContain('Nature Remo');
    });
  });

  // Requirement 5.3: 保存フィードバック
  describe('save credential (Req 5.3)', () => {
    it('should call saveCredential API when save button is clicked with token', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = 'ory_at_test_token_12345';
      saveButton.click();

      // Wait for async operation
      await vi.waitFor(() => {
        expect(api.saveCredential).toHaveBeenCalledWith('nature-remo', 'ory_at_test_token_12345');
      });
    });

    it('should show success feedback after saving', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.saveCredential.mockResolvedValue({ ok: true });
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = 'ory_at_test_token';
      saveButton.click();

      await vi.waitFor(() => {
        const feedback = container.querySelector('.credential-feedback');
        expect(feedback).not.toBeNull();
        expect(feedback.classList.contains('credential-feedback-success')).toBe(true);
      });
    });

    it('should show error feedback when save fails', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.saveCredential.mockRejectedValue(new Error('Network error'));
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = 'ory_at_test_token';
      saveButton.click();

      await vi.waitFor(() => {
        const feedback = container.querySelector('.credential-feedback');
        expect(feedback).not.toBeNull();
        expect(feedback.classList.contains('credential-feedback-error')).toBe(true);
      });
    });

    it('should not call API when input is empty', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = '';
      saveButton.click();

      expect(api.saveCredential).not.toHaveBeenCalled();
    });

    it('should not call API when input is only whitespace', () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = '   ';
      saveButton.click();

      expect(api.saveCredential).not.toHaveBeenCalled();
    });

    it('should clear the input after successful save', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.saveCredential.mockResolvedValue({ ok: true });
      api.getCredentialStatus.mockResolvedValue({
        credentials: [{ service: 'nature-remo', configured: true, updatedAt: '2026-02-14T10:00:00Z' }],
      });
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = 'ory_at_test_token';
      saveButton.click();

      await vi.waitFor(() => {
        expect(input.value).toBe('');
      });
    });
  });

  // Requirement 5.4: マスク表示
  describe('configured status display (Req 5.4)', () => {
    it('should show configured status when token is already saved', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.getCredentialStatus.mockResolvedValue({
        credentials: [
          { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T10:00:00Z' },
        ],
      });
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      await settings.refresh();

      await vi.waitFor(() => {
        const status = container.querySelector('.credential-configured-status');
        expect(status).not.toBeNull();
        expect(status.textContent).toContain('設定済み');
      });
    });

    it('should show not-configured status when no token is saved', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.getCredentialStatus.mockResolvedValue({
        credentials: [],
      });
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      await settings.refresh();

      await vi.waitFor(() => {
        const status = container.querySelector('.credential-configured-status');
        expect(status).not.toBeNull();
        expect(status.textContent).toContain('未設定');
      });
    });

    it('should fetch credential status on refresh', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      await settings.refresh();

      expect(api.getCredentialStatus).toHaveBeenCalled();
    });

    it('should not fetch credential status when not authenticated', async () => {
      const auth = createMockAuth({ isAuthenticated: false });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      await settings.refresh();

      expect(api.getCredentialStatus).not.toHaveBeenCalled();
    });
  });

  // Delete credential
  describe('delete credential', () => {
    it('should call deleteCredential API when delete button is clicked', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.getCredentialStatus.mockResolvedValue({
        credentials: [
          { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T10:00:00Z' },
        ],
      });
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      await settings.refresh();

      // Wait for status to render
      await vi.waitFor(() => {
        const deleteButton = container.querySelector('.credential-delete-button');
        expect(deleteButton).not.toBeNull();
      });

      const deleteButton = container.querySelector('.credential-delete-button');
      deleteButton.click();

      await vi.waitFor(() => {
        expect(api.deleteCredential).toHaveBeenCalledWith('nature-remo');
      });
    });

    it('should refresh status after successful deletion', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.getCredentialStatus.mockResolvedValue({
        credentials: [
          { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T10:00:00Z' },
        ],
      });
      api.deleteCredential.mockResolvedValue({ ok: true });
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      await settings.refresh();

      // Clear mock call count from initial refresh
      api.getCredentialStatus.mockClear();

      // Change response for after deletion
      api.getCredentialStatus.mockResolvedValue({
        credentials: [],
      });

      const deleteButton = container.querySelector('.credential-delete-button');
      deleteButton.click();

      await vi.waitFor(() => {
        // getCredentialStatus should be called again after delete
        expect(api.getCredentialStatus).toHaveBeenCalled();
      });
    });

    it('should show error feedback when delete fails', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.getCredentialStatus.mockResolvedValue({
        credentials: [
          { service: 'nature-remo', configured: true, updatedAt: '2026-02-14T10:00:00Z' },
        ],
      });
      api.deleteCredential.mockRejectedValue(new Error('Network error'));
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      await settings.refresh();

      const deleteButton = container.querySelector('.credential-delete-button');
      deleteButton.click();

      await vi.waitFor(() => {
        const feedback = container.querySelector('.credential-feedback');
        expect(feedback).not.toBeNull();
        expect(feedback.classList.contains('credential-feedback-error')).toBe(true);
      });
    });
  });

  // onCredentialChange callback
  describe('onCredentialChange callback', () => {
    it('should call onCredentialChange after successful save', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const onCredentialChange = vi.fn();
      const settings = createCredentialSettings({ auth, backendApi: api, onCredentialChange });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = 'ory_at_test_token';
      saveButton.click();

      await vi.waitFor(() => {
        expect(onCredentialChange).toHaveBeenCalledTimes(1);
      });
    });

    it('should call onCredentialChange after successful delete', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const onCredentialChange = vi.fn();
      const settings = createCredentialSettings({ auth, backendApi: api, onCredentialChange });

      settings.mount(container);

      const deleteButton = container.querySelector('.credential-delete-button');
      deleteButton.click();

      await vi.waitFor(() => {
        expect(onCredentialChange).toHaveBeenCalledTimes(1);
      });
    });

    it('should not call onCredentialChange when save fails', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      api.saveCredential.mockRejectedValue(new Error('Network error'));
      const onCredentialChange = vi.fn();
      const settings = createCredentialSettings({ auth, backendApi: api, onCredentialChange });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = 'ory_at_test_token';
      saveButton.click();

      await vi.waitFor(() => {
        expect(container.querySelector('.credential-feedback-error')).not.toBeNull();
      });
      expect(onCredentialChange).not.toHaveBeenCalled();
    });

    it('should work without onCredentialChange callback', async () => {
      const auth = createMockAuth({
        isAuthenticated: true,
        user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
      });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);

      const input = container.querySelector('input[type="password"]');
      const saveButton = container.querySelector('.credential-save-button');

      input.value = 'ory_at_test_token';
      saveButton.click();

      await vi.waitFor(() => {
        expect(api.saveCredential).toHaveBeenCalled();
      });
      // Should not throw
    });
  });

  // Unsubscribe on unmount
  describe('lifecycle', () => {
    it('should unsubscribe from auth state changes on unmount', () => {
      const auth = createMockAuth({ isAuthenticated: false });
      const api = createMockBackendApi();
      const settings = createCredentialSettings({ auth, backendApi: api });

      settings.mount(container);
      settings.unmount();

      // Simulate login after unmount - should not throw or change DOM
      expect(() => {
        auth._setState({
          user: { uid: 'user-1', displayName: 'Test', email: 'test@example.com', photoURL: null },
          isAuthenticated: true,
          isLoading: false,
        });
      }).not.toThrow();
    });
  });
});
