/**
 * Session-related type definitions
 *
 * Types for session management and action history.
 * Requirements: 1.2, 1.4, 1.6, 6.1, 6.3, 3.2 (allowedDevices)
 */

import type { AllowedDevice } from './device-types.js';

// Re-export device types that are used in session context
export type { AllowedDevice } from './device-types.js';

// Re-export from the canonical source
export type { AgentAction, Result } from './action-types.js';

/**
 * Session state interface
 */
export interface SessionState {
  readonly sessionId: string;
  readonly status: 'active' | 'ended';
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly allowedDevices?: readonly AllowedDevice[];
}

/**
 * Session error interface
 */
export interface SessionError {
  readonly code: 'NO_ACTIVE_SESSION';
  readonly message: string;
}

