/**
 * Session Controller Module for HomeOffice.ai
 *
 * Orchestrates session start/end, coordinates API calls and camera capture.
 * Manages the 5-minute interval timer for periodic image analysis.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 4.3, 4.4
 * - 1.1: POST /api/session/start call when session starts
 * - 1.2: Store session ID on successful API response
 * - 1.3: POST /api/session/end call when session ends
 * - 1.4: Backend sets session status to 'ended'
 * - 2.1: Start camera stream and capture on session start
 * - 2.2: Capture still images at regular intervals (5 minutes default)
 * - 2.3: Base64 encode captured images and send to POST /api/analyze
 * - 2.4: Release camera stream when session ends
 * - 2.5: Handle camera access errors with user-friendly messages
 * - 4.3: Schedule next capture for continue_monitoring at 10 seconds
 * - 4.4: Schedule next capture for do_nothing at 5 minutes
 */

import * as apiClient from './backend-api.js';
import { captureFrame } from './camera-capture.js';

/**
 * Camera error codes
 * @readonly
 * @enum {string}
 */
export const CameraErrorCode = {
  PERMISSION_DENIED: 'CAMERA_PERMISSION_DENIED',
  NOT_FOUND: 'CAMERA_NOT_FOUND',
  IN_USE: 'CAMERA_IN_USE',
  CONSTRAINTS_ERROR: 'CAMERA_CONSTRAINTS_ERROR',
  GENERIC: 'CAMERA_ERROR',
};

/**
 * Camera Error class for user-friendly error handling
 *
 * Provides structured error information including:
 * - Error code for programmatic handling
 * - User-friendly message in Japanese
 * - Guidance for resolving the issue
 *
 * @extends Error
 */
export class CameraError extends Error {
  /**
   * @param {string} code - Error code from CameraErrorCode
   * @param {string} message - User-friendly error message
   * @param {string} userGuidance - Instructions for resolving the issue
   */
  constructor(code, message, userGuidance) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
    this.userGuidance = userGuidance;
  }
}

/**
 * Map a DOMException or Error to a CameraError with user-friendly messages
 *
 * @param {Error|DOMException} error - The original error from getUserMedia
 * @returns {CameraError} Structured camera error
 */
function mapCameraError(error) {
  // Handle DOMException types from getUserMedia
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return new CameraError(
          CameraErrorCode.PERMISSION_DENIED,
          'カメラへのアクセスが拒否されました。セッションを開始するにはカメラの許可が必要です。',
          'ブラウザの設定からカメラへのアクセスを許可してください。アドレスバーのカメラアイコンをクリックして許可を変更できます。'
        );
      case 'NotFoundError':
        return new CameraError(
          CameraErrorCode.NOT_FOUND,
          'カメラが見つかりません。カメラデバイスが接続されていることを確認してください。',
          'カメラが接続されていることを確認し、ブラウザを再読み込みしてください。'
        );
      case 'NotReadableError':
        return new CameraError(
          CameraErrorCode.IN_USE,
          'カメラは他のアプリケーションで使用中です。',
          '他のアプリケーション（ビデオ通話、他のブラウザタブなど）でカメラを使用していないか確認してください。'
        );
      case 'OverconstrainedError':
        return new CameraError(
          CameraErrorCode.CONSTRAINTS_ERROR,
          'カメラは要求された解像度に対応していません。',
          '別のカメラをお試しいただくか、ブラウザを再読み込みしてください。'
        );
      default:
        // Fall through to generic error
        break;
    }
  }

  // Generic error for unknown cases
  return new CameraError(
    CameraErrorCode.GENERIC,
    'カメラの起動に失敗しました。',
    '再度お試しいただくか、ブラウザの設定を確認してください。'
  );
}

/**
 * Default interval between captures (30 seconds in milliseconds)
 * @type {number}
 */
export const DEFAULT_INTERVAL_MS = 30000;

/**
 * Interval for continue_monitoring action (5 seconds in milliseconds)
 * @type {number}
 */
export const CONTINUE_MONITORING_INTERVAL_MS = 5000;

/**
 * Session Controller class
 *
 * Manages the lifecycle of a monitoring session including:
 * - Starting/ending sessions via API
 * - Capturing frames from video element
 * - Sending images for AI analysis
 * - Managing interval timers for periodic captures
 */
export class SessionController {
  /**
   * @param {HTMLVideoElement|null} videoElement - Video element for capturing frames
   * @param {SessionCallbacks} callbacks - Callback functions for session events
   * @param {SessionConfig} [config] - Optional configuration
   */
  constructor(videoElement, callbacks, config = {}) {
    this._videoElement = videoElement;
    this._callbacks = callbacks;
    this._config = {
      defaultIntervalMs: config.defaultIntervalMs || DEFAULT_INTERVAL_MS,
    };

    this._sessionId = null;
    this._timerId = null;
    this._running = false;
    this._cameraWarmedUp = false;

    // Default getUserMedia function (can be overridden for testing)
    this._getUserMediaFn = (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints);
  }

  /**
   * Set the getUserMedia function for dependency injection (useful for testing)
   * @param {function} fn - Function that returns a Promise<MediaStream>
   */
  setGetUserMediaFn(fn) {
    this._getUserMediaFn = fn;
  }

  /**
   * Get the current configuration
   * @returns {SessionConfig}
   */
  getConfig() {
    return { ...this._config };
  }

  /**
   * Get the current session ID
   * @returns {string|null}
   */
  getSessionId() {
    return this._sessionId;
  }

  /**
   * Check if the controller is currently running
   * @returns {boolean}
   */
  isRunning() {
    return this._running;
  }

  /**
   * Update the video element reference
   * @param {HTMLVideoElement|null} videoElement - New video element
   */
  updateVideoElement(videoElement) {
    this._videoElement = videoElement;
  }

  /**
   * Start a new monitoring session
   *
   * 1. Calls backend API to start session
   * 2. Stores session ID
   * 3. Performs initial capture and analysis
   * 4. Starts interval timer for periodic captures
   *
   * @param {string[]} [allowedDeviceIds] - Optional list of device IDs to allow for this session
   * @returns {Promise<void>}
   */
  async start(allowedDeviceIds) {
    // Prevent multiple starts
    if (this._running) {
      console.log('[SessionController] Already running, ignoring start request');
      return;
    }

    // Check if no devices selected (empty array, not undefined)
    // Requirement 3.3: Show warning when no devices selected
    if (Array.isArray(allowedDeviceIds) && allowedDeviceIds.length === 0) {
      if (this._callbacks.onNoDevicesSelected) {
        console.log('[SessionController] No devices selected, asking for confirmation...');
        const shouldContinue = await this._callbacks.onNoDevicesSelected();
        if (!shouldContinue) {
          console.log('[SessionController] User cancelled session start due to no devices');
          return;
        }
        console.log('[SessionController] User confirmed to continue without devices');
      }
    }

    try {
      // 1. Call API to start session with allowedDeviceIds
      console.log('[SessionController] Starting session via API...');
      const sessionData = await apiClient.startSession(allowedDeviceIds);

      // 2. Store session ID
      this._sessionId = sessionData.sessionId;
      this._running = true;
      console.log(`[SessionController] Session started: ${this._sessionId}`);

      // 3. Notify callback
      if (this._callbacks.onSessionStarted) {
        this._callbacks.onSessionStarted(sessionData);
      }

      // 4. Perform initial capture and analysis
      const initialInterval = await this._captureAndAnalyze();

      // 5. Start interval timer
      this._scheduleNextCapture(initialInterval);
    } catch (error) {
      console.error('[SessionController] Failed to start session:', error);
      this._running = false;
      this._sessionId = null;
      if (this._callbacks.onError) {
        this._callbacks.onError(error);
      }
    }
  }

  /**
   * Resume an existing monitoring session
   *
   * Used for page reload recovery - resumes the analysis loop for an
   * existing session without creating a new one via the API.
   *
   * Task 10.3-fix-1: Resume existing session after page reload
   *
   * @param {string} sessionId - Existing session ID from backend
   * @returns {Promise<void>}
   */
  async resumeExistingSession(sessionId) {
    // Prevent multiple starts
    if (this._running) {
      console.log('[SessionController] Already running, ignoring resume request');
      return;
    }

    console.log(`[SessionController] Resuming existing session: ${sessionId}`);

    // Set session state without calling API
    this._sessionId = sessionId;
    this._running = true;

    try {
      // Perform initial capture and analysis
      const initialInterval = await this._captureAndAnalyze();

      // Start interval timer
      this._scheduleNextCapture(initialInterval);

      console.log('[SessionController] Session resumed successfully');
    } catch (error) {
      console.error('[SessionController] Failed to resume session:', error);
      // Continue running even on error - the session is still active on backend
      if (this._callbacks.onError) {
        this._callbacks.onError(error);
      }
      // Schedule next capture with default interval
      this._scheduleNextCapture(this._config.defaultIntervalMs);
    }
  }

  /**
   * Start a new monitoring session with camera access
   *
   * This method handles the full flow:
   * 1. Requests camera access
   * 2. If camera access fails, aborts with user-friendly error
   * 3. If camera access succeeds, sets video element and starts session
   *
   * Requirements: 2.5
   * - Camera access denied: Show error message and abort session start
   * - Camera not found: Show error message and abort session start
   * - Guide user to change settings
   *
   * @returns {Promise<void>}
   */
  async startWithCamera() {
    // Prevent multiple starts
    if (this._running) {
      console.log('[SessionController] Already running, ignoring start request');
      return;
    }

    try {
      // 1. Request camera access
      console.log('[SessionController] Requesting camera access...');
      const stream = await this._getUserMediaFn({ video: true });

      // 2. Set the video element srcObject
      if (this._videoElement) {
        this._videoElement.srcObject = stream;
        console.log('[SessionController] Camera stream attached to video element');
      }

      // 3. Now start the session (calls API, captures, etc.)
      await this.start();
    } catch (error) {
      // Map to user-friendly CameraError
      const cameraError = mapCameraError(error);
      console.error('[SessionController] Camera access failed:', cameraError.message);
      console.log('[SessionController] Guidance:', cameraError.userGuidance);

      // Notify callback
      if (this._callbacks.onError) {
        this._callbacks.onError(cameraError);
      }
    }
  }

  /**
   * Stop the current monitoring session (internal use)
   *
   * Clears the interval timer and resets state.
   * Does not call the backend API (use endSession() for full cleanup).
   */
  stop() {
    if (!this._running) {
      return;
    }

    console.log('[SessionController] Stopping session...');

    // Clear timer
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }

    // Reset state
    this._running = false;
    this._sessionId = null;
    this._cameraWarmedUp = false;

    // Notify callback
    if (this._callbacks.onSessionEnded) {
      this._callbacks.onSessionEnded();
    }

    console.log('[SessionController] Session stopped');
  }

  /**
   * End the current monitoring session with full cleanup
   *
   * 1. Calls backend API to end session
   * 2. Stops the interval timer
   * 3. Releases camera stream
   * 4. Resets UI state
   *
   * Requirements: 1.3, 1.4, 2.4
   *
   * @returns {Promise<void>}
   */
  async endSession() {
    if (!this._running) {
      console.log('[SessionController] Not running, ignoring endSession request');
      return;
    }

    console.log('[SessionController] Ending session via API...');

    // Always perform cleanup regardless of API success
    const cleanup = () => {
      // Stop timer
      if (this._timerId !== null) {
        clearTimeout(this._timerId);
        this._timerId = null;
      }

      // Release camera stream
      this._releaseCameraStream();

      // Reset state
      this._running = false;
      this._sessionId = null;
    };

    try {
      // Call API to end session
      const sessionData = await apiClient.endSession();

      cleanup();

      console.log('[SessionController] Session ended successfully');

      // Notify callback with session data
      if (this._callbacks.onSessionEnded) {
        this._callbacks.onSessionEnded(sessionData);
      }
    } catch (error) {
      console.error('[SessionController] Failed to end session via API:', error);

      // Still perform cleanup on error
      cleanup();

      // Notify error callback
      if (this._callbacks.onError) {
        this._callbacks.onError(error);
      }
    }
  }

  /**
   * Release the camera stream and clear video element
   * @private
   */
  _releaseCameraStream() {
    if (this._videoElement && this._videoElement.srcObject) {
      const stream = this._videoElement.srcObject;
      if (stream && typeof stream.getTracks === 'function') {
        const tracks = stream.getTracks();
        tracks.forEach((track) => {
          track.stop();
          console.log('[SessionController] Camera track stopped');
        });
      }
      this._videoElement.srcObject = null;
      console.log('[SessionController] Camera stream released');
    }
  }

  /**
   * Clean up and destroy the controller
   */
  destroy() {
    this.stop();
    this._videoElement = null;
    this._callbacks = {};
  }

  /**
   * Capture a frame and send for analysis
   * @returns {Promise<number>} Next interval in milliseconds
   * @private
   */
  async _captureAndAnalyze() {
    // Wait for camera auto-exposure to stabilize on first capture
    if (!this._cameraWarmedUp) {
      console.log('[SessionController] Waiting for camera warmup (2s)...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      this._cameraWarmedUp = true;
      console.log('[SessionController] Camera warmup complete');
    }

    // Debug: log video element state before capture
    if (this._videoElement) {
      console.log('[SessionController] Video state:', {
        videoWidth: this._videoElement.videoWidth,
        videoHeight: this._videoElement.videoHeight,
        readyState: this._videoElement.readyState,
        paused: this._videoElement.paused,
        srcObject: !!this._videoElement.srcObject,
      });
    }

    // Capture frame
    const base64Image = captureFrame(this._videoElement);

    if (!base64Image) {
      console.warn('[SessionController] Failed to capture frame, skipping analysis');
      return this._config.defaultIntervalMs;
    }

    // Debug: show captured image on screen
    this._showDebugPreview(base64Image);

    try {
      console.log('[SessionController] Sending image for analysis...');
      const result = await apiClient.analyze(base64Image);

      // Log detailed analysis result
      this._logAnalysisResult(result);

      // Notify callback
      if (this._callbacks.onAnalysisResult) {
        this._callbacks.onAnalysisResult(result);
      }

      // Return the interval for next capture
      return result.nextIntervalMs || this._config.defaultIntervalMs;
    } catch (error) {
      console.error('[SessionController] Analysis failed:', error);
      if (this._callbacks.onError) {
        this._callbacks.onError(error);
      }
      // Continue with default interval on error
      return this._config.defaultIntervalMs;
    }
  }

  /**
   * Log detailed analysis result to console
   * @param {Object} result - Analysis result from API
   * @private
   */
  _logAnalysisResult(result) {
    const { action, result: actionResult, nextIntervalMs, deviceState } = result;

    console.log('[SessionController] Analysis result:', {
      tool: action.tool,
      params: action.params,
      executed: actionResult?.executed,
      message: actionResult?.message,
    });

    // Log error details if present
    if (result.error) {
      console.error('[SessionController] API Error:', result.error);
    }

    // Log device state if available
    if (deviceState) {
      console.log('[SessionController] Current device state:', {
        light: deviceState.light,
        aircon: deviceState.aircon,
        alexa: deviceState.alexa,
      });
    }

    // Log next interval
    const intervalSeconds = (nextIntervalMs || this._config.defaultIntervalMs) / 1000;
    const intervalText =
      intervalSeconds >= 60 ? `${intervalSeconds / 60} minutes` : `${intervalSeconds} seconds`;
    console.log(`[SessionController] Next analysis scheduled in ${intervalText}`);
  }

  /**
   * Show debug preview of captured image (temporary)
   * @param {string} base64Image - Base64 data URL
   * @private
   */
  _showDebugPreview(base64Image) {
    let container = document.getElementById('debugCapturePreview');
    if (!container) {
      container = document.createElement('div');
      container.id = 'debugCapturePreview';
      container.style.cssText =
        'position:fixed;bottom:10px;right:10px;z-index:99999;' +
        'background:rgba(0,0,0,0.85);padding:8px;border-radius:8px;' +
        'color:#0f0;font-family:monospace;font-size:11px;max-width:340px;';

      const label = document.createElement('div');
      label.textContent = 'DEBUG: Last Capture';
      label.style.marginBottom = '4px';
      container.appendChild(label);

      const img = document.createElement('img');
      img.id = 'debugCaptureImg';
      img.style.cssText = 'width:320px;border:1px solid #0f0;border-radius:4px;';
      container.appendChild(img);

      const info = document.createElement('div');
      info.id = 'debugCaptureInfo';
      info.style.marginTop = '4px';
      container.appendChild(info);

      document.body.appendChild(container);
    }

    const img = document.getElementById('debugCaptureImg');
    const info = document.getElementById('debugCaptureInfo');
    if (img) img.src = base64Image;
    if (info) {
      const sizeKB = Math.round((base64Image.length * 3) / 4 / 1024);
      const time = new Date().toLocaleTimeString();
      info.textContent = `${time} | ~${sizeKB}KB | ${this._videoElement?.videoWidth}x${this._videoElement?.videoHeight}`;
    }
  }

  /**
   * Schedule the next capture
   * @param {number} intervalMs - Interval in milliseconds
   * @private
   */
  _scheduleNextCapture(intervalMs) {
    if (!this._running) {
      return;
    }

    // Log schedule in human-readable format
    const intervalSeconds = intervalMs / 1000;
    const intervalText =
      intervalSeconds >= 60 ? `${intervalSeconds / 60} minutes` : `${intervalSeconds} seconds`;
    console.log(`[SessionController] Next capture in ${intervalText}`);

    this._timerId = setTimeout(async () => {
      if (!this._running) {
        return;
      }

      const nextInterval = await this._captureAndAnalyze();
      this._scheduleNextCapture(nextInterval);
    }, intervalMs);
  }
}

/**
 * Factory function to create a SessionController instance
 *
 * @param {HTMLVideoElement|null} videoElement - Video element for capturing
 * @param {SessionCallbacks} callbacks - Event callbacks
 * @param {SessionConfig} [config] - Optional configuration
 * @returns {SessionController}
 *
 * @typedef {Object} SessionCallbacks
 * @property {function(SessionResponse): void} [onSessionStarted] - Called when session starts
 * @property {function(): void} [onSessionEnded] - Called when session ends
 * @property {function(AnalyzeResponse): void} [onAnalysisResult] - Called with analysis result
 * @property {function(Error): void} [onError] - Called on errors
 *
 * @typedef {Object} SessionConfig
 * @property {number} [defaultIntervalMs] - Default capture interval (default: 300000)
 */
export function createSessionController(videoElement, callbacks, config) {
  return new SessionController(videoElement, callbacks, config);
}
