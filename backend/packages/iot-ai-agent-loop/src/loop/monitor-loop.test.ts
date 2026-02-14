/**
 * MonitorLoop テスト
 *
 * 動的間隔の監視ループを検証する。
 * - 通常5分間隔（NORMAL_INTERVAL_MS）で画像分析サイクルを繰り返す
 * - continue_monitoring 選択時は10秒間隔（SHORT_INTERVAL_MS）に切り替える
 * - do_nothing / IoTアクション実行後は通常間隔に復帰する
 * - 連続監視が上限回数に達した場合、自動的に通常間隔に復帰する
 * - LoopState をインメモリで管理する
 * - 各サイクルの分析結果をコンソールにログ出力する (Req 3.5)
 * - SIGINT/SIGTERM で安全に停止する (Req 5.4)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMonitorLoop,
  setupSignalHandlers,
  NORMAL_INTERVAL_MS,
  SHORT_INTERVAL_MS,
  DEFAULT_MAX_CONTINUOUS_CYCLES,
} from './monitor-loop.js';
import type { MonitorLoopConfig, MonitorLoopDependencies, MonitorLoopService } from './monitor-loop.js';
import type { AgentClientService } from '../agent/agent-client.js';
import type { ActionDispatcherService } from '../dispatcher/action-dispatcher.js';
import type { AgentAction } from '../types/actions.js';
import type { DeviceStateService, DeviceState } from '../services/device-state-service.js';

// =============================================================================
// テストヘルパー
// =============================================================================

function createMockAgentClient(): AgentClientService {
  return {
    analyze: vi.fn().mockResolvedValue({
      ok: true,
      value: [{ tool: 'do_nothing', params: {} }],
    }),
  };
}

function createMockActionDispatcher(): ActionDispatcherService {
  return {
    dispatch: vi.fn().mockResolvedValue({
      ok: true,
      value: { executed: false, nextInterval: 'normal', message: '異常なし' },
    }),
  };
}

function createMockImageLoader() {
  return {
    loadImage: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        base64: 'dGVzdA==',
        mimeType: 'image/jpeg' as const,
        filePath: '/images/test.jpg',
      },
    }),
  };
}

function createDefaultConfig(overrides?: Partial<MonitorLoopConfig>): MonitorLoopConfig {
  return {
    imageDir: '/test/images',
    normalIntervalMs: 100, // テスト用に短縮
    shortIntervalMs: 10,   // テスト用に短縮
    maxContinuousCycles: 3, // テスト用に少なく
    ...overrides,
  };
}

function createDefaultDeps(overrides?: Partial<MonitorLoopDependencies>): MonitorLoopDependencies {
  return {
    agentClient: createMockAgentClient(),
    actionDispatcher: createMockActionDispatcher(),
    imageLoader: createMockImageLoader(),
    imageFiles: ['img1.jpg', 'img2.jpg', 'img3.jpg'],
    ...overrides,
  };
}

// =============================================================================
// 定数テスト
// =============================================================================

describe('MonitorLoop 定数', () => {
  it('NORMAL_INTERVAL_MS は 30,000（30秒）', () => {
    expect(NORMAL_INTERVAL_MS).toBe(30_000);
  });

  it('SHORT_INTERVAL_MS は 5,000（5秒）', () => {
    expect(SHORT_INTERVAL_MS).toBe(5_000);
  });

  it('DEFAULT_MAX_CONTINUOUS_CYCLES は 30', () => {
    expect(DEFAULT_MAX_CONTINUOUS_CYCLES).toBe(30);
  });
});

// =============================================================================
// LoopState 管理テスト
// =============================================================================

describe('MonitorLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('初期状態', () => {
    it('start() で最初のサイクルが即座に実行される', async () => {
      const deps = createDefaultDeps();
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      loop.start();
      // 最初のサイクルは即座に実行されるので、少し待つ
      await vi.advanceTimersByTimeAsync(0);

      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(1);

      loop.stop();
    });

    it('getState() で初期 LoopState を返す', () => {
      const deps = createDefaultDeps();
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      const state = loop.getState();

      expect(state).toEqual({
        mode: 'normal',
        currentImageIndex: 0,
        cycleCount: 0,
        continuousCount: 0,
        recentActions: [],
      });
    });
  });

  // =============================================================================
  // 通常間隔テスト (Req 3.1)
  // =============================================================================

  describe('通常間隔 (Req 3.1)', () => {
    it('do_nothing 後に normalIntervalMs 間隔で次のサイクルが実行される', async () => {
      const deps = createDefaultDeps();
      const config = createDefaultConfig({ normalIntervalMs: 200, shortIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(1);

      // normalIntervalMs 未満ではまだ2回目は呼ばれない
      await vi.advanceTimersByTimeAsync(100);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(1);

      // normalIntervalMs 経過後に2回目が実行される
      await vi.advanceTimersByTimeAsync(100);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(2);

      loop.stop();
    });

    it('IoTアクション実行後に通常間隔に復帰する (Req 3.4)', async () => {
      const agentClient = createMockAgentClient();
      const actionDispatcher = createMockActionDispatcher();

      // 1st cycle: light_control
      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: true,
        value: [{ tool: 'light_control', params: { action: 'on' } }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
        ok: true,
        value: { executed: true, nextInterval: 'normal', message: '照明ON' },
      });

      const deps = createDefaultDeps({ agentClient, actionDispatcher });
      const config = createDefaultConfig({ normalIntervalMs: 200, shortIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle
      expect(loop.getState().mode).toBe('normal');

      // shortIntervalMs 時点ではまだ次のサイクルは実行されない
      await vi.advanceTimersByTimeAsync(50);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(1);

      // normalIntervalMs 経過後に次のサイクルが実行される
      await vi.advanceTimersByTimeAsync(150);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(2);

      loop.stop();
    });
  });

  // =============================================================================
  // 短縮間隔テスト (Req 3.2)
  // =============================================================================

  describe('短縮間隔 (Req 3.2)', () => {
    it('continue_monitoring 選択時に shortIntervalMs で次のサイクルが実行される', async () => {
      const agentClient = createMockAgentClient();
      const actionDispatcher = createMockActionDispatcher();

      // 1st cycle: continue_monitoring
      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: true,
        value: [{ tool: 'continue_monitoring', params: {} as Record<string, never> }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
        ok: true,
        value: { executed: false, nextInterval: 'short', message: '継続監視' },
      });

      // 2nd cycle: do_nothing (default mock)

      const deps = createDefaultDeps({ agentClient, actionDispatcher });
      const config = createDefaultConfig({ normalIntervalMs: 200, shortIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle

      expect(loop.getState().mode).toBe('continuous');
      expect(loop.getState().continuousCount).toBe(1);

      // shortIntervalMs 経過後に2回目が実行される
      await vi.advanceTimersByTimeAsync(50);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(2);

      loop.stop();
    });

    it('継続監視中に do_nothing が選択されると通常間隔に復帰する (Req 3.3)', async () => {
      const agentClient = createMockAgentClient();
      const actionDispatcher = createMockActionDispatcher();

      // 1st cycle: continue_monitoring
      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: true,
        value: [{ tool: 'continue_monitoring', params: {} as Record<string, never> }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
        ok: true,
        value: { executed: false, nextInterval: 'short', message: '継続監視' },
      });

      // 2nd cycle: do_nothing
      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: true,
        value: [{ tool: 'do_nothing', params: {} as Record<string, never> }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
        ok: true,
        value: { executed: false, nextInterval: 'normal', message: '異常なし' },
      });

      const deps = createDefaultDeps({ agentClient, actionDispatcher });
      const config = createDefaultConfig({ normalIntervalMs: 200, shortIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle: continuous
      expect(loop.getState().mode).toBe('continuous');

      await vi.advanceTimersByTimeAsync(50); // 2nd cycle: do_nothing -> normal
      expect(loop.getState().mode).toBe('normal');
      expect(loop.getState().continuousCount).toBe(0);

      loop.stop();
    });
  });

  // =============================================================================
  // 連続監視上限テスト (Req 3.4 - maxContinuousCycles)
  // =============================================================================

  describe('連続監視上限 (maxContinuousCycles)', () => {
    it('連続監視が上限回数に達した場合、自動的に通常間隔に復帰する', async () => {
      const agentClient = createMockAgentClient();
      const actionDispatcher = createMockActionDispatcher();

      // すべてのサイクルで continue_monitoring を返す
      vi.mocked(agentClient.analyze).mockResolvedValue({
        ok: true,
        value: [{ tool: 'continue_monitoring', params: {} as Record<string, never> }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValue({
        ok: true,
        value: { executed: false, nextInterval: 'short', message: '継続監視' },
      });

      const deps = createDefaultDeps({ agentClient, actionDispatcher });
      const config = createDefaultConfig({ normalIntervalMs: 200, shortIntervalMs: 50, maxContinuousCycles: 3 });
      const loop = createMonitorLoop(config, deps);

      loop.start();

      // 1st cycle: continue_monitoring (continuousCount = 1)
      await vi.advanceTimersByTimeAsync(0);
      expect(loop.getState().continuousCount).toBe(1);
      expect(loop.getState().mode).toBe('continuous');

      // 2nd cycle (continuousCount = 2)
      await vi.advanceTimersByTimeAsync(50);
      expect(loop.getState().continuousCount).toBe(2);
      expect(loop.getState().mode).toBe('continuous');

      // 3rd cycle (continuousCount = 3 -> 上限到達 -> normal に復帰)
      await vi.advanceTimersByTimeAsync(50);
      expect(loop.getState().continuousCount).toBe(0);
      expect(loop.getState().mode).toBe('normal');

      // 次のサイクルは normalIntervalMs 後
      await vi.advanceTimersByTimeAsync(50);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(3); // まだ3回のまま

      await vi.advanceTimersByTimeAsync(150);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(4); // 200ms後に4回目

      loop.stop();
    });
  });

  // =============================================================================
  // LoopState 管理テスト
  // =============================================================================

  describe('LoopState 管理', () => {
    it('各サイクルで cycleCount がインクリメントされる', async () => {
      const deps = createDefaultDeps();
      const config = createDefaultConfig({ normalIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st
      expect(loop.getState().cycleCount).toBe(1);

      await vi.advanceTimersByTimeAsync(50); // 2nd
      expect(loop.getState().cycleCount).toBe(2);

      await vi.advanceTimersByTimeAsync(50); // 3rd
      expect(loop.getState().cycleCount).toBe(3);

      loop.stop();
    });

    it('currentImageIndex が画像ファイル数でローテーションする', async () => {
      const deps = createDefaultDeps({ imageFiles: ['a.jpg', 'b.jpg', 'c.jpg'] });
      const config = createDefaultConfig({ normalIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // index 0
      expect(loop.getState().currentImageIndex).toBe(1); // 次のindex

      await vi.advanceTimersByTimeAsync(50); // index 1
      expect(loop.getState().currentImageIndex).toBe(2);

      await vi.advanceTimersByTimeAsync(50); // index 2
      expect(loop.getState().currentImageIndex).toBe(0); // ローテーション

      loop.stop();
    });

    it('imageLoader に正しいファイルパスが渡される', async () => {
      const deps = createDefaultDeps({ imageFiles: ['a.jpg', 'b.jpg'] });
      const config = createDefaultConfig({ imageDir: '/images', normalIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle: a.jpg
      expect(deps.imageLoader.loadImage).toHaveBeenCalledWith('/images/a.jpg');

      await vi.advanceTimersByTimeAsync(50); // 2nd cycle: b.jpg
      expect(deps.imageLoader.loadImage).toHaveBeenCalledWith('/images/b.jpg');

      loop.stop();
    });
  });

  // =============================================================================
  // stop() テスト
  // =============================================================================

  describe('stop()', () => {
    it('stop() 後はサイクルが実行されない', async () => {
      const deps = createDefaultDeps();
      const config = createDefaultConfig({ normalIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(1);

      loop.stop();

      await vi.advanceTimersByTimeAsync(200);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(1); // 増えない
    });
  });

  // =============================================================================
  // エラーハンドリングテスト
  // =============================================================================

  describe('エラーハンドリング', () => {
    it('画像読み込みエラー時はサイクルをスキップし、ループを継続する', async () => {
      const imageLoader = createMockImageLoader();
      // 1st: error, 2nd: success
      vi.mocked(imageLoader.loadImage).mockResolvedValueOnce({
        ok: false,
        error: { code: 'FILE_NOT_FOUND', message: 'Not found', filePath: '/images/a.jpg' },
      });

      const deps = createDefaultDeps({ imageLoader });
      const config = createDefaultConfig({ normalIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle: error
      // agentClient.analyze は呼ばれない
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(0);
      // cycleCount はインクリメントされる
      expect(loop.getState().cycleCount).toBe(1);

      // ループは継続する
      await vi.advanceTimersByTimeAsync(50); // 2nd cycle: success
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(1);

      loop.stop();
    });

    it('agentClient エラー時もループを継続する', async () => {
      const agentClient = createMockAgentClient();
      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: false,
        error: { code: 'API_ERROR', message: 'API error', retryable: true },
      });

      const deps = createDefaultDeps({ agentClient });
      const config = createDefaultConfig({ normalIntervalMs: 50 });
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle: error
      expect(deps.actionDispatcher.dispatch).not.toHaveBeenCalled();
      expect(loop.getState().cycleCount).toBe(1);

      // ループは継続する（通常間隔で）
      await vi.advanceTimersByTimeAsync(50);
      expect(deps.agentClient.analyze).toHaveBeenCalledTimes(2);

      loop.stop();
    });
  });

  // =============================================================================
  // appliance_id除去後のアクションディスパッチテスト (Req 4.4)
  // =============================================================================

  describe('appliance_id除去後のディスパッチ (Req 4.4)', () => {
    it('light_control アクションがappliance_idなしでそのままディスパッチされる', async () => {
      const agentClient = createMockAgentClient();
      const actionDispatcher = createMockActionDispatcher();

      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: true,
        value: [{ tool: 'light_control', params: { action: 'on' } }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
        ok: true,
        value: { executed: true, nextInterval: 'normal', message: '照明ON' },
      });

      const deps = createDefaultDeps({ agentClient, actionDispatcher });
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(actionDispatcher.dispatch).toHaveBeenCalledWith({
        tool: 'light_control',
        params: { action: 'on' },
      });

      loop.stop();
    });

    it('aircon_control アクションがappliance_idなしでそのままディスパッチされる', async () => {
      const agentClient = createMockAgentClient();
      const actionDispatcher = createMockActionDispatcher();

      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: true,
        value: [{ tool: 'aircon_control', params: { temperature: 26, mode: 'cool' } }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
        ok: true,
        value: { executed: true, nextInterval: 'normal', message: 'エアコン設定' },
      });

      const deps = createDefaultDeps({ agentClient, actionDispatcher });
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(actionDispatcher.dispatch).toHaveBeenCalledWith({
        tool: 'aircon_control',
        params: { temperature: 26, mode: 'cool' },
      });

      loop.stop();
    });

    it('continue_monitoring アクションはそのまま渡す', async () => {
      const agentClient = createMockAgentClient();
      const actionDispatcher = createMockActionDispatcher();

      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: true,
        value: [{ tool: 'continue_monitoring', params: {} as Record<string, never> }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
        ok: true,
        value: { executed: false, nextInterval: 'short', message: '継続監視' },
      });

      const deps = createDefaultDeps({ agentClient, actionDispatcher });
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(actionDispatcher.dispatch).toHaveBeenCalledWith({
        tool: 'continue_monitoring',
        params: {},
      });

      loop.stop();
    });

    it('do_nothing アクションはそのまま渡す', async () => {
      const deps = createDefaultDeps();
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(deps.actionDispatcher.dispatch).toHaveBeenCalledWith({
        tool: 'do_nothing',
        params: {},
      });

      loop.stop();
    });
  });

  // =============================================================================
  // 構造化ログ出力テスト (Req 3.5)
  // =============================================================================

  describe('構造化ログ出力 (Req 3.5)', () => {
    it('各サイクルの結果をコンソールに構造化ログとして出力する', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const deps = createDefaultDeps();
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0); // 1st cycle

      // 構造化ログが出力されている
      const logCalls = consoleSpy.mock.calls.map(c => String(c[0]));
      const cycleLog = logCalls.find(l => l.includes('[MonitorLoop]') && l.includes('Cycle #'));
      expect(cycleLog).toBeDefined();
      expect(cycleLog).toContain('do_nothing');
      expect(cycleLog).toContain('img1.jpg');

      loop.stop();
      consoleSpy.mockRestore();
    });

    it('light_control のログにパラメータが含まれる', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const agentClient = createMockAgentClient();
      const actionDispatcher = createMockActionDispatcher();

      vi.mocked(agentClient.analyze).mockResolvedValueOnce({
        ok: true,
        value: [{ tool: 'light_control', params: { action: 'on' } }],
      });
      vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
        ok: true,
        value: { executed: true, nextInterval: 'normal', message: '照明ON' },
      });

      const deps = createDefaultDeps({ agentClient, actionDispatcher });
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0);

      const logCalls = consoleSpy.mock.calls.map(c => String(c[0]));
      const cycleLog = logCalls.find(l => l.includes('light_control'));
      expect(cycleLog).toBeDefined();
      expect(cycleLog).toContain('action=on');

      loop.stop();
      consoleSpy.mockRestore();
    });

    it('エラー時にもエラーログを構造化して出力する', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const imageLoader = createMockImageLoader();
      vi.mocked(imageLoader.loadImage).mockResolvedValueOnce({
        ok: false,
        error: { code: 'FILE_NOT_FOUND', message: 'Not found', filePath: '/images/a.jpg' },
      });

      const deps = createDefaultDeps({ imageLoader });
      const config = createDefaultConfig();
      const loop = createMonitorLoop(config, deps);

      loop.start();
      await vi.advanceTimersByTimeAsync(0);

      const errorCalls = errorSpy.mock.calls.map(c => String(c[0]));
      const errorLog = errorCalls.find(l => l.includes('[MonitorLoop]'));
      expect(errorLog).toBeDefined();
      expect(errorLog).toContain('Cycle #');

      loop.stop();
      errorSpy.mockRestore();
    });
  });
});

// =============================================================================
// シグナルハンドリングテスト (Req 5.4)
// =============================================================================

describe('setupSignalHandlers', () => {
  it('SIGINT ハンドラを登録する', () => {
    const onSpy = vi.spyOn(process, 'on');
    const mockLoop: MonitorLoopService = {
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn().mockReturnValue({ mode: 'normal', currentImageIndex: 0, cycleCount: 0, continuousCount: 0 }),
    };

    const cleanup = setupSignalHandlers(mockLoop);

    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

    cleanup();
    onSpy.mockRestore();
  });

  it('SIGTERM ハンドラを登録する', () => {
    const onSpy = vi.spyOn(process, 'on');
    const mockLoop: MonitorLoopService = {
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn().mockReturnValue({ mode: 'normal', currentImageIndex: 0, cycleCount: 0, continuousCount: 0 }),
    };

    const cleanup = setupSignalHandlers(mockLoop);

    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

    cleanup();
    onSpy.mockRestore();
  });

  it('シグナル受信時にloop.stop()が呼ばれる', () => {
    const handlers: Record<string, Function> = {};
    const onSpy = vi.spyOn(process, 'on').mockImplementation((event: string, handler: Function) => {
      handlers[event] = handler;
      return process;
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // process.exit をモック（実際に終了しないように）
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    const mockLoop: MonitorLoopService = {
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn().mockReturnValue({ mode: 'normal', currentImageIndex: 0, cycleCount: 5, continuousCount: 0 }),
    };

    const cleanup = setupSignalHandlers(mockLoop);

    // SIGINT をシミュレート
    handlers['SIGINT']?.();

    expect(mockLoop.stop).toHaveBeenCalledTimes(1);

    cleanup();
    onSpy.mockRestore();
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('cleanup() でハンドラが解除される', () => {
    const offSpy = vi.spyOn(process, 'off');
    const mockLoop: MonitorLoopService = {
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn().mockReturnValue({ mode: 'normal', currentImageIndex: 0, cycleCount: 0, continuousCount: 0 }),
    };

    const cleanup = setupSignalHandlers(mockLoop);
    cleanup();

    expect(offSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

    offSpy.mockRestore();
  });
});

// =============================================================================
// デバイス状態取得とプロンプト構築の統合テスト (Task 6.1)
// =============================================================================

function createMockDeviceStateService(): DeviceStateService {
  return {
    getDeviceState: vi.fn().mockResolvedValue({
      ok: true,
      value: { light: { power: 'on' }, aircon: { temperature: '26', mode: 'cool' } },
    }),
  };
}

function createMockBuildPrompt(): (deviceState?: DeviceState) => string {
  return vi.fn().mockReturnValue('mock-prompt');
}

describe('MonitorLoop デバイス状態取得・プロンプト構築統合 (Task 6.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('MonitorLoopDependenciesにdeviceStateServiceとbuildPromptを渡せる', () => {
    const deviceStateService = createMockDeviceStateService();
    const mockBuildPrompt = createMockBuildPrompt();
    const deps = createDefaultDeps({
      deviceStateService,
      buildPrompt: mockBuildPrompt,
    });

    expect(deps.deviceStateService).toBe(deviceStateService);
    expect(deps.buildPrompt).toBe(mockBuildPrompt);
  });

  it('normalモードのサイクルでDeviceStateServiceからデバイス状態を取得する', async () => {
    const deviceStateService = createMockDeviceStateService();
    const mockBuildPrompt = createMockBuildPrompt();
    const deps = createDefaultDeps({
      deviceStateService,
      buildPrompt: mockBuildPrompt,
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(deviceStateService.getDeviceState).toHaveBeenCalledTimes(1);

    loop.stop();
  });

  it('取得した状態をbuildPromptに渡して動的プロンプトを構築する', async () => {
    const deviceState: DeviceState = { light: { power: 'on' }, aircon: { temperature: '26', mode: 'cool' } };
    const deviceStateService = createMockDeviceStateService();
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ok: true,
      value: deviceState,
    });
    const mockBuildPrompt = createMockBuildPrompt();
    const deps = createDefaultDeps({
      deviceStateService,
      buildPrompt: mockBuildPrompt,
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockBuildPrompt).toHaveBeenCalledWith(deviceState, []);

    loop.stop();
  });

  it('buildPromptの結果をagentClient.analyzeに渡す', async () => {
    const mockBuildPrompt = vi.fn().mockReturnValue('dynamic-prompt-with-state');
    const agentClient = createMockAgentClient();
    const deps = createDefaultDeps({
      agentClient,
      deviceStateService: createMockDeviceStateService(),
      buildPrompt: mockBuildPrompt,
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(agentClient.analyze).toHaveBeenCalledWith(
      expect.anything(),
      'dynamic-prompt-with-state'
    );

    loop.stop();
  });

  it('continuousモード中はcachedDeviceStateを使用しAPI呼び出しをスキップする', async () => {
    const deviceState: DeviceState = { light: { power: 'off' }, aircon: null };
    const deviceStateService = createMockDeviceStateService();
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ok: true,
      value: deviceState,
    });
    const mockBuildPrompt = createMockBuildPrompt();
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();

    // 1st cycle: continue_monitoring -> continuous mode
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'continue_monitoring', params: {} as Record<string, never> }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: true,
      value: { executed: false, nextInterval: 'short', message: '継続監視' },
    });

    // 2nd cycle: do_nothing (default)

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService,
      buildPrompt: mockBuildPrompt,
    });
    const config = createDefaultConfig({ normalIntervalMs: 200, shortIntervalMs: 50 });
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0); // 1st cycle (normal mode)
    expect(deviceStateService.getDeviceState).toHaveBeenCalledTimes(1);

    // 2nd cycle in continuous mode
    await vi.advanceTimersByTimeAsync(50);
    // API呼び出しは増えない（キャッシュ利用）
    expect(deviceStateService.getDeviceState).toHaveBeenCalledTimes(1);
    // ただしbuildPromptはキャッシュ済み状態で呼ばれる
    expect(mockBuildPrompt).toHaveBeenCalledTimes(2);
    expect(mockBuildPrompt).toHaveBeenLastCalledWith(deviceState, [
      { tool: 'continue_monitoring', params: {} },
    ]);

    loop.stop();
  });

  it('LoopStateにcachedDeviceStateフィールドが含まれる', async () => {
    const deviceState: DeviceState = { light: { power: 'on' }, aircon: null };
    const deviceStateService = createMockDeviceStateService();
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ok: true,
      value: deviceState,
    });
    const deps = createDefaultDeps({
      deviceStateService,
      buildPrompt: createMockBuildPrompt(),
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(loop.getState().cachedDeviceState).toEqual(deviceState);

    loop.stop();
  });

  it('状態取得失敗時はundefinedをbuildPromptに渡して基本プロンプトのみでAI分析を実行する', async () => {
    const deviceStateService = createMockDeviceStateService();
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ok: false,
      error: { code: 'API_ERROR', message: 'Network error' },
    });
    const mockBuildPrompt = createMockBuildPrompt();
    const deps = createDefaultDeps({
      deviceStateService,
      buildPrompt: mockBuildPrompt,
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    // buildPromptにundefinedとアクション履歴（空）が渡される
    expect(mockBuildPrompt).toHaveBeenCalledWith(undefined, []);
    // AI分析は実行される（フォールバック）
    expect(deps.agentClient.analyze).toHaveBeenCalledTimes(1);
    // cachedDeviceStateはundefined
    expect(loop.getState().cachedDeviceState).toBeUndefined();

    loop.stop();
  });

  it('デバイス状態取得失敗時もcachedDeviceStateをundefinedにクリアする', async () => {
    const deviceState: DeviceState = { light: { power: 'on' }, aircon: null };
    const deviceStateService = createMockDeviceStateService();
    const mockBuildPrompt = createMockBuildPrompt();
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();

    // 1st cycle: 正常取得 + continue_monitoring
    vi.mocked(deviceStateService.getDeviceState)
      .mockResolvedValueOnce({ ok: true, value: deviceState })
      .mockResolvedValueOnce({ ok: false, error: { code: 'API_ERROR', message: 'fail' } });
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'do_nothing', params: {} as Record<string, never> }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: true,
      value: { executed: false, nextInterval: 'normal', message: '異常なし' },
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService,
      buildPrompt: mockBuildPrompt,
    });
    const config = createDefaultConfig({ normalIntervalMs: 50 });
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0); // 1st cycle: 正常
    expect(loop.getState().cachedDeviceState).toEqual(deviceState);

    // 2nd cycle: API失敗 → cachedDeviceStateクリア
    await vi.advanceTimersByTimeAsync(50);
    expect(loop.getState().cachedDeviceState).toBeUndefined();

    loop.stop();
  });
});

// =============================================================================
// 重複チェック・キャッシュ論理更新統合テスト (Task 6.2)
// =============================================================================

describe('MonitorLoop 重複チェック・キャッシュ論理更新統合 (Task 6.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('重複するデバイス制御アクションはディスパッチをスキップする', async () => {
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();
    const deviceStateService = createMockDeviceStateService();
    const mockBuildPrompt = createMockBuildPrompt();

    // 1st cycle: light_control on
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'light_control', params: { action: 'on' } }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: true,
      value: { executed: true, nextInterval: 'normal', message: '照明ON' },
    });

    // 2nd cycle: 同一のlight_control on（重複）
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'light_control', params: { action: 'on' } }],
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService,
      buildPrompt: mockBuildPrompt,
    });
    const config = createDefaultConfig({ normalIntervalMs: 50 });
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0); // 1st cycle
    expect(actionDispatcher.dispatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50); // 2nd cycle: 重複スキップ
    // dispatchは1回のまま（重複スキップ）
    expect(actionDispatcher.dispatch).toHaveBeenCalledTimes(1);

    loop.stop();
  });

  it('重複スキップ時にスキップログが出力される', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();
    const deviceStateService = createMockDeviceStateService();
    const mockBuildPrompt = createMockBuildPrompt();

    // 1st cycle: light_control on
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'light_control', params: { action: 'on' } }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: true,
      value: { executed: true, nextInterval: 'normal', message: '照明ON' },
    });

    // 2nd cycle: 同一のlight_control on
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'light_control', params: { action: 'on' } }],
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService,
      buildPrompt: mockBuildPrompt,
    });
    const config = createDefaultConfig({ normalIntervalMs: 50 });
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50);

    const logCalls = consoleSpy.mock.calls.map(c => String(c[0]));
    const skipLog = logCalls.find(l => l.includes('SKIPPED'));
    expect(skipLog).toBeDefined();
    expect(skipLog).toContain('light_control');

    loop.stop();
    consoleSpy.mockRestore();
  });

  it('do_nothing/continue_monitoringは重複チェック対象外で毎回ディスパッチされる', async () => {
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();

    // 2回連続do_nothing
    vi.mocked(agentClient.analyze).mockResolvedValue({
      ok: true,
      value: [{ tool: 'do_nothing', params: {} as Record<string, never> }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValue({
      ok: true,
      value: { executed: false, nextInterval: 'normal', message: '異常なし' },
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService: createMockDeviceStateService(),
      buildPrompt: createMockBuildPrompt(),
    });
    const config = createDefaultConfig({ normalIntervalMs: 50 });
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0); // 1st cycle
    await vi.advanceTimersByTimeAsync(50); // 2nd cycle

    // do_nothingは重複チェック対象外なので2回ともディスパッチされる
    expect(actionDispatcher.dispatch).toHaveBeenCalledTimes(2);

    loop.stop();
  });

  it('デバイス制御アクション実行成功後にlastActionを更新する', async () => {
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();

    const lightOnAction: AgentAction = { tool: 'light_control', params: { action: 'on' } };
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [lightOnAction],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: true,
      value: { executed: true, nextInterval: 'normal', message: '照明ON' },
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService: createMockDeviceStateService(),
      buildPrompt: createMockBuildPrompt(),
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(loop.getState().lastAction).toEqual(lightOnAction);

    loop.stop();
  });

  it('デバイス制御アクション実行成功後にcachedDeviceStateを論理更新する（light_control）', async () => {
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();
    const deviceStateService = createMockDeviceStateService();

    // 初期状態: light off
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ok: true,
      value: { light: { power: 'off' }, aircon: { temperature: '26', mode: 'cool' } },
    });

    // light_control on
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'light_control', params: { action: 'on' } }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: true,
      value: { executed: true, nextInterval: 'normal', message: '照明ON' },
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService,
      buildPrompt: createMockBuildPrompt(),
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    // cachedDeviceStateがlight_control(on)で論理更新される
    expect(loop.getState().cachedDeviceState).toEqual({
      light: { power: 'on' },
      aircon: { temperature: '26', mode: 'cool' },
    });

    loop.stop();
  });

  it('デバイス制御アクション実行成功後にcachedDeviceStateを論理更新する（aircon_control）', async () => {
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();
    const deviceStateService = createMockDeviceStateService();

    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ok: true,
      value: { light: { power: 'on' }, aircon: { temperature: '26', mode: 'cool' } },
    });

    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'aircon_control', params: { temperature: 28, mode: 'warm' } }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: true,
      value: { executed: true, nextInterval: 'normal', message: 'エアコン設定' },
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService,
      buildPrompt: createMockBuildPrompt(),
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(loop.getState().cachedDeviceState).toEqual({
      light: { power: 'on' },
      aircon: { temperature: '28', mode: 'warm' },
    });

    loop.stop();
  });

  it('デバイス制御アクション実行失敗時はcachedDeviceStateを更新しない', async () => {
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();
    const deviceStateService = createMockDeviceStateService();

    const originalState: DeviceState = { light: { power: 'off' }, aircon: { temperature: '26', mode: 'cool' } };
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ok: true,
      value: originalState,
    });

    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'light_control', params: { action: 'on' } }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: false,
      error: { code: 'IOT_ERROR' as const, message: 'Device unreachable' },
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService,
      buildPrompt: createMockBuildPrompt(),
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    // 失敗時はcachedDeviceStateは元のまま
    expect(loop.getState().cachedDeviceState).toEqual(originalState);

    loop.stop();
  });

  it('overrideApplianceId関数が削除され、AgentActionがそのままディスパッチされる', async () => {
    const agentClient = createMockAgentClient();
    const actionDispatcher = createMockActionDispatcher();

    // appliance_idなしのlight_control
    vi.mocked(agentClient.analyze).mockResolvedValueOnce({
      ok: true,
      value: [{ tool: 'light_control', params: { action: 'on' } }],
    });
    vi.mocked(actionDispatcher.dispatch).mockResolvedValueOnce({
      ok: true,
      value: { executed: true, nextInterval: 'normal', message: '照明ON' },
    });

    const deps = createDefaultDeps({
      agentClient,
      actionDispatcher,
      deviceStateService: createMockDeviceStateService(),
      buildPrompt: createMockBuildPrompt(),
    });
    const config = createDefaultConfig();
    const loop = createMonitorLoop(config, deps);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    // appliance_idの上書きなく、そのまま渡される
    expect(actionDispatcher.dispatch).toHaveBeenCalledWith({
      tool: 'light_control',
      params: { action: 'on' },
    });

    loop.stop();
  });
});
