/**
 * SessionManager Service Tests
 *
 * TDD tests for session management functionality.
 *
 * Requirements: 1.2, 1.4, 1.6, 6.1, 6.3
 * Contract: SessionManagerService
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSessionManager,
  SessionManagerService,
  SessionState,
  SessionError,
} from './session-manager.js';
import type { AgentAction } from '../types/session-types.js';

describe('SessionManager', () => {
  let sessionManager: SessionManagerService;

  beforeEach(() => {
    sessionManager = createSessionManager();
  });

  describe('startSession', () => {
    it('should create a new session with unique ID', () => {
      const session = sessionManager.startSession();

      expect(session.sessionId).toBeDefined();
      expect(session.sessionId.length).toBeGreaterThan(0);
    });

    it('should set session status to active', () => {
      const session = sessionManager.startSession();

      expect(session.status).toBe('active');
    });

    it('should record start time', () => {
      const before = new Date().toISOString();
      const session = sessionManager.startSession();
      const after = new Date().toISOString();

      expect(session.startedAt).toBeDefined();
      expect(session.startedAt >= before).toBe(true);
      expect(session.startedAt <= after).toBe(true);
    });

    it('should not have endedAt when starting', () => {
      const session = sessionManager.startSession();

      expect(session.endedAt).toBeUndefined();
    });

    it('should generate different session IDs on each call', () => {
      const session1 = sessionManager.startSession();
      sessionManager.endSession(); // End first session
      const session2 = sessionManager.startSession();

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it('should replace existing active session when starting new one', () => {
      const session1 = sessionManager.startSession();
      const session2 = sessionManager.startSession();

      expect(session2.sessionId).not.toBe(session1.sessionId);
      expect(sessionManager.getStatus()?.sessionId).toBe(session2.sessionId);
    });
  });

  describe('endSession', () => {
    it('should return error when no active session exists', () => {
      const result = sessionManager.endSession();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NO_ACTIVE_SESSION');
      }
    });

    it('should update session status to ended', () => {
      sessionManager.startSession();
      const result = sessionManager.endSession();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('ended');
      }
    });

    it('should record end time', () => {
      sessionManager.startSession();
      const before = new Date().toISOString();
      const result = sessionManager.endSession();
      const after = new Date().toISOString();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.endedAt).toBeDefined();
        expect(result.value.endedAt! >= before).toBe(true);
        expect(result.value.endedAt! <= after).toBe(true);
      }
    });

    it('should preserve session ID and start time when ending', () => {
      const started = sessionManager.startSession();
      const result = sessionManager.endSession();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe(started.sessionId);
        expect(result.value.startedAt).toBe(started.startedAt);
      }
    });

    it('should return error when trying to end an already ended session', () => {
      sessionManager.startSession();
      sessionManager.endSession();

      const result = sessionManager.endSession();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NO_ACTIVE_SESSION');
      }
    });
  });

  describe('getStatus', () => {
    it('should return null when no session exists', () => {
      const status = sessionManager.getStatus();

      expect(status).toBeNull();
    });

    it('should return current session state when active', () => {
      const started = sessionManager.startSession();
      const status = sessionManager.getStatus();

      expect(status).not.toBeNull();
      expect(status?.sessionId).toBe(started.sessionId);
      expect(status?.status).toBe('active');
    });

    it('should return null after session is ended', () => {
      sessionManager.startSession();
      sessionManager.endSession();
      const status = sessionManager.getStatus();

      expect(status).toBeNull();
    });
  });

  describe('hasActiveSession', () => {
    it('should return false when no session exists', () => {
      expect(sessionManager.hasActiveSession()).toBe(false);
    });

    it('should return true when session is active', () => {
      sessionManager.startSession();

      expect(sessionManager.hasActiveSession()).toBe(true);
    });

    it('should return false after session is ended', () => {
      sessionManager.startSession();
      sessionManager.endSession();

      expect(sessionManager.hasActiveSession()).toBe(false);
    });
  });

  describe('addRecentAction / getRecentActions', () => {
    it('should return empty array when no actions added', () => {
      sessionManager.startSession();
      const actions = sessionManager.getRecentActions();

      expect(actions).toEqual([]);
    });

    it('should store and retrieve single action', () => {
      sessionManager.startSession();
      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      sessionManager.addRecentAction(action);
      const actions = sessionManager.getRecentActions();

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual(action);
    });

    it('should maintain order of actions (newest last)', () => {
      sessionManager.startSession();
      const action1: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };
      const action2: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 24 },
      };

      sessionManager.addRecentAction(action1);
      sessionManager.addRecentAction(action2);
      const actions = sessionManager.getRecentActions();

      expect(actions).toHaveLength(2);
      expect(actions[0]).toEqual(action1);
      expect(actions[1]).toEqual(action2);
    });

    it('should limit to maximum 10 actions', () => {
      sessionManager.startSession();

      // Add 15 actions
      for (let i = 0; i < 15; i++) {
        const action: AgentAction = {
          tool: 'do_nothing',
          params: {},
        };
        sessionManager.addRecentAction(action);
      }

      const actions = sessionManager.getRecentActions();

      expect(actions).toHaveLength(10);
    });

    it('should keep most recent 10 actions when exceeding limit', () => {
      sessionManager.startSession();

      // Add 12 actions with different temperatures to track order
      for (let i = 0; i < 12; i++) {
        const action: AgentAction = {
          tool: 'aircon_control',
          params: { temperature: i },
        };
        sessionManager.addRecentAction(action);
      }

      const actions = sessionManager.getRecentActions();

      // Should have actions with temperatures 2-11 (dropped 0 and 1)
      expect(actions).toHaveLength(10);
      expect((actions[0].params as { temperature: number }).temperature).toBe(2);
      expect((actions[9].params as { temperature: number }).temperature).toBe(11);
    });

    it('should clear actions when session ends', () => {
      sessionManager.startSession();
      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };
      sessionManager.addRecentAction(action);

      sessionManager.endSession();

      // Start new session and check actions are cleared
      sessionManager.startSession();
      const actions = sessionManager.getRecentActions();

      expect(actions).toEqual([]);
    });

    it('should not add action when no active session', () => {
      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      // No session started, adding action should be ignored
      sessionManager.addRecentAction(action);

      sessionManager.startSession();
      const actions = sessionManager.getRecentActions();

      expect(actions).toEqual([]);
    });
  });

  describe('UUID format', () => {
    it('should generate session ID that looks like a UUID or CUID', () => {
      const session = sessionManager.startSession();

      // Session ID should be a non-empty string
      expect(typeof session.sessionId).toBe('string');
      expect(session.sessionId.length).toBeGreaterThanOrEqual(20);
    });
  });

  /**
   * Tests for allowedDevices feature
   * Requirements: 3.2 (store allowed devices in session state)
   */
  describe('startSession with allowedDevices', () => {
    it('should store allowedDevices when provided', () => {
      const allowedDevices = [
        { id: 'device-1', type: 'LIGHT' as const },
        { id: 'device-2', type: 'AC' as const },
      ];

      const session = sessionManager.startSession(allowedDevices);

      expect(session.allowedDevices).toBeDefined();
      expect(session.allowedDevices).toHaveLength(2);
      expect(session.allowedDevices).toEqual(allowedDevices);
    });

    it('should not include allowedDevices when not provided (undefined)', () => {
      const session = sessionManager.startSession();

      expect(session.allowedDevices).toBeUndefined();
    });

    it('should store empty array when explicitly passed', () => {
      const session = sessionManager.startSession([]);

      expect(session.allowedDevices).toBeDefined();
      expect(session.allowedDevices).toEqual([]);
    });

    it('should preserve allowedDevices in getStatus', () => {
      const allowedDevices = [{ id: 'device-1', type: 'LIGHT' as const }];
      sessionManager.startSession(allowedDevices);

      const status = sessionManager.getStatus();

      expect(status?.allowedDevices).toEqual(allowedDevices);
    });

    it('should clear allowedDevices when new session starts', () => {
      sessionManager.startSession([{ id: 'device-1', type: 'LIGHT' as const }]);
      const session2 = sessionManager.startSession();

      expect(session2.allowedDevices).toBeUndefined();
    });
  });
});
