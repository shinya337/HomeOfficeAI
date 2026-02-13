/**
 * ImageScanner テスト
 *
 * 指定ディレクトリ内の画像ファイル一覧を取得する。
 * - サポートする拡張子: .jpg, .jpeg, .png, .gif, .webp, .bmp
 * - ファイル名でソートして返す（一貫した順序のため）
 * - 画像ファイルが見つからない場合はエラーを返す
 *
 * Requirements: 5.4
 */
import { describe, it, expect, vi } from 'vitest';
import { scanImageDirectory, SUPPORTED_IMAGE_EXTENSIONS } from './image-scanner.js';

// =============================================================================
// fs モック
// =============================================================================

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
}));

import { readdirSync } from 'node:fs';

// =============================================================================
// 定数テスト
// =============================================================================

describe('SUPPORTED_IMAGE_EXTENSIONS', () => {
  it('jpg, jpeg, png, gif, webp, bmp をサポートする', () => {
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('.jpg');
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('.jpeg');
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('.png');
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('.gif');
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('.webp');
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('.bmp');
  });
});

// =============================================================================
// scanImageDirectory テスト
// =============================================================================

describe('scanImageDirectory', () => {
  it('ディレクトリ内の画像ファイルのみを返す', () => {
    vi.mocked(readdirSync).mockReturnValue(
      ['photo.jpg', 'data.txt', 'image.png', 'readme.md', 'pic.jpeg'] as unknown as ReturnType<typeof readdirSync>
    );

    const result = scanImageDirectory('/test/images');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['image.png', 'photo.jpg', 'pic.jpeg']);
    }
  });

  it('ファイル名をソートして返す', () => {
    vi.mocked(readdirSync).mockReturnValue(
      ['c.jpg', 'a.png', 'b.jpeg'] as unknown as ReturnType<typeof readdirSync>
    );

    const result = scanImageDirectory('/test/images');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['a.png', 'b.jpeg', 'c.jpg']);
    }
  });

  it('大文字拡張子もサポートする', () => {
    vi.mocked(readdirSync).mockReturnValue(
      ['photo.JPG', 'image.PNG', 'pic.Jpeg'] as unknown as ReturnType<typeof readdirSync>
    );

    const result = scanImageDirectory('/test/images');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
    }
  });

  it('画像ファイルが見つからない場合はエラーを返す', () => {
    vi.mocked(readdirSync).mockReturnValue(
      ['data.txt', 'readme.md'] as unknown as ReturnType<typeof readdirSync>
    );

    const result = scanImageDirectory('/test/images');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_IMAGES');
      expect(result.error.message).toContain('/test/images');
    }
  });

  it('空ディレクトリの場合はエラーを返す', () => {
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    const result = scanImageDirectory('/empty/dir');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_IMAGES');
    }
  });

  it('ディレクトリが存在しない場合はエラーを返す', () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    const result = scanImageDirectory('/nonexistent/dir');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DIR_NOT_FOUND');
      expect(result.error.message).toContain('/nonexistent/dir');
    }
  });

  it('その他の読み込みエラーの場合はSCAN_ERRORを返す', () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = scanImageDirectory('/restricted/dir');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCAN_ERROR');
    }
  });
});
