/**
 * CLI Output Formatter
 *
 * Provides user-friendly console output formatting for CLI commands.
 * Formats device lists, appliance lists, operation results, and error messages.
 *
 * Requirements: 2.2, 2.3, 3.2, 3.3, 3.4, 4.5, 5.4
 */

import type { ApiError, ServiceError } from '../types/types.js';

// ============================================================================
// Data Types for Display
// ============================================================================

/**
 * Device data for display.
 */
export interface DeviceDisplayData {
  id: string;
  name: string;
  firmwareVersion: string;
  temperature: number | null;
  humidity: number | null;
  illumination: number | null;
}

/**
 * Aircon settings for display.
 */
export interface AirconSettingsDisplay {
  temperature: string;
  mode: string;
  volume: string;
  power: 'on' | 'off';
}

/**
 * Light state for display.
 */
export interface LightStateDisplay {
  power: 'on' | 'off';
  brightness?: string;
}

/**
 * Appliance data for display.
 */
export interface ApplianceDisplayData {
  id: string;
  nickname: string;
  type: string;
  airconSettings?: AirconSettingsDisplay;
  lightState?: LightStateDisplay;
}

/**
 * Aircon operation result data.
 */
export interface AirconResultData {
  applianceId: string;
  temperature: string;
  mode: string;
  volume: string;
  power: 'on' | 'off';
}

/**
 * Light operation result data.
 */
export interface LightResultData {
  applianceId: string;
  action: string;
  success: boolean;
}

// ============================================================================
// Device List Formatting (Requirements 2.2, 2.3)
// ============================================================================

/**
 * Table row type for device display.
 */
interface DeviceTableRow {
  ID: string;
  Name: string;
  Firmware: string;
  Temperature: string;
  Humidity: string;
  Illumination: string;
}

/**
 * Format sensor value for display.
 */
function formatSensorValue(
  value: number | null,
  unit: string
): string {
  if (value === null) {
    return '-';
  }
  return `${value}${unit}`;
}

/**
 * Format device list and display using console.table.
 *
 * @param devices - Array of device data to display
 * @returns 'no-devices' if list is empty, undefined otherwise
 */
export function formatDevicesOutput(
  devices: DeviceDisplayData[]
): 'no-devices' | undefined {
  if (devices.length === 0) {
    return 'no-devices';
  }

  const tableData: DeviceTableRow[] = devices.map((device) => ({
    ID: device.id,
    Name: device.name,
    Firmware: device.firmwareVersion,
    Temperature: formatSensorValue(device.temperature, '\u00B0C'),
    Humidity: formatSensorValue(device.humidity, '%'),
    Illumination: formatSensorValue(device.illumination, ' lux'),
  }));

  console.table(tableData);
  return undefined;
}

// ============================================================================
// Appliance List Formatting (Requirements 3.2, 3.3, 3.4)
// ============================================================================

/**
 * Format a single appliance for display.
 */
function formatApplianceItem(appliance: ApplianceDisplayData): string {
  const lines: string[] = [];
  lines.push(`  - ${appliance.nickname} (ID: ${appliance.id})`);

  // Add aircon settings if available (Requirement 3.3)
  if (appliance.airconSettings) {
    const settings = appliance.airconSettings;
    lines.push(`      Temperature: ${settings.temperature}\u00B0C | Mode: ${settings.mode} | Volume: ${settings.volume} | Power: ${settings.power}`);
  }

  // Add light state if available (Requirement 3.4)
  if (appliance.lightState) {
    const state = appliance.lightState;
    if (state.brightness !== undefined) {
      lines.push(`      Power: ${state.power} | Brightness: ${state.brightness}%`);
    } else {
      lines.push(`      Power: ${state.power}`);
    }
  }

  return lines.join('\n');
}

/**
 * Group appliances by type.
 */
function groupAppliancesByType(
  appliances: ApplianceDisplayData[]
): Map<string, ApplianceDisplayData[]> {
  const groups = new Map<string, ApplianceDisplayData[]>();

  for (const appliance of appliances) {
    const existing = groups.get(appliance.type) ?? [];
    existing.push(appliance);
    groups.set(appliance.type, existing);
  }

  return groups;
}

/**
 * Format appliance list grouped by type.
 *
 * @param appliances - Array of appliance data to display
 * @returns 'no-appliances' if list is empty, undefined otherwise
 */
export function formatAppliancesOutput(
  appliances: ApplianceDisplayData[]
): 'no-appliances' | undefined {
  if (appliances.length === 0) {
    return 'no-appliances';
  }

  const groups = groupAppliancesByType(appliances);

  console.log('\n=== Registered Appliances ===\n');

  for (const [type, items] of groups) {
    console.log(`[${type}]`);
    for (const item of items) {
      console.log(formatApplianceItem(item));
    }
    console.log('');
  }

  return undefined;
}

// ============================================================================
// Aircon Result Formatting (Requirement 4.5)
// ============================================================================

/**
 * Format aircon operation result for display.
 *
 * @param result - Aircon operation result data
 */
export function formatAirconResult(result: AirconResultData): void {
  console.log('\n=== Aircon Settings Updated ===\n');
  console.log(`  Appliance ID: ${result.applianceId}`);
  console.log(`  Temperature:  ${result.temperature}\u00B0C`);
  console.log(`  Mode:         ${result.mode}`);
  console.log(`  Volume:       ${result.volume}`);
  console.log(`  Power:        ${result.power}`);
  console.log('');
}

// ============================================================================
// Light Result Formatting (Requirement 5.4)
// ============================================================================

/**
 * Format light operation result for display.
 *
 * @param result - Light operation result data
 */
export function formatLightResult(result: LightResultData): void {
  const actionText = result.action === 'on' ? 'on (turned on)' : 'off (turned off)';
  console.log('\n=== Light Operation Completed ===\n');
  console.log(`  Appliance ID: ${result.applianceId}`);
  console.log(`  Action:       ${actionText}`);
  console.log(`  Status:       Success`);
  console.log('');
}

// ============================================================================
// Error Message Formatting (User-friendly errors)
// ============================================================================

/**
 * Combined error type for display.
 */
type DisplayError = ApiError | ServiceError;

/**
 * Error messages map for user-friendly output.
 */
const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'アクセストークンが無効です。.env ファイルの NATURE_REMO_TOKEN を確認してください。',
  NOT_FOUND: 'リソースが見つかりません。指定したIDが正しいか確認してください。',
  NETWORK_ERROR: 'ネットワーク接続を確認してください。インターネット接続が正常か確認してください。',
  NOT_AIRCON: '指定した家電はエアコンではありません。aircon コマンドはエアコンに対してのみ使用できます。',
  NOT_LIGHT: '指定した家電は照明ではありません。light コマンドは照明に対してのみ使用できます。',
  APPLIANCE_NOT_FOUND: '家電が見つかりません。appliances コマンドでIDを確認してください。',
  NO_DEVICES: '登録済みデバイスがありません。Nature Remoアプリでデバイスを登録してください。',
};

/**
 * Format error message for user-friendly display.
 *
 * @param error - API error or service error to format
 */
export function formatErrorMessage(error: DisplayError): void {
  const prefix = '\n[Error] ';

  if (error.code === 'RATE_LIMIT') {
    const retryAfter = 'retryAfter' in error ? error.retryAfter : undefined;
    console.error(
      `${prefix}レート制限に達しました。${retryAfter ? `${retryAfter}秒後に` : ''}再試行してください。`
    );
    return;
  }

  const friendlyMessage = ERROR_MESSAGES[error.code];
  if (friendlyMessage) {
    console.error(`${prefix}${friendlyMessage}`);
  } else {
    console.error(`${prefix}エラーが発生しました: ${error.message}`);
  }
}

// ============================================================================
// Additional Output Functions
// ============================================================================

/**
 * Display no devices message.
 */
export function displayNoDevicesMessage(): void {
  console.log('\n登録済みデバイスがありません。');
  console.log('Nature Remo アプリでデバイスを登録してください。\n');
}

/**
 * Display no appliances message.
 */
export function displayNoAppliancesMessage(): void {
  console.log('\n登録済み家電がありません。');
  console.log('Nature Remo アプリで家電を登録してください。\n');
}
