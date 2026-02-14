/**
 * AlexaService - Foundation with Cookie Authentication Management
 *
 * Wraps alexa-remote2 callback API in a Promise-based interface.
 * Provides Cookie authentication management (load, save, proxy flow).
 * Returns AlexaResult<T> for all operations following the existing service pattern.
 *
 * Task 1.2 Requirements: 1.1, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 11.1, 11.2
 * Task 2.1 Requirements: 3.1, 3.2, 3.3, 11.1, 11.3, 11.4
 * Task 2.2 Requirements: 4.1, 4.2, 11.1
 * Task 2.3 Requirements: 5.1, 5.2, 5.3, 5.4, 11.1
 * Task 2.4 Requirements: 6.1, 6.2, 6.3, 11.1
 * Task 2.5 Requirements: 7.1, 7.2, 7.3, 11.1
 */

import AlexaRemote from 'alexa-remote2';
import type { InitOptions } from 'alexa-remote2';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AlexaServiceConfig,
  AlexaResult,
  AlexaOperationResult,
  AlexaRoutineInfo,
  AlexaDeviceInfo,
  AlexaPlayerState,
} from '../types/alexa-types.js';

// ============================================================================
// AlexaService Interface
// ============================================================================

/**
 * AlexaService provides a unified interface for controlling Amazon Alexa devices.
 * All methods return AlexaResult<T> for type-safe success/failure handling.
 *
 * When not connected, all operation methods return AUTH_ERROR.
 */
export interface AlexaService {
  speak(
    deviceSerialNumber: string,
    message: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  announce(
    deviceSerialNumber: string,
    message: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  getRoutines(): Promise<AlexaResult<readonly AlexaRoutineInfo[]>>;

  executeRoutine(
    routineName: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  setVolume(
    deviceSerialNumber: string,
    volume: number
  ): Promise<AlexaResult<AlexaOperationResult>>;

  textCommand(
    deviceSerialNumber: string,
    text: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  playWeather(
    deviceSerialNumber: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  playFlashBriefing(
    deviceSerialNumber: string
  ): Promise<AlexaResult<AlexaOperationResult>>;

  getDevices(): AlexaResult<readonly AlexaDeviceInfo[]>;

  getPlayerInfo(
    deviceSerialNumber: string
  ): Promise<AlexaResult<AlexaPlayerState>>;

  isConnected(): boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum text length for TTS speak command (Req 3.3) */
const TTS_MAX_LENGTH = 250;

/** Maximum number of routines to fetch from Alexa API (Req 5.2) */
const ROUTINE_FETCH_LIMIT = 200;

// ============================================================================
// AUTH_ERROR helper
// ============================================================================

function authError(): AlexaResult<never> {
  return {
    success: false,
    error: {
      code: 'AUTH_ERROR',
      message: 'Not connected to Alexa. Cookie authentication required.',
    },
  };
}

// ============================================================================
// Error classification helper
// ============================================================================

/**
 * Classify an alexa-remote2 error into the appropriate AlexaServiceErrorCode.
 * - Timeout-related errors (message contains 'timeout' or 'ETIMEDOUT') -> TIMEOUT
 * - All other errors -> ALEXA_ERROR
 */
function classifyAlexaError(err: Error): AlexaResult<never> {
  const msg = err.message.toLowerCase();
  if (msg.includes('timeout') || msg.includes('etimedout')) {
    return {
      success: false,
      error: {
        code: 'TIMEOUT',
        message: `Alexa API timed out: ${err.message}`,
        cause: err,
      },
    };
  }
  return {
    success: false,
    error: {
      code: 'ALEXA_ERROR',
      message: `Alexa operation failed: ${err.message}`,
      cause: err,
    },
  };
}

// ============================================================================
// Text truncation helper
// ============================================================================

/**
 * Truncate text to the TTS character limit (250 chars).
 * Returns the original text if within limit.
 */
function truncateForTTS(text: string): string {
  if (text.length <= TTS_MAX_LENGTH) {
    return text;
  }
  return text.slice(0, TTS_MAX_LENGTH);
}

// ============================================================================
// Cookie File Management
// ============================================================================

/**
 * Try to load saved cookie data from file.
 * Returns undefined if file doesn't exist or can't be read.
 */
function loadCookieFile(cookieFilePath: string): unknown | undefined {
  try {
    if (!existsSync(cookieFilePath)) {
      return undefined;
    }
    const raw = readFileSync(cookieFilePath, 'utf-8');
    return JSON.parse(raw) as unknown;
  } catch {
    // Invalid JSON or read error - treat as no cookie
    return undefined;
  }
}

/**
 * Save cookie data to file. Creates parent directory if needed.
 */
function saveCookieFile(cookieFilePath: string, cookieData: unknown): void {
  try {
    const dir = dirname(cookieFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(cookieFilePath, JSON.stringify(cookieData, null, 2), 'utf-8');
    console.log(`[AlexaService] Cookie saved successfully to ${cookieFilePath}`);
  } catch (e) {
    console.error(`[AlexaService] Failed to save cookie to ${cookieFilePath}:`, e);
  }
}

// ============================================================================
// Proxy Options Builder
// ============================================================================

/**
 * Build init options for proxy mode (no saved cookie).
 * Logs the proxy URL for user to open in browser (Req 2.2).
 */
function buildProxyOptions(
  baseOptions: { amazonPage: string; acceptLanguage: string; usePushConnection: boolean },
  config: AlexaServiceConfig
): InitOptions {
  const ip = config.proxyOwnIp ?? 'localhost';
  const port = config.proxyPort ?? 3456;

  console.log(
    `[AlexaService] Cookie not found. Starting proxy for authentication.`
  );
  console.log(
    `[AlexaService] Please open the following URL in your browser to login: http://${ip}:${port}`
  );

  return {
    ...baseOptions,
    proxyOnly: true,
    proxyOwnIp: ip,
    proxyPort: port,
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an AlexaService instance.
 *
 * This async factory function:
 * 1. Attempts to load saved cookies and connect
 * 2. If no cookies exist, starts proxy mode for browser-based authentication
 * 3. Always returns an AlexaService (never null). Unconnected instances return AUTH_ERROR.
 * 4. Listens for 'cookie' events to auto-save new cookies
 *
 * @param config - AlexaServiceConfig with connection settings
 * @returns AlexaService instance (connected or disconnected)
 */
export async function createAlexaService(
  config: AlexaServiceConfig
): Promise<AlexaService> {
  const alexa = new AlexaRemote();
  let connected = false;

  // Register cookie event handler to auto-save full cookie data (Req 2.3)
  // alexa-remote2 emits: (cookieString, csrf, macDms)
  // For reconnection, we need the full cookieData object (includes localCookie, macDms, etc.)
  alexa.on('cookie', () => {
    // Save the full cookieData from the alexa instance (not just the string)
    const fullCookieData = (alexa as unknown as Record<string, unknown>)['cookieData'];
    const dataToSave = fullCookieData ?? (alexa as unknown as Record<string, unknown>)['cookie'];
    console.log(`[AlexaService] Cookie event received (type: ${typeof dataToSave}), saving to ${config.cookieFilePath}`);
    saveCookieFile(config.cookieFilePath, dataToSave);
    if (dataToSave && !connected) {
      connected = true;
      console.log('[AlexaService] Connected via proxy authentication.');
    }
  });

  // Build init options based on cookie availability
  const savedCookie = loadCookieFile(config.cookieFilePath);
  const baseOptions = {
    amazonPage: config.amazonPage,
    acceptLanguage: config.acceptLanguage,
    usePushConnection: false,
  };

  let initOptions: InitOptions;
  if (savedCookie !== undefined && savedCookie !== null) {
    // Use saved cookie for reconnection (Req 2.4)
    console.log(`[AlexaService] Saved cookie found (type: ${typeof savedCookie}), attempting reconnection.`);
    const opts: Record<string, unknown> = { ...baseOptions };
    opts['cookie'] = savedCookie;
    // Restore formerRegistrationData and macDms for proper reconnection
    // alexa-remote2 requires these to avoid re-entering proxy auth flow
    if (typeof savedCookie === 'object' && savedCookie !== null) {
      const sc = savedCookie as Record<string, unknown>;
      if (sc['localCookie']) {
        opts['formerRegistrationData'] = savedCookie;
        opts['macDms'] = sc['macDms'];
        console.log('[AlexaService] Restored formerRegistrationData and macDms from saved cookie.');
      }
    }
    initOptions = opts as InitOptions;
  } else {
    initOptions = buildProxyOptions(baseOptions, config);
  }

  // Initialize alexa-remote2 with Promise wrapper (Req 1.1, 1.3)
  await new Promise<void>((resolve) => {
    alexa.init(initOptions, (err?: Error) => {
      if (err) {
        // Init failed - service will be in disconnected state
        // This is expected for proxy mode or expired cookies
        connected = false;
      } else {
        connected = true;
      }
      resolve();
    });
  });

  // --------------------------------------------------------------------------
  // Service Implementation
  // --------------------------------------------------------------------------

  const service: AlexaService = {
    speak(
      deviceSerialNumber: string,
      message: string
    ): Promise<AlexaResult<AlexaOperationResult>> {
      if (!connected) return Promise.resolve(authError());

      const truncatedMessage = truncateForTTS(message);

      return new Promise((resolve) => {
        alexa.sendSequenceCommand(
          deviceSerialNumber,
          'speak',
          truncatedMessage,
          (err?: Error) => {
            if (err) {
              resolve(classifyAlexaError(err));
            } else {
              resolve({
                success: true,
                data: { deviceSerialNumber, command: 'speak', success: true },
              });
            }
          }
        );
      });
    },

    announce(
      deviceSerialNumber: string,
      message: string
    ): Promise<AlexaResult<AlexaOperationResult>> {
      if (!connected) return Promise.resolve(authError());

      const truncatedMessage = truncateForTTS(message);

      return new Promise((resolve) => {
        alexa.sendSequenceCommand(
          deviceSerialNumber,
          'announcement',
          truncatedMessage,
          (err?: Error) => {
            if (err) {
              resolve(classifyAlexaError(err));
            } else {
              resolve({
                success: true,
                data: { deviceSerialNumber, command: 'announcement', success: true },
              });
            }
          }
        );
      });
    },

    getRoutines(): Promise<AlexaResult<readonly AlexaRoutineInfo[]>> {
      if (!connected) return Promise.resolve(authError());

      return new Promise((resolve) => {
        alexa.getAutomationRoutines(
          ROUTINE_FETCH_LIMIT,
          (err?: Error, body?: unknown) => {
            if (err) {
              resolve(classifyAlexaError(err));
              return;
            }

            // Parse routine list from alexa-remote2 response
            const rawRoutines = Array.isArray(body) ? body : [];
            const routines: AlexaRoutineInfo[] = rawRoutines.map(
              (r: { automationId?: string; name?: string }) => ({
                name: r.name ?? '',
                id: r.automationId ?? '',
              })
            );
            resolve({ success: true, data: routines });
          }
        );
      });
    },

    executeRoutine(
      routineName: string
    ): Promise<AlexaResult<AlexaOperationResult>> {
      if (!connected) return Promise.resolve(authError());

      // Step 1: Fetch routine list and find matching routine by name
      return new Promise((resolve) => {
        alexa.getAutomationRoutines(
          ROUTINE_FETCH_LIMIT,
          (err?: Error, body?: unknown) => {
            if (err) {
              resolve(classifyAlexaError(err));
              return;
            }

            const rawRoutines = Array.isArray(body) ? body : [];
            const matched = rawRoutines.find(
              (r: { name?: string }) => r.name === routineName
            ) as { automationId?: string; name?: string } | undefined;

            if (!matched) {
              resolve({
                success: false,
                error: {
                  code: 'ROUTINE_NOT_FOUND',
                  message: `Routine not found: ${routineName}`,
                },
              });
              return;
            }

            const routineId = matched.automationId ?? '';

            // Step 2: Execute the matched routine
            alexa.executeAutomationRoutine(
              routineId,
              routineId,
              (execErr?: Error) => {
                if (execErr) {
                  resolve(classifyAlexaError(execErr));
                } else {
                  resolve({
                    success: true,
                    data: {
                      deviceSerialNumber: '',
                      command: 'routine',
                      success: true,
                    },
                  });
                }
              }
            );
          }
        );
      });
    },

    setVolume(
      deviceSerialNumber: string,
      volume: number
    ): Promise<AlexaResult<AlexaOperationResult>> {
      if (!connected) return Promise.resolve(authError());

      // Validate volume range: 0-100 (Req 6.3)
      if (volume < 0 || volume > 100) {
        return Promise.resolve({
          success: false,
          error: {
            code: 'VOLUME_OUT_OF_RANGE',
            message: `Volume must be between 0 and 100, got: ${volume}`,
          },
        });
      }

      return new Promise((resolve) => {
        alexa.sendSequenceCommand(
          deviceSerialNumber,
          'volume',
          volume,
          (err?: Error) => {
            if (err) {
              resolve(classifyAlexaError(err));
            } else {
              resolve({
                success: true,
                data: { deviceSerialNumber, command: 'volume', success: true },
              });
            }
          }
        );
      });
    },

    textCommand(
      deviceSerialNumber: string,
      text: string
    ): Promise<AlexaResult<AlexaOperationResult>> {
      if (!connected) return Promise.resolve(authError());

      return new Promise((resolve) => {
        alexa.sendSequenceCommand(
          deviceSerialNumber,
          'textCommand',
          text,
          (err?: Error) => {
            if (err) {
              resolve(classifyAlexaError(err));
            } else {
              resolve({
                success: true,
                data: { deviceSerialNumber, command: 'textCommand', success: true },
              });
            }
          }
        );
      });
    },

    playWeather(
      deviceSerialNumber: string
    ): Promise<AlexaResult<AlexaOperationResult>> {
      if (!connected) return Promise.resolve(authError());

      return new Promise((resolve) => {
        alexa.sendSequenceCommand(
          deviceSerialNumber,
          'weather',
          '',
          (err?: Error) => {
            if (err) {
              resolve(classifyAlexaError(err));
            } else {
              resolve({
                success: true,
                data: { deviceSerialNumber, command: 'weather', success: true },
              });
            }
          }
        );
      });
    },

    playFlashBriefing(
      deviceSerialNumber: string
    ): Promise<AlexaResult<AlexaOperationResult>> {
      if (!connected) return Promise.resolve(authError());

      return new Promise((resolve) => {
        alexa.sendSequenceCommand(
          deviceSerialNumber,
          'flashbriefing',
          '',
          (err?: Error) => {
            if (err) {
              resolve(classifyAlexaError(err));
            } else {
              resolve({
                success: true,
                data: { deviceSerialNumber, command: 'flashbriefing', success: true },
              });
            }
          }
        );
      });
    },

    getPlayerInfo(
      deviceSerialNumber: string
    ): Promise<AlexaResult<AlexaPlayerState>> {
      if (!connected) return Promise.resolve(authError());

      return new Promise((resolve) => {
        alexa.getPlayerInfo(deviceSerialNumber, (err?: Error, body?: unknown) => {
          if (err) {
            resolve(classifyAlexaError(err));
            return;
          }

          // Parse playerInfo response from alexa-remote2
          const info = body as Record<string, unknown> | undefined;
          const playerState = info?.['playerInfo'] as Record<string, unknown> | undefined;
          const state = playerState?.['state'] as string | undefined;

          let normalizedState: 'PLAYING' | 'PAUSED' | 'IDLE';
          if (state === 'PLAYING') {
            normalizedState = 'PLAYING';
          } else if (state === 'PAUSED') {
            normalizedState = 'PAUSED';
          } else {
            normalizedState = 'IDLE';
          }

          resolve({ success: true, data: { state: normalizedState } });
        });
      });
    },

    getDevices(): AlexaResult<readonly AlexaDeviceInfo[]> {
      if (!connected) return authError();

      const serialNumbers = (alexa as unknown as Record<string, unknown>)['serialNumbers'] as
        | Record<string, Record<string, unknown>>
        | undefined;

      if (!serialNumbers) {
        return { success: true, data: [] };
      }

      const devices: AlexaDeviceInfo[] = Object.entries(serialNumbers)
        .filter(([, device]) => {
          // Exclude VOX (Alexa app on phone) - only return physical devices
          return device['deviceFamily'] !== 'VOX';
        })
        .map(([serial, device]) => ({
          serialNumber: serial,
          name: String(device['accountName'] ?? 'Unknown'),
          family: String(device['deviceFamily'] ?? 'Unknown'),
        }));

      return { success: true, data: devices };
    },

    isConnected(): boolean {
      return connected;
    },
  };

  return service;
}

// ============================================================================
// Proxy-Only Factory Function
// ============================================================================

/**
 * Minimal interface for the raw AlexaRemote instance used by proxy services.
 * Provides on() for event listening, stopProxyServer() for cleanup,
 * and proxyPort for reverse proxy routing.
 */
export interface AlexaRemoteForProxy {
  on(event: string, handler: (...args: readonly unknown[]) => void): void;
  stopProxyServer?: (() => void) | undefined;
  proxyPort?: number | undefined;
  /** Get the full cookie data object for proper reconnection (includes formerRegistrationData, macDms). */
  getCookieData(): unknown;
}

/**
 * Create a raw AlexaRemote instance configured for proxy-only mode.
 *
 * Unlike createAlexaService which returns an AlexaService wrapper,
 * this function returns the raw alexa-remote2 instance with on(),
 * stopProxyServer(), and proxyPort exposed -- specifically for use
 * by AlexaProxyService to manage proxy authentication sessions.
 *
 * @param config - AlexaServiceConfig with proxy settings
 * @returns AlexaRemoteForProxy with raw event and proxy methods
 */
export async function createAlexaRemoteForProxy(
  config: AlexaServiceConfig
): Promise<AlexaRemoteForProxy> {
  const alexa = new AlexaRemote();

  // alexa-remote2 stores `this._options = initOptions` (same reference).
  // alexa-cookie2 mutates `_options.proxyPort` after the proxy server starts
  // (assigns the OS-assigned port). We read proxyPort from this object after init.
  const initOptions: Record<string, unknown> = {
    amazonPage: config.amazonPage,
    acceptLanguage: config.acceptLanguage,
    usePushConnection: false,
    proxyOnly: true,
    proxyOwnIp: config.proxyOwnIp ?? 'localhost',
    proxyPort: config.proxyPort ?? 0,
  };

  // Initialize alexa-remote2 in proxy-only mode
  await new Promise<void>((resolve) => {
    alexa.init(initOptions as Parameters<typeof alexa.init>[0], () => {
      // In proxy-only mode, init callback fires after proxy server starts.
      // Errors here are expected (no cookie yet) and not blocking.
      resolve();
    });
  });

  // Return the raw instance with proxy-relevant methods
  return {
    on: (event: string, handler: (...args: readonly unknown[]) => void) => {
      alexa.on(event, handler);
    },
    stopProxyServer: () => {
      alexa.stopProxyServer(() => {});
    },
    // proxyPort is stored in _options (mutated by alexa-cookie2), not on the instance
    proxyPort: initOptions['proxyPort'] as number | undefined,
    getCookieData(): unknown {
      // Return the full cookie data object (cookieData > cookie) for proper reconnection.
      // cookieData includes formerRegistrationData and macDms needed by createAlexaService.
      const inst = alexa as unknown as Record<string, unknown>;
      return inst['cookieData'] ?? inst['cookie'];
    },
  };
}
