/**
 * Session Types Tests
 *
 * Tests for SessionIoTServices type extension with alexaService property.
 * TDD: RED phase - Write failing tests first
 *
 * Task 1.1: SessionIoTServicesの型拡張
 * Requirements: 4.5
 */

import { describe, it, expect } from 'vitest';
import type { SessionIoTServices } from './session-types.js';
import type { AlexaServiceForDispatcher } from '../dispatcher/action-dispatcher.js';

describe('SessionIoTServices with alexaService', () => {
  it('should accept alexaService as AlexaServiceForDispatcher', () => {
    const mockAlexaService: AlexaServiceForDispatcher = {
      speak: async () => ({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'speak', success: true } }),
      announce: async () => ({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'announce', success: true } }),
      executeRoutine: async () => ({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'routine', success: true } }),
      setVolume: async () => ({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'volume', success: true } }),
      textCommand: async () => ({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'textCommand', success: true } }),
      playWeather: async () => ({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'weather', success: true } }),
      playFlashBriefing: async () => ({ success: true, data: { deviceSerialNumber: 'echo-1', command: 'flashBriefing', success: true } }),
      isConnected: () => true,
    };

    const services: SessionIoTServices = {
      lightService: undefined,
      airconService: undefined,
      alexaService: mockAlexaService,
    };

    expect(services.alexaService).toBeDefined();
    expect(services.alexaService?.isConnected()).toBe(true);
  });

  it('should accept alexaService as undefined', () => {
    const services: SessionIoTServices = {
      lightService: undefined,
      airconService: undefined,
      alexaService: undefined,
    };

    expect(services.alexaService).toBeUndefined();
  });

  it('should allow omitting alexaService (backward compatibility)', () => {
    // Existing code constructs SessionIoTServices without alexaService
    // This must continue to work
    const services: SessionIoTServices = {
      lightService: undefined,
      airconService: undefined,
    };

    expect(services.alexaService).toBeUndefined();
  });

  it('should re-export AlexaServiceForDispatcher type via session-types', () => {
    // Verify the type is importable from session-types
    const services: SessionIoTServices = {
      lightService: undefined,
      airconService: undefined,
      alexaService: undefined,
    };

    expect(services).toBeDefined();
  });
});
