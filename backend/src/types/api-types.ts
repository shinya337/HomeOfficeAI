/**
 * API Types for HomeOffice.ai REST API
 *
 * These type definitions ensure consistent request/response formats
 * between frontend and backend.
 *
 * Requirements: 5.4 (JSON response format), 5.5 (error response format), 3.4 (allowedDevices in response)
 */

import type { AllowedDevice } from './device-types.js';

/**
 * Session response for POST /api/session/start and POST /api/session/end
 * Also used in GET /api/session/status response
 *
 * Requirements: 3.4 (allowedDevices for page reload state restoration)
 */
export interface SessionResponse {
  readonly sessionId: string;
  readonly status: 'active' | 'ended';
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly allowedDevices?: readonly AllowedDevice[];
}

/**
 * Session status response for GET /api/session/status
 */
export interface SessionStatusResponse {
  readonly hasActiveSession: boolean;
  readonly session: SessionResponse | null;
}

/**
 * Image data structure for analyze requests
 */
export interface ImageData {
  readonly base64: string;
  readonly mimeType: string;
}

/**
 * Analyze request for POST /api/analyze
 */
export interface AnalyzeRequest {
  readonly image: ImageData;
}

/**
 * Action information returned from AI analysis
 */
export interface ActionInfo {
  readonly tool: string;
  readonly params: Record<string, unknown>;
}

/**
 * Result of action execution
 */
export interface ActionResult {
  readonly executed: boolean;
  readonly message: string;
  readonly speechTexts?: readonly string[];
}

/**
 * Light device state
 */
export interface LightState {
  readonly power: string;
}

/**
 * Aircon device state
 */
export interface AirconState {
  readonly temperature: string;
  readonly mode: string;
}

/**
 * Combined device state
 */
export interface DeviceState {
  readonly light: LightState | null;
  readonly aircon: AirconState | null;
}

/**
 * Error information structure
 */
export interface ErrorInfo {
  readonly code: string;
  readonly message: string;
}

/**
 * Analyze response for POST /api/analyze
 *
 * 並列Function Calling対応:
 * - actions[]: 全アクション配列
 * - results[]: 全実行結果配列
 * - action/result: 後方互換のため先頭アクション/結果を保持
 */
export interface AnalyzeResponse {
  readonly success: boolean;
  readonly action: ActionInfo;
  readonly result: ActionResult;
  readonly actions: ActionInfo[];
  readonly results: ActionResult[];
  readonly nextIntervalMs: number;
  readonly deviceState?: DeviceState;
  readonly error?: ErrorInfo;
}

/**
 * Error response format (shared across all endpoints)
 */
export interface ErrorResponse {
  readonly error: ErrorInfo;
}

/**
 * Error codes used in the API
 */
export const ErrorCodes = {
  NO_ACTIVE_SESSION: 'NO_ACTIVE_SESSION',
  INVALID_REQUEST: 'INVALID_REQUEST',
  AI_ERROR: 'AI_ERROR',
  IOT_ERROR: 'IOT_ERROR',
} as const;

/**
 * Tool names for AI actions
 */
export const ToolNames = {
  LIGHT_CONTROL: 'light_control',
  AIRCON_CONTROL: 'aircon_control',
  CONTINUE_MONITORING: 'continue_monitoring',
  DO_NOTHING: 'do_nothing',
} as const;

/**
 * Default intervals in milliseconds
 */
export const Intervals = {
  DEFAULT: 30000, // 30 seconds
  CONTINUE_MONITORING: 5000, // 5 seconds
} as const;
