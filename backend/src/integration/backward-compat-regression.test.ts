/**
 * Backward Compatibility Regression Tests
 *
 * Validates that existing users with light presets (安らぎ, 通常, 読書, 家事) continue
 * to experience the same behavior after dynamic light signal changes.
 *
 * Covers:
 * - break_mode with existing 安らぎ signal (Req 5.1)
 * - focus_mode with existing 通常 signal (Req 5.2)
 * - light_control dispatch with custom signal -> sendNamedSignal (Req 5.3)
 * - light_control dispatch with standard buttons -> control (existing behavior)
 * - DynamicToolBuilder generates correct enum with existing presets
 * - PromptBuilder includes existing signal names in prompt
 *
 * Task 5.2, Requirements: 5.1, 5.2, 5.3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createActionDispatcher,
  type LightService,
  type ActionDispatcherDependencies,
  type AlexaServiceForDispatcher,
} from '../dispatcher/action-dispatcher.js';
import { createDynamicToolBuilder } from '../services/dynamic-tool-builder.js';
import type { AllowedDevice } from '../types/device-types.js';
import type { AgentAction } from '../types/action-types.js';
import { buildPrompt } from '../../packages/iot-ai-agent-loop/src/agent/prompt-builder.js';
import { STANDARD_LIGHT_ACTIONS, buildLightControlDeclaration } from '../tools/tool-registry.js';
import { resolveRelaxSignal, resolveNormalSignal, signalToLabel } from '../services/signal-resolver.js';

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
// Existing user's device configuration (pre-dynamic-signals era)
// =============================================================================

/** Typical existing user: light with 安らぎ, 通常, 読書, 家事 signals */
const EXISTING_USER_DEVICES: readonly AllowedDevice[] = [
  {
    id: 'existing-light-1',
    type: 'LIGHT',
    signals: ['安らぎ', '通常', '読書', '家事'],
  },
  { id: 'existing-alexa-1', type: 'ALEXA' },
];

// =============================================================================
// Regression: SignalResolver backward compatibility
// =============================================================================

describe('Regression: SignalResolver resolves existing presets correctly', () => {
  it('should resolve 安らぎ as relax signal (Req 5.1)', () => {
    const signals = ['安らぎ', '通常', '読書', '家事'];
    const result = resolveRelaxSignal(signals);
    expect(result).toBe('安らぎ');
  });

  it('should resolve 通常 as normal signal (Req 5.2)', () => {
    const signals = ['安らぎ', '通常', '読書', '家事'];
    const result = resolveNormalSignal(signals);
    expect(result).toBe('通常');
  });

  it('should return null for relax when existing presets lack relax keyword', () => {
    const signals = ['通常', '読書', '家事'];
    const result = resolveRelaxSignal(signals);
    expect(result).toBeNull();
  });

  it('should return null for normal when existing presets lack normal keyword', () => {
    const signals = ['安らぎ', '読書', '家事'];
    const result = resolveNormalSignal(signals);
    expect(result).toBeNull();
  });

  it('should generate correct label for existing signal names', () => {
    expect(signalToLabel('安らぎ')).toBe('安らぎモード');
    expect(signalToLabel('通常')).toBe('通常モード');
    expect(signalToLabel('読書')).toBe('読書モード');
    expect(signalToLabel('家事')).toBe('家事モード');
  });
});

// =============================================================================
// Regression: break_mode with existing user presets (Req 5.1)
// =============================================================================

describe('Regression: break_mode backward compatibility with existing presets', () => {
  let mockLightService: LightService;
  let mockAlexaService: AlexaServiceForDispatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLightService = createMockLightService();
    mockAlexaService = createMockAlexaService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should use 安らぎ signal via sendNamedSignal in break_mode (same as pre-update behavior)', async () => {
    const deps: ActionDispatcherDependencies = {
      lightService: mockLightService,
      alexaService: mockAlexaService,
    };
    const dispatcher = createActionDispatcher(EXISTING_USER_DEVICES, deps);

    const action: AgentAction = {
      tool: 'break_mode',
      params: { reason: '食事中を検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.nextInterval).toBe('normal');
      expect(result.value.message).toBe('食事中を検出');
    }

    // Backward compat: sendNamedSignal called with '安らぎ' (same as before)
    expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('existing-light-1', '安らぎ');
    // Standard control should NOT be called (signal was found)
    expect(mockLightService.control).not.toHaveBeenCalled();
    // Alexa sub-actions should still execute
    expect(mockAlexaService.speak).toHaveBeenCalled();
    expect(mockAlexaService.textCommand).toHaveBeenCalled();
  });

  it('should include break_mode sub-action results even when no reason specified', async () => {
    const deps: ActionDispatcherDependencies = {
      lightService: mockLightService,
      alexaService: mockAlexaService,
    };
    const dispatcher = createActionDispatcher(EXISTING_USER_DEVICES, deps);

    const action: AgentAction = {
      tool: 'break_mode',
      params: {},
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
    }
    expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('existing-light-1', '安らぎ');
  });
});

// =============================================================================
// Regression: focus_mode with existing user presets (Req 5.2)
// =============================================================================

describe('Regression: focus_mode backward compatibility with existing presets', () => {
  let mockLightService: LightService;
  let mockAlexaService: AlexaServiceForDispatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLightService = createMockLightService();
    mockAlexaService = createMockAlexaService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should use 通常 signal via sendNamedSignal in focus_mode (same as pre-update behavior)', async () => {
    const deps: ActionDispatcherDependencies = {
      lightService: mockLightService,
      alexaService: mockAlexaService,
    };
    const dispatcher = createActionDispatcher(EXISTING_USER_DEVICES, deps);

    const action: AgentAction = {
      tool: 'focus_mode',
      params: { reason: '作業復帰を検出' },
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.nextInterval).toBe('normal');
      expect(result.value.message).toBe('作業復帰を検出');
    }

    // Backward compat: sendNamedSignal called with '通常' (same as before)
    expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('existing-light-1', '通常');
    // Standard control should NOT be called (signal was found)
    expect(mockLightService.control).not.toHaveBeenCalled();
    // Alexa sub-actions should still execute
    expect(mockAlexaService.speak).toHaveBeenCalled();
    expect(mockAlexaService.textCommand).toHaveBeenCalled();
  });

  it('should include focus_mode sub-action results even when no reason specified', async () => {
    const deps: ActionDispatcherDependencies = {
      lightService: mockLightService,
      alexaService: mockAlexaService,
    };
    const dispatcher = createActionDispatcher(EXISTING_USER_DEVICES, deps);

    const action: AgentAction = {
      tool: 'focus_mode',
      params: {},
    };

    const promise = dispatcher.dispatch(action);
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
    }
    expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('existing-light-1', '通常');
  });
});

// =============================================================================
// Regression: light_control dispatch with existing signal names (Req 5.3)
// =============================================================================

describe('Regression: light_control dispatch with existing signal and standard button actions', () => {
  let mockLightService: LightService;

  beforeEach(() => {
    mockLightService = createMockLightService();
  });

  it('should call sendNamedSignal for 安らぎ signal action (Req 5.3)', async () => {
    const devices: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT', signals: ['安らぎ', '通常', '読書', '家事'] },
    ];
    const dispatcher = createActionDispatcher(devices, {
      lightService: mockLightService,
    });

    const action: AgentAction = {
      tool: 'light_control',
      params: { action: '安らぎ' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toContain('安らぎモード');
    }
    expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('light-1', '安らぎ');
    expect(mockLightService.control).not.toHaveBeenCalled();
  });

  it('should call sendNamedSignal for 通常 signal action (Req 5.3)', async () => {
    const devices: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT', signals: ['安らぎ', '通常', '読書', '家事'] },
    ];
    const dispatcher = createActionDispatcher(devices, {
      lightService: mockLightService,
    });

    const action: AgentAction = {
      tool: 'light_control',
      params: { action: '通常' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toContain('通常モード');
    }
    expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('light-1', '通常');
    expect(mockLightService.control).not.toHaveBeenCalled();
  });

  it('should call sendNamedSignal for 読書 signal action (Req 5.3)', async () => {
    const devices: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT', signals: ['安らぎ', '通常', '読書', '家事'] },
    ];
    const dispatcher = createActionDispatcher(devices, {
      lightService: mockLightService,
    });

    const action: AgentAction = {
      tool: 'light_control',
      params: { action: '読書' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toContain('読書モード');
    }
    expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('light-1', '読書');
    expect(mockLightService.control).not.toHaveBeenCalled();
  });

  it('should call sendNamedSignal for 家事 signal action (Req 5.3)', async () => {
    const devices: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT', signals: ['安らぎ', '通常', '読書', '家事'] },
    ];
    const dispatcher = createActionDispatcher(devices, {
      lightService: mockLightService,
    });

    const action: AgentAction = {
      tool: 'light_control',
      params: { action: '家事' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executed).toBe(true);
      expect(result.value.message).toContain('家事モード');
    }
    expect(mockLightService.sendNamedSignal).toHaveBeenCalledWith('light-1', '家事');
    expect(mockLightService.control).not.toHaveBeenCalled();
  });

  it('should call control for standard button on (not sendNamedSignal)', async () => {
    const devices: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT', signals: ['安らぎ', '通常'] },
    ];
    const dispatcher = createActionDispatcher(devices, {
      lightService: mockLightService,
    });

    const action: AgentAction = {
      tool: 'light_control',
      params: { action: 'on' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    expect(mockLightService.control).toHaveBeenCalledWith('light-1', 'on');
    expect(mockLightService.sendNamedSignal).not.toHaveBeenCalled();
  });

  it('should call control for standard button on-100 (not sendNamedSignal)', async () => {
    const devices: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT', signals: ['安らぎ', '通常'] },
    ];
    const dispatcher = createActionDispatcher(devices, {
      lightService: mockLightService,
    });

    const action: AgentAction = {
      tool: 'light_control',
      params: { action: 'on-100' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    expect(mockLightService.control).toHaveBeenCalledWith('light-1', 'on-100');
    expect(mockLightService.sendNamedSignal).not.toHaveBeenCalled();
  });

  it('should call control for standard button off (not sendNamedSignal)', async () => {
    const devices: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT', signals: ['安らぎ', '通常'] },
    ];
    const dispatcher = createActionDispatcher(devices, {
      lightService: mockLightService,
    });

    const action: AgentAction = {
      tool: 'light_control',
      params: { action: 'off' },
    };

    const result = await dispatcher.dispatch(action);

    expect(result.ok).toBe(true);
    expect(mockLightService.control).toHaveBeenCalledWith('light-1', 'off');
    expect(mockLightService.sendNamedSignal).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Regression: DynamicToolBuilder with existing user presets
// =============================================================================

describe('Regression: DynamicToolBuilder generates correct tools for existing user presets', () => {
  it('should include all 4 existing signal names in light_control enum', () => {
    const toolBuilder = createDynamicToolBuilder();
    const tools = toolBuilder.generateTools(EXISTING_USER_DEVICES);

    const lightTool = tools.find((t) => t.name === 'light_control');
    expect(lightTool).toBeDefined();

    const actionParam = lightTool!.parameters?.properties?.['action'];
    const enumValues = (actionParam as { enum?: string[] }).enum;
    expect(enumValues).toBeDefined();

    // All standard buttons must be present
    for (const standardAction of STANDARD_LIGHT_ACTIONS) {
      expect(enumValues).toContain(standardAction);
    }

    // All existing user signals must be present
    expect(enumValues).toContain('安らぎ');
    expect(enumValues).toContain('通常');
    expect(enumValues).toContain('読書');
    expect(enumValues).toContain('家事');

    // Total count: 9 standard + 4 custom
    expect(enumValues).toHaveLength(STANDARD_LIGHT_ACTIONS.length + 4);
  });

  it('should include signal descriptions for existing presets in tool description', () => {
    const toolBuilder = createDynamicToolBuilder();
    const tools = toolBuilder.generateTools(EXISTING_USER_DEVICES);

    const lightTool = tools.find((t) => t.name === 'light_control');
    expect(lightTool).toBeDefined();

    expect(lightTool!.description).toContain('カスタムシグナル');
    expect(lightTool!.description).toContain('安らぎ');
    expect(lightTool!.description).toContain('通常');
    expect(lightTool!.description).toContain('読書');
    expect(lightTool!.description).toContain('家事');
  });

  it('should NOT include hardcoded signal names when signals field is absent', () => {
    const toolBuilder = createDynamicToolBuilder();
    const devicesNoSignals: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT' },
    ];
    const tools = toolBuilder.generateTools(devicesNoSignals);

    const lightTool = tools.find((t) => t.name === 'light_control');
    expect(lightTool).toBeDefined();

    const actionParam = lightTool!.parameters?.properties?.['action'];
    const enumValues = (actionParam as { enum?: string[] }).enum;

    // Should have ONLY standard buttons (no hardcoded signal names)
    expect(enumValues).toHaveLength(STANDARD_LIGHT_ACTIONS.length);
    expect(enumValues).not.toContain('安らぎ');
    expect(enumValues).not.toContain('通常');
    expect(enumValues).not.toContain('読書');
    expect(enumValues).not.toContain('家事');
  });

  it('should not affect other device tools when LIGHT has existing signals', () => {
    const devicesWithAll: readonly AllowedDevice[] = [
      { id: 'light-1', type: 'LIGHT', signals: ['安らぎ', '通常', '読書', '家事'] },
      { id: 'ac-1', type: 'AC' },
      { id: 'tv-1', type: 'TV' },
      { id: 'alexa-1', type: 'ALEXA' },
    ];

    const toolBuilder = createDynamicToolBuilder();
    const tools = toolBuilder.generateTools(devicesWithAll);

    // AC tool unaffected
    const acTool = tools.find((t) => t.name === 'aircon_control');
    expect(acTool).toBeDefined();
    expect(acTool!.parameters!.properties['temperature']).toBeDefined();

    // TV tool unaffected
    const tvTool = tools.find((t) => t.name === 'tv_control');
    expect(tvTool).toBeDefined();
    expect(tvTool!.parameters!.properties['action']!.enum).toEqual(['power', 'channel', 'volume']);

    // Alexa tools unaffected
    const alexaSpeakTool = tools.find((t) => t.name === 'alexa_speak');
    expect(alexaSpeakTool).toBeDefined();
    expect(alexaSpeakTool!.parameters!.properties['message']).toBeDefined();
  });
});

// =============================================================================
// Regression: buildLightControlDeclaration with existing presets
// =============================================================================

describe('Regression: buildLightControlDeclaration with existing presets', () => {
  it('should produce correct FunctionDeclaration for existing 4 signals', () => {
    const declaration = buildLightControlDeclaration(['安らぎ', '通常', '読書', '家事']);

    expect(declaration.name).toBe('light_control');

    const actionParam = declaration.parameters?.properties?.['action'];
    const enumValues = (actionParam as { enum?: string[] }).enum!;

    // 9 standard + 4 custom = 13
    expect(enumValues).toHaveLength(13);
    expect(enumValues).toContain('安らぎ');
    expect(enumValues).toContain('通常');
    expect(enumValues).toContain('読書');
    expect(enumValues).toContain('家事');

    // Standard buttons preserved
    expect(enumValues).toContain('on');
    expect(enumValues).toContain('off');
    expect(enumValues).toContain('on-100');
    expect(enumValues).toContain('on-favorite');
  });

  it('should include custom signal descriptions in action parameter description', () => {
    const declaration = buildLightControlDeclaration(['安らぎ', '通常', '読書', '家事']);

    const actionParam = declaration.parameters?.properties?.['action'];
    const actionDescription = (actionParam as { description?: string }).description;

    expect(actionDescription).toContain('安らぎ: カスタムモード');
    expect(actionDescription).toContain('通常: カスタムモード');
    expect(actionDescription).toContain('読書: カスタムモード');
    expect(actionDescription).toContain('家事: カスタムモード');
  });
});

// =============================================================================
// Regression: PromptBuilder with existing user signals
// =============================================================================

describe('Regression: PromptBuilder includes existing signal names correctly', () => {
  it('should include 安らぎ signal name in prompt for break_mode description', () => {
    const prompt = buildPrompt(undefined, [], ['安らぎ', '通常', '読書', '家事']);
    expect(prompt).toContain('安らぎ');
  });

  it('should NOT contain hardcoded signal names when no signals provided', () => {
    const prompt = buildPrompt(undefined, [], undefined);
    // Without signals, the prompt should use generic descriptions instead of signal names
    // It should NOT reference specific signal names like 安らぎ
    expect(prompt).not.toContain('安らぎモード');
  });

  it('should NOT contain hardcoded signal names when empty signals provided', () => {
    const prompt = buildPrompt(undefined, [], []);
    expect(prompt).not.toContain('安らぎモード');
  });
});

// =============================================================================
// Regression: Existing test patterns still work
// =============================================================================

describe('Regression: Existing patterns and conventions are preserved', () => {
  it('STANDARD_LIGHT_ACTIONS contains all 9 standard buttons', () => {
    expect(STANDARD_LIGHT_ACTIONS).toEqual([
      'on', 'off', 'on-100', 'on-favorite', 'night',
      'bright-up', 'bright-down', 'colortemp-up', 'colortemp-down',
    ]);
  });

  it('STANDARD_LIGHT_ACTIONS does NOT contain any hardcoded signal names', () => {
    expect(STANDARD_LIGHT_ACTIONS).not.toContain('安らぎ');
    expect(STANDARD_LIGHT_ACTIONS).not.toContain('読書');
    expect(STANDARD_LIGHT_ACTIONS).not.toContain('家事');
    expect(STANDARD_LIGHT_ACTIONS).not.toContain('通常');
  });

  it('AllowedDevice signals field is optional and backward compatible', () => {
    // Device without signals should work
    const deviceNoSignals: AllowedDevice = { id: 'light-1', type: 'LIGHT' };
    expect(deviceNoSignals.signals).toBeUndefined();

    // Device with empty signals should work
    const deviceEmptySignals: AllowedDevice = { id: 'light-1', type: 'LIGHT', signals: [] };
    expect(deviceEmptySignals.signals).toEqual([]);

    // Device with signals should work
    const deviceWithSignals: AllowedDevice = {
      id: 'light-1',
      type: 'LIGHT',
      signals: ['安らぎ', '通常'],
    };
    expect(deviceWithSignals.signals).toEqual(['安らぎ', '通常']);
  });
});
