import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

describe('プロジェクト基盤セットアップ', () => {
  describe('package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'),
    );

    it('ES Modulesが有効であること', () => {
      expect(pkg.type).toBe('module');
    });

    it('必要なscriptsが定義されていること', () => {
      expect(pkg.scripts.start).toContain('tsx');
      expect(pkg.scripts.test).toContain('vitest');
      expect(pkg.scripts.typecheck).toContain('tsc');
    });

    it('dotenvが依存関係に含まれること', () => {
      expect(pkg.dependencies.dotenv).toBeDefined();
    });

    it('@google-cloud/vertexaiが依存関係に含まれること', () => {
      expect(pkg.dependencies['@google-cloud/vertexai']).toBeDefined();
    });

    it('Node.js 20+が要求されること', () => {
      expect(pkg.engines.node).toBe('>=20.0.0');
    });

    it('devDependenciesにTypeScript, tsx, vitestが含まれること', () => {
      expect(pkg.devDependencies.typescript).toBeDefined();
      expect(pkg.devDependencies.tsx).toBeDefined();
      expect(pkg.devDependencies.vitest).toBeDefined();
      expect(pkg.devDependencies['@types/node']).toBeDefined();
    });
  });

  describe('tsconfig.json', () => {
    const tsconfig = JSON.parse(
      readFileSync(resolve(projectRoot, 'tsconfig.json'), 'utf-8'),
    );

    it('ES2022ターゲットであること', () => {
      expect(tsconfig.compilerOptions.target).toBe('ES2022');
    });

    it('NodeNextモジュールであること', () => {
      expect(tsconfig.compilerOptions.module).toBe('NodeNext');
      expect(tsconfig.compilerOptions.moduleResolution).toBe('NodeNext');
    });

    it('strictモードが有効であること', () => {
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('出力先がdistであること', () => {
      expect(tsconfig.compilerOptions.outDir).toBe('./dist');
    });

    it('srcがrootDirであること', () => {
      expect(tsconfig.compilerOptions.rootDir).toBe('./src');
    });
  });

  describe('vitest.config.ts', () => {
    const vitestConfig = readFileSync(
      resolve(projectRoot, 'vitest.config.ts'),
      'utf-8',
    );

    it('vitest設定ファイルが存在すること', () => {
      expect(vitestConfig).toContain('defineConfig');
    });

    it('テストファイルパターンが設定されていること', () => {
      expect(vitestConfig).toContain('src/**/*.test.ts');
    });

    it('Node環境が指定されていること', () => {
      expect(vitestConfig).toContain("environment: 'node'");
    });
  });

  describe('.env.example (deleted - consolidated to backend/.env.sample)', () => {
    const repoRoot = resolve(projectRoot, '../../..');

    it('パッケージ個別の.env.exampleが削除されていること', () => {
      expect(existsSync(resolve(projectRoot, '.env.example'))).toBe(false);
    });

    it('中央集約の.env.sampleが存在すること', () => {
      expect(existsSync(resolve(repoRoot, 'backend/.env.sample'))).toBe(true);
    });
  });
});
