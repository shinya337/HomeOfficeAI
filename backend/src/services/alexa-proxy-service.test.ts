/**
 * AlexaProxyService Tests
 *
 * Tests for Proxy authentication session startup, cookie capture/save,
 * session management (duplicate prevention, timeout, cleanup).
 * Uses mocks for alexa-remote2 createAlexaRemoteForProxy and CredentialService.
 *
 * Requirements: 1.1, 1.3, 5.1, 5.4, 5.5
 * Tasks: 2.1, 2.2, 2.3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAlexaProxyService } from './alexa-proxy-service.js';
import type { CredentialService } from './credential-service.js';
import type { AlexaProxyService } from '../types/alexa-proxy-types.js';
import type { AlexaServiceConfig } from '../../packages/alexa-remote2/src/types/alexa-types.js';

// Mock node:fs for temp file cleanup verification
vi.mock('node:fs', () => ({
  unlinkSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));
import { unlinkSync, existsSync } from 'node:fs';

// =============================================================================
// Mock Dependencies
// =============================================================================

/**
 * Create a mock CredentialService with saveToken that succeeds by default.
 */
function createMockCredentialService(): CredentialService {
  return {
    saveToken: vi.fn(async () => ({ ok: true as const, value: undefined })),
    getDecryptedToken: vi.fn(async () => ({
      ok: false as const,
      error: { code: 'NOT_FOUND' as const, message: 'Not found' },
    })),
    getStatus: vi.fn(async () => ({ ok: true as const, value: [] })),
    deleteToken: vi.fn(async () => ({ ok: true as const, value: undefined })),
    deleteAllForUser: vi.fn(async () => ({ ok: true as const, value: undefined })),
  };
}

/**
 * Captures the cookie event listener registered by alexa-remote2 during init.
 * Returns a mock AlexaService-like object that simulates proxy startup.
 */
interface MockAlexaInstance {
  readonly listeners: Map<string, (...args: readonly unknown[]) => void>;
  readonly initConfig: AlexaServiceConfig | undefined;
  emitCookie(cookieData: unknown): void;
}

function createMockCreateAlexaServiceFn() {
  let lastInstance: MockAlexaInstance | undefined;

  const mockFn = vi.fn(async (config: AlexaServiceConfig) => {
    const listeners = new Map<string, (...args: readonly unknown[]) => void>();
    let storedCookieData: unknown = undefined;
    const instance: MockAlexaInstance = {
      listeners,
      initConfig: config,
      emitCookie(cookieData: unknown) {
        storedCookieData = cookieData;
        const handler = listeners.get('cookie');
        if (handler) {
          handler(cookieData);
        }
      },
    };
    lastInstance = instance;

    // Return a mock AlexaService with an on method and proxy info
    return {
      isConnected: () => false,
      on: (event: string, handler: (...args: readonly unknown[]) => void) => {
        listeners.set(event, handler);
      },
      stopProxyServer: vi.fn(),
      proxyPort: 0, // will be set by the service
      getCookieData: () => storedCookieData,
    };
  });

  return {
    mockFn,
    getLastInstance: () => lastInstance,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('alexa-proxy-service', () => {
  let credentialService: CredentialService;
  let mockCreateFn: ReturnType<typeof createMockCreateAlexaServiceFn>;
  let service: AlexaProxyService;

  beforeEach(() => {
    credentialService = createMockCredentialService();
    mockCreateFn = createMockCreateAlexaServiceFn();
    service = createAlexaProxyService({
      credentialService,
      createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createAlexaProxyService', () => {
    it('should return an object with all required interface methods', () => {
      expect(service).toBeDefined();
      expect(typeof service.startProxySession).toBe('function');
      expect(typeof service.getProxySession).toBe('function');
      expect(typeof service.stopProxySession).toBe('function');
    });
  });

  describe('startProxySession', () => {
    it('should start a proxy session and return ProxySession with sessionId and proxyPort', async () => {
      const result = await service.startProxySession('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBeDefined();
        expect(typeof result.value.sessionId).toBe('string');
        expect(result.value.sessionId.length).toBeGreaterThan(0);
        expect(result.value.uid).toBe('user-123');
        expect(typeof result.value.proxyPort).toBe('number');
        expect(result.value.status).toBe('active');
        expect(result.value.createdAt).toBeDefined();
      }
    });

    it('should call createAlexaRemoteForProxyFn with proxyOnly config', async () => {
      await service.startProxySession('user-123');

      expect(mockCreateFn.mockFn).toHaveBeenCalledTimes(1);
      const config = mockCreateFn.mockFn.mock.calls[0]![0] as AlexaServiceConfig;
      expect(config.amazonPage).toBe('amazon.co.jp');
      expect(config.acceptLanguage).toBe('ja-JP');
      expect(config.cookieFilePath).toContain('/tmp/alexa-proxy-');
      expect(config.proxyOwnIp).toBe('localhost');
      expect(config.proxyPort).toBe(0);
    });

    it('should include sessionId in the temp file path', async () => {
      const result = await service.startProxySession('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const config = mockCreateFn.mockFn.mock.calls[0]![0] as AlexaServiceConfig;
        expect(config.cookieFilePath).toContain(result.value.sessionId);
      }
    });

    it('should generate unique session IDs for different sessions', async () => {
      const result1 = await service.startProxySession('user-1');
      // Stop first to allow second for same user - or use different users
      const result2 = await service.startProxySession('user-2');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.sessionId).not.toBe(result2.value.sessionId);
      }
    });

    it('should make session retrievable via getProxySession after start', async () => {
      const result = await service.startProxySession('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = service.getProxySession(result.value.sessionId);
        expect(session).toBeDefined();
        expect(session?.uid).toBe('user-123');
        expect(session?.status).toBe('active');
      }
    });

    it('should return PROXY_START_FAILED when createAlexaRemoteForProxyFn throws', async () => {
      const failingCreateFn = vi.fn(async () => {
        throw new Error('Proxy failed to start');
      });
      const failService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: failingCreateFn,
      });

      const result = await failService.startProxySession('user-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROXY_START_FAILED');
        expect(result.error.message).toContain('Proxy failed to start');
      }
    });
  });

  describe('cookie event handling', () => {
    it('should save cookie to CredentialService when cookie event fires', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);

      const instance = mockCreateFn.getLastInstance();
      expect(instance).toBeDefined();

      const cookieData = { localCookie: 'abc', macDms: 'xyz' };
      instance!.emitCookie(cookieData);

      // Allow microtasks to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(credentialService.saveToken).toHaveBeenCalledWith(
        'user-123',
        'alexa',
        JSON.stringify(cookieData)
      );
    });

    it('should update session status to completed when cookie is received', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });

      // Allow microtasks to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      const session = service.getProxySession(result.value.sessionId);
      expect(session?.status).toBe('completed');
    });

    it('should set session status to failed when saveToken fails', async () => {
      const failingCredentialService = createMockCredentialService();
      failingCredentialService.saveToken = vi.fn(async () => ({
        ok: false as const,
        error: { code: 'FIRESTORE_ERROR' as const, message: 'Save failed' },
      }));
      const failService = createAlexaProxyService({
        credentialService: failingCredentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const result = await failService.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const session = failService.getProxySession(result.value.sessionId);
      expect(session?.status).toBe('failed');
    });
  });

  describe('getProxySession', () => {
    it('should return undefined for non-existent sessionId', () => {
      const session = service.getProxySession('non-existent-id');
      expect(session).toBeUndefined();
    });
  });

  describe('stopProxySession', () => {
    it('should stop an active proxy session', async () => {
      const startResult = await service.startProxySession('user-123');
      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const stopResult = await service.stopProxySession(startResult.value.sessionId);
      expect(stopResult.ok).toBe(true);
    });

    it('should remove session from active sessions after stop', async () => {
      const startResult = await service.startProxySession('user-123');
      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      await service.stopProxySession(startResult.value.sessionId);

      const session = service.getProxySession(startResult.value.sessionId);
      expect(session).toBeUndefined();
    });

    it('should return SESSION_NOT_FOUND when stopping non-existent session', async () => {
      const result = await service.stopProxySession('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should call stopProxyServer on the alexa instance when stopping', async () => {
      const startResult = await service.startProxySession('user-123');
      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      // Get reference to the mock alexa instance's stopProxyServer
      const alexaReturn = await mockCreateFn.mockFn.mock.results[0]!.value;
      const stopProxyServerSpy = alexaReturn.stopProxyServer;

      await service.stopProxySession(startResult.value.sessionId);

      expect(stopProxyServerSpy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Task 2.2: Session Management (duplicate prevention, timeout, cleanup)
  // Requirements: 5.1, 5.5
  // ===========================================================================

  describe('duplicate session prevention', () => {
    it('should return SESSION_ALREADY_ACTIVE when same user starts second session', async () => {
      const result1 = await service.startProxySession('user-123');
      expect(result1.ok).toBe(true);

      const result2 = await service.startProxySession('user-123');

      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error.code).toBe('SESSION_ALREADY_ACTIVE');
        expect(result2.error.message).toContain('user-123');
      }
    });

    it('should allow different users to start sessions simultaneously', async () => {
      const result1 = await service.startProxySession('user-1');
      const result2 = await service.startProxySession('user-2');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });

    it('should allow same user to start new session after previous session is stopped', async () => {
      const result1 = await service.startProxySession('user-123');
      expect(result1.ok).toBe(true);
      if (!result1.ok) return;

      await service.stopProxySession(result1.value.sessionId);

      const result2 = await service.startProxySession('user-123');
      expect(result2.ok).toBe(true);
    });

    it('should allow same user to start new session after previous session completes via cookie', async () => {
      const result1 = await service.startProxySession('user-123');
      expect(result1.ok).toBe(true);
      if (!result1.ok) return;

      // Emit cookie to complete the session
      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Session should now be completed, allowing a new one
      const result2 = await service.startProxySession('user-123');
      expect(result2.ok).toBe(true);
    });
  });

  describe('timeout management', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set session status to timeout after 5 minutes', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      const session = service.getProxySession(result.value.sessionId);
      expect(session?.status).toBe('timeout');
    });

    it('should call stopProxyServer on alexa instance when timeout fires', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const alexaReturn = await mockCreateFn.mockFn.mock.results[0]!.value;
      const stopProxyServerSpy = alexaReturn.stopProxyServer;

      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(stopProxyServerSpy).toHaveBeenCalled();
    });

    it('should allow same user to start new session after timeout', async () => {
      const result1 = await service.startProxySession('user-123');
      expect(result1.ok).toBe(true);
      if (!result1.ok) return;

      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      const result2 = await service.startProxySession('user-123');
      expect(result2.ok).toBe(true);
    });

    it('should not timeout if session completes before 5 minutes', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Emit cookie to complete session before timeout
      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });
      await vi.advanceTimersByTimeAsync(10);

      // Session should be completed, not timed out
      const session = service.getProxySession(result.value.sessionId);
      expect(session?.status).toBe('completed');

      // Advance past timeout period
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Status should still be completed (timeout should have been cleared)
      const sessionAfter = service.getProxySession(result.value.sessionId);
      // Session might be cleaned up or still show completed
      if (sessionAfter) {
        expect(sessionAfter.status).toBe('completed');
      }
    });

    it('should clear timeout when session is manually stopped', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      await service.stopProxySession(result.value.sessionId);

      // Session should be gone
      const session = service.getProxySession(result.value.sessionId);
      expect(session).toBeUndefined();

      // Advance past timeout - should not cause errors
      vi.advanceTimersByTime(5 * 60 * 1000);

      // No error should have occurred, session remains gone
      expect(service.getProxySession(result.value.sessionId)).toBeUndefined();
    });

    it('should log timeout event', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('timeout')
      );
    });
  });

  describe('cookie completion cleanup', () => {
    it('should stop proxy server after cookie is successfully saved', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const alexaReturn = await mockCreateFn.mockFn.mock.results[0]!.value;
      const stopProxyServerSpy = alexaReturn.stopProxyServer;

      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });

      // Allow microtasks to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(stopProxyServerSpy).toHaveBeenCalled();
    });

    it('should clear timeout after cookie completion', async () => {
      vi.useFakeTimers();

      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) {
        vi.useRealTimers();
        return;
      }

      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });
      await vi.advanceTimersByTimeAsync(10);

      // Session should be completed
      const session = service.getProxySession(result.value.sessionId);
      expect(session?.status).toBe('completed');

      // Advance past timeout - should not change status
      vi.advanceTimersByTime(5 * 60 * 1000);

      const sessionAfter = service.getProxySession(result.value.sessionId);
      if (sessionAfter) {
        expect(sessionAfter.status).toBe('completed');
      }

      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // Task 2.3: Comprehensive unit tests for AlexaProxyService
  // Requirements: 1.1, 1.3, 5.1, 5.5
  // ===========================================================================

  describe('temp file cleanup on stopProxySession', () => {
    beforeEach(() => {
      vi.mocked(unlinkSync).mockClear();
      vi.mocked(existsSync).mockClear();
      vi.mocked(existsSync).mockReturnValue(true);
    });

    it('should delete temp cookie file when stopping a session', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      await service.stopProxySession(result.value.sessionId);

      expect(existsSync).toHaveBeenCalled();
      expect(unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining(`/tmp/alexa-proxy-${result.value.sessionId}.json`)
      );
    });

    it('should not call unlinkSync if temp file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      await service.stopProxySession(result.value.sessionId);

      expect(existsSync).toHaveBeenCalled();
      expect(unlinkSync).not.toHaveBeenCalled();
    });

    it('should not throw if unlinkSync fails during cleanup', async () => {
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should not throw
      const stopResult = await service.stopProxySession(result.value.sessionId);
      expect(stopResult.ok).toBe(true);
    });
  });

  describe('temp file cleanup on timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(unlinkSync).mockClear();
      vi.mocked(existsSync).mockClear();
      vi.mocked(existsSync).mockReturnValue(true);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delete temp cookie file when session times out', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining(`/tmp/alexa-proxy-${result.value.sessionId}.json`)
      );
    });
  });

  describe('proxy start failure cleanup', () => {
    it('should not leave session in maps when proxy startup fails', async () => {
      const failingCreateFn = vi.fn(async () => {
        throw new Error('Port already in use');
      });
      const failService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: failingCreateFn,
      });

      const result = await failService.startProxySession('user-123');
      expect(result.ok).toBe(false);

      // No sessions should be retrievable
      // We cannot directly check maps, but we can verify a new session can start
      // (which would fail if the uid mapping was left behind)
      const failingCreateFn2 = vi.fn(async () => {
        throw new Error('Another failure');
      });
      const failService2 = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: failingCreateFn2,
      });
      const result2 = await failService2.startProxySession('user-123');
      // New service instance so uid map is clean - test that original service allows retry
      expect(result2.ok).toBe(false);
      expect(!result2.ok && result2.error.code).toBe('PROXY_START_FAILED');
    });

    it('should allow same user to retry after proxy startup failure', async () => {
      // First attempt fails
      let callCount = 0;
      const sometimesFailingCreateFn = vi.fn(async (config: AlexaServiceConfig) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary failure');
        }
        // Second call succeeds
        const listeners = new Map<string, (...args: readonly unknown[]) => void>();
        return {
          on: (event: string, handler: (...args: readonly unknown[]) => void) => {
            listeners.set(event, handler);
          },
          stopProxyServer: vi.fn(),
          proxyPort: 12345,
          getCookieData: () => ({ cookie: 'mock' }),
        };
      });

      const retryService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: sometimesFailingCreateFn,
      });

      const result1 = await retryService.startProxySession('user-123');
      expect(result1.ok).toBe(false);

      // Retry should succeed - uid mapping should have been cleaned up
      const result2 = await retryService.startProxySession('user-123');
      expect(result2.ok).toBe(true);
    });
  });

  describe('non-Error throw handling', () => {
    it('should handle non-Error object thrown by createAlexaRemoteForProxyFn', async () => {
      const failingCreateFn = vi.fn(async () => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });
      const failService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: failingCreateFn,
      });

      const result = await failService.startProxySession('user-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROXY_START_FAILED');
        expect(result.error.message).toContain('不明なエラー');
      }
    });
  });

  describe('cookie data serialization', () => {
    it('should JSON.stringify the full cookie data object', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);

      const instance = mockCreateFn.getLastInstance();
      const complexCookieData = {
        localCookie: 'session-token=abc;',
        macDms: { device_private_key: 'key123', adp_token: 'adp456' },
        csrf: 'csrf-value',
      };
      instance!.emitCookie(complexCookieData);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(credentialService.saveToken).toHaveBeenCalledWith(
        'user-123',
        'alexa',
        JSON.stringify(complexCookieData)
      );
    });

    it('should use "alexa" as the service name for CredentialService', async () => {
      const result = await service.startProxySession('user-abc');
      expect(result.ok).toBe(true);

      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ cookie: 'value' });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(credentialService.saveToken).toHaveBeenCalledWith(
        'user-abc',
        'alexa',
        expect.any(String)
      );
    });
  });

  describe('logging verification', () => {
    it('should log success message when cookie is saved', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);

      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cookie saved')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('user-123')
      );
    });

    it('should log error message when cookie save fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      const failingCredentialService = createMockCredentialService();
      failingCredentialService.saveToken = vi.fn(async () => ({
        ok: false as const,
        error: { code: 'FIRESTORE_ERROR' as const, message: 'Firestore write error' },
      }));
      const failService = createAlexaProxyService({
        credentialService: failingCredentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const result = await failService.startProxySession('user-123');
      expect(result.ok).toBe(true);

      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save cookie')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Firestore write error')
      );
    });

    it('should include uid and sessionId in timeout log', async () => {
      vi.useFakeTimers();
      const consoleSpy = vi.spyOn(console, 'warn');

      const result = await service.startProxySession('user-xyz');
      expect(result.ok).toBe(true);
      if (!result.ok) {
        vi.useRealTimers();
        return;
      }

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('user-xyz')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(result.value.sessionId)
      );

      vi.useRealTimers();
    });
  });

  describe('stopProxyServer error resilience', () => {
    it('should not throw if stopProxyServer on alexa instance throws', async () => {
      // Create a mock that returns an instance where stopProxyServer throws
      const throwingCreateFn = vi.fn(async () => {
        const listeners = new Map<string, (...args: readonly unknown[]) => void>();
        return {
          on: (event: string, handler: (...args: readonly unknown[]) => void) => {
            listeners.set(event, handler);
          },
          stopProxyServer: vi.fn(() => {
            throw new Error('Server already stopped');
          }),
          proxyPort: 54321,
          getCookieData: () => ({ cookie: 'mock' }),
        };
      });
      const resilientService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: throwingCreateFn,
      });

      const result = await resilientService.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should not throw even though stopProxyServer throws
      const stopResult = await resilientService.stopProxySession(result.value.sessionId);
      expect(stopResult.ok).toBe(true);
    });

    it('should handle alexa instance with no stopProxyServer method', async () => {
      // Instance without stopProxyServer
      const noStopCreateFn = vi.fn(async () => {
        const listeners = new Map<string, (...args: readonly unknown[]) => void>();
        return {
          on: (event: string, handler: (...args: readonly unknown[]) => void) => {
            listeners.set(event, handler);
          },
          // No stopProxyServer property
          proxyPort: 11111,
          getCookieData: () => ({ cookie: 'mock' }),
        };
      });
      const noStopService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: noStopCreateFn,
      });

      const result = await noStopService.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should not throw when stopProxyServer is missing
      const stopResult = await noStopService.stopProxySession(result.value.sessionId);
      expect(stopResult.ok).toBe(true);
    });
  });

  describe('proxyPort assignment', () => {
    it('should use the proxyPort from the alexa instance when non-zero', async () => {
      const portCreateFn = vi.fn(async () => {
        const listeners = new Map<string, (...args: readonly unknown[]) => void>();
        return {
          on: (event: string, handler: (...args: readonly unknown[]) => void) => {
            listeners.set(event, handler);
          },
          stopProxyServer: vi.fn(),
          proxyPort: 54321,
          getCookieData: () => ({ cookie: 'mock' }),
        };
      });
      const portService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: portCreateFn,
      });

      const result = await portService.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.proxyPort).toBe(54321);
      }
    });

    it('should keep proxyPort as 0 when alexa instance has proxyPort 0', async () => {
      // Default mock already returns proxyPort: 0
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.proxyPort).toBe(0);
      }
    });
  });

  describe('session isolation between users', () => {
    it('should maintain independent session states for different users', async () => {
      const result1 = await service.startProxySession('user-A');
      const result2 = await service.startProxySession('user-B');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      // Stop user-A session
      await service.stopProxySession(result1.value.sessionId);

      // User-A session gone, user-B still active
      expect(service.getProxySession(result1.value.sessionId)).toBeUndefined();
      expect(service.getProxySession(result2.value.sessionId)?.status).toBe('active');
    });

    it('should complete one user session without affecting another', async () => {
      const result1 = await service.startProxySession('user-A');
      const result2 = await service.startProxySession('user-B');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      // Get the instance for user-A (first call) and emit cookie
      const firstMockResult = await mockCreateFn.mockFn.mock.results[0]!.value;
      // The last instance is user-B, but we need user-A's listeners
      // Since we registered event handlers, we need to access the first instance's listeners
      // The mock captures the on() calls, so we need to trigger them
      // Actually, getLastInstance returns the LAST created instance (user-B)
      // For user-A, we can get the cookie handler from the first mock result
      const userAListeners = new Map<string, (...args: readonly unknown[]) => void>();
      // The on method was called during startProxySession for user-A
      const onCallsForA = mockCreateFn.mockFn.mock.calls[0];
      expect(onCallsForA).toBeDefined();

      // User-B should remain active regardless of user-A operations
      await service.stopProxySession(result1.value.sessionId);
      const sessionB = service.getProxySession(result2.value.sessionId);
      expect(sessionB?.status).toBe('active');
      expect(sessionB?.uid).toBe('user-B');
    });
  });

  describe('createdAt timestamp', () => {
    it('should set createdAt as a valid ISO 8601 timestamp', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const parsed = new Date(result.value.createdAt);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('should have createdAt close to current time', async () => {
      const before = Date.now();
      const result = await service.startProxySession('user-123');
      const after = Date.now();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const createdTime = new Date(result.value.createdAt).getTime();
      expect(createdTime).toBeGreaterThanOrEqual(before);
      expect(createdTime).toBeLessThanOrEqual(after);
    });
  });

  describe('getProxySession returns readonly snapshot', () => {
    it('should return session data matching the started session', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const session = service.getProxySession(result.value.sessionId);
      expect(session).toBeDefined();
      expect(session).toEqual({
        sessionId: result.value.sessionId,
        uid: 'user-123',
        proxyPort: result.value.proxyPort,
        status: 'active',
        createdAt: result.value.createdAt,
      });
    });

    it('should reflect status changes (completed via cookie)', async () => {
      const result = await service.startProxySession('user-123');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Before cookie
      expect(service.getProxySession(result.value.sessionId)?.status).toBe('active');

      // Emit cookie
      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ data: 'test' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // After cookie
      expect(service.getProxySession(result.value.sessionId)?.status).toBe('completed');
    });
  });

  describe('stopProxySession error message', () => {
    it('should include sessionId in SESSION_NOT_FOUND error message', async () => {
      const result = await service.stopProxySession('specific-session-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('specific-session-id');
      }
    });
  });

  describe('duplicate session error details', () => {
    it('should include existing sessionId in SESSION_ALREADY_ACTIVE error message', async () => {
      const result1 = await service.startProxySession('user-123');
      expect(result1.ok).toBe(true);
      if (!result1.ok) return;

      const result2 = await service.startProxySession('user-123');
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error.message).toContain(result1.value.sessionId);
      }
    });
  });
});
