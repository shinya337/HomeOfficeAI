/**
 * API Client Module for HomeOffice.ai
 *
 * Provides functions to communicate with the backend REST API.
 * Uses the Fetch API for HTTP requests.
 *
 * Requirements: 1.1, 1.3, 2.1, 2.3, 3.1
 * - 1.1: Session start API call (POST /api/session/start)
 * - 1.3: Session end API call (POST /api/session/end)
 * - 2.1: Device list API call (GET /api/devices)
 * - 2.3: Image analysis API call (POST /api/analyze)
 * - 3.1: Firebase IDトークンをAuthorizationヘッダーに付与
 */

/**
 * Custom error class for API errors
 * @extends Error
 */
export class ApiError extends Error {
  /**
   * @param {string} code - Error code from the API
   * @param {string} message - Error message
   * @param {number} [status] - HTTP status code
   * @param {number} [retryAfter] - Seconds until retry is allowed (for rate limiting)
   */
  constructor(code, message, status, retryAfter) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * Base URL for API requests
 * Empty string = same-origin (production: single container, development: Vite proxy)
 */
const API_BASE = '';

const ANALYZE_TIMEOUT_MS = 120_000;
const ANALYZE_RETRY_DELAY_MS = 2_000;

/**
 * Default headers for JSON API requests
 */
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

/**
 * Auth token provider function (set via setAuthTokenProvider)
 * @type {(() => Promise<string|null>) | null}
 */
let authTokenProvider = null;

/**
 * Current session ID (stored from startSession response, cleared on endSession)
 * @type {string|null}
 */
let currentSessionId = null;

/**
 * Set the auth token provider function.
 * When set, the provider is called before every API request to get a fresh
 * Firebase ID token. The token is added as an Authorization: Bearer header.
 * Pass null to clear (guest mode).
 *
 * @param {(() => Promise<string|null>) | null} getIdToken - Function that returns a Firebase ID token, or null
 */
export function setAuthTokenProvider(getIdToken) {
  authTokenProvider = getIdToken;
}

/**
 * Get the current session ID.
 * Returns null when no session is active.
 *
 * @returns {string|null}
 */
export function getSessionId() {
  return currentSessionId;
}

/**
 * Clear the current session ID.
 * Used when logging out or resetting state.
 */
export function clearSessionId() {
  currentSessionId = null;
}

/**
 * Build headers for an API request, including Authorization if available.
 * @returns {Promise<Object>} Headers object
 */
async function buildHeaders() {
  const headers = { ...DEFAULT_HEADERS };

  if (authTokenProvider) {
    const token = await authTokenProvider();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

/**
 * Helper function to handle API responses
 * @param {Response} response - Fetch response object
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {ApiError} When response is not ok
 */
async function handleResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    const error = data.error || { code: 'UNKNOWN_ERROR', message: 'An error occurred' };
    throw new ApiError(error.code, error.message, response.status, error.retryAfter);
  }

  return data;
}

/**
 * Start a new monitoring session
 *
 * Calls POST /api/session/start to create a new session.
 * The backend will generate a unique session ID and set status to 'active'.
 *
 * @param {string[]} [allowedDeviceIds] - Optional list of device IDs to allow for this session
 * @param {Object.<string, string[]>} [deviceToolOverrides] - Optional per-device tool overrides
 * @returns {Promise<SessionResponse>} Session information
 * @throws {ApiError} On server or network error
 *
 * @typedef {Object} SessionResponse
 * @property {string} sessionId - Unique session identifier
 * @property {'active'|'ended'} status - Session status
 * @property {string} startedAt - ISO timestamp of session start
 * @property {string} [endedAt] - ISO timestamp of session end (only when ended)
 * @property {AllowedDevice[]} [allowedDevices] - List of allowed devices for this session
 *
 * @typedef {Object} AllowedDevice
 * @property {string} id - Device ID
 * @property {string} type - Device type (LIGHT, AC, TV, IR)
 */
export async function startSession(allowedDeviceIds, deviceToolOverrides) {
  try {
    const headers = await buildHeaders();
    const fetchOptions = {
      method: 'POST',
      headers,
    };

    // Only include body when allowedDeviceIds is provided (including empty array)
    if (allowedDeviceIds !== undefined) {
      const bodyObj = { allowedDeviceIds };
      if (deviceToolOverrides && Object.keys(deviceToolOverrides).length > 0) {
        bodyObj.deviceToolOverrides = deviceToolOverrides;
      }
      fetchOptions.body = JSON.stringify(bodyObj);
    }

    const response = await fetch(`${API_BASE}/api/session/start`, fetchOptions);

    const data = await handleResponse(response);

    // Store sessionId for subsequent requests (analyze, session/end)
    if (data.sessionId) {
      currentSessionId = data.sessionId;
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * End the current monitoring session
 *
 * Calls POST /api/session/end to terminate the active session.
 * Will fail with NO_ACTIVE_SESSION if no session is active.
 *
 * @returns {Promise<SessionResponse>} Session information with endedAt
 * @throws {ApiError} On no active session (400) or server error (500)
 */
export async function endSession() {
  try {
    const headers = await buildHeaders();
    const fetchOptions = {
      method: 'POST',
      headers,
    };

    // Include sessionId in request body if available
    if (currentSessionId) {
      fetchOptions.body = JSON.stringify({ sessionId: currentSessionId });
    }

    const response = await fetch(`${API_BASE}/api/session/end`, fetchOptions);

    const data = await handleResponse(response);

    // Clear sessionId after successful end
    currentSessionId = null;

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Detect MIME type from base64 data URI
 * @param {string} base64 - Base64 string (may include data URI prefix)
 * @returns {string} MIME type (defaults to 'image/jpeg')
 */
function detectMimeType(base64) {
  // Check for data URI format: data:image/png;base64,...
  const dataUriMatch = base64.match(/^data:(image\/[a-z]+);base64,/i);
  if (dataUriMatch) {
    return dataUriMatch[1].toLowerCase();
  }
  // Default to JPEG if no data URI prefix
  return 'image/jpeg';
}

/**
 * Send an image for AI analysis
 *
 * Calls POST /api/analyze with the captured image.
 * The backend will analyze the image using AI and determine
 * if any IoT device actions should be taken.
 *
 * @param {string} base64Image - Base64 encoded image (with or without data URI prefix)
 * @returns {Promise<AnalyzeResponse>} Analysis result
 * @throws {ApiError} On no active session (400), AI error (500), or network error
 *
 * @typedef {Object} AnalyzeResponse
 * @property {boolean} success - Whether analysis succeeded
 * @property {ActionInfo} action - Selected action
 * @property {ActionResult} result - Action execution result
 * @property {number} nextIntervalMs - Time until next analysis (milliseconds)
 * @property {DeviceState} [deviceState] - Current device states
 * @property {ErrorInfo} [error] - Error details if success is false
 *
 * @typedef {Object} ActionInfo
 * @property {string} tool - Tool name (light_control, aircon_control, continue_monitoring, do_nothing)
 * @property {Object} params - Action parameters
 *
 * @typedef {Object} ActionResult
 * @property {boolean} executed - Whether action was executed
 * @property {string} message - Result message
 *
 * @typedef {Object} DeviceState
 * @property {LightState|null} light - Light state
 * @property {AirconState|null} aircon - Aircon state
 */
export async function analyze(base64Image) {
  const doFetch = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

    try {
      const headers = await buildHeaders();
      const mimeType = detectMimeType(base64Image);
      const bodyObj = { image: { base64: base64Image, mimeType } };
      if (currentSessionId) {
        bodyObj.sessionId = currentSessionId;
      }

      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return handleResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ApiError) throw error;
      if (error.name === 'AbortError') {
        throw new ApiError('NETWORK_ERROR', 'Analysis request timed out');
      }
      throw new ApiError('NETWORK_ERROR', error.message);
    }
  };

  // 1回リトライ（NETWORK_ERRORのみ）
  try {
    return await doFetch();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'NETWORK_ERROR') {
      throw error;
    }
    console.log('[API] analyze() network error, retrying in 2s...');
    await new Promise((resolve) => setTimeout(resolve, ANALYZE_RETRY_DELAY_MS));
    return await doFetch();
  }
}

/**
 * Get list of registered devices from Nature Remo
 *
 * Calls GET /api/devices to retrieve all registered appliances.
 * Used to display device selection options in the settings UI.
 *
 * @returns {Promise<DeviceListResponse>} Device list
 * @throws {ApiError} On Nature Remo API error (503), rate limit (429), or network error
 *
 * @typedef {Object} DeviceListResponse
 * @property {Device[]} devices - List of registered devices
 *
 * @typedef {Object} Device
 * @property {string} id - Device ID
 * @property {string} name - Device name (display name from Nature Remo)
 * @property {string} type - Device type (LIGHT, AC, TV, IR)
 */
export async function getDevices() {
  try {
    const headers = await buildHeaders();

    const response = await fetch(`${API_BASE}/api/devices`, {
      method: 'GET',
      headers,
    });

    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Get current session status
 *
 * Calls GET /api/session/status to retrieve the current session state.
 * Used for page reload state restoration to restore device selection.
 *
 * Requirement 2.3: Store selection state in session scope (for restoration)
 *
 * @returns {Promise<SessionStatusResponse>} Session status
 * @throws {ApiError} On server error (500) or network error
 *
 * @typedef {Object} SessionStatusResponse
 * @property {boolean} hasActiveSession - Whether there is an active session
 * @property {SessionResponse|null} session - Session details if active, null otherwise
 */
export async function getSessionStatus() {
  try {
    const headers = await buildHeaders();

    const response = await fetch(`${API_BASE}/api/session/status`, {
      method: 'GET',
      headers,
    });

    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Save an IoT credential token for the specified service
 *
 * Calls PUT /api/credentials/:service with the token.
 * Requires authentication.
 *
 * @param {string} service - Service name (e.g., 'nature-remo')
 * @param {string} token - The token value to save
 * @returns {Promise<{ok: boolean}>} Save result
 * @throws {ApiError} On validation error (400), auth error (401), or server error (500)
 */
export async function saveCredential(service, token) {
  try {
    const headers = await buildHeaders();
    const response = await fetch(`${API_BASE}/api/credentials/${service}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ token }),
    });
    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Get credential configuration status for all services
 *
 * Calls GET /api/credentials/status.
 * Requires authentication. Does not return raw token values.
 *
 * @returns {Promise<{credentials: Array<{service: string, configured: boolean, updatedAt?: string}>}>} Credential status
 * @throws {ApiError} On auth error (401) or server error (500)
 */
export async function getCredentialStatus() {
  try {
    const headers = await buildHeaders();
    const response = await fetch(`${API_BASE}/api/credentials/status`, {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Start Alexa Proxy authentication session
 *
 * Calls POST /api/alexa-auth/start to begin a Proxy authentication session.
 * Returns a sessionId and proxyUrl for opening the Amazon login popup.
 * Requires authentication.
 *
 * @returns {Promise<{sessionId: string, proxyUrl: string}>} Proxy session info
 * @throws {ApiError} On auth error (401), session conflict (409), or server error (500)
 */
export async function startAlexaAuth() {
  try {
    const headers = await buildHeaders();
    const response = await fetch(`${API_BASE}/api/alexa-auth/start`, {
      method: 'POST',
      headers,
    });
    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Get Alexa Proxy authentication session status
 *
 * Calls GET /api/alexa-auth/status/:sessionId for polling the authentication state.
 * Returns status (active/completed/failed/timeout) and a completed flag.
 * Requires authentication.
 *
 * @param {string} sessionId - Proxy session ID returned from startAlexaAuth
 * @returns {Promise<{status: string, completed: boolean}>} Session status
 * @throws {ApiError} On auth error (401), session not found (404), or server error (500)
 */
export async function getAlexaAuthStatus(sessionId) {
  try {
    const headers = await buildHeaders();
    const response = await fetch(`${API_BASE}/api/alexa-auth/status/${sessionId}`, {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Delete an IoT credential for the specified service
 *
 * Calls DELETE /api/credentials/:service.
 * Requires authentication.
 *
 * @param {string} service - Service name (e.g., 'nature-remo')
 * @returns {Promise<{ok: boolean}>} Delete result
 * @throws {ApiError} On auth error (401), not found (404), or server error (500)
 */
export async function deleteCredential(service) {
  try {
    const headers = await buildHeaders();
    const response = await fetch(`${API_BASE}/api/credentials/${service}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Save user preferences to Firestore
 *
 * Calls PUT /api/preferences with camera, voice, and selectedDevices.
 * Requires authentication.
 *
 * @param {{ camera: boolean, voice: boolean, selectedDevices: Array }} preferences
 * @returns {Promise<{ok: boolean}>} Save result
 * @throws {ApiError} On validation error (400), auth error (401), or server error (500)
 */
export async function savePreferences(preferences) {
  try {
    const headers = await buildHeaders();
    const response = await fetch(`${API_BASE}/api/preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(preferences),
    });
    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

/**
 * Get user preferences from Firestore
 *
 * Calls GET /api/preferences.
 * Requires authentication. Returns { preferences: null } if not yet saved.
 *
 * @returns {Promise<{preferences: {camera: boolean, voice: boolean, selectedDevices: Array, updatedAt: string} | null}>}
 * @throws {ApiError} On auth error (401) or server error (500)
 */
export async function getPreferences() {
  try {
    const headers = await buildHeaders();
    const response = await fetch(`${API_BASE}/api/preferences`, {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', error.message);
  }
}

