/**
 * main.ts - アプリケーション初期化と監視ループ起動テスト
 *
 * Task 6.2: アプリケーション全体の初期化と監視ループ起動
 * Requirements: 6.1, 6.3, 6.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MonitorLoopService, LoopState } from './loop/monitor-loop.js';

// =============================================================================
// Mock setup
// =============================================================================

// Mock cli-parser
vi.mock('./cli/cli-parser.js', () => ({
  parseCliArgs: vi.fn(),
  getHelpMessage: vi.fn(() => 'Usage: ...'),
}));

// Mock config-loader
vi.mock('./config/config-loader.js', () => ({
  loadAgentConfig: vi.fn(),
}));

// Mock image-scanner
vi.mock('./loop/image-scanner.js', () => ({
  scanImageDirectory: vi.fn(),
}));

// Mock nature-remo modules
vi.mock('../../nature-remo/src/client/nature-remo-client.js', () => ({
  createNatureRemoClient: vi.fn(() => ({})),
}));

vi.mock('../../nature-remo/src/client/rate-limit-monitor.js', () => ({
  createRateLimitMonitor: vi.fn(() => ({
    updateFromHeaders: vi.fn(),
    getRateLimitInfo: vi.fn(),
    isNearLimit: vi.fn(),
    getResetTimeRemaining: vi.fn(),
  })),
}));

vi.mock('../../nature-remo/src/services/light-service.js', () => ({
  createLightService: vi.fn(() => ({ control: vi.fn() })),
}));

vi.mock('../../nature-remo/src/services/aircon-service.js', () => ({
  createAirconService: vi.fn(() => ({ updateSettings: vi.fn() })),
}));

// Mock vertex-ai-vision image loader
vi.mock('../../vertex-ai-vision/src/image/image-loader.js', () => ({
  createImageLoader: vi.fn(() => ({ loadImage: vi.fn() })),
}));

// Mock agent-client
vi.mock('./agent/agent-client.js', () => ({
  createAgentClient: vi.fn(() => ({ analyze: vi.fn() })),
}));

// Mock action-dispatcher
vi.mock('./dispatcher/action-dispatcher.js', () => ({
  createActionDispatcher: vi.fn(() => ({ dispatch: vi.fn() })),
}));

// Mock device-state-service
vi.mock('./services/device-state-service.js', () => ({
  createDeviceStateService: vi.fn(() => ({ getDeviceState: vi.fn() })),
}));

// Mock prompt-builder
vi.mock('./agent/prompt-builder.js', () => ({
  buildPrompt: vi.fn(() => 'mock prompt'),
}));

// Mock appliance-service
vi.mock('../../nature-remo/src/services/appliance-service.js', () => ({
  createApplianceService: vi.fn(() => ({ getAppliances: vi.fn(), getApplianceById: vi.fn() })),
}));

// Mock monitor-loop
vi.mock('./loop/monitor-loop.js', () => ({
  createMonitorLoop: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getState: vi.fn(() => ({
      mode: 'normal',
      currentImageIndex: 0,
      cycleCount: 0,
      continuousCount: 0,
    })),
  })),
  setupSignalHandlers: vi.fn(() => vi.fn()),
  NORMAL_INTERVAL_MS: 30_000,
  SHORT_INTERVAL_MS: 5_000,
  DEFAULT_MAX_CONTINUOUS_CYCLES: 30,
}));

// =============================================================================
// Import after mocks
// =============================================================================

import { parseCliArgs, getHelpMessage } from './cli/cli-parser.js';
import { loadAgentConfig } from './config/config-loader.js';
import { scanImageDirectory } from './loop/image-scanner.js';
import { createNatureRemoClient } from '../../nature-remo/src/client/nature-remo-client.js';
import { createRateLimitMonitor } from '../../nature-remo/src/client/rate-limit-monitor.js';
import { createLightService } from '../../nature-remo/src/services/light-service.js';
import { createAirconService } from '../../nature-remo/src/services/aircon-service.js';
import { createImageLoader } from '../../vertex-ai-vision/src/image/image-loader.js';
import { createAgentClient } from './agent/agent-client.js';
import { createActionDispatcher } from './dispatcher/action-dispatcher.js';
import { createDeviceStateService } from './services/device-state-service.js';
import { buildPrompt } from './agent/prompt-builder.js';
import { createApplianceService } from '../../nature-remo/src/services/appliance-service.js';
import { createMonitorLoop, setupSignalHandlers } from './loop/monitor-loop.js';
import { initializeApp } from './main.js';

describe('main - initializeApp', () => {
  let mockProcessExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Restore default mock implementations after resetAllMocks
    vi.mocked(getHelpMessage).mockReturnValue('Usage: ...');
    vi.mocked(createRateLimitMonitor).mockReturnValue({
      updateFromHeaders: vi.fn(),
      getRateLimitInfo: vi.fn() as any,
      isNearLimit: vi.fn(),
      getResetTimeRemaining: vi.fn(),
    } as any);
    vi.mocked(createNatureRemoClient).mockReturnValue({} as any);
    vi.mocked(createLightService).mockReturnValue({ control: vi.fn() } as any);
    vi.mocked(createAirconService).mockReturnValue({ updateSettings: vi.fn() } as any);
    vi.mocked(createImageLoader).mockReturnValue({ loadImage: vi.fn() } as any);
    vi.mocked(createAgentClient).mockReturnValue({ analyze: vi.fn() } as any);
    vi.mocked(createActionDispatcher).mockReturnValue({ dispatch: vi.fn() } as any);
    vi.mocked(createDeviceStateService).mockReturnValue({ getDeviceState: vi.fn() } as any);
    vi.mocked(buildPrompt).mockReturnValue('mock prompt');
    vi.mocked(createApplianceService).mockReturnValue({ getAppliances: vi.fn(), getApplianceById: vi.fn() } as any);
    vi.mocked(createMonitorLoop).mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(() => ({
        mode: 'normal' as const,
        currentImageIndex: 0,
        cycleCount: 0,
        continuousCount: 0,
      })),
    });
    vi.mocked(setupSignalHandlers).mockReturnValue(vi.fn());
  });

  afterEach(() => {
    mockProcessExit.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
  });

  it('CLI引数解析エラー時にヘルプメッセージを表示してexit(1)する', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: false,
      error: { code: 'MISSING_REQUIRED', message: '必須引数 --image-dir が指定されていません' },
    });

    await initializeApp(['node', 'main.ts']);

    expect(mockConsoleError).toHaveBeenCalled();
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('--help フラグ時にヘルプメッセージを表示してexit(0)する', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: '', lightId: '', airconId: '', help: true },
    });

    await initializeApp(['node', 'main.ts', '--help']);

    expect(mockConsoleLog).toHaveBeenCalled();
    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  it('環境変数ロードエラー時にエラーメッセージと設定手順を表示してexit(1)する', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light1', airconId: 'aircon1' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: false,
      error: {
        code: 'MISSING_PROJECT_ID',
        message: 'GOOGLE_CLOUD_PROJECT 環境変数が設定されていません。',
        suggestion: '.env ファイルに設定してください。',
      },
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images']);

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('GOOGLE_CLOUD_PROJECT')
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('画像ディレクトリスキャンエラー時にexit(1)する', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light1', airconId: 'aircon1' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: false,
      error: { code: 'DIR_NOT_FOUND', message: 'ディレクトリが見つかりません: ./images' },
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images']);

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('ディレクトリ')
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('正常な初期化で各Factory関数を呼び出してMonitorLoopを起動する', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light1', airconId: 'aircon1' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg', 'image2.png'],
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images', '--light-id', 'light1', '--aircon-id', 'aircon1']);

    // Factory関数が呼ばれることを確認
    expect(createRateLimitMonitor).toHaveBeenCalled();
    expect(createNatureRemoClient).toHaveBeenCalledWith('test-token', expect.anything());
    expect(createLightService).toHaveBeenCalled();
    expect(createAirconService).toHaveBeenCalled();
    expect(createImageLoader).toHaveBeenCalled();
    expect(createAgentClient).toHaveBeenCalledWith({
      projectId: 'test-project',
      location: 'us-central1',
      model: 'gemini-2.5-flash',
    });
    expect(createActionDispatcher).toHaveBeenCalled();
    expect(createMonitorLoop).toHaveBeenCalled();
  });

  it('正常な初期化でMonitorLoop.start()が呼ばれる', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light1', airconId: 'aircon1' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg'],
    });

    const mockStart = vi.fn();
    vi.mocked(createMonitorLoop).mockReturnValue({
      start: mockStart,
      stop: vi.fn(),
      getState: vi.fn(() => ({
        mode: 'normal' as const,
        currentImageIndex: 0,
        cycleCount: 0,
        continuousCount: 0,
      })),
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images']);

    expect(mockStart).toHaveBeenCalled();
  });

  it('正常な初期化でsetupSignalHandlersが呼ばれる', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light1', airconId: 'aircon1' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg'],
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images']);

    expect(setupSignalHandlers).toHaveBeenCalled();
  });

  it('MonitorLoopConfigに正しい設定値が渡される', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light1', airconId: 'aircon1' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg', 'image2.png'],
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images', '--light-id', 'light1', '--aircon-id', 'aircon1']);

    expect(createMonitorLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        imageDir: './images',
        normalIntervalMs: 30_000,
        shortIntervalMs: 5_000,
        maxContinuousCycles: 30,
      }),
      expect.objectContaining({
        agentClient: expect.anything(),
        actionDispatcher: expect.anything(),
        imageLoader: expect.anything(),
        imageFiles: ['image1.jpg', 'image2.png'],
        deviceStateService: expect.anything(),
        buildPrompt: expect.any(Function),
      })
    );
  });

  it('ApplianceConfigを生成しActionDispatcherの第1引数に渡す', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light-abc', airconId: 'aircon-xyz' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg'],
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images', '--light-id', 'light-abc', '--aircon-id', 'aircon-xyz']);

    expect(createActionDispatcher).toHaveBeenCalledWith(
      { lightApplianceId: 'light-abc', airconApplianceId: 'aircon-xyz' },
      expect.objectContaining({
        lightService: expect.anything(),
        airconService: expect.anything(),
      })
    );
  });

  it('ApplianceServiceを生成しDeviceStateServiceに渡す', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light-abc', airconId: 'aircon-xyz' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg'],
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images', '--light-id', 'light-abc', '--aircon-id', 'aircon-xyz']);

    // ApplianceServiceが生成されること
    expect(createApplianceService).toHaveBeenCalled();

    // DeviceStateServiceにApplianceConfigとApplianceServiceが渡されること
    expect(createDeviceStateService).toHaveBeenCalledWith(
      { lightApplianceId: 'light-abc', airconApplianceId: 'aircon-xyz' },
      expect.anything()
    );
  });

  it('buildPromptとdeviceStateServiceがMonitorLoop依存関係に含まれる', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light-abc', airconId: 'aircon-xyz' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg'],
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images', '--light-id', 'light-abc', '--aircon-id', 'aircon-xyz']);

    expect(createMonitorLoop).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deviceStateService: expect.anything(),
        buildPrompt: expect.any(Function),
      })
    );
  });

  it('MonitorLoopConfigからlightApplianceId/airconApplianceIdが除去されている', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light-abc', airconId: 'aircon-xyz' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg'],
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images', '--light-id', 'light-abc', '--aircon-id', 'aircon-xyz']);

    const configArg = vi.mocked(createMonitorLoop).mock.calls[0]?.[0];
    expect(configArg).not.toHaveProperty('lightApplianceId');
    expect(configArg).not.toHaveProperty('airconApplianceId');
    expect(configArg).toHaveProperty('imageDir', './images');
    expect(configArg).toHaveProperty('normalIntervalMs');
    expect(configArg).toHaveProperty('shortIntervalMs');
    expect(configArg).toHaveProperty('maxContinuousCycles');
  });

  it('起動ログにプロジェクトID、モデル名、画像数を含める', async () => {
    vi.mocked(parseCliArgs).mockReturnValue({
      ok: true,
      value: { imageDir: './images', lightId: 'light1', airconId: 'aircon1' },
    });
    vi.mocked(loadAgentConfig).mockReturnValue({
      ok: true,
      value: {
        projectId: 'test-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        natureRemoToken: 'test-token',
      },
    });
    vi.mocked(scanImageDirectory).mockReturnValue({
      ok: true,
      value: ['image1.jpg', 'image2.png', 'image3.jpeg'],
    });

    await initializeApp(['node', 'main.ts', '--image-dir', './images']);

    // 起動ログの確認
    const logCalls = mockConsoleLog.mock.calls.map(c => String(c[0]));
    expect(logCalls.some(msg => msg.includes('test-project'))).toBe(true);
    expect(logCalls.some(msg => msg.includes('gemini-2.5-flash'))).toBe(true);
    expect(logCalls.some(msg => msg.includes('3'))).toBe(true);
  });
});
