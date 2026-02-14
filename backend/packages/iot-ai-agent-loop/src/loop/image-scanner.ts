/**
 * ImageScanner - 画像ディレクトリスキャン
 *
 * 指定ディレクトリ内の画像ファイル一覧を取得する。
 * - サポートする拡張子: .jpg, .jpeg, .png, .gif, .webp, .bmp
 * - ファイル名でソートして返す（一貫した順序のため）
 * - 画像ファイルが見つからない場合はエラーを返す
 *
 * Requirements: 5.4
 */

import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import type { Result } from '../../../vertex-ai-vision/src/types/result.js';

// =============================================================================
// Constants
// =============================================================================

/** サポートする画像拡張子 */
export const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
] as const;

// =============================================================================
// Types
// =============================================================================

export interface ImageScanError {
  readonly code: 'NO_IMAGES' | 'DIR_NOT_FOUND' | 'SCAN_ERROR';
  readonly message: string;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * 指定ディレクトリ内の画像ファイル一覧を取得する。
 * ファイル名でソートして返す。
 */
export function scanImageDirectory(dirPath: string): Result<string[], ImageScanError> {
  let entries: string[];
  try {
    entries = readdirSync(dirPath).map(e => String(e));
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        ok: false,
        error: {
          code: 'DIR_NOT_FOUND',
          message: `ディレクトリが見つかりません: ${dirPath}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'SCAN_ERROR',
        message: `ディレクトリの読み込みに失敗しました: ${dirPath}`,
      },
    };
  }

  const imageFiles = entries
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
    })
    .sort();

  if (imageFiles.length === 0) {
    return {
      ok: false,
      error: {
        code: 'NO_IMAGES',
        message: `画像ファイルが見つかりません: ${dirPath}`,
      },
    };
  }

  return { ok: true, value: imageFiles };
}
