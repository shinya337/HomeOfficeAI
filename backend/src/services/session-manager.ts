/**
 * SessionManager Service
 *
 * Manages multi-session state in-memory for HomeOffice.ai.
 * Handles session start/end, state tracking, user-scoped lookup,
 * TTL-based cleanup, and recent action history.
 *
 * Requirements: 1.2, 1.4, 1.6, 6.1, 6.2, 6.3, 3.2 (allowedDevices)
 * Contract: SessionManagerService
 */
import { createId } from '@paralleldrive/cuid2';
import type {
  AgentAction,
  SessionState,
  SessionError,
  SessionIoTServices,
  Result,
  AllowedDevice,
} from '../types/session-types.js';

// Re-export types for convenience
export type { SessionState, SessionError } from '../types/session-types.js';

/**
 * Maximum number of recent actions to retain
 */
const MAX_RECENT_ACTIONS = 10;

/**
 * Default TTL for abandoned sessions (2 hours in milliseconds)
 */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * SessionManager service interface
 */
export interface SessionManagerService {
  /**
   * Start a new session
   * @param uid - User ID (Firebase UID) or null for guest sessions
   * @param allowedDevices - Optional list of allowed devices (validated in handler layer)
   * @param iotServices - Optional user-specific IoT services for this session
   * @returns The newly created session state
   */
  startSession(uid: string | null, allowedDevices?: readonly AllowedDevice[], iotServices?: SessionIoTServices): SessionState;

  /**
   * End a session by session ID
   * @param sessionId - The ID of the session to end
   * @returns Result with ended session state or error if session not found
   */
  endSession(sessionId: string): Result<SessionState, SessionError>;

  /**
   * Get a session by session ID
   * @param sessionId - The session ID to look up
   * @returns Session state or undefined if not found
   */
  getSession(sessionId: string): SessionState | undefined;

  /**
   * Find an active session by user ID
   * @param uid - The Firebase UID to search for
   * @returns Active session state for the user or undefined
   */
  getActiveSessionByUid(uid: string): SessionState | undefined;

  /**
   * Get any active session status (backward compatibility)
   * @returns Any active session state or null if no active sessions
   */
  getStatus(): SessionState | null;

  /**
   * Check if there's at least one active session
   * @returns true if any session is active
   */
  hasActiveSession(): boolean;

  /**
   * Add an action to recent history
   * @param action The agent action to record
   */
  addRecentAction(action: AgentAction): void;

  /**
   * Get recent action history
   * @returns Array of recent actions (max 10)
   */
  getRecentActions(): AgentAction[];

  /**
   * Get IoT services bound to a session
   * @param sessionId - The session ID to look up
   * @returns IoT services or undefined if session not found or has no IoT services
   */
  getSessionIoTServices(sessionId: string): SessionIoTServices | undefined;

  /**
   * Clean up sessions that have exceeded the TTL
   */
  cleanupExpiredSessions(): void;
}

/**
 * Internal mutable session state
 */
interface MutableSessionState {
  sessionId: string;
  uid: string | null;
  status: 'active' | 'ended';
  startedAt: string;
  endedAt?: string;
  allowedDevices?: readonly AllowedDevice[];
  iotServices?: SessionIoTServices;
  createdAtMs: number;
}

/**
 * Create a new SessionManager instance
 * @returns SessionManagerService implementation
 */
export function createSessionManager(): SessionManagerService {
  // Multi-session store: Map<sessionId, MutableSessionState>
  const sessions = new Map<string, MutableSessionState>();

  // Recent action history (shared across sessions for backward compatibility)
  let recentActions: AgentAction[] = [];

  /**
   * Generate a unique session ID using CUID2
   */
  function generateSessionId(): string {
    return createId();
  }

  /**
   * Convert mutable state to immutable SessionState
   */
  function toSessionState(state: MutableSessionState): SessionState {
    const result: SessionState = {
      sessionId: state.sessionId,
      uid: state.uid,
      status: state.status,
      startedAt: state.startedAt,
      hasIoTServices: state.iotServices !== undefined,
    };

    if (state.endedAt !== undefined) {
      (result as { endedAt?: string }).endedAt = state.endedAt;
    }

    if (state.allowedDevices !== undefined) {
      (result as { allowedDevices?: readonly AllowedDevice[] }).allowedDevices = state.allowedDevices;
    }

    return result;
  }

  /**
   * Find the first active session in the map
   */
  function findFirstActiveSession(): MutableSessionState | undefined {
    for (const session of sessions.values()) {
      if (session.status === 'active') {
        return session;
      }
    }
    return undefined;
  }

  return {
    startSession(uid: string | null, allowedDevices?: readonly AllowedDevice[], iotServices?: SessionIoTServices): SessionState {
      const newSession: MutableSessionState = {
        sessionId: generateSessionId(),
        uid,
        status: 'active',
        startedAt: new Date().toISOString(),
        createdAtMs: Date.now(),
      };

      // Store allowed devices if provided (Requirement 3.2)
      if (allowedDevices !== undefined) {
        newSession.allowedDevices = allowedDevices;
      }

      // Store user-specific IoT services if provided (Requirements 6.1, 6.2)
      if (iotServices !== undefined) {
        newSession.iotServices = iotServices;
      }

      // Add to sessions map
      sessions.set(newSession.sessionId, newSession);

      // Clear action history for new session (backward compatibility)
      recentActions = [];

      return toSessionState(newSession);
    },

    endSession(sessionId: string): Result<SessionState, SessionError> {
      const session = sessions.get(sessionId);

      if (session === undefined || session.status !== 'active') {
        return {
          ok: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session not found or already ended: ${sessionId}`,
          },
        };
      }

      // Update session to ended state
      session.status = 'ended';
      session.endedAt = new Date().toISOString();

      // Clean up IoT services reference (Requirements 6.1, 6.2)
      delete session.iotServices;

      const endedSession = toSessionState(session);

      // Remove from sessions map (ended sessions are cleaned up immediately)
      sessions.delete(sessionId);

      // Clear action history
      recentActions = [];

      return {
        ok: true,
        value: endedSession,
      };
    },

    getSession(sessionId: string): SessionState | undefined {
      const session = sessions.get(sessionId);
      if (session === undefined || session.status !== 'active') {
        return undefined;
      }
      return toSessionState(session);
    },

    getActiveSessionByUid(uid: string): SessionState | undefined {
      for (const session of sessions.values()) {
        if (session.status === 'active' && session.uid === uid) {
          return toSessionState(session);
        }
      }
      return undefined;
    },

    getStatus(): SessionState | null {
      const active = findFirstActiveSession();
      if (active === undefined) {
        return null;
      }
      return toSessionState(active);
    },

    hasActiveSession(): boolean {
      for (const session of sessions.values()) {
        if (session.status === 'active') {
          return true;
        }
      }
      return false;
    },

    addRecentAction(action: AgentAction): void {
      // Only add actions when there's at least one active session
      if (!this.hasActiveSession()) {
        return;
      }

      recentActions.push(action);

      // Trim to max size, keeping most recent
      if (recentActions.length > MAX_RECENT_ACTIONS) {
        recentActions = recentActions.slice(-MAX_RECENT_ACTIONS);
      }
    },

    getRecentActions(): AgentAction[] {
      // Return a copy to prevent external mutation
      return [...recentActions];
    },

    getSessionIoTServices(sessionId: string): SessionIoTServices | undefined {
      const session = sessions.get(sessionId);
      if (session === undefined || session.status !== 'active') {
        return undefined;
      }
      return session.iotServices;
    },

    cleanupExpiredSessions(): void {
      const now = Date.now();
      const expiredIds: string[] = [];

      for (const [sessionId, session] of sessions.entries()) {
        if (now - session.createdAtMs > SESSION_TTL_MS) {
          expiredIds.push(sessionId);
        }
      }

      for (const id of expiredIds) {
        sessions.delete(id);
      }
    },
  };
}
