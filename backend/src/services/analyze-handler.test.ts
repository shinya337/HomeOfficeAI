/**
 * AnalyzeHandler Service Tests
 *
 * TDD tests for the image analysis handler service.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.5, 6.1, 6.2, 6.3, 6.4
 * Contract: AnalyzeHandlerService
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAnalyzeHandler,
  type AnalyzeHandlerService,
  type AnalyzeHandlerDependencies,
} from './analyze-handler.js';
import { createSessionManager } from './session-manager.js';
import type { SessionManagerService } from './session-manager.js';
import type {
  AgentClientService,
  ActionDispatcherService,
  DeviceState,
  AgentAction,
  ActionResult,
} from '../config/index.js';
import type { ImageData } from '../types/api-types.js';
import { Intervals } from '../types/api-types.js';
import type { DynamicToolBuilderService } from './dynamic-tool-builder.js';
import type { DeviceStateService, FilteredDeviceState } from './device-state-service.js';
import type { AllowedDevice } from '../types/device-types.js';
import type { FunctionDeclaration } from '@google-cloud/vertexai';
import type { SessionIoTServices } from '../types/session-types.js';
import type { LightService, AirconService } from '../dispatcher/action-dispatcher.js';

// =============================================================================
// Mock Factories
// =============================================================================

/**
 * Create mock AgentClient（並列Function Calling対応: AgentAction[]を返す）
 */
function createMockAgentClient(
  analyzeResult: Awaited<ReturnType<AgentClientService['analyze']>> = {
    ok: true,
    value: [{ tool: 'do_nothing', params: {} }],
  }
): AgentClientService {
  return {
    analyze: vi.fn().mockResolvedValue(analyzeResult),
  };
}

/**
 * Create mock ActionDispatcher
 */
function createMockActionDispatcher(
  dispatchResult: Awaited<ReturnType<ActionDispatcherService['dispatch']>> = {
    ok: true,
    value: { executed: false, nextInterval: 'normal', message: 'No action needed' },
  }
): ActionDispatcherService {
  return {
    dispatch: vi.fn().mockResolvedValue(dispatchResult),
  };
}

/**
 * Create mock DeviceStateService (new version with allowedDevices support)
 */
function createMockDeviceStateService(
  deviceState: FilteredDeviceState = { light: { power: 'on' }, aircon: { temperature: '26', mode: 'cooling' } }
): DeviceStateService {
  return {
    getDeviceState: vi.fn().mockResolvedValue({ ok: true, value: deviceState }),
  };
}

/**
 * Create mock DynamicToolBuilderService
 */
function createMockDynamicToolBuilder(
  tools: readonly FunctionDeclaration[] = []
): DynamicToolBuilderService {
  return {
    generateTools: vi.fn().mockReturnValue(tools),
  };
}

// =============================================================================
// Test Constants
// =============================================================================

const TEST_IMAGE: ImageData = {
  base64: 'dGVzdA==', // 'test' in base64
  mimeType: 'image/jpeg',
};

// =============================================================================
// Tests
// =============================================================================

describe('AnalyzeHandlerService', () => {
  let sessionManager: SessionManagerService;
  let agentClient: AgentClientService;
  let actionDispatcher: ActionDispatcherService;
  let actionDispatcherFactory: (allowedDevices: readonly import('../types/device-types.js').AllowedDevice[]) => ActionDispatcherService;
  let deviceStateService: DeviceStateService;
  let analyzeHandler: AnalyzeHandlerService;

  beforeEach(() => {
    sessionManager = createSessionManager();
    agentClient = createMockAgentClient();
    actionDispatcher = createMockActionDispatcher();
    actionDispatcherFactory = vi.fn().mockReturnValue(actionDispatcher);
    deviceStateService = createMockDeviceStateService();

    const deps: AnalyzeHandlerDependencies = {
      sessionManager,
      agentClient,
      actionDispatcherFactory,
      deviceStateService,
    };

    analyzeHandler = createAnalyzeHandler(deps);
  });

  describe('Session Validation (Req 6.2, 6.5)', () => {
    it('should return NO_ACTIVE_SESSION error when no session is active', async () => {
      // No session started
      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NO_ACTIVE_SESSION');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return NO_ACTIVE_SESSION error after session ends', async () => {
      // Start and end session
      const session = sessionManager.startSession(null);
      sessionManager.endSession(session.sessionId);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NO_ACTIVE_SESSION');
      }
    });

    it('should proceed with analysis when session is active', async () => {
      sessionManager.startSession(null);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(true);
    });
  });

  describe('AI Image Analysis (Req 3.1, 3.2)', () => {
    beforeEach(() => {
      sessionManager.startSession(null);
    });

    it('should call AgentClient.analyze with image data and prompt', async () => {
      await analyzeHandler.analyze(TEST_IMAGE);

      expect(agentClient.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          base64: TEST_IMAGE.base64,
          mimeType: TEST_IMAGE.mimeType,
        }),
        expect.any(String), // System prompt
        undefined // Tools (undefined when no dynamicToolBuilder)
      );
    });

    it('should include device state in prompt (Req 3.5)', async () => {
      await analyzeHandler.analyze(TEST_IMAGE);

      // Verify prompt contains device state info
      const analyzeCall = vi.mocked(agentClient.analyze).mock.calls[0];
      const prompt = analyzeCall[1];
      expect(prompt).toContain('照明');
      expect(prompt).toContain('エアコン');
    });

    it('should include recent action history in prompt (Req 3.5)', async () => {
      // Add some actions to history
      const action: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      sessionManager.addRecentAction(action);

      await analyzeHandler.analyze(TEST_IMAGE);

      const analyzeCall = vi.mocked(agentClient.analyze).mock.calls[0];
      const prompt = analyzeCall[1];
      expect(prompt).toContain('light_control');
    });

    it('should return AI_ERROR when AgentClient fails (Req 3.4)', async () => {
      agentClient = createMockAgentClient({
        ok: false,
        error: { code: 'API_ERROR', message: 'Vertex AI error', retryable: true },
      });
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AI_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('Device State Retrieval', () => {
    beforeEach(() => {
      sessionManager.startSession(null);
    });

    it('should call DeviceStateService.getDeviceState', async () => {
      await analyzeHandler.analyze(TEST_IMAGE);

      expect(deviceStateService.getDeviceState).toHaveBeenCalled();
    });

    it('should continue with analysis even if device state retrieval fails', async () => {
      deviceStateService = {
        getDeviceState: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'API_ERROR', message: 'Failed to get device state' },
        }),
      };
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      // Should still succeed, just without device state in prompt
      expect(result.ok).toBe(true);
    });
  });

  describe('IoT Device Control (Req 4.1, 4.2)', () => {
    beforeEach(() => {
      sessionManager.startSession(null);
    });

    it('should call ActionDispatcher.dispatch with AI action', async () => {
      const lightAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      agentClient = createMockAgentClient({ ok: true, value: [lightAction] });
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      expect(actionDispatcher.dispatch).toHaveBeenCalledWith(lightAction);
    });

    it('should record failure in actionResults when ActionDispatcher fails (partial success)', async () => {
      actionDispatcher = createMockActionDispatcher({
        ok: false,
        error: { code: 'IOT_ERROR', message: 'Nature Remo API error' },
      });
      actionDispatcherFactory = vi.fn().mockReturnValue(actionDispatcher);
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      // 部分成功を許容: 全体はokだが、個別のactionResultにexecuted: false
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.actionResult.executed).toBe(false);
        expect(result.value.actionResult.message).toContain('アクション実行失敗');
      }
    });
  });

  describe('Duplicate Action Prevention (Req 4.5)', () => {
    beforeEach(() => {
      sessionManager.startSession(null);
    });

    it('should skip ActionDispatcher for duplicate device control action', async () => {
      const lightAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      agentClient = createMockAgentClient({ ok: true, value: [lightAction] });

      // Set up the action as already executed (add to history)
      sessionManager.addRecentAction(lightAction);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      // ActionDispatcher should NOT be called for duplicate
      expect(actionDispatcher.dispatch).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.actionResult.executed).toBe(false);
        expect(result.value.actionResult.message).toContain('重複');
      }
    });

    it('should allow continue_monitoring even if it was the last action', async () => {
      const continueAction: AgentAction = { tool: 'continue_monitoring', params: {} };
      agentClient = createMockAgentClient({ ok: true, value: [continueAction] });
      sessionManager.addRecentAction(continueAction);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      // continue_monitoring should always be dispatched (not subject to dedup)
      expect(actionDispatcher.dispatch).toHaveBeenCalledWith(continueAction);
    });

    it('should allow do_nothing even if it was the last action', async () => {
      const doNothingAction: AgentAction = { tool: 'do_nothing', params: {} };
      agentClient = createMockAgentClient({ ok: true, value: [doNothingAction] });
      sessionManager.addRecentAction(doNothingAction);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      // do_nothing should always be dispatched (not subject to dedup)
      expect(actionDispatcher.dispatch).toHaveBeenCalledWith(doNothingAction);
    });
  });

  describe('Action History Recording', () => {
    beforeEach(() => {
      sessionManager.startSession(null);
    });

    it('should add executed action to session history', async () => {
      const lightAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      agentClient = createMockAgentClient({ ok: true, value: [lightAction] });
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      const recentActions = sessionManager.getRecentActions();
      expect(recentActions).toContainEqual(lightAction);
    });
  });

  describe('Next Interval Calculation (Req 4.3, 4.4)', () => {
    beforeEach(() => {
      sessionManager.startSession(null);
    });

    it('should return 10 seconds for continue_monitoring action', async () => {
      const continueAction: AgentAction = { tool: 'continue_monitoring', params: {} };
      agentClient = createMockAgentClient({ ok: true, value: [continueAction] });
      actionDispatcher = createMockActionDispatcher({
        ok: true,
        value: { executed: false, nextInterval: 'short', message: 'Continue monitoring' },
      });
      actionDispatcherFactory = vi.fn().mockReturnValue(actionDispatcher);
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nextIntervalMs).toBe(5000); // 5 seconds
      }
    });

    it('should return DEFAULT interval for do_nothing action', async () => {
      const doNothingAction: AgentAction = { tool: 'do_nothing', params: {} };
      agentClient = createMockAgentClient({ ok: true, value: [doNothingAction] });
      actionDispatcher = createMockActionDispatcher({
        ok: true,
        value: { executed: false, nextInterval: 'normal', message: 'No action' },
      });
      actionDispatcherFactory = vi.fn().mockReturnValue(actionDispatcher);
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nextIntervalMs).toBe(Intervals.DEFAULT);
      }
    });

    it('should return DEFAULT interval for device control actions', async () => {
      const lightAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      agentClient = createMockAgentClient({ ok: true, value: [lightAction] });
      actionDispatcher = createMockActionDispatcher({
        ok: true,
        value: { executed: true, nextInterval: 'normal', message: 'Light turned on' },
      });
      actionDispatcherFactory = vi.fn().mockReturnValue(actionDispatcher);
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nextIntervalMs).toBe(Intervals.DEFAULT);
      }
    });
  });

  describe('Result Structure', () => {
    beforeEach(() => {
      sessionManager.startSession(null);
    });

    it('should return complete AnalyzeResult structure', async () => {
      const lightAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };
      agentClient = createMockAgentClient({ ok: true, value: [lightAction] });
      actionDispatcher = createMockActionDispatcher({
        ok: true,
        value: { executed: true, nextInterval: 'normal', message: 'Light turned on' },
      });
      actionDispatcherFactory = vi.fn().mockReturnValue(actionDispatcher);
      const deviceState: DeviceState = {
        light: { power: 'off' },
        aircon: { temperature: '24', mode: 'cooling' },
      };
      deviceStateService = createMockDeviceStateService(deviceState);
      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // 後方互換フィールド
        expect(result.value).toHaveProperty('action');
        expect(result.value).toHaveProperty('actionResult');
        expect(result.value).toHaveProperty('nextIntervalMs');
        expect(result.value).toHaveProperty('deviceState');
        expect(result.value.action).toEqual(lightAction);
        expect(result.value.deviceState).toEqual(deviceState);
        // 配列フィールド（並列Function Calling対応）
        expect(result.value).toHaveProperty('actions');
        expect(result.value).toHaveProperty('actionResults');
        expect(result.value.actions).toEqual([lightAction]);
        expect(result.value.actionResults).toHaveLength(1);
      }
    });
  });

  describe('Logging (Req 6.4)', () => {
    beforeEach(() => {
      sessionManager.startSession(null);
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should log analysis cycle information', async () => {
      await analyzeHandler.analyze(TEST_IMAGE);

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('Dynamic Tool Generation (Req 4.1, 4.2, 6.1, 6.3)', () => {
    let dynamicToolBuilder: DynamicToolBuilderService;
    const mockTools: FunctionDeclaration[] = [
      { name: 'light_control', description: 'Control light' } as FunctionDeclaration,
      { name: 'continue_monitoring', description: 'Continue' } as FunctionDeclaration,
      { name: 'do_nothing', description: 'No action' } as FunctionDeclaration,
    ];

    beforeEach(() => {
      dynamicToolBuilder = createMockDynamicToolBuilder(mockTools);
    });

    it('should call DynamicToolBuilder.generateTools with allowed devices from session (Req 4.1)', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
        { id: 'aircon-001', type: 'AC' },
      ];
      sessionManager.startSession(null, allowedDevices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      expect(dynamicToolBuilder.generateTools).toHaveBeenCalledWith(allowedDevices);
    });

    it('should call DynamicToolBuilder.generateTools with undefined when no allowed devices (backward compat)', async () => {
      sessionManager.startSession(null); // No allowed devices

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      expect(dynamicToolBuilder.generateTools).toHaveBeenCalledWith(undefined);
    });

    it('should call DeviceStateService.getDeviceState with allowed devices (Req 6.1)', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];
      sessionManager.startSession(null, allowedDevices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      expect(deviceStateService.getDeviceState).toHaveBeenCalledWith(allowedDevices);
    });

    it('should pass allowed device state to prompt builder (Req 6.3)', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];
      sessionManager.startSession(null, allowedDevices);

      // Device state filtered by allowed devices (only light)
      const filteredDeviceState: FilteredDeviceState = {
        light: { power: 'on' },
        aircon: null, // Not allowed
      };
      deviceStateService = createMockDeviceStateService(filteredDeviceState);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      // Verify prompt contains only allowed device state
      const analyzeCall = vi.mocked(agentClient.analyze).mock.calls[0];
      const prompt = analyzeCall[1];
      expect(prompt).toContain('照明');
      // Aircon should show as 不明 since it's null
      expect(prompt).toMatch(/エアコン.*不明/);
    });

    it('should generate tools only for allowed device types (Req 4.2)', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
        // No AC allowed
      ];
      sessionManager.startSession(null, allowedDevices);

      // Mock that only light_control + always tools are generated
      const lightOnlyTools: FunctionDeclaration[] = [
        { name: 'light_control', description: 'Control light' } as FunctionDeclaration,
        { name: 'continue_monitoring', description: 'Continue' } as FunctionDeclaration,
        { name: 'do_nothing', description: 'No action' } as FunctionDeclaration,
      ];
      dynamicToolBuilder = createMockDynamicToolBuilder(lightOnlyTools);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      // Verify generateTools was called with allowed devices
      expect(dynamicToolBuilder.generateTools).toHaveBeenCalledWith(allowedDevices);
      // Verify returned tools are light-only + always tools (implementation detail - agentClient should receive these)
      const generatedTools = vi.mocked(dynamicToolBuilder.generateTools).mock.results[0].value;
      expect(generatedTools.map((t: FunctionDeclaration) => t.name)).toEqual([
        'light_control',
        'continue_monitoring',
        'do_nothing',
      ]);
    });

    it('should pass generated tools to AgentClient (Req 4.2)', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];
      sessionManager.startSession(null, allowedDevices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      // AgentClient.analyze should be called with image, prompt, and tools
      expect(agentClient.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          base64: TEST_IMAGE.base64,
          mimeType: TEST_IMAGE.mimeType,
        }),
        expect.any(String),
        mockTools // tools should be passed
      );
    });

    it('should work correctly with empty allowed devices (no device tools)', async () => {
      const allowedDevices: AllowedDevice[] = []; // Empty
      sessionManager.startSession(null, allowedDevices);

      // Only always-included tools
      const alwaysOnlyTools: FunctionDeclaration[] = [
        { name: 'continue_monitoring', description: 'Continue' } as FunctionDeclaration,
        { name: 'do_nothing', description: 'No action' } as FunctionDeclaration,
      ];
      dynamicToolBuilder = createMockDynamicToolBuilder(alwaysOnlyTools);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(true);
      expect(dynamicToolBuilder.generateTools).toHaveBeenCalledWith(allowedDevices);
    });
  });

  describe('Session-specific IoT Services (Task 6.3, Req 6.2, 6.4)', () => {
    let mockLightService: LightService;
    let mockAirconService: AirconService;
    let sessionIoTServices: SessionIoTServices;

    beforeEach(() => {
      mockLightService = {
        control: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-001', power: 'on' } }),
        sendNamedSignal: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'light-001', signalName: 'test', success: true } }),
      };
      mockAirconService = {
        setTemperature: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-001', temperature: 26 } }),
        powerOff: vi.fn().mockResolvedValue({ success: true, data: { applianceId: 'ac-001' } }),
      };
      sessionIoTServices = {
        lightService: mockLightService,
        airconService: mockAirconService,
      };
    });

    it('should pass session IoT services to actionDispatcherFactory when session has IoT services', async () => {
      // Start session with IoT services bound
      const session = sessionManager.startSession(null, undefined, sessionIoTServices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      // Analyze with sessionId
      const result = await analyzeHandler.analyze(TEST_IMAGE, session.sessionId);

      expect(result.ok).toBe(true);
      // actionDispatcherFactory should receive session IoT services as second argument
      expect(actionDispatcherFactory).toHaveBeenCalledWith(
        expect.anything(), // allowedDevices
        sessionIoTServices // session-specific IoT services
      );
    });

    it('should pass undefined IoT services when session has no IoT services bound', async () => {
      // Start session WITHOUT IoT services (guest mode)
      const session = sessionManager.startSession(null);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE, session.sessionId);

      expect(result.ok).toBe(true);
      // actionDispatcherFactory should receive undefined for IoT services (fallback to global)
      expect(actionDispatcherFactory).toHaveBeenCalledWith(
        expect.anything(),
        undefined
      );
    });

    it('should use session-specific allowed devices from getSession when sessionId is provided', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT' },
      ];
      const session = sessionManager.startSession(null, allowedDevices, sessionIoTServices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      const result = await analyzeHandler.analyze(TEST_IMAGE, session.sessionId);

      expect(result.ok).toBe(true);
      // Should use session's allowedDevices, not from getStatus()
      expect(actionDispatcherFactory).toHaveBeenCalledWith(
        allowedDevices,
        sessionIoTServices
      );
    });

    it('should return NO_ACTIVE_SESSION when sessionId is provided but session not found', async () => {
      // Start a session so hasActiveSession() returns true
      sessionManager.startSession(null);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      // Use a non-existent sessionId
      const result = await analyzeHandler.analyze(TEST_IMAGE, 'non-existent-session-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NO_ACTIVE_SESSION');
      }
    });

    it('should still work without sessionId (backward compatibility)', async () => {
      sessionManager.startSession(null);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      // Call without sessionId - backward compatible
      const result = await analyzeHandler.analyze(TEST_IMAGE);

      expect(result.ok).toBe(true);
      // Should still use getStatus() fallback
      expect(actionDispatcherFactory).toHaveBeenCalledWith(
        expect.anything(),
        undefined // no session-specific IoT services without sessionId
      );
    });
  });

  describe('Light signal propagation to buildPrompt (Task 4.1)', () => {
    let dynamicToolBuilder: DynamicToolBuilderService;

    beforeEach(() => {
      dynamicToolBuilder = createMockDynamicToolBuilder([]);
    });

    it('should pass lightSignals to buildPrompt when LIGHT device has signals', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT', signals: ['安らぎ', '通常', '読書'] },
        { id: 'aircon-001', type: 'AC' },
      ];
      sessionManager.startSession(null, allowedDevices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      // Prompt should contain dynamic signal references from the user's LIGHT device
      const analyzeCall = vi.mocked(agentClient.analyze).mock.calls[0];
      const prompt = analyzeCall[1] as string;
      // With '安らぎ' signal, break mode section should reference it dynamically
      expect(prompt).toContain('安らぎモード');
      // With '通常' signal, focus mode section should reference it dynamically
      expect(prompt).toContain('通常モード');
    });

    it('should use fallback prompt when LIGHT device has no signals (empty array)', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT', signals: [] },
        { id: 'aircon-001', type: 'AC' },
      ];
      sessionManager.startSession(null, allowedDevices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      const analyzeCall = vi.mocked(agentClient.analyze).mock.calls[0];
      const prompt = analyzeCall[1] as string;
      // Without signals, prompt should use standard fallback descriptions
      expect(prompt).toContain('お気に入りモード');
      expect(prompt).toContain('全灯（on-100）');
    });

    it('should use fallback prompt when no LIGHT device in session', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'aircon-001', type: 'AC' },
      ];
      sessionManager.startSession(null, allowedDevices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      const analyzeCall = vi.mocked(agentClient.analyze).mock.calls[0];
      const prompt = analyzeCall[1] as string;
      // Without LIGHT device, prompt should use standard fallback descriptions
      expect(prompt).toContain('お気に入りモード');
      expect(prompt).toContain('全灯（on-100）');
    });

    it('should use fallback prompt when allowedDevices is undefined (backward compat)', async () => {
      sessionManager.startSession(null); // No allowedDevices

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE);

      const analyzeCall = vi.mocked(agentClient.analyze).mock.calls[0];
      const prompt = analyzeCall[1] as string;
      // Without allowedDevices, prompt should use standard fallback descriptions
      expect(prompt).toContain('お気に入りモード');
      expect(prompt).toContain('全灯（on-100）');
    });

    it('should pass lightSignals to buildPrompt when using sessionId (Task 6.3)', async () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-001', type: 'LIGHT', signals: ['くつろぎ', '標準'] },
      ];
      const session = sessionManager.startSession(null, allowedDevices);

      const deps: AnalyzeHandlerDependencies = {
        sessionManager,
        agentClient,
        actionDispatcherFactory,
        deviceStateService,
        dynamicToolBuilder,
      };
      analyzeHandler = createAnalyzeHandler(deps);

      await analyzeHandler.analyze(TEST_IMAGE, session.sessionId);

      const analyzeCall = vi.mocked(agentClient.analyze).mock.calls[0];
      const prompt = analyzeCall[1] as string;
      // With 'くつろぎ' signal (relax keyword), break mode should reference it
      expect(prompt).toContain('くつろぎモード');
      // With '標準' signal (normal keyword), focus mode should reference it
      expect(prompt).toContain('標準モード');
    });
  });
});
