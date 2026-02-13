/**
 * ToolDefinitions テスト
 *
 * 4つのFunctionDeclaration（light_control, aircon_control, continue_monitoring, do_nothing）が
 * Vertex AI SDK の FunctionDeclaration 形式で正しく定義されていることを検証する。
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect } from 'vitest';
import { SchemaType } from '@google-cloud/vertexai';
import { getToolDeclarations } from './tool-definitions.js';
import type { FunctionDeclaration } from '@google-cloud/vertexai';

describe('getToolDeclarations', () => {
  it('should return an array of 4 FunctionDeclarations', () => {
    const tools = getToolDeclarations();
    expect(tools).toHaveLength(4);
  });

  it('should return FunctionDeclaration[] type', () => {
    const tools: FunctionDeclaration[] = getToolDeclarations();
    expect(Array.isArray(tools)).toBe(true);
  });
});

describe('light_control tool definition', () => {
  const findTool = () => {
    const tools = getToolDeclarations();
    return tools.find((t) => t.name === 'light_control');
  };

  it('should have name "light_control"', () => {
    const tool = findTool();
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('light_control');
  });

  it('should have a description', () => {
    const tool = findTool();
    expect(tool!.description).toBeDefined();
    expect(typeof tool!.description).toBe('string');
    expect(tool!.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    const tool = findTool();
    expect(tool!.parameters).toBeDefined();
    expect(tool!.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should NOT have appliance_id parameter (Req 3.1)', () => {
    const tool = findTool();
    const props = tool!.parameters!.properties;
    expect(props['appliance_id']).toBeUndefined();
  });

  it('should have action parameter of type STRING with enum ["on", "off"]', () => {
    const tool = findTool();
    const props = tool!.parameters!.properties;
    expect(props['action']).toBeDefined();
    expect(props['action'].type).toBe(SchemaType.STRING);
    expect(props['action'].enum).toEqual(['on', 'off']);
  });

  it('should require only action (Req 3.3)', () => {
    const tool = findTool();
    expect(tool!.parameters!.required).toEqual(['action']);
  });
});

describe('aircon_control tool definition', () => {
  const findTool = () => {
    const tools = getToolDeclarations();
    return tools.find((t) => t.name === 'aircon_control');
  };

  it('should have name "aircon_control"', () => {
    const tool = findTool();
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('aircon_control');
  });

  it('should have a description', () => {
    const tool = findTool();
    expect(tool!.description).toBeDefined();
    expect(typeof tool!.description).toBe('string');
    expect(tool!.description!.length).toBeGreaterThan(0);
  });

  it('should have parameters of type OBJECT', () => {
    const tool = findTool();
    expect(tool!.parameters).toBeDefined();
    expect(tool!.parameters!.type).toBe(SchemaType.OBJECT);
  });

  it('should NOT have appliance_id parameter (Req 3.2)', () => {
    const tool = findTool();
    const props = tool!.parameters!.properties;
    expect(props['appliance_id']).toBeUndefined();
  });

  it('should have temperature parameter of type NUMBER', () => {
    const tool = findTool();
    const props = tool!.parameters!.properties;
    expect(props['temperature']).toBeDefined();
    expect(props['temperature'].type).toBe(SchemaType.NUMBER);
  });

  it('should have mode parameter of type STRING (optional)', () => {
    const tool = findTool();
    const props = tool!.parameters!.properties;
    expect(props['mode']).toBeDefined();
    expect(props['mode'].type).toBe(SchemaType.STRING);
  });

  it('should require only temperature, not mode (Req 3.4)', () => {
    const tool = findTool();
    expect(tool!.parameters!.required).toEqual(['temperature']);
  });
});

describe('continue_monitoring tool definition', () => {
  const findTool = () => {
    const tools = getToolDeclarations();
    return tools.find((t) => t.name === 'continue_monitoring');
  };

  it('should have name "continue_monitoring"', () => {
    const tool = findTool();
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('continue_monitoring');
  });

  it('should have a description', () => {
    const tool = findTool();
    expect(tool!.description).toBeDefined();
    expect(typeof tool!.description).toBe('string');
    expect(tool!.description!.length).toBeGreaterThan(0);
  });

  it('should have no parameters (undefined)', () => {
    const tool = findTool();
    expect(tool!.parameters).toBeUndefined();
  });
});

describe('do_nothing tool definition', () => {
  const findTool = () => {
    const tools = getToolDeclarations();
    return tools.find((t) => t.name === 'do_nothing');
  };

  it('should have name "do_nothing"', () => {
    const tool = findTool();
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('do_nothing');
  });

  it('should have a description', () => {
    const tool = findTool();
    expect(tool!.description).toBeDefined();
    expect(typeof tool!.description).toBe('string');
    expect(tool!.description!.length).toBeGreaterThan(0);
  });

  it('should have no parameters (undefined)', () => {
    const tool = findTool();
    expect(tool!.parameters).toBeUndefined();
  });
});
