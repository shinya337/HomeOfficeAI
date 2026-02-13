/**
 * API Types Tests
 * TDD: RED phase - Write failing tests first
 *
 * Requirements: 5.4, 5.5 - JSON response format compliance
 */
import { describe, it, expect } from 'vitest';
import type {
  SessionResponse,
  SessionStatusResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  ErrorResponse,
} from './api-types';

describe('API Types', () => {
  describe('SessionResponse', () => {
    it('should have required fields: sessionId, status, startedAt', () => {
      const response: SessionResponse = {
        sessionId: 'test-session-id',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      };

      expect(response.sessionId).toBe('test-session-id');
      expect(response.status).toBe('active');
      expect(response.startedAt).toBe('2026-02-04T00:00:00.000Z');
    });

    it('should allow optional endedAt field', () => {
      const response: SessionResponse = {
        sessionId: 'test-session-id',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T01:00:00.000Z',
      };

      expect(response.endedAt).toBe('2026-02-04T01:00:00.000Z');
    });

    it('should only allow status values: active or ended', () => {
      const activeResponse: SessionResponse = {
        sessionId: 'test-id',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      };

      const endedResponse: SessionResponse = {
        sessionId: 'test-id',
        status: 'ended',
        startedAt: '2026-02-04T00:00:00.000Z',
        endedAt: '2026-02-04T01:00:00.000Z',
      };

      expect(['active', 'ended']).toContain(activeResponse.status);
      expect(['active', 'ended']).toContain(endedResponse.status);
    });
  });

  describe('SessionStatusResponse', () => {
    it('should have required field: hasActiveSession', () => {
      const response: SessionStatusResponse = {
        hasActiveSession: false,
        session: null,
      };

      expect(response.hasActiveSession).toBe(false);
    });

    it('should include session when active', () => {
      const session: SessionResponse = {
        sessionId: 'test-id',
        status: 'active',
        startedAt: '2026-02-04T00:00:00.000Z',
      };

      const response: SessionStatusResponse = {
        hasActiveSession: true,
        session,
      };

      expect(response.hasActiveSession).toBe(true);
      expect(response.session).toEqual(session);
    });

    it('should have session as null when no active session', () => {
      const response: SessionStatusResponse = {
        hasActiveSession: false,
        session: null,
      };

      expect(response.session).toBeNull();
    });
  });

  describe('AnalyzeRequest', () => {
    it('should have required image field with base64 and mimeType', () => {
      const request: AnalyzeRequest = {
        image: {
          base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          mimeType: 'image/png',
        },
      };

      expect(request.image.base64).toBeDefined();
      expect(request.image.mimeType).toBe('image/png');
    });

    it('should support image/jpeg mimeType', () => {
      const request: AnalyzeRequest = {
        image: {
          base64: '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k=',
          mimeType: 'image/jpeg',
        },
      };

      expect(request.image.mimeType).toBe('image/jpeg');
    });
  });

  describe('AnalyzeResponse', () => {
    it('should have required fields for successful analysis', () => {
      const response: AnalyzeResponse = {
        success: true,
        action: {
          tool: 'light_control',
          params: { power: 'on' },
        },
        result: {
          executed: true,
          message: 'Light turned on',
        },
        nextIntervalMs: 30000,
      };

      expect(response.success).toBe(true);
      expect(response.action.tool).toBe('light_control');
      expect(response.action.params).toEqual({ power: 'on' });
      expect(response.result.executed).toBe(true);
      expect(response.result.message).toBe('Light turned on');
      expect(response.nextIntervalMs).toBe(30000);
    });

    it('should allow optional deviceState field', () => {
      const response: AnalyzeResponse = {
        success: true,
        action: {
          tool: 'do_nothing',
          params: {},
        },
        result: {
          executed: true,
          message: 'No action taken',
        },
        nextIntervalMs: 30000,
        deviceState: {
          light: { power: 'on' },
          aircon: { temperature: '24', mode: 'cool' },
        },
      };

      expect(response.deviceState?.light?.power).toBe('on');
      expect(response.deviceState?.aircon?.temperature).toBe('24');
      expect(response.deviceState?.aircon?.mode).toBe('cool');
    });

    it('should allow null values in deviceState', () => {
      const response: AnalyzeResponse = {
        success: true,
        action: {
          tool: 'do_nothing',
          params: {},
        },
        result: {
          executed: true,
          message: 'No action taken',
        },
        nextIntervalMs: 30000,
        deviceState: {
          light: null,
          aircon: null,
        },
      };

      expect(response.deviceState?.light).toBeNull();
      expect(response.deviceState?.aircon).toBeNull();
    });

    it('should allow optional error field', () => {
      const response: AnalyzeResponse = {
        success: false,
        action: {
          tool: 'do_nothing',
          params: {},
        },
        result: {
          executed: false,
          message: 'Analysis failed',
        },
        nextIntervalMs: 30000,
        error: {
          code: 'AI_ERROR',
          message: 'Vertex AI API call failed',
        },
      };

      expect(response.error?.code).toBe('AI_ERROR');
      expect(response.error?.message).toBe('Vertex AI API call failed');
    });

    it('should support continue_monitoring action with 5 second interval', () => {
      const response: AnalyzeResponse = {
        success: true,
        action: {
          tool: 'continue_monitoring',
          params: {},
        },
        result: {
          executed: true,
          message: 'Continuing to monitor',
        },
        nextIntervalMs: 5000,
      };

      expect(response.action.tool).toBe('continue_monitoring');
      expect(response.nextIntervalMs).toBe(5000);
    });
  });

  describe('ErrorResponse', () => {
    it('should have required error field with code and message', () => {
      const response: ErrorResponse = {
        error: {
          code: 'NO_ACTIVE_SESSION',
          message: 'No active session found',
        },
      };

      expect(response.error.code).toBe('NO_ACTIVE_SESSION');
      expect(response.error.message).toBe('No active session found');
    });

    it('should support INVALID_REQUEST error code', () => {
      const response: ErrorResponse = {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required field: image',
        },
      };

      expect(response.error.code).toBe('INVALID_REQUEST');
    });

    it('should support AI_ERROR error code', () => {
      const response: ErrorResponse = {
        error: {
          code: 'AI_ERROR',
          message: 'Vertex AI API call failed',
        },
      };

      expect(response.error.code).toBe('AI_ERROR');
    });

    it('should support IOT_ERROR error code', () => {
      const response: ErrorResponse = {
        error: {
          code: 'IOT_ERROR',
          message: 'Nature Remo API call failed',
        },
      };

      expect(response.error.code).toBe('IOT_ERROR');
    });
  });
});
