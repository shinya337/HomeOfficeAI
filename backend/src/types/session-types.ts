/**
 * Session-related type definitions
 *
 * Types for session management and action history.
 * Requirements: 1.2, 1.4, 1.6, 6.1, 6.2, 6.3, 3.2 (allowedDevices)
 */

import type { AllowedDevice } from './device-types.js';
import type { LightService, AirconService, AlexaServiceForDispatcher } from '../dispatcher/action-dispatcher.js';

// Re-export device types that are used in session context
export type { AllowedDevice } from './device-types.js';

// Re-export from the canonical source
export type { AgentAction, Result } from './action-types.js';

// Re-export AlexaServiceForDispatcher for convenience
export type { AlexaServiceForDispatcher } from '../dispatcher/action-dispatcher.js';

/**
 * IoT services bound to a session (user-specific or global)
 * Requirements: 6.1, 6.2, 4.5
 */
export interface SessionIoTServices {
  readonly lightService: LightService | undefined;
  readonly airconService: AirconService | undefined;
  readonly alexaService?: AlexaServiceForDispatcher | undefined;
}

/**
 * Session state interface (external/public)
 */
export interface SessionState {
  readonly sessionId: string;
  readonly uid: string | null;
  readonly status: 'active' | 'ended';
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly allowedDevices?: readonly AllowedDevice[];
  readonly hasIoTServices: boolean;
}

/**
 * Session error interface
 */
export interface SessionError {
  readonly code: 'NO_ACTIVE_SESSION' | 'SESSION_NOT_FOUND';
  readonly message: string;
}

