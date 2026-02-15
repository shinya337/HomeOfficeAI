/**
 * ConfigLoader Unit Tests
 *
 * 統合設定ローダーのテスト。
 * 環境変数の読み込み、バリデーション、デフォルト値、エラーハンドリングを検証する。
 *
 * Requirements: 5.5, 6.1, 6.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadAgentConfig } from './config-loader.js';

describe('ConfigLoader - loadAgentConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.VERTEX_AI_LOCATION;
    delete process.env.GEMINI_MODEL;
    delete process.env.NATURE_REMO_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('正常系: 全環境変数が設定されている場合', () => {
    it('必須・オプション全て設定時に正しいAgentConfigを返す', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
      process.env.VERTEX_AI_LOCATION = 'asia-northeast1';
      process.env.GEMINI_MODEL = 'gemini-1.5-pro';
      process.env.NATURE_REMO_TOKEN = 'test-token-123';

      const result = loadAgentConfig();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('my-project');
        expect(result.value.location).toBe('asia-northeast1');
        expect(result.value.model).toBe('gemini-1.5-pro');
        expect(result.value.natureRemoToken).toBe('test-token-123');
      }
    });

    it('必須のみ設定時にデフォルト値が適用される', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      const result = loadAgentConfig();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('my-project');
        expect(result.value.location).toBe('us-central1');
        expect(result.value.model).toBe('gemini-2.5-flash');
        expect(result.value.natureRemoToken).toBe('test-token');
      }
    });
  });

  describe('デフォルト値', () => {
    beforeEach(() => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
      process.env.NATURE_REMO_TOKEN = 'test-token';
    });

    it('VERTEX_AI_LOCATIONのデフォルト値はus-central1', () => {
      const result = loadAgentConfig();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.location).toBe('us-central1');
      }
    });

    it('GEMINI_MODELのデフォルト値はgemini-2.5-flash', () => {
      const result = loadAgentConfig();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.model).toBe('gemini-2.5-flash');
      }
    });

    it('VERTEX_AI_LOCATIONをカスタム値で上書きできる', () => {
      process.env.VERTEX_AI_LOCATION = 'europe-west1';
      const result = loadAgentConfig();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.location).toBe('europe-west1');
      }
    });

    it('GEMINI_MODELをカスタム値で上書きできる', () => {
      process.env.GEMINI_MODEL = 'gemini-pro';
      const result = loadAgentConfig();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.model).toBe('gemini-pro');
      }
    });
  });

  describe('エラー系: GOOGLE_CLOUD_PROJECTが未設定', () => {
    it('GOOGLE_CLOUD_PROJECTが未設定の場合MISSING_PROJECT_IDエラーを返す', () => {
      process.env.NATURE_REMO_TOKEN = 'test-token';

      const result = loadAgentConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_PROJECT_ID');
        expect(result.error.message).toContain('GOOGLE_CLOUD_PROJECT');
      }
    });

    it('GOOGLE_CLOUD_PROJECTが空文字の場合MISSING_PROJECT_IDエラーを返す', () => {
      process.env.GOOGLE_CLOUD_PROJECT = '';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      const result = loadAgentConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_PROJECT_ID');
      }
    });

    it('MISSING_PROJECT_IDエラーに設定手順のsuggestionが含まれる', () => {
      process.env.NATURE_REMO_TOKEN = 'test-token';

      const result = loadAgentConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.suggestion).toBeDefined();
        expect(result.error.suggestion.length).toBeGreaterThan(0);
        expect(
          result.error.suggestion.includes('.env') ||
          result.error.suggestion.includes('GOOGLE_CLOUD_PROJECT'),
        ).toBe(true);
      }
    });
  });

  describe('エラー系: NATURE_REMO_TOKENが未設定', () => {
    it('NATURE_REMO_TOKENが未設定の場合MISSING_TOKENエラーを返す', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';

      const result = loadAgentConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_TOKEN');
        expect(result.error.message).toContain('NATURE_REMO_TOKEN');
      }
    });

    it('NATURE_REMO_TOKENが空文字の場合MISSING_TOKENエラーを返す', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
      process.env.NATURE_REMO_TOKEN = '';

      const result = loadAgentConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_TOKEN');
      }
    });

    it('MISSING_TOKENエラーに設定手順のsuggestionが含まれる', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';

      const result = loadAgentConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.suggestion).toBeDefined();
        expect(result.error.suggestion.length).toBeGreaterThan(0);
        expect(
          result.error.suggestion.includes('.env') ||
          result.error.suggestion.includes('NATURE_REMO_TOKEN'),
        ).toBe(true);
      }
    });
  });

  describe('エラー系: 両方未設定の場合', () => {
    it('両方未設定の場合は最初のエラー（MISSING_PROJECT_ID）を返す', () => {
      const result = loadAgentConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_PROJECT_ID');
      }
    });
  });
});
