/**
 * CLI 引数解析モジュール
 *
 * コマンドライン引数を解析し、CliOptions を Result 型で返す。
 * --image-dir（必須）、--light-id、--aircon-id の3つの引数を定義する。
 *
 * Requirements: 5.1, 5.2, 5.3, 6.4
 */

import type { Result } from '../../../vertex-ai-vision/src/types/result.js';
import { ok, err } from '../../../vertex-ai-vision/src/types/result.js';

// =============================================================================
// 型定義
// =============================================================================

/**
 * CLI オプション
 */
export interface CliOptions {
  /** 画像ディレクトリパス */
  readonly imageDir: string;
  /** 照明 appliance_id */
  readonly lightId: string;
  /** エアコン appliance_id */
  readonly airconId: string;
  /** ヘルプ表示フラグ */
  readonly help?: boolean;
}

/**
 * CLI 解析エラー
 */
export interface CliParseError {
  /** エラーコード */
  readonly code: 'MISSING_REQUIRED' | 'INVALID_PATH';
  /** エラーメッセージ */
  readonly message: string;
}

// =============================================================================
// 定数
// =============================================================================

const USAGE = `Usage: iot-ai-agent-loop --image-dir <path> [options]

Required:
  --image-dir <path>       画像ディレクトリパス

Options:
  --light-id <id>          照明の appliance_id
  --aircon-id <id>         エアコンの appliance_id
  --help, -h               ヘルプを表示

Examples:
  iot-ai-agent-loop --image-dir ./images --light-id abc123 --aircon-id def456
  iot-ai-agent-loop --image-dir /path/to/images`;

// =============================================================================
// 関数
// =============================================================================

/**
 * ヘルプメッセージを取得
 */
export function getHelpMessage(): string {
  return USAGE;
}

/**
 * コマンドライン引数を解析
 *
 * @param args - process.argv.slice(2) のような引数配列
 * @returns 解析結果（成功時は CliOptions、失敗時は CliParseError）
 */
export function parseCliArgs(args: string[]): Result<CliOptions, CliParseError> {
  // ヘルプフラグを先にチェック
  if (args.includes('--help') || args.includes('-h')) {
    return ok({
      imageDir: '',
      lightId: '',
      airconId: '',
      help: true,
    });
  }

  let imageDir = '';
  let lightId = '';
  let airconId = '';

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === undefined) {
      i++;
      continue;
    }

    // --key=value 形式
    if (arg.startsWith('--image-dir=')) {
      imageDir = arg.slice('--image-dir='.length);
      i++;
      continue;
    }
    if (arg.startsWith('--light-id=')) {
      lightId = arg.slice('--light-id='.length);
      i++;
      continue;
    }
    if (arg.startsWith('--aircon-id=')) {
      airconId = arg.slice('--aircon-id='.length);
      i++;
      continue;
    }

    // --key value 形式
    if (arg === '--image-dir') {
      const nextArg = args[i + 1];
      if (nextArg !== undefined) {
        imageDir = nextArg;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (arg === '--light-id') {
      const nextArg = args[i + 1];
      if (nextArg !== undefined) {
        lightId = nextArg;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (arg === '--aircon-id') {
      const nextArg = args[i + 1];
      if (nextArg !== undefined) {
        airconId = nextArg;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // 未知のオプションは無視
    i++;
  }

  // 必須引数のバリデーション
  if (!imageDir) {
    return err({
      code: 'MISSING_REQUIRED',
      message: '必須引数 --image-dir が指定されていません',
    });
  }

  return ok({
    imageDir,
    lightId,
    airconId,
  });
}
