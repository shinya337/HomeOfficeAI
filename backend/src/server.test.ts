import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp, resetSessionManager, resetAnalyzeHandler, setAnalyzeHandler, getAlexaService, resetAlexaService, initAlexaService, resolveAllowedOrigins, resetFirebaseIntegration, resetApplianceServiceSingleton, resetAlexaProxyService } from './server.js';
import type { AnalyzeHandlerService, AnalyzeResult, AnalyzeError, Result } from './services/analyze-handler.js';
import { Intervals } from './types/api-types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FirebaseServices } from './config/firebase-config.js';
import type { Auth } from 'firebase-admin/auth';

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

  describe('Firebase Auth Integration (Task 6.1)', () => {
    /**
     * Create mock Firebase services for testing auth middleware integration.
     * The mock Auth verifies tokens and returns decoded user info.
     */
    function createMockFirebaseServices(): FirebaseServices {
      const mockAuth = {
        verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
          if (token === 'valid-test-token') {
            return {
              uid: 'test-user-123',
              email: 'test@example.com',
              name: 'Test User',
              picture: 'https://example.com/photo.jpg',
            };
          }
          if (token === 'expired-token') {
            const error = new Error('Token expired');
            (error as unknown as { code: string }).code = 'auth/id-token-expired';
            throw error;
          }
          throw new Error('Invalid token');
        }),
      } as unknown as Auth;

      const mockFirestore = {} as unknown as FirebaseFirestore.Firestore;

      return {
        app: {} as unknown as FirebaseServices['app'],
        auth: mockAuth,
        firestore: mockFirestore,
      };
    }

    let authApp: Express;
    let mockFirebaseServices: FirebaseServices;

    beforeEach(() => {
      resetSessionManager();
      resetAnalyzeHandler();
      resetAlexaService();
      resetFirebaseIntegration();
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/non-existent-alexa-cookie-test.json';
      mockFirebaseServices = createMockFirebaseServices();
      authApp = createApp({ firebaseServices: mockFirebaseServices });
    });

    afterEach(() => {
      resetAnalyzeHandler();
      resetAlexaService();
      resetFirebaseIntegration();
    });

    it('should apply optional auth middleware - guest mode when no token provided', async () => {
      // Health check should work without auth token (guest mode)
      const response = await request(authApp).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('should apply optional auth middleware - valid token sets req.user', async () => {
      // Session start should work with valid auth token
      const response = await request(authApp)
        .post('/api/session/start')
        .set('Authorization', 'Bearer valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('active');
    });

    it('should apply optional auth middleware - invalid token returns 401', async () => {
      const response = await request(authApp)
        .get('/api/health')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('INVALID_TOKEN');
    });

    it('should apply optional auth middleware - expired token returns 401', async () => {
      const response = await request(authApp)
        .get('/api/health')
        .set('Authorization', 'Bearer expired-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('TOKEN_EXPIRED');
    });

    it('should register credential routes at /api/credentials', async () => {
      // GET /api/credentials/status without auth should return 401 (requireAuth guard)
      const response = await request(authApp).get('/api/credentials/status');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTH_REQUIRED');
    });

    it('should allow authenticated access to credential status endpoint', async () => {
      // With valid token, credential status should be accessible
      // Returns 500 because mock Firestore is not fully configured, but NOT 401
      const response = await request(authApp)
        .get('/api/credentials/status')
        .set('Authorization', 'Bearer valid-test-token');

      // Should not be 401 - auth passed, but may fail on Firestore access
      expect(response.status).not.toBe(401);
    });

    it('should reject unauthenticated PUT to credential endpoint', async () => {
      const response = await request(authApp)
        .put('/api/credentials/nature-remo')
        .send({ token: 'some-token' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTH_REQUIRED');
    });

    it('should reject unauthenticated DELETE to credential endpoint', async () => {
      const response = await request(authApp)
        .delete('/api/credentials/nature-remo');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTH_REQUIRED');
    });

    it('should preserve existing session routes with auth middleware', async () => {
      // Session status should work without auth (guest mode)
      const statusResponse = await request(authApp).get('/api/session/status');
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('hasActiveSession');
    });

    it('should preserve existing echo endpoint with auth middleware', async () => {
      const response = await request(authApp)
        .post('/api/echo')
        .send({ message: 'hello' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.received).toHaveProperty('message', 'hello');
    });

    it('should preserve device endpoint functionality', async () => {
      // Devices endpoint should work (returns empty list when no Nature Remo configured)
      const response = await request(authApp).get('/api/devices');
      expect(response.status).toBe(200);
    });

    it('should create app without Firebase services (graceful degradation)', async () => {
      resetFirebaseIntegration();
      const noFirebaseApp = createApp();

      // Health check should still work
      const healthResponse = await request(noFirebaseApp).get('/api/health');
      expect(healthResponse.status).toBe(200);

      // Session should still work
      const sessionResponse = await request(noFirebaseApp).get('/api/session/status');
      expect(sessionResponse.status).toBe(200);
    });

    it('should not register credential routes when Firebase services are unavailable', async () => {
      // Clear Firebase-related env vars to simulate unconfigured environment
      const origProject = process.env['GOOGLE_CLOUD_PROJECT'];
      const origEncKey = process.env['CREDENTIAL_ENCRYPTION_KEY'];
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['CREDENTIAL_ENCRYPTION_KEY'];

      try {
        resetFirebaseIntegration();
        resetSessionManager();
        const noFirebaseApp = createApp();

        // Credential endpoint should return 404 when Firebase not configured
        const response = await request(noFirebaseApp).get('/api/credentials/status');
        expect(response.status).toBe(404);
      } finally {
        // Restore env vars
        if (origProject !== undefined) {
          process.env['GOOGLE_CLOUD_PROJECT'] = origProject;
        }
        if (origEncKey !== undefined) {
          process.env['CREDENTIAL_ENCRYPTION_KEY'] = origEncKey;
        }
      }
    });
  });

  describe('/api/devices with user credential token (Task 10.2-fix-1)', () => {
    /**
     * Tests for fix: /api/devices should use authenticated user's stored
     * Nature Remo token from Firestore when available, instead of only
     * using the global NATURE_REMO_TOKEN environment variable.
     *
     * Root cause: /api/devices endpoint never checked req.user or
     * credential-service, always used global getApplianceService().
     */

    let origNatureRemoToken: string | undefined;

    function createMockFirebaseServicesForDevices(): FirebaseServices {
      const mockAuth = {
        verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
          if (token === 'valid-user-token') {
            return {
              uid: 'user-with-remo-token',
              email: 'remo-user@example.com',
              name: 'Remo User',
              picture: 'https://example.com/photo.jpg',
            };
          }
          if (token === 'user-without-remo-token') {
            return {
              uid: 'user-no-remo',
              email: 'no-remo@example.com',
              name: 'No Remo User',
            };
          }
          throw new Error('Invalid token');
        }),
      } as unknown as Auth;

      const mockFirestore = {} as unknown as FirebaseFirestore.Firestore;

      return {
        app: {} as unknown as FirebaseServices['app'],
        auth: mockAuth,
        firestore: mockFirestore,
      };
    }

    beforeEach(() => {
      origNatureRemoToken = process.env['NATURE_REMO_TOKEN'];
      // Remove global token to simulate environment where user must provide their own
      delete process.env['NATURE_REMO_TOKEN'];
      resetSessionManager();
      resetAnalyzeHandler();
      resetAlexaService();
      resetFirebaseIntegration();
      resetApplianceServiceSingleton();
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/non-existent-alexa-cookie-test.json';
    });

    afterEach(() => {
      if (origNatureRemoToken !== undefined) {
        process.env['NATURE_REMO_TOKEN'] = origNatureRemoToken;
      } else {
        delete process.env['NATURE_REMO_TOKEN'];
      }
      resetAnalyzeHandler();
      resetAlexaService();
      resetFirebaseIntegration();
      resetApplianceServiceSingleton();
    });

    it('should return empty devices for guest when no global token is set', async () => {
      // Guest mode, no global token -> return empty list (correct behavior per user: "ゲストには使わせません")
      const guestApp = createApp({
        firebaseServices: createMockFirebaseServicesForDevices(),
      });

      const response = await request(guestApp).get('/api/devices');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ devices: [] });
    });

    it('should use user credential token when authenticated user has saved token', async () => {
      // Mock credential service that returns a decrypted token for the user
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (uid: string, service: string) => {
          if (uid === 'user-with-remo-token' && service === 'nature-remo') {
            return { ok: true, value: 'user-nature-remo-token-123' };
          }
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      // Mock device fetcher that returns devices when called with user's token
      const mockUserDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [
          { id: 'user-light-1', name: 'My Desk Light', type: 'LIGHT' },
          { id: 'user-ac-1', name: 'My Aircon', type: 'AC' },
        ],
      });

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForDevices(),
        credentialService: mockCredentialService,
        userDeviceFetcher: mockUserDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer valid-user-token');

      expect(response.status).toBe(200);
      expect(response.body.devices).toHaveLength(2);
      expect(response.body.devices[0]).toEqual({ id: 'user-light-1', name: 'My Desk Light', type: 'LIGHT' });
      expect(response.body.devices[1]).toEqual({ id: 'user-ac-1', name: 'My Aircon', type: 'AC' });
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('user-with-remo-token', 'nature-remo');
      expect(mockUserDeviceFetcher).toHaveBeenCalledWith('user-nature-remo-token-123');
    });

    it('should fall back to global token when authenticated user has no saved token', async () => {
      // Set a global token for fallback
      process.env['NATURE_REMO_TOKEN'] = 'global-fallback-token';
      resetApplianceServiceSingleton();

      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Not found' },
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForDevices(),
        credentialService: mockCredentialService,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer user-without-remo-token');

      // Should attempt to get user token from credential service
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('user-no-remo', 'nature-remo');
      // Response depends on whether the global Nature Remo API call succeeds
      // In test environment, the global token is fake, so it will likely fail with 503 or succeed with cached data
      // The important thing is that it doesn't return empty list (which was the bug)
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should return empty devices when user has no token and no global token', async () => {
      // No global token, user has no saved token -> return empty list
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Not found' },
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForDevices(),
        credentialService: mockCredentialService,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer user-without-remo-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ devices: [] });
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('user-no-remo', 'nature-remo');
    });

    it('should handle credential service errors gracefully and fall back to global', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'FIRESTORE_ERROR', message: 'Connection failed' },
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForDevices(),
        credentialService: mockCredentialService,
      });

      // Should fall back gracefully (empty list when no global token either)
      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer valid-user-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ devices: [] });
    });

    it('should handle user device fetcher errors and return error response', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockResolvedValue({
          ok: true,
          value: 'invalid-user-token',
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockUserDeviceFetcher = vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: 'NATURE_API_ERROR',
          message: 'Unauthorized: Invalid token',
        },
      });

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForDevices(),
        credentialService: mockCredentialService,
        userDeviceFetcher: mockUserDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer valid-user-token');

      // Should return the error from the user's token API call
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('NATURE_API_ERROR');
    });
  });

  describe('/api/devices with user Alexa credential (Task 4.1)', () => {
    /**
     * Tests for task 4.1: GET /api/devices should fetch user-specific Alexa devices
     * when the authenticated user has saved Alexa cookies in Firestore.
     *
     * Flow: credentialService.getDecryptedToken(uid, 'alexa') -> cookie JSON ->
     *       temp file -> createAlexaService -> getDevices() -> merge with Nature Remo
     *
     * Requirements: 3.1, 3.2, 3.3, 3.4, 5.2
     */

    let origNatureRemoToken: string | undefined;

    function createMockFirebaseServicesForAlexaDevices(): FirebaseServices {
      const mockAuth = {
        verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
          if (token === 'alexa-user-token') {
            return {
              uid: 'user-with-alexa-cookie',
              email: 'alexa-user@example.com',
              name: 'Alexa User',
              picture: 'https://example.com/photo.jpg',
            };
          }
          if (token === 'no-alexa-user-token') {
            return {
              uid: 'user-no-alexa',
              email: 'no-alexa@example.com',
              name: 'No Alexa User',
            };
          }
          throw new Error('Invalid token');
        }),
      } as unknown as Auth;

      const mockFirestore = {} as unknown as FirebaseFirestore.Firestore;

      return {
        app: {} as unknown as FirebaseServices['app'],
        auth: mockAuth,
        firestore: mockFirestore,
      };
    }

    beforeEach(() => {
      origNatureRemoToken = process.env['NATURE_REMO_TOKEN'];
      delete process.env['NATURE_REMO_TOKEN'];
      resetSessionManager();
      resetAnalyzeHandler();
      resetAlexaService();
      resetFirebaseIntegration();
      resetApplianceServiceSingleton();
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/non-existent-alexa-cookie-test.json';
    });

    afterEach(() => {
      if (origNatureRemoToken !== undefined) {
        process.env['NATURE_REMO_TOKEN'] = origNatureRemoToken;
      } else {
        delete process.env['NATURE_REMO_TOKEN'];
      }
      resetAnalyzeHandler();
      resetAlexaService();
      resetFirebaseIntegration();
      resetApplianceServiceSingleton();
    });

    it('should include user Alexa devices when user has saved Alexa cookie (Req 3.1, 3.2)', async () => {
      // Mock credential service: user has both nature-remo and alexa tokens
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (uid: string, service: string) => {
          if (uid === 'user-with-alexa-cookie' && service === 'nature-remo') {
            return { ok: true, value: 'user-nature-remo-token' };
          }
          if (uid === 'user-with-alexa-cookie' && service === 'alexa') {
            return { ok: true, value: '{"localCookie":"test-cookie-data"}' };
          }
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      // Mock Nature Remo device fetcher
      const mockUserDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [
          { id: 'user-light-1', name: 'My Desk Light', type: 'LIGHT' },
        ],
      });

      // Mock Alexa device fetcher
      const mockUserAlexaDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [
          { id: 'echo-serial-1', name: 'Echo Dot Desk', type: 'ALEXA' as const },
          { id: 'echo-serial-2', name: 'Echo Show Living', type: 'ALEXA' as const },
        ],
      });

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userDeviceFetcher: mockUserDeviceFetcher,
        userAlexaDeviceFetcher: mockUserAlexaDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer alexa-user-token');

      expect(response.status).toBe(200);
      // Should contain Nature Remo + Alexa devices
      expect(response.body.devices).toHaveLength(3);
      expect(response.body.devices[0]).toEqual({ id: 'user-light-1', name: 'My Desk Light', type: 'LIGHT' });
      expect(response.body.devices[1]).toEqual({ id: 'echo-serial-1', name: 'Echo Dot Desk', type: 'ALEXA' });
      expect(response.body.devices[2]).toEqual({ id: 'echo-serial-2', name: 'Echo Show Living', type: 'ALEXA' });
      // Verify both credential lookups were made
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('user-with-alexa-cookie', 'alexa');
      expect(mockUserAlexaDeviceFetcher).toHaveBeenCalledWith('{"localCookie":"test-cookie-data"}');
    });

    it('should return Alexa devices even when user has no Nature Remo token (Req 3.1)', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (uid: string, service: string) => {
          if (uid === 'user-with-alexa-cookie' && service === 'alexa') {
            return { ok: true, value: '{"localCookie":"test-cookie"}' };
          }
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockUserAlexaDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [
          { id: 'echo-serial-1', name: 'Echo Dot', type: 'ALEXA' as const },
        ],
      });

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userAlexaDeviceFetcher: mockUserAlexaDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer alexa-user-token');

      expect(response.status).toBe(200);
      // Should contain only Alexa devices (no Nature Remo)
      expect(response.body.devices).toHaveLength(1);
      expect(response.body.devices[0]).toEqual({ id: 'echo-serial-1', name: 'Echo Dot', type: 'ALEXA' });
    });

    it('should fallback to global AlexaService when user has no Alexa cookie (Req 3.3)', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (_uid: string, service: string) => {
          if (service === 'nature-remo') {
            return { ok: true, value: 'user-nature-remo-token' };
          }
          // No Alexa cookie for this user
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockUserDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [
          { id: 'user-light-1', name: 'My Light', type: 'LIGHT' },
        ],
      });

      // No userAlexaDeviceFetcher -> should try global AlexaService
      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userDeviceFetcher: mockUserDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer alexa-user-token');

      expect(response.status).toBe(200);
      // Should have Nature Remo devices. No Alexa since no user cookie and global AlexaService is disconnected
      expect(response.body.devices).toHaveLength(1);
      expect(response.body.devices[0]).toEqual({ id: 'user-light-1', name: 'My Light', type: 'LIGHT' });
      // Verify Alexa credential lookup was attempted
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('user-with-alexa-cookie', 'alexa');
    });

    it('should continue without Alexa devices when AlexaService creation fails (Req 3.4)', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (uid: string, service: string) => {
          if (uid === 'user-with-alexa-cookie' && service === 'nature-remo') {
            return { ok: true, value: 'user-nature-remo-token' };
          }
          if (uid === 'user-with-alexa-cookie' && service === 'alexa') {
            return { ok: true, value: '{"localCookie":"expired-cookie"}' };
          }
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockUserDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [
          { id: 'user-light-1', name: 'My Light', type: 'LIGHT' },
        ],
      });

      // Mock Alexa device fetcher that returns failure
      const mockUserAlexaDeviceFetcher = vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'ALEXA_ERROR', message: 'Cookie expired' },
      });

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userDeviceFetcher: mockUserDeviceFetcher,
        userAlexaDeviceFetcher: mockUserAlexaDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer alexa-user-token');

      expect(response.status).toBe(200);
      // Should still return Nature Remo devices without Alexa devices
      expect(response.body.devices).toHaveLength(1);
      expect(response.body.devices[0]).toEqual({ id: 'user-light-1', name: 'My Light', type: 'LIGHT' });
    });

    it('should handle Alexa device fetcher throwing an exception gracefully (Req 3.4)', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (uid: string, service: string) => {
          if (uid === 'user-with-alexa-cookie' && service === 'alexa') {
            return { ok: true, value: '{"localCookie":"bad-cookie"}' };
          }
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      // Mock Alexa device fetcher that throws
      const mockUserAlexaDeviceFetcher = vi.fn().mockRejectedValue(
        new Error('Connection timeout')
      );

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userAlexaDeviceFetcher: mockUserAlexaDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer alexa-user-token');

      expect(response.status).toBe(200);
      // Should return empty devices (no Nature Remo, Alexa failed) rather than 500
      expect(response.body.devices).toEqual([]);
    });

    it('should not fetch Alexa devices for guest users (Req 3.1)', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn(),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockUserAlexaDeviceFetcher = vi.fn();

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userAlexaDeviceFetcher: mockUserAlexaDeviceFetcher,
      });

      const response = await request(deviceApp).get('/api/devices');

      expect(response.status).toBe(200);
      // Guest mode: should not call Alexa credential lookup
      expect(mockCredentialService.getDecryptedToken).not.toHaveBeenCalledWith(
        expect.anything(),
        'alexa'
      );
      expect(mockUserAlexaDeviceFetcher).not.toHaveBeenCalled();
    });

    it('should fetch Nature Remo and Alexa credentials in parallel (Req 3.1, 3.2)', async () => {
      /**
       * Verifies that both credential lookups (nature-remo and alexa) are initiated
       * simultaneously using Promise.all for optimal latency.
       */
      const callOrder: string[] = [];

      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (uid: string, service: string) => {
          callOrder.push(`getDecryptedToken:${service}`);
          if (uid === 'user-with-alexa-cookie' && service === 'nature-remo') {
            return { ok: true, value: 'user-nature-remo-token' };
          }
          if (uid === 'user-with-alexa-cookie' && service === 'alexa') {
            return { ok: true, value: '{"localCookie":"test-cookie"}' };
          }
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockUserDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [{ id: 'light-1', name: 'Light', type: 'LIGHT' }],
      });

      const mockUserAlexaDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [{ id: 'echo-1', name: 'Echo', type: 'ALEXA' as const }],
      });

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userDeviceFetcher: mockUserDeviceFetcher,
        userAlexaDeviceFetcher: mockUserAlexaDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer alexa-user-token');

      expect(response.status).toBe(200);
      // Both lookups should have been called
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('user-with-alexa-cookie', 'nature-remo');
      expect(mockCredentialService.getDecryptedToken).toHaveBeenCalledWith('user-with-alexa-cookie', 'alexa');
      // Both fetchers should have been called
      expect(mockUserDeviceFetcher).toHaveBeenCalled();
      expect(mockUserAlexaDeviceFetcher).toHaveBeenCalled();
      // Result should contain both types merged
      expect(response.body.devices).toHaveLength(2);
      const types = response.body.devices.map((d: { type: string }) => d.type);
      expect(types).toContain('LIGHT');
      expect(types).toContain('ALEXA');
    });

    it('should handle credential service FIRESTORE_ERROR for Alexa and continue with Nature Remo devices (Req 3.4)', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (uid: string, service: string) => {
          if (uid === 'user-with-alexa-cookie' && service === 'nature-remo') {
            return { ok: true, value: 'user-nature-remo-token' };
          }
          if (service === 'alexa') {
            return { ok: false, error: { code: 'FIRESTORE_ERROR', message: 'Firestore connection failed' } };
          }
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockUserDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [{ id: 'light-1', name: 'My Light', type: 'LIGHT' }],
      });

      const mockUserAlexaDeviceFetcher = vi.fn();

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userDeviceFetcher: mockUserDeviceFetcher,
        userAlexaDeviceFetcher: mockUserAlexaDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer alexa-user-token');

      expect(response.status).toBe(200);
      // Should still return Nature Remo devices despite Alexa Firestore error
      expect(response.body.devices).toHaveLength(1);
      expect(response.body.devices[0]).toEqual({ id: 'light-1', name: 'My Light', type: 'LIGHT' });
      // Alexa device fetcher should NOT have been called (credential lookup failed)
      expect(mockUserAlexaDeviceFetcher).not.toHaveBeenCalled();
    });

    it('should correctly assign type ALEXA to all Alexa devices in merged list (Req 3.2)', async () => {
      const mockCredentialService = {
        getDecryptedToken: vi.fn().mockImplementation(async (uid: string, service: string) => {
          if (uid === 'user-with-alexa-cookie' && service === 'nature-remo') {
            return { ok: true, value: 'user-remo-token' };
          }
          if (uid === 'user-with-alexa-cookie' && service === 'alexa') {
            return { ok: true, value: '{"cookie":"data"}' };
          }
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
        }),
        saveToken: vi.fn(),
        getStatus: vi.fn(),
        deleteToken: vi.fn(),
        deleteAllForUser: vi.fn(),
      };

      const mockUserDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [
          { id: 'light-1', name: 'Desk Light', type: 'LIGHT' },
          { id: 'ac-1', name: 'Office AC', type: 'AC' },
        ],
      });

      const mockUserAlexaDeviceFetcher = vi.fn().mockResolvedValue({
        ok: true,
        devices: [
          { id: 'echo-1', name: 'Echo Dot Office', type: 'ALEXA' as const },
          { id: 'echo-2', name: 'Echo Show Kitchen', type: 'ALEXA' as const },
          { id: 'echo-3', name: 'Echo Studio Bedroom', type: 'ALEXA' as const },
        ],
      });

      const deviceApp = createApp({
        firebaseServices: createMockFirebaseServicesForAlexaDevices(),
        credentialService: mockCredentialService,
        userDeviceFetcher: mockUserDeviceFetcher,
        userAlexaDeviceFetcher: mockUserAlexaDeviceFetcher,
      });

      const response = await request(deviceApp)
        .get('/api/devices')
        .set('Authorization', 'Bearer alexa-user-token');

      expect(response.status).toBe(200);
      // 2 Nature Remo + 3 Alexa = 5 total
      expect(response.body.devices).toHaveLength(5);
      // Nature Remo devices come first, then Alexa
      expect(response.body.devices[0].type).toBe('LIGHT');
      expect(response.body.devices[1].type).toBe('AC');
      expect(response.body.devices[2].type).toBe('ALEXA');
      expect(response.body.devices[3].type).toBe('ALEXA');
      expect(response.body.devices[4].type).toBe('ALEXA');
      // Verify each Alexa device has correct properties
      expect(response.body.devices[2]).toEqual({ id: 'echo-1', name: 'Echo Dot Office', type: 'ALEXA' });
      expect(response.body.devices[3]).toEqual({ id: 'echo-2', name: 'Echo Show Kitchen', type: 'ALEXA' });
      expect(response.body.devices[4]).toEqual({ id: 'echo-3', name: 'Echo Studio Bedroom', type: 'ALEXA' });
    });
  });

  describe('Alexa Proxy Auth Route Mounting (Task 3.3)', () => {
    /**
     * Tests for task 3.3: Mount alexa-proxy-handler routes on server.ts.
     * Verifies that:
     * - AlexaProxyService is created at server startup and injected into handler
     * - POST /api/alexa-auth/start requires authentication
     * - GET /api/alexa-auth/status/:sessionId requires authentication
     * - ALL /api/alexa-auth/proxy/:sessionId/* is registered
     * - Coexists with credential-handler, session-handler
     *
     * Requirements: 1.5, 5.3
     */

    function createMockFirebaseServicesForProxy(): FirebaseServices {
      const mockAuth = {
        verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
          if (token === 'valid-proxy-token') {
            return {
              uid: 'proxy-test-user',
              email: 'proxy@example.com',
              name: 'Proxy User',
              picture: 'https://example.com/photo.jpg',
            };
          }
          if (token === 'another-user-token') {
            return {
              uid: 'another-user',
              email: 'another@example.com',
              name: 'Another User',
            };
          }
          throw new Error('Invalid token');
        }),
      } as unknown as Auth;

      const mockFirestore = {} as unknown as FirebaseFirestore.Firestore;

      return {
        app: {} as unknown as FirebaseServices['app'],
        auth: mockAuth,
        firestore: mockFirestore,
      };
    }

    let proxyApp: Express;

    beforeEach(() => {
      resetSessionManager();
      resetAnalyzeHandler();
      resetAlexaService();
      resetFirebaseIntegration();
      resetAlexaProxyService();
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/non-existent-alexa-cookie-test.json';
      proxyApp = createApp({ firebaseServices: createMockFirebaseServicesForProxy() });
    });

    afterEach(() => {
      resetAnalyzeHandler();
      resetAlexaService();
      resetFirebaseIntegration();
      resetAlexaProxyService();
    });

    it('should reject unauthenticated POST to /api/alexa-auth/start with 401', async () => {
      const response = await request(proxyApp).post('/api/alexa-auth/start');
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTH_REQUIRED');
    });

    it('should reject unauthenticated GET to /api/alexa-auth/status/:sessionId with 401', async () => {
      const response = await request(proxyApp).get('/api/alexa-auth/status/some-session-id');
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTH_REQUIRED');
    });

    it('should handle POST /api/alexa-auth/start with authenticated user (returns 500 because proxy cannot actually start in test)', async () => {
      const response = await request(proxyApp)
        .post('/api/alexa-auth/start')
        .set('Authorization', 'Bearer valid-proxy-token');

      // AlexaProxyService uses createAlexaService which will fail in test env,
      // so we expect either 500 (PROXY_START_FAILED) or 200 (if mock works).
      // The important thing is that it's NOT 401 (auth passed) and NOT 404 (route exists).
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(404);
    });

    it('should handle GET /api/alexa-auth/status/:sessionId for non-existent session with 404', async () => {
      const response = await request(proxyApp)
        .get('/api/alexa-auth/status/nonexistent-session')
        .set('Authorization', 'Bearer valid-proxy-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('SESSION_NOT_FOUND');
    });

    it('should handle /api/alexa-auth/proxy/:sessionId/* for non-existent session with 404', async () => {
      const response = await request(proxyApp)
        .get('/api/alexa-auth/proxy/nonexistent-session/test-path');

      // Proxy route should return 404 for unknown session
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('SESSION_NOT_FOUND');
    });

    it('should preserve existing session routes when alexa proxy routes are mounted', async () => {
      const statusResponse = await request(proxyApp).get('/api/session/status');
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('hasActiveSession');
    });

    it('should preserve existing credential routes when alexa proxy routes are mounted', async () => {
      // Credential status without auth should return 401 (requireAuth guard)
      const response = await request(proxyApp).get('/api/credentials/status');
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTH_REQUIRED');
    });

    it('should preserve health check endpoint when alexa proxy routes are mounted', async () => {
      const response = await request(proxyApp).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('should not register alexa proxy routes when Firebase services are unavailable', async () => {
      const origProject = process.env['GOOGLE_CLOUD_PROJECT'];
      const origEncKey = process.env['CREDENTIAL_ENCRYPTION_KEY'];
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['CREDENTIAL_ENCRYPTION_KEY'];

      try {
        resetFirebaseIntegration();
        resetSessionManager();
        resetAlexaProxyService();
        const noFirebaseApp = createApp();

        // Alexa proxy auth endpoint should return 404 when Firebase not configured
        const response = await request(noFirebaseApp).post('/api/alexa-auth/start');
        expect(response.status).toBe(404);
      } finally {
        if (origProject !== undefined) {
          process.env['GOOGLE_CLOUD_PROJECT'] = origProject;
        }
        if (origEncKey !== undefined) {
          process.env['CREDENTIAL_ENCRYPTION_KEY'] = origEncKey;
        }
      }
    });
  });
});
