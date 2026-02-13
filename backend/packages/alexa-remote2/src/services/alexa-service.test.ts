/**
 * Tests for AlexaService foundation with Cookie authentication management
 *
 * Requirements: 1.1, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 11.1, 11.2
 *
 * Task 1.2: Cookie認証管理を含むAlexaService基盤の実装
 * - Factory function createAlexaService wrapping alexa-remote2 callback API
 * - Cookie file loading and auto-save on cookie event
 * - Proxy server launch when no cookie file exists
 * - AUTH_ERROR on expired/invalid cookie
 * - Unconnected instance returns AUTH_ERROR on method calls
 * - isConnected() state check
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AlexaServiceConfig } from '../types/alexa-types.js';

// We will mock alexa-remote2 and fs modules
vi.mock('alexa-remote2', () => {
  return {
    default: vi.fn(),
  };
});

vi.mock('node:fs', () => {
  return {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Import after mocks are set up
import AlexaRemote from 'alexa-remote2';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createAlexaService } from './alexa-service.js';
import type { AlexaService } from './alexa-service.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestConfig(overrides?: Partial<AlexaServiceConfig>): AlexaServiceConfig {
  return {
    amazonPage: 'amazon.co.jp',
    acceptLanguage: 'ja-JP',
    cookieFilePath: '/tmp/test-cookie.json',
    ...overrides,
  };
}

/**
 * Create a mock AlexaRemote instance with controllable init behavior.
 */
function createMockAlexaRemoteInstance(options?: {
  initError?: Error;
  cookie?: string;
}) {
  const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  const mockInstance = {
    init: vi.fn((_options: unknown, callback: (err?: Error) => void) => {
      if (options?.initError) {
        callback(options.initError);
      } else {
        callback();
      }
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event]!.push(handler);
      return mockInstance;
    }),
    cookie: options?.cookie ?? 'mock-cookie-string',
    cookieData: undefined as string | undefined,
    serialNumbers: {} as Record<string, unknown>,
    // Expose emit for tests to trigger cookie events
    _emit: (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers[event];
      if (handlers) {
        for (const h of handlers) {
          h(...args);
        }
      }
    },
    _eventHandlers: eventHandlers,
  };

  return mockInstance;
}

// ============================================================================
// Tests
// ============================================================================

describe('AlexaService', () => {
  let mockAlexaRemoteConstructor: ReturnType<typeof vi.fn>;
  let mockExistsSync: ReturnType<typeof vi.fn>;
  let mockReadFileSync: ReturnType<typeof vi.fn>;
  let mockWriteFileSync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAlexaRemoteConstructor = vi.mocked(AlexaRemote);
    mockExistsSync = vi.mocked(existsSync);
    mockReadFileSync = vi.mocked(readFileSync);
    mockWriteFileSync = vi.mocked(writeFileSync);
  });

  // --------------------------------------------------------------------------
  // Factory function / createAlexaService
  // --------------------------------------------------------------------------

  describe('createAlexaService', () => {
    it('should return an AlexaService instance even when not connected', async () => {
      // Cookie file does not exist, init will fail
      mockExistsSync.mockReturnValue(false);
      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('No cookie'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const config = createTestConfig();
      const service = await createAlexaService(config);

      expect(service).toBeDefined();
      expect(service.isConnected()).toBe(false);
    });

    it('should return a connected service when saved cookie exists and is valid', async () => {
      const savedCookieData = JSON.stringify({
        localCookie: 'valid-cookie',
        frc: 'frc-value',
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(savedCookieData);

      const mockInstance = createMockAlexaRemoteInstance({ cookie: 'valid-cookie' });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const config = createTestConfig();
      const service = await createAlexaService(config);

      expect(service).toBeDefined();
      expect(service.isConnected()).toBe(true);
      // Verify init was called with cookie data
      expect(mockInstance.init).toHaveBeenCalledTimes(1);
    });

    it('should pass config options (amazonPage, acceptLanguage) to alexa-remote2 init', async () => {
      const savedCookieData = JSON.stringify({ localCookie: 'cookie' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(savedCookieData);

      const mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const config = createTestConfig();
      await createAlexaService(config);

      const initOptions = mockInstance.init.mock.calls[0]![0] as Record<string, unknown>;
      expect(initOptions['amazonPage']).toBe('amazon.co.jp');
      expect(initOptions['acceptLanguage']).toBe('ja-JP');
    });

    it('should pass proxy settings to alexa-remote2 init when no cookie file exists', async () => {
      mockExistsSync.mockReturnValue(false);

      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('No cookie, proxy started'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const config = createTestConfig({
        proxyOwnIp: '192.168.1.10',
        proxyPort: 3456,
      });
      await createAlexaService(config);

      const initOptions = mockInstance.init.mock.calls[0]![0] as Record<string, unknown>;
      expect(initOptions['proxyOwnIp']).toBe('192.168.1.10');
      expect(initOptions['proxyPort']).toBe(3456);
      expect(initOptions['proxyOnly']).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Cookie file handling
  // --------------------------------------------------------------------------

  describe('Cookie file management', () => {
    it('should read saved cookie file when it exists', async () => {
      const savedCookie = JSON.stringify({ localCookie: 'saved' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(savedCookie);

      const mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      await createAlexaService(createTestConfig());

      expect(mockExistsSync).toHaveBeenCalledWith('/tmp/test-cookie.json');
      expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/test-cookie.json', 'utf-8');
    });

    it('should save cookie data when cookie event is received', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'old' }));

      const mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      await createAlexaService(createTestConfig());

      // Simulate alexa-remote2 emitting 'cookie' event
      // After the fix, the handler reads alexa.cookieData instead of the event argument
      const newCookieData = { localCookie: 'new-cookie', frc: 'new-frc' };
      mockInstance.cookieData = newCookieData as unknown as string;
      mockInstance._emit('cookie');

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/tmp/test-cookie.json',
        JSON.stringify(newCookieData, null, 2),
        'utf-8'
      );
    });

    it('should not attempt to read cookie file when it does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('proxy mode'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      await createAlexaService(createTestConfig());

      expect(mockReadFileSync).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Connection state: isConnected()
  // --------------------------------------------------------------------------

  describe('isConnected', () => {
    it('should return true when init succeeds', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      const mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const service = await createAlexaService(createTestConfig());

      expect(service.isConnected()).toBe(true);
    });

    it('should return false when init fails', async () => {
      mockExistsSync.mockReturnValue(false);

      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('Connection failed'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const service = await createAlexaService(createTestConfig());

      expect(service.isConnected()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Unconnected state: AUTH_ERROR on method calls
  // --------------------------------------------------------------------------

  describe('Unconnected service returns AUTH_ERROR', () => {
    let disconnectedService: AlexaService;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(false);

      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('Not connected'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      disconnectedService = await createAlexaService(createTestConfig());
    });

    it('should return AUTH_ERROR when speak is called while not connected', async () => {
      const result = await disconnectedService.speak('DEVICE001', 'hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
        expect(result.error.message).toContain('Not connected');
      }
    });

    it('should return AUTH_ERROR when announce is called while not connected', async () => {
      const result = await disconnectedService.announce('DEVICE001', 'announcement');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });

    it('should return AUTH_ERROR when getRoutines is called while not connected', async () => {
      const result = await disconnectedService.getRoutines();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });

    it('should return AUTH_ERROR when executeRoutine is called while not connected', async () => {
      const result = await disconnectedService.executeRoutine('Morning');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });

    it('should return AUTH_ERROR when setVolume is called while not connected', async () => {
      const result = await disconnectedService.setVolume('DEVICE001', 50);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });

    it('should return AUTH_ERROR when playWeather is called while not connected', async () => {
      const result = await disconnectedService.playWeather('DEVICE001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });

    it('should return AUTH_ERROR when playFlashBriefing is called while not connected', async () => {
      const result = await disconnectedService.playFlashBriefing('DEVICE001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Cookie authentication error handling
  // --------------------------------------------------------------------------

  describe('Cookie authentication errors', () => {
    it('should handle invalid cookie data gracefully (not crash)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid-json-data');

      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('Invalid cookie'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const service = await createAlexaService(createTestConfig());

      expect(service).toBeDefined();
      expect(service.isConnected()).toBe(false);
    });

    it('should handle cookie file read errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('No cookie data'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const service = await createAlexaService(createTestConfig());

      expect(service).toBeDefined();
      expect(service.isConnected()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.1: TTS (speak) functionality
  // --------------------------------------------------------------------------

  describe('speak - TTS functionality', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should call alexa-remote2 sendSequenceCommand with speak command and message', async () => {
      // Set up sendSequenceCommand mock to succeed
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.speak('DEVICE001', 'Hello world');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deviceSerialNumber).toBe('DEVICE001');
        expect(result.data.command).toBe('speak');
        expect(result.data.success).toBe(true);
      }

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'speak',
        'Hello world',
        expect.any(Function)
      );
    });

    it('should truncate message to 250 characters when it exceeds the limit', async () => {
      const longMessage = 'A'.repeat(300);
      const expectedTruncated = 'A'.repeat(250);

      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.speak('DEVICE001', longMessage);

      expect(result.success).toBe(true);
      // Verify the truncated message was sent to alexa-remote2
      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'speak',
        expectedTruncated,
        expect.any(Function)
      );
    });

    it('should not truncate message that is exactly 250 characters', async () => {
      const exactMessage = 'B'.repeat(250);

      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      await connectedService.speak('DEVICE001', exactMessage);

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'speak',
        exactMessage,
        expect.any(Function)
      );
    });

    it('should return ALEXA_ERROR when sendSequenceCommand fails with unknown error', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Something went wrong'));
        }
      );

      const result = await connectedService.speak('DEVICE001', 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.message).toContain('Something went wrong');
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it('should return TIMEOUT error when sendSequenceCommand fails with timeout', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('timeout'));
        }
      );

      const result = await connectedService.speak('DEVICE001', 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should return TIMEOUT error when sendSequenceCommand fails with ETIMEDOUT', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('connect ETIMEDOUT 1.2.3.4:443'));
        }
      );

      const result = await connectedService.speak('DEVICE001', 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should handle empty message string', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.speak('DEVICE001', '');

      expect(result.success).toBe(true);
      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'speak',
        '',
        expect.any(Function)
      );
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.2: Announcement (voice + display) functionality
  // --------------------------------------------------------------------------

  describe('announce - Announcement functionality', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should call alexa-remote2 sendSequenceCommand with announcement command and message', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.announce('DEVICE001', 'Hello announcement');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deviceSerialNumber).toBe('DEVICE001');
        expect(result.data.command).toBe('announcement');
        expect(result.data.success).toBe(true);
      }

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'announcement',
        'Hello announcement',
        expect.any(Function)
      );
    });

    it('should truncate announcement message to 250 characters when it exceeds the limit', async () => {
      const longMessage = 'X'.repeat(300);
      const expectedTruncated = 'X'.repeat(250);

      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.announce('DEVICE001', longMessage);

      expect(result.success).toBe(true);
      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'announcement',
        expectedTruncated,
        expect.any(Function)
      );
    });

    it('should not truncate announcement message that is exactly 250 characters', async () => {
      const exactMessage = 'Y'.repeat(250);

      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      await connectedService.announce('DEVICE001', exactMessage);

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'announcement',
        exactMessage,
        expect.any(Function)
      );
    });

    it('should return ALEXA_ERROR when sendSequenceCommand fails with unknown error', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Announcement failed'));
        }
      );

      const result = await connectedService.announce('DEVICE001', 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.message).toContain('Announcement failed');
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it('should return TIMEOUT error when sendSequenceCommand fails with timeout', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Request timeout'));
        }
      );

      const result = await connectedService.announce('DEVICE001', 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should handle empty announcement message', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.announce('DEVICE001', '');

      expect(result.success).toBe(true);
      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'announcement',
        '',
        expect.any(Function)
      );
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.3: Routine execution functionality
  // --------------------------------------------------------------------------

  describe('getRoutines - Routine list retrieval', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should call alexa-remote2 getAutomationRoutines and return routine list', async () => {
      const mockRoutines = [
        {
          automationId: 'routine-001',
          name: 'おはよう',
          triggers: [],
          sequence: [],
        },
        {
          automationId: 'routine-002',
          name: 'おやすみ',
          triggers: [],
          sequence: [],
        },
      ];

      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(undefined, mockRoutines);
        }
      );

      const result = await connectedService.getRoutines();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]).toEqual({ name: 'おはよう', id: 'routine-001' });
        expect(result.data[1]).toEqual({ name: 'おやすみ', id: 'routine-002' });
      }

      expect(mockInstance.getAutomationRoutines).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Function)
      );
    });

    it('should return empty array when no routines exist', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(undefined, []);
        }
      );

      const result = await connectedService.getRoutines();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should return ALEXA_ERROR when getAutomationRoutines fails', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(new Error('Failed to fetch routines'));
        }
      );

      const result = await connectedService.getRoutines();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.message).toContain('Failed to fetch routines');
      }
    });

    it('should return TIMEOUT when getAutomationRoutines times out', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(new Error('Request timeout'));
        }
      );

      const result = await connectedService.getRoutines();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should handle null/undefined response body gracefully', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(undefined, undefined);
        }
      );

      const result = await connectedService.getRoutines();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe('executeRoutine - Routine execution', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should find routine by name and execute it via executeAutomationRoutine', async () => {
      const mockRoutines = [
        {
          automationId: 'routine-001',
          name: 'おはよう',
          triggers: [],
          sequence: [],
        },
        {
          automationId: 'routine-002',
          name: 'おやすみ',
          triggers: [],
          sequence: [],
        },
      ];

      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(undefined, mockRoutines);
        }
      );

      mockInstance.executeAutomationRoutine = vi.fn(
        (_serialOrName: unknown, _routineId: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.executeRoutine('おはよう');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.command).toBe('routine');
        expect(result.data.success).toBe(true);
      }

      expect(mockInstance.executeAutomationRoutine).toHaveBeenCalledWith(
        expect.anything(),
        'routine-001',
        expect.any(Function)
      );
    });

    it('should return ROUTINE_NOT_FOUND when routine name does not exist', async () => {
      const mockRoutines = [
        {
          automationId: 'routine-001',
          name: 'おはよう',
          triggers: [],
          sequence: [],
        },
      ];

      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(undefined, mockRoutines);
        }
      );

      const result = await connectedService.executeRoutine('存在しないルーティン');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ROUTINE_NOT_FOUND');
        expect(result.error.message).toContain('存在しないルーティン');
      }
    });

    it('should return ALEXA_ERROR when executeAutomationRoutine fails', async () => {
      const mockRoutines = [
        {
          automationId: 'routine-001',
          name: 'おはよう',
          triggers: [],
          sequence: [],
        },
      ];

      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(undefined, mockRoutines);
        }
      );

      mockInstance.executeAutomationRoutine = vi.fn(
        (_serialOrName: unknown, _routineId: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Execution failed'));
        }
      );

      const result = await connectedService.executeRoutine('おはよう');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.message).toContain('Execution failed');
      }
    });

    it('should return ALEXA_ERROR when getAutomationRoutines fails during executeRoutine', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(new Error('Cannot fetch routines'));
        }
      );

      const result = await connectedService.executeRoutine('おはよう');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.message).toContain('Cannot fetch routines');
      }
    });

    it('should return TIMEOUT when executeAutomationRoutine times out', async () => {
      const mockRoutines = [
        {
          automationId: 'routine-001',
          name: 'おはよう',
          triggers: [],
          sequence: [],
        },
      ];

      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(undefined, mockRoutines);
        }
      );

      mockInstance.executeAutomationRoutine = vi.fn(
        (_serialOrName: unknown, _routineId: unknown, callback: (err?: Error) => void) => {
          callback(new Error('connect ETIMEDOUT 1.2.3.4:443'));
        }
      );

      const result = await connectedService.executeRoutine('おはよう');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should perform case-sensitive name matching for routines', async () => {
      const mockRoutines = [
        {
          automationId: 'routine-001',
          name: 'Morning Routine',
          triggers: [],
          sequence: [],
        },
      ];

      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, callback: (err?: Error, body?: unknown) => void) => {
          callback(undefined, mockRoutines);
        }
      );

      const result = await connectedService.executeRoutine('morning routine');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ROUTINE_NOT_FOUND');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.4: Volume control functionality
  // --------------------------------------------------------------------------

  describe('setVolume - Volume control functionality', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should call alexa-remote2 sendSequenceCommand with volume command and numeric value', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.setVolume('DEVICE001', 50);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deviceSerialNumber).toBe('DEVICE001');
        expect(result.data.command).toBe('volume');
        expect(result.data.success).toBe(true);
      }

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'volume',
        50,
        expect.any(Function)
      );
    });

    it('should accept volume value of 0 (minimum boundary)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.setVolume('DEVICE001', 0);

      expect(result.success).toBe(true);
      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'volume',
        0,
        expect.any(Function)
      );
    });

    it('should accept volume value of 100 (maximum boundary)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.setVolume('DEVICE001', 100);

      expect(result.success).toBe(true);
      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'volume',
        100,
        expect.any(Function)
      );
    });

    it('should return VOLUME_OUT_OF_RANGE error when volume is negative', async () => {
      const result = await connectedService.setVolume('DEVICE001', -1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VOLUME_OUT_OF_RANGE');
        expect(result.error.message).toContain('-1');
      }
    });

    it('should return VOLUME_OUT_OF_RANGE error when volume exceeds 100', async () => {
      const result = await connectedService.setVolume('DEVICE001', 101);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VOLUME_OUT_OF_RANGE');
        expect(result.error.message).toContain('101');
      }
    });

    it('should return VOLUME_OUT_OF_RANGE error when volume is a large negative number', async () => {
      const result = await connectedService.setVolume('DEVICE001', -50);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VOLUME_OUT_OF_RANGE');
      }
    });

    it('should return VOLUME_OUT_OF_RANGE error when volume is a large positive number', async () => {
      const result = await connectedService.setVolume('DEVICE001', 200);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VOLUME_OUT_OF_RANGE');
      }
    });

    it('should return ALEXA_ERROR when sendSequenceCommand fails with unknown error', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Volume change failed'));
        }
      );

      const result = await connectedService.setVolume('DEVICE001', 50);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.message).toContain('Volume change failed');
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it('should return TIMEOUT error when sendSequenceCommand times out', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Request timeout'));
        }
      );

      const result = await connectedService.setVolume('DEVICE001', 50);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.5: Weather and Flash Briefing playback functionality
  // --------------------------------------------------------------------------

  describe('playWeather - Weather playback functionality', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should call alexa-remote2 sendSequenceCommand with weather command', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.playWeather('DEVICE001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deviceSerialNumber).toBe('DEVICE001');
        expect(result.data.command).toBe('weather');
        expect(result.data.success).toBe(true);
      }

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'weather',
        expect.anything(),
        expect.any(Function)
      );
    });

    it('should return ALEXA_ERROR when sendSequenceCommand fails with unknown error', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Weather playback failed'));
        }
      );

      const result = await connectedService.playWeather('DEVICE001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.message).toContain('Weather playback failed');
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it('should return TIMEOUT error when sendSequenceCommand fails with timeout', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('connect ETIMEDOUT 1.2.3.4:443'));
        }
      );

      const result = await connectedService.playWeather('DEVICE001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });
  });

  describe('playFlashBriefing - Flash Briefing playback functionality', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should call alexa-remote2 sendSequenceCommand with flashbriefing command', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback();
        }
      );

      const result = await connectedService.playFlashBriefing('DEVICE001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deviceSerialNumber).toBe('DEVICE001');
        expect(result.data.command).toBe('flashbriefing');
        expect(result.data.success).toBe(true);
      }

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'flashbriefing',
        expect.anything(),
        expect.any(Function)
      );
    });

    it('should return ALEXA_ERROR when sendSequenceCommand fails with unknown error', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Flash briefing failed'));
        }
      );

      const result = await connectedService.playFlashBriefing('DEVICE001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.message).toContain('Flash briefing failed');
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it('should return TIMEOUT error when sendSequenceCommand fails with timeout', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_serialOrName: unknown, _command: unknown, _value: unknown, callback: (err?: Error) => void) => {
          callback(new Error('Request timeout'));
        }
      );

      const result = await connectedService.playFlashBriefing('DEVICE001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });
  });

  // --------------------------------------------------------------------------
  // AlexaService interface completeness
  // --------------------------------------------------------------------------

  describe('AlexaService interface', () => {
    it('should expose all required methods from the AlexaService interface', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      const mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const service = await createAlexaService(createTestConfig());

      expect(typeof service.speak).toBe('function');
      expect(typeof service.announce).toBe('function');
      expect(typeof service.getRoutines).toBe('function');
      expect(typeof service.executeRoutine).toBe('function');
      expect(typeof service.setVolume).toBe('function');
      expect(typeof service.playWeather).toBe('function');
      expect(typeof service.playFlashBriefing).toBe('function');
      expect(typeof service.isConnected).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Console output for proxy URL (Requirement 2.2)
  // --------------------------------------------------------------------------

  describe('Proxy mode console output', () => {
    it('should log proxy URL to console when no cookie file exists and proxy settings are provided', async () => {
      mockExistsSync.mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('proxy started'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      await createAlexaService(
        createTestConfig({
          proxyOwnIp: '127.0.0.1',
          proxyPort: 3001,
        })
      );

      // Verify proxy URL was logged
      const logCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(logCalls).toContain('http://127.0.0.1:3001');

      consoleSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Task 2.6: AlexaService全メソッドのユニットテスト (Comprehensive)
  //
  // Requirements: 1.5, 2.5, 3.3, 5.4, 6.3, 11.1, 11.2, 11.3, 11.4
  //
  // These tests supplement tasks 2.1-2.5 with additional edge cases and
  // cross-cutting verification of ServiceError structure, cause fields,
  // boundary conditions, and AUTH_ERROR scenarios.
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Task 2.6 (a): Comprehensive happy-path tests with mock verification
  // Requirements: 1.5, 11.1
  // --------------------------------------------------------------------------

  describe('Task 2.6: Comprehensive happy-path - ServiceError structure validation', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('speak success result should have correct AlexaOperationResult structure (Req 1.5)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      const result = await connectedService.speak('DEV_SN_001', 'Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toStrictEqual({
          deviceSerialNumber: 'DEV_SN_001',
          command: 'speak',
          success: true,
        });
      }
    });

    it('announce success result should have correct AlexaOperationResult structure (Req 1.5)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      const result = await connectedService.announce('DEV_SN_002', 'Notice');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toStrictEqual({
          deviceSerialNumber: 'DEV_SN_002',
          command: 'announcement',
          success: true,
        });
      }
    });

    it('getRoutines success result should have readonly AlexaRoutineInfo array (Req 1.5)', async () => {
      const mockRoutines = [
        { automationId: 'r-100', name: 'BGM開始', triggers: [], sequence: [] },
        { automationId: 'r-101', name: '集中モード', triggers: [], sequence: [] },
        { automationId: 'r-102', name: 'リラックス', triggers: [], sequence: [] },
      ];
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(undefined, mockRoutines);
        }
      );

      const result = await connectedService.getRoutines();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0]).toStrictEqual({ name: 'BGM開始', id: 'r-100' });
        expect(result.data[1]).toStrictEqual({ name: '集中モード', id: 'r-101' });
        expect(result.data[2]).toStrictEqual({ name: 'リラックス', id: 'r-102' });
      }
    });

    it('executeRoutine success result should have routine command (Req 1.5)', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(undefined, [{ automationId: 'r-200', name: 'テスト', triggers: [], sequence: [] }]);
        }
      );
      mockInstance.executeAutomationRoutine = vi.fn(
        (_s: unknown, _r: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      const result = await connectedService.executeRoutine('テスト');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.command).toBe('routine');
        expect(result.data.success).toBe(true);
      }
    });

    it('setVolume success at mid-range (50) should return correct structure (Req 1.5)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      const result = await connectedService.setVolume('DEV_SN_003', 75);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toStrictEqual({
          deviceSerialNumber: 'DEV_SN_003',
          command: 'volume',
          success: true,
        });
      }
    });

    it('playWeather success should return weather command result (Req 1.5)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      const result = await connectedService.playWeather('DEV_SN_004');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toStrictEqual({
          deviceSerialNumber: 'DEV_SN_004',
          command: 'weather',
          success: true,
        });
      }
    });

    it('playFlashBriefing success should return flashbriefing command result (Req 1.5)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      const result = await connectedService.playFlashBriefing('DEV_SN_005');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toStrictEqual({
          deviceSerialNumber: 'DEV_SN_005',
          command: 'flashbriefing',
          success: true,
        });
      }
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.6 (b-1): TTS text truncation edge cases
  // Requirements: 3.3
  // --------------------------------------------------------------------------

  describe('Task 2.6: TTS text truncation edge cases (Req 3.3)', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should truncate speak message at exactly 251 characters (one over limit)', async () => {
      const msg251 = 'C'.repeat(251);
      const expected250 = 'C'.repeat(250);

      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      await connectedService.speak('DEVICE001', msg251);

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'speak',
        expected250,
        expect.any(Function)
      );
    });

    it('should truncate announce message at exactly 251 characters (one over limit)', async () => {
      const msg251 = 'D'.repeat(251);
      const expected250 = 'D'.repeat(250);

      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      await connectedService.announce('DEVICE001', msg251);

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'announcement',
        expected250,
        expect.any(Function)
      );
    });

    it('should not truncate speak message at exactly 249 characters (one under limit)', async () => {
      const msg249 = 'E'.repeat(249);

      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      await connectedService.speak('DEVICE001', msg249);

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'speak',
        msg249,
        expect.any(Function)
      );
    });

    it('should handle Japanese multi-byte characters in truncation correctly', async () => {
      // 300 Japanese characters - should be truncated to 250 characters (code units)
      const japaneseMsg = 'あ'.repeat(300);
      const expectedTruncated = 'あ'.repeat(250);

      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      await connectedService.speak('DEVICE001', japaneseMsg);

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'speak',
        expectedTruncated,
        expect.any(Function)
      );
    });

    it('should handle mixed ASCII and multi-byte characters in truncation', async () => {
      // 200 ASCII + 100 Japanese = 300 total characters -> truncated to 250
      const mixedMsg = 'A'.repeat(200) + 'あ'.repeat(100);
      const expectedTruncated = mixedMsg.slice(0, 250);

      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      await connectedService.speak('DEVICE001', mixedMsg);

      expect(mockInstance.sendSequenceCommand).toHaveBeenCalledWith(
        'DEVICE001',
        'speak',
        expectedTruncated,
        expect.any(Function)
      );
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.6 (b-2): Volume range validation additional edge cases
  // Requirements: 6.3
  // --------------------------------------------------------------------------

  describe('Task 2.6: Volume range validation edge cases (Req 6.3)', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should return VOLUME_OUT_OF_RANGE for fractional volume just below 0 (-0.5)', async () => {
      const result = await connectedService.setVolume('DEVICE001', -0.5);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VOLUME_OUT_OF_RANGE');
      }
    });

    it('should return VOLUME_OUT_OF_RANGE for volume just above 100 (100.1)', async () => {
      const result = await connectedService.setVolume('DEVICE001', 100.1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VOLUME_OUT_OF_RANGE');
      }
    });

    it('should accept integer volume value of 1 (near lower boundary)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      const result = await connectedService.setVolume('DEVICE001', 1);

      expect(result.success).toBe(true);
    });

    it('should accept integer volume value of 99 (near upper boundary)', async () => {
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(); }
      );

      const result = await connectedService.setVolume('DEVICE001', 99);

      expect(result.success).toBe(true);
    });

    it('VOLUME_OUT_OF_RANGE error should include the invalid volume value in message', async () => {
      const result = await connectedService.setVolume('DEVICE001', 150);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VOLUME_OUT_OF_RANGE');
        expect(result.error.message).toContain('150');
        expect(result.error.message).toContain('0');
        expect(result.error.message).toContain('100');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.6 (b-3): Routine not-found error edge cases
  // Requirements: 5.4
  // --------------------------------------------------------------------------

  describe('Task 2.6: Routine not-found error edge cases (Req 5.4)', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('should return ROUTINE_NOT_FOUND when routine list is empty', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(undefined, []);
        }
      );

      const result = await connectedService.executeRoutine('NonExistent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ROUTINE_NOT_FOUND');
        expect(result.error.message).toContain('NonExistent');
      }
    });

    it('should return ROUTINE_NOT_FOUND when name has leading/trailing whitespace mismatch', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(undefined, [
            { automationId: 'r-001', name: 'おはよう', triggers: [], sequence: [] },
          ]);
        }
      );

      const result = await connectedService.executeRoutine(' おはよう ');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ROUTINE_NOT_FOUND');
      }
    });

    it('ROUTINE_NOT_FOUND error should include the requested routine name in message', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(undefined, [
            { automationId: 'r-001', name: 'existing', triggers: [], sequence: [] },
          ]);
        }
      );

      const result = await connectedService.executeRoutine('my-missing-routine');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ROUTINE_NOT_FOUND');
        expect(result.error.message).toContain('my-missing-routine');
      }
    });

    it('should return ROUTINE_NOT_FOUND when routine list response is null', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(undefined, null);
        }
      );

      const result = await connectedService.executeRoutine('AnyRoutine');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ROUTINE_NOT_FOUND');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.6 (b-4): ServiceError structure verification (code, message, cause)
  // Requirements: 11.1, 11.3, 11.4
  // --------------------------------------------------------------------------

  describe('Task 2.6: ServiceError structure - code, message, cause (Req 11.1, 11.3, 11.4)', () => {
    let connectedService: AlexaService;
    let mockInstance: ReturnType<typeof createMockAlexaRemoteInstance>;

    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'valid' }));

      mockInstance = createMockAlexaRemoteInstance();
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      connectedService = await createAlexaService(createTestConfig());
    });

    it('ALEXA_ERROR from speak should have code, message, and cause (Req 11.1, 11.4)', async () => {
      const originalError = new Error('Speak command rejected');
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(originalError); }
      );

      const result = await connectedService.speak('D001', 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(typeof result.error.message).toBe('string');
        expect(result.error.message.length).toBeGreaterThan(0);
        expect(result.error.cause).toBe(originalError);
      }
    });

    it('TIMEOUT from announce should have code, message, and cause (Req 11.1, 11.3)', async () => {
      const timeoutError = new Error('Connection ETIMEDOUT 10.0.0.1:443');
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(timeoutError); }
      );

      const result = await connectedService.announce('D001', 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(typeof result.error.message).toBe('string');
        expect(result.error.message.length).toBeGreaterThan(0);
        expect(result.error.cause).toBe(timeoutError);
      }
    });

    it('ALEXA_ERROR from setVolume should preserve the original error as cause (Req 11.1, 11.4)', async () => {
      const originalError = new Error('Device unreachable');
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(originalError); }
      );

      const result = await connectedService.setVolume('D001', 30);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.cause).toBe(originalError);
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it('TIMEOUT from playWeather should preserve the original error as cause (Req 11.1, 11.3)', async () => {
      const timeoutError = new Error('Request timeout after 30000ms');
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(timeoutError); }
      );

      const result = await connectedService.playWeather('D001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.cause).toBe(timeoutError);
      }
    });

    it('ALEXA_ERROR from playFlashBriefing should preserve the original error as cause (Req 11.1, 11.4)', async () => {
      const originalError = new Error('Service unavailable');
      mockInstance.sendSequenceCommand = vi.fn(
        (_s: unknown, _c: unknown, _v: unknown, cb: (err?: Error) => void) => { cb(originalError); }
      );

      const result = await connectedService.playFlashBriefing('D001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.cause).toBe(originalError);
      }
    });

    it('TIMEOUT from getRoutines should preserve the original error as cause (Req 11.1, 11.3)', async () => {
      const timeoutError = new Error('ETIMEDOUT');
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(timeoutError);
        }
      );

      const result = await connectedService.getRoutines();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.cause).toBe(timeoutError);
      }
    });

    it('ALEXA_ERROR from executeRoutine (execution phase) should have cause (Req 11.1, 11.4)', async () => {
      const executionError = new Error('Routine execution denied');
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(undefined, [{ automationId: 'r-300', name: 'TestRoutine', triggers: [], sequence: [] }]);
        }
      );
      mockInstance.executeAutomationRoutine = vi.fn(
        (_s: unknown, _r: unknown, cb: (err?: Error) => void) => { cb(executionError); }
      );

      const result = await connectedService.executeRoutine('TestRoutine');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALEXA_ERROR');
        expect(result.error.cause).toBe(executionError);
      }
    });

    it('VOLUME_OUT_OF_RANGE error should have code and message but no cause (business logic error)', async () => {
      const result = await connectedService.setVolume('D001', -10);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VOLUME_OUT_OF_RANGE');
        expect(typeof result.error.message).toBe('string');
        // Business logic errors don't have a cause (no underlying Error)
        expect(result.error.cause).toBeUndefined();
      }
    });

    it('ROUTINE_NOT_FOUND error should have code and message but no cause (business logic error)', async () => {
      mockInstance.getAutomationRoutines = vi.fn(
        (_limit: unknown, cb: (err?: Error, body?: unknown) => void) => {
          cb(undefined, []);
        }
      );

      const result = await connectedService.executeRoutine('MissingRoutine');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ROUTINE_NOT_FOUND');
        expect(typeof result.error.message).toBe('string');
        expect(result.error.cause).toBeUndefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Task 2.6 (c): Cookie未接続時のAUTH_ERROR comprehensive test
  // Requirements: 2.5, 11.2
  // --------------------------------------------------------------------------

  describe('Task 2.6: AUTH_ERROR comprehensive - Cookie expiry and disconnection (Req 2.5, 11.2)', () => {
    it('should return AUTH_ERROR with code AUTH_ERROR for all methods when cookie is expired (Req 11.2)', async () => {
      // Simulate: cookie file exists but is expired -> init fails
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ localCookie: 'expired-cookie', frc: 'old' }));

      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('Cookie expired or invalid'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const service = await createAlexaService(createTestConfig());

      expect(service.isConnected()).toBe(false);

      // Verify every method returns AUTH_ERROR
      const speakResult = await service.speak('D001', 'test');
      expect(speakResult.success).toBe(false);
      if (!speakResult.success) {
        expect(speakResult.error.code).toBe('AUTH_ERROR');
        expect(speakResult.error.message).toContain('Not connected');
      }

      const announceResult = await service.announce('D001', 'test');
      expect(announceResult.success).toBe(false);
      if (!announceResult.success) {
        expect(announceResult.error.code).toBe('AUTH_ERROR');
      }

      const routinesResult = await service.getRoutines();
      expect(routinesResult.success).toBe(false);
      if (!routinesResult.success) {
        expect(routinesResult.error.code).toBe('AUTH_ERROR');
      }

      const execResult = await service.executeRoutine('test');
      expect(execResult.success).toBe(false);
      if (!execResult.success) {
        expect(execResult.error.code).toBe('AUTH_ERROR');
      }

      const volumeResult = await service.setVolume('D001', 50);
      expect(volumeResult.success).toBe(false);
      if (!volumeResult.success) {
        expect(volumeResult.error.code).toBe('AUTH_ERROR');
      }

      const weatherResult = await service.playWeather('D001');
      expect(weatherResult.success).toBe(false);
      if (!weatherResult.success) {
        expect(weatherResult.error.code).toBe('AUTH_ERROR');
      }

      const briefingResult = await service.playFlashBriefing('D001');
      expect(briefingResult.success).toBe(false);
      if (!briefingResult.success) {
        expect(briefingResult.error.code).toBe('AUTH_ERROR');
      }
    });

    it('AUTH_ERROR should contain informative message about re-authentication (Req 2.5)', async () => {
      mockExistsSync.mockReturnValue(false);
      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('No cookie'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const service = await createAlexaService(createTestConfig());

      const result = await service.speak('D001', 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
        // Message should indicate that authentication is required
        expect(result.error.message.toLowerCase()).toMatch(/not connected|auth|cookie/i);
      }
    });

    it('AUTH_ERROR should not have a cause field (service-level state error, not alexa-remote2 error)', async () => {
      mockExistsSync.mockReturnValue(false);
      const mockInstance = createMockAlexaRemoteInstance({
        initError: new Error('No cookie'),
      });
      mockAlexaRemoteConstructor.mockReturnValue(mockInstance);

      const service = await createAlexaService(createTestConfig());

      const result = await service.setVolume('D001', 50);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
        // AUTH_ERROR for disconnected state should not include cause
        expect(result.error.cause).toBeUndefined();
      }
    });
  });
});
