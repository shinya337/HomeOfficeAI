/**
 * SessionManager Service
 *
 * Manages session state in-memory for HomeOffice.ai.
 * Handles session start/end, state tracking, and recent action history.
 *
 * Requirements: 1.2, 1.4, 1.6, 6.1, 6.3, 3.2 (allowedDevices)
 * Contract: SessionManagerService
 */
import { createId } from '@paralleldrive/cuid2';
import type {
  AgentAction,
  SessionState,
  SessionError,
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
 * SessionManager service interface
 */
export interface SessionManagerService {
  /**
   * Start a new session
   * @param allowedDevices - Optional list of allowed devices (validated in handler layer)
   * @returns The newly created session state
   */
  startSession(allowedDevices?: readonly AllowedDevice[]): SessionState;

  /**
   * End the current active session
   * @returns Result with ended session state or error if no active session
   */
  endSession(): Result<SessionState, SessionError>;

  /**
   * Get current session status
   * @returns Current session state or null if no active session
   */
  getStatus(): SessionState | null;

  /**
   * Check if there's an active session
   * @returns true if session is active
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
}

/**
 * Internal mutable session state
 */
interface MutableSessionState {
  sessionId: string;
  status: 'active' | 'ended';
  startedAt: string;
  endedAt?: string;
  allowedDevices?: readonly AllowedDevice[];
}

/**
 * Create a new SessionManager instance
 * @returns SessionManagerService implementation
 */
export function createSessionManager(): SessionManagerService {
  // Current session state (null when no session or session ended)
  let currentSession: MutableSessionState | null = null;

  // Recent action history
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
      status: state.status,
      startedAt: state.startedAt,
    };

    if (state.endedAt !== undefined) {
      (result as { endedAt?: string }).endedAt = state.endedAt;
    }

    if (state.allowedDevices !== undefined) {
      (result as { allowedDevices?: readonly AllowedDevice[] }).allowedDevices = state.allowedDevices;
    }

    return result;
  }

  return {
    startSession(allowedDevices?: readonly AllowedDevice[]): SessionState {
      // Create new session (replaces any existing session)
      currentSession = {
        sessionId: generateSessionId(),
        status: 'active',
        startedAt: new Date().toISOString(),
      };

      // Store allowed devices if provided (Requirement 3.2)
      if (allowedDevices !== undefined) {
        currentSession.allowedDevices = allowedDevices;
      }

      // Clear action history for new session
      recentActions = [];

      return toSessionState(currentSession);
    },

    endSession(): Result<SessionState, SessionError> {
      if (currentSession === null || currentSession.status !== 'active') {
        return {
          ok: false,
          error: {
            code: 'NO_ACTIVE_SESSION',
            message: 'No active session to end',
          },
        };
      }

      // Update session to ended state
      currentSession.status = 'ended';
      currentSession.endedAt = new Date().toISOString();

      const endedSession = toSessionState(currentSession);

      // Clear current session reference (session is now ended)
      currentSession = null;

      // Clear action history
      recentActions = [];

      return {
        ok: true,
        value: endedSession,
      };
    },

    getStatus(): SessionState | null {
      if (currentSession === null || currentSession.status !== 'active') {
        return null;
      }

      return toSessionState(currentSession);
    },

    hasActiveSession(): boolean {
      return currentSession !== null && currentSession.status === 'active';
    },

    addRecentAction(action: AgentAction): void {
      // Only add actions when there's an active session
      if (currentSession === null || currentSession.status !== 'active') {
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
  };
}
