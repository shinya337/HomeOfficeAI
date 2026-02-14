/**
 * AlexaProxyService
 *
 * Manages Alexa Proxy authentication sessions. Each session starts an
 * alexa-remote2 instance in proxyOnly mode on an internal localhost port.
 * When the user completes Amazon login through the proxy, the cookie event
 * fires and the cookie data is JSON-stringified and saved via CredentialService.
 *
 * Session management: duplicate prevention (one active session per user),
 * 5-minute timeout with auto-cleanup, proxy server stop on completion.
 *
 * Requirements: 1.1, 1.3, 5.1, 5.4, 5.5
 * Tasks: 2.1, 2.2
 */
import { createId } from '@paralleldrive/cuid2';
import { unlinkSync, existsSync } from 'node:fs';
import type { Result } from '../types/action-types.js';
import type {
  AlexaProxyService,
  AlexaProxyError,
  ProxySession,
} from '../types/alexa-proxy-types.js';
import type { CredentialService } from './credential-service.js';
import type { AlexaServiceConfig } from '../../packages/alexa-remote2/src/types/alexa-types.js';
import type { AlexaRemoteForProxy } from '../../packages/alexa-remote2/src/services/alexa-service.js';

// =============================================================================
// Constants
// =============================================================================

/** Alexa credential service name for CredentialService */
const ALEXA_SERVICE_NAME = 'alexa';

/** Temp file directory for proxy cookie files */
const TEMP_DIR = '/tmp';

/** Proxy session timeout in milliseconds (5 minutes) */
const PROXY_SESSION_TIMEOUT_MS = 5 * 60 * 1000;

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Mutable internal session state (extends public ProxySession).
 */
interface MutableProxySession {
  readonly sessionId: string;
  readonly uid: string;
  proxyPort: number;
  status: 'active' | 'completed' | 'failed' | 'timeout';
  readonly createdAt: string;
  readonly cookieFilePath: string;
  alexaInstance: AlexaRemoteForProxy | undefined;
  timeoutId: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Dependencies for creating an AlexaProxyService.
 *
 * createAlexaRemoteForProxyFn: Factory function that creates a raw AlexaRemote
 * instance in proxy-only mode. Must return AlexaRemoteForProxy (not AlexaService).
 */
export interface CreateAlexaProxyServiceDeps {
  readonly credentialService: CredentialService;
  readonly createAlexaRemoteForProxyFn: (config: AlexaServiceConfig) => Promise<AlexaRemoteForProxy>;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an AlexaProxyService instance.
 *
 * @param deps - CredentialService and createAlexaService function
 * @returns AlexaProxyService
 */
export function createAlexaProxyService(
  deps: CreateAlexaProxyServiceDeps
): AlexaProxyService {
  const { credentialService, createAlexaRemoteForProxyFn } = deps;

  /** Active proxy sessions keyed by sessionId */
  const sessions = new Map<string, MutableProxySession>();

  /** Index from uid to sessionId for duplicate detection */
  const uidToSessionId = new Map<string, string>();

  /**
   * Convert mutable session to public readonly ProxySession.
   */
  function toProxySession(session: MutableProxySession): ProxySession {
    return {
      sessionId: session.sessionId,
      uid: session.uid,
      proxyPort: session.proxyPort,
      status: session.status,
      createdAt: session.createdAt,
    };
  }

  /**
   * Release session resources: clear timeout, stop proxy server, release instance.
   * Does NOT remove from maps or delete temp files (caller decides).
   */
  function releaseSessionResources(session: MutableProxySession): void {
    if (session.timeoutId !== undefined) {
      clearTimeout(session.timeoutId);
      session.timeoutId = undefined;
    }

    if (session.alexaInstance?.stopProxyServer) {
      try {
        session.alexaInstance.stopProxyServer();
      } catch {
        // Ignore stop errors
      }
    }

    session.alexaInstance = undefined;
  }

  /**
   * Remove temp cookie file (best-effort, errors ignored).
   */
  function removeTempFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Clear uid-to-session mapping if it still points to this session.
   */
  function clearUidMapping(session: MutableProxySession): void {
    if (uidToSessionId.get(session.uid) === session.sessionId) {
      uidToSessionId.delete(session.uid);
    }
  }

  /**
   * Full cleanup: release resources, delete temp file, remove from all maps.
   * Used by stopProxySession and error recovery.
   */
  function cleanupSession(session: MutableProxySession): void {
    releaseSessionResources(session);
    removeTempFile(session.cookieFilePath);
    sessions.delete(session.sessionId);
    clearUidMapping(session);
  }

  /**
   * Handle session timeout: update status, release resources, clear uid mapping.
   * The session record is kept (with status 'timeout') so getProxySession can
   * report it; the uid mapping is cleared so a new session can start.
   */
  function handleTimeout(session: MutableProxySession): void {
    session.status = 'timeout';
    console.warn(
      `[AlexaProxyService] Proxy session timeout for user ${session.uid}, session ${session.sessionId}`
    );
    releaseSessionResources(session);
    removeTempFile(session.cookieFilePath);
    clearUidMapping(session);
  }

  /**
   * Finalize a session after cookie save (success or failure).
   * Releases resources and clears uid mapping so user can start a new session.
   * Session record is kept for status polling.
   */
  function finalizeAfterCookie(session: MutableProxySession): void {
    releaseSessionResources(session);
    clearUidMapping(session);
  }

  // ---------------------------------------------------------------------------
  // Interface Methods
  // ---------------------------------------------------------------------------

  async function startProxySession(
    uid: string
  ): Promise<Result<ProxySession, AlexaProxyError>> {
    // Check for duplicate active session for this user
    const existingSessionId = uidToSessionId.get(uid);
    if (existingSessionId !== undefined) {
      const existing = sessions.get(existingSessionId);
      if (existing && existing.status === 'active') {
        return {
          ok: false,
          error: {
            code: 'SESSION_ALREADY_ACTIVE',
            message: `User ${uid} already has an active proxy session: ${existingSessionId}`,
          },
        };
      }
    }

    const sessionId = createId();
    const cookieFilePath = `${TEMP_DIR}/alexa-proxy-${sessionId}.json`;

    const config: AlexaServiceConfig = {
      amazonPage: 'amazon.co.jp',
      acceptLanguage: 'ja-JP',
      cookieFilePath,
      proxyOwnIp: 'localhost',
      proxyPort: 0,
    };

    // Create the session record
    const session: MutableProxySession = {
      sessionId,
      uid,
      proxyPort: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      cookieFilePath,
      alexaInstance: undefined,
      timeoutId: undefined,
    };

    try {
      const alexaInstance = await createAlexaRemoteForProxyFn(config);
      session.alexaInstance = alexaInstance;

      // Resolve the actual proxy port (OS-assigned or from the instance)
      if (alexaInstance.proxyPort !== undefined && alexaInstance.proxyPort !== 0) {
        session.proxyPort = alexaInstance.proxyPort;
      }

      // Register cookie event handler
      alexaInstance.on('cookie', () => {
        // Save the FULL cookie data object (includes formerRegistrationData, macDms)
        // so that createAlexaService can reconnect without starting a new proxy.
        // The event argument is only the cookie string, which is insufficient.
        const fullCookieData = alexaInstance.getCookieData();
        const cookieJSON = JSON.stringify(fullCookieData);
        void credentialService
          .saveToken(uid, ALEXA_SERVICE_NAME, cookieJSON)
          .then((saveResult) => {
            if (saveResult.ok) {
              session.status = 'completed';
              console.log(
                `[AlexaProxyService] Cookie saved for user ${uid}, session ${sessionId}`
              );
            } else {
              session.status = 'failed';
              console.error(
                `[AlexaProxyService] Failed to save cookie for user ${uid}: ${saveResult.error.message}`
              );
            }
            // Stop proxy server and clean up after cookie resolution
            finalizeAfterCookie(session);
          });
      });

      // Set session timeout (5 minutes)
      session.timeoutId = setTimeout(() => {
        handleTimeout(session);
      }, PROXY_SESSION_TIMEOUT_MS);

      // Store session
      sessions.set(sessionId, session);
      uidToSessionId.set(uid, sessionId);

      return { ok: true, value: toProxySession(session) };
    } catch (error) {
      // Proxy startup failed
      cleanupSession(session);
      return {
        ok: false,
        error: {
          code: 'PROXY_START_FAILED',
          message:
            error instanceof Error
              ? `Proxyの起動に失敗しました: ${error.message}`
              : 'Proxyの起動に失敗しました: 不明なエラー',
        },
      };
    }
  }

  function getProxySession(sessionId: string): ProxySession | undefined {
    const session = sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    return toProxySession(session);
  }

  async function stopProxySession(
    sessionId: string
  ): Promise<Result<void, AlexaProxyError>> {
    const session = sessions.get(sessionId);
    if (!session) {
      return {
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Proxyセッションが見つかりません: ${sessionId}`,
        },
      };
    }

    cleanupSession(session);
    return { ok: true, value: undefined };
  }

  return {
    startProxySession,
    getProxySession,
    stopProxySession,
  };
}
