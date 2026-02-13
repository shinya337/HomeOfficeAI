/**
 * ActionDispatcher Tests - TV Control Extension + Dynamic Device ID
 *
 * Tests for TV control action dispatch functionality and
 * dynamic device ID retrieval from session's allowedDevices.
 * Following TDD: tests are written before implementation.
 *
 * Requirements: 5.4 (Action Dispatcher extension for TV control)
 * Requirements: 5.5, 7.1, 7.2, 7.4 (Dynamic device ID from session)
 *
 * Note: Environment variable fallback has been removed (Req 7.1, 7.2).
 * Device IDs are now always obtained from session's allowedDevices.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createActionDispatcher,
  getDeviceIdForType,
  type ActionDispatcherDependencies,
  type TvService,
  type LightService,
  type AirconService,
  type AlexaServiceForDispatcher,
} from './action-dispatcher.js';
import type { AgentAction } from '../types/action-types.js';
import type { AllowedDevice, DeviceType } from '../types/device-types.js';

// =============================================================================
// Mock Types and Helpers
// =============================================================================

function createMockTvService(): TvService {
  return {
    control: vi.fn(),
  };
}

function createMockAlexaService(): AlexaServiceForDispatcher {
  return {
    speak: vi.fn(),
    announce: vi.fn(),
    executeRoutine: vi.fn(),
    setVolume: vi.fn(),
    textCommand: vi.fn(),
    playWeather: vi.fn(),
    playFlashBriefing: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

// Test devices for use in tests
const testDevices: readonly AllowedDevice[] = [
  { id: 'test-light-id', type: 'LIGHT' },
  { id: 'test-aircon-id', type: 'AC' },
  { id: 'test-tv-id', type: 'TV' },
];

// Test devices including ALEXA
const testDevicesWithAlexa: readonly AllowedDevice[] = [
  { id: 'test-light-id', type: 'LIGHT' },
  { id: 'test-tv-id', type: 'TV' },
  { id: 'test-alexa-id', type: 'ALEXA' },
];

// =============================================================================
// tv_control Action Tests
// =============================================================================

describe('ActionDispatcher - TV Control', () => {
  let mockTvService: TvService;
  let deps: ActionDispatcherDependencies;

  beforeEach(() => {
    mockTvService = createMockTvService();
    deps = {
      tvService: mockTvService,
    };
  });

  describe('tv_control action - power', () => {
    it('should call TvService.control with power button for power on', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'test-tv-id', button: 'power', success: true },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      await dispatcher.dispatch(action);

      expect(mockTvService.control).toHaveBeenCalledWith('test-tv-id', 'power');
    });

    it('should call TvService.control with power button for power off', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'test-tv-id', button: 'power', success: true },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'off' },
      };

      await dispatcher.dispatch(action);

      expect(mockTvService.control).toHaveBeenCalledWith('test-tv-id', 'power');
    });

    it('should return executed=true and nextInterval=normal on success', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'test-tv-id', button: 'power', success: true },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
        expect(result.value.message).toContain('電源');
      }
    });
  });

  describe('tv_control action - channel', () => {
    it('should call TvService.control with channel number', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'test-tv-id', button: '5', success: true },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'channel', value: '5' },
      };

      await dispatcher.dispatch(action);

      expect(mockTvService.control).toHaveBeenCalledWith('test-tv-id', '5');
    });

    it('should return success message with channel number', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'test-tv-id', button: '8', success: true },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'channel', value: '8' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.message).toContain('チャンネル');
        expect(result.value.message).toContain('8');
      }
    });
  });

  describe('tv_control action - volume', () => {
    it('should call TvService.control with vol-up for volume up', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'test-tv-id', button: 'vol-up', success: true },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'volume', value: 'up' },
      };

      await dispatcher.dispatch(action);

      expect(mockTvService.control).toHaveBeenCalledWith('test-tv-id', 'vol-up');
    });

    it('should call TvService.control with vol-down for volume down', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'test-tv-id', button: 'vol-down', success: true },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'volume', value: 'down' },
      };

      await dispatcher.dispatch(action);

      expect(mockTvService.control).toHaveBeenCalledWith('test-tv-id', 'vol-down');
    });

    it('should return success message for volume adjustment', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'test-tv-id', button: 'vol-up', success: true },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'volume', value: 'up' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.message).toContain('音量');
      }
    });
  });

  describe('tv_control action - error handling', () => {
    it('should return IOT_ERROR when TvService returns error', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: false,
        error: { code: 'NOT_TV', message: 'テレビではありません' },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'NOT_TV',
          message: 'テレビではありません',
        });
      }
    });

    it('should return RATE_LIMIT error when rate limited', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Rate limit exceeded',
          cause: { code: 'RATE_LIMIT', message: 'Rate limit exceeded' },
        },
      });
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMIT');
      }
    });

    it('should return UNKNOWN error on unexpected exception', async () => {
      vi.mocked(mockTvService.control).mockRejectedValue(
        new Error('Unexpected error')
      );
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
      }
    });

    it('should return IOT_ERROR when no TV device in allowedDevices', async () => {
      const noTvDevices: readonly AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];
      const dispatcher = createActionDispatcher(noTvDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toContain('TV');
      }
    });

    it('should return IOT_ERROR when TvService is not provided', async () => {
      const depsWithoutTv: ActionDispatcherDependencies = {};
      const dispatcher = createActionDispatcher(testDevices, depsWithoutTv);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });
  });

  describe('continue_monitoring action', () => {
    it('should return executed=false and nextInterval=short without calling TvService', async () => {
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'continue_monitoring',
        params: {} as Record<string, never>,
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(false);
        expect(result.value.nextInterval).toBe('short');
      }
      expect(mockTvService.control).not.toHaveBeenCalled();
    });
  });

  describe('do_nothing action', () => {
    it('should return executed=false and nextInterval=normal without calling TvService', async () => {
      const dispatcher = createActionDispatcher(testDevices, deps);

      const action: AgentAction = {
        tool: 'do_nothing',
        params: {} as Record<string, never>,
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(false);
        expect(result.value.nextInterval).toBe('normal');
      }
      expect(mockTvService.control).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// getDeviceIdForType Tests
// Requirements: 5.5, 7.4 (Dynamic device ID retrieval from session)
// =============================================================================

describe('getDeviceIdForType', () => {
  describe('basic device ID lookup', () => {
    it('should return device ID for matching device type', () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];

      const result = getDeviceIdForType(allowedDevices, 'LIGHT');

      expect(result).toBe('light-001');
    });

    it('should return undefined when no matching device type', () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];

      const result = getDeviceIdForType(allowedDevices, 'TV');

      expect(result).toBeUndefined();
    });

    it('should return undefined for empty allowedDevices array', () => {
      const allowedDevices: readonly AllowedDevice[] = [];

      const result = getDeviceIdForType(allowedDevices, 'LIGHT');

      expect(result).toBeUndefined();
    });
  });

  describe('multiple devices of same type', () => {
    it('should return the first device ID when multiple devices of same type exist', () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
        { id: 'light-002', type: 'LIGHT' },
        { id: 'light-003', type: 'LIGHT' },
      ];

      const result = getDeviceIdForType(allowedDevices, 'LIGHT');

      expect(result).toBe('light-001');
    });

    it('should return first TV when multiple TVs exist', () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'tv-living', type: 'TV' },
        { id: 'tv-bedroom', type: 'TV' },
      ];

      const result = getDeviceIdForType(allowedDevices, 'TV');

      expect(result).toBe('tv-living');
    });
  });

  describe('mixed device types', () => {
    it('should return correct device ID from mixed device list', () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
        { id: 'aircon-001', type: 'AC' },
        { id: 'tv-001', type: 'TV' },
      ];

      expect(getDeviceIdForType(allowedDevices, 'LIGHT')).toBe('light-001');
      expect(getDeviceIdForType(allowedDevices, 'AC')).toBe('aircon-001');
      expect(getDeviceIdForType(allowedDevices, 'TV')).toBe('tv-001');
    });

    it('should return first matching device regardless of order in list', () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'aircon-001', type: 'AC' },
        { id: 'light-001', type: 'LIGHT' },
        { id: 'aircon-002', type: 'AC' },
        { id: 'light-002', type: 'LIGHT' },
      ];

      expect(getDeviceIdForType(allowedDevices, 'LIGHT')).toBe('light-001');
      expect(getDeviceIdForType(allowedDevices, 'AC')).toBe('aircon-001');
    });
  });

  describe('IR device type', () => {
    it('should return IR device ID', () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'ir-001', type: 'IR' },
      ];

      const result = getDeviceIdForType(allowedDevices, 'IR');

      expect(result).toBe('ir-001');
    });
  });
});

// =============================================================================
// ActionDispatcher - No Device Error Tests (Req 7.1, 7.2)
// Requirements: 7.1, 7.2 (Device IDs from session only, no fallback)
// =============================================================================

describe('ActionDispatcher - No Device Error (Req 7.1, 7.2)', () => {
  let mockTvService: TvService;
  let deps: ActionDispatcherDependencies;

  beforeEach(() => {
    mockTvService = createMockTvService();
    deps = {
      tvService: mockTvService,
    };
  });

  describe('light_control without LIGHT device', () => {
    it('should return IOT_ERROR when no LIGHT device in allowedDevices', async () => {
      const noLightDevices: readonly AllowedDevice[] = [
        { id: 'tv-001', type: 'TV' },
      ];
      const dispatcher = createActionDispatcher(noLightDevices, deps);

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toContain('照明');
      }
    });
  });

  describe('aircon_control without AC device', () => {
    it('should return IOT_ERROR when no AC device in allowedDevices', async () => {
      const noAcDevices: readonly AllowedDevice[] = [
        { id: 'tv-001', type: 'TV' },
      ];
      const dispatcher = createActionDispatcher(noAcDevices, deps);

      const action: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 25 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toContain('エアコン');
      }
    });
  });

  describe('tv_control without TV device', () => {
    it('should return IOT_ERROR when no TV device in allowedDevices', async () => {
      const noTvDevices: readonly AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];
      const dispatcher = createActionDispatcher(noTvDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toContain('TV');
      }
    });
  });

  describe('empty allowedDevices', () => {
    it('should return IOT_ERROR for any device control with empty allowedDevices', async () => {
      const emptyDevices: readonly AllowedDevice[] = [];
      const dispatcher = createActionDispatcher(emptyDevices, deps);

      const lightAction: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };
      const lightResult = await dispatcher.dispatch(lightAction);
      expect(lightResult.ok).toBe(false);

      const airconAction: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 25 },
      };
      const airconResult = await dispatcher.dispatch(airconAction);
      expect(airconResult.ok).toBe(false);

      const tvAction: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };
      const tvResult = await dispatcher.dispatch(tvAction);
      expect(tvResult.ok).toBe(false);
    });

    it('should still allow continue_monitoring with empty allowedDevices', async () => {
      const emptyDevices: readonly AllowedDevice[] = [];
      const dispatcher = createActionDispatcher(emptyDevices, deps);

      const action: AgentAction = {
        tool: 'continue_monitoring',
        params: {} as Record<string, never>,
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
    });

    it('should still allow do_nothing with empty allowedDevices', async () => {
      const emptyDevices: readonly AllowedDevice[] = [];
      const dispatcher = createActionDispatcher(emptyDevices, deps);

      const action: AgentAction = {
        tool: 'do_nothing',
        params: {} as Record<string, never>,
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
    });
  });
});

// =============================================================================
// ActionDispatcher with allowedDevices Tests
// Requirements: 5.5, 7.4 (Dynamic device ID from session)
// =============================================================================

describe('ActionDispatcher - Dynamic Device ID from Session', () => {
  let mockTvService: TvService;
  let deps: ActionDispatcherDependencies;

  beforeEach(() => {
    mockTvService = createMockTvService();
    deps = {
      tvService: mockTvService,
    };
  });

  describe('tv_control with allowedDevices', () => {
    it('should use TV device ID from allowedDevices', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'session-tv-id', button: 'power', success: true },
      });
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'session-tv-id', type: 'TV' },
      ];
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      await dispatcher.dispatch(action);

      expect(mockTvService.control).toHaveBeenCalledWith('session-tv-id', 'power');
    });

    it('should use first TV device when multiple TVs in allowedDevices', async () => {
      vi.mocked(mockTvService.control).mockResolvedValue({
        success: true,
        data: { applianceId: 'tv-first', button: 'power', success: true },
      });
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'tv-first', type: 'TV' },
        { id: 'tv-second', type: 'TV' },
      ];
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const action: AgentAction = {
        tool: 'tv_control',
        params: { action: 'power', value: 'on' },
      };

      await dispatcher.dispatch(action);

      expect(mockTvService.control).toHaveBeenCalledWith('tv-first', 'power');
    });
  });

  describe('light_control with allowedDevices', () => {
    it('should use light device ID from allowedDevices in success message', async () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'session-light-id', type: 'LIGHT' },
      ];
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const action: AgentAction = {
        tool: 'light_control',
        params: { action: 'on' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toContain('session-light-id');
      }
    });
  });

  describe('aircon_control with allowedDevices', () => {
    it('should use AC device ID from allowedDevices in success message', async () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'session-aircon-id', type: 'AC' },
      ];
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const action: AgentAction = {
        tool: 'aircon_control',
        params: { temperature: 25 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toContain('session-aircon-id');
      }
    });
  });
});

// =============================================================================
// ActionDispatcher - Alexa Action Dispatch Tests (Req 9.1-9.5, 10.4, 11.5)
// Task 4.2: 5 Alexa actions dispatch cases
// =============================================================================

describe('ActionDispatcher - Alexa Actions', () => {
  let mockAlexaService: AlexaServiceForDispatcher;
  let deps: ActionDispatcherDependencies;

  beforeEach(() => {
    mockAlexaService = createMockAlexaService();
    deps = {
      alexaService: mockAlexaService,
    };
  });

  // ---------------------------------------------------------------------------
  // alexa_speak dispatch
  // ---------------------------------------------------------------------------

  describe('alexa_speak action', () => {
    it('should call AlexaService.speak with device ID and message on success', async () => {
      vi.mocked(mockAlexaService.speak).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'こんにちは' },
      };

      await dispatcher.dispatch(action);

      expect(mockAlexaService.speak).toHaveBeenCalledWith('test-alexa-id', 'こんにちは');
    });

    it('should return executed=true and nextInterval=normal on success', async () => {
      vi.mocked(mockAlexaService.speak).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
        expect(result.value.message).toContain('speak');
      }
    });

    it('should return IOT_ERROR when no ALEXA device in allowedDevices', async () => {
      const noAlexaDevices: readonly AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];
      const dispatcher = createActionDispatcher(noAlexaDevices, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toContain('Alexa');
      }
    });

    it('should return IOT_ERROR when AlexaService is not provided', async () => {
      const depsWithoutAlexa: ActionDispatcherDependencies = {};
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, depsWithoutAlexa);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should return IOT_ERROR when AlexaService returns error', async () => {
      vi.mocked(mockAlexaService.speak).mockResolvedValue({
        success: false,
        error: { code: 'ALEXA_ERROR', message: 'Alexa operation failed' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // alexa_announcement dispatch
  // ---------------------------------------------------------------------------

  describe('alexa_announcement action', () => {
    it('should call AlexaService.announce with device ID and message on success', async () => {
      vi.mocked(mockAlexaService.announce).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'announcement', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_announcement',
        params: { message: 'お知らせです' },
      };

      await dispatcher.dispatch(action);

      expect(mockAlexaService.announce).toHaveBeenCalledWith('test-alexa-id', 'お知らせです');
    });

    it('should return executed=true and nextInterval=normal on success', async () => {
      vi.mocked(mockAlexaService.announce).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'announcement', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_announcement',
        params: { message: 'お知らせです' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
        expect(result.value.message).toContain('announcement');
      }
    });

    it('should return IOT_ERROR when no ALEXA device in allowedDevices', async () => {
      const noAlexaDevices: readonly AllowedDevice[] = [];
      const dispatcher = createActionDispatcher(noAlexaDevices, deps);

      const action: AgentAction = {
        tool: 'alexa_announcement',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should return IOT_ERROR when AlexaService is not provided', async () => {
      const depsWithoutAlexa: ActionDispatcherDependencies = {};
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, depsWithoutAlexa);

      const action: AgentAction = {
        tool: 'alexa_announcement',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should map AlexaService error to ActionDispatchError', async () => {
      vi.mocked(mockAlexaService.announce).mockResolvedValue({
        success: false,
        error: { code: 'TIMEOUT', message: 'Alexa API timed out' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_announcement',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'TIMEOUT',
          message: 'Alexa API timed out',
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // alexa_routine dispatch
  // ---------------------------------------------------------------------------

  describe('alexa_routine action', () => {
    it('should call AlexaService.executeRoutine with routine name on success', async () => {
      vi.mocked(mockAlexaService.executeRoutine).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: '', command: 'routine', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: '朝のルーティン' },
      };

      await dispatcher.dispatch(action);

      expect(mockAlexaService.executeRoutine).toHaveBeenCalledWith('朝のルーティン');
    });

    it('should return executed=true and nextInterval=normal on success', async () => {
      vi.mocked(mockAlexaService.executeRoutine).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: '', command: 'routine', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: '朝のルーティン' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
        expect(result.value.message).toContain('routine');
      }
    });

    it('should return IOT_ERROR when no ALEXA device in allowedDevices', async () => {
      const noAlexaDevices: readonly AllowedDevice[] = [
        { id: 'tv-001', type: 'TV' },
      ];
      const dispatcher = createActionDispatcher(noAlexaDevices, deps);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should return IOT_ERROR when AlexaService is not provided', async () => {
      const depsWithoutAlexa: ActionDispatcherDependencies = {};
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, depsWithoutAlexa);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should map ROUTINE_NOT_FOUND error from AlexaService', async () => {
      vi.mocked(mockAlexaService.executeRoutine).mockResolvedValue({
        success: false,
        error: { code: 'ROUTINE_NOT_FOUND', message: 'Routine not found: テスト' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'ROUTINE_NOT_FOUND',
          message: 'Routine not found: テスト',
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // alexa_volume dispatch
  // ---------------------------------------------------------------------------

  describe('alexa_volume action', () => {
    it('should call AlexaService.setVolume with device ID and volume on success', async () => {
      vi.mocked(mockAlexaService.setVolume).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'volume', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 50 },
      };

      await dispatcher.dispatch(action);

      expect(mockAlexaService.setVolume).toHaveBeenCalledWith('test-alexa-id', 50);
    });

    it('should return executed=true and nextInterval=normal on success', async () => {
      vi.mocked(mockAlexaService.setVolume).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'volume', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 30 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
        expect(result.value.message).toContain('音量');
      }
    });

    it('should return IOT_ERROR when no ALEXA device in allowedDevices', async () => {
      const noAlexaDevices: readonly AllowedDevice[] = [];
      const dispatcher = createActionDispatcher(noAlexaDevices, deps);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 50 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should return IOT_ERROR when AlexaService is not provided', async () => {
      const depsWithoutAlexa: ActionDispatcherDependencies = {};
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, depsWithoutAlexa);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 50 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should map VOLUME_OUT_OF_RANGE error from AlexaService', async () => {
      vi.mocked(mockAlexaService.setVolume).mockResolvedValue({
        success: false,
        error: { code: 'VOLUME_OUT_OF_RANGE', message: 'Volume must be between 0 and 100' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 150 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'VOLUME_OUT_OF_RANGE',
          message: 'Volume must be between 0 and 100',
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // alexa_info dispatch
  // ---------------------------------------------------------------------------

  describe('alexa_info action - weather', () => {
    it('should call AlexaService.playWeather with device ID for weather type', async () => {
      vi.mocked(mockAlexaService.playWeather).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'weather', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'weather' },
      };

      await dispatcher.dispatch(action);

      expect(mockAlexaService.playWeather).toHaveBeenCalledWith('test-alexa-id');
    });

    it('should return executed=true and nextInterval=normal on weather success', async () => {
      vi.mocked(mockAlexaService.playWeather).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'weather', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'weather' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
        expect(result.value.message).toContain('天気');
      }
    });
  });

  describe('alexa_info action - flashbriefing', () => {
    it('should call AlexaService.playFlashBriefing with device ID for flashbriefing type', async () => {
      vi.mocked(mockAlexaService.playFlashBriefing).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'flashbriefing', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'flashbriefing' },
      };

      await dispatcher.dispatch(action);

      expect(mockAlexaService.playFlashBriefing).toHaveBeenCalledWith('test-alexa-id');
    });

    it('should return executed=true and nextInterval=normal on flashbriefing success', async () => {
      vi.mocked(mockAlexaService.playFlashBriefing).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'flashbriefing', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'flashbriefing' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
        expect(result.value.message).toContain('フラッシュブリーフィング');
      }
    });
  });

  describe('alexa_info action - error handling', () => {
    it('should return IOT_ERROR when no ALEXA device in allowedDevices', async () => {
      const noAlexaDevices: readonly AllowedDevice[] = [];
      const dispatcher = createActionDispatcher(noAlexaDevices, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'weather' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should return IOT_ERROR when AlexaService is not provided', async () => {
      const depsWithoutAlexa: ActionDispatcherDependencies = {};
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, depsWithoutAlexa);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'weather' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
      }
    });

    it('should map AlexaService error for weather to ActionDispatchError', async () => {
      vi.mocked(mockAlexaService.playWeather).mockResolvedValue({
        success: false,
        error: { code: 'ALEXA_ERROR', message: 'Weather command failed' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'weather' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Alexa actions with unexpected exceptions
  // ---------------------------------------------------------------------------

  describe('alexa actions - unexpected exceptions', () => {
    it('should return UNKNOWN error when AlexaService throws unexpectedly', async () => {
      vi.mocked(mockAlexaService.speak).mockRejectedValue(
        new Error('Unexpected Alexa crash')
      );
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
        expect(result.error.message).toContain('Unexpected Alexa crash');
      }
    });
  });
});

// =============================================================================
// Task 4.3: ActionDispatcher Alexa Cases - Comprehensive Unit Tests
// Requirements: 9.3, 9.4, 9.5, 11.5
// Tests NOT covered by task 4.2: cross-action error codes, flashbriefing error,
// unexpected exceptions for non-speak actions, AUTH_ERROR/TIMEOUT mapping,
// success message content verification, error structure completeness
// =============================================================================

describe('ActionDispatcher - Alexa Cases Comprehensive (Task 4.3)', () => {
  let mockAlexaService: AlexaServiceForDispatcher;
  let deps: ActionDispatcherDependencies;

  beforeEach(() => {
    mockAlexaService = createMockAlexaService();
    deps = {
      alexaService: mockAlexaService,
    };
  });

  // ---------------------------------------------------------------------------
  // Req 9.5 / 11.5: Error code mapping across all Alexa actions
  // Verify that various AlexaService error codes (AUTH_ERROR, TIMEOUT,
  // ALEXA_ERROR) are consistently mapped to IOT_ERROR with originalError
  // ---------------------------------------------------------------------------

  describe('error code mapping - AUTH_ERROR (Req 11.5)', () => {
    it('should map AUTH_ERROR from alexa_speak to IOT_ERROR with originalError', async () => {
      vi.mocked(mockAlexaService.speak).mockResolvedValue({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Cookie expired, re-authentication required' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toBe('Cookie expired, re-authentication required');
        expect(result.error.originalError).toEqual({
          code: 'AUTH_ERROR',
          message: 'Cookie expired, re-authentication required',
        });
      }
    });

    it('should map AUTH_ERROR from alexa_routine to IOT_ERROR', async () => {
      vi.mocked(mockAlexaService.executeRoutine).mockResolvedValue({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: 'テストルーティン' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'AUTH_ERROR',
          message: 'Authentication failed',
        });
      }
    });

    it('should map AUTH_ERROR from alexa_volume to IOT_ERROR', async () => {
      vi.mocked(mockAlexaService.setVolume).mockResolvedValue({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Cookie invalid' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 50 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'AUTH_ERROR',
          message: 'Cookie invalid',
        });
      }
    });
  });

  describe('error code mapping - TIMEOUT (Req 11.5)', () => {
    it('should map TIMEOUT from alexa_speak to IOT_ERROR', async () => {
      vi.mocked(mockAlexaService.speak).mockResolvedValue({
        success: false,
        error: { code: 'TIMEOUT', message: 'Alexa API timed out for speak' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'タイムアウトテスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'TIMEOUT',
          message: 'Alexa API timed out for speak',
        });
      }
    });

    it('should map TIMEOUT from alexa_volume to IOT_ERROR', async () => {
      vi.mocked(mockAlexaService.setVolume).mockResolvedValue({
        success: false,
        error: { code: 'TIMEOUT', message: 'Volume command timed out' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 75 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'TIMEOUT',
          message: 'Volume command timed out',
        });
      }
    });
  });

  describe('error code mapping - ALEXA_ERROR (Req 11.5)', () => {
    it('should map ALEXA_ERROR from alexa_announcement to IOT_ERROR with full structure', async () => {
      vi.mocked(mockAlexaService.announce).mockResolvedValue({
        success: false,
        error: { code: 'ALEXA_ERROR', message: 'Announcement command failed unexpectedly' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_announcement',
        params: { message: 'エラーテスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toBe('Announcement command failed unexpectedly');
        expect(result.error.originalError).toEqual({
          code: 'ALEXA_ERROR',
          message: 'Announcement command failed unexpectedly',
        });
      }
    });

    it('should map ALEXA_ERROR from alexa_routine to IOT_ERROR', async () => {
      vi.mocked(mockAlexaService.executeRoutine).mockResolvedValue({
        success: false,
        error: { code: 'ALEXA_ERROR', message: 'Routine execution failed' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: '朝のBGM' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'ALEXA_ERROR',
          message: 'Routine execution failed',
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Req 9.5 / 11.5: flashbriefing error mapping (not covered by 4.2)
  // ---------------------------------------------------------------------------

  describe('alexa_info flashbriefing error mapping (Req 9.5)', () => {
    it('should map AlexaService error for flashbriefing to ActionDispatchError', async () => {
      vi.mocked(mockAlexaService.playFlashBriefing).mockResolvedValue({
        success: false,
        error: { code: 'ALEXA_ERROR', message: 'Flash briefing playback failed' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'flashbriefing' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'ALEXA_ERROR',
          message: 'Flash briefing playback failed',
        });
      }
    });

    it('should map TIMEOUT for flashbriefing to IOT_ERROR', async () => {
      vi.mocked(mockAlexaService.playFlashBriefing).mockResolvedValue({
        success: false,
        error: { code: 'TIMEOUT', message: 'Briefing request timed out' },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'flashbriefing' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.originalError).toEqual({
          code: 'TIMEOUT',
          message: 'Briefing request timed out',
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Req 9.3: AlexaService未設定時のIOT_ERROR (info actions - more complete)
  // ---------------------------------------------------------------------------

  describe('AlexaService not provided - alexa_info flashbriefing (Req 9.3)', () => {
    it('should return IOT_ERROR when AlexaService is not provided for flashbriefing', async () => {
      const depsWithoutAlexa: ActionDispatcherDependencies = {};
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, depsWithoutAlexa);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'flashbriefing' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toContain('Alexaサービス');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Req 9.3: Device not allowed - alexa_info flashbriefing
  // ---------------------------------------------------------------------------

  describe('ALEXA device not allowed - alexa_info flashbriefing (Req 9.3)', () => {
    it('should return IOT_ERROR when no ALEXA device for flashbriefing', async () => {
      const noAlexaDevices: readonly AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];
      const dispatcher = createActionDispatcher(noAlexaDevices, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'flashbriefing' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toContain('Alexa');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Req 9.4: Success message content verification (more detailed)
  // ---------------------------------------------------------------------------

  describe('success message content (Req 9.4)', () => {
    it('should include message text in alexa_speak success message', async () => {
      vi.mocked(mockAlexaService.speak).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: '朝のご挨拶です' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toContain('朝のご挨拶です');
        expect(result.value.message).toContain('test-alexa-id');
      }
    });

    it('should include message text in alexa_announcement success message', async () => {
      vi.mocked(mockAlexaService.announce).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'announcement', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_announcement',
        params: { message: '重要なお知らせ' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toContain('重要なお知らせ');
        expect(result.value.message).toContain('test-alexa-id');
      }
    });

    it('should include routine name in alexa_routine success message', async () => {
      vi.mocked(mockAlexaService.executeRoutine).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: '', command: 'routine', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: '朝のBGM' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toContain('朝のBGM');
        expect(result.value.message).toContain('routine');
      }
    });

    it('should include volume value and device ID in alexa_volume success message', async () => {
      vi.mocked(mockAlexaService.setVolume).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'volume', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 42 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toContain('42');
        expect(result.value.message).toContain('test-alexa-id');
      }
    });

    it('should include device ID in alexa_info weather success message', async () => {
      vi.mocked(mockAlexaService.playWeather).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'weather', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'weather' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toContain('test-alexa-id');
        expect(result.value.message).toContain('天気');
      }
    });

    it('should include device ID in alexa_info flashbriefing success message', async () => {
      vi.mocked(mockAlexaService.playFlashBriefing).mockResolvedValue({
        success: true,
        data: { deviceSerialNumber: 'test-alexa-id', command: 'flashbriefing', success: true },
      });
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'flashbriefing' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toContain('test-alexa-id');
        expect(result.value.message).toContain('フラッシュブリーフィング');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Unexpected exceptions for non-speak Alexa actions
  // ---------------------------------------------------------------------------

  describe('unexpected exceptions for all Alexa actions', () => {
    it('should return UNKNOWN when alexa_announcement throws', async () => {
      vi.mocked(mockAlexaService.announce).mockRejectedValue(
        new Error('Announce crash')
      );
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_announcement',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
        expect(result.error.message).toContain('Announce crash');
      }
    });

    it('should return UNKNOWN when alexa_routine throws', async () => {
      vi.mocked(mockAlexaService.executeRoutine).mockRejectedValue(
        new Error('Routine crash')
      );
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_routine',
        params: { routine_name: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
        expect(result.error.message).toContain('Routine crash');
      }
    });

    it('should return UNKNOWN when alexa_volume throws', async () => {
      vi.mocked(mockAlexaService.setVolume).mockRejectedValue(
        new Error('Volume crash')
      );
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_volume',
        params: { volume: 50 },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
        expect(result.error.message).toContain('Volume crash');
      }
    });

    it('should return UNKNOWN when alexa_info weather throws', async () => {
      vi.mocked(mockAlexaService.playWeather).mockRejectedValue(
        new Error('Weather crash')
      );
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'weather' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
        expect(result.error.message).toContain('Weather crash');
      }
    });

    it('should return UNKNOWN when alexa_info flashbriefing throws', async () => {
      vi.mocked(mockAlexaService.playFlashBriefing).mockRejectedValue(
        new Error('Briefing crash')
      );
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_info',
        params: { info_type: 'flashbriefing' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
        expect(result.error.message).toContain('Briefing crash');
      }
    });

    it('should handle non-Error thrown objects gracefully', async () => {
      vi.mocked(mockAlexaService.speak).mockRejectedValue('string error');
      const dispatcher = createActionDispatcher(testDevicesWithAlexa, deps);

      const action: AgentAction = {
        tool: 'alexa_speak',
        params: { message: 'テスト' },
      };

      const result = await dispatcher.dispatch(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
        expect(result.error.message).toBe('Unknown error');
      }
    });
  });
});

// =============================================================================
// ActionDispatcher - break_mode Tests
// =============================================================================

function createMockLightService(): LightService {
  return {
    control: vi.fn(),
    sendNamedSignal: vi.fn(),
  };
}

describe('ActionDispatcher - break_mode', () => {
  const allDevices: readonly AllowedDevice[] = [
    { id: 'test-light-id', type: 'LIGHT' },
    { id: 'test-alexa-id', type: 'ALEXA' },
  ];

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should execute all 3 sub-actions when light and alexa are available', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockLight.sendNamedSignal).mockResolvedValue({
      success: true,
      data: { applianceId: 'test-light-id', signalName: '安らぎ', success: true },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'break_mode',
      params: { reason: '食事中を検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.nextInterval).toBe('normal');
      expect(result.value.message).toBe('食事中を検出');
    }
    expect(mockLight.sendNamedSignal).toHaveBeenCalledWith('test-light-id', '安らぎ');
    expect(mockAlexa.speak).toHaveBeenCalledWith('test-alexa-id', '休憩モードに切り替えます。ごゆっくりどうぞ。');
    expect(mockAlexa.textCommand).toHaveBeenCalledWith('test-alexa-id', 'リラックスの音楽をかけて');
  });

  it('should execute only alexa sub-actions when no light device', async () => {
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });

    const alexaOnlyDevices: readonly AllowedDevice[] = [
      { id: 'test-alexa-id', type: 'ALEXA' },
    ];
    const dispatcher = createActionDispatcher(alexaOnlyDevices, {
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'break_mode',
      params: { reason: '休憩中' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('休憩中');
    }
    expect(mockAlexa.speak).toHaveBeenCalled();
    expect(mockAlexa.textCommand).toHaveBeenCalled();
  });

  it('should execute only light sub-action when no alexa device', async () => {
    const mockLight = createMockLightService();
    vi.mocked(mockLight.sendNamedSignal).mockResolvedValue({
      success: true,
      data: { applianceId: 'test-light-id', signalName: '安らぎ', success: true },
    });

    const lightOnlyDevices: readonly AllowedDevice[] = [
      { id: 'test-light-id', type: 'LIGHT' },
    ];
    const dispatcher = createActionDispatcher(lightOnlyDevices, {
      lightService: mockLight,
    });

    const action: AgentAction = {
      tool: 'break_mode',
      params: { reason: '休憩中' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('休憩中');
    }
    expect(mockLight.sendNamedSignal).toHaveBeenCalledWith('test-light-id', '安らぎ');
  });

  it('should return success with reason message when no devices available', async () => {
    const emptyDevices: readonly AllowedDevice[] = [];
    const dispatcher = createActionDispatcher(emptyDevices, {});

    const action: AgentAction = {
      tool: 'break_mode',
      params: { reason: '休憩中' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('休憩中');
    }
  });

  it('should use default message when no reason provided', async () => {
    const emptyDevices: readonly AllowedDevice[] = [];
    const dispatcher = createActionDispatcher(emptyDevices, {});

    const action: AgentAction = {
      tool: 'break_mode',
      params: {},
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe('休憩モードを開始しました');
    }
  });

  it('should handle partial failure (light fails, alexa succeeds)', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockLight.sendNamedSignal).mockResolvedValue({
      success: false,
      error: { code: 'IOT_ERROR', message: '照明通信エラー' },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'break_mode',
      params: { reason: '休憩中' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      // message はreason のみ（実行詳細はconsole.logへ）
      expect(result.value.message).toBe('休憩中');
    }
    // Alexa sub-actions should still execute
    expect(mockAlexa.speak).toHaveBeenCalled();
    expect(mockAlexa.textCommand).toHaveBeenCalled();
  });

  it('should handle light exception gracefully', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockLight.sendNamedSignal).mockRejectedValue(new Error('Light crash'));
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'break_mode',
      params: {},
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('休憩モードを開始しました');
    }
    // Alexa sub-actions should still execute despite light crash
    expect(mockAlexa.speak).toHaveBeenCalled();
    expect(mockAlexa.textCommand).toHaveBeenCalled();
  });
});

// =============================================================================
// ActionDispatcher - focus_mode Tests
// =============================================================================

describe('ActionDispatcher - focus_mode', () => {
  const allDevices: readonly AllowedDevice[] = [
    { id: 'test-light-id', type: 'LIGHT' },
    { id: 'test-alexa-id', type: 'ALEXA' },
  ];

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should execute all 3 sub-actions when light and alexa are available', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockLight.sendNamedSignal).mockResolvedValue({
      success: true,
      data: { applianceId: 'test-light-id', signalName: '通常', success: true },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'focus_mode',
      params: { reason: '作業開始を検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.nextInterval).toBe('normal');
      expect(result.value.message).toBe('作業開始を検出');
    }
    expect(mockLight.sendNamedSignal).toHaveBeenCalledWith('test-light-id', '通常');
    expect(mockAlexa.speak).toHaveBeenCalledWith('test-alexa-id', '集中モードに切り替えます。');
    expect(mockAlexa.textCommand).toHaveBeenCalledWith('test-alexa-id', '集中できるジャズをかけて');
  });

  it('should execute only alexa sub-actions when no light device', async () => {
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });

    const alexaOnlyDevices: readonly AllowedDevice[] = [
      { id: 'test-alexa-id', type: 'ALEXA' },
    ];
    const dispatcher = createActionDispatcher(alexaOnlyDevices, {
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'focus_mode',
      params: { reason: '作業復帰' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('作業復帰');
    }
    expect(mockAlexa.speak).toHaveBeenCalled();
    expect(mockAlexa.textCommand).toHaveBeenCalled();
  });

  it('should return success with reason message when no devices available', async () => {
    const emptyDevices: readonly AllowedDevice[] = [];
    const dispatcher = createActionDispatcher(emptyDevices, {});

    const action: AgentAction = {
      tool: 'focus_mode',
      params: { reason: '作業開始' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('作業開始');
    }
  });

  it('should handle partial failure (light fails, alexa succeeds)', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockLight.sendNamedSignal).mockResolvedValue({
      success: false,
      error: { code: 'IOT_ERROR', message: '照明通信エラー' },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'focus_mode',
      params: { reason: '作業復帰' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('作業復帰');
    }
    expect(mockAlexa.speak).toHaveBeenCalled();
    expect(mockAlexa.textCommand).toHaveBeenCalled();
  });
});

// =============================================================================
// ActionDispatcher - away_mode Tests
// =============================================================================

function createMockAirconService(): AirconService {
  return {
    setTemperature: vi.fn(),
    powerOff: vi.fn(),
  };
}

describe('ActionDispatcher - away_mode', () => {
  const allDevices: readonly AllowedDevice[] = [
    { id: 'test-light-id', type: 'LIGHT' },
    { id: 'test-aircon-id', type: 'AC' },
    { id: 'test-alexa-id', type: 'ALEXA' },
  ];

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should execute all 4 sub-actions when light, alexa, and aircon are available', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    const mockAircon = createMockAirconService();
    vi.mocked(mockLight.control).mockResolvedValue({
      success: true,
      data: { applianceId: 'test-light-id', power: 'off' },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });
    vi.mocked(mockAircon.powerOff).mockResolvedValue({
      success: true,
      data: { applianceId: 'test-aircon-id' },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
      airconService: mockAircon,
    });

    const action: AgentAction = {
      tool: 'away_mode',
      params: { reason: '離席を検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.nextInterval).toBe('normal');
      expect(result.value.message).toBe('離席を検出');
    }
    expect(mockLight.control).toHaveBeenCalledWith('test-light-id', 'off');
    expect(mockAlexa.speak).toHaveBeenCalledWith('test-alexa-id', '離席モードに切り替えます。');
    expect(mockAlexa.textCommand).toHaveBeenCalledWith('test-alexa-id', '音楽を止めて');
    expect(mockAircon.powerOff).toHaveBeenCalledWith('test-aircon-id');
  });

  it('should skip missing services and still succeed (partial execution)', async () => {
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });

    const alexaOnlyDevices: readonly AllowedDevice[] = [
      { id: 'test-alexa-id', type: 'ALEXA' },
    ];
    const dispatcher = createActionDispatcher(alexaOnlyDevices, {
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'away_mode',
      params: { reason: '離席中' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('離席中');
    }
    expect(mockAlexa.speak).toHaveBeenCalled();
    expect(mockAlexa.textCommand).toHaveBeenCalled();
  });

  it('should return success when no devices are available', async () => {
    const emptyDevices: readonly AllowedDevice[] = [];
    const dispatcher = createActionDispatcher(emptyDevices, {});

    const action: AgentAction = {
      tool: 'away_mode',
      params: { reason: '離席中' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('離席中');
    }
  });

  it('should use default message when no reason provided', async () => {
    const emptyDevices: readonly AllowedDevice[] = [];
    const dispatcher = createActionDispatcher(emptyDevices, {});

    const action: AgentAction = {
      tool: 'away_mode',
      params: {},
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe('離席モードを開始しました');
    }
  });

  it('should handle partial failure (light fails, alexa and aircon succeed)', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    const mockAircon = createMockAirconService();
    vi.mocked(mockLight.control).mockResolvedValue({
      success: false,
      error: { code: 'IOT_ERROR', message: '照明通信エラー' },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });
    vi.mocked(mockAircon.powerOff).mockResolvedValue({
      success: true,
      data: { applianceId: 'test-aircon-id' },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
      airconService: mockAircon,
    });

    const action: AgentAction = {
      tool: 'away_mode',
      params: { reason: '離席中' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('離席中');
    }
    // Alexa and aircon should still execute despite light failure
    expect(mockAlexa.speak).toHaveBeenCalled();
    expect(mockAlexa.textCommand).toHaveBeenCalled();
    expect(mockAircon.powerOff).toHaveBeenCalled();
  });

  it('should handle aircon exception gracefully', async () => {
    const mockAircon = createMockAirconService();
    vi.mocked(mockAircon.powerOff).mockRejectedValue(new Error('Aircon crash'));

    const airconOnlyDevices: readonly AllowedDevice[] = [
      { id: 'test-aircon-id', type: 'AC' },
    ];
    const dispatcher = createActionDispatcher(airconOnlyDevices, {
      airconService: mockAircon,
    });

    const action: AgentAction = {
      tool: 'away_mode',
      params: {},
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('離席モードを開始しました');
    }
  });
});

// =============================================================================
// ActionDispatcher - wake_mode Tests
// =============================================================================

describe('ActionDispatcher - wake_mode', () => {
  const allDevices: readonly AllowedDevice[] = [
    { id: 'test-light-id', type: 'LIGHT' },
    { id: 'test-alexa-id', type: 'ALEXA' },
  ];

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should execute all sub-actions (Phase 1 + 2min wait + Phase 2)', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockLight.control).mockResolvedValue({
      success: true,
      data: { applianceId: 'test-light-id', power: 'off' },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'wake_mode',
      params: { reason: '居眠りを3回連続確認' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(150_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.nextInterval).toBe('normal');
      expect(result.value.message).toBe('居眠りを3回連続確認');
    }

    // Phase 1: light off, BGM stop, nap announce
    expect(mockLight.control).toHaveBeenCalledWith('test-light-id', 'off');
    expect(mockAlexa.textCommand).toHaveBeenCalledWith('test-alexa-id', '音楽を止めて');
    expect(mockAlexa.speak).toHaveBeenCalledWith('test-alexa-id', '仮眠モードに入ります。2分後に起こします。');

    // Phase 2: light on-100, wake announce, wake BGM
    expect(mockLight.control).toHaveBeenCalledWith('test-light-id', 'on-100');
    expect(mockAlexa.speak).toHaveBeenCalledWith('test-alexa-id', '起きてストレッチしましょう。');
    expect(mockAlexa.textCommand).toHaveBeenCalledWith('test-alexa-id', '元気が出る音楽をかけて');
  });

  it('should execute only alexa sub-actions when no light device', async () => {
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });

    const alexaOnlyDevices: readonly AllowedDevice[] = [
      { id: 'test-alexa-id', type: 'ALEXA' },
    ];
    const dispatcher = createActionDispatcher(alexaOnlyDevices, {
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'wake_mode',
      params: { reason: '居眠り検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(150_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('居眠り検出');
    }
    expect(mockAlexa.speak).toHaveBeenCalled();
    expect(mockAlexa.textCommand).toHaveBeenCalled();
  });

  it('should execute only light sub-actions when no alexa device', async () => {
    const mockLight = createMockLightService();
    vi.mocked(mockLight.control).mockResolvedValue({
      success: true,
      data: { applianceId: 'test-light-id', power: 'off' },
    });

    const lightOnlyDevices: readonly AllowedDevice[] = [
      { id: 'test-light-id', type: 'LIGHT' },
    ];
    const dispatcher = createActionDispatcher(lightOnlyDevices, {
      lightService: mockLight,
    });

    const action: AgentAction = {
      tool: 'wake_mode',
      params: { reason: '居眠り検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(150_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('居眠り検出');
    }
    // Phase 1: off, Phase 2: on-100
    expect(mockLight.control).toHaveBeenCalledWith('test-light-id', 'off');
    expect(mockLight.control).toHaveBeenCalledWith('test-light-id', 'on-100');
  });

  it('should return success when no devices are available', async () => {
    const emptyDevices: readonly AllowedDevice[] = [];
    const dispatcher = createActionDispatcher(emptyDevices, {});

    const action: AgentAction = {
      tool: 'wake_mode',
      params: { reason: '居眠り検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(150_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('居眠り検出');
    }
  });

  it('should use default message when no reason provided', async () => {
    const emptyDevices: readonly AllowedDevice[] = [];
    const dispatcher = createActionDispatcher(emptyDevices, {});

    const action: AgentAction = {
      tool: 'wake_mode',
      params: {},
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(150_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe('覚醒モードを開始しました');
    }
  });

  it('should handle partial failure (Phase 1 light fails, Phase 2 continues)', async () => {
    const mockLight = createMockLightService();
    const mockAlexa = createMockAlexaService();
    vi.mocked(mockLight.control).mockResolvedValueOnce({
      success: false,
      error: { code: 'IOT_ERROR', message: '照明通信エラー' },
    }).mockResolvedValueOnce({
      success: true,
      data: { applianceId: 'test-light-id', power: 'on' },
    });
    vi.mocked(mockAlexa.textCommand).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'textcommand', success: true },
    });
    vi.mocked(mockAlexa.speak).mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'test-alexa-id', command: 'speak', success: true },
    });

    const dispatcher = createActionDispatcher(allDevices, {
      lightService: mockLight,
      alexaService: mockAlexa,
    });

    const action: AgentAction = {
      tool: 'wake_mode',
      params: { reason: '居眠り検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(150_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toBe('居眠り検出');
    }
    // Phase 2 should still execute despite Phase 1 light failure
    expect(mockAlexa.speak).toHaveBeenCalledWith('test-alexa-id', '起きてストレッチしましょう。');
    expect(mockAlexa.textCommand).toHaveBeenCalledWith('test-alexa-id', '元気が出る音楽をかけて');
  });
});
