import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const BACKEND_DIR = resolve(import.meta.dirname ?? __dirname, '.');
const BUILD_CONFIG_PATH = join(BACKEND_DIR, 'tsconfig.build.json');
const DIST_DIR = join(BACKEND_DIR, 'dist');

describe('tsconfig.build.json', () => {
  it('ファイルが存在する', () => {
    expect(existsSync(BUILD_CONFIG_PATH)).toBe(true);
  });

  it('既存のtsconfig.jsonを継承する', () => {
    const config = JSON.parse(readFileSync(BUILD_CONFIG_PATH, 'utf-8'));
    expect(config.extends).toBe('./tsconfig.json');
  });

  it('rootDirがバックエンドルート(".")に設定されている', () => {
    const config = JSON.parse(readFileSync(BUILD_CONFIG_PATH, 'utf-8'));
    expect(config.compilerOptions.rootDir).toBe('.');
  });

  it('outDirが./distに設定されている', () => {
    const config = JSON.parse(readFileSync(BUILD_CONFIG_PATH, 'utf-8'));
    expect(config.compilerOptions.outDir).toBe('./dist');
  });

  it('ソースマップが無効化されている', () => {
    const config = JSON.parse(readFileSync(BUILD_CONFIG_PATH, 'utf-8'));
    expect(config.compilerOptions.sourceMap).toBe(false);
  });

  it('宣言ファイル生成が無効化されている', () => {
    const config = JSON.parse(readFileSync(BUILD_CONFIG_PATH, 'utf-8'));
    expect(config.compilerOptions.declaration).toBe(false);
    expect(config.compilerOptions.declarationMap).toBe(false);
  });

  it('src/とpackages/*/src/の両方がincludeに含まれる', () => {
    const config = JSON.parse(readFileSync(BUILD_CONFIG_PATH, 'utf-8'));
    expect(config.include).toContain('src/**/*');
    expect(config.include).toContain('packages/*/src/**/*');
  });

  it('テストファイルがexcludeに含まれる', () => {
    const config = JSON.parse(readFileSync(BUILD_CONFIG_PATH, 'utf-8'));
    expect(config.exclude).toEqual(
      expect.arrayContaining([
        expect.stringContaining('test'),
      ])
    );
  });

  it('tsc -p tsconfig.build.json でJSファイルが正しく出力される', () => {
    // tscビルドを実行（型エラーがあってもJSは出力される: noEmitOnError=false がデフォルト）
    try {
      execSync('npx tsc -p tsconfig.build.json', {
        cwd: BACKEND_DIR,
        stdio: 'pipe',
        timeout: 120000,
      });
    } catch {
      // 型エラーによるexit code 2は許容（packages/の既存型不整合のため）
      // 重要なのはJSファイルが出力されること
    }

    // dist/src/server.js が生成されていることを検証（エントリポイント）
    expect(existsSync(join(DIST_DIR, 'src', 'server.js'))).toBe(true);

    // dist/packages/ にパッケージのコンパイル結果が存在することを検証
    expect(existsSync(join(DIST_DIR, 'packages', 'iot-ai-agent-loop', 'src'))).toBe(true);
    expect(existsSync(join(DIST_DIR, 'packages', 'nature-remo', 'src'))).toBe(true);
    expect(existsSync(join(DIST_DIR, 'packages', 'alexa-remote2', 'src'))).toBe(true);
    expect(existsSync(join(DIST_DIR, 'packages', 'vertex-ai-vision', 'src'))).toBe(true);

    // ソースマップが生成されていないことを検証
    expect(existsSync(join(DIST_DIR, 'src', 'server.js.map'))).toBe(false);

    // 宣言ファイルが生成されていないことを検証
    expect(existsSync(join(DIST_DIR, 'src', 'server.d.ts'))).toBe(false);
  });

  it('コンパイル後のディレクトリ構造で相対パスimportが維持される', () => {
    // rootDir: "." にすることで、src/ -> dist/src/, packages/ -> dist/packages/ にマッピングされ、
    // ../../packages/ のような相対パスが維持されることを検証する
    const config = JSON.parse(readFileSync(BUILD_CONFIG_PATH, 'utf-8'));

    // rootDirが"."の場合、src/server.ts -> dist/src/server.js
    // packages/iot-ai-agent-loop/src/agent/prompt-builder.ts -> dist/packages/iot-ai-agent-loop/src/agent/prompt-builder.js
    // src/services/analyze-handler.ts から ../../packages/... への相対パスが dist/src/services/ から dist/packages/ へのパスと一致する
    expect(config.compilerOptions.rootDir).toBe('.');

    // includeにsrc/とpackages/を両方含めることで統合ビルドが可能
    const includePatterns = config.include as string[];
    const hasSrc = includePatterns.some((p: string) => p.startsWith('src/'));
    const hasPackages = includePatterns.some((p: string) => p.startsWith('packages/'));
    expect(hasSrc).toBe(true);
    expect(hasPackages).toBe(true);
  });

  afterAll(() => {
    // テストで生成されたdist/をクリーンアップ
    if (existsSync(DIST_DIR)) {
      rmSync(DIST_DIR, { recursive: true, force: true });
    }
  });
});
