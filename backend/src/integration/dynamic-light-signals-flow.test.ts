/**
 * Integration Tests: Dynamic Light Signals End-to-End Flow
 *
 * Tests the full signal dynamic flow:
 *   Device fetch -> Signal extraction -> Tool generation -> Prompt building -> Action dispatch
 *
 * Validates that user-specific light signals propagate correctly through:
 * - DeviceHandler (toDevice with signals)
 * - DynamicToolBuilder (dynamic light_control enum)
 * - ActionDispatcher break_mode (resolveRelaxSignal -> sendNamedSignal)
 * - ActionDispatcher break_mode fallback (no relax signal -> on-favorite)
 *
 * Task 5.1, Requirements: 1.1, 2.1, 3.1, 3.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDynamicToolBuilder } from '../services/dynamic-tool-builder.js';
import {
  createActionDispatcher,
  type LightService,
  type ActionDispatcherDependencies,
  type AlexaServiceForDispatcher,
} from '../dispatcher/action-dispatcher.js';
import type { AllowedDevice } from '../types/device-types.js';
import type { AgentAction } from '../types/action-types.js';
import { buildPrompt } from '../../packages/iot-ai-agent-loop/src/agent/prompt-builder.js';
import { STANDARD_LIGHT_ACTIONS, buildLightControlDeclaration } from '../tools/tool-registry.js';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockLightService(): LightService {
  return {
    control: vi.fn().mockResolvedValue({
      success: true,
      data: { applianceId: 'light-1', power: 'on' },
    }),
    sendNamedSignal: vi.fn().mockResolvedValue({
      success: true,
      data: { applianceId: 'light-1', signalName: 'test', success: true },
    }),
  };
}

function createMockAlexaService(): AlexaServiceForDispatcher {
  return {
    speak: vi.fn().mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'alexa-1', command: 'speak', success: true },
    }),
    announce: vi.fn().mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'alexa-1', command: 'announce', success: true },
    }),
    executeRoutine: vi.fn().mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'alexa-1', command: 'routine', success: true },
    }),
    setVolume: vi.fn().mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'alexa-1', command: 'volume', success: true },
    }),
    textCommand: vi.fn().mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'alexa-1', command: 'textcommand', success: true },
    }),
    playWeather: vi.fn().mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'alexa-1', command: 'weather', success: true },
    }),
    playFlashBriefing: vi.fn().mockResolvedValue({
      success: true,
      data: { deviceSerialNumber: 'alexa-1', command: 'briefing', success: true },
    }),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration: Dynamic Light Signals End-to-End Flow', () => {
  let mockLightService: LightService;
  let mockAlexaService: AlexaServiceForDispatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLightService = createMockLightService();
    mockAlexaService = createMockAlexaService();
  });

  // afterEach not needed: vitest automatically restores timers

  // ---------------------------------------------------------------------------
  // Flow 1: Signals with relax keyword -> break_mode uses sendNamedSignal
  // Requirement: 1.1, 3.1
  // ---------------------------------------------------------------------------
  describe('Flow 1: Device with relax signal -> break_mode dispatches sendNamedSignal', () => {
    it('should extract signals from AllowedDevice, generate dynamic Tool, and dispatch break_mode with correct signal', async () => {
      // Step 1: AllowedDevice with signals (simulates DeviceHandler output)
      const allowedDevices: readonly AllowedDevice[] = [
        {
          id: 'light-1',
          type: 'LIGHT',
          signals: ['安らぎ', '通常', '読書', '家事'],
        },
        { id: 'alexa-1', type: 'ALEXA' },
      ];

      // Step 2: DynamicToolBuilder generates tools with signals in enum
      const toolBuilder = createDynamicToolBuilder();
      const tools = toolBuilder.generateTools(allowedDevices);

      // Verify light_control tool has user's signals in enum
      const lightTool = tools.find((t) => t.name === 'light_control');
      expect(lightTool).toBeDefined();
      const actionParam = lightTool!.parameters?.properties?.['action'];
      expect(actionParam).toBeDefined();
      const enumValues = (actionParam as { enum?: string[] }).enum;
      expect(enumValues).toBeDefined();

      // All standard buttons should be present
      for (const standardAction of STANDARD_LIGHT_ACTIONS) {
        expect(enumValues).toContain(standardAction);
      }
      // User's custom signals should also be present
      expect(enumValues).toContain('安らぎ');
      expect(enumValues).toContain('通常');
      expect(enumValues).toContain('読書');
      expect(enumValues).toContain('家事');

      // Step 3: ActionDispatcher break_mode resolves relax signal and calls sendNamedSignal
      const deps: ActionDispatcherDependencies = {
        lightService: mockLightService,
        alexaService: mockAlexaService,
      };
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const breakAction: AgentAction = {
        tool: 'break_mode',
        params: { reason: '食事中を検出' },
      };

      // Run dispatch with fake timers to skip delays
      const dispatchPromise = dispatcher.dispatch(breakAction);
      // Advance timers past all delays (SUB_ACTION_DELAY_MS + SPEAK_WAIT_MS)
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await dispatchPromise;

      // Verify break_mode succeeded
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
      }

      // Verify sendNamedSignal was called with the resolved relax signal '安らぎ'
      expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('light-1', '安らぎ');
      // Standard control should NOT have been called (signal was found)
      expect(mockLightService.control).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 2: No relax signal -> break_mode falls back to on-favorite
  // Requirement: 3.2
  // ---------------------------------------------------------------------------
  describe('Flow 2: Device without relax signal -> break_mode falls back to on-favorite', () => {
    it('should fallback to on-favorite when no relax-intent signal exists', async () => {
      // AllowedDevice with signals but none match relax keywords
      const allowedDevices: readonly AllowedDevice[] = [
        {
          id: 'light-1',
          type: 'LIGHT',
          signals: ['通常', '読書', '家事'],
        },
      ];

      const deps: ActionDispatcherDependencies = {
        lightService: mockLightService,
      };
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const breakAction: AgentAction = {
        tool: 'break_mode',
        params: { reason: '休憩中を検出' },
      };

      const dispatchPromise = dispatcher.dispatch(breakAction);
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await dispatchPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
      }

      // sendNamedSignal should NOT have been called (no relax signal)
      expect(mockLightService.sendNamedSignal).not.toHaveBeenCalled();
      // Standard control with 'on-favorite' should have been called as fallback
      expect(mockLightService.control).toHaveBeenCalledWith('light-1', 'on-favorite');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 3: Empty signals -> break_mode falls back to on-favorite
  // Requirement: 3.2
  // ---------------------------------------------------------------------------
  describe('Flow 3: Device with empty signals -> break_mode falls back to on-favorite', () => {
    it('should fallback to on-favorite when signals array is empty', async () => {
      const allowedDevices: readonly AllowedDevice[] = [
        {
          id: 'light-1',
          type: 'LIGHT',
          signals: [],
        },
      ];

      const deps: ActionDispatcherDependencies = {
        lightService: mockLightService,
      };
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const breakAction: AgentAction = {
        tool: 'break_mode',
        params: { reason: '休憩中' },
      };

      const dispatchPromise = dispatcher.dispatch(breakAction);
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await dispatchPromise;

      expect(result.ok).toBe(true);
      expect(mockLightService.sendNamedSignal).not.toHaveBeenCalled();
      expect(mockLightService.control).toHaveBeenCalledWith('light-1', 'on-favorite');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 4: DynamicToolBuilder generates standard-only Tool when no signals
  // Requirement: 2.1
  // ---------------------------------------------------------------------------
  describe('Flow 4: DynamicToolBuilder generates standard-only Tool for LIGHT without signals', () => {
    it('should generate light_control with standard buttons only when LIGHT has no signals', () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT', signals: [] },
      ];

      const toolBuilder = createDynamicToolBuilder();
      const tools = toolBuilder.generateTools(allowedDevices);

      const lightTool = tools.find((t) => t.name === 'light_control');
      expect(lightTool).toBeDefined();

      const actionParam = lightTool!.parameters?.properties?.['action'];
      const enumValues = (actionParam as { enum?: string[] }).enum;

      // Should have exactly the standard buttons
      expect(enumValues).toHaveLength(STANDARD_LIGHT_ACTIONS.length);
      for (const standardAction of STANDARD_LIGHT_ACTIONS) {
        expect(enumValues).toContain(standardAction);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 5: Full pipeline - signals propagate from AllowedDevice to Tool enum
  //         to break_mode dispatch to sendNamedSignal
  // Requirement: 1.1, 2.1, 3.1
  // ---------------------------------------------------------------------------
  describe('Flow 5: Complete pipeline - signal propagation across components', () => {
    it('should propagate signals consistently: AllowedDevice -> Tool enum -> break_mode -> sendNamedSignal', async () => {
      const userSignals = ['くつろぎモード', '通常モード', '読書モード'];

      const allowedDevices: readonly AllowedDevice[] = [
        {
          id: 'light-1',
          type: 'LIGHT',
          signals: userSignals,
        },
        { id: 'alexa-1', type: 'ALEXA' },
      ];

      // 1. Tool generation includes user signals
      const toolBuilder = createDynamicToolBuilder();
      const tools = toolBuilder.generateTools(allowedDevices);
      const lightTool = tools.find((t) => t.name === 'light_control');
      const enumValues = (lightTool!.parameters?.properties?.['action'] as { enum?: string[] }).enum!;

      expect(enumValues).toContain('くつろぎモード');
      expect(enumValues).toContain('通常モード');
      expect(enumValues).toContain('読書モード');

      // 2. Tool description mentions custom signals
      expect(lightTool!.description).toContain('くつろぎモード');

      // 3. Prompt building includes signal info
      const lightSignals = allowedDevices.find((d) => d.type === 'LIGHT')?.signals;
      const prompt = buildPrompt(undefined, [], lightSignals);
      // The prompt should reference the relax signal for break mode
      expect(prompt).toContain('くつろぎモード');

      // 4. break_mode dispatch uses resolved signal
      const deps: ActionDispatcherDependencies = {
        lightService: mockLightService,
        alexaService: mockAlexaService,
      };
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const breakAction: AgentAction = {
        tool: 'break_mode',
        params: { reason: '食事中を検出' },
      };

      const dispatchPromise = dispatcher.dispatch(breakAction);
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await dispatchPromise;

      expect(result.ok).toBe(true);
      // 'くつろぎモード' matches keyword 'くつろぎ' -> sendNamedSignal
      expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('light-1', 'くつろぎモード');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 6: focus_mode with normal signal
  // Requirement: 3.3
  // ---------------------------------------------------------------------------
  describe('Flow 6: focus_mode resolves normal signal and uses sendNamedSignal', () => {
    it('should use sendNamedSignal with resolved normal signal for focus_mode', async () => {
      const allowedDevices: readonly AllowedDevice[] = [
        {
          id: 'light-1',
          type: 'LIGHT',
          signals: ['安らぎ', '通常', '読書'],
        },
        { id: 'alexa-1', type: 'ALEXA' },
      ];

      const deps: ActionDispatcherDependencies = {
        lightService: mockLightService,
        alexaService: mockAlexaService,
      };
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const focusAction: AgentAction = {
        tool: 'focus_mode',
        params: { reason: '作業復帰を検出' },
      };

      const dispatchPromise = dispatcher.dispatch(focusAction);
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await dispatchPromise;

      expect(result.ok).toBe(true);
      expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('light-1', '通常');
      expect(mockLightService.control).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 7: focus_mode without normal signal falls back to on-100
  // Requirement: 3.4
  // ---------------------------------------------------------------------------
  describe('Flow 7: focus_mode without normal signal falls back to on-100', () => {
    it('should fallback to on-100 when no normal-intent signal exists', async () => {
      const allowedDevices: readonly AllowedDevice[] = [
        {
          id: 'light-1',
          type: 'LIGHT',
          signals: ['安らぎ', '読書', '家事'],
        },
      ];

      const deps: ActionDispatcherDependencies = {
        lightService: mockLightService,
      };
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const focusAction: AgentAction = {
        tool: 'focus_mode',
        params: { reason: '作業復帰を検出' },
      };

      const dispatchPromise = dispatcher.dispatch(focusAction);
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await dispatchPromise;

      expect(result.ok).toBe(true);
      expect(mockLightService.sendNamedSignal).not.toHaveBeenCalled();
      expect(mockLightService.control).toHaveBeenCalledWith('light-1', 'on-100');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 8: buildLightControlDeclaration integrates correctly with signals
  // Requirement: 2.1, 2.2
  // ---------------------------------------------------------------------------
  describe('Flow 8: buildLightControlDeclaration generates correct FunctionDeclaration', () => {
    it('should build declaration with standard + custom signals and dynamic description', () => {
      const signals = ['安らぎ', '通常', '読書'];
      const declaration = buildLightControlDeclaration(signals);

      // Name
      expect(declaration.name).toBe('light_control');

      // Enum values
      const actionParam = declaration.parameters?.properties?.['action'];
      const enumValues = (actionParam as { enum?: string[] }).enum!;
      expect(enumValues).toHaveLength(STANDARD_LIGHT_ACTIONS.length + 3);
      expect(enumValues).toContain('安らぎ');
      expect(enumValues).toContain('通常');
      expect(enumValues).toContain('読書');

      // Description includes custom signal info
      expect(declaration.description).toContain('カスタムシグナル');
      expect(declaration.description).toContain('安らぎ');

      // Action description also includes custom signals
      const actionDescription = (actionParam as { description?: string }).description;
      expect(actionDescription).toContain('安らぎ: カスタムモード');
      expect(actionDescription).toContain('通常: カスタムモード');
      expect(actionDescription).toContain('読書: カスタムモード');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 9: No LIGHT device in session -> break_mode skips light control
  // Requirement: 3.5
  // ---------------------------------------------------------------------------
  describe('Flow 9: No LIGHT device -> break_mode skips light control', () => {
    it('should skip light control in break_mode when no LIGHT device exists', async () => {
      const allowedDevices: readonly AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
      ];

      const deps: ActionDispatcherDependencies = {
        lightService: mockLightService,
        alexaService: mockAlexaService,
      };
      const dispatcher = createActionDispatcher(allowedDevices, deps);

      const breakAction: AgentAction = {
        tool: 'break_mode',
        params: { reason: '食事中を検出' },
      };

      const dispatchPromise = dispatcher.dispatch(breakAction);
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await dispatchPromise;

      expect(result.ok).toBe(true);
      // Neither control nor sendNamedSignal should be called (no LIGHT device)
      expect(mockLightService.control).not.toHaveBeenCalled();
      expect(mockLightService.sendNamedSignal).not.toHaveBeenCalled();

      // Alexa should still have been called (only ALEXA device in session)
      expect(mockAlexaService.speak).toHaveBeenCalled();
    });
  });
});
