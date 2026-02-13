import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp, resetSessionManager, resetAnalyzeHandler, setAnalyzeHandler, getAlexaService, resetAlexaService, initAlexaService, resolveAllowedOrigins } from './server.js';
import type { AnalyzeHandlerService, AnalyzeResult, AnalyzeError, Result } from './services/analyze-handler.js';
import { Intervals } from './types/api-types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Express Server', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  // Reset session manager, analyze handler, and alexa service between tests to ensure clean state
  beforeEach(() => {
    resetSessionManager();
    resetAnalyzeHandler();
    resetAlexaService();
    // Use non-existent cookie path to ensure AlexaService is in disconnected state for tests
    process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/non-existent-alexa-cookie-test.json';
    app = createApp();
  });

  afterEach(() => {
    resetAnalyzeHandler();
    resetAlexaService();
  });

  describe('resolveAllowedOrigins (Task 1.1)', () => {
    let origAllowedOrigins: string | undefined;

    beforeEach(() => {
      origAllowedOrigins = process.env['ALLOWED_ORIGINS'];
      delete process.env['ALLOWED_ORIGINS'];
    });

    afterEach(() => {
      if (origAllowedOrigins !== undefined) {
        process.env['ALLOWED_ORIGINS'] = origAllowedOrigins;
      } else {
        delete process.env['ALLOWED_ORIGINS'];
      }
    });

    it('should return default localhost origins when ALLOWED_ORIGINS is not set', () => {
      const origins = resolveAllowedOrigins();
      expect(origins).toEqual(['http://localhost:5173', 'http://localhost:5174']);
    });

    it('should return default localhost origins when ALLOWED_ORIGINS is empty string', () => {
      process.env['ALLOWED_ORIGINS'] = '';
      const origins = resolveAllowedOrigins();
      expect(origins).toEqual(['http://localhost:5173', 'http://localhost:5174']);
    });

    it('should parse single origin from ALLOWED_ORIGINS', () => {
      process.env['ALLOWED_ORIGINS'] = 'https://homeoffice-ai-abc123.run.app';
      const origins = resolveAllowedOrigins();
      expect(origins).toEqual(['https://homeoffice-ai-abc123.run.app']);
    });

    it('should parse multiple comma-separated origins from ALLOWED_ORIGINS', () => {
      process.env['ALLOWED_ORIGINS'] = 'https://homeoffice-ai-abc123.run.app,http://localhost:5173,http://localhost:5174';
      const origins = resolveAllowedOrigins();
      expect(origins).toEqual([
        'https://homeoffice-ai-abc123.run.app',
        'http://localhost:5173',
        'http://localhost:5174',
      ]);
    });

    it('should trim whitespace from origins', () => {
      process.env['ALLOWED_ORIGINS'] = ' https://example.com , http://localhost:5173 ';
      const origins = resolveAllowedOrigins();
      expect(origins).toEqual(['https://example.com', 'http://localhost:5173']);
    });

    it('should filter out empty entries from comma-separated list', () => {
      process.env['ALLOWED_ORIGINS'] = 'https://example.com,,http://localhost:5173,';
      const origins = resolveAllowedOrigins();
      expect(origins).toEqual(['https://example.com', 'http://localhost:5173']);
    });
  });

  describe('Server Configuration', () => {
    it('should respond to requests', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });

    it('should parse JSON body up to 10MB', async () => {
      // Create a ~1KB JSON payload to verify JSON parsing works
      const payload = { data: 'x'.repeat(1000) };
      const response = await request(app)
        .post('/api/test-json')
        .send(payload)
        .set('Content-Type', 'application/json');

      // Should either succeed (200) or return 404 for undefined route
      // but NOT fail due to body parsing
      expect([200, 404]).toContain(response.status);
    });

    it('should allow CORS from localhost:5173', async () => {
      const response = await request(app)
        .options('/api/session/status')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should reject CORS from unauthorized origins', async () => {
      const response = await request(app)
        .options('/api/session/status')
        .set('Origin', 'http://malicious-site.com')
        .set('Access-Control-Request-Method', 'GET');

      // CORS origin should not be the malicious site
      expect(response.headers['access-control-allow-origin']).not.toBe('http://malicious-site.com');
    });

    it('should allow CORS from custom ALLOWED_ORIGINS', async () => {
      const origAllowedOrigins = process.env['ALLOWED_ORIGINS'];
      process.env['ALLOWED_ORIGINS'] = 'https://homeoffice-ai-abc123.run.app';

      resetSessionManager();
      resetAnalyzeHandler();
      resetAlexaService();
      const customApp = createApp();

      const response = await request(customApp)
        .options('/api/session/status')
        .set('Origin', 'https://homeoffice-ai-abc123.run.app')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBe('https://homeoffice-ai-abc123.run.app');

      // Restore
      if (origAllowedOrigins !== undefined) {
        process.env['ALLOWED_ORIGINS'] = origAllowedOrigins;
      } else {
        delete process.env['ALLOWED_ORIGINS'];
      }
    });
  });

  describe('Health Check Endpoint (Task 1.2)', () => {
    it('should return 200 OK with status and timestamp at /api/health', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should not respond at old /health path', async () => {
      const response = await request(app).get('/health');
      expect(response.status).not.toBe(200);
    });
  });

  describe('JSON Body Parsing', () => {
    it('should parse JSON body correctly', async () => {
      const response = await request(app)
        .post('/api/echo')
        .send({ message: 'hello' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('received');
      expect(response.body.received).toHaveProperty('message', 'hello');
    });

    it('should handle large JSON payload (within 10MB limit)', async () => {
      // Create ~5MB payload
      const largeData = 'x'.repeat(5 * 1024 * 1024);
      const response = await request(app)
        .post('/api/echo')
        .send({ data: largeData })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });
  });

  describe('Session API Integration', () => {
    it('should integrate session routes at /api/session', async () => {
      // Test session status endpoint through main server
      const response = await request(app).get('/api/session/status');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hasActiveSession');
    });

    it('should support full session lifecycle through main server', async () => {
      // Start session
      const startResponse = await request(app).post('/api/session/start');
      expect(startResponse.status).toBe(200);
      expect(startResponse.body.status).toBe('active');

      // Check status
      const statusResponse = await request(app).get('/api/session/status');
      expect(statusResponse.body.hasActiveSession).toBe(true);
      expect(statusResponse.body.session.sessionId).toBe(
        startResponse.body.sessionId
      );

      // End session
      const endResponse = await request(app).post('/api/session/end');
      expect(endResponse.status).toBe(200);
      expect(endResponse.body.status).toBe('ended');

      // Verify session ended
      const finalStatus = await request(app).get('/api/session/status');
      expect(finalStatus.body.hasActiveSession).toBe(false);
    });

    it('should return 400 when ending session without active session', async () => {
      const response = await request(app).post('/api/session/end');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('NO_ACTIVE_SESSION');
    });
  });

  describe('Analyze API Integration', () => {
    // Create mock analyze handler for integration tests
    function createMockAnalyzeHandler(): AnalyzeHandlerService {
      const defaultAction = { tool: 'do_nothing', params: {} };
      const defaultActionResult = { executed: true, message: 'No action needed' };
      return {
        analyze: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            action: defaultAction,
            actionResult: defaultActionResult,
            actions: [defaultAction],
            actionResults: [defaultActionResult],
            nextIntervalMs: Intervals.DEFAULT,
            deviceState: {
              light: { power: 'on' },
              aircon: { temperature: '26', mode: 'cool' },
            },
          },
        } as Result<AnalyzeResult, AnalyzeError>),
      };
    }

    it('should return 503 when analyze handler is not configured', async () => {
      // Save and clear environment variables
      const origProjectId = process.env.GOOGLE_CLOUD_PROJECT;
      const origToken = process.env.NATURE_REMO_TOKEN;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.NATURE_REMO_TOKEN;

      try {
        // Reset and recreate app without environment
        resetAnalyzeHandler();
        const appWithoutConfig = createApp();

        // Without environment variables, analyze handler should be null
        // and return 503 Service Unavailable
        const response = await request(appWithoutConfig)
          .post('/api/analyze')
          .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } });

        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
      } finally {
        // Restore environment variables
        if (origProjectId !== undefined) {
          process.env.GOOGLE_CLOUD_PROJECT = origProjectId;
        }
        if (origToken !== undefined) {
          process.env.NATURE_REMO_TOKEN = origToken;
        }
        resetAnalyzeHandler();
      }
    });

    it('should accept analyze requests when handler is configured', async () => {
      // Set up mock handler and recreate app
      const mockHandler = createMockAnalyzeHandler();
      setAnalyzeHandler(mockHandler);
      const appWithHandler = createApp();

      // Start a session first
      await request(appWithHandler).post('/api/session/start');

      // Send analyze request
      const response = await request(appWithHandler)
        .post('/api/analyze')
        .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('action');
      expect(response.body).toHaveProperty('result');
      expect(response.body).toHaveProperty('nextIntervalMs');
    });

    it('should return 400 for invalid analyze request', async () => {
      const mockHandler = createMockAnalyzeHandler();
      setAnalyzeHandler(mockHandler);
      const appWithHandler = createApp();

      await request(appWithHandler).post('/api/session/start');

      const response = await request(appWithHandler)
        .post('/api/analyze')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return 400 when no session is active', async () => {
      const mockHandler = createMockAnalyzeHandler();
      setAnalyzeHandler(mockHandler);
      const appWithHandler = createApp();

      // No session started
      const response = await request(appWithHandler)
        .post('/api/analyze')
        .send({ image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('NO_ACTIVE_SESSION');
    });
  });

  describe('AlexaService Integration (Task 5.1)', () => {
    it('should export getAlexaService function', () => {
      expect(typeof getAlexaService).toBe('function');
    });

    it('should export resetAlexaService function', () => {
      expect(typeof resetAlexaService).toBe('function');
    });

    it('should export initAlexaService async function', () => {
      expect(typeof initAlexaService).toBe('function');
    });

    it('initAlexaService should return an AlexaService instance (always created, even if not connected)', async () => {
      // AlexaService is always created regardless of connection state (Req 1.3)
      // It returns AlexaService that reports AUTH_ERROR when not connected
      const alexaService = await initAlexaService();
      expect(alexaService).not.toBeNull();
      expect(typeof alexaService!.isConnected).toBe('function');
      expect(typeof alexaService!.speak).toBe('function');
      expect(typeof alexaService!.announce).toBe('function');
      expect(typeof alexaService!.setVolume).toBe('function');
      expect(typeof alexaService!.playWeather).toBe('function');
      expect(typeof alexaService!.playFlashBriefing).toBe('function');
      expect(typeof alexaService!.executeRoutine).toBe('function');
    });

    it('getAlexaService should return the same instance after initAlexaService', async () => {
      const service1 = await initAlexaService();
      const service2 = getAlexaService();
      expect(service1).toBe(service2);
    });

    it('getAlexaService should return singleton instance', async () => {
      await initAlexaService();
      const service1 = getAlexaService();
      const service2 = getAlexaService();
      expect(service1).toBe(service2);
    });

    it('resetAlexaService should clear the singleton', async () => {
      const service1 = await initAlexaService();
      resetAlexaService();
      const service2 = await initAlexaService();
      // After reset, a new instance is created
      expect(service1).not.toBe(service2);
    });

    it('AlexaService should report not connected when no cookie is available', async () => {
      const alexaService = await initAlexaService();
      // Without actual Alexa cookies, the service should be disconnected
      expect(alexaService!.isConnected()).toBe(false);
    });

    it('AlexaService should return AUTH_ERROR for operations when not connected', async () => {
      const alexaService = await initAlexaService();
      const result = await alexaService!.speak('test-device', 'hello');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });
  });

  describe('Static File Serving and SPA Fallback (Task 1.3)', () => {
    let tmpDir: string;
    let staticApp: Express;

    beforeEach(() => {
      // Create a temporary directory with mock frontend build output
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeoffice-static-'));
      fs.writeFileSync(
        path.join(tmpDir, 'index.html'),
        '<!DOCTYPE html><html><body><h1>HomeOffice.ai</h1></body></html>'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'test-asset.js'),
        'console.log("test");'
      );
      // Create a subdirectory with a CSS file
      fs.mkdirSync(path.join(tmpDir, 'assets'));
      fs.writeFileSync(
        path.join(tmpDir, 'assets', 'styles.css'),
        'body { margin: 0; }'
      );

      resetSessionManager();
      resetAnalyzeHandler();
      resetAlexaService();
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/non-existent-alexa-cookie-test.json';
      staticApp = createApp({ frontendDistPath: tmpDir });
    });

    afterEach(() => {
      // Clean up temporary directory
      fs.rmSync(tmpDir, { recursive: true, force: true });
      resetAnalyzeHandler();
      resetAlexaService();
    });

    it('should serve index.html at root path when static directory exists', async () => {
      const response = await request(staticApp).get('/');
      expect(response.status).toBe(200);
      expect(response.text).toContain('HomeOffice.ai');
      expect(response.headers['content-type']).toMatch(/html/);
    });

    it('should serve static JS files', async () => {
      const response = await request(staticApp).get('/test-asset.js');
      expect(response.status).toBe(200);
      expect(response.text).toContain('console.log');
    });

    it('should serve static files in subdirectories', async () => {
      const response = await request(staticApp).get('/assets/styles.css');
      expect(response.status).toBe(200);
      expect(response.text).toContain('body');
    });

    it('should fallback to index.html for unknown paths (SPA support)', async () => {
      const response = await request(staticApp).get('/some/unknown/route');
      expect(response.status).toBe(200);
      expect(response.text).toContain('HomeOffice.ai');
      expect(response.headers['content-type']).toMatch(/html/);
    });

    it('should prioritize API routes over static file serving', async () => {
      const response = await request(staticApp).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      // Should be JSON, not HTML
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should not serve static files when frontendDistPath is not provided', async () => {
      const noStaticApp = createApp();
      const response = await request(noStaticApp).get('/some/unknown/route');
      // Without static serving, unknown routes should return 404
      expect(response.status).toBe(404);
    });

    it('should not interfere with API echo endpoint', async () => {
      const response = await request(staticApp)
        .post('/api/echo')
        .send({ message: 'hello' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.received).toHaveProperty('message', 'hello');
    });
  });
});
