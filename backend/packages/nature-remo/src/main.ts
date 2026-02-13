/**
 * Main Entry Point Module
 *
 * Orchestrates the CLI application:
 * - Config loading from environment
 * - Client and service initialization
 * - Command parsing and execution
 * - Error handling with appropriate exit codes
 *
 * Requirements: 1.1, 1.3, 7.1
 */

import { loadConfig, type ConfigError } from './config/config-loader.js';
import { parseCommand, getHelpMessage, type ParsedCommand } from './cli/command-parser.js';
import {
  formatDevicesOutput,
  formatAppliancesOutput,
  formatAirconResult,
  formatLightResult,
  formatErrorMessage,
  displayNoDevicesMessage,
  displayNoAppliancesMessage,
  type DeviceDisplayData,
  type ApplianceDisplayData,
} from './cli/output-formatter.js';
import { createRateLimitMonitor } from './client/rate-limit-monitor.js';
import { createNatureRemoClient } from './client/nature-remo-client.js';
import { createDeviceService, type DeviceService } from './services/device-service.js';
import { createApplianceService, type ApplianceService } from './services/appliance-service.js';
import { createAirconService, type AirconService } from './services/aircon-service.js';
import { createLightService, type LightService } from './services/light-service.js';
import type { AirconSettingsInput, ServiceError } from './types/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result type for application creation.
 */
export type AppResult<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Application context containing initialized services.
 */
export interface AppContext {
  services: {
    device: DeviceService;
    appliance: ApplianceService;
    aircon: AirconService;
    light: LightService;
  };
}

// ============================================================================
// Application Factory
// ============================================================================

/**
 * Create and initialize the application.
 *
 * Loads configuration and creates all necessary services.
 * Returns error if configuration is invalid.
 *
 * @returns Result with AppContext on success, ConfigError on failure
 */
export function createApp(): AppResult<AppContext, ConfigError> {
  // Load configuration (Requirement 7.1)
  const configResult = loadConfig();

  if (!configResult.success) {
    return {
      success: false,
      error: configResult.error,
    };
  }

  // Create rate limit monitor
  const rateLimitMonitor = createRateLimitMonitor();

  // Create API client with token (Requirement 1.1)
  const client = createNatureRemoClient(
    configResult.data.natureRemoToken,
    rateLimitMonitor
  );

  // Create services
  const deviceService = createDeviceService(client);
  const applianceService = createApplianceService(client);
  const airconService = createAirconService(client);
  const lightService = createLightService(client);

  return {
    success: true,
    data: {
      services: {
        device: deviceService,
        appliance: applianceService,
        aircon: airconService,
        light: lightService,
      },
    },
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Handle the devices command.
 */
async function handleDevicesCommand(
  context: AppContext
): Promise<{ success: boolean; error?: ServiceError }> {
  const result = await context.services.device.getDevices();

  if (!result.success) {
    formatErrorMessage(result.error);
    return { success: false, error: result.error };
  }

  // Convert DeviceInfo to DeviceDisplayData
  const displayData: DeviceDisplayData[] = result.data.map((device) => ({
    id: device.id,
    name: device.name,
    firmwareVersion: device.firmwareVersion,
    temperature: device.sensors?.temperature ?? null,
    humidity: device.sensors?.humidity ?? null,
    illumination: device.sensors?.illumination ?? null,
  }));

  const formatResult = formatDevicesOutput(displayData);

  if (formatResult === 'no-devices') {
    displayNoDevicesMessage();
  }

  return { success: true };
}

/**
 * Handle the appliances command.
 */
async function handleAppliancesCommand(
  context: AppContext
): Promise<{ success: boolean; error?: ServiceError }> {
  const result = await context.services.appliance.getAppliances();

  if (!result.success) {
    formatErrorMessage(result.error);
    return { success: false, error: result.error };
  }

  // Convert ApplianceInfo to ApplianceDisplayData
  const displayData: ApplianceDisplayData[] = result.data.map((appliance) => ({
    id: appliance.id,
    nickname: appliance.nickname,
    type: appliance.type,
    airconSettings: appliance.airconSettings,
    lightState: appliance.lightState,
  }));

  const formatResult = formatAppliancesOutput(displayData);

  if (formatResult === 'no-appliances') {
    displayNoAppliancesMessage();
  }

  return { success: true };
}

/**
 * Handle the aircon command.
 */
async function handleAirconCommand(
  context: AppContext,
  command: Extract<ParsedCommand, { type: 'aircon' }>
): Promise<{ success: boolean; error?: ServiceError }> {
  // Build settings input from parsed command
  const settings: AirconSettingsInput = {};

  if (command.powerOff) {
    settings.button = 'power-off';
  } else {
    if (command.temperature !== undefined) {
      settings.temperature = command.temperature;
    }
    if (command.mode !== undefined) {
      settings.operation_mode = command.mode;
    }
    if (command.volume !== undefined) {
      settings.air_volume = command.volume;
    }
  }

  const result = await context.services.aircon.updateSettings(
    command.applianceId,
    settings
  );

  if (!result.success) {
    formatErrorMessage(result.error);
    return { success: false, error: result.error };
  }

  formatAirconResult(result.data);
  return { success: true };
}

/**
 * Handle the light command.
 */
async function handleLightCommand(
  context: AppContext,
  command: Extract<ParsedCommand, { type: 'light' }>
): Promise<{ success: boolean; error?: ServiceError }> {
  const result = await context.services.light.control(
    command.applianceId,
    command.action
  );

  if (!result.success) {
    formatErrorMessage(result.error);
    return { success: false, error: result.error };
  }

  formatLightResult(result.data);
  return { success: true };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run the main CLI application.
 *
 * Parses command line arguments, executes the appropriate command,
 * and handles errors with appropriate exit codes.
 *
 * @param argv - Command line arguments (process.argv)
 * @param context - Application context with initialized services
 */
export async function runMain(
  argv: string[],
  context: AppContext
): Promise<void> {
  // Parse command
  const parseResult = parseCommand(argv);

  if (!parseResult.success) {
    console.error(`\n[Error] ${parseResult.error.message}`);
    console.error(`\nヘルプを表示するには --help を使用してください。`);
    process.exit(1);
  }

  const command = parseResult.data;

  // Handle help command
  if (command.type === 'help') {
    console.log(getHelpMessage());
    process.exit(0);
  }

  // Execute command
  let result: { success: boolean };

  switch (command.type) {
    case 'devices':
      result = await handleDevicesCommand(context);
      break;

    case 'appliances':
      result = await handleAppliancesCommand(context);
      break;

    case 'aircon':
      result = await handleAirconCommand(context, command);
      break;

    case 'light':
      result = await handleLightCommand(context, command);
      break;
  }

  // Exit with appropriate code (Requirement 1.3)
  process.exit(result.success ? 0 : 1);
}

/**
 * Application entry point.
 *
 * Creates the application context and runs the main CLI.
 */
export async function main(): Promise<void> {
  // Create application
  const appResult = createApp();

  if (!appResult.success) {
    console.error(`\n[Error] ${appResult.error.message}`);
    console.error(`${appResult.error.suggestion}\n`);
    process.exit(1);
  }

  // Run CLI
  await runMain(process.argv, appResult.data);
}
