/**
 * DynamicToolBuilder tests
 *
 * Tests for dynamic tool generation based on allowed devices.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDynamicToolBuilder,
  type DynamicToolBuilderService,
} from './dynamic-tool-builder.js';
import type { AllowedDevice } from '../types/device-types.js';

describe('DynamicToolBuilder - createDynamicToolBuilder', () => {
  it('should create a DynamicToolBuilderService instance', () => {
    const builder = createDynamicToolBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.generateTools).toBe('function');
  });
});

describe('DynamicToolBuilder - generateTools', () => {
  let builder: DynamicToolBuilderService;

  beforeEach(() => {
    builder = createDynamicToolBuilder();
  });

  describe('Always-included tools (Requirement 4.6)', () => {
    it('should always include continue_monitoring tool', () => {
      const tools = builder.generateTools([]);
      const names = tools.map((t) => t.name);
      expect(names).toContain('continue_monitoring');
    });

    it('should always include do_nothing tool', () => {
      const tools = builder.generateTools([]);
      const names = tools.map((t) => t.name);
      expect(names).toContain('do_nothing');
    });

    it('should include always-included tools even with allowed devices', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).toContain('continue_monitoring');
      expect(names).toContain('do_nothing');
    });
  });

  describe('Empty allowed devices (Requirement 4.2)', () => {
    it('should return only always-included tools when no devices allowed', () => {
      const tools = builder.generateTools([]);
      expect(tools).toHaveLength(6);
      const names = tools.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining(['continue_monitoring', 'do_nothing'])
      );
    });

    it('should not include device-specific tools when no devices allowed', () => {
      const tools = builder.generateTools([]);
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('light_control');
      expect(names).not.toContain('aircon_control');
      expect(names).not.toContain('tv_control');
    });
  });

  describe('LIGHT device allowed (Requirement 4.3)', () => {
    it('should include light_control tool when LIGHT device is allowed', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).toContain('light_control');
    });

    it('should include light_control only once even with multiple LIGHT devices', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
        { id: 'light-2', type: 'LIGHT' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const lightTools = tools.filter((t) => t.name === 'light_control');
      expect(lightTools).toHaveLength(1);
    });
  });

  describe('AC device allowed (Requirement 4.4)', () => {
    it('should include aircon_control tool when AC device is allowed', () => {
      const allowedDevices: AllowedDevice[] = [{ id: 'ac-1', type: 'AC' }];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).toContain('aircon_control');
    });

    it('should include aircon_control only once even with multiple AC devices', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'ac-1', type: 'AC' },
        { id: 'ac-2', type: 'AC' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const acTools = tools.filter((t) => t.name === 'aircon_control');
      expect(acTools).toHaveLength(1);
    });
  });

  describe('TV device allowed (Requirement 4.5)', () => {
    it('should include tv_control tool when TV device is allowed', () => {
      const allowedDevices: AllowedDevice[] = [{ id: 'tv-1', type: 'TV' }];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).toContain('tv_control');
    });

    it('should include tv_control only once even with multiple TV devices', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'tv-1', type: 'TV' },
        { id: 'tv-2', type: 'TV' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const tvTools = tools.filter((t) => t.name === 'tv_control');
      expect(tvTools).toHaveLength(1);
    });
  });

  describe('IR device (no tool)', () => {
    it('should not add any device tool for IR type', () => {
      const allowedDevices: AllowedDevice[] = [{ id: 'ir-1', type: 'IR' }];
      const tools = builder.generateTools(allowedDevices);
      // Should only have always-included tools
      expect(tools).toHaveLength(6);
      const names = tools.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining(['continue_monitoring', 'do_nothing'])
      );
    });
  });

  describe('Multiple device types (Requirement 4.1, 4.2)', () => {
    it('should include tools for all allowed device types', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
        { id: 'ac-1', type: 'AC' },
        { id: 'tv-1', type: 'TV' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).toContain('light_control');
      expect(names).toContain('aircon_control');
      expect(names).toContain('tv_control');
      expect(names).toContain('continue_monitoring');
      expect(names).toContain('do_nothing');
    });

    it('should return correct total count with all device types', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
        { id: 'ac-1', type: 'AC' },
        { id: 'tv-1', type: 'TV' },
      ];
      const tools = builder.generateTools(allowedDevices);
      // 3 device tools + 6 always-included (IR has no tool)
      expect(tools).toHaveLength(9);
    });

    it('should not include tools for device types not in allowed list', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('aircon_control');
      expect(names).not.toContain('tv_control');
    });
  });

  describe('Backward compatibility - undefined allowed devices', () => {
    it('should return all tools when allowedDevices is undefined', () => {
      const tools = builder.generateTools(undefined);
      const names = tools.map((t) => t.name);
      expect(names).toContain('light_control');
      expect(names).toContain('aircon_control');
      expect(names).toContain('tv_control');
      expect(names).toContain('continue_monitoring');
      expect(names).toContain('do_nothing');
    });

    it('should return 7 total tools when allowedDevices is undefined', () => {
      const tools = builder.generateTools(undefined);
      // 3 device tools + 6 always-included (IR has no tool)
      expect(tools).toHaveLength(9);
    });
  });

  describe('ALEXA device allowed (Requirement 10.2, 10.3)', () => {
    it('should include all 6 Alexa tools when ALEXA device is allowed', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).toContain('alexa_speak');
      expect(names).toContain('alexa_announcement');
      expect(names).toContain('alexa_routine');
      expect(names).toContain('alexa_volume');
      expect(names).toContain('alexa_info');
      expect(names).toContain('alexa_textcommand');
    });

    it('should return 8 total tools when only ALEXA device is allowed', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      // 6 Alexa tools + 6 always-included
      expect(tools).toHaveLength(12);
    });

    it('should not include Alexa tools when ALEXA is not in allowed devices', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('alexa_speak');
      expect(names).not.toContain('alexa_announcement');
      expect(names).not.toContain('alexa_routine');
      expect(names).not.toContain('alexa_volume');
      expect(names).not.toContain('alexa_info');
    });

    it('should include Alexa tools only once even with multiple ALEXA devices', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
        { id: 'alexa-2', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const alexaSpeakTools = tools.filter((t) => t.name === 'alexa_speak');
      expect(alexaSpeakTools).toHaveLength(1);
      // 6 Alexa tools + 6 always-included
      expect(tools).toHaveLength(12);
    });

    it('should include both Alexa and other device tools when mixed', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
        { id: 'ac-1', type: 'AC' },
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      // Regular device tools
      expect(names).toContain('light_control');
      expect(names).toContain('aircon_control');
      // Alexa tools
      expect(names).toContain('alexa_speak');
      expect(names).toContain('alexa_announcement');
      expect(names).toContain('alexa_routine');
      expect(names).toContain('alexa_volume');
      expect(names).toContain('alexa_info');
      // Always-included
      expect(names).toContain('continue_monitoring');
      expect(names).toContain('do_nothing');
      // 2 device tools + 6 Alexa tools + 6 always-included = 14
      expect(tools).toHaveLength(14);
    });

    it('should not include Alexa tools when allowed devices is empty', () => {
      const tools = builder.generateTools([]);
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('alexa_speak');
      expect(names).not.toContain('alexa_announcement');
    });
  });

  describe('ALEXA device integration tests (Requirement 10.2, 10.3) - Task 5.2', () => {
    it('should NOT include Alexa tools when allowedDevices is undefined (backward compat)', () => {
      const tools = builder.generateTools(undefined);
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('alexa_speak');
      expect(names).not.toContain('alexa_announcement');
      expect(names).not.toContain('alexa_routine');
      expect(names).not.toContain('alexa_volume');
      expect(names).not.toContain('alexa_info');
    });

    it('should exclude Alexa tools when all non-ALEXA device types are allowed', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
        { id: 'ac-1', type: 'AC' },
        { id: 'tv-1', type: 'TV' },
        { id: 'ir-1', type: 'IR' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      // Non-ALEXA device tools should be present
      expect(names).toContain('light_control');
      expect(names).toContain('aircon_control');
      expect(names).toContain('tv_control');
      // Alexa tools must be excluded (Req 10.3)
      expect(names).not.toContain('alexa_speak');
      expect(names).not.toContain('alexa_announcement');
      expect(names).not.toContain('alexa_routine');
      expect(names).not.toContain('alexa_volume');
      expect(names).not.toContain('alexa_info');
      // 3 device tools + 6 always-included (IR has no tool)
      expect(tools).toHaveLength(9);
    });

    it('should include only Alexa tools and always-included when ALEXA + IR are allowed', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
        { id: 'ir-1', type: 'IR' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      // Alexa tools should be included (Req 10.2)
      expect(names).toContain('alexa_speak');
      expect(names).toContain('alexa_announcement');
      expect(names).toContain('alexa_routine');
      expect(names).toContain('alexa_volume');
      expect(names).toContain('alexa_info');
      // IR has no tool
      expect(names).not.toContain('ir_control');
      // Always-included
      expect(names).toContain('continue_monitoring');
      expect(names).toContain('do_nothing');
      // 6 Alexa + 0 IR + 6 always = 12
      expect(tools).toHaveLength(12);
    });

    it('should include all device types plus Alexa when every type is allowed', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
        { id: 'ac-1', type: 'AC' },
        { id: 'tv-1', type: 'TV' },
        { id: 'ir-1', type: 'IR' },
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      // All device tools
      expect(names).toContain('light_control');
      expect(names).toContain('aircon_control');
      expect(names).toContain('tv_control');
      // All Alexa tools
      expect(names).toContain('alexa_speak');
      expect(names).toContain('alexa_announcement');
      expect(names).toContain('alexa_routine');
      expect(names).toContain('alexa_volume');
      expect(names).toContain('alexa_info');
      // Always-included
      expect(names).toContain('continue_monitoring');
      expect(names).toContain('do_nothing');
      // 3 device + 6 Alexa + 6 always = 15 (IR has no tool)
      expect(tools).toHaveLength(15);
    });

    it('should generate alexa_speak tool with correct parameter schema', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const speakTool = tools.find((t) => t.name === 'alexa_speak');
      expect(speakTool).toBeDefined();
      expect(speakTool!.description).toBeDefined();
      expect(speakTool!.parameters).toBeDefined();
      expect(speakTool!.parameters!.properties).toHaveProperty('message');
      expect(speakTool!.parameters!.required).toContain('message');
    });

    it('should generate alexa_announcement tool with correct parameter schema', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const announceTool = tools.find((t) => t.name === 'alexa_announcement');
      expect(announceTool).toBeDefined();
      expect(announceTool!.description).toBeDefined();
      expect(announceTool!.parameters).toBeDefined();
      expect(announceTool!.parameters!.properties).toHaveProperty('message');
      expect(announceTool!.parameters!.required).toContain('message');
    });

    it('should generate alexa_routine tool with correct parameter schema', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const routineTool = tools.find((t) => t.name === 'alexa_routine');
      expect(routineTool).toBeDefined();
      expect(routineTool!.description).toBeDefined();
      expect(routineTool!.parameters).toBeDefined();
      expect(routineTool!.parameters!.properties).toHaveProperty('routine_name');
      expect(routineTool!.parameters!.required).toContain('routine_name');
    });

    it('should generate alexa_volume tool with correct parameter schema', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const volumeTool = tools.find((t) => t.name === 'alexa_volume');
      expect(volumeTool).toBeDefined();
      expect(volumeTool!.description).toBeDefined();
      expect(volumeTool!.parameters).toBeDefined();
      expect(volumeTool!.parameters!.properties).toHaveProperty('volume');
      expect(volumeTool!.parameters!.required).toContain('volume');
    });

    it('should generate alexa_info tool with correct parameter schema and enum', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'alexa-1', type: 'ALEXA' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const infoTool = tools.find((t) => t.name === 'alexa_info');
      expect(infoTool).toBeDefined();
      expect(infoTool!.description).toBeDefined();
      expect(infoTool!.parameters).toBeDefined();
      expect(infoTool!.parameters!.properties).toHaveProperty('info_type');
      expect(infoTool!.parameters!.required).toContain('info_type');
      // Verify enum values
      const infoTypeParam = infoTool!.parameters!.properties!['info_type'] as { enum?: string[] };
      expect(infoTypeParam.enum).toEqual(['weather', 'flashbriefing']);
    });

    it('should not include Alexa tools when only TV and LIGHT are allowed', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'tv-1', type: 'TV' },
        { id: 'light-1', type: 'LIGHT' },
      ];
      const tools = builder.generateTools(allowedDevices);
      const names = tools.map((t) => t.name);
      expect(names).toContain('tv_control');
      expect(names).toContain('light_control');
      // No Alexa tools (Req 10.3)
      const alexaTools = tools.filter((t) => t.name.startsWith('alexa_'));
      expect(alexaTools).toHaveLength(0);
    });
  });

  describe('Immutability', () => {
    it('should return a new array each time', () => {
      const allowedDevices: AllowedDevice[] = [
        { id: 'light-1', type: 'LIGHT' },
      ];
      const tools1 = builder.generateTools(allowedDevices);
      const tools2 = builder.generateTools(allowedDevices);
      expect(tools1).not.toBe(tools2);
    });
  });
});
