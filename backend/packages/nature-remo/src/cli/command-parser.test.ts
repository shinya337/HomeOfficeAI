/**
 * CLI Command Parser Tests
 *
 * TDD tests for command line argument parsing.
 * Requirements: 2.1, 3.1, 4.1, 5.1
 */

import { describe, it, expect } from 'vitest';
import {
  parseCommand,
  ParsedCommand,
  DevicesCommand,
  AppliancesCommand,
  AirconCommand,
  LightCommand,
  HelpCommand,
  ParseError,
  getHelpMessage,
} from './command-parser.js';

describe('parseCommand', () => {
  describe('devices command', () => {
    it('should parse "devices" command', () => {
      const result = parseCommand(['node', 'index.ts', 'devices']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('devices');
      }
    });
  });

  describe('appliances command', () => {
    it('should parse "appliances" command', () => {
      const result = parseCommand(['node', 'index.ts', 'appliances']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('appliances');
      }
    });
  });

  describe('aircon command', () => {
    it('should parse "aircon" command with appliance id', () => {
      const result = parseCommand(['node', 'index.ts', 'aircon', 'abc123']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('aircon');
        const cmd = result.data as AirconCommand;
        expect(cmd.applianceId).toBe('abc123');
      }
    });

    it('should parse --temp option', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--temp',
        '26',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const cmd = result.data as AirconCommand;
        expect(cmd.temperature).toBe('26');
      }
    });

    it('should parse --mode option', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--mode',
        'cool',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const cmd = result.data as AirconCommand;
        expect(cmd.mode).toBe('cool');
      }
    });

    it('should parse --volume option', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--volume',
        'auto',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const cmd = result.data as AirconCommand;
        expect(cmd.volume).toBe('auto');
      }
    });

    it('should parse --off option', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--off',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const cmd = result.data as AirconCommand;
        expect(cmd.powerOff).toBe(true);
      }
    });

    it('should parse multiple aircon options together', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--temp',
        '24',
        '--mode',
        'cool',
        '--volume',
        '2',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const cmd = result.data as AirconCommand;
        expect(cmd.applianceId).toBe('abc123');
        expect(cmd.temperature).toBe('24');
        expect(cmd.mode).toBe('cool');
        expect(cmd.volume).toBe('2');
      }
    });

    it('should fail when appliance id is missing', () => {
      const result = parseCommand(['node', 'index.ts', 'aircon']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_ARGUMENT');
      }
    });

    it('should fail when --temp value is missing', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--temp',
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_OPTION_VALUE');
      }
    });

    it('should fail when --mode has invalid value', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--mode',
        'invalid',
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_OPTION_VALUE');
      }
    });

    it('should fail when --volume has invalid value', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--volume',
        'invalid',
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_OPTION_VALUE');
      }
    });
  });

  describe('light command', () => {
    it('should parse "light" command with appliance id and "on"', () => {
      const result = parseCommand(['node', 'index.ts', 'light', 'def456', 'on']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('light');
        const cmd = result.data as LightCommand;
        expect(cmd.applianceId).toBe('def456');
        expect(cmd.action).toBe('on');
      }
    });

    it('should parse "light" command with appliance id and "off"', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'light',
        'def456',
        'off',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const cmd = result.data as LightCommand;
        expect(cmd.action).toBe('off');
      }
    });

    it('should fail when appliance id is missing', () => {
      const result = parseCommand(['node', 'index.ts', 'light']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_ARGUMENT');
      }
    });

    it('should fail when action is missing', () => {
      const result = parseCommand(['node', 'index.ts', 'light', 'def456']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_ARGUMENT');
      }
    });

    it('should fail when action is invalid', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'light',
        'def456',
        'invalid',
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ARGUMENT');
      }
    });
  });

  describe('help command', () => {
    it('should parse --help flag', () => {
      const result = parseCommand(['node', 'index.ts', '--help']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('help');
      }
    });

    it('should parse -h flag', () => {
      const result = parseCommand(['node', 'index.ts', '-h']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('help');
      }
    });

    it('should parse help command', () => {
      const result = parseCommand(['node', 'index.ts', 'help']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('help');
      }
    });

    it('should show help when no command is provided', () => {
      const result = parseCommand(['node', 'index.ts']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('help');
      }
    });
  });

  describe('error handling', () => {
    it('should fail for unknown command', () => {
      const result = parseCommand(['node', 'index.ts', 'unknown']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNKNOWN_COMMAND');
        expect(result.error.message).toContain('unknown');
      }
    });

    it('should fail for unknown option', () => {
      const result = parseCommand([
        'node',
        'index.ts',
        'aircon',
        'abc123',
        '--unknown',
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNKNOWN_OPTION');
        expect(result.error.message).toContain('--unknown');
      }
    });
  });
});

describe('getHelpMessage', () => {
  it('should return help message containing command descriptions', () => {
    const help = getHelpMessage();

    expect(help).toContain('devices');
    expect(help).toContain('appliances');
    expect(help).toContain('aircon');
    expect(help).toContain('light');
    expect(help).toContain('--temp');
    expect(help).toContain('--mode');
    expect(help).toContain('--volume');
    expect(help).toContain('--off');
  });

  it('should include usage example', () => {
    const help = getHelpMessage();

    expect(help).toContain('Usage:');
    expect(help).toContain('npx tsx');
  });

  it('should include valid mode values', () => {
    const help = getHelpMessage();

    expect(help).toContain('cool');
    expect(help).toContain('warm');
    expect(help).toContain('dry');
    expect(help).toContain('auto');
  });
});
