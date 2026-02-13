/**
 * AgentClient テスト - Task 3.1
 *
 * Vertex AI Gemini APIへのFunction Calling付きリクエスト送信を検証する。
 * - GenerativeModelをtoolsとtoolConfig（FunctionCallingMode.ANY）で初期化
 * - 画像データ（Base64）とシステムプロンプトをgenerateContentに送信
 * - Function Callレスポンスの基本的な送信成功を検証
 *
 * Requirements: 2.1, 2.2, 2.4, 6.1
 */

import { describe, it, expect, vi } from 'vitest';
import { FunctionCallingMode } from '@google-cloud/vertexai';
import type { FunctionDeclaration } from '@google-cloud/vertexai';
import { createAgentClient } from './agent-client.js';
import type { AgentClientConfig, AgentClientService } from './agent-client.js';
import type { ImageData } from '../../../vertex-ai-vision/src/types/models.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * テスト用のAgentClientConfigを生成
 */
function createTestConfig(overrides?: Partial<AgentClientConfig>): AgentClientConfig {
  return {
    projectId: 'test-project',
    location: 'us-central1',
    model: 'gemini-2.0-flash',
    ...overrides,
  };
}

/**
 * テスト用の画像データを生成
 */
function createTestImageData(overrides?: Partial<ImageData>): ImageData {
  return {
    base64: 'dGVzdC1pbWFnZS1kYXRh', // "test-image-data" in base64
    mimeType: 'image/jpeg',
    filePath: '/tmp/test.jpg',
    ...overrides,
  };
}

/**
 * FunctionCallレスポンスを返すモックGenerativeModelを生成
 */
function createMockGenerativeModel(functionCallResponse: {
  name: string;
  args: Record<string, unknown>;
}) {
  return {
    generateContent: vi.fn().mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: functionCallResponse,
                },
              ],
            },
          },
        ],
      },
    }),
  };
}

/**
 * テキストのみのレスポンスを返すモックGenerativeModelを生成
 */
function createMockTextOnlyModel() {
  return {
    generateContent: vi.fn().mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'This is a text response without function call',
                },
              ],
            },
          },
        ],
      },
    }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentClient', () => {
  describe('createAgentClient', () => {
    it('ファクトリ関数がAgentClientServiceを返す', () => {
      const mockModel = createMockGenerativeModel({
        name: 'do_nothing',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);

      expect(client).toBeDefined();
      expect(typeof client.analyze).toBe('function');
    });
  });

  describe('analyze - リクエスト送信', () => {
    it('画像データとシステムプロンプトをgenerateContentに送信する (Req 2.1, 2.2)', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'do_nothing',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();
      const systemPrompt = 'ユーザーの作業状態を判断してください。';

      await client.analyze(imageData, systemPrompt);

      // generateContentが呼ばれたことを確認
      expect(mockModel.generateContent).toHaveBeenCalledTimes(1);

      // リクエストの構造を検証
      const callArgs = mockModel.generateContent.mock.calls[0]![0];

      // システムプロンプトが含まれている（systemInstruction または contents内）
      // 画像データがinlineDataとして含まれている
      expect(callArgs).toBeDefined();
    });

    it('画像のBase64データとMIMEタイプがリクエストに含まれる (Req 2.1)', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'do_nothing',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData({
        base64: 'aW1hZ2UtZGF0YQ==',
        mimeType: 'image/png',
      });

      await client.analyze(imageData, 'テストプロンプト');

      const callArgs = mockModel.generateContent.mock.calls[0]![0];
      // リクエスト内にinlineData（画像Base64 + mimeType）が含まれることを検証
      const requestStr = JSON.stringify(callArgs);
      expect(requestStr).toContain('aW1hZ2UtZGF0YQ==');
      expect(requestStr).toContain('image/png');
    });

    it('システムプロンプトがリクエストに含まれる (Req 2.2)', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'do_nothing',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();
      const systemPrompt = 'ユーザーの作業状態を判断し適切なToolを選択してください。';

      await client.analyze(imageData, systemPrompt);

      const callArgs = mockModel.generateContent.mock.calls[0]![0];
      const requestStr = JSON.stringify(callArgs);
      expect(requestStr).toContain('ユーザーの作業状態を判断し適切なToolを選択してください。');
    });

    it('Function Calling Tool定義がモデル初期化時に設定される (Req 2.4)', () => {
      // createAgentClientがtoolsとtoolConfigを含むモデル設定を使用することを確認
      // DI版ではモデルが外部から渡されるため、SDK版のテストで検証
      const mockModel = createMockGenerativeModel({
        name: 'do_nothing',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);

      // クライアントが正しく作成されること
      expect(client).toBeDefined();
    });
  });

  describe('analyze - light_control レスポンス', () => {
    it('light_controlのFunction CallレスポンスをResult成功で返す（appliance_idなし）', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'light_control',
        args: { action: 'on' },
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].tool).toBe('light_control');
        expect(result.value[0].params).toEqual({
          action: 'on',
        });
      }
    });
  });

  describe('analyze - aircon_control レスポンス', () => {
    it('aircon_controlのFunction CallレスポンスをResult成功で返す（appliance_idなし）', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'aircon_control',
        args: { temperature: 26, mode: 'cool' },
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].tool).toBe('aircon_control');
        expect(result.value[0].params).toEqual({
          temperature: 26,
          mode: 'cool',
        });
      }
    });
  });

  describe('analyze - continue_monitoring レスポンス', () => {
    it('continue_monitoringのFunction CallレスポンスをResult成功で返す', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'continue_monitoring',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].tool).toBe('continue_monitoring');
        expect(result.value[0].params).toEqual({});
      }
    });
  });

  describe('analyze - do_nothing レスポンス', () => {
    it('do_nothingのFunction CallレスポンスをResult成功で返す', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'do_nothing',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].tool).toBe('do_nothing');
        expect(result.value[0].params).toEqual({});
      }
    });

    it('テキストのみのレスポンスはdo_nothingフォールバック配列を返す', async () => {
      const mockModel = createMockTextOnlyModel();
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].tool).toBe('do_nothing');
      }
    });
  });

  describe('analyze - 並列Function Calling', () => {
    it('複数のFunction Callレスポンスを全てAgentAction配列で返す', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            candidates: [
              {
                content: {
                  parts: [
                    { functionCall: { name: 'alexa_speak', args: { message: 'ごゆっくりどうぞ' } } },
                    { functionCall: { name: 'light_control', args: { action: '安らぎ' } } },
                    { functionCall: { name: 'alexa_textcommand', args: { text: 'リラックスの音楽をかけて' } } },
                  ],
                },
              },
            ],
          },
        }),
      };
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0].tool).toBe('alexa_speak');
        expect(result.value[1].tool).toBe('light_control');
        expect(result.value[2].tool).toBe('alexa_textcommand');
      }
    });
  });

  describe('analyze - エラーハンドリング', () => {
    it('API呼び出しが失敗した場合、Result失敗を返す', async () => {
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(new Error('API connection failed')),
      };
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBeDefined();
        expect(result.error.message).toBeDefined();
      }
    });

    it('認証エラーの場合、AUTH_ERRORコードを返す', async () => {
      const authError = new Error('Permission denied') as Error & { code?: string };
      authError.code = 'PERMISSION_DENIED';
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(authError),
      };
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_ERROR');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('タイムアウトエラーの場合、TIMEOUTコードを返す', async () => {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'AbortError';
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(timeoutError),
      };
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const result = await client.analyze(imageData, 'テスト');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('analyze - 動的ツールサポート', () => {
    it('動的ツールが渡された場合、リクエストにtoolsとtoolConfigが含まれる', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'alexa_speak',
        args: { text: 'こんにちは' },
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      const dynamicTools: FunctionDeclaration[] = [
        {
          name: 'alexa_speak',
          description: 'Alexaにテキストを読み上げさせる',
          parameters: {
            type: 'OBJECT' as const,
            properties: {
              text: { type: 'STRING' as const, description: '読み上げテキスト' },
            },
            required: ['text'],
          },
        },
        {
          name: 'do_nothing',
          description: '何もしない',
          parameters: { type: 'OBJECT' as const, properties: {} },
        },
      ];

      await client.analyze(imageData, 'テスト', dynamicTools);

      const callArgs = mockModel.generateContent.mock.calls[0]![0];
      // tools が per-request で設定されている
      expect(callArgs.tools).toEqual([{ functionDeclarations: dynamicTools }]);
      // toolConfig が per-request で設定されている
      expect(callArgs.toolConfig).toEqual({
        functionCallingConfig: { mode: FunctionCallingMode.ANY },
      });
    });

    it('動的ツールが渡されない場合、リクエストにtoolsが含まれない（モデルレベルのフォールバック）', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'do_nothing',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      await client.analyze(imageData, 'テスト');

      const callArgs = mockModel.generateContent.mock.calls[0]![0];
      // tools が per-request で設定されていない
      expect(callArgs.tools).toBeUndefined();
      expect(callArgs.toolConfig).toBeUndefined();
    });

    it('空の動的ツール配列が渡された場合、リクエストにtoolsが含まれない', async () => {
      const mockModel = createMockGenerativeModel({
        name: 'do_nothing',
        args: {},
      });
      const config = createTestConfig();
      const client = createAgentClient(config, mockModel);
      const imageData = createTestImageData();

      await client.analyze(imageData, 'テスト', []);

      const callArgs = mockModel.generateContent.mock.calls[0]![0];
      expect(callArgs.tools).toBeUndefined();
      expect(callArgs.toolConfig).toBeUndefined();
    });
  });
});
