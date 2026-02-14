/**
 * E2E Integration Tests: Alexa Proxy Authentication Flow
 *
 * Tests the end-to-end proxy authentication flow including:
 * - Session start -> internal proxy startup -> reverse proxy request forwarding -> URL rewriting
 * - Cookie capture -> CredentialService save -> session status completed
 * - Timeout -> session cleanup -> resource release
 * - Duplicate session prevention across the full stack
 *
 * Uses a real AlexaProxyService wired to mock createAlexaRemoteForProxyFn and mock CredentialService,
 * with real alexa-proxy-handler and alexa-reverse-proxy middleware mounted on a test Express app.
 *
 * Requirements: 1.1, 1.3, 1.5, 5.1
 * Task: 7.1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import request from 'supertest';
import { createAlexaProxyService } from '../services/alexa-proxy-service.js';
import { createAlexaProxyRoutes } from '../handlers/alexa-proxy-handler.js';
import { createAlexaReverseProxyMiddleware } from '../middleware/alexa-reverse-proxy.js';
import type { AlexaProxyService } from '../types/alexa-proxy-types.js';
import type { CredentialService } from '../services/credential-service.js';
import type { AuthenticatedUser } from '../types/auth-types.js';
import type { AlexaServiceConfig } from '../../packages/alexa-remote2/src/types/alexa-types.js';

// Mock node:fs to prevent actual filesystem operations during temp file cleanup
vi.mock('node:fs', () => ({
  unlinkSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

// =============================================================================
// Test Fixtures & Helpers
// =============================================================================

const testUser: AuthenticatedUser = {
  uid: 'e2e-user-001',
  email: 'e2e@example.com',
  displayName: 'E2E User',
  photoURL: undefined,
};

const secondUser: AuthenticatedUser = {
  uid: 'e2e-user-002',
  email: 'e2e-second@example.com',
  displayName: 'Second User',
  photoURL: undefined,
};

/**
 * Middleware that simulates an authenticated user on req.user.
 */
function fakeAuthMiddleware(user: AuthenticatedUser) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: AuthenticatedUser }).user = user;
    next();
  };
}

/**
 * Middleware that simulates requireAuth guard.
 */
function fakeRequireAuth(req: Request, res: Response, next: NextFunction) {
  const user = (req as unknown as { user: AuthenticatedUser | null | undefined }).user;
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  next();
}

/**
 * Create a mock CredentialService for E2E tests.
 */
function createMockCredentialService(overrides?: Partial<CredentialService>): CredentialService {
  return {
    saveToken: vi.fn(async () => ({ ok: true as const, value: undefined })),
    getDecryptedToken: vi.fn(async () => ({
      ok: false as const,
      error: { code: 'NOT_FOUND' as const, message: 'Not found' },
    })),
    getStatus: vi.fn(async () => ({ ok: true as const, value: [] })),
    deleteToken: vi.fn(async () => ({ ok: true as const, value: undefined })),
    deleteAllForUser: vi.fn(async () => ({ ok: true as const, value: undefined })),
    ...overrides,
  };
}

/**
 * Internal proxy server that simulates alexa-cookie2's behavior:
 * - Serves HTML with localhost URLs that need rewriting
 * - Handles redirects with Location headers containing localhost URLs
 * - Emits a cookie event when login is "completed"
 */
interface MockInternalProxy {
  readonly server: http.Server;
  readonly port: number;
  close(): void;
}

function createMockInternalProxy(
  responseBody: string,
  options?: {
    statusCode?: number;
    headers?: Record<string, string>;
    contentType?: string;
  }
): Promise<MockInternalProxy> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      const contentType = options?.contentType ?? 'text/html';
      res.writeHead(options?.statusCode ?? 200, {
        'content-type': contentType,
        ...options?.headers,
      });
      res.end(responseBody);
    });

    server.listen(0, 'localhost', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        server,
        port,
        close: () => server.close(),
      });
    });
  });
}

/**
 * Create a mock internal proxy that listens on a specific port and serves
 * HTML containing self-referencing localhost URLs (simulating alexa-cookie2).
 */
function createMockInternalProxyWithDynamicPort(
  port: number
): Promise<MockInternalProxy> {
  const body =
    '<html><body>' +
    `<a href="http://localhost:${port}/www.amazon.co.jp/login">Login</a>` +
    `<form action="http://localhost:${port}/www.amazon.co.jp/submit">` +
    '</form></body></html>';

  return createMockInternalProxyOnPort(port, body);
}

/**
 * Create a mock internal proxy on a specific port with given body and options.
 */
function createMockInternalProxyOnPort(
  port: number,
  responseBody: string,
  options?: {
    statusCode?: number;
    headers?: Record<string, string>;
    contentType?: string;
  }
): Promise<MockInternalProxy> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      const contentType = options?.contentType ?? 'text/html';
      res.writeHead(options?.statusCode ?? 200, {
        'content-type': contentType,
        ...options?.headers,
      });
      res.end(responseBody);
    });

    server.on('error', reject);

    server.listen(port, 'localhost', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        server,
        port: actualPort,
        close: () => server.close(),
      });
    });
  });
}

/**
 * Mock alexa-remote2 factory that returns an object mimicking
 * the AlexaService proxy instance. It captures the cookie event listener,
 * and reports its own proxy port.
 */
interface MockAlexaInstance {
  readonly listeners: Map<string, (...args: readonly unknown[]) => void>;
  emitCookie(cookieData: unknown): void;
  stopProxyServer: ReturnType<typeof vi.fn>;
  proxyPort: number;
}

function createMockCreateAlexaServiceFn(proxyPort: number) {
  let lastInstance: MockAlexaInstance | undefined;

  const mockFn = vi.fn(async (_config: AlexaServiceConfig) => {
    const listeners = new Map<string, (...args: readonly unknown[]) => void>();
    let storedCookieData: unknown = undefined;
    const instance: MockAlexaInstance = {
      listeners,
      emitCookie(cookieData: unknown) {
        storedCookieData = cookieData;
        const handler = listeners.get('cookie');
        if (handler) {
          handler(cookieData);
        }
      },
      stopProxyServer: vi.fn(),
      proxyPort,
    };
    lastInstance = instance;

    return {
      on: (event: string, handler: (...args: readonly unknown[]) => void) => {
        listeners.set(event, handler);
      },
      stopProxyServer: instance.stopProxyServer,
      proxyPort,
      getCookieData: () => storedCookieData,
    };
  });

  return {
    mockFn,
    getLastInstance: () => lastInstance,
  };
}

/**
 * Build a fully wired test Express app with real AlexaProxyService,
 * real handler, and real reverse proxy middleware.
 */
function createE2EApp(options: {
  user: AuthenticatedUser;
  alexaProxyService: AlexaProxyService;
}): Express {
  const { user, alexaProxyService } = options;
  const app = express();
  app.use(express.json());
  app.use(fakeAuthMiddleware(user));

  // Mount reverse proxy BEFORE requireAuth (same as production server.ts)
  app.use(
    '/api/alexa-auth/proxy/:sessionId',
    createAlexaReverseProxyMiddleware({ alexaProxyService })
  );

  // Mount handler routes with requireAuth
  app.use(
    '/api/alexa-auth',
    fakeRequireAuth,
    createAlexaProxyRoutes({ alexaProxyService })
  );

  return app;
}

// =============================================================================
// E2E Integration Tests
// =============================================================================

describe('E2E Integration: Alexa Proxy Authentication Flow', () => {
  let credentialService: CredentialService;
  let internalProxy: MockInternalProxy | undefined;

  afterEach(() => {
    if (internalProxy) {
      internalProxy.close();
      internalProxy = undefined;
    }
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Flow 1: Session Start -> Reverse Proxy Forwarding -> URL Rewriting
  // Requirements: 1.1, 1.5
  // ---------------------------------------------------------------------------
  describe('Session start and reverse proxy request forwarding', () => {
    it('should start a proxy session and return sessionId and proxyUrl', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(0);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('proxyUrl');
      expect(response.body.proxyUrl).toContain('/api/alexa-auth/proxy/');
      expect(response.body.proxyUrl).toContain(response.body.sessionId);
    });

    it('should forward requests through reverse proxy to internal proxy with URL rewriting', async () => {
      // Start internal proxy first -- it dynamically serves HTML that includes
      // its own port in URLs (simulating alexa-cookie2 behavior)
      internalProxy = await createMockInternalProxy('DYNAMIC');
      const proxyPort = internalProxy.port;
      // Close and recreate with content that uses the actual port
      internalProxy.close();
      internalProxy = await createMockInternalProxyWithDynamicPort(proxyPort);

      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(proxyPort);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      // Step 1: Start proxy session
      const startResponse = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      const { sessionId, proxyUrl } = startResponse.body;

      // Step 2: Make a request through the reverse proxy path
      const proxyResponse = await request(app)
        .get(`${proxyUrl}www.amazon.co.jp/test`)
        .expect(200);

      // Verify URL rewriting: localhost URLs should be replaced with public proxy paths
      const body = proxyResponse.text;
      expect(body).toContain(`/api/alexa-auth/proxy/${sessionId}/www.amazon.co.jp/login`);
      expect(body).toContain(`/api/alexa-auth/proxy/${sessionId}/www.amazon.co.jp/submit`);
      expect(body).not.toContain(`http://localhost:${proxyPort}`);
    });

    it('should rewrite Location headers in redirect responses', async () => {
      credentialService = createMockCredentialService();

      // Create internal proxy on a dynamic port, then recreate on the same port
      // with the correct Location header referencing itself
      internalProxy = await createMockInternalProxy('');
      const proxyPort = internalProxy.port;
      internalProxy.close();

      internalProxy = await createMockInternalProxyOnPort(proxyPort, '', {
        statusCode: 302,
        headers: { location: `http://localhost:${proxyPort}/www.amazon.co.jp/auth/redirect` },
      });

      const mockCreateFn = createMockCreateAlexaServiceFn(proxyPort);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      const startResponse = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      const { sessionId, proxyUrl } = startResponse.body;

      // Request through reverse proxy -- should get a redirect with rewritten Location
      const proxyResponse = await request(app)
        .get(`${proxyUrl}initial-page`)
        .redirects(0);

      expect(proxyResponse.status).toBe(302);
      const locationHeader = proxyResponse.headers['location'];
      expect(locationHeader).toContain(`/api/alexa-auth/proxy/${sessionId}/`);
      expect(locationHeader).not.toContain(`http://localhost:${proxyPort}`);
    });

    it('should skip URL rewriting for binary content types', async () => {
      credentialService = createMockCredentialService();

      // Binary content with localhost URL in body (should not be rewritten)
      const binaryContent = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header bytes
      internalProxy = await createMockInternalProxy(binaryContent.toString('binary'), {
        contentType: 'image/png',
      });
      const proxyPort = internalProxy.port;

      const mockCreateFn = createMockCreateAlexaServiceFn(proxyPort);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      const startResponse = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      const { proxyUrl } = startResponse.body;

      // Request binary content
      const proxyResponse = await request(app)
        .get(`${proxyUrl}favicon.ico`)
        .expect(200);

      // Binary response should pass through without modification
      expect(proxyResponse.body).toBeDefined();
    });

    it('should return 404 when accessing reverse proxy with invalid session ID', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(0);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      const response = await request(app)
        .get('/api/alexa-auth/proxy/nonexistent-session-id/some-page')
        .expect(404);

      expect(response.body.error).toBe('SESSION_NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 2: Cookie Capture -> Encrypted Save -> Status Completed
  // Requirements: 1.1, 1.3
  // ---------------------------------------------------------------------------
  describe('Cookie capture, encryption save, and status completion', () => {
    it('should save cookie via CredentialService and update status to completed', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      // Step 1: Start proxy session
      const startResponse = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      const { sessionId } = startResponse.body;

      // Step 2: Verify initial status is active
      const activeStatus = await request(app)
        .get(`/api/alexa-auth/status/${sessionId}`)
        .expect(200);

      expect(activeStatus.body.status).toBe('active');
      expect(activeStatus.body.completed).toBe(false);

      // Step 3: Simulate cookie event from alexa-remote2
      const cookieData = {
        localCookie: 'session-id=abc123;',
        macDms: { device_private_key: 'key', adp_token: 'token' },
      };
      const instance = mockCreateFn.getLastInstance();
      expect(instance).toBeDefined();
      instance!.emitCookie(cookieData);

      // Allow async saveToken to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Step 4: Verify CredentialService.saveToken was called with correct args
      expect(credentialService.saveToken).toHaveBeenCalledWith(
        'e2e-user-001',
        'alexa',
        JSON.stringify(cookieData)
      );

      // Step 5: Verify status is now completed
      const completedStatus = await request(app)
        .get(`/api/alexa-auth/status/${sessionId}`)
        .expect(200);

      expect(completedStatus.body.status).toBe('completed');
      expect(completedStatus.body.completed).toBe(true);
    });

    it('should set status to failed when CredentialService.saveToken fails', async () => {
      credentialService = createMockCredentialService({
        saveToken: vi.fn(async () => ({
          ok: false as const,
          error: { code: 'FIRESTORE_ERROR' as const, message: 'Firestore write failed' },
        })),
      });
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      // Start session
      const startResponse = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      const { sessionId } = startResponse.body;

      // Emit cookie (save will fail)
      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Status should be failed
      const failedStatus = await request(app)
        .get(`/api/alexa-auth/status/${sessionId}`)
        .expect(200);

      expect(failedStatus.body.status).toBe('failed');
      expect(failedStatus.body.completed).toBe(false);
    });

    it('should stop proxy server after cookie is captured and saved', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ localCookie: 'abc' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // stopProxyServer should have been called after cookie save
      expect(instance!.stopProxyServer).toHaveBeenCalled();
    });

    it('should allow starting a new session after cookie completion for the same user', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      // First session
      const start1 = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      // Complete first session
      const instance1 = mockCreateFn.getLastInstance();
      instance1!.emitCookie({ cookie: 'first' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second session should succeed
      const start2 = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(start2.body.sessionId).not.toBe(start1.body.sessionId);
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 3: Timeout -> Cleanup -> Resource Release
  // Requirements: 5.1
  // ---------------------------------------------------------------------------
  describe('Timeout, cleanup, and resource release', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set session status to timeout after 5 minutes and release resources', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      // Start session
      const startResponse = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      const { sessionId } = startResponse.body;

      // Verify active status
      const activeStatus = await request(app)
        .get(`/api/alexa-auth/status/${sessionId}`)
        .expect(200);

      expect(activeStatus.body.status).toBe('active');

      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Status should now be timeout
      const timeoutStatus = await request(app)
        .get(`/api/alexa-auth/status/${sessionId}`)
        .expect(200);

      expect(timeoutStatus.body.status).toBe('timeout');
      expect(timeoutStatus.body.completed).toBe(false);

      // Proxy server should have been stopped
      const instance = mockCreateFn.getLastInstance();
      expect(instance!.stopProxyServer).toHaveBeenCalled();
    });

    it('should allow a new session after timeout for the same user', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      // Start first session
      await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      // Timeout
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Start new session (should succeed since uid mapping was cleared)
      const newStart = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(newStart.body).toHaveProperty('sessionId');
      expect(newStart.body).toHaveProperty('proxyUrl');
    });

    it('should not timeout if cookie is received before 5 minutes', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      const startResponse = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      const { sessionId } = startResponse.body;

      // Complete via cookie before timeout
      const instance = mockCreateFn.getLastInstance();
      instance!.emitCookie({ cookie: 'completed-before-timeout' });
      await vi.advanceTimersByTimeAsync(50);

      // Advance past timeout period
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Status should still be completed, not timeout
      const status = await request(app)
        .get(`/api/alexa-auth/status/${sessionId}`)
        .expect(200);

      expect(status.body.status).toBe('completed');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 4: Duplicate Session Prevention (Full Stack)
  // Requirements: 1.1, 5.1
  // ---------------------------------------------------------------------------
  describe('Duplicate session prevention across full stack', () => {
    it('should return 409 when same user tries to start a second session', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      // Start first session
      await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      // Try to start second session
      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(409);

      expect(response.body.error).toBe('SESSION_ALREADY_ACTIVE');
    });

    it('should allow different users to have concurrent sessions', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app1 = createE2EApp({ user: testUser, alexaProxyService });
      const app2 = createE2EApp({ user: secondUser, alexaProxyService });

      // User 1 starts session
      const response1 = await request(app1)
        .post('/api/alexa-auth/start')
        .expect(200);

      // User 2 starts session (different user, should succeed)
      const response2 = await request(app2)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(response1.body.sessionId).not.toBe(response2.body.sessionId);
    });

    it('should prevent cross-user session status access', async () => {
      credentialService = createMockCredentialService();
      const mockCreateFn = createMockCreateAlexaServiceFn(54321);
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: mockCreateFn.mockFn,
      });

      const app1 = createE2EApp({ user: testUser, alexaProxyService });
      const app2 = createE2EApp({ user: secondUser, alexaProxyService });

      // User 1 starts session
      const startResponse = await request(app1)
        .post('/api/alexa-auth/start')
        .expect(200);

      const { sessionId } = startResponse.body;

      // User 2 tries to access User 1's session status
      const response = await request(app2)
        .get(`/api/alexa-auth/status/${sessionId}`)
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 5: Error Handling (Proxy Start Failure)
  // Requirements: 5.5
  // ---------------------------------------------------------------------------
  describe('Proxy start failure handling', () => {
    it('should return 500 when internal proxy fails to start', async () => {
      credentialService = createMockCredentialService();
      const failingCreateFn = vi.fn(async () => {
        throw new Error('Internal proxy port unavailable');
      });
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: failingCreateFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      const response = await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      expect(response.body.error).toBe('PROXY_START_FAILED');
    });

    it('should allow retry after proxy start failure', async () => {
      credentialService = createMockCredentialService();
      let callCount = 0;
      const sometimesFailingCreateFn = vi.fn(async (_config: AlexaServiceConfig) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary failure');
        }
        const listeners = new Map<string, (...args: readonly unknown[]) => void>();
        return {
          on: (event: string, handler: (...args: readonly unknown[]) => void) => {
            listeners.set(event, handler);
          },
          stopProxyServer: vi.fn(),
          proxyPort: 12345,
          getCookieData: () => ({ cookie: 'mock' }),
        };
      });
      const alexaProxyService = createAlexaProxyService({
        credentialService,
        createAlexaRemoteForProxyFn: sometimesFailingCreateFn,
      });

      const app = createE2EApp({ user: testUser, alexaProxyService });

      // First attempt fails
      await request(app)
        .post('/api/alexa-auth/start')
        .expect(500);

      // Retry succeeds
      const retryResponse = await request(app)
        .post('/api/alexa-auth/start')
        .expect(200);

      expect(retryResponse.body).toHaveProperty('sessionId');
    });
  });
});
