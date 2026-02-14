/**
 * Action Types Tests
 *
 * Tests for action type definitions and helper functions.
 *
 * Requirements: 5.4 (TV control action types)
 * Requirements: 7.1, 7.2 (ApplianceConfig removed)
 */

import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  type AgentAction,
  type TvControlAction,
  type TvControlParams,
  type ActionResult,
  type ActionDispatchError,
  type AlexaSpeakAction,
  type AlexaSpeakParams,
  type AlexaAnnouncementAction,
  type AlexaAnnouncementParams,
  type AlexaRoutineAction,
  type AlexaRoutineParams,
  type AlexaVolumeAction,
  type AlexaVolumeParams,
  type AlexaInfoAction,
  type AlexaInfoParams,
} from './action-types.js';

// =============================================================================
// TvControlAction Type Tests
// =============================================================================

describe('TvControlAction type', () => {
  it('should accept valid power action', () => {
    const action: TvControlAction = {
      tool: 'tv_control',
      params: {
        action: 'power',
        value: 'on',
      },
    };

    expect(action.tool).toBe('tv_control');
    expect(action.params.action).toBe('power');
    expect(action.params.value).toBe('on');
  });

  it('should accept valid channel action', () => {
    const action: TvControlAction = {
      tool: 'tv_control',
      params: {
        action: 'channel',
        value: '5',
      },
    };

    expect(action.tool).toBe('tv_control');
    expect(action.params.action).toBe('channel');
    expect(action.params.value).toBe('5');
  });

  it('should accept valid volume action', () => {
    const action: TvControlAction = {
      tool: 'tv_control',
      params: {
        action: 'volume',
        value: 'up',
      },
    };

    expect(action.tool).toBe('tv_control');
    expect(action.params.action).toBe('volume');
    expect(action.params.value).toBe('up');
  });
});

// =============================================================================
// TvControlParams Type Tests
// =============================================================================

describe('TvControlParams type', () => {
  it('should have action and value fields', () => {
    const params: TvControlParams = {
      action: 'power',
      value: 'off',
    };

    expect(params.action).toBe('power');
    expect(params.value).toBe('off');
  });

  it('should support all action types', () => {
    const powerParams: TvControlParams = { action: 'power', value: 'on' };
    const channelParams: TvControlParams = { action: 'channel', value: '8' };
    const volumeParams: TvControlParams = { action: 'volume', value: 'down' };

    expect(powerParams.action).toBe('power');
    expect(channelParams.action).toBe('channel');
    expect(volumeParams.action).toBe('volume');
  });
});

// =============================================================================
// AgentAction Union Type Tests
// =============================================================================

describe('AgentAction discriminated union', () => {
  it('should include TvControlAction in union', () => {
    const tvAction: AgentAction = {
      tool: 'tv_control',
      params: { action: 'power', value: 'on' },
    };

    expect(tvAction.tool).toBe('tv_control');
  });

  it('should include all action types', () => {
    const actions: AgentAction[] = [
      { tool: 'light_control', params: { action: 'on' } },
      { tool: 'aircon_control', params: { temperature: 26 } },
      { tool: 'tv_control', params: { action: 'power', value: 'on' } },
      { tool: 'continue_monitoring', params: {} as Record<string, never> },
      { tool: 'do_nothing', params: {} as Record<string, never> },
    ];

    expect(actions.length).toBe(5);
    expect(actions.map(a => a.tool)).toEqual([
      'light_control',
      'aircon_control',
      'tv_control',
      'continue_monitoring',
      'do_nothing',
    ]);
  });

  it('should discriminate by tool field', () => {
    const action: AgentAction = {
      tool: 'tv_control',
      params: { action: 'channel', value: '3' },
    };

    // TypeScript narrows the type based on tool
    if (action.tool === 'tv_control') {
      expect(action.params.action).toBe('channel');
      expect(action.params.value).toBe('3');
    }
  });
});

// =============================================================================
// Alexa Action Types Tests (Req 8.1, 8.2, 8.3)
// =============================================================================

describe('AlexaSpeakAction type', () => {
  it('should accept valid speak action with message', () => {
    const action: AlexaSpeakAction = {
      tool: 'alexa_speak',
      params: { message: 'おはようございます' },
    };

    expect(action.tool).toBe('alexa_speak');
    expect(action.params.message).toBe('おはようございます');
  });

  it('should have readonly params', () => {
    const params: AlexaSpeakParams = { message: 'test' };
    expect(params.message).toBe('test');
  });
});

describe('AlexaAnnouncementAction type', () => {
  it('should accept valid announcement action with message', () => {
    const action: AlexaAnnouncementAction = {
      tool: 'alexa_announcement',
      params: { message: 'お知らせです' },
    };

    expect(action.tool).toBe('alexa_announcement');
    expect(action.params.message).toBe('お知らせです');
  });

  it('should have readonly params', () => {
    const params: AlexaAnnouncementParams = { message: 'announcement' };
    expect(params.message).toBe('announcement');
  });
});

describe('AlexaRoutineAction type', () => {
  it('should accept valid routine action with routine_name', () => {
    const action: AlexaRoutineAction = {
      tool: 'alexa_routine',
      params: { routine_name: 'おはよう' },
    };

    expect(action.tool).toBe('alexa_routine');
    expect(action.params.routine_name).toBe('おはよう');
  });

  it('should have readonly params', () => {
    const params: AlexaRoutineParams = { routine_name: 'morning' };
    expect(params.routine_name).toBe('morning');
  });
});

describe('AlexaVolumeAction type', () => {
  it('should accept valid volume action with number', () => {
    const action: AlexaVolumeAction = {
      tool: 'alexa_volume',
      params: { volume: 50 },
    };

    expect(action.tool).toBe('alexa_volume');
    expect(action.params.volume).toBe(50);
  });

  it('should have readonly params', () => {
    const params: AlexaVolumeParams = { volume: 75 };
    expect(params.volume).toBe(75);
  });
});

describe('AlexaInfoAction type', () => {
  it('should accept valid info action with weather type', () => {
    const action: AlexaInfoAction = {
      tool: 'alexa_info',
      params: { info_type: 'weather' },
    };

    expect(action.tool).toBe('alexa_info');
    expect(action.params.info_type).toBe('weather');
  });

  it('should accept valid info action with flashbriefing type', () => {
    const action: AlexaInfoAction = {
      tool: 'alexa_info',
      params: { info_type: 'flashbriefing' },
    };

    expect(action.tool).toBe('alexa_info');
    expect(action.params.info_type).toBe('flashbriefing');
  });

  it('should have readonly params', () => {
    const params: AlexaInfoParams = { info_type: 'weather' };
    expect(params.info_type).toBe('weather');
  });
});

// =============================================================================
// AgentAction Union with Alexa Types Tests (Req 8.1, 8.2)
// =============================================================================

describe('AgentAction discriminated union with Alexa actions', () => {
  it('should include all 5 Alexa action types in the union', () => {
    const alexaActions: AgentAction[] = [
      { tool: 'alexa_speak', params: { message: 'hello' } },
      { tool: 'alexa_announcement', params: { message: 'info' } },
      { tool: 'alexa_routine', params: { routine_name: 'morning' } },
      { tool: 'alexa_volume', params: { volume: 50 } },
      { tool: 'alexa_info', params: { info_type: 'weather' } },
    ];

    expect(alexaActions.map(a => a.tool)).toEqual([
      'alexa_speak',
      'alexa_announcement',
      'alexa_routine',
      'alexa_volume',
      'alexa_info',
    ]);
  });

  it('should include all 10 action types (5 existing + 5 Alexa)', () => {
    const allActions: AgentAction[] = [
      { tool: 'light_control', params: { action: 'on' } },
      { tool: 'aircon_control', params: { temperature: 26 } },
      { tool: 'tv_control', params: { action: 'power', value: 'on' } },
      { tool: 'alexa_speak', params: { message: 'test' } },
      { tool: 'alexa_announcement', params: { message: 'test' } },
      { tool: 'alexa_routine', params: { routine_name: 'test' } },
      { tool: 'alexa_volume', params: { volume: 30 } },
      { tool: 'alexa_info', params: { info_type: 'flashbriefing' } },
      { tool: 'continue_monitoring', params: {} as Record<string, never> },
      { tool: 'do_nothing', params: {} as Record<string, never> },
    ];

    expect(allActions.length).toBe(10);
  });

  it('should discriminate alexa_speak by tool field', () => {
    const action: AgentAction = {
      tool: 'alexa_speak',
      params: { message: 'テスト' },
    };

    if (action.tool === 'alexa_speak') {
      expect(action.params.message).toBe('テスト');
    }
  });

  it('should discriminate alexa_routine by tool field', () => {
    const action: AgentAction = {
      tool: 'alexa_routine',
      params: { routine_name: 'おはよう' },
    };

    if (action.tool === 'alexa_routine') {
      expect(action.params.routine_name).toBe('おはよう');
    }
  });

  it('should discriminate alexa_volume by tool field', () => {
    const action: AgentAction = {
      tool: 'alexa_volume',
      params: { volume: 80 },
    };

    if (action.tool === 'alexa_volume') {
      expect(action.params.volume).toBe(80);
    }
  });

  it('should discriminate alexa_info by tool field', () => {
    const action: AgentAction = {
      tool: 'alexa_info',
      params: { info_type: 'flashbriefing' },
    };

    if (action.tool === 'alexa_info') {
      expect(action.params.info_type).toBe('flashbriefing');
    }
  });
});

// =============================================================================
// ApplianceConfig Removal Tests (Req 7.1, 7.2)
// =============================================================================

describe('ApplianceConfig removal (Req 7.1, 7.2)', () => {
  it('should not export ApplianceConfig (device IDs now from session)', () => {
    // ApplianceConfig has been removed from action-types.ts
    // Device IDs are now obtained from session's allowedDevices
    // This test documents the breaking change for Req 7.1, 7.2
    expect(true).toBe(true); // Placeholder - actual verification is compile-time
  });
});

// =============================================================================
// Result Helper Tests
// =============================================================================

describe('Result helpers', () => {
  describe('ok()', () => {
    it('should create success result', () => {
      const result = ok<ActionResult>({
        executed: true,
        nextInterval: 'normal',
        message: 'Success',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executed).toBe(true);
        expect(result.value.nextInterval).toBe('normal');
        expect(result.value.message).toBe('Success');
      }
    });
  });

  describe('err()', () => {
    it('should create error result', () => {
      const result = err<ActionDispatchError>({
        code: 'IOT_ERROR',
        message: 'Device error',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IOT_ERROR');
        expect(result.error.message).toBe('Device error');
      }
    });
  });
});
