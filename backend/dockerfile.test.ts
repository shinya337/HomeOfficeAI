import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname ?? __dirname, '..');
const DOCKERFILE_PATH = join(PROJECT_ROOT, 'Dockerfile');
const DOCKERIGNORE_PATH = join(PROJECT_ROOT, '.dockerignore');

describe('Dockerfile', () => {
  it('プロジェクトルートにDockerfileが存在する', () => {
    expect(existsSync(DOCKERFILE_PATH)).toBe(true);
  });

  it('Node.js 20 Alpineベースイメージを使用する', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    expect(content).toMatch(/FROM\s+node:20[^\s]*alpine/);
  });

  it('3ステージのマルチステージビルドを使用する', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    const stages = content.match(/FROM\s+/g);
    expect(stages).not.toBeNull();
    expect(stages!.length).toBeGreaterThanOrEqual(3);
  });

  it('Stage 1でフロントエンドビルドを実行する（frontend-build）', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    expect(content).toMatch(/AS\s+frontend-build/);
    // npm ci と vite build (npm run build) が含まれる
    expect(content).toMatch(/npm ci/);
    expect(content).toMatch(/npm run build/);
  });

  it('Stage 2でバックエンドコンパイルを実行する（backend-build）', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    expect(content).toMatch(/AS\s+backend-build/);
    // TypeScriptビルド（tsc -p tsconfig.build.json）が含まれる
    expect(content).toMatch(/tsconfig\.build\.json/);
  });

  it('Stage 2でpackagesの依存をインストールする', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    // packages/*/の依存インストールループが含まれる
    expect(content).toMatch(/packages/);
  });

  it('Stage 3で本番依存のみインストールする（production）', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    expect(content).toMatch(/AS\s+production/);
    expect(content).toMatch(/--omit=dev/);
  });

  it('エントリポイントがnode dist/src/server.jsである', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    expect(content).toMatch(/dist\/src\/server\.js/);
  });

  it('NODE_ENV=productionを設定する', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    expect(content).toMatch(/NODE_ENV[=\s]+production/);
  });

  it('PORTのEXPOSEまたはENV設定が含まれる', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    // PORT環境変数またはEXPOSEが含まれる
    expect(content).toMatch(/PORT/);
  });

  it('フロントエンドビルド成果物をfrontend-distにコピーする', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    expect(content).toMatch(/frontend-dist/);
  });

  it('frontend-distがserver.jsのパス解決と整合する（dist/frontend-dist/）', () => {
    const content = readFileSync(DOCKERFILE_PATH, 'utf-8');
    // server.ts: path.resolve(dirname(dist/src/server.js), '..', 'frontend-dist')
    // = /app/dist/frontend-dist/
    // Dockerfile: COPY --from=frontend-build ... ./dist/frontend-dist/
    expect(content).toMatch(/\.\/dist\/frontend-dist/);
  });
});

describe('.dockerignore', () => {
  it('プロジェクトルートに.dockerignoreが存在する', () => {
    expect(existsSync(DOCKERIGNORE_PATH)).toBe(true);
  });

  it('node_modulesを除外する', () => {
    const content = readFileSync(DOCKERIGNORE_PATH, 'utf-8');
    expect(content).toMatch(/node_modules/);
  });

  it('.envを除外する', () => {
    const content = readFileSync(DOCKERIGNORE_PATH, 'utf-8');
    expect(content).toMatch(/\.env/);
  });

  it('.gitを除外する', () => {
    const content = readFileSync(DOCKERIGNORE_PATH, 'utf-8');
    expect(content).toMatch(/\.git/);
  });

  it('.kiroを除外する', () => {
    const content = readFileSync(DOCKERIGNORE_PATH, 'utf-8');
    expect(content).toMatch(/\.kiro/);
  });

  it('distディレクトリを除外する', () => {
    const content = readFileSync(DOCKERIGNORE_PATH, 'utf-8');
    expect(content).toMatch(/dist/);
  });
});
