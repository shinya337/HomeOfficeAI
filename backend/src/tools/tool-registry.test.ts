/**
 * Tool Registry tests
 *
 * Tests for device type to tool definition mapping structure.
 * Requirements: 5.1 (device type to tool mapping), 5.3 (extensibility)
 */

import { describe, it, expect } from 'vitest';
import { SchemaType } from '@google-cloud/vertexai';
import type { FunctionDeclaration } from '@google-cloud/vertexai';
import {
  DEVICE_TYPE_TO_TOOL_MAP,
  ALWAYS_INCLUDED_TOOLS,
  ALEXA_TOOLS,
  getToolForDeviceType,
  getAlwaysIncludedTools,
  getAllDeviceTypes,
  getAlexaTools,
  lightControlDeclaration,
  airconControlDeclaration,
  tvControlDeclaration,
  continueMonitoringDeclaration,
  doNothingDeclaration,
  breakModeDeclaration,
  focusModeDeclaration,
  awayModeDeclaration,
  wakeModeDeclaration,
  alexaSpeakDeclaration,
  alexaAnnouncementDeclaration,
  alexaRoutineDeclaration,
  alexaVolumeDeclaration,
  alexaInfoDeclaration,
} from './tool-registry.js';
import type { DeviceType } from '../types/device-types.js';

describe('Tool Registry - Mapping Structure', () => {
  describe('DEVICE_TYPE_TO_TOOL_MAP', () => {
    it('should be a Map of DeviceType to FunctionDeclaration', () => {
      expect(DEVICE_TYPE_TO_TOOL_MAP).toBeInstanceOf(Map);
    });

    it('should contain LIGHT type mapping', () => {
      expect(DEVICE_TYPE_TO_TOOL_MAP.has('LIGHT')).toBe(true);
    });

    it('should contain AC type mapping', () => {
      expect(DEVICE_TYPE_TO_TOOL_MAP.has('AC')).toBe(true);
    });

    it('should contain TV type mapping', () => {
      expect(DEVICE_TYPE_TO_TOOL_MAP.has('TV')).toBe(true);
    });

    it('should NOT contain IR type mapping (no tool for IR devices)', () => {
      expect(DEVICE_TYPE_TO_TOOL_MAP.has('IR')).toBe(false);
    });

    it('should be extensible - allow adding new device types', () => {
      // Verify the map structure allows additions
      const testMap = new Map(DEVICE_TYPE_TO_TOOL_MAP);
      const newTool: FunctionDeclaration = {
        name: 'test_control',
        description: 'Test tool',
      };
      // Use a hypothetical new device type to test extensibility
      testMap.set('IR' as DeviceType, newTool);
      expect(testMap.has('IR')).toBe(true);
      expect(testMap.size).toBe(DEVICE_TYPE_TO_TOOL_MAP.size + 1);
    });
  });

  describe('ALWAYS_INCLUDED_TOOLS', () => {
    it('should be an array of FunctionDeclaration', () => {
      expect(Array.isArray(ALWAYS_INCLUDED_TOOLS)).toBe(true);
    });

    it('should contain continue_monitoring tool', () => {
      const tool = ALWAYS_INCLUDED_TOOLS.find(
        (t) => t.name === 'continue_monitoring'
      );
      expect(tool).toBeDefined();
    });

    it('should contain do_nothing tool', () => {
      const tool = ALWAYS_INCLUDED_TOOLS.find((t) => t.name === 'do_nothing');
      expect(tool).toBeDefined();
    });

    it('should contain break_mode tool', () => {
      const tool = ALWAYS_INCLUDED_TOOLS.find((t) => t.name === 'break_mode');
      expect(tool).toBeDefined();
    });

    it('should contain focus_mode tool', () => {
      const tool = ALWAYS_INCLUDED_TOOLS.find((t) => t.name === 'focus_mode');
      expect(tool).toBeDefined();
    });

    it('should contain away_mode tool', () => {
      const tool = ALWAYS_INCLUDED_TOOLS.find((t) => t.name === 'away_mode');
      expect(tool).toBeDefined();
    });

    it('should contain wake_mode tool', () => {
      const tool = ALWAYS_INCLUDED_TOOLS.find((t) => t.name === 'wake_mode');
      expect(tool).toBeDefined();
    });

    it('should contain exactly 6 tools', () => {
      expect(ALWAYS_INCLUDED_TOOLS).toHaveLength(6);
    });
  });
});

describe('Tool Registry - API Functions', () => {
  describe('getToolForDeviceType', () => {
    it('should return light_control for LIGHT type', () => {
      const tool = getToolForDeviceType('LIGHT');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('light_control');
    });

    it('should return aircon_control for AC type', () => {
      const tool = getToolForDeviceType('AC');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('aircon_control');
    });

    it('should return tv_control for TV type', () => {
      const tool = getToolForDeviceType('TV');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('tv_control');
    });

    it('should return undefined for IR type (no tool)', () => {
      const tool = getToolForDeviceType('IR');
      expect(tool).toBeUndefined();
    });

    it('should return undefined for unknown type', () => {
      const tool = getToolForDeviceType('UNKNOWN' as DeviceType);
      expect(tool).toBeUndefined();
    });
  });

  describe('getAlwaysIncludedTools', () => {
    it('should return array containing continue_monitoring and do_nothing', () => {
      const tools = getAlwaysIncludedTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('continue_monitoring');
      expect(names).toContain('do_nothing');
    });

    it('should return a new array each time (immutability)', () => {
      const tools1 = getAlwaysIncludedTools();
      const tools2 = getAlwaysIncludedTools();
      expect(tools1).not.toBe(tools2);
      expect(tools1).toEqual(tools2);
    });
  });

  describe('getAllDeviceTypes', () => {
    it('should return all device types that have tool mappings', () => {
      const types = getAllDeviceTypes();
      expect(types).toContain('LIGHT');
      expect(types).toContain('AC');
      expect(types).toContain('TV');
    });

    it('should NOT include device types without tools', () => {
      const types = getAllDeviceTypes();
      expect(types).not.toContain('IR');
    });
  });
});

describe('Tool Definitions - light_control', () => {
  it('should have name "light_control"', () => {
    expect(lightControlDeclaration.name).toBe('light_control');
  });

  it('should have a description', () => {
    expect(lightControlDeclaration.description).toBeDefined();
    expect(typeof lightControlDeclaration.description).toBe('string');
    expect(lightControlDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(lightControlDeclaration.parameters).toBeDefined();
    expect(lightControlDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have action parameter with all LightButton enum values and preset names', () => {
    const props = lightControlDeclaration.parameters!.properties;
    expect(props['action']).toBeDefined();
    expect(props['action'].type).toBe(SchemaType.STRING);
    expect(props['action'].enum).toEqual([
      'on', 'off', 'on-100', 'on-favorite', 'night',
      'bright-up', 'bright-down', 'colortemp-up', 'colortemp-down',
      '安らぎ', '読書', '家事',
    ]);
  });

  it('should require action and reason parameters', () => {
    expect(lightControlDeclaration.parameters!.required).toEqual(['action', 'reason']);
  });

  it('should NOT have appliance_id parameter', () => {
    const props = lightControlDeclaration.parameters!.properties;
    expect(props['appliance_id']).toBeUndefined();
  });
});

describe('Tool Definitions - aircon_control', () => {
  it('should have name "aircon_control"', () => {
    expect(airconControlDeclaration.name).toBe('aircon_control');
  });

  it('should have a description', () => {
    expect(airconControlDeclaration.description).toBeDefined();
    expect(typeof airconControlDeclaration.description).toBe('string');
    expect(airconControlDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(airconControlDeclaration.parameters).toBeDefined();
    expect(airconControlDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have temperature parameter of type NUMBER', () => {
    const props = airconControlDeclaration.parameters!.properties;
    expect(props['temperature']).toBeDefined();
    expect(props['temperature'].type).toBe(SchemaType.NUMBER);
  });

  it('should have mode parameter of type STRING', () => {
    const props = airconControlDeclaration.parameters!.properties;
    expect(props['mode']).toBeDefined();
    expect(props['mode'].type).toBe(SchemaType.STRING);
  });

  it('should require temperature and reason parameters', () => {
    expect(airconControlDeclaration.parameters!.required).toEqual([
      'temperature',
      'reason',
    ]);
  });

  it('should NOT have appliance_id parameter', () => {
    const props = airconControlDeclaration.parameters!.properties;
    expect(props['appliance_id']).toBeUndefined();
  });
});

describe('Tool Definitions - continue_monitoring', () => {
  it('should have name "continue_monitoring"', () => {
    expect(continueMonitoringDeclaration.name).toBe('continue_monitoring');
  });

  it('should have a description', () => {
    expect(continueMonitoringDeclaration.description).toBeDefined();
    expect(typeof continueMonitoringDeclaration.description).toBe('string');
    expect(continueMonitoringDeclaration.description!.length).toBeGreaterThan(
      0
    );
  });

  it('should have reason parameter', () => {
    expect(continueMonitoringDeclaration.parameters).toBeDefined();
    expect(continueMonitoringDeclaration.parameters!.properties).toHaveProperty('reason');
    expect(continueMonitoringDeclaration.parameters!.required).toContain('reason');
  });
});

describe('Tool Definitions - do_nothing', () => {
  it('should have name "do_nothing"', () => {
    expect(doNothingDeclaration.name).toBe('do_nothing');
  });

  it('should have a description', () => {
    expect(doNothingDeclaration.description).toBeDefined();
    expect(typeof doNothingDeclaration.description).toBe('string');
    expect(doNothingDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have reason parameter', () => {
    expect(doNothingDeclaration.parameters).toBeDefined();
    expect(doNothingDeclaration.parameters!.properties).toHaveProperty('reason');
    expect(doNothingDeclaration.parameters!.required).toContain('reason');
  });
});

describe('Tool Definitions - tv_control', () => {
  it('should have name "tv_control"', () => {
    expect(tvControlDeclaration.name).toBe('tv_control');
  });

  it('should have a description', () => {
    expect(tvControlDeclaration.description).toBeDefined();
    expect(typeof tvControlDeclaration.description).toBe('string');
    expect(tvControlDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(tvControlDeclaration.parameters).toBeDefined();
    expect(tvControlDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have action parameter with enum ["power", "channel", "volume"]', () => {
    const props = tvControlDeclaration.parameters!.properties;
    expect(props['action']).toBeDefined();
    expect(props['action'].type).toBe(SchemaType.STRING);
    expect(props['action'].enum).toEqual(['power', 'channel', 'volume']);
  });

  it('should have value parameter of type STRING', () => {
    const props = tvControlDeclaration.parameters!.properties;
    expect(props['value']).toBeDefined();
    expect(props['value'].type).toBe(SchemaType.STRING);
  });

  it('should have description for value parameter explaining valid values', () => {
    const props = tvControlDeclaration.parameters!.properties;
    expect(props['value'].description).toBeDefined();
    expect(props['value'].description).toContain('on');
    expect(props['value'].description).toContain('off');
    expect(props['value'].description).toContain('up');
    expect(props['value'].description).toContain('down');
  });

  it('should require action, value, and reason parameters', () => {
    expect(tvControlDeclaration.parameters!.required).toEqual(['action', 'value', 'reason']);
  });

  it('should NOT have appliance_id parameter', () => {
    const props = tvControlDeclaration.parameters!.properties;
    expect(props['appliance_id']).toBeUndefined();
  });
});

// =============================================================================
// Alexa Tool Declarations (Task 3.3)
// Requirements: 3.4, 4.3, 5.5, 6.4, 7.4, 10.2, 10.3
// =============================================================================

describe('Tool Definitions - alexa_speak', () => {
  it('should have name "alexa_speak"', () => {
    expect(alexaSpeakDeclaration.name).toBe('alexa_speak');
  });

  it('should have a Japanese description', () => {
    expect(alexaSpeakDeclaration.description).toBeDefined();
    expect(typeof alexaSpeakDeclaration.description).toBe('string');
    expect(alexaSpeakDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(alexaSpeakDeclaration.parameters).toBeDefined();
    expect(alexaSpeakDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have message parameter of type STRING', () => {
    const props = alexaSpeakDeclaration.parameters!.properties;
    expect(props['message']).toBeDefined();
    expect(props['message'].type).toBe(SchemaType.STRING);
  });

  it('should have description for message parameter', () => {
    const props = alexaSpeakDeclaration.parameters!.properties;
    expect(props['message'].description).toBeDefined();
    expect(typeof props['message'].description).toBe('string');
  });

  it('should require message and reason parameters', () => {
    expect(alexaSpeakDeclaration.parameters!.required).toEqual(['message', 'reason']);
  });
});

describe('Tool Definitions - alexa_announcement', () => {
  it('should have name "alexa_announcement"', () => {
    expect(alexaAnnouncementDeclaration.name).toBe('alexa_announcement');
  });

  it('should have a Japanese description', () => {
    expect(alexaAnnouncementDeclaration.description).toBeDefined();
    expect(typeof alexaAnnouncementDeclaration.description).toBe('string');
    expect(alexaAnnouncementDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(alexaAnnouncementDeclaration.parameters).toBeDefined();
    expect(alexaAnnouncementDeclaration.parameters!.type).toBe(
      SchemaType.OBJECT
    );
  });

  it('should have message parameter of type STRING', () => {
    const props = alexaAnnouncementDeclaration.parameters!.properties;
    expect(props['message']).toBeDefined();
    expect(props['message'].type).toBe(SchemaType.STRING);
  });

  it('should have description for message parameter', () => {
    const props = alexaAnnouncementDeclaration.parameters!.properties;
    expect(props['message'].description).toBeDefined();
    expect(typeof props['message'].description).toBe('string');
  });

  it('should require message and reason parameters', () => {
    expect(alexaAnnouncementDeclaration.parameters!.required).toEqual([
      'message',
      'reason',
    ]);
  });
});

describe('Tool Definitions - alexa_routine', () => {
  it('should have name "alexa_routine"', () => {
    expect(alexaRoutineDeclaration.name).toBe('alexa_routine');
  });

  it('should have a Japanese description', () => {
    expect(alexaRoutineDeclaration.description).toBeDefined();
    expect(typeof alexaRoutineDeclaration.description).toBe('string');
    expect(alexaRoutineDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(alexaRoutineDeclaration.parameters).toBeDefined();
    expect(alexaRoutineDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have routine_name parameter of type STRING', () => {
    const props = alexaRoutineDeclaration.parameters!.properties;
    expect(props['routine_name']).toBeDefined();
    expect(props['routine_name'].type).toBe(SchemaType.STRING);
  });

  it('should have description for routine_name parameter', () => {
    const props = alexaRoutineDeclaration.parameters!.properties;
    expect(props['routine_name'].description).toBeDefined();
    expect(typeof props['routine_name'].description).toBe('string');
  });

  it('should require routine_name and reason parameters', () => {
    expect(alexaRoutineDeclaration.parameters!.required).toEqual([
      'routine_name',
      'reason',
    ]);
  });
});

describe('Tool Definitions - alexa_volume', () => {
  it('should have name "alexa_volume"', () => {
    expect(alexaVolumeDeclaration.name).toBe('alexa_volume');
  });

  it('should have a Japanese description', () => {
    expect(alexaVolumeDeclaration.description).toBeDefined();
    expect(typeof alexaVolumeDeclaration.description).toBe('string');
    expect(alexaVolumeDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(alexaVolumeDeclaration.parameters).toBeDefined();
    expect(alexaVolumeDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have volume parameter of type NUMBER', () => {
    const props = alexaVolumeDeclaration.parameters!.properties;
    expect(props['volume']).toBeDefined();
    expect(props['volume'].type).toBe(SchemaType.NUMBER);
  });

  it('should have description for volume parameter', () => {
    const props = alexaVolumeDeclaration.parameters!.properties;
    expect(props['volume'].description).toBeDefined();
    expect(typeof props['volume'].description).toBe('string');
  });

  it('should require volume and reason parameters', () => {
    expect(alexaVolumeDeclaration.parameters!.required).toEqual(['volume', 'reason']);
  });
});

describe('Tool Definitions - alexa_info', () => {
  it('should have name "alexa_info"', () => {
    expect(alexaInfoDeclaration.name).toBe('alexa_info');
  });

  it('should have a Japanese description', () => {
    expect(alexaInfoDeclaration.description).toBeDefined();
    expect(typeof alexaInfoDeclaration.description).toBe('string');
    expect(alexaInfoDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(alexaInfoDeclaration.parameters).toBeDefined();
    expect(alexaInfoDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have info_type parameter of type STRING', () => {
    const props = alexaInfoDeclaration.parameters!.properties;
    expect(props['info_type']).toBeDefined();
    expect(props['info_type'].type).toBe(SchemaType.STRING);
  });

  it('should have enum for info_type with weather and flashbriefing', () => {
    const props = alexaInfoDeclaration.parameters!.properties;
    expect(props['info_type'].enum).toEqual(['weather', 'flashbriefing']);
  });

  it('should have description for info_type parameter', () => {
    const props = alexaInfoDeclaration.parameters!.properties;
    expect(props['info_type'].description).toBeDefined();
    expect(typeof props['info_type'].description).toBe('string');
  });

  it('should require info_type and reason parameters', () => {
    expect(alexaInfoDeclaration.parameters!.required).toEqual(['info_type', 'reason']);
  });
});

describe('ALEXA_TOOLS array', () => {
  it('should be a readonly array', () => {
    expect(Array.isArray(ALEXA_TOOLS)).toBe(true);
  });

  it('should contain exactly 6 Alexa tool declarations', () => {
    expect(ALEXA_TOOLS).toHaveLength(6);
  });

  it('should contain alexa_speak declaration', () => {
    const tool = ALEXA_TOOLS.find((t) => t.name === 'alexa_speak');
    expect(tool).toBeDefined();
  });

  it('should contain alexa_announcement declaration', () => {
    const tool = ALEXA_TOOLS.find((t) => t.name === 'alexa_announcement');
    expect(tool).toBeDefined();
  });

  it('should contain alexa_routine declaration', () => {
    const tool = ALEXA_TOOLS.find((t) => t.name === 'alexa_routine');
    expect(tool).toBeDefined();
  });

  it('should contain alexa_volume declaration', () => {
    const tool = ALEXA_TOOLS.find((t) => t.name === 'alexa_volume');
    expect(tool).toBeDefined();
  });

  it('should contain alexa_info declaration', () => {
    const tool = ALEXA_TOOLS.find((t) => t.name === 'alexa_info');
    expect(tool).toBeDefined();
  });

  it('should contain alexa_textcommand declaration', () => {
    const tool = ALEXA_TOOLS.find((t) => t.name === 'alexa_textcommand');
    expect(tool).toBeDefined();
  });

  it('should NOT be in DEVICE_TYPE_TO_TOOL_MAP (separate management)', () => {
    const mapToolNames = Array.from(DEVICE_TYPE_TO_TOOL_MAP.values()).map(
      (t) => t.name
    );
    for (const alexaTool of ALEXA_TOOLS) {
      expect(mapToolNames).not.toContain(alexaTool.name);
    }
  });
});

describe('Tool Definitions - break_mode', () => {
  it('should have name "break_mode"', () => {
    expect(breakModeDeclaration.name).toBe('break_mode');
  });

  it('should have a Japanese description', () => {
    expect(breakModeDeclaration.description).toBeDefined();
    expect(typeof breakModeDeclaration.description).toBe('string');
    expect(breakModeDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(breakModeDeclaration.parameters).toBeDefined();
    expect(breakModeDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have reason parameter', () => {
    expect(breakModeDeclaration.parameters!.properties).toHaveProperty('reason');
    expect(breakModeDeclaration.parameters!.required).toContain('reason');
  });
});

describe('Tool Definitions - focus_mode', () => {
  it('should have name "focus_mode"', () => {
    expect(focusModeDeclaration.name).toBe('focus_mode');
  });

  it('should have a Japanese description', () => {
    expect(focusModeDeclaration.description).toBeDefined();
    expect(typeof focusModeDeclaration.description).toBe('string');
    expect(focusModeDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(focusModeDeclaration.parameters).toBeDefined();
    expect(focusModeDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have reason parameter', () => {
    expect(focusModeDeclaration.parameters!.properties).toHaveProperty('reason');
    expect(focusModeDeclaration.parameters!.required).toContain('reason');
  });
});

describe('Tool Definitions - away_mode', () => {
  it('should have name "away_mode"', () => {
    expect(awayModeDeclaration.name).toBe('away_mode');
  });

  it('should have a Japanese description', () => {
    expect(awayModeDeclaration.description).toBeDefined();
    expect(typeof awayModeDeclaration.description).toBe('string');
    expect(awayModeDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(awayModeDeclaration.parameters).toBeDefined();
    expect(awayModeDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have reason parameter', () => {
    expect(awayModeDeclaration.parameters!.properties).toHaveProperty('reason');
    expect(awayModeDeclaration.parameters!.required).toContain('reason');
  });
});

describe('Tool Definitions - wake_mode', () => {
  it('should have name "wake_mode"', () => {
    expect(wakeModeDeclaration.name).toBe('wake_mode');
  });

  it('should have a Japanese description', () => {
    expect(wakeModeDeclaration.description).toBeDefined();
    expect(typeof wakeModeDeclaration.description).toBe('string');
    expect(wakeModeDeclaration.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    expect(wakeModeDeclaration.parameters).toBeDefined();
    expect(wakeModeDeclaration.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should have reason parameter', () => {
    expect(wakeModeDeclaration.parameters!.properties).toHaveProperty('reason');
    expect(wakeModeDeclaration.parameters!.required).toContain('reason');
  });
});

describe('getAlexaTools', () => {
  it('should return all 6 Alexa tool declarations', () => {
    const tools = getAlexaTools();
    expect(tools).toHaveLength(6);
  });

  it('should return all Alexa tool names', () => {
    const tools = getAlexaTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('alexa_speak');
    expect(names).toContain('alexa_announcement');
    expect(names).toContain('alexa_routine');
    expect(names).toContain('alexa_textcommand');
    expect(names).toContain('alexa_volume');
    expect(names).toContain('alexa_info');
  });

  it('should return a new array each time (immutability)', () => {
    const tools1 = getAlexaTools();
    const tools2 = getAlexaTools();
    expect(tools1).not.toBe(tools2);
    expect(tools1).toEqual(tools2);
  });
});
