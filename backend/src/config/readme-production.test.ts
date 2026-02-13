/**
 * Cleanup: ルートREADME.mdの本番プロジェクト向け整備の検証テスト
 *
 * README.mdがプロジェクト概要、アーキテクチャ、前提条件、
 * セットアップ手順、開発コマンド、ディレクトリ構成を含むことを確認する。
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../../../');
const readmePath = resolve(projectRoot, 'README.md');

describe('ルートREADME.mdの本番プロジェクト向け整備 (Req 5.1-5.6)', () => {
  let content: string;

  beforeAll(() => {
    expect(existsSync(readmePath)).toBe(true);
    content = readFileSync(readmePath, 'utf-8');
  });

  describe('プロジェクト名と概要説明 (Req 5.1)', () => {
    it('プロジェクト名 HomeOffice.ai を含むこと', () => {
      expect(content).toMatch(/HomeOffice\.ai/);
    });

    it('AI駆動のホームオフィス環境最適化に関する説明を含むこと', () => {
      // AI、ホームオフィス、最適化に関するキーワードが含まれていること
      expect(content).toMatch(/AI/);
      expect(content).toMatch(/ホームオフィス|ホームオフィス環境/);
    });
  });

  describe('システムアーキテクチャの概要 (Req 5.2)', () => {
    it('アーキテクチャセクションが存在すること', () => {
      expect(content).toMatch(/##\s*アーキテクチャ/);
    });

    it('フロントエンドの記載があること', () => {
      expect(content).toMatch(/フロントエンド|Vite/i);
    });

    it('バックエンドAPIの記載があること', () => {
      expect(content).toMatch(/バックエンド|Express/i);
    });

    it('AI分析の記載があること', () => {
      expect(content).toMatch(/Vertex AI|Gemini/i);
    });

    it('IoT制御の記載があること', () => {
      expect(content).toMatch(/IoT|Nature Remo|Alexa/i);
    });
  });

  describe('前提条件 (Req 5.3)', () => {
    it('前提条件セクションが存在すること', () => {
      expect(content).toMatch(/##\s*前提条件/);
    });

    it('Node.js 20+ の記載があること', () => {
      expect(content).toMatch(/Node\.js\s*20/);
    });

    it('Google Cloud CLI の記載があること', () => {
      expect(content).toMatch(/Google Cloud CLI|gcloud/);
    });

    it('Nature Remo APIトークンの記載があること', () => {
      expect(content).toMatch(/Nature Remo.*(?:API|トークン|token)/i);
    });

    it('Alexa Cookie の記載があること', () => {
      expect(content).toMatch(/Alexa.*(?:Cookie|cookie)/i);
    });
  });

  describe('セットアップ手順 (Req 5.4)', () => {
    it('セットアップセクションが存在すること', () => {
      expect(content).toMatch(/##\s*セットアップ/);
    });

    it('npm install コマンドの記載があること', () => {
      expect(content).toMatch(/npm install/);
    });

    it('.env.sample のコピー手順の記載があること', () => {
      expect(content).toMatch(/\.env\.sample/);
    });
  });

  describe('開発用コマンド (Req 5.5)', () => {
    it('開発セクションが存在すること', () => {
      expect(content).toMatch(/##\s*開発/);
    });

    it('フロントエンド開発サーバー起動コマンドの記載があること', () => {
      expect(content).toMatch(/npm run dev/);
    });

    it('バックエンド開発サーバー起動コマンドの記載があること', () => {
      expect(content).toMatch(/npm run dev/);
    });

    it('テスト実行コマンドの記載があること', () => {
      expect(content).toMatch(/npm test/);
    });

    it('型チェックコマンドの記載があること', () => {
      expect(content).toMatch(/npm run typecheck|tsc --noEmit/);
    });
  });

  describe('ディレクトリ構成 (Req 5.6)', () => {
    it('ディレクトリ構成セクションが存在すること', () => {
      expect(content).toMatch(/##\s*ディレクトリ構成/);
    });

    it('frontend/ の役割説明があること', () => {
      expect(content).toMatch(/frontend\//);
    });

    it('backend/ の中に src/ があること', () => {
      expect(content).toMatch(/backend\//);
      expect(content).toMatch(/src\//);
    });

    it('backend/packages/ の役割説明があること', () => {
      expect(content).toMatch(/backend\/packages\//);
    });
  });

  describe('言語方針', () => {
    it('本文が日本語で記述されていること', () => {
      // 日本語のひらがな・カタカナが含まれていること
      expect(content).toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
    });

    it('コードブロック内にコマンドが含まれていること', () => {
      expect(content).toMatch(/```(?:bash|sh)?[\s\S]*?```/);
    });
  });
});
