/**
 * Component Imports Tests
 *
 * Tests for verifying that package components
 * are correctly imported and re-exported for use in homeoffice-api.
 *
 * Requirements: 3.1, 4.1, 4.2, 4.5
 */
import { describe, it, expect } from 'vitest';
import {
  createAgentClient,
  isSameAction,
  isDeviceControlAction,
  createAlexaService,
  createAlexaRemoteForProxy,
  loadAlexaConfig,
  type AgentClientService,
  type ActionDispatcherService,
  type AgentAction,
  type ActionResult,
  type DeviceState,
  type AlexaService,
} from './component-imports.js';

describe('Component Imports', () => {
  describe('AgentClient exports', () => {
    it('should export createAgentClient factory function', () => {
      expect(typeof createAgentClient).toBe('function');
    });

    it('createAgentClient should accept config and return service interface', () => {
      expect(createAgentClient.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Dedup-actions exports', () => {
    it('should export isSameAction function', () => {
      expect(typeof isSameAction).toBe('function');
    });

    it('should export isDeviceControlAction function', () => {
      expect(typeof isDeviceControlAction).toBe('function');
    });

    it('isSameAction should correctly compare actions', () => {
      const action1: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      const action2: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      const action3: AgentAction = { tool: 'light_control', params: { action: 'off' } };

      expect(isSameAction(action1, action2)).toBe(true);
      expect(isSameAction(action1, action3)).toBe(false);
    });

    it('isDeviceControlAction should identify device control actions', () => {
      const lightAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      const airconAction: AgentAction = { tool: 'aircon_control', params: { temperature: 25 } };
      const doNothingAction: AgentAction = { tool: 'do_nothing', params: {} };

      expect(isDeviceControlAction(lightAction)).toBe(true);
      expect(isDeviceControlAction(airconAction)).toBe(true);
      expect(isDeviceControlAction(doNothingAction)).toBe(false);
    });
  });

  describe('AlexaService exports (Task 5.1)', () => {
    it('should export createAlexaService factory function', () => {
      expect(typeof createAlexaService).toBe('function');
    });

    it('createAlexaService should accept config parameter', () => {
      expect(createAlexaService.length).toBeGreaterThanOrEqual(1);
    });

    it('should export loadAlexaConfig function', () => {
      expect(typeof loadAlexaConfig).toBe('function');
    });

    it('loadAlexaConfig should return config result with defaults', () => {
      const result = loadAlexaConfig();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amazonPage).toBe('amazon.co.jp');
        expect(result.data.acceptLanguage).toBe('ja-JP');
        expect(typeof result.data.cookieFilePath).toBe('string');
      }
    });

    it('should export createAlexaRemoteForProxy factory function', () => {
      expect(typeof createAlexaRemoteForProxy).toBe('function');
    });

    it('createAlexaRemoteForProxy should accept config parameter', () => {
      expect(createAlexaRemoteForProxy.length).toBeGreaterThanOrEqual(1);
    });

    it('should export AlexaService type', () => {
      const mockService: AlexaService = {
        speak: async () => ({ success: true, data: { deviceSerialNumber: '', command: 'speak', success: true } }),
        announce: async () => ({ success: true, data: { deviceSerialNumber: '', command: 'announcement', success: true } }),
        getRoutines: async () => ({ success: true, data: [] }),
        executeRoutine: async () => ({ success: true, data: { deviceSerialNumber: '', command: 'routine', success: true } }),
        setVolume: async () => ({ success: true, data: { deviceSerialNumber: '', command: 'volume', success: true } }),
        playWeather: async () => ({ success: true, data: { deviceSerialNumber: '', command: 'weather', success: true } }),
        playFlashBriefing: async () => ({ success: true, data: { deviceSerialNumber: '', command: 'flashbriefing', success: true } }),
        isConnected: () => false,
      };
      expect(mockService.isConnected()).toBe(false);
    });
  });

  describe('Type exports', () => {
    it('should be able to use AgentAction type', () => {
      const action: AgentAction = { tool: 'do_nothing', params: {} };
      expect(action.tool).toBe('do_nothing');
    });

    it('should be able to use ActionResult type', () => {
      const result: ActionResult = {
        executed: true,
        nextInterval: 'normal',
        message: 'Success',
      };
      expect(result.executed).toBe(true);
    });

    it('should be able to use DeviceState type', () => {
      const state: DeviceState = {
        light: { power: 'on' },
        aircon: { temperature: '25', mode: 'cool' },
      };
      expect(state.light?.power).toBe('on');
    });
  });
});
