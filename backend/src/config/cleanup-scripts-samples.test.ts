/**
 * Cleanup: 実験用スクリプト・サンプルデータ削除の検証テスト
 *
 * 以下の削除を検証する:
 * - Alexaデバイス一覧取得スクリプト (list-devices.ts)
 * - Nature Remoアプライアンス一覧取得シェルスクリプト (list-appliances.sh)
 * - scriptsディレクトリ（空の場合）
 * - Nature Remo APIレスポンスサンプルディレクトリ (samples/)
 * - nature-remoパッケージ内ステアリングディレクトリ (.kiro/)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// プロジェクトルートからの相対パスでファイルを解決する
const projectRoot = resolve(import.meta.dirname, '../../../');

describe('実験用スクリプト・サンプルデータの削除 (Req 2.1, 2.2, 2.3, 2.4, 2.5)', () => {
  it('alexa-remote/src/list-devices.ts が削除されていること (Req 2.1)', () => {
    const filePath = resolve(projectRoot, 'backend/packages/alexa-remote2/src/list-devices.ts');
    expect(existsSync(filePath)).toBe(false);
  });

  it('backend/scripts/list-appliances.sh が削除されていること (Req 2.2)', () => {
    const filePath = resolve(projectRoot, 'backend/scripts/list-appliances.sh');
    expect(existsSync(filePath)).toBe(false);
  });

  it('backend/scripts/ ディレクトリが削除されていること (Req 2.3)', () => {
    const dirPath = resolve(projectRoot, 'backend/scripts');
    expect(existsSync(dirPath)).toBe(false);
  });

  it('nature-remo/samples/ ディレクトリが削除されていること (Req 2.4)', () => {
    const dirPath = resolve(projectRoot, 'backend/packages/nature-remo/samples');
    expect(existsSync(dirPath)).toBe(false);
  });

  it('nature-remo/.kiro/ ディレクトリが削除されていること (Req 2.5)', () => {
    const dirPath = resolve(projectRoot, 'backend/packages/nature-remo/.kiro');
    expect(existsSync(dirPath)).toBe(false);
  });
});
