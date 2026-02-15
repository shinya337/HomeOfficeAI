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
import { startSession as apiStartSession, endSession as apiEndSession, getDevices as apiGetDevices } from './backend-api.js';
import { createSessionController } from './session-controller.js';
import { createModeDisplayUI, updateModeDisplay, resetModeDisplay } from './mode-display.js';
import {
  extractModeFromResult,
  extractUserStateFromResult,
  extractReasonFromResult,
} from './app-mode-integration.js';
import { initAuth, _getAuthInstance } from './app-auth-integration.js';
import { createCredentialSettings } from './credential-settings.js';
import { saveCredential, getCredentialStatus, deleteCredential, startAlexaAuth, getAlexaAuthStatus, savePreferences, getPreferences } from './backend-api.js';

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
    voice: localStorage.getItem('permission_voice') === 'true',
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
  cameraToggle: document.getElementById('cameraToggle'),
  voiceToggle: document.getElementById('voiceToggle'),
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

  // イベントリスナー
  elements.avatarButton.addEventListener('click', handleAvatarClick);
  elements.miniExpand.addEventListener('click', expandFromMini);
  elements.settingsButton.addEventListener('click', openSettings);
  elements.settingsClose.addEventListener('click', closeSettings);
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettings();
  });
  elements.cameraToggle.addEventListener('change', () => togglePermission('camera'));
  elements.voiceToggle.addEventListener('change', () => togglePermission('voice'));
  elements.permissionAllow.addEventListener('click', handlePermissionAllow);
  elements.permissionSkip.addEventListener('click', handlePermissionSkip);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  const guestLoginButton = document.getElementById('guestLoginButton');
  if (guestLoginButton) {
    guestLoginButton.addEventListener('click', () => {
      const auth = _getAuthInstance();
      if (auth) auth.signIn().catch((e) => console.error('[Settings] Sign-in failed:', e));
    });
  }

  // localStorage から selected_devices を復元
  try {
    const savedDevices = localStorage.getItem('selected_devices');
    if (savedDevices) {
      selectedDevices = JSON.parse(savedDevices);
    }
  } catch {
    // ignore parse error
  }

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
        if (!authState.isLoading) {
          const isAuthenticated = !!authState.user;
          updateSettingsVisibilityForAuth(isAuthenticated);
          updateAvatarFromAuth(authState.user);
          if (deviceListElement) {
            fetchAndDisplayDevices(deviceListElement);
          }
          // ログイン時に Firestore から設定を復元
          if (isAuthenticated) {
            getPreferences()
              .then((data) => {
                if (data.preferences) {
                  state.permissions.camera = data.preferences.camera;
                  state.permissions.voice = data.preferences.voice;
                  selectedDevices = data.preferences.selectedDevices || [];
                  localStorage.setItem('permission_camera', state.permissions.camera);
                  localStorage.setItem('permission_voice', state.permissions.voice);
                  localStorage.setItem('selected_devices', JSON.stringify(selectedDevices));
                  updateSettingsUI();
                  if (deviceListElement && selectedDevices.length > 0) {
                    restoreDeviceSelection(deviceListElement, selectedDevices);
                  }
                }
              })
              .catch((e) => console.warn('[Preferences] Firestore load failed:', e));
          }
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

/**
 * 認証ユーザーのプロフィール画像を中央アバターに反映する
 * @param {object|null} user - Firebase Auth ユーザーオブジェクト
 */
function updateAvatarFromAuth(user) {
  if (user && user.photoURL) {
    const img = document.createElement('img');
    img.src = user.photoURL;
    img.alt = user.displayName || 'User';
    elements.avatarImage.innerHTML = '';
    elements.avatarImage.appendChild(img);
  } else {
    // ゲスト時はデフォルトSVGに戻す
    elements.avatarImage.innerHTML = `
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="35" r="25" fill="#6b7280"/>
        <ellipse cx="50" cy="85" rx="35" ry="25" fill="#6b7280"/>
      </svg>`;
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
  // カメラが許可されていない場合は許可モーダルを表示
  if (!state.permissions.camera) {
    showPermissionModal('camera');
    return;
  }

  beginSession();
}

// セッション開始
async function beginSession() {
  // カメラアクセスを最初に確認（失敗したらセッションを開始しない）
  const videoElement = document.getElementById('cameraVideo');
  let stream;
  try {
    console.log('[HomeOffice.ai] カメラアクセス要求中...');
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = stream;
    await videoElement.play();
    console.log('[HomeOffice.ai] カメラ取得成功');
  } catch (error) {
    console.error('[HomeOffice.ai] カメラアクセス失敗:', error);
    // パーミッション状態をリセット
    state.permissions.camera = false;
    localStorage.setItem('permission_camera', 'false');
    updateSettingsUI();
    if (error.name === 'NotAllowedError') {
      addLog('system', 'ブラウザでカメラがブロックされています。\nアドレスバーのカメラアイコンから許可してください。');
    } else {
      addLog('system', 'カメラにアクセスできませんでした');
    }
    return;
  }

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
  // デバイスキャッシュを確実に温める（サーバー再起動後の503防止）
  if (allowedDeviceIds.length > 0) {
    try {
      await apiGetDevices();
    } catch {
      // デバイスリスト取得失敗は致命的ではない（キャッシュが既に温まっている場合もある）
    }
  }

  let sessionId = null;
  try {
    console.log('[HomeOffice.ai] セッション開始API呼び出し...');
    const sessionData = await apiStartSession(allowedDeviceIds, deviceToolOverrides);
    sessionId = sessionData.sessionId;
    console.log('[HomeOffice.ai] セッション開始成功');

    // Alexaがない場合、Web Speech APIで開始挨拶
    if (!state.alexaSpeechEnabled) {
      speak('今日も頑張りましょう');
    }
  } catch (error) {
    console.error('[HomeOffice.ai] セッション開始API失敗:', error);
  }

  // SessionControllerで監視ループを開始
  if (sessionId) {
    sessionController = createSessionController(videoElement, {
      onSessionStarted: () => {
        console.log('[HomeOffice.ai] 監視ループ開始');
      },
      onAnalysisResult: (result) => {
        if (!state.isWorking) return;
        const toolName = result.action?.tool || 'unknown';
        const message = result.result?.message || result.actionResult?.message || '';
        console.log(`[HomeOffice.ai] 分析結果: ${message}`);
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

    // セッションAPIは既に叩いたので、resumeでループだけ開始
    await sessionController.resumeExistingSession(sessionId);
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
      persistPreferences();
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
  elements.cameraToggle.checked = state.permissions.camera;
  elements.voiceToggle.checked = state.permissions.voice;
}

/**
 * 認証状態に応じて家電関連の設定項目の表示/非表示を切り替える
 * @param {boolean} isAuthenticated - ログイン済みかどうか
 */
function updateSettingsVisibilityForAuth(isAuthenticated) {
  const display = isAuthenticated ? '' : 'none';
  const deviceListSection = document.getElementById('deviceListSection');
  if (deviceListSection) {
    deviceListSection.style.display = display;
  }
  const credentialContainer = document.getElementById('credentialSettingsContainer');
  if (credentialContainer) {
    credentialContainer.style.display = display;
  }
  const guestHint = document.getElementById('guestLoginHint');
  if (guestHint) {
    guestHint.style.display = isAuthenticated ? 'none' : 'block';
  }
}

/**
 * 設定を localStorage に即時保存し、認証済みなら Firestore にも保存する（fire-and-forget）
 */
function persistPreferences() {
  localStorage.setItem('permission_camera', state.permissions.camera);
  localStorage.setItem('permission_voice', state.permissions.voice);
  localStorage.setItem('selected_devices', JSON.stringify(selectedDevices));

  const auth = _getAuthInstance();
  if (auth && auth.getAuthState().isAuthenticated) {
    savePreferences({
      camera: state.permissions.camera,
      voice: state.permissions.voice,
      selectedDevices: selectedDevices,
    }).catch((e) => console.warn('[Preferences] Firestore save failed:', e));
  }
}

function togglePermission(type) {
  if (type === 'camera') {
    state.permissions.camera = !state.permissions.camera;
    addLog('system', `カメラ ${state.permissions.camera ? 'ON' : 'OFF'}`);
  } else if (type === 'voice') {
    state.permissions.voice = !state.permissions.voice;
    addLog('system', `音声通知 ${state.permissions.voice ? 'ON' : 'OFF'}`);
  }
  persistPreferences();
  updateSettingsUI();
}

// 許可モーダル
let permissionCallback = null;

function showPermissionModal(type) {
  if (type === 'camera') {
    elements.permissionIcon.textContent = '📷';
    elements.permissionTitle.textContent = 'カメラへのアクセス';
    elements.permissionDescription.innerHTML = 'AIがあなたの状態を自動で検知するために<br>カメラを使用します。<br><br>画像はGoogle Vertex AIで安全に分析され、<br>保存や学習には使用されません。<br><br>設定からいつでもOFFにできます。';
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
  }

  updateSettingsUI();
  beginSession();
}

function handlePermissionSkip() {
  elements.permissionModal.classList.add('hidden');
  localStorage.setItem('asked_camera', 'true');
  // カメラなしではAI分析できないため、セッションを開始しない
  addLog('system', 'カメラが許可されていないため、\n作業を開始できません');
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
  if (!state.permissions.voice) {
    return;
  }
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
