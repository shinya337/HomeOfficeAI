/**
 * main.ts - アプリケーション初期化と監視ループ起動
 *
 * CLI引数と環境変数を読み込み、全モジュールを初期化して
 * 監視ループを開始するエントリポイント。
 *
 * - CLI引数の解析とバリデーション
 * - 環境変数の読み込み（AgentConfig）
 * - NatureRemoClient、LightService、AirconServiceの生成
 * - AgentClient、ActionDispatcher、MonitorLoopの生成と依存関係注入
 * - シグナルハンドラの登録と監視ループの開始
 *
 * Requirements: 6.1, 6.3, 6.4
 */

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
import {
  createMonitorLoop,
  setupSignalHandlers,
  NORMAL_INTERVAL_MS,
  SHORT_INTERVAL_MS,
  DEFAULT_MAX_CONTINUOUS_CYCLES,
} from './loop/monitor-loop.js';
import { adaptNatureRemoResult } from './types/result-adapter.js';
import type { ApplianceConfig } from './types/actions.js';

// =============================================================================
// Application Initialization
// =============================================================================

/**
 * アプリケーションを初期化して監視ループを起動する。
 *
 * @param argv - process.argv のようなコマンドライン引数配列
 */
export async function initializeApp(argv: string[]): Promise<void> {
  // 1. CLI引数の解析
  const cliResult = parseCliArgs(argv.slice(2));
  if (!cliResult.ok) {
    console.error(`[Error] ${cliResult.error.message}`);
    console.error(getHelpMessage());
    process.exit(1);
    return;
  }

  const cliOptions = cliResult.value;

  // ヘルプ表示
  if (cliOptions.help) {
    console.log(getHelpMessage());
    process.exit(0);
    return;
  }

  // 2. 環境変数の読み込み
  const configResult = loadAgentConfig();
  if (!configResult.ok) {
    console.error(`[Error] ${configResult.error.message}`);
    console.error(configResult.error.suggestion);
    process.exit(1);
    return;
  }

  const config = configResult.value;

  // 3. 画像ディレクトリのスキャン
  const scanResult = scanImageDirectory(cliOptions.imageDir);
  if (!scanResult.ok) {
    console.error(`[Error] ${scanResult.error.message}`);
    process.exit(1);
    return;
  }

  const imageFiles = scanResult.value;

  // 4. NatureRemoClient と IoTサービスの生成（Factory関数パターン）
  const rateLimitMonitor = createRateLimitMonitor();
  const natureRemoClient = createNatureRemoClient(config.natureRemoToken, rateLimitMonitor);
  const lightService = createLightService(natureRemoClient);
  const airconService = createAirconService(natureRemoClient);
  const applianceService = createApplianceService(natureRemoClient);

  // 5. ApplianceConfig の生成（CLI引数優先、未指定なら自動取得）
  let lightApplianceId = cliOptions.lightId;
  let airconApplianceId = cliOptions.airconId;

  if (!lightApplianceId || !airconApplianceId) {
    const listResult = adaptNatureRemoResult(await applianceService.getAppliances());
    if (listResult.ok) {
      const appliances = listResult.value;
      if (!lightApplianceId) {
        const light = appliances.find(a => a.type === 'LIGHT');
        if (light) {
          lightApplianceId = light.id;
          console.log(`[Auto-detected] Light: ${light.id} (${light.nickname})`);
        }
      }
      if (!airconApplianceId) {
        const aircon = appliances.find(a => a.type === 'AC');
        if (aircon) {
          airconApplianceId = aircon.id;
          console.log(`[Auto-detected] Aircon: ${aircon.id} (${aircon.nickname})`);
        }
      }
    } else {
      console.warn(`[Warning] アプライアンス自動取得失敗: ${listResult.error.message}`);
    }
  }

  const applianceConfig: ApplianceConfig = { lightApplianceId, airconApplianceId };

  // 6. DeviceStateService の生成
  const deviceStateService = createDeviceStateService(applianceConfig, applianceService);

  // 7. ImageLoader の生成
  const imageLoader = createImageLoader();

  // 8. AgentClient の生成
  const agentClient = createAgentClient({
    projectId: config.projectId,
    location: config.location,
    model: config.model,
  });

  // 9. ActionDispatcher の生成（ApplianceConfigを注入）
  const actionDispatcher = createActionDispatcher(applianceConfig, {
    lightService,
    airconService,
  });

  // 10. MonitorLoop の生成と依存関係注入
  const monitorLoop = createMonitorLoop(
    {
      imageDir: cliOptions.imageDir,
      normalIntervalMs: NORMAL_INTERVAL_MS,
      shortIntervalMs: SHORT_INTERVAL_MS,
      maxContinuousCycles: DEFAULT_MAX_CONTINUOUS_CYCLES,
    },
    {
      agentClient,
      actionDispatcher,
      imageLoader,
      imageFiles,
      deviceStateService,
      buildPrompt,
    }
  );

  // 11. シグナルハンドラの登録
  setupSignalHandlers(monitorLoop);

  // 12. 起動ログ
  console.log(`[IoT AI Agent Loop] 監視ループを開始します`);
  console.log(`  Project: ${config.projectId}`);
  console.log(`  Model: ${config.model}`);
  console.log(`  Location: ${config.location}`);
  console.log(`  Image Dir: ${cliOptions.imageDir} (${imageFiles.length} 枚)`);
  console.log(`  Light ID: ${lightApplianceId || '(未指定)'}`);
  console.log(`  Aircon ID: ${airconApplianceId || '(未指定)'}`);
  console.log(`  Normal Interval: ${NORMAL_INTERVAL_MS / 1000}秒`);
  console.log(`  Short Interval: ${SHORT_INTERVAL_MS / 1000}秒`);
  console.log(`  Max Continuous Cycles: ${DEFAULT_MAX_CONTINUOUS_CYCLES}`);

  // 13. 監視ループの開始
  monitorLoop.start();
}
