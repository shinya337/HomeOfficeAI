/**
 * Tests for actionDispatcherFactory AlexaService injection pattern (Task 4.2)
 *
 * Verifies that actionDispatcherFactory correctly resolves alexaService from
 * sessionIoTServices (user-specific) with fallback to global alexaService,
 * following the same pattern as lightService and airconService.
 *
 * Requirements: 4.2 (ActionDispatcher優先使用), 4.3 (グローバルフォールバック)
 */
import { describe, it, expect, vi } from 'vitest';
import { createActionDispatcher, type AlexaServiceForDispatcher } from './action-dispatcher.js';
import type { SessionIoTServices } from '../types/session-types.js';
import type { AllowedDevice } from '../types/device-types.js';

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Create a mock AlexaServiceForDispatcher with a label for identification.
 */
function createMockAlexaService(label: string): AlexaServiceForDispatcher & { label: string } {
  return {
    label,
    speak: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'test', command: 'speak', success: true } }),
    announce: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'test', command: 'announce', success: true } }),
    executeRoutine: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'test', command: 'routine', success: true } }),
    setVolume: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'test', command: 'volume', success: true } }),
    textCommand: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'test', command: 'textCommand', success: true } }),
    playWeather: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'test', command: 'weather', success: true } }),
    playFlashBriefing: vi.fn().mockResolvedValue({ success: true, data: { deviceSerialNumber: 'test', command: 'flashBriefing', success: true } }),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

/**
 * Simulate the actionDispatcherFactory pattern from server.ts.
 * This is the exact pattern that should exist after Task 4.2 implementation.
 *
 * The factory takes global services and returns a function that creates dispatchers
 * with session-specific overrides.
 */
function createActionDispatcherFactoryForTest(
  globalAlexaService: AlexaServiceForDispatcher | null,
) {
  return (
    allowedDevices: readonly AllowedDevice[],
    sessionIoTServices?: SessionIoTServices,
  ) =>
    createActionDispatcher(allowedDevices, {
      // Task 4.2: alexaService should follow the same pattern as lightService/airconService
      // sessionIoTServices?.alexaService ?? globalAlexaService (user-specific takes priority)
      ...(sessionIoTServices?.alexaService ?? globalAlexaService ? { alexaService: sessionIoTServices?.alexaService ?? globalAlexaService! } : {}),
    });
}

/**
 * Simulate the CURRENT (pre-Task 4.2) actionDispatcherFactory pattern.
 * This always uses the global alexaService, ignoring sessionIoTServices.alexaService.
 */
function createOldActionDispatcherFactory(
  globalAlexaService: AlexaServiceForDispatcher | null,
) {
  return (
    allowedDevices: readonly AllowedDevice[],
    _sessionIoTServices?: SessionIoTServices,
  ) =>
    createActionDispatcher(allowedDevices, {
      // OLD: always uses global, ignores session-specific
      ...(globalAlexaService ? { alexaService: globalAlexaService } : {}),
    });
}

// =============================================================================
// Tests
// =============================================================================

describe('actionDispatcherFactory AlexaService injection (Task 4.2)', () => {
  const alexaDevice: AllowedDevice = { id: 'echo-serial-1', type: 'ALEXA' };

  describe('session-specific AlexaService priority (Req 4.2)', () => {
    it('should use session-specific alexaService when provided in sessionIoTServices', async () => {
      const globalAlexa = createMockAlexaService('global');
      const sessionAlexa = createMockAlexaService('session');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        alexaService: sessionAlexa,
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      // Dispatch an alexa_speak action
      const result = await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'hello from session' },
      });

      // Session-specific AlexaService should have been called, NOT global
      expect(sessionAlexa.speak).toHaveBeenCalledWith('echo-serial-1', 'hello from session');
      expect(globalAlexa.speak).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it('should use session-specific alexaService for announce action', async () => {
      const globalAlexa = createMockAlexaService('global');
      const sessionAlexa = createMockAlexaService('session');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        alexaService: sessionAlexa,
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      await dispatcher.dispatch({
        tool: 'alexa_announcement',
        params: { message: 'announcement from session' },
      });

      expect(sessionAlexa.announce).toHaveBeenCalledWith('echo-serial-1', 'announcement from session');
      expect(globalAlexa.announce).not.toHaveBeenCalled();
    });

    it('should use session-specific alexaService for volume action', async () => {
      const globalAlexa = createMockAlexaService('global');
      const sessionAlexa = createMockAlexaService('session');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        alexaService: sessionAlexa,
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      await dispatcher.dispatch({
        tool: 'alexa_volume',
        params: { volume: 50 },
      });

      expect(sessionAlexa.setVolume).toHaveBeenCalledWith('echo-serial-1', 50);
      expect(globalAlexa.setVolume).not.toHaveBeenCalled();
    });
  });

  describe('global AlexaService fallback (Req 4.3)', () => {
    it('should fallback to global alexaService when sessionIoTServices has no alexaService', async () => {
      const globalAlexa = createMockAlexaService('global');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        // alexaService is not set (optional property, defaults to undefined)
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'hello from global fallback' },
      });

      // Global AlexaService should be used as fallback
      expect(globalAlexa.speak).toHaveBeenCalledWith('echo-serial-1', 'hello from global fallback');
    });

    it('should fallback to global alexaService when sessionIoTServices is undefined', async () => {
      const globalAlexa = createMockAlexaService('global');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      // No sessionIoTServices at all (guest mode)
      const dispatcher = factory([alexaDevice], undefined);

      await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'hello from global (no session)' },
      });

      expect(globalAlexa.speak).toHaveBeenCalledWith('echo-serial-1', 'hello from global (no session)');
    });

    it('should fallback to global when session alexaService is explicitly undefined', async () => {
      const globalAlexa = createMockAlexaService('global');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        alexaService: undefined,
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'explicit undefined fallback' },
      });

      expect(globalAlexa.speak).toHaveBeenCalledWith('echo-serial-1', 'explicit undefined fallback');
    });
  });

  describe('no AlexaService available', () => {
    it('should handle no global and no session alexaService gracefully', async () => {
      const factory = createActionDispatcherFactoryForTest(null);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      const result = await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'should fail' },
      });

      // Should return error since no AlexaService is available
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });
  });

  describe('session-specific AlexaService for routine and textCommand (Req 4.2)', () => {
    it('should use session-specific alexaService for routine action', async () => {
      const globalAlexa = createMockAlexaService('global');
      const sessionAlexa = createMockAlexaService('session');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        alexaService: sessionAlexa,
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      await dispatcher.dispatch({
        tool: 'alexa_routine',
        params: { routine_name: 'good morning routine' },
      });

      // executeRoutine takes only routineName (no deviceSerialNumber)
      expect(sessionAlexa.executeRoutine).toHaveBeenCalledWith('good morning routine');
      expect(globalAlexa.executeRoutine).not.toHaveBeenCalled();
    });

    it('should use session-specific alexaService for textCommand action', async () => {
      const globalAlexa = createMockAlexaService('global');
      const sessionAlexa = createMockAlexaService('session');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        alexaService: sessionAlexa,
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      await dispatcher.dispatch({
        tool: 'alexa_textcommand',
        params: { text: 'play some music' },
      });

      expect(sessionAlexa.textCommand).toHaveBeenCalledWith('echo-serial-1', 'play some music');
      expect(globalAlexa.textCommand).not.toHaveBeenCalled();
    });
  });

  describe('multiple Alexa actions in sequence (Req 4.2)', () => {
    it('should consistently use session-specific alexaService across multiple dispatch calls', async () => {
      const globalAlexa = createMockAlexaService('global');
      const sessionAlexa = createMockAlexaService('session');

      const factory = createActionDispatcherFactoryForTest(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        alexaService: sessionAlexa,
      };

      const dispatcher = factory([alexaDevice], sessionIoTServices);

      // Dispatch multiple actions sequentially
      await dispatcher.dispatch({ tool: 'alexa_speak', params: { message: 'first action' } });
      await dispatcher.dispatch({ tool: 'alexa_volume', params: { volume: 30 } });
      await dispatcher.dispatch({ tool: 'alexa_announcement', params: { message: 'third action' } });

      // All should use session-specific, none should use global
      expect(sessionAlexa.speak).toHaveBeenCalledTimes(1);
      expect(sessionAlexa.setVolume).toHaveBeenCalledTimes(1);
      expect(sessionAlexa.announce).toHaveBeenCalledTimes(1);
      expect(globalAlexa.speak).not.toHaveBeenCalled();
      expect(globalAlexa.setVolume).not.toHaveBeenCalled();
      expect(globalAlexa.announce).not.toHaveBeenCalled();
    });
  });

  describe('old factory pattern comparison (pre-Task 4.2)', () => {
    it('old pattern should NOT use session-specific alexaService (demonstrates the bug)', async () => {
      const globalAlexa = createMockAlexaService('global');
      const sessionAlexa = createMockAlexaService('session');

      // Old factory ignores sessionIoTServices.alexaService
      const oldFactory = createOldActionDispatcherFactory(globalAlexa);

      const sessionIoTServices: SessionIoTServices = {
        lightService: undefined,
        airconService: undefined,
        alexaService: sessionAlexa,
      };

      const dispatcher = oldFactory([alexaDevice], sessionIoTServices);

      await dispatcher.dispatch({
        tool: 'alexa_speak',
        params: { message: 'should use global (old behavior)' },
      });

      // Old pattern: global is used even when session-specific is available
      expect(globalAlexa.speak).toHaveBeenCalled();
      expect(sessionAlexa.speak).not.toHaveBeenCalled();
    });
  });
});
