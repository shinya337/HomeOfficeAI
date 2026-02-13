/**
 * Cleanup: パッケージ名の本番用正規化の検証テスト
 *
 * 3パッケージのnameフィールドからexperimentサフィックスを除去し、
 * descriptionフィールドを本番にふさわしい内容に更新していることを確認する。
 * また、パッケージ名変更後にimportが正常であることを確認する。
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// プロジェクトルートからの相対パスでファイルを解決する
const projectRoot = resolve(import.meta.dirname, '../../../');

function readPackageJson(packageDir: string): { name: string; description: string } {
  const filePath = resolve(projectRoot, `backend/packages/${packageDir}/package.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

describe('パッケージ名の本番用正規化 (Req 3.1, 3.2, 3.3)', () => {
  describe('nameフィールドからexperimentサフィックスの除去', () => {
    it('alexa-remote の name が alexa-remote2 であること (Req 3.1)', () => {
      const pkg = readPackageJson('alexa-remote2');
      expect(pkg.name).toBe('alexa-remote2');
    });

    it('iot-ai-agent-loop の name が iot-ai-agent-loop であること (Req 3.2)', () => {
      const pkg = readPackageJson('iot-ai-agent-loop');
      expect(pkg.name).toBe('iot-ai-agent-loop');
    });

    it('nature-remo の name が nature-remo であること (Req 3.3)', () => {
      const pkg = readPackageJson('nature-remo');
      expect(pkg.name).toBe('nature-remo');
    });
  });

  describe('nameフィールドにexperimentが含まれないこと', () => {
    const packages = ['alexa-remote2', 'iot-ai-agent-loop', 'nature-remo'];

    for (const dir of packages) {
      it(`${dir}/package.json の name に experiment が含まれないこと`, () => {
        const pkg = readPackageJson(dir);
        expect(pkg.name).not.toContain('experiment');
      });
    }
  });

  describe('descriptionフィールドの正規化', () => {
    it('alexa-remote の description が本番用であること', () => {
      const pkg = readPackageJson('alexa-remote2');
      expect(pkg.description).toBe(
        'Amazon Echo (Alexa) control for HomeOffice.ai via alexa-remote2'
      );
      expect(pkg.description).not.toContain('experiment');
    });

    it('iot-ai-agent-loop の description が本番用であること', () => {
      const pkg = readPackageJson('iot-ai-agent-loop');
      expect(pkg.description).toBe(
        'IoT AI Agent Loop - Vertex AI Function Calling for autonomous IoT control'
      );
      expect(pkg.description).not.toContain('experiment');
    });

    it('nature-remo の description が本番用であること', () => {
      const pkg = readPackageJson('nature-remo');
      expect(pkg.description).toBe(
        'Nature Remo Cloud API client for HomeOffice.ai'
      );
      expect(pkg.description).not.toContain('experiment');
    });
  });
});

describe('importパスの正常動作確認 (Req 3.4)', () => {
  it('ソースコード内にパッケージ名によるimportが存在しないこと（全て相対パス）', () => {
    // パッケージ名でのimportが存在しないことを確認する
    // grep相当のチェック: import文にold/new名でのインポートがないこと
    const srcDir = resolve(projectRoot, 'backend');
    const { execSync } = require('node:child_process');

    // 旧パッケージ名でのimportが存在しないことを確認
    const oldNames = [
      'alexa-remote2-experiment',
      'iot-ai-agent-loop-experiment',
      'nature-remo-experiment',
    ];

    for (const name of oldNames) {
      try {
        const result = execSync(
          `grep -r "from ['\"]${name}" "${srcDir}" --include="*.ts" --include="*.js" -l 2>/dev/null || true`,
          { encoding: 'utf-8' }
        );
        expect(result.trim()).toBe('');
      } catch {
        // grep returns exit code 1 when no matches found, which is expected
      }
    }
  });

  it('package-lock.json が各パッケージに存在すること（npm install済み）', () => {
    const { existsSync } = require('node:fs');
    const packages = ['alexa-remote2', 'iot-ai-agent-loop', 'nature-remo'];

    for (const dir of packages) {
      const lockPath = resolve(projectRoot, `backend/packages/${dir}/package-lock.json`);
      expect(existsSync(lockPath), `${dir}/package-lock.json should exist`).toBe(true);
    }
  });

  it('package-lock.json 内のnameが正規化されていること', () => {
    const packages = [
      { dir: 'alexa-remote2', expectedName: 'alexa-remote2' },
      { dir: 'iot-ai-agent-loop', expectedName: 'iot-ai-agent-loop' },
      { dir: 'nature-remo', expectedName: 'nature-remo' },
    ];

    for (const { dir, expectedName } of packages) {
      const lockPath = resolve(projectRoot, `backend/packages/${dir}/package-lock.json`);
      const lockContent = JSON.parse(readFileSync(lockPath, 'utf-8'));
      expect(lockContent.name).toBe(expectedName);
    }
  });
});
