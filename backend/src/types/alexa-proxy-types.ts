/**
 * Alexa Proxy Types
 *
 * Type definitions for AlexaProxyService, ProxySession, and related error types.
 * These types are used by the AlexaProxyService (service layer) and
 * alexa-proxy-handler (handler layer).
 *
 * Requirements: 1.1, 1.3, 1.5, 5.1, 5.5
 * Task: 1.1
 */

import type { Result } from './action-types.js';
import type { CredentialService } from '../services/credential-service.js';

// =============================================================================
// ProxySession
// =============================================================================

/**
 * Represents an active or completed Alexa Proxy authentication session.
 */
export interface ProxySession {
  readonly sessionId: string;
  readonly uid: string;
  readonly proxyPort: number;
  readonly status: 'active' | 'completed' | 'failed' | 'timeout';
  readonly createdAt: string;
}

// =============================================================================
// AlexaProxyError
// =============================================================================

/**
 * Error codes for AlexaProxyService operations.
 */
export type AlexaProxyErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'PROXY_START_FAILED'
  | 'SAVE_FAILED'
  | 'TIMEOUT';

/**
 * Error type for AlexaProxyService operations.
 */
export interface AlexaProxyError {
  readonly code: AlexaProxyErrorCode;
  readonly message: string;
}

// =============================================================================
// AlexaProxyService Dependencies & Interface
// =============================================================================

/**
 * Dependencies for creating an AlexaProxyService instance.
 */
export interface AlexaProxyServiceDependencies {
  readonly credentialService: CredentialService;
  readonly createAlexaRemoteForProxyFn: (...args: readonly unknown[]) => Promise<unknown>;
}

/**
 * Service interface for managing Alexa Proxy authentication sessions.
 *
 * Responsibilities:
 * - Start/stop Proxy authentication sessions
 * - Track session lifecycle (active/completed/failed/timeout)
 * - Coordinate cookie capture and credential storage
 *
 * Invariants:
 * - One active Proxy session per user at a time
 * - Sessions timeout after 5 minutes
 */
export interface AlexaProxyService {
  startProxySession(uid: string): Promise<Result<ProxySession, AlexaProxyError>>;
  getProxySession(sessionId: string): ProxySession | undefined;
  stopProxySession(sessionId: string): Promise<Result<void, AlexaProxyError>>;
}
