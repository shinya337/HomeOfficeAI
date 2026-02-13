/**
 * App Mode Display Integration Tests
 *
 * Tests for integrating mode-display module into the main app.
 * Verifies that analysis results update the mode display and
 * session end resets the display.
 *
 * Requirement: 5.3 (real-time update of analysis results)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractModeFromResult,
  extractUserStateFromResult,
  extractReasonFromResult,
  MODE_TOOL_NAMES,
} from './app-mode-integration.js';

describe('App Mode Display Integration', () => {
  describe('MODE_TOOL_NAMES', () => {
    it('should include focus_mode', () => {
      expect(MODE_TOOL_NAMES).toContain('focus_mode');
    });

    it('should include break_mode', () => {
      expect(MODE_TOOL_NAMES).toContain('break_mode');
    });

    it('should include away_mode', () => {
      expect(MODE_TOOL_NAMES).toContain('away_mode');
    });

    it('should include wake_mode', () => {
      expect(MODE_TOOL_NAMES).toContain('wake_mode');
    });
  });

  describe('extractModeFromResult', () => {
    it('should return focus when action tool is focus_mode', () => {
      const result = {
        action: { tool: 'focus_mode', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractModeFromResult(result)).toBe('focus');
    });

    it('should return break when action tool is break_mode', () => {
      const result = {
        action: { tool: 'break_mode', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractModeFromResult(result)).toBe('break');
    });

    it('should return away when action tool is away_mode', () => {
      const result = {
        action: { tool: 'away_mode', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractModeFromResult(result)).toBe('away');
    });

    it('should return nap when action tool is wake_mode (initial phase is nap)', () => {
      const result = {
        action: { tool: 'wake_mode', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractModeFromResult(result)).toBe('nap');
    });

    it('should return null when action tool is not a mode action', () => {
      const result = {
        action: { tool: 'continue_monitoring', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractModeFromResult(result)).toBeNull();
    });

    it('should return null when action tool is do_nothing', () => {
      const result = {
        action: { tool: 'do_nothing', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractModeFromResult(result)).toBeNull();
    });

    it('should return null when action tool is light_control', () => {
      const result = {
        action: { tool: 'light_control', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractModeFromResult(result)).toBeNull();
    });

    it('should detect mode from actions array when primary action is not a mode', () => {
      const result = {
        action: { tool: 'light_control', params: {} },
        actions: [
          { tool: 'light_control', params: {} },
          { tool: 'focus_mode', params: { reason: 'Focused' } },
        ],
        result: { executed: true, message: '' },
        results: [],
      };
      expect(extractModeFromResult(result)).toBe('focus');
    });

    it('should return null when actions array has no mode actions', () => {
      const result = {
        action: { tool: 'light_control', params: {} },
        actions: [
          { tool: 'light_control', params: {} },
          { tool: 'continue_monitoring', params: {} },
        ],
        result: { executed: true, message: '' },
        results: [],
      };
      expect(extractModeFromResult(result)).toBeNull();
    });

    it('should handle missing actions array', () => {
      const result = {
        action: { tool: 'do_nothing', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractModeFromResult(result)).toBeNull();
    });
  });

  describe('extractUserStateFromResult', () => {
    it('should return user state text for focus mode', () => {
      expect(extractUserStateFromResult('focus')).toBe('作業中');
    });

    it('should return user state text for break mode', () => {
      expect(extractUserStateFromResult('break')).toBe('休憩中');
    });

    it('should return user state text for away mode', () => {
      expect(extractUserStateFromResult('away')).toBe('離席');
    });

    it('should return user state text for wake mode', () => {
      expect(extractUserStateFromResult('wake')).toBe('作業中');
    });

    it('should return empty string for null mode', () => {
      expect(extractUserStateFromResult(null)).toBe('');
    });
  });

  describe('extractReasonFromResult', () => {
    it('should extract reason from primary action params', () => {
      const result = {
        action: { tool: 'focus_mode', params: { reason: 'User is working' } },
        result: { executed: true, message: '' },
      };
      expect(extractReasonFromResult(result)).toBe('User is working');
    });

    it('should return empty string when reason is not present', () => {
      const result = {
        action: { tool: 'focus_mode', params: {} },
        result: { executed: true, message: '' },
      };
      expect(extractReasonFromResult(result)).toBe('');
    });

    it('should extract reason from mode action in actions array', () => {
      const result = {
        action: { tool: 'light_control', params: {} },
        actions: [
          { tool: 'light_control', params: {} },
          { tool: 'break_mode', params: { reason: 'Time for a break' } },
        ],
        result: { executed: true, message: '' },
        results: [],
      };
      expect(extractReasonFromResult(result)).toBe('Time for a break');
    });

    it('should return empty string when no mode action has reason', () => {
      const result = {
        action: { tool: 'light_control', params: {} },
        actions: [
          { tool: 'light_control', params: {} },
        ],
        result: { executed: true, message: '' },
        results: [],
      };
      expect(extractReasonFromResult(result)).toBe('');
    });

    it('should handle result without actions array', () => {
      const result = {
        action: { tool: 'do_nothing', params: { reason: 'All is well' } },
        result: { executed: true, message: '' },
      };
      expect(extractReasonFromResult(result)).toBe('All is well');
    });
  });
});
