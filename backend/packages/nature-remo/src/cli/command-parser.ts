/**
 * CLI Command Parser
 *
 * Parses process.argv to extract subcommands and options for the Nature Remo CLI.
 * Supports: devices, appliances, aircon, light commands with validation.
 *
 * Requirements: 2.1, 3.1, 4.1, 5.1
 */

import type { Result, AirconMode, AirconVolume } from '../types/index.js';

// ============================================================================
// Parse Error Types
// ============================================================================

/**
 * Parse error codes.
 */
export type ParseErrorCode =
  | 'UNKNOWN_COMMAND'
  | 'UNKNOWN_OPTION'
  | 'MISSING_ARGUMENT'
  | 'MISSING_OPTION_VALUE'
  | 'INVALID_ARGUMENT'
  | 'INVALID_OPTION_VALUE';

/**
 * Parse error structure.
 */
export interface ParseError {
  code: ParseErrorCode;
  message: string;
}

// ============================================================================
// Parsed Command Types
// ============================================================================

/**
 * Devices command - list all devices and sensor values.
 */
export interface DevicesCommand {
  type: 'devices';
}

/**
 * Appliances command - list all appliances.
 */
export interface AppliancesCommand {
  type: 'appliances';
}

/**
 * Aircon command - control air conditioner.
 */
export interface AirconCommand {
  type: 'aircon';
  applianceId: string;
  temperature?: string;
  mode?: AirconMode;
  volume?: AirconVolume;
  powerOff?: boolean;
}

/**
 * Light command - control light on/off.
 */
export interface LightCommand {
  type: 'light';
  applianceId: string;
  action: 'on' | 'off';
}

/**
 * Help command - display help message.
 */
export interface HelpCommand {
  type: 'help';
}

/**
 * Union of all parsed command types.
 */
export type ParsedCommand =
  | DevicesCommand
  | AppliancesCommand
  | AirconCommand
  | LightCommand
  | HelpCommand;

// ============================================================================
// Valid Option Values
// ============================================================================

const VALID_MODES: ReadonlySet<string> = new Set([
  'cool',
  'warm',
  'dry',
  'blow',
  'auto',
]);

const VALID_VOLUMES: ReadonlySet<string> = new Set([
  'auto',
  '1',
  '2',
  '3',
  '4',
]);

const AIRCON_OPTIONS: ReadonlySet<string> = new Set([
  '--temp',
  '--mode',
  '--volume',
  '--off',
]);

// ============================================================================
// Helper Functions
// ============================================================================

function createError(
  code: ParseErrorCode,
  message: string
): Result<ParsedCommand, ParseError> {
  return {
    success: false,
    error: { code, message },
  };
}

function createSuccess(
  command: ParsedCommand
): Result<ParsedCommand, ParseError> {
  return {
    success: true,
    data: command,
  };
}

// ============================================================================
// Command Parsers
// ============================================================================

/**
 * Parse aircon command with its options.
 */
function parseAirconCommand(
  args: string[]
): Result<ParsedCommand, ParseError> {
  // args[0] is 'aircon', args[1] should be appliance ID
  if (args.length < 2 || args[1]?.startsWith('--')) {
    return createError(
      'MISSING_ARGUMENT',
      'aircon コマンドにはアプライアンスIDが必要です'
    );
  }

  const applianceId = args[1];
  const command: AirconCommand = {
    type: 'aircon',
    applianceId,
  };

  // Parse options starting from args[2]
  let i = 2;
  while (i < args.length) {
    const arg = args[i];

    if (!arg.startsWith('--')) {
      return createError(
        'UNKNOWN_OPTION',
        `不明なオプション: ${arg}`
      );
    }

    if (!AIRCON_OPTIONS.has(arg)) {
      return createError(
        'UNKNOWN_OPTION',
        `不明なオプション: ${arg}`
      );
    }

    switch (arg) {
      case '--temp': {
        const value = args[i + 1];
        if (!value || value.startsWith('--')) {
          return createError(
            'MISSING_OPTION_VALUE',
            '--temp オプションには温度の値が必要です'
          );
        }
        command.temperature = value;
        i += 2;
        break;
      }
      case '--mode': {
        const value = args[i + 1];
        if (!value || value.startsWith('--')) {
          return createError(
            'MISSING_OPTION_VALUE',
            '--mode オプションにはモードの値が必要です'
          );
        }
        if (!VALID_MODES.has(value)) {
          return createError(
            'INVALID_OPTION_VALUE',
            `無効なモード: ${value} (有効: cool, warm, dry, blow, auto)`
          );
        }
        command.mode = value as AirconMode;
        i += 2;
        break;
      }
      case '--volume': {
        const value = args[i + 1];
        if (!value || value.startsWith('--')) {
          return createError(
            'MISSING_OPTION_VALUE',
            '--volume オプションには風量の値が必要です'
          );
        }
        if (!VALID_VOLUMES.has(value)) {
          return createError(
            'INVALID_OPTION_VALUE',
            `無効な風量: ${value} (有効: auto, 1, 2, 3, 4)`
          );
        }
        command.volume = value as AirconVolume;
        i += 2;
        break;
      }
      case '--off':
        command.powerOff = true;
        i += 1;
        break;
      default:
        i += 1;
    }
  }

  return createSuccess(command);
}

/**
 * Parse light command with action.
 */
function parseLightCommand(args: string[]): Result<ParsedCommand, ParseError> {
  // args[0] is 'light', args[1] should be appliance ID, args[2] should be action
  if (args.length < 2 || args[1]?.startsWith('--')) {
    return createError(
      'MISSING_ARGUMENT',
      'light コマンドにはアプライアンスIDが必要です'
    );
  }

  if (args.length < 3) {
    return createError(
      'MISSING_ARGUMENT',
      'light コマンドにはアクション (on/off) が必要です'
    );
  }

  const applianceId = args[1];
  const action = args[2];

  if (action !== 'on' && action !== 'off') {
    return createError(
      'INVALID_ARGUMENT',
      `無効なアクション: ${action} (有効: on, off)`
    );
  }

  return createSuccess({
    type: 'light',
    applianceId,
    action,
  });
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse command line arguments into a structured command.
 *
 * @param argv - process.argv array (includes node and script path)
 * @returns Result with parsed command or parse error
 *
 * @example
 * ```typescript
 * const result = parseCommand(process.argv);
 * if (result.success) {
 *   switch (result.data.type) {
 *     case 'devices':
 *       // handle devices command
 *       break;
 *     case 'aircon':
 *       // handle aircon command
 *       break;
 *   }
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export function parseCommand(
  argv: string[]
): Result<ParsedCommand, ParseError> {
  // Skip node and script path
  const args = argv.slice(2);

  // No command or help flags
  if (args.length === 0) {
    return createSuccess({ type: 'help' });
  }

  const command = args[0];

  // Check for help flags first
  if (command === '--help' || command === '-h' || command === 'help') {
    return createSuccess({ type: 'help' });
  }

  // Parse commands
  switch (command) {
    case 'devices':
      return createSuccess({ type: 'devices' });

    case 'appliances':
      return createSuccess({ type: 'appliances' });

    case 'aircon':
      return parseAirconCommand(args);

    case 'light':
      return parseLightCommand(args);

    default:
      return createError(
        'UNKNOWN_COMMAND',
        `不明なコマンド: ${command}`
      );
  }
}

// ============================================================================
// Help Message
// ============================================================================

/**
 * Get CLI help message.
 */
export function getHelpMessage(): string {
  return `Nature Remo CLI - HomeOffice.ai IoT Experiment

Usage: npx tsx src/index.ts <command> [options]

Commands:
  devices                     デバイス一覧とセンサー値を表示
  appliances                  家電一覧を表示
  aircon <id> [options]       エアコンを操作
  light <id> <on|off>         照明をオン/オフ

Aircon Options:
  --temp <temperature>        温度を設定（例: 26）
  --mode <mode>               モードを設定
                              有効: cool, warm, dry, blow, auto
  --volume <volume>           風量を設定
                              有効: auto, 1, 2, 3, 4
  --off                       電源オフ

Examples:
  npx tsx src/index.ts devices
  npx tsx src/index.ts appliances
  npx tsx src/index.ts aircon abc123 --temp 26 --mode cool
  npx tsx src/index.ts light def456 on

Environment:
  NATURE_REMO_TOKEN           Nature Remo アクセストークン (必須)
                              .env ファイルに設定してください
`;
}
