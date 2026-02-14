/**
 * Credential Settings UI Component
 *
 * Provides the IoT credential settings section within the settings modal.
 * Displays Nature Remo token input form for authenticated users,
 * and a login prompt for unauthenticated users.
 *
 * Requirements:
 * - 5.1: 設定モーダルにIoTクレデンシャル設定セクションを表示する
 * - 5.2: Nature Remoトークンの入力フォーム（テキスト入力、保存ボタン、削除ボタン）を提供する
 * - 5.3: 保存成功/失敗のフィードバックを表示する
 * - 5.4: トークンがマスク表示された状態で設定済みステータスを表示する
 * - 5.5: 未ログイン時は非表示にするか、ログインを促す表示にする
 */

/**
 * @typedef {Object} CredentialSettingsDeps
 * @property {Object} auth - Auth module instance (from createAuth)
 * @property {Object} backendApi - Backend API object with credential methods
 * @property {(service: string, token: string) => Promise<{ok: boolean}>} backendApi.saveCredential
 * @property {() => Promise<{credentials: Array<{service: string, configured: boolean, updatedAt?: string}>}>} backendApi.getCredentialStatus
 * @property {(service: string) => Promise<{ok: boolean}>} backendApi.deleteCredential
 * @property {() => void} [onCredentialChange] - Called after successful save or delete
 */

/**
 * Create the credential settings UI component.
 *
 * @param {CredentialSettingsDeps} deps - Dependencies
 * @returns {{
 *   mount: (container: HTMLElement) => void,
 *   unmount: () => void,
 *   refresh: () => Promise<void>,
 * }}
 */
export function createCredentialSettings({ auth, backendApi, onCredentialChange }) {
  /** @type {HTMLElement|null} */
  let sectionElement = null;

  /** @type {HTMLElement|null} */
  let containerElement = null;

  /** @type {(() => void)|null} */
  let unsubscribeAuth = null;

  /** @type {boolean} */
  let isConfigured = false;

  // =========================================================================
  // DOM Creation
  // =========================================================================

  /**
   * Build the section element with either login prompt or credential form.
   */
  function buildSection(isAuthenticated) {
    const section = document.createElement('div');
    section.className = 'settings-section credential-settings-section';

    // Section title
    const title = document.createElement('h3');
    title.className = 'settings-section-title';
    title.textContent = 'IoT\u30AF\u30EC\u30C7\u30F3\u30B7\u30E3\u30EB';
    section.appendChild(title);

    if (isAuthenticated) {
      section.appendChild(buildCredentialForm());
    } else {
      section.appendChild(buildLoginPrompt());
    }

    return section;
  }

  /**
   * Build the login prompt shown when user is not authenticated.
   */
  function buildLoginPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'credential-login-prompt';

    const text = document.createElement('p');
    text.className = 'credential-login-prompt-text';
    text.textContent = '\u30ED\u30B0\u30A4\u30F3\u3059\u308B\u3068\u3001\u500B\u4EBA\u306EIoT\u30C7\u30D0\u30A4\u30B9\u8A2D\u5B9A\u3092\u4FDD\u5B58\u3067\u304D\u307E\u3059\u3002';

    prompt.appendChild(text);
    return prompt;
  }

  /**
   * Build the credential form for authenticated users.
   */
  function buildCredentialForm() {
    const form = document.createElement('div');
    form.className = 'credential-form';

    // Nature Remo section
    const serviceItem = document.createElement('div');
    serviceItem.className = 'credential-service-item';

    // Service label and status
    const header = document.createElement('div');
    header.className = 'credential-service-header';

    const label = document.createElement('span');
    label.className = 'credential-service-label';
    label.textContent = 'Nature Remo \u30C8\u30FC\u30AF\u30F3';

    const status = document.createElement('span');
    status.className = 'credential-configured-status';
    status.textContent = isConfigured
      ? '\u2705 \u8A2D\u5B9A\u6E08\u307F'
      : '\u26A0 \u672A\u8A2D\u5B9A';

    header.appendChild(label);
    header.appendChild(status);
    serviceItem.appendChild(header);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'credential-input-row';

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'credential-token-input';
    input.placeholder = 'Nature Remo API\u30C8\u30FC\u30AF\u30F3\u3092\u5165\u529B';

    const saveButton = document.createElement('button');
    saveButton.className = 'credential-save-button';
    saveButton.textContent = '\u4FDD\u5B58';
    saveButton.type = 'button';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'credential-delete-button';
    deleteButton.textContent = '\u524A\u9664';
    deleteButton.type = 'button';

    inputRow.appendChild(input);
    inputRow.appendChild(saveButton);
    inputRow.appendChild(deleteButton);
    serviceItem.appendChild(inputRow);

    // Feedback area
    const feedback = document.createElement('div');
    feedback.className = 'credential-feedback-container';
    serviceItem.appendChild(feedback);

    form.appendChild(serviceItem);

    // Event listeners
    saveButton.addEventListener('click', handleSave);
    deleteButton.addEventListener('click', handleDelete);

    return form;
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  async function handleSave() {
    if (!containerElement) return;

    const input = containerElement.querySelector('.credential-token-input');
    const token = input?.value?.trim();

    if (!token) {
      return;
    }

    try {
      await backendApi.saveCredential('nature-remo', token);
      input.value = '';
      showFeedback('success', '\u30C8\u30FC\u30AF\u30F3\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002');
      await refreshStatus();
      if (onCredentialChange) onCredentialChange();
    } catch (error) {
      showFeedback('error', '\u30C8\u30FC\u30AF\u30F3\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
    }
  }

  async function handleDelete() {
    if (!containerElement) return;

    try {
      await backendApi.deleteCredential('nature-remo');
      showFeedback('success', '\u30C8\u30FC\u30AF\u30F3\u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002');
      await refreshStatus();
      if (onCredentialChange) onCredentialChange();
    } catch (error) {
      showFeedback('error', '\u30C8\u30FC\u30AF\u30F3\u306E\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
    }
  }

  // =========================================================================
  // Feedback
  // =========================================================================

  function showFeedback(type, message) {
    if (!containerElement) return;

    const feedbackContainer = containerElement.querySelector('.credential-feedback-container');
    if (!feedbackContainer) return;

    // Remove existing feedback
    const existing = feedbackContainer.querySelector('.credential-feedback');
    if (existing) {
      existing.remove();
    }

    const feedback = document.createElement('div');
    feedback.className = `credential-feedback credential-feedback-${type}`;
    feedback.textContent = message;
    feedbackContainer.appendChild(feedback);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (feedback.parentElement) {
        feedback.remove();
      }
    }, 3000);
  }

  // =========================================================================
  // Status Refresh
  // =========================================================================

  async function refreshStatus() {
    const authState = auth.getAuthState();
    if (!authState.isAuthenticated) return;

    try {
      const result = await backendApi.getCredentialStatus();
      const natureRemo = result.credentials.find(
        (c) => c.service === 'nature-remo'
      );
      isConfigured = natureRemo?.configured ?? false;
    } catch (error) {
      // Silently handle errors
      isConfigured = false;
    }

    // Update status display
    if (containerElement) {
      const status = containerElement.querySelector('.credential-configured-status');
      if (status) {
        status.textContent = isConfigured
          ? '\u2705 \u8A2D\u5B9A\u6E08\u307F'
          : '\u26A0 \u672A\u8A2D\u5B9A';
      }
    }
  }

  // =========================================================================
  // Auth State Handling
  // =========================================================================

  function handleAuthStateChange(state) {
    if (!containerElement) return;
    if (state.isLoading) return;

    renderSection(state.isAuthenticated);
  }

  function renderSection(isAuthenticated) {
    if (!containerElement) return;

    // Remove existing section
    if (sectionElement && sectionElement.parentElement) {
      sectionElement.remove();
    }

    // Build and insert new section
    sectionElement = buildSection(isAuthenticated);
    containerElement.appendChild(sectionElement);
  }

  // =========================================================================
  // Public API
  // =========================================================================

  return {
    /**
     * Mount the credential settings section into a container element.
     * @param {HTMLElement} container
     */
    mount(container) {
      containerElement = container;
      const authState = auth.getAuthState();
      renderSection(authState.isAuthenticated);

      // Subscribe to auth state changes
      unsubscribeAuth = auth.onAuthStateChange(handleAuthStateChange);
    },

    /**
     * Unmount the credential settings section.
     */
    unmount() {
      if (unsubscribeAuth) {
        unsubscribeAuth();
        unsubscribeAuth = null;
      }

      if (sectionElement && sectionElement.parentElement) {
        sectionElement.remove();
      }

      sectionElement = null;
      containerElement = null;
    },

    /**
     * Refresh the credential status from the backend.
     * @returns {Promise<void>}
     */
    async refresh() {
      await refreshStatus();
    },
  };
}
