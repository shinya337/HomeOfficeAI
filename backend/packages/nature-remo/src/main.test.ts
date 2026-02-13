/**
 * Main Entry Point Tests
 *
 * Tests for the CLI entry point that orchestrates:
 * - Config loading
 * - Client initialization
 * - Service creation
 * - Command execution
 *
 * Requirements: 1.1, 1.3, 7.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedCommand } from './cli/command-parser.js';

// ============================================================================
// Test Setup - Mock Modules
// ============================================================================

// Mock config-loader
const mockLoadConfig = vi.fn();
vi.mock('./config/config-loader.js', () => ({
  loadConfig: () => mockLoadConfig(),
}));

// Mock command-parser
const mockParseCommand = vi.fn();
const mockGetHelpMessage = vi.fn(() => 'Help message');
vi.mock('./cli/command-parser.js', () => ({
  parseCommand: (argv: string[]) => mockParseCommand(argv),
  getHelpMessage: () => mockGetHelpMessage(),
}));

// Mock rate-limit-monitor
const mockCreateRateLimitMonitor = vi.fn(() => ({
  updateFromHeaders: vi.fn(),
  getRateLimitInfo: vi.fn(),
  isNearLimit: vi.fn(),
  getResetTimeRemaining: vi.fn(),
}));
vi.mock('./client/rate-limit-monitor.js', () => ({
  createRateLimitMonitor: () => mockCreateRateLimitMonitor(),
}));

// Mock nature-remo-client
const mockClient = {
  getDevices: vi.fn(),
  getAppliances: vi.fn(),
  updateAirconSettings: vi.fn(),
  controlLight: vi.fn(),
};
const mockCreateNatureRemoClient = vi.fn(() => mockClient);
vi.mock('./client/nature-remo-client.js', () => ({
  createNatureRemoClient: (token: string, monitor: unknown) =>
    mockCreateNatureRemoClient(token, monitor),
}));

// Mock services
const mockDeviceService = {
  getDevices: vi.fn(),
  getNoDevicesMessage: vi.fn(() => '登録済みデバイスがありません'),
  formatDeviceForDisplay: vi.fn(),
};
const mockApplianceService = {
  getAppliances: vi.fn(),
  getApplianceById: vi.fn(),
};
const mockAirconService = {
  updateSettings: vi.fn(),
};
const mockLightService = {
  control: vi.fn(),
};

vi.mock('./services/device-service.js', () => ({
  createDeviceService: () => mockDeviceService,
}));
vi.mock('./services/appliance-service.js', () => ({
  createApplianceService: () => mockApplianceService,
}));
vi.mock('./services/aircon-service.js', () => ({
  createAirconService: () => mockAirconService,
}));
vi.mock('./services/light-service.js', () => ({
  createLightService: () => mockLightService,
}));

// Mock output-formatter
const mockFormatDevicesOutput = vi.fn();
const mockFormatAppliancesOutput = vi.fn();
const mockFormatAirconResult = vi.fn();
const mockFormatLightResult = vi.fn();
const mockFormatErrorMessage = vi.fn();
const mockDisplayNoDevicesMessage = vi.fn();
const mockDisplayNoAppliancesMessage = vi.fn();

vi.mock('./cli/output-formatter.js', () => ({
  formatDevicesOutput: (devices: unknown[]) => mockFormatDevicesOutput(devices),
  formatAppliancesOutput: (appliances: unknown[]) => mockFormatAppliancesOutput(appliances),
  formatAirconResult: (result: unknown) => mockFormatAirconResult(result),
  formatLightResult: (result: unknown) => mockFormatLightResult(result),
  formatErrorMessage: (error: unknown) => mockFormatErrorMessage(error),
  displayNoDevicesMessage: () => mockDisplayNoDevicesMessage(),
  displayNoAppliancesMessage: () => mockDisplayNoAppliancesMessage(),
}));

// Import the module under test AFTER mocks are set up
import { runMain, createApp, type AppContext } from './main.js';

// ============================================================================
// Test Utilities
// ============================================================================

function resetAllMocks(): void {
  vi.clearAllMocks();
}

// ============================================================================
// Tests: createApp - Application Factory
// ============================================================================

describe('createApp', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should return error when config loading fails (Requirement 7.1)', () => {
    // Arrange
    mockLoadConfig.mockReturnValue({
      success: false,
      error: {
        code: 'TOKEN_NOT_SET',
        message: 'NATURE_REMO_TOKEN 環境変数が設定されていません',
        suggestion: 'backend/.env.sample を参照して .env ファイルを作成してください',
      },
    });

    // Act
    const result = createApp();

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_NOT_SET');
    }
  });

  it('should create client with loaded token (Requirement 1.1)', () => {
    // Arrange
    mockLoadConfig.mockReturnValue({
      success: true,
      data: { natureRemoToken: 'test-token-123' },
    });

    // Act
    const result = createApp();

    // Assert
    expect(result.success).toBe(true);
    expect(mockCreateNatureRemoClient).toHaveBeenCalledWith(
      'test-token-123',
      expect.anything()
    );
  });

  it('should create all services on success', () => {
    // Arrange
    mockLoadConfig.mockReturnValue({
      success: true,
      data: { natureRemoToken: 'test-token' },
    });

    // Act
    const result = createApp();

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.services.device).toBeDefined();
      expect(result.data.services.appliance).toBeDefined();
      expect(result.data.services.aircon).toBeDefined();
      expect(result.data.services.light).toBeDefined();
    }
  });
});

// ============================================================================
// Tests: runMain - Command Execution
// ============================================================================

describe('runMain', () => {
  let mockContext: AppContext;
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetAllMocks();

    mockContext = {
      services: {
        device: mockDeviceService as unknown as AppContext['services']['device'],
        appliance: mockApplianceService as unknown as AppContext['services']['appliance'],
        aircon: mockAirconService as unknown as AppContext['services']['aircon'],
        light: mockLightService as unknown as AppContext['services']['light'],
      },
    };

    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('help command', () => {
    it('should display help message and exit with 0', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: { type: 'help' } as ParsedCommand,
      });

      // Act & Assert
      await expect(runMain(['node', 'script.js', '--help'], mockContext)).rejects.toThrow(
        'process.exit called'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('Help message');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('parse error handling', () => {
    it('should display error and exit with 1 on parse error', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: false,
        error: {
          code: 'UNKNOWN_COMMAND',
          message: '不明なコマンド: foo',
        },
      });

      // Act & Assert
      await expect(runMain(['node', 'script.js', 'foo'], mockContext)).rejects.toThrow(
        'process.exit called'
      );
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('devices command', () => {
    it('should get devices and format output', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: { type: 'devices' } as ParsedCommand,
      });
      const mockDevices = [
        { id: 'dev1', name: 'Device 1', firmwareVersion: '1.0', sensors: null },
      ];
      mockDeviceService.getDevices.mockResolvedValue({
        success: true,
        data: mockDevices,
      });
      mockFormatDevicesOutput.mockReturnValue(undefined);

      // Act & Assert
      await expect(runMain(['node', 'script.js', 'devices'], mockContext)).rejects.toThrow(
        'process.exit called'
      );
      expect(mockDeviceService.getDevices).toHaveBeenCalled();
      expect(mockFormatDevicesOutput).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should display no devices message when empty', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: { type: 'devices' } as ParsedCommand,
      });
      mockDeviceService.getDevices.mockResolvedValue({
        success: true,
        data: [],
      });
      mockFormatDevicesOutput.mockReturnValue('no-devices');

      // Act & Assert
      await expect(runMain(['node', 'script.js', 'devices'], mockContext)).rejects.toThrow(
        'process.exit called'
      );
      expect(mockDisplayNoDevicesMessage).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should handle device service error', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: { type: 'devices' } as ParsedCommand,
      });
      mockDeviceService.getDevices.mockResolvedValue({
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Network failed' },
      });

      // Act & Assert
      await expect(runMain(['node', 'script.js', 'devices'], mockContext)).rejects.toThrow(
        'process.exit called'
      );
      expect(mockFormatErrorMessage).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('appliances command', () => {
    it('should get appliances and format output', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: { type: 'appliances' } as ParsedCommand,
      });
      const mockAppliances = [
        { id: 'app1', nickname: 'My AC', type: 'AC' },
      ];
      mockApplianceService.getAppliances.mockResolvedValue({
        success: true,
        data: mockAppliances,
      });
      mockFormatAppliancesOutput.mockReturnValue(undefined);

      // Act & Assert
      await expect(runMain(['node', 'script.js', 'appliances'], mockContext)).rejects.toThrow(
        'process.exit called'
      );
      expect(mockApplianceService.getAppliances).toHaveBeenCalled();
      expect(mockFormatAppliancesOutput).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should display no appliances message when empty', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: { type: 'appliances' } as ParsedCommand,
      });
      mockApplianceService.getAppliances.mockResolvedValue({
        success: true,
        data: [],
      });
      mockFormatAppliancesOutput.mockReturnValue('no-appliances');

      // Act & Assert
      await expect(runMain(['node', 'script.js', 'appliances'], mockContext)).rejects.toThrow(
        'process.exit called'
      );
      expect(mockDisplayNoAppliancesMessage).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('aircon command', () => {
    it('should update aircon settings and format result', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: {
          type: 'aircon',
          applianceId: 'ac123',
          temperature: '26',
          mode: 'cool',
        } as ParsedCommand,
      });
      mockAirconService.updateSettings.mockResolvedValue({
        success: true,
        data: {
          applianceId: 'ac123',
          temperature: '26',
          mode: 'cool',
          volume: 'auto',
          power: 'on',
        },
      });

      // Act & Assert
      await expect(
        runMain(['node', 'script.js', 'aircon', 'ac123', '--temp', '26'], mockContext)
      ).rejects.toThrow('process.exit called');
      expect(mockAirconService.updateSettings).toHaveBeenCalledWith('ac123', {
        temperature: '26',
        operation_mode: 'cool',
      });
      expect(mockFormatAirconResult).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should handle power-off option', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: {
          type: 'aircon',
          applianceId: 'ac123',
          powerOff: true,
        } as ParsedCommand,
      });
      mockAirconService.updateSettings.mockResolvedValue({
        success: true,
        data: {
          applianceId: 'ac123',
          temperature: '26',
          mode: 'cool',
          volume: 'auto',
          power: 'off',
        },
      });

      // Act & Assert
      await expect(
        runMain(['node', 'script.js', 'aircon', 'ac123', '--off'], mockContext)
      ).rejects.toThrow('process.exit called');
      expect(mockAirconService.updateSettings).toHaveBeenCalledWith('ac123', {
        button: 'power-off',
      });
    });
  });

  describe('light command', () => {
    it('should control light and format result', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: {
          type: 'light',
          applianceId: 'light123',
          action: 'on',
        } as ParsedCommand,
      });
      mockLightService.control.mockResolvedValue({
        success: true,
        data: {
          applianceId: 'light123',
          action: 'on',
          success: true,
        },
      });

      // Act & Assert
      await expect(
        runMain(['node', 'script.js', 'light', 'light123', 'on'], mockContext)
      ).rejects.toThrow('process.exit called');
      expect(mockLightService.control).toHaveBeenCalledWith('light123', 'on');
      expect(mockFormatLightResult).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('error handling (Requirement 1.3)', () => {
    it('should exit with code 1 on service error', async () => {
      // Arrange
      mockParseCommand.mockReturnValue({
        success: true,
        data: { type: 'devices' } as ParsedCommand,
      });
      mockDeviceService.getDevices.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
      });

      // Act & Assert
      await expect(runMain(['node', 'script.js', 'devices'], mockContext)).rejects.toThrow(
        'process.exit called'
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
