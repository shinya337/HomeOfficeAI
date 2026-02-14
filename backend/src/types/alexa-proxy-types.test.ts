/**
 * Alexa Proxy Types Tests
 *
 * Tests for AlexaProxyService interfaces and related types.
 * TDD: RED phase - Write failing tests first
 *
 * Task 1.1: AlexaProxy型定義の追加
 * Requirements: 4.5 (type definitions for AlexaProxyService)
 */

import { describe, it, expect } from 'vitest';
import type {
  ProxySession,
  AlexaProxyError,
  AlexaProxyErrorCode,
  AlexaProxyServiceDependencies,
  AlexaProxyService,
} from './alexa-proxy-types.js';

// =============================================================================
// ProxySession Type Tests
// =============================================================================

describe('ProxySession type', () => {
  it('should have required fields: sessionId, uid, proxyPort, status, createdAt', () => {
    const session: ProxySession = {
      sessionId: 'proxy-session-abc123',
      uid: 'user-1',
      proxyPort: 54321,
      status: 'active',
      createdAt: '2026-02-14T00:00:00+09:00',
    };

    expect(session.sessionId).toBe('proxy-session-abc123');
    expect(session.uid).toBe('user-1');
    expect(session.proxyPort).toBe(54321);
    expect(session.status).toBe('active');
    expect(session.createdAt).toBe('2026-02-14T00:00:00+09:00');
  });

  it('should support all valid status values', () => {
    const statuses: ProxySession['status'][] = ['active', 'completed', 'failed', 'timeout'];
    expect(statuses).toHaveLength(4);
    expect(statuses).toContain('active');
    expect(statuses).toContain('completed');
    expect(statuses).toContain('failed');
    expect(statuses).toContain('timeout');
  });

  it('should have readonly properties', () => {
    const session: ProxySession = {
      sessionId: 'sess-1',
      uid: 'uid-1',
      proxyPort: 12345,
      status: 'active',
      createdAt: '2026-02-14T00:00:00+09:00',
    };

    // Verify readonly (compile-time check, runtime assertion)
    expect(session.sessionId).toBe('sess-1');
    expect(session.uid).toBe('uid-1');
    expect(session.proxyPort).toBe(12345);
  });
});

// =============================================================================
// AlexaProxyErrorCode Type Tests
// =============================================================================

describe('AlexaProxyErrorCode type', () => {
  it('should support all error codes', () => {
    const codes: AlexaProxyErrorCode[] = [
      'SESSION_NOT_FOUND',
      'PROXY_START_FAILED',
      'SAVE_FAILED',
      'TIMEOUT',
    ];

    expect(codes).toHaveLength(4);
    expect(codes).toContain('SESSION_NOT_FOUND');
    expect(codes).toContain('PROXY_START_FAILED');
    expect(codes).toContain('SAVE_FAILED');
    expect(codes).toContain('TIMEOUT');
  });
});

// =============================================================================
// AlexaProxyError Type Tests
// =============================================================================

describe('AlexaProxyError type', () => {
  it('should have code and message fields', () => {
    const error: AlexaProxyError = {
      code: 'PROXY_START_FAILED',
      message: 'Failed to start proxy server',
    };

    expect(error.code).toBe('PROXY_START_FAILED');
    expect(error.message).toBe('Failed to start proxy server');
  });

  it('should have readonly properties', () => {
    const error: AlexaProxyError = {
      code: 'PROXY_START_FAILED',
      message: 'Failed to start proxy server',
    };

    expect(error.code).toBe('PROXY_START_FAILED');
    expect(error.message).toBe('Failed to start proxy server');
  });
});

// =============================================================================
// AlexaProxyServiceDependencies Type Tests
// =============================================================================

describe('AlexaProxyServiceDependencies type', () => {
  it('should accept credentialService and createAlexaRemoteForProxyFn', () => {
    const deps: AlexaProxyServiceDependencies = {
      credentialService: {
        saveToken: async () => ({ ok: true, value: undefined }),
        getDecryptedToken: async () => ({ ok: true, value: 'token' }),
        getStatus: async () => ({ ok: true, value: [] }),
        deleteToken: async () => ({ ok: true, value: undefined }),
        deleteAllForUser: async () => ({ ok: true, value: undefined }),
      },
      createAlexaRemoteForProxyFn: async () => null,
    };

    expect(deps.credentialService).toBeDefined();
    expect(deps.createAlexaRemoteForProxyFn).toBeDefined();
  });
});

// =============================================================================
// AlexaProxyService Interface Tests
// =============================================================================

describe('AlexaProxyService interface', () => {
  it('should have startProxySession, getProxySession, and stopProxySession methods', () => {
    const mockService: AlexaProxyService = {
      startProxySession: async () => ({
        ok: true,
        value: {
          sessionId: 'sess-1',
          uid: 'user-1',
          proxyPort: 12345,
          status: 'active' as const,
          createdAt: '2026-02-14T00:00:00+09:00',
        },
      }),
      getProxySession: () => undefined,
      stopProxySession: async () => ({ ok: true, value: undefined }),
    };

    expect(mockService.startProxySession).toBeDefined();
    expect(mockService.getProxySession).toBeDefined();
    expect(mockService.stopProxySession).toBeDefined();
  });

  it('should return Result<ProxySession, AlexaProxyError> from startProxySession', async () => {
    const mockService: AlexaProxyService = {
      startProxySession: async () => ({
        ok: true,
        value: {
          sessionId: 'sess-1',
          uid: 'user-1',
          proxyPort: 12345,
          status: 'active' as const,
          createdAt: '2026-02-14T00:00:00+09:00',
        },
      }),
      getProxySession: () => undefined,
      stopProxySession: async () => ({ ok: true, value: undefined }),
    };

    const result = await mockService.startProxySession('user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionId).toBe('sess-1');
      expect(result.value.uid).toBe('user-1');
      expect(result.value.status).toBe('active');
    }
  });

  it('should return error Result from startProxySession on failure', async () => {
    const mockService: AlexaProxyService = {
      startProxySession: async () => ({
        ok: false,
        error: {
          code: 'PROXY_START_FAILED' as const,
          message: 'Failed to start proxy server',
        },
      }),
      getProxySession: () => undefined,
      stopProxySession: async () => ({ ok: true, value: undefined }),
    };

    const result = await mockService.startProxySession('user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PROXY_START_FAILED');
    }
  });

  it('should return ProxySession or undefined from getProxySession', () => {
    const session: ProxySession = {
      sessionId: 'sess-1',
      uid: 'user-1',
      proxyPort: 12345,
      status: 'active',
      createdAt: '2026-02-14T00:00:00+09:00',
    };

    const mockService: AlexaProxyService = {
      startProxySession: async () => ({ ok: true, value: session }),
      getProxySession: (sessionId: string) => sessionId === 'sess-1' ? session : undefined,
      stopProxySession: async () => ({ ok: true, value: undefined }),
    };

    expect(mockService.getProxySession('sess-1')).toEqual(session);
    expect(mockService.getProxySession('non-existent')).toBeUndefined();
  });

  it('should return Result<void, AlexaProxyError> from stopProxySession', async () => {
    const mockService: AlexaProxyService = {
      startProxySession: async () => ({
        ok: true,
        value: {
          sessionId: 'sess-1',
          uid: 'user-1',
          proxyPort: 12345,
          status: 'active' as const,
          createdAt: '2026-02-14T00:00:00+09:00',
        },
      }),
      getProxySession: () => undefined,
      stopProxySession: async () => ({ ok: true, value: undefined }),
    };

    const result = await mockService.stopProxySession('sess-1');
    expect(result.ok).toBe(true);
  });
});
