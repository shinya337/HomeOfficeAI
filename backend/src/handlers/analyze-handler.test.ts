/**
 * Analyze Handler Tests
 *
 * TDD tests for analyze API endpoint (POST /api/analyze).
 * Requirements: 3.1, 3.3, 3.4, 4.3, 4.4, 6.5
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { createAnalyzeRoutes, AnalyzeHandlerDependencies } from './analyze-handler.js';
import {
  createSessionManager,
  SessionManagerService,
} from '../services/session-manager.js';
import { resetSessionManager } from '../server.js';
import type {
  AnalyzeHandlerService,
  AnalyzeResult,
  AnalyzeError,
  Result,
} from '../services/analyze-handler.js';
import { ErrorCodes, Intervals } from '../types/api-types.js';

// Mock AnalyzeHandlerService factory
function createMockAnalyzeHandler(
  overrides?: Partial<AnalyzeHandlerService>
): AnalyzeHandlerService {
  const defaultAction = { tool: 'do_nothing', params: {} };
  const defaultActionResult = { executed: true, message: 'No action needed' };
  const defaultHandler: AnalyzeHandlerService = {
    analyze: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        action: defaultAction,
        actionResult: defaultActionResult,
        actions: [defaultAction],
        actionResults: [defaultActionResult],
        nextIntervalMs: Intervals.DEFAULT,
        deviceState: undefined,
      },
    } as Result<AnalyzeResult, AnalyzeError>),
  };

  return { ...defaultHandler, ...overrides };
}

describe('Analyze Handler', () => {
  let app: Express;
  let sessionManager: SessionManagerService;
  let mockAnalyzeHandler: AnalyzeHandlerService;

  beforeEach(() => {
    resetSessionManager();
    app = express();
    app.use(express.json({ limit: '10mb' }));
    sessionManager = createSessionManager();
    mockAnalyzeHandler = createMockAnalyzeHandler();
    const deps: AnalyzeHandlerDependencies = {
      sessionManager,
      analyzeHandler: mockAnalyzeHandler,
    };
    app.use('/api', createAnalyzeRoutes(deps));
  });

  afterEach(() => {
    resetSessionManager();
    vi.clearAllMocks();
  });

  describe('POST /api/analyze', () => {
    describe('Request validation', () => {
      it('should return 400 when request body is missing', async () => {
        // Start a session first
        sessionManager.startSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({})
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error.code).toBe(ErrorCodes.INVALID_REQUEST);
      });

      it('should return 400 when image field is missing', async () => {
        sessionManager.startSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({ other: 'data' })
          .expect(400);

        expect(response.body.error.code).toBe(ErrorCodes.INVALID_REQUEST);
        expect(response.body.error.message).toContain('image');
      });

      it('should return 400 when image.base64 is missing', async () => {
        sessionManager.startSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({ image: { mimeType: 'image/jpeg' } })
          .expect(400);

        expect(response.body.error.code).toBe(ErrorCodes.INVALID_REQUEST);
        expect(response.body.error.message).toContain('base64');
      });

      it('should return 400 when image.mimeType is missing', async () => {
        sessionManager.startSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==' } })
          .expect(400);

        expect(response.body.error.code).toBe(ErrorCodes.INVALID_REQUEST);
        expect(response.body.error.message).toContain('mimeType');
      });

      it('should return 400 when image.base64 is empty', async () => {
        sessionManager.startSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({ image: { base64: '', mimeType: 'image/jpeg' } })
          .expect(400);

        expect(response.body.error.code).toBe(ErrorCodes.INVALID_REQUEST);
      });
    });

    describe('Session validation (Req 6.5)', () => {
      it('should return 400 when no active session exists', async () => {
        // No session started
        const response = await request(app)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(400);

        expect(response.body.error.code).toBe(ErrorCodes.NO_ACTIVE_SESSION);
        expect(response.body.error.message).toBeDefined();
      });

      it('should return 400 when session has ended', async () => {
        sessionManager.startSession();
        sessionManager.endSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(400);

        expect(response.body.error.code).toBe(ErrorCodes.NO_ACTIVE_SESSION);
      });
    });

    describe('Successful analysis (Req 3.1, 3.3)', () => {
      it('should return 200 with analysis result on success', async () => {
        sessionManager.startSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('action');
        expect(response.body).toHaveProperty('result');
        expect(response.body).toHaveProperty('actions');
        expect(response.body).toHaveProperty('results');
        expect(response.body).toHaveProperty('nextIntervalMs');
        expect(response.body.action).toHaveProperty('tool');
        expect(response.body.action).toHaveProperty('params');
        expect(Array.isArray(response.body.actions)).toBe(true);
        expect(Array.isArray(response.body.results)).toBe(true);
      });

      it('should return Content-Type: application/json', async () => {
        sessionManager.startSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(200);

        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should include deviceState in response when available', async () => {
        sessionManager.startSession();

        const handlerWithState = createMockAnalyzeHandler({
          analyze: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              action: { tool: 'do_nothing', params: {} },
              actionResult: { executed: true, message: 'Done' },
              actions: [{ tool: 'do_nothing', params: {} }],
              actionResults: [{ executed: true, message: 'Done' }],
              nextIntervalMs: Intervals.DEFAULT,
              deviceState: {
                light: { power: 'on' },
                aircon: { temperature: '26', mode: 'cool' },
              },
            },
          }),
        });

        const appWithState = express();
        appWithState.use(express.json({ limit: '10mb' }));
        appWithState.use(
          '/api',
          createAnalyzeRoutes({
            sessionManager,
            analyzeHandler: handlerWithState,
          })
        );

        const response = await request(appWithState)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(200);

        expect(response.body).toHaveProperty('deviceState');
        expect(response.body.deviceState.light.power).toBe('on');
        expect(response.body.deviceState.aircon.temperature).toBe('26');
      });
    });

    describe('Interval calculation (Req 4.3, 4.4)', () => {
      it('should return DEFAULT interval for normal interval', async () => {
        sessionManager.startSession();

        const handlerNormal = createMockAnalyzeHandler({
          analyze: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              action: { tool: 'do_nothing', params: {} },
              actionResult: { executed: true, message: 'Done' },
              actions: [{ tool: 'do_nothing', params: {} }],
              actionResults: [{ executed: true, message: 'Done' }],
              nextIntervalMs: Intervals.DEFAULT,
            },
          }),
        });

        const appNormal = express();
        appNormal.use(express.json());
        appNormal.use(
          '/api',
          createAnalyzeRoutes({ sessionManager, analyzeHandler: handlerNormal })
        );

        const response = await request(appNormal)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(200);

        expect(response.body.nextIntervalMs).toBe(Intervals.DEFAULT);
      });

      it('should return 5 seconds (5000ms) for continue_monitoring', async () => {
        sessionManager.startSession();

        const handlerShort = createMockAnalyzeHandler({
          analyze: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              action: { tool: 'continue_monitoring', params: {} },
              actionResult: { executed: true, message: 'Continuing' },
              actions: [{ tool: 'continue_monitoring', params: {} }],
              actionResults: [{ executed: true, message: 'Continuing' }],
              nextIntervalMs: Intervals.CONTINUE_MONITORING,
            },
          }),
        });

        const appShort = express();
        appShort.use(express.json());
        appShort.use(
          '/api',
          createAnalyzeRoutes({ sessionManager, analyzeHandler: handlerShort })
        );

        const response = await request(appShort)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(200);

        expect(response.body.nextIntervalMs).toBe(5000);
      });
    });

    describe('AI API error handling (Req 3.4)', () => {
      it('should return fallback do_nothing on AI error', async () => {
        sessionManager.startSession();

        const handlerAIError = createMockAnalyzeHandler({
          analyze: vi.fn().mockResolvedValue({
            ok: false,
            error: {
              code: 'AI_ERROR',
              message: 'AI API call failed',
              retryable: true,
            },
          } as Result<AnalyzeResult, AnalyzeError>),
        });

        const appAIError = express();
        appAIError.use(express.json());
        appAIError.use(
          '/api',
          createAnalyzeRoutes({ sessionManager, analyzeHandler: handlerAIError })
        );

        const response = await request(appAIError)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(200);

        // Should return success:true with fallback action
        expect(response.body.success).toBe(true);
        expect(response.body.action.tool).toBe('do_nothing');
        expect(response.body.actions).toEqual([{ tool: 'do_nothing', params: {} }]);
        expect(response.body.nextIntervalMs).toBe(Intervals.DEFAULT);
      });

      it('should include error information in response on AI error', async () => {
        sessionManager.startSession();

        const handlerAIError = createMockAnalyzeHandler({
          analyze: vi.fn().mockResolvedValue({
            ok: false,
            error: {
              code: 'AI_ERROR',
              message: 'AI API timeout',
              retryable: true,
            },
          } as Result<AnalyzeResult, AnalyzeError>),
        });

        const appAIError = express();
        appAIError.use(express.json());
        appAIError.use(
          '/api',
          createAnalyzeRoutes({ sessionManager, analyzeHandler: handlerAIError })
        );

        const response = await request(appAIError)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(200);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error.code).toBe('AI_ERROR');
        expect(response.body.error.message).toBe('AI API timeout');
      });
    });

    describe('IoT error handling', () => {
      it('should return fallback do_nothing on IoT error', async () => {
        sessionManager.startSession();

        const handlerIoTError = createMockAnalyzeHandler({
          analyze: vi.fn().mockResolvedValue({
            ok: false,
            error: {
              code: 'IOT_ERROR',
              message: 'Nature Remo API failed',
              retryable: true,
            },
          } as Result<AnalyzeResult, AnalyzeError>),
        });

        const appIoTError = express();
        appIoTError.use(express.json());
        appIoTError.use(
          '/api',
          createAnalyzeRoutes({ sessionManager, analyzeHandler: handlerIoTError })
        );

        const response = await request(appIoTError)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.action.tool).toBe('do_nothing');
      });
    });

    describe('Error response format', () => {
      it('should return JSON for 400 validation errors', async () => {
        sessionManager.startSession();

        const response = await request(app)
          .post('/api/analyze')
          .send({})
          .expect(400);

        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.body).toHaveProperty('error');
      });

      it('should return 500 with JSON error for internal errors', async () => {
        sessionManager.startSession();

        const handlerInternalError = createMockAnalyzeHandler({
          analyze: vi.fn().mockRejectedValue(new Error('Unexpected error')),
        });

        const appError = express();
        appError.use(express.json());
        appError.use(
          '/api',
          createAnalyzeRoutes({ sessionManager, analyzeHandler: handlerInternalError })
        );

        const response = await request(appError)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })
          .expect(500);

        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
      });
    });
  });
});
