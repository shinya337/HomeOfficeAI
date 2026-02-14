/**
 * SessionManager Service Tests
 *
 * TDD tests for session management functionality.
 *
 * Requirements: 1.2, 1.4, 1.6, 6.1, 6.2, 6.3
 * Contract: SessionManagerService
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createSessionManager,
  SessionManagerService,
  SessionState,
  SessionError,
} from './session-manager.js';
import type { AgentAction, SessionIoTServices } from '../types/session-types.js';
import type { LightService, AirconService } from '../dispatcher/action-dispatcher.js';

describe('SessionManager', () => {
  let sessionManager: SessionManagerService;

  beforeEach(() => {
    sessionManager = createSessionManager();
  });

  describe('startSession', () => {
    it('should create a new session with unique ID', () => {
      const session = sessionManager.startSession(null);

      expect(session.sessionId).toBeDefined();
      expect(session.sessionId.length).toBeGreaterThan(0);
    });

    it('should set session status to active', () => {
      const session = sessionManager.startSession(null);

      expect(session.status).toBe('active');
    });

    it('should record start time', () => {
      const before = new Date().toISOString();
      const session = sessionManager.startSession(null);
      const after = new Date().toISOString();

      expect(session.startedAt).toBeDefined();
      expect(session.startedAt >= before).toBe(true);
      expect(session.startedAt <= after).toBe(true);
    });

    it('should not have endedAt when starting', () => {
      const session = sessionManager.startSession(null);

      expect(session.endedAt).toBeUndefined();
    });

    it('should generate different session IDs on each call', () => {
      const session1 = sessionManager.startSession(null);
      sessionManager.endSession(session1.sessionId);
      const session2 = sessionManager.startSession(null);

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it('should set uid to null for guest sessions', () => {
      const session = sessionManager.startSession(null);

      expect(session.uid).toBeNull();
    });

    it('should set uid for authenticated user sessions', () => {
      const session = sessionManager.startSession('firebase-uid-123');

      expect(session.uid).toBe('firebase-uid-123');
    });

    it('should allow multiple concurrent sessions', () => {
      const session1 = sessionManager.startSession(null);
      const session2 = sessionManager.startSession('user-1');
      const session3 = sessionManager.startSession('user-2');

      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(session2.sessionId).not.toBe(session3.sessionId);

      // All three should be retrievable
      expect(sessionManager.getSession(session1.sessionId)).toBeDefined();
      expect(sessionManager.getSession(session2.sessionId)).toBeDefined();
      expect(sessionManager.getSession(session3.sessionId)).toBeDefined();
    });
  });

  describe('endSession', () => {
    it('should return error when session ID does not exist', () => {
      const result = sessionManager.endSession('non-existent-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should update session status to ended', () => {
      const started = sessionManager.startSession(null);
      const result = sessionManager.endSession(started.sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('ended');
      }
    });

    it('should record end time', () => {
      const started = sessionManager.startSession(null);
      const before = new Date().toISOString();
      const result = sessionManager.endSession(started.sessionId);
      const after = new Date().toISOString();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.endedAt).toBeDefined();
        expect(result.value.endedAt! >= before).toBe(true);
        expect(result.value.endedAt! <= after).toBe(true);
      }
    });

    it('should preserve session ID, uid and start time when ending', () => {
      const started = sessionManager.startSession('user-abc');
      const result = sessionManager.endSession(started.sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe(started.sessionId);
        expect(result.value.startedAt).toBe(started.startedAt);
        expect(result.value.uid).toBe('user-abc');
      }
    });

    it('should return error when trying to end an already ended session', () => {
      const started = sessionManager.startSession(null);
      sessionManager.endSession(started.sessionId);

      const result = sessionManager.endSession(started.sessionId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should not affect other active sessions', () => {
      const session1 = sessionManager.startSession(null);
      const session2 = sessionManager.startSession('user-1');

      sessionManager.endSession(session1.sessionId);

      // session2 should still be active
      const remaining = sessionManager.getSession(session2.sessionId);
      expect(remaining).toBeDefined();
      expect(remaining?.status).toBe('active');
    });
  });

  describe('getSession', () => {
    it('should return undefined when session does not exist', () => {
      const session = sessionManager.getSession('non-existent');

      expect(session).toBeUndefined();
    });

    it('should return session state for an active session', () => {
      const started = sessionManager.startSession('user-1');
      const session = sessionManager.getSession(started.sessionId);

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(started.sessionId);
      expect(session?.uid).toBe('user-1');
      expect(session?.status).toBe('active');
    });

    it('should return undefined for ended session (cleaned up)', () => {
      const started = sessionManager.startSession(null);
      sessionManager.endSession(started.sessionId);

      const session = sessionManager.getSession(started.sessionId);

      expect(session).toBeUndefined();
    });
  });

  describe('getActiveSessionByUid', () => {
    it('should return undefined when no session exists for the uid', () => {
      const session = sessionManager.getActiveSessionByUid('unknown-uid');

      expect(session).toBeUndefined();
    });

    it('should find active session by uid', () => {
      const started = sessionManager.startSession('user-123');

      const found = sessionManager.getActiveSessionByUid('user-123');

      expect(found).toBeDefined();
      expect(found?.sessionId).toBe(started.sessionId);
      expect(found?.uid).toBe('user-123');
    });

    it('should not find ended sessions', () => {
      const started = sessionManager.startSession('user-123');
      sessionManager.endSession(started.sessionId);

      const found = sessionManager.getActiveSessionByUid('user-123');

      expect(found).toBeUndefined();
    });

    it('should find the correct session among multiple users', () => {
      sessionManager.startSession('user-aaa');
      const target = sessionManager.startSession('user-bbb');
      sessionManager.startSession('user-ccc');

      const found = sessionManager.getActiveSessionByUid('user-bbb');

      expect(found).toBeDefined();
      expect(found?.sessionId).toBe(target.sessionId);
    });
  });

  describe('getStatus (backward compatibility)', () => {
    it('should return null when no session exists', () => {
      const status = sessionManager.getStatus();

      expect(status).toBeNull();
    });

    it('should return current session state when active', () => {
      const started = sessionManager.startSession(null);
      const status = sessionManager.getStatus();

      expect(status).not.toBeNull();
      expect(status?.sessionId).toBe(started.sessionId);
      expect(status?.status).toBe('active');
    });

    it('should return null after all sessions are ended', () => {
      const session = sessionManager.startSession(null);
      sessionManager.endSession(session.sessionId);
      const status = sessionManager.getStatus();

      expect(status).toBeNull();
    });

    it('should return any active session when multiple exist', () => {
      sessionManager.startSession(null);
      sessionManager.startSession('user-1');

      const status = sessionManager.getStatus();

      expect(status).not.toBeNull();
      expect(status?.status).toBe('active');
    });
  });

  describe('hasActiveSession', () => {
    it('should return false when no session exists', () => {
      expect(sessionManager.hasActiveSession()).toBe(false);
    });

    it('should return true when session is active', () => {
      sessionManager.startSession(null);

      expect(sessionManager.hasActiveSession()).toBe(true);
    });

    it('should return false after all sessions are ended', () => {
      const session = sessionManager.startSession(null);
      sessionManager.endSession(session.sessionId);

      expect(sessionManager.hasActiveSession()).toBe(false);
    });

    it('should return true when at least one session is active among multiple', () => {
      const s1 = sessionManager.startSession(null);
      sessionManager.startSession('user-1');

      sessionManager.endSession(s1.sessionId);

      expect(sessionManager.hasActiveSession()).toBe(true);
    });
  });

  describe('addRecentAction / getRecentActions', () => {
    it('should return empty array when no actions added', () => {
      sessionManager.startSession(null);
      const actions = sessionManager.getRecentActions();

      expect(actions).toEqual([]);
    });

    it('should store and retrieve single action', () => {
      sessionManager.startSession(null);
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
      sessionManager.startSession(null);
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
      sessionManager.startSession(null);

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
      sessionManager.startSession(null);

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
      const session = sessionManager.startSession(null);
      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };
      sessionManager.addRecentAction(action);

      sessionManager.endSession(session.sessionId);

      // Start new session and check actions are cleared
      sessionManager.startSession(null);
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

      sessionManager.startSession(null);
      const actions = sessionManager.getRecentActions();

      expect(actions).toEqual([]);
    });
  });

  describe('UUID format', () => {
    it('should generate session ID that looks like a UUID or CUID', () => {
      const session = sessionManager.startSession(null);

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

      const session = sessionManager.startSession(null, allowedDevices);

      expect(session.allowedDevices).toBeDefined();
      expect(session.allowedDevices).toHaveLength(2);
      expect(session.allowedDevices).toEqual(allowedDevices);
    });

    it('should not include allowedDevices when not provided (undefined)', () => {
      const session = sessionManager.startSession(null);

      expect(session.allowedDevices).toBeUndefined();
    });

    it('should store empty array when explicitly passed', () => {
      const session = sessionManager.startSession(null, []);

      expect(session.allowedDevices).toBeDefined();
      expect(session.allowedDevices).toEqual([]);
    });

    it('should preserve allowedDevices in getSession', () => {
      const allowedDevices = [{ id: 'device-1', type: 'LIGHT' as const }];
      const started = sessionManager.startSession(null, allowedDevices);

      const session = sessionManager.getSession(started.sessionId);

      expect(session?.allowedDevices).toEqual(allowedDevices);
    });
  });

  /**
   * Tests for TTL-based cleanup of abandoned sessions
   * Requirements: 6.1, 6.2, 6.3
   */
  describe('TTL-based cleanup', () => {
    it('should remove sessions that exceed TTL', () => {
      vi.useFakeTimers();

      const session = sessionManager.startSession(null);
      expect(sessionManager.getSession(session.sessionId)).toBeDefined();

      // Advance time beyond the TTL (default 2 hours)
      vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);

      // Trigger cleanup by starting a new session or explicitly calling cleanup
      sessionManager.cleanupExpiredSessions();

      expect(sessionManager.getSession(session.sessionId)).toBeUndefined();

      vi.useRealTimers();
    });

    it('should not remove sessions within TTL', () => {
      vi.useFakeTimers();

      const session = sessionManager.startSession('user-1');

      // Advance time but stay within TTL
      vi.advanceTimersByTime(1 * 60 * 60 * 1000); // 1 hour

      sessionManager.cleanupExpiredSessions();

      expect(sessionManager.getSession(session.sessionId)).toBeDefined();

      vi.useRealTimers();
    });

    it('should only remove expired sessions and keep active ones', () => {
      vi.useFakeTimers();

      const oldSession = sessionManager.startSession(null);

      // Advance 1.5 hours
      vi.advanceTimersByTime(1.5 * 60 * 60 * 1000);

      const newSession = sessionManager.startSession('user-2');

      // Advance past old session TTL but new session is still within TTL
      vi.advanceTimersByTime(0.6 * 60 * 60 * 1000); // total 2.1h for old, 0.6h for new

      sessionManager.cleanupExpiredSessions();

      expect(sessionManager.getSession(oldSession.sessionId)).toBeUndefined();
      expect(sessionManager.getSession(newSession.sessionId)).toBeDefined();

      vi.useRealTimers();
    });
  });

  /**
   * Multi-session integration tests
   * Requirements: 6.1, 6.2, 6.3
   */
  describe('multi-session scenarios', () => {
    it('should support guest and authenticated sessions simultaneously', () => {
      const guest = sessionManager.startSession(null);
      const auth = sessionManager.startSession('user-123');

      expect(guest.uid).toBeNull();
      expect(auth.uid).toBe('user-123');

      // Both should be retrievable
      expect(sessionManager.getSession(guest.sessionId)?.uid).toBeNull();
      expect(sessionManager.getSession(auth.sessionId)?.uid).toBe('user-123');
    });

    it('should track session count correctly', () => {
      const s1 = sessionManager.startSession(null);
      sessionManager.startSession('user-1');
      sessionManager.startSession('user-2');

      expect(sessionManager.hasActiveSession()).toBe(true);

      sessionManager.endSession(s1.sessionId);

      // Still has 2 active
      expect(sessionManager.hasActiveSession()).toBe(true);
    });

    it('should end only the specified session', () => {
      const s1 = sessionManager.startSession(null);
      const s2 = sessionManager.startSession('user-1');
      const s3 = sessionManager.startSession('user-2');

      const result = sessionManager.endSession(s2.sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe(s2.sessionId);
        expect(result.value.status).toBe('ended');
      }

      expect(sessionManager.getSession(s1.sessionId)?.status).toBe('active');
      expect(sessionManager.getSession(s2.sessionId)).toBeUndefined();
      expect(sessionManager.getSession(s3.sessionId)?.status).toBe('active');
    });
  });

  /**
   * Tests for IoT services binding to sessions
   * Requirements: 6.1, 6.2 (session-level IoT service management)
   * Task: 5.2
   */
  describe('startSession with iotServices', () => {
    /**
     * Create mock IoT services for testing
     */
    function createMockIoTServices(): SessionIoTServices {
      const mockLightService: LightService = {
        control: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', power: 'on' } }),
        sendNamedSignal: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', signalName: 'test', success: true } }),
      };
      const mockAirconService: AirconService = {
        setTemperature: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1', temperature: 24 } }),
        powerOff: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1' } }),
      };
      return {
        lightService: mockLightService,
        airconService: mockAirconService,
      };
    }

    it('should store iotServices when provided', () => {
      const iotServices = createMockIoTServices();

      const session = sessionManager.startSession('user-1', undefined, iotServices);

      expect(session.hasIoTServices).toBe(true);
    });

    it('should not have iotServices when not provided', () => {
      const session = sessionManager.startSession(null);

      expect(session.hasIoTServices).toBe(false);
    });

    it('should not have iotServices when explicitly passed undefined', () => {
      const session = sessionManager.startSession('user-1', undefined, undefined);

      expect(session.hasIoTServices).toBe(false);
    });

    it('should preserve iotServices presence in getSession', () => {
      const iotServices = createMockIoTServices();
      const started = sessionManager.startSession('user-1', undefined, iotServices);

      const session = sessionManager.getSession(started.sessionId);

      expect(session?.hasIoTServices).toBe(true);
    });

    it('should support both allowedDevices and iotServices together', () => {
      const allowedDevices = [{ id: 'device-1', type: 'LIGHT' as const }];
      const iotServices = createMockIoTServices();

      const session = sessionManager.startSession('user-1', allowedDevices, iotServices);

      expect(session.allowedDevices).toEqual(allowedDevices);
      expect(session.hasIoTServices).toBe(true);
    });

    it('should support lightService only (airconService undefined)', () => {
      const mockLightService: LightService = {
        control: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', power: 'on' } }),
        sendNamedSignal: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', signalName: 'test', success: true } }),
      };
      const iotServices: SessionIoTServices = {
        lightService: mockLightService,
        airconService: undefined,
      };

      const session = sessionManager.startSession('user-1', undefined, iotServices);

      expect(session.hasIoTServices).toBe(true);
    });

    it('should support airconService only (lightService undefined)', () => {
      const mockAirconService: AirconService = {
        setTemperature: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1', temperature: 24 } }),
        powerOff: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1' } }),
      };
      const iotServices: SessionIoTServices = {
        lightService: undefined,
        airconService: mockAirconService,
      };

      const session = sessionManager.startSession('user-1', undefined, iotServices);

      expect(session.hasIoTServices).toBe(true);
    });
  });

  /**
   * Tests for IoT services cleanup on session end
   * Requirements: 6.1, 6.2 (cleanup on session end)
   * Task: 5.2
   */
  describe('endSession with iotServices cleanup', () => {
    function createMockIoTServices(): SessionIoTServices {
      return {
        lightService: {
          control: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', power: 'on' } }),
          sendNamedSignal: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', signalName: 'test', success: true } }),
        },
        airconService: {
          setTemperature: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1', temperature: 24 } }),
          powerOff: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1' } }),
        },
      };
    }

    it('should report no iotServices after session ends', () => {
      const iotServices = createMockIoTServices();
      const started = sessionManager.startSession('user-1', undefined, iotServices);

      const result = sessionManager.endSession(started.sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hasIoTServices).toBe(false);
      }
    });

    it('should not affect iotServices of other sessions when one ends', () => {
      const iotServices1 = createMockIoTServices();
      const iotServices2 = createMockIoTServices();

      const s1 = sessionManager.startSession('user-1', undefined, iotServices1);
      const s2 = sessionManager.startSession('user-2', undefined, iotServices2);

      sessionManager.endSession(s1.sessionId);

      // s2 should still have iotServices
      const remaining = sessionManager.getSession(s2.sessionId);
      expect(remaining?.hasIoTServices).toBe(true);
    });

    it('should clean up iotServices reference from ended session', () => {
      const iotServices = createMockIoTServices();
      const started = sessionManager.startSession('user-1', undefined, iotServices);

      sessionManager.endSession(started.sessionId);

      // Session is removed from the map, so getSession returns undefined
      const session = sessionManager.getSession(started.sessionId);
      expect(session).toBeUndefined();
    });
  });

  /**
   * Tests for getSessionIoTServices accessor
   * Requirements: 6.1, 6.2 (retrieve IoT services from session)
   * Task: 5.2
   */
  describe('getSessionIoTServices', () => {
    function createMockIoTServices(): SessionIoTServices {
      return {
        lightService: {
          control: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', power: 'on' } }),
          sendNamedSignal: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-1', signalName: 'test', success: true } }),
        },
        airconService: {
          setTemperature: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1', temperature: 24 } }),
          powerOff: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-1' } }),
        },
      };
    }

    it('should return iotServices for a session that has them', () => {
      const iotServices = createMockIoTServices();
      const started = sessionManager.startSession('user-1', undefined, iotServices);

      const retrieved = sessionManager.getSessionIoTServices(started.sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.lightService).toBeDefined();
      expect(retrieved?.airconService).toBeDefined();
    });

    it('should return undefined for a session without iotServices', () => {
      const started = sessionManager.startSession(null);

      const retrieved = sessionManager.getSessionIoTServices(started.sessionId);

      expect(retrieved).toBeUndefined();
    });

    it('should return undefined for a non-existent session', () => {
      const retrieved = sessionManager.getSessionIoTServices('non-existent');

      expect(retrieved).toBeUndefined();
    });

    it('should return undefined after session is ended (cleaned up)', () => {
      const iotServices = createMockIoTServices();
      const started = sessionManager.startSession('user-1', undefined, iotServices);
      sessionManager.endSession(started.sessionId);

      const retrieved = sessionManager.getSessionIoTServices(started.sessionId);

      expect(retrieved).toBeUndefined();
    });
  });
});
