/**
 * Credential Settings UI Component
 *
 * Provides the IoT credential settings section within the settings modal.
 * Displays Nature Remo token input form and Alexa credential section
 * for authenticated users, and a login prompt for unauthenticated users.
 *
 * Requirements:
 * - 5.1: 設定モーダルにIoTクレデンシャル設定セクションを表示する
 * - 5.2: Nature Remoトークンの入力フォーム（テキスト入力、保存ボタン、削除ボタン）を提供する
 * - 5.3: 保存成功/失敗のフィードバックを表示する
 * - 5.4: トークンがマスク表示された状態で設定済みステータスを表示する
 * - 5.5: 未ログイン時は非表示にするか、ログインを促す表示にする
 * - 2.1: Alexaクレデンシャルセクションを表示する
 * - 2.2: Alexaクレデンシャルのステータスインジケーターを表示する
 * - 2.4: Alexaクレデンシャルの削除ボタンを提供する
 * - 2.5: ゲストモード時にAlexaセクションを非活性化する
 * - 2.6: 操作結果のフィードバックメッセージを表示する
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

  /** @type {boolean} */
  let isAlexaConfigured = false;

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
    title.textContent = 'IoT\u9023\u643A';
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
   * Contains Nature Remo section and Alexa section.
   */
  function buildCredentialForm() {
    const form = document.createElement('div');
    form.className = 'credential-form';

    // Nature Remo section
    form.appendChild(buildNatureRemoSection());

    // Alexa section
    form.appendChild(buildAlexaSection());

    return form;
  }

  /**
   * Build the Nature Remo credential section with token input.
   */
  function buildNatureRemoSection() {
    const serviceItem = document.createElement('div');
    serviceItem.className = 'credential-service-item';

    // Header with label, status, and delete button
    const header = document.createElement('div');
    header.className = 'credential-service-header';

    const label = document.createElement('span');
    label.className = 'credential-service-label';
    label.textContent = 'Nature Remo';

    const headerRight = document.createElement('div');
    headerRight.className = 'credential-header-right';

    const status = document.createElement('span');
    status.className = 'credential-configured-status ' + (isConfigured ? 'configured' : 'unconfigured');
    status.textContent = isConfigured
      ? '\u8A2D\u5B9A\u6E08\u307F'
      : '\u672A\u8A2D\u5B9A';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'credential-delete-button';
    deleteButton.textContent = '\u524A\u9664';
    deleteButton.type = 'button';
    if (!isConfigured) deleteButton.style.display = 'none';

    headerRight.appendChild(status);
    headerRight.appendChild(deleteButton);
    header.appendChild(label);
    header.appendChild(headerRight);
    serviceItem.appendChild(header);

    // Input row (hidden when configured)
    const inputRow = document.createElement('div');
    inputRow.className = 'credential-input-row';
    if (isConfigured) inputRow.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'credential-token-input';
    input.placeholder = 'API\u30C8\u30FC\u30AF\u30F3\u3092\u5165\u529B';

    const saveButton = document.createElement('button');
    saveButton.className = 'credential-save-button';
    saveButton.textContent = '\u4FDD\u5B58';
    saveButton.type = 'button';

    const helpLink = document.createElement('a');
    helpLink.className = 'credential-help-link';
    helpLink.href = 'https://home.nature.global/';
    helpLink.target = '_blank';
    helpLink.rel = 'noopener noreferrer';
    helpLink.textContent = 'API\u30C8\u30FC\u30AF\u30F3\u306E\u53D6\u5F97\u306F\u3053\u3061\u3089 \u2197';

    inputRow.appendChild(input);
    inputRow.appendChild(saveButton);
    inputRow.appendChild(helpLink);
    serviceItem.appendChild(inputRow);

    // Feedback area
    const feedback = document.createElement('div');
    feedback.className = 'credential-feedback-container';
    serviceItem.appendChild(feedback);

    // Event listeners
    saveButton.addEventListener('click', handleSave);
    deleteButton.addEventListener('click', handleDelete);

    return serviceItem;
  }

  /**
   * Build the Alexa credential section with auth start button.
   */
  function buildAlexaSection() {
    const serviceItem = document.createElement('div');
    serviceItem.className = 'credential-service-item alexa-credential-section';

    // Header with label, status, and delete button
    const header = document.createElement('div');
    header.className = 'credential-service-header';

    const label = document.createElement('span');
    label.className = 'credential-service-label';
    label.textContent = 'Alexa';

    const headerRight = document.createElement('div');
    headerRight.className = 'credential-header-right';

    const status = document.createElement('span');
    status.className = 'credential-configured-status ' + (isAlexaConfigured ? 'configured' : 'unconfigured');
    status.textContent = isAlexaConfigured
      ? '\u8A2D\u5B9A\u6E08\u307F'
      : '\u672A\u8A2D\u5B9A';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'credential-delete-button';
    deleteButton.textContent = '\u524A\u9664';
    deleteButton.type = 'button';
    if (!isAlexaConfigured) deleteButton.style.display = 'none';

    headerRight.appendChild(status);
    headerRight.appendChild(deleteButton);
    header.appendChild(label);
    header.appendChild(headerRight);
    serviceItem.appendChild(header);

    // Auth start row (hidden when configured)
    const authRow = document.createElement('div');
    authRow.className = 'credential-input-row';
    if (isAlexaConfigured) authRow.style.display = 'none';

    const authButton = document.createElement('button');
    authButton.className = 'alexa-auth-start-button';
    authButton.textContent = '\u8A8D\u8A3C\u958B\u59CB';
    authButton.type = 'button';

    authRow.appendChild(authButton);
    serviceItem.appendChild(authRow);

    // Feedback area
    const feedback = document.createElement('div');
    feedback.className = 'credential-feedback-container';
    serviceItem.appendChild(feedback);

    // Event listeners
    authButton.addEventListener('click', () => handleAlexaAuthStart(authButton));
    deleteButton.addEventListener('click', handleAlexaDelete);

    return serviceItem;
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

  /** Polling interval in milliseconds for Alexa auth status checks */
  const ALEXA_AUTH_POLL_INTERVAL_MS = 2000;

  /**
   * Reset the Alexa auth button to its default (ready) state.
   * @param {HTMLButtonElement} authButton
   */
  function resetAlexaAuthButton(authButton) {
    authButton.disabled = false;
    authButton.textContent = '\u8A8D\u8A3C\u958B\u59CB';
  }

  /**
   * Handle Alexa auth start button click.
   * Starts the Proxy auth session, opens popup, and begins polling.
   * @param {HTMLButtonElement} authButton
   */
  async function handleAlexaAuthStart(authButton) {
    if (!containerElement) return;

    // Disable button and show authenticating state
    authButton.disabled = true;
    authButton.textContent = '\u8A8D\u8A3C\u4E2D...';

    try {
      const { sessionId, proxyUrl } = await backendApi.startAlexaAuth();

      // Open popup window for Amazon login
      const popup = window.open(proxyUrl, 'alexa-auth', 'width=500,height=700');

      // Start polling for auth status
      startAlexaAuthPolling(sessionId, popup, authButton);
    } catch (error) {
      console.error('[Alexa Auth] Start failed:', error);
      resetAlexaAuthButton(authButton);
      showAlexaFeedback('error', '\u8A8D\u8A3C\u306E\u958B\u59CB\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
    }
  }

  /**
   * Poll for Alexa auth session status at 2-second intervals.
   * Stops when session is completed, failed, timeout, or popup is closed by user.
   * @param {string} sessionId
   * @param {Window|null} popup
   * @param {HTMLButtonElement} authButton
   */
  function startAlexaAuthPolling(sessionId, popup, authButton) {
    const pollInterval = setInterval(async () => {
      // Detect user manually closing the popup
      if (popup && popup.closed) {
        clearInterval(pollInterval);
        resetAlexaAuthButton(authButton);
        return;
      }

      try {
        const result = await backendApi.getAlexaAuthStatus(sessionId);

        if (result.status === 'completed') {
          clearInterval(pollInterval);
          if (popup && !popup.closed) popup.close();
          resetAlexaAuthButton(authButton);
          showAlexaFeedback('success', '\u8A8D\u8A3C\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002');
          await refreshStatus();
          if (onCredentialChange) onCredentialChange();
        } else if (result.status === 'failed' || result.status === 'timeout') {
          clearInterval(pollInterval);
          if (popup && !popup.closed) popup.close();
          resetAlexaAuthButton(authButton);
          const message = result.status === 'timeout'
            ? '\u8A8D\u8A3C\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002'
            : '\u8A8D\u8A3C\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002';
          showAlexaFeedback('error', message);
        }
        // status === 'active': continue polling
      } catch (error) {
        clearInterval(pollInterval);
        resetAlexaAuthButton(authButton);
        showAlexaFeedback('error', '\u30B9\u30C6\u30FC\u30BF\u30B9\u78BA\u8A8D\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
      }
    }, ALEXA_AUTH_POLL_INTERVAL_MS);
  }

  async function handleAlexaDelete() {
    if (!containerElement) return;

    try {
      await backendApi.deleteCredential('alexa');
      showAlexaFeedback('success', '\u30AF\u30EC\u30C7\u30F3\u30B7\u30E3\u30EB\u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002');
      await refreshStatus();
      if (onCredentialChange) onCredentialChange();
    } catch (error) {
      showAlexaFeedback('error', '\u30AF\u30EC\u30C7\u30F3\u30B7\u30E3\u30EB\u306E\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
    }
  }

  // =========================================================================
  // Feedback
  // =========================================================================

  /**
   * Show feedback message in the Nature Remo section.
   */
  function showFeedback(type, message) {
    if (!containerElement) return;

    // Target the Nature Remo section's feedback container (first one, not in Alexa section)
    const natureRemoSection = containerElement.querySelector('.credential-service-item:not(.alexa-credential-section)');
    const feedbackContainer = natureRemoSection?.querySelector('.credential-feedback-container');
    if (!feedbackContainer) return;

    showFeedbackInContainer(feedbackContainer, type, message);
  }

  /**
   * Show feedback message in the Alexa section.
   */
  function showAlexaFeedback(type, message) {
    if (!containerElement) return;

    const alexaSection = containerElement.querySelector('.alexa-credential-section');
    const feedbackContainer = alexaSection?.querySelector('.credential-feedback-container');
    if (!feedbackContainer) return;

    showFeedbackInContainer(feedbackContainer, type, message);
  }

  /**
   * Show feedback message in a specific container.
   */
  function showFeedbackInContainer(feedbackContainer, type, message) {
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

      const alexa = result.credentials.find(
        (c) => c.service === 'alexa'
      );
      isAlexaConfigured = alexa?.configured ?? false;
    } catch (error) {
      // Silently handle errors
      isConfigured = false;
      isAlexaConfigured = false;
    }

    // Update status displays
    if (containerElement) {
      // Update Nature Remo status and input visibility
      const natureRemoSection = containerElement.querySelector('.credential-service-item:not(.alexa-credential-section)');
      const natureRemoStatus = natureRemoSection?.querySelector('.credential-configured-status');
      if (natureRemoStatus) {
        natureRemoStatus.textContent = isConfigured ? '\u8A2D\u5B9A\u6E08\u307F' : '\u672A\u8A2D\u5B9A';
        natureRemoStatus.className = 'credential-configured-status ' + (isConfigured ? 'configured' : 'unconfigured');
      }
      const natureRemoInputRow = natureRemoSection?.querySelector('.credential-input-row');
      if (natureRemoInputRow) natureRemoInputRow.style.display = isConfigured ? 'none' : '';
      const natureRemoDeleteBtn = natureRemoSection?.querySelector('.credential-delete-button');
      if (natureRemoDeleteBtn) natureRemoDeleteBtn.style.display = isConfigured ? '' : 'none';

      // Update Alexa status and button visibility
      const alexaSection = containerElement.querySelector('.alexa-credential-section');
      const alexaStatus = alexaSection?.querySelector('.credential-configured-status');
      if (alexaStatus) {
        alexaStatus.textContent = isAlexaConfigured ? '\u8A2D\u5B9A\u6E08\u307F' : '\u672A\u8A2D\u5B9A';
        alexaStatus.className = 'credential-configured-status ' + (isAlexaConfigured ? 'configured' : 'unconfigured');
      }
      const alexaAuthRow = alexaSection?.querySelector('.credential-input-row');
      if (alexaAuthRow) alexaAuthRow.style.display = isAlexaConfigured ? 'none' : '';
      const alexaDeleteBtn = alexaSection?.querySelector('.credential-delete-button');
      if (alexaDeleteBtn) alexaDeleteBtn.style.display = isAlexaConfigured ? '' : 'none';
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
