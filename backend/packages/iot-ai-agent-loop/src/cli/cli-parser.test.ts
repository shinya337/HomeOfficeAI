/**
 * CLI 引数解析モジュールのテスト
 *
 * タスク 6.1: コマンドライン引数の解析機能
 * Requirements: 5.1, 5.2, 5.3, 6.4
 */

import { describe, it, expect } from 'vitest';
import { parseCliArgs, getHelpMessage } from './cli-parser.js';

describe('parseCliArgs', () => {
  describe('全引数を正しく解析する', () => {
    it('--image-dir, --light-id, --aircon-id の3引数を解析する', () => {
      const result = parseCliArgs([
        '--image-dir', '/path/to/images',
        '--light-id', 'light-001',
        '--aircon-id', 'aircon-001',
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.imageDir).toBe('/path/to/images');
        expect(result.value.lightId).toBe('light-001');
        expect(result.value.airconId).toBe('aircon-001');
      }
    });

    it('= 形式でも引数を解析できる', () => {
      const result = parseCliArgs([
        '--image-dir=/path/to/images',
        '--light-id=light-001',
        '--aircon-id=aircon-001',
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.imageDir).toBe('/path/to/images');
        expect(result.value.lightId).toBe('light-001');
        expect(result.value.airconId).toBe('aircon-001');
      }
    });

    it('引数の順序が異なっても正しく解析できる', () => {
      const result = parseCliArgs([
        '--aircon-id', 'aircon-001',
        '--image-dir', '/path/to/images',
        '--light-id', 'light-001',
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.imageDir).toBe('/path/to/images');
        expect(result.value.lightId).toBe('light-001');
        expect(result.value.airconId).toBe('aircon-001');
      }
    });
  });

  describe('必須引数 --image-dir の検証', () => {
    it('--image-dir が未指定の場合はエラーを返す', () => {
      const result = parseCliArgs([
        '--light-id', 'light-001',
        '--aircon-id', 'aircon-001',
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_REQUIRED');
        expect(result.error.message).toContain('--image-dir');
      }
    });

    it('引数がない場合はエラーを返す', () => {
      const result = parseCliArgs([]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_REQUIRED');
        expect(result.error.message).toContain('--image-dir');
      }
    });
  });

  describe('オプション引数の取り扱い', () => {
    it('--light-id が未指定の場合は空文字列をデフォルトとする', () => {
      const result = parseCliArgs([
        '--image-dir', '/path/to/images',
        '--aircon-id', 'aircon-001',
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.lightId).toBe('');
      }
    });

    it('--aircon-id が未指定の場合は空文字列をデフォルトとする', () => {
      const result = parseCliArgs([
        '--image-dir', '/path/to/images',
        '--light-id', 'light-001',
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.airconId).toBe('');
      }
    });

    it('--image-dir のみでも成功する', () => {
      const result = parseCliArgs([
        '--image-dir', '/path/to/images',
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.imageDir).toBe('/path/to/images');
        expect(result.value.lightId).toBe('');
        expect(result.value.airconId).toBe('');
      }
    });
  });

  describe('ヘルプオプション', () => {
    it('--help が指定された場合は他の引数が不足していてもエラーにならない', () => {
      const result = parseCliArgs(['--help']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          imageDir: '',
          lightId: '',
          airconId: '',
          help: true,
        });
      }
    });

    it('-h でもヘルプモードになる', () => {
      const result = parseCliArgs(['-h']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveProperty('help', true);
      }
    });
  });

  describe('スペースを含むパス', () => {
    it('スペースを含むディレクトリパスを解析できる', () => {
      const result = parseCliArgs([
        '--image-dir', '/path/to/my images',
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.imageDir).toBe('/path/to/my images');
      }
    });
  });
});

describe('getHelpMessage', () => {
  it('ヘルプメッセージに使用法が含まれる', () => {
    const help = getHelpMessage();

    expect(help).toContain('Usage:');
    expect(help).toContain('--image-dir');
    expect(help).toContain('--light-id');
    expect(help).toContain('--aircon-id');
    expect(help).toContain('--help');
  });
});
