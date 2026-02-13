/**
 * ImageLoader - Image File Loading and Base64 Encoding
 *
 * Loads image files from the file system, encodes them to Base64,
 * and automatically detects MIME type from file extension.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ok, err, type Result } from '../types/result.js';
import type { ImageData, ImageMimeType, ImageError } from '../types/index.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Mapping of file extensions to MIME types
 * Supports: jpeg, jpg, png, gif, webp
 */
const EXTENSION_TO_MIME: Record<string, ImageMimeType> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * List of supported file extensions for error messages
 */
const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TO_MIME)
  .map((ext) => ext.slice(1)) // remove leading dot
  .join(', ');

// =============================================================================
// Service Interface
// =============================================================================

/**
 * ImageLoader service interface for loading and encoding images
 */
export interface ImageLoaderService {
  /**
   * Load an image file and encode it to Base64
   * @param filePath - Absolute or relative path to the image file
   * @returns Result containing ImageData on success, ImageError on failure
   */
  loadImage(filePath: string): Promise<Result<ImageData, ImageError>>;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Get MIME type from file extension
 * @param filePath - Path to the file
 * @returns MIME type if extension is supported, undefined otherwise
 */
function getMimeTypeFromExtension(filePath: string): ImageMimeType | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_MIME[ext];
}

/**
 * Check if a file exists
 * @param filePath - Path to check
 * @returns true if file exists, false otherwise
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an ImageLoader service instance
 *
 * The ImageLoader:
 * - Reads image files from the file system (Req 1.1)
 * - Encodes image data to Base64 (Req 1.2)
 * - Detects MIME type from file extension (Req 1.3)
 * - Returns FILE_NOT_FOUND error for non-existent files (Req 1.4)
 * - Returns UNSUPPORTED_FORMAT error for unsupported extensions (Req 1.5)
 *
 * @returns ImageLoaderService instance
 */
export function createImageLoader(): ImageLoaderService {
  return {
    async loadImage(filePath: string): Promise<Result<ImageData, ImageError>> {
      // Handle empty or invalid path
      if (!filePath || filePath.trim() === '') {
        return err({
          code: 'FILE_NOT_FOUND',
          message: 'ファイルパスが指定されていません。',
          filePath: filePath || '',
        });
      }

      // Check MIME type first (before file access) to fail fast on unsupported formats
      const mimeType = getMimeTypeFromExtension(filePath);
      if (!mimeType) {
        return err({
          code: 'UNSUPPORTED_FORMAT',
          message: `ファイル形式がサポートされていません。サポートされている形式: ${SUPPORTED_EXTENSIONS}`,
          filePath,
        });
      }

      // Check if file exists
      if (!(await fileExists(filePath))) {
        return err({
          code: 'FILE_NOT_FOUND',
          message: `ファイルが見つかりません: ${filePath}`,
          filePath,
        });
      }

      // Read file and encode to Base64
      try {
        const buffer = await fs.readFile(filePath);
        const base64 = buffer.toString('base64');

        return ok({
          base64,
          mimeType,
          filePath,
        });
      } catch (error) {
        // Handle read errors
        return err({
          code: 'READ_ERROR',
          message: `ファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
          filePath,
        });
      }
    },
  };
}
