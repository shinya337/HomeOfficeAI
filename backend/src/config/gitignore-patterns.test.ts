/**
 * Cleanup: .gitignoreパターン整備の検証テスト
 *
 * ディレクトリ用パターンの末尾スラッシュ正規化、
 * 全要件パターンの存在、既存有効パターンの保持を確認する。
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../../../');
const gitignorePath = resolve(projectRoot, '.gitignore');

let lines: string[];

beforeAll(() => {
  const content = readFileSync(gitignorePath, 'utf-8');
  lines = content.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
});

describe('.gitignoreパターン整備 (Req 4.1-4.6)', () => {
  describe('要件パターンの存在確認', () => {
    it('.env パターンが含まれていること (Req 4.1)', () => {
      expect(lines).toContain('.env');
    });

    it('test-images/ パターンが含まれていること (Req 4.2)', () => {
      expect(lines).toContain('test-images/');
    });

    it('test-images-sleepy/ パターンが含まれていること (Req 4.2)', () => {
      expect(lines).toContain('test-images-sleepy/');
    });

    it('.alexa-cookie.json パターンが含まれていること (Req 4.3)', () => {
      expect(lines).toContain('.alexa-cookie.json');
    });

    it('.kiro/ パターンが末尾スラッシュ付きで含まれていること (Req 4.4)', () => {
      expect(lines).toContain('.kiro/');
    });

    it('.reports/ パターンが末尾スラッシュ付きで含まれていること (Req 4.5)', () => {
      expect(lines).toContain('.reports/');
    });

    it('node_modules/ パターンが含まれていること (Req 4.6)', () => {
      expect(lines).toContain('node_modules/');
    });
  });

  describe('ディレクトリ用パターンの末尾スラッシュ正規化', () => {
    it('.kiro がスラッシュなしで存在しないこと（.kiro/ に正規化済み）', () => {
      // ".kiro" (末尾スラッシュなし) が存在しないことを確認
      const hasWithoutSlash = lines.some((line) => line === '.kiro');
      expect(hasWithoutSlash).toBe(false);
    });

    it('.reports がスラッシュなしで存在しないこと（.reports/ に正規化済み）', () => {
      // ".reports" (末尾スラッシュなし) が存在しないことを確認
      const hasWithoutSlash = lines.some((line) => line === '.reports');
      expect(hasWithoutSlash).toBe(false);
    });
  });

  describe('既存の有効パターンの保持', () => {
    it('dist/ パターンが保持されていること', () => {
      expect(lines).toContain('dist/');
    });

    it('CLAUDE.md パターンが保持されていること', () => {
      expect(lines).toContain('CLAUDE.md');
    });

    it('.claude パターンが保持されていること', () => {
      expect(lines).toContain('.claude');
    });
  });
});
