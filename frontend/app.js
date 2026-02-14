/**
 * HomeOffice.ai - Virtual Coworking Space
 */

import {
  createDeviceListUI,
  fetchAndDisplayDevices,
  getSelectedDeviceIds,
  getSelectedDevices,
  setDeviceListEnabled,
  setDeviceSelectionCallback,
  restoreDeviceSelection,
} from './device-list.js';
import { startSession as apiStartSession, endSession as apiEndSession } from './backend-api.js';
import { createSessionController } from './session-controller.js';
import { createModeDisplayUI, updateModeDisplay, resetModeDisplay } from './mode-display.js';
import {
  extractModeFromResult,
  extractUserStateFromResult,
  extractReasonFromResult,
} from './app-mode-integration.js';
import { initAuth, _getAuthInstance } from './app-auth-integration.js';
import { createCredentialSettings } from './credential-settings.js';
import { saveCredential, getCredentialStatus, deleteCredential, startAlexaAuth, getAlexaAuthStatus } from './backend-api.js';

// 6つの背景テーマ
const THEMES = [
  'pixel_late_night',
  'calm_creative_studio',
  'space_thinking',
  'minimal_focus',
  'lofi_night',
  'studio_work'
];

// デバイスリスト
let deviceListElement = null;
let selectedDevices = [];

// Credential Settings
let credentialSettings = null;

// SessionController
let sessionController = null;

// Mode Display
let modeDisplayElement = null;
let currentMode = 'idle';

// 仮眠→覚醒フェーズ切替タイマー
let napWakeTimerId = null;
const NAP_DURATION_MS = 120000; // 2分

// 状態
const state = {
  isWorking: false,
  startTime: null,
  timerInterval: null,
  logs: [],
  permissions: {
    camera: localStorage.getItem('permission_camera') === 'true',
    appliance: localStorage.getItem('permission_appliance') === 'true'
  },
  /** Alexaの音声再生が有効なセッションかどうか */
  alexaSpeechEnabled: false,
};

// DOM要素
const elements = {
  bgImage: document.getElementById('bgImage'),
  terminalLogs: document.getElementById('terminalLogs'),
  avatarButton: document.getElementById('avatarButton'),
  avatarImage: document.getElementById('avatarImage'),
  avatarStatus: document.getElementById('avatarStatus'),
  timerDisplay: document.getElementById('timerDisplay'),
  timerTime: document.getElementById('timerTime'),
  miniPopup: document.getElementById('miniPopup'),
  miniTimer: document.getElementById('miniTimer'),
  miniExpand: document.getElementById('miniExpand'),
  settingsButton: document.getElementById('settingsButton'),
  settingsModal: document.getElementById('settingsModal'),
  settingsClose: document.getElementById('settingsClose'),
  cameraStatusBadge: document.getElementById('cameraStatusBadge'),
  cameraToggle: document.getElementById('cameraToggle'),
  applianceStatusBadge: document.getElementById('applianceStatusBadge'),
  applianceToggle: document.getElementById('applianceToggle'),
  avatarUpload: document.getElementById('avatarUpload'),
  avatarUploadButton: document.getElementById('avatarUploadButton'),
  deviceListContainer: document.getElementById('deviceListContainer'),
  permissionModal: document.getElementById('permissionModal'),
  permissionIcon: document.getElementById('permissionIcon'),
  permissionTitle: document.getElementById('permissionTitle'),
  permissionDescription: document.getElementById('permissionDescription'),
  permissionAllow: document.getElementById('permissionAllow'),
  permissionSkip: document.getElementById('permissionSkip')
};

// 初期化
function init() {
  console.log('[HomeOffice.ai] Initializing...');

  // 背景を設定
  loadBackground();

  // アバター画像を読み込み
  loadSavedAvatar();

  // イベントリスナー
  elements.avatarButton.addEventListener('click', handleAvatarClick);
  elements.miniExpand.addEventListener('click', expandFromMini);
  elements.settingsButton.addEventListener('click', openSettings);
  elements.settingsClose.addEventListener('click', closeSettings);
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettings();
  });
  elements.cameraToggle.addEventListener('click', () => togglePermission('camera'));
  elements.applianceToggle.addEventListener('click', () => togglePermission('appliance'));
  elements.avatarUploadButton.addEventListener('click', () => elements.avatarUpload.click());
  elements.avatarUpload.addEventListener('change', handleAvatarUpload);
  elements.permissionAllow.addEventListener('click', handlePermissionAllow);
  elements.permissionSkip.addEventListener('click', handlePermissionSkip);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 設定UIを更新
  updateSettingsUI();

  // モード表示UIを初期化
  initModeDisplay();

  // Firebase Auth 認証モジュールを初期化（ログインUI、認証状態管理、トークンプロバイダー設定）
  const officeSpace = document.getElementById('officeSpace');
  if (officeSpace) {
    const authInst = initAuth(officeSpace);
    // 認証状態変化時にデバイス一覧を更新（ログイン/ログアウトでトークンが変わるため）
    if (authInst) {
      authInst.onAuthStateChange((authState) => {
        if (!authState.isLoading && deviceListElement) {
          fetchAndDisplayDevices(deviceListElement);
        }
      });
    }
  }

  // 初期ログ
  addLog('system', 'HomeOffice.ai 起動');

  console.log('[HomeOffice.ai] Ready');
}

// 背景を読み込み（日替わりランダム）
function loadBackground() {
  const today = new Date().toDateString();
  const savedDate = localStorage.getItem('bg_date');
  const savedTheme = localStorage.getItem('bg_theme');

  const theme = 'pixel_late_night';

  elements.bgImage.src = `backgrounds/${theme}.png`;
  console.log('[HomeOffice.ai] Background:', theme);
}

// アバター画像を読み込み
function loadSavedAvatar() {
  const savedAvatar = localStorage.getItem('user_avatar');
  if (savedAvatar) {
    const img = document.createElement('img');
    img.src = savedAvatar;
    img.alt = 'Your Avatar';
    elements.avatarImage.innerHTML = '';
    elements.avatarImage.appendChild(img);
  }
}

// アバタークリック
function handleAvatarClick() {
  if (!state.isWorking) {
    startWork();
  } else {
    stopWork();
  }
}

// 作業開始
function startWork() {
  // 初回は許可を確認
  const hasAskedCamera = localStorage.getItem('asked_camera');
  if (!hasAskedCamera) {
    showPermissionModal('camera');
    return;
  }

  beginSession();
}

// セッション開始
async function beginSession() {
  state.isWorking = true;
  state.startTime = Date.now();

  elements.avatarButton.classList.add('working');
  elements.avatarStatus.textContent = '作業中';
  elements.timerDisplay.classList.remove('hidden');

  state.timerInterval = setInterval(updateTimer, 1000);
  updateTimer();

  // Build deviceToolOverrides from selected devices
  const devices = deviceListElement ? getSelectedDevices(deviceListElement) : selectedDevices;
  const allowedDeviceIds = devices.map((d) => d.id);
  const deviceToolOverrides = {};
  devices.forEach((d) => {
    if (d.allowedTools) {
      deviceToolOverrides[d.id] = d.allowedTools;
    }
  });

  // Alexaの音声再生(alexa_speak)が有効かどうかを判定
  // allowedToolsが未設定 = 全ツール有効、設定済み = alexa_speakが含まれているか
  state.alexaSpeechEnabled = devices.some(
    (d) => d.type === 'ALEXA' && (!d.allowedTools || d.allowedTools.includes('alexa_speak'))
  );

  // Call API to start session (常にセッションを作成)
  let sessionId = null;
  try {
    console.log('[HomeOffice.ai] セッション開始API呼び出し... devices:', allowedDeviceIds);
    const sessionData = await apiStartSession(allowedDeviceIds, deviceToolOverrides);
    sessionId = sessionData.sessionId;
    console.log('[HomeOffice.ai] セッション開始成功:', sessionId);

    // Alexaがない場合、Web Speech APIで開始挨拶
    if (!state.alexaSpeechEnabled) {
      speak('今日も頑張りましょう');
    }
  } catch (error) {
    console.error('[HomeOffice.ai] セッション開始API失敗:', error);
  }

  // SessionControllerで監視ループを開始
  if (sessionId) {
    const videoElement = document.getElementById('cameraVideo');
    sessionController = createSessionController(videoElement, {
      onSessionStarted: () => {
        console.log('[HomeOffice.ai] 監視ループ開始');
      },
      onAnalysisResult: (result) => {
        if (!state.isWorking) return;
        const toolName = result.action?.tool || 'unknown';
        const message = result.result?.message || result.actionResult?.message || '';
        console.log('[HomeOffice.ai] 分析結果:', toolName, message);
        addLog('focus', `AI: ${toolName}`);
        // モード表示を更新
        handleModeUpdate(result);
        // Web Speech API でモード音声通知
        handleSpeechTexts(result);
      },
      onError: (error) => {
        console.error('[HomeOffice.ai] 監視エラー:', error);
      },
    });

    try {
      // カメラアクセスを取得
      console.log('[HomeOffice.ai] カメラアクセス要求中...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoElement.srcObject = stream;
      await videoElement.play();
      console.log('[HomeOffice.ai] カメラ取得成功、監視ループ開始');
      // セッションAPIは既に叩いたので、resumeでループだけ開始
      await sessionController.resumeExistingSession(sessionId);
    } catch (error) {
      console.error('[HomeOffice.ai] カメラ/監視ループ開始失敗:', error);
    }
  }

  addLog('start', '作業開始');
}

// 作業終了
async function stopWork() {
  const elapsed = formatTime(Date.now() - state.startTime);

  const hadAlexaSpeech = state.alexaSpeechEnabled;
  state.isWorking = false;
  state.alexaSpeechEnabled = false;
  clearInterval(state.timerInterval);
  state.timerInterval = null;

  // SessionController停止（カメラ解放+監視ループ停止）
  if (sessionController) {
    sessionController.stop();
    sessionController = null;
  }

  // カメラストリーム解放
  const videoElement = document.getElementById('cameraVideo');
  if (videoElement && videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
  }

  // Alexaがない場合、Web Speech APIで終了挨拶
  if (!hadAlexaSpeech) {
    speak('お疲れ様でした');
  }

  // バックエンドのセッション終了
  try {
    await apiEndSession();
  } catch (error) {
    console.error('[HomeOffice.ai] セッション終了API失敗:', error);
  }

  elements.avatarButton.classList.remove('working');
  elements.avatarStatus.textContent = 'タップで開始';
  elements.timerDisplay.classList.add('hidden');
  elements.miniPopup.classList.add('hidden');

  // 仮眠→覚醒タイマーをキャンセル
  if (napWakeTimerId) {
    clearTimeout(napWakeTimerId);
    napWakeTimerId = null;
  }

  // モード表示をリセット
  if (modeDisplayElement) {
    resetModeDisplay(modeDisplayElement);
    currentMode = 'idle';
  }

  addLog('end', `作業終了 (${elapsed})`);
}

// タイマー更新
function updateTimer() {
  const elapsed = Date.now() - state.startTime;
  const timeStr = formatTime(elapsed);
  elements.timerTime.textContent = timeStr;
  elements.miniTimer.textContent = timeStr;
}

// 時間フォーマット
function formatTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ミニポップアップ
function handleVisibilityChange() {
  if (!state.isWorking) return;

  if (document.hidden) {
    elements.miniPopup.classList.remove('hidden');
    elements.settingsButton.classList.add('hidden');
  } else {
    elements.miniPopup.classList.add('hidden');
    elements.settingsButton.classList.remove('hidden');
  }
}

function expandFromMini() {
  elements.miniPopup.classList.add('hidden');
  window.focus();
}

// ログ追加
function addLog(type, message) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const icons = {
    start: '▶',
    end: '⏹',
    focus: '💡',
    rest: '☕',
    system: '⚙',
    avatar: '👤'
  };

  const log = { type, message, time, icon: icons[type] || '📝' };
  state.logs.unshift(log);
  if (state.logs.length > 5) state.logs.pop();

  renderLogs();
}

// ログ描画
function renderLogs() {
  elements.terminalLogs.innerHTML = state.logs.map(log => `
    <li class="log-item" data-type="${log.type}">
      <span class="log-icon">${log.icon}</span>
      <span class="log-message">${log.message}</span>
      <span class="log-time">[${log.time}]</span>
    </li>
  `).join('');
}

// 設定モーダル
async function openSettings() {
  updateSettingsUI();
  elements.settingsModal.classList.remove('hidden');

  // デバイスリストを初期化（初回のみ）
  if (!deviceListElement) {
    deviceListElement = createDeviceListUI();
    elements.deviceListContainer.appendChild(deviceListElement);

    setDeviceSelectionCallback(deviceListElement, (devices) => {
      selectedDevices = devices;
      console.log('[HomeOffice.ai] デバイス選択状態を更新:', selectedDevices);
    });
  }

  // デバイス一覧を取得して表示
  await fetchAndDisplayDevices(deviceListElement);

  // 保存された選択状態を復元
  if (selectedDevices.length > 0) {
    restoreDeviceSelection(deviceListElement, selectedDevices);
  }

  // セッション中はデバイス選択を無効化
  if (state.isWorking) {
    setDeviceListEnabled(deviceListElement, false);
  }

  // クレデンシャル設定UIを初期化（初回のみ）
  if (!credentialSettings) {
    const authInstance = _getAuthInstance();
    if (authInstance) {
      const credentialContainer = document.getElementById('credentialSettingsContainer');
      if (credentialContainer) {
        credentialSettings = createCredentialSettings({
          auth: authInstance,
          backendApi: { saveCredential, getCredentialStatus, deleteCredential, startAlexaAuth, getAlexaAuthStatus },
          onCredentialChange: () => {
            if (deviceListElement) fetchAndDisplayDevices(deviceListElement);
          },
        });
        credentialSettings.mount(credentialContainer);
      }
    }
  }

  // クレデンシャルステータスを更新
  if (credentialSettings) {
    credentialSettings.refresh();
  }
}

function closeSettings() {
  elements.settingsModal.classList.add('hidden');
}

function updateSettingsUI() {
  // カメラ
  elements.cameraStatusBadge.textContent = state.permissions.camera ? 'ON' : 'OFF';
  elements.cameraStatusBadge.classList.toggle('on', state.permissions.camera);
  elements.cameraStatusBadge.classList.toggle('off', !state.permissions.camera);
  elements.cameraToggle.textContent = state.permissions.camera ? 'オフにする' : 'オンにする';

  // 家電
  elements.applianceStatusBadge.textContent = state.permissions.appliance ? 'ON' : 'OFF';
  elements.applianceStatusBadge.classList.toggle('on', state.permissions.appliance);
  elements.applianceStatusBadge.classList.toggle('off', !state.permissions.appliance);
  elements.applianceToggle.textContent = state.permissions.appliance ? 'オフにする' : 'オンにする';
}

function togglePermission(type) {
  if (type === 'camera') {
    state.permissions.camera = !state.permissions.camera;
    localStorage.setItem('permission_camera', state.permissions.camera);
    addLog('system', `カメラ ${state.permissions.camera ? 'ON' : 'OFF'}`);
  } else if (type === 'appliance') {
    state.permissions.appliance = !state.permissions.appliance;
    localStorage.setItem('permission_appliance', state.permissions.appliance);
    addLog('system', `家電制御 ${state.permissions.appliance ? 'ON' : 'OFF'}`);
  }
  updateSettingsUI();
}

// 許可モーダル
let permissionCallback = null;

function showPermissionModal(type) {
  if (type === 'camera') {
    elements.permissionIcon.textContent = '📷';
    elements.permissionTitle.textContent = 'カメラへのアクセス';
    elements.permissionDescription.textContent = 'AIが集中状態を自動で検知するためにカメラを使用します。映像はデバイス内で処理され、サーバーには送信されません。';
  } else if (type === 'appliance') {
    elements.permissionIcon.textContent = '💡';
    elements.permissionTitle.textContent = '家電の制御';
    elements.permissionDescription.textContent = '照明やエアコンを自動で制御します。Nature Remoと連携します。';
  }

  elements.permissionModal.dataset.type = type;
  elements.permissionModal.classList.remove('hidden');
}

function handlePermissionAllow() {
  const type = elements.permissionModal.dataset.type;
  elements.permissionModal.classList.add('hidden');
  localStorage.setItem(`asked_${type}`, 'true');

  if (type === 'camera') {
    state.permissions.camera = true;
    localStorage.setItem('permission_camera', 'true');
    addLog('system', 'カメラ ON');

    // 次に家電を聞く
    const hasAskedAppliance = localStorage.getItem('asked_appliance');
    if (!hasAskedAppliance) {
      showPermissionModal('appliance');
      return;
    }
  } else if (type === 'appliance') {
    state.permissions.appliance = true;
    localStorage.setItem('permission_appliance', 'true');
    addLog('system', '家電制御 ON');
  }

  updateSettingsUI();
  beginSession();
}

function handlePermissionSkip() {
  const type = elements.permissionModal.dataset.type;
  elements.permissionModal.classList.add('hidden');
  localStorage.setItem(`asked_${type}`, 'true');

  if (type === 'camera') {
    const hasAskedAppliance = localStorage.getItem('asked_appliance');
    if (!hasAskedAppliance) {
      showPermissionModal('appliance');
      return;
    }
  }

  beginSession();
}

// アバターアップロード
function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    localStorage.setItem('user_avatar', dataUrl);

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Your Avatar';
    elements.avatarImage.innerHTML = '';
    elements.avatarImage.appendChild(img);

    addLog('avatar', 'アバター更新');
  };
  reader.readAsDataURL(file);
}

// =============================================================================
// Mode Display — AIモード表示の統合
// =============================================================================

/**
 * モード表示UIを初期化してコンテナに追加する
 */
function initModeDisplay() {
  const container = document.getElementById('modeDisplayContainer');
  if (!container) return;

  modeDisplayElement = createModeDisplayUI();
  container.appendChild(modeDisplayElement);
}

/**
 * 分析結果からモード情報を抽出してモード表示を更新する
 * @param {object} result - analyze API のレスポンス
 */
function handleModeUpdate(result) {
  if (!modeDisplayElement) return;

  const mode = extractModeFromResult(result);
  if (!mode) return;

  const previousMode = currentMode;
  currentMode = mode;

  const userState = extractUserStateFromResult(mode);
  const reason = extractReasonFromResult(result);

  updateModeDisplay(modeDisplayElement, {
    currentMode: mode,
    userState,
    reason,
    previousMode,
  });
}

// =============================================================================
// Web Speech API — IoTなし環境向けフォールバック音声通知
// =============================================================================

/**
 * Web Speech API で音声読み上げを行う
 * @param {string} text - 読み上げテキスト
 * @param {string} [lang='ja-JP'] - 言語コード
 */
function speak(text, lang = 'ja-JP') {
  if (!('speechSynthesis' in window)) {
    console.warn('[Speech] Web Speech API is not supported');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

/**
 * 分析結果から speechTexts を検出し、順番に音声再生する
 * Alexaの音声再生が有効な場合はバックエンドがAlexaで再生するためスキップ
 * wake_mode時は仮眠→覚醒のフェーズ分け再生を行う
 * @param {object} result - analyze API のレスポンス
 */
function handleSpeechTexts(result) {
  if (state.alexaSpeechEnabled) {
    return;
  }

  // wake_mode: フェーズ分け再生（仮眠アナウンス → 2分後 → 覚醒アナウンス）
  const primaryTool = result.action?.tool;
  if (primaryTool === 'wake_mode') {
    handlePhasedWakeMode(result);
    return;
  }

  const allResults = result.results || [];
  for (const r of allResults) {
    if (r.speechTexts && r.speechTexts.length > 0) {
      for (const text of r.speechTexts) {
        speak(text);
      }
    }
  }
  // 後方互換: 単一 result フィールド
  if (allResults.length === 0 && result.result?.speechTexts) {
    for (const text of result.result.speechTexts) {
      speak(text);
    }
  }
}

/**
 * wake_mode のフェーズ分け処理
 * Phase 1: 仮眠アナウンス（即時）
 * Phase 2: 覚醒アナウンス（NAP_DURATION_MS後）+ モード表示を覚醒に切替
 * @param {object} result - analyze API のレスポンス
 */
function handlePhasedWakeMode(result) {
  const allResults = result.results || [];
  const speechTexts = allResults[0]?.speechTexts || result.result?.speechTexts || [];

  // Phase 1: 仮眠アナウンス（最初のテキストのみ）
  if (speechTexts.length > 0) {
    speak(speechTexts[0]);
  }

  // Phase 2: 覚醒アナウンス（2分後）
  if (speechTexts.length > 1) {
    if (napWakeTimerId) {
      clearTimeout(napWakeTimerId);
    }

    napWakeTimerId = setTimeout(() => {
      speak(speechTexts[1]);

      // モード表示を仮眠→覚醒に切替
      if (modeDisplayElement) {
        const previousMode = currentMode;
        currentMode = 'wake';
        updateModeDisplay(modeDisplayElement, {
          currentMode: 'wake',
          userState: '作業中',
          reason: '仮眠終了',
          previousMode,
        });
      }

      napWakeTimerId = null;
    }, NAP_DURATION_MS);
  }
}

// 開始
init();
