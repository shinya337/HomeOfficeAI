/**
 * Cleanup: 実験用環境テンプレートファイル削除の検証テスト
 *
 * 3パッケージの.env.exampleファイルが削除され、
 * 本番用テンプレート（.env.sample）が保持されていることを確認する。
 *
 * Requirements: 1.1, 1.2, 1.3
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// プロジェクトルートからの相対パスでファイルを解決する
const projectRoot = resolve(import.meta.dirname, '../../../');

describe('実験用環境テンプレートファイルの削除 (Req 1.1, 1.2, 1.3)', () => {
  it('alexa-remote/.env.example が削除されていること (Req 1.1)', () => {
    const filePath = resolve(projectRoot, 'backend/packages/alexa-remote2/.env.example');
    expect(existsSync(filePath)).toBe(false);
  });

  it('iot-ai-agent-loop/.env.example が削除されていること (Req 1.2)', () => {
    const filePath = resolve(projectRoot, 'backend/packages/iot-ai-agent-loop/.env.example');
    expect(existsSync(filePath)).toBe(false);
  });

  it('nature-remo/.env.example が削除されていること (Req 1.3)', () => {
    const filePath = resolve(projectRoot, 'backend/packages/nature-remo/.env.example');
    expect(existsSync(filePath)).toBe(false);
  });

  it('本番用テンプレート backend/.env.sample が保持されていること', () => {
    const filePath = resolve(projectRoot, 'backend/.env.sample');
    expect(existsSync(filePath)).toBe(true);
  });
});
