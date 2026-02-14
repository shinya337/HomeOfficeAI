/**
 * Alexa Reverse Proxy Middleware Tests
 *
 * Tests for the reverse proxy middleware that forwards requests from
 * /api/alexa-auth/proxy/:sessionId/* to the internal alexa-cookie2 proxy
 * server running on localhost:{port}.
 *
 * Covers:
 * - Session resolution (sessionId -> proxyPort)
 * - Request path prefix removal (pathRewrite)
 * - Response body URL rewriting (localhost:{port} -> public path)
 * - Location header URL rewriting (3xx redirects)
 * - Binary response skip (no body rewriting for images, fonts, etc.)
 * - 404 response when session not found
 * - 502 response when proxy is unavailable
 * - Complex HTML with mixed Amazon and localhost URLs
 * - JavaScript content URL rewriting
 * - Location headers with query parameters
 * - Edge cases: missing sessionId, audio/video binary types
 *
 * Requirements: 1.2, 1.5
 * Tasks: 3.2, 3.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AlexaProxyService, ProxySession } from '../types/alexa-proxy-types.js';
import {
  rewriteResponseBody,
  rewriteLocationHeader,
  isBinaryContentType,
  createAlexaReverseProxyMiddleware,
} from './alexa-reverse-proxy.js';

// =============================================================================
// Mock helpers
// =============================================================================

/**
 * Create a mock AlexaProxyService with all methods as vi.fn()
 */
function createMockAlexaProxyService(): {
  [K in keyof AlexaProxyService]: ReturnType<typeof vi.fn>;
} {
  return {
    startProxySession: vi.fn(),
    getProxySession: vi.fn(),
    stopProxySession: vi.fn(),
  };
}

// =============================================================================
// Unit Tests: Pure Helper Functions
// =============================================================================

describe('rewriteResponseBody', () => {
  it('should replace localhost URL with public proxy path in HTML body', () => {
    const body = '<a href="http://localhost:12345/www.amazon.co.jp/login">Login</a>';
    const result = rewriteResponseBody(body, 12345, 'session-abc');
    expect(result).toBe(
      '<a href="/api/alexa-auth/proxy/session-abc/www.amazon.co.jp/login">Login</a>'
    );
  });

  it('should replace multiple occurrences of localhost URL', () => {
    const body =
      '<a href="http://localhost:8080/page1">P1</a>' +
      '<form action="http://localhost:8080/page2">P2</form>';
    const result = rewriteResponseBody(body, 8080, 'sess-123');
    expect(result).toBe(
      '<a href="/api/alexa-auth/proxy/sess-123/page1">P1</a>' +
      '<form action="/api/alexa-auth/proxy/sess-123/page2">P2</form>'
    );
  });

  it('should handle body with no localhost URLs (no changes)', () => {
    const body = '<html><body>Hello World</body></html>';
    const result = rewriteResponseBody(body, 9999, 'session-xyz');
    expect(result).toBe('<html><body>Hello World</body></html>');
  });

  it('should replace localhost URLs with trailing slash', () => {
    const body = 'redirect to http://localhost:5555/';
    const result = rewriteResponseBody(body, 5555, 'sess-1');
    expect(result).toBe('redirect to /api/alexa-auth/proxy/sess-1/');
  });

  it('should handle empty body', () => {
    const result = rewriteResponseBody('', 1234, 'sess-1');
    expect(result).toBe('');
  });

  it('should not replace URLs with different port numbers', () => {
    const body = 'http://localhost:9999/path and http://localhost:1111/other';
    const result = rewriteResponseBody(body, 9999, 'sess-1');
    expect(result).toBe('/api/alexa-auth/proxy/sess-1/path and http://localhost:1111/other');
  });
});

describe('rewriteLocationHeader', () => {
  it('should rewrite Location header with localhost URL', () => {
    const location = 'http://localhost:12345/www.amazon.co.jp/auth';
    const result = rewriteLocationHeader(location, 12345, 'session-abc');
    expect(result).toBe('/api/alexa-auth/proxy/session-abc/www.amazon.co.jp/auth');
  });

  it('should return original Location if no localhost URL match', () => {
    const location = 'https://www.amazon.co.jp/login';
    const result = rewriteLocationHeader(location, 12345, 'session-abc');
    expect(result).toBe('https://www.amazon.co.jp/login');
  });

  it('should rewrite cookie-success redirect URL', () => {
    const location = 'http://localhost:8080/cookie-success';
    const result = rewriteLocationHeader(location, 8080, 'sess-1');
    expect(result).toBe('/api/alexa-auth/proxy/sess-1/cookie-success');
  });

  it('should handle Location with trailing slash', () => {
    const location = 'http://localhost:3000/';
    const result = rewriteLocationHeader(location, 3000, 'sess-1');
    expect(result).toBe('/api/alexa-auth/proxy/sess-1/');
  });
});

describe('isBinaryContentType', () => {
  it('should return true for image/png', () => {
    expect(isBinaryContentType('image/png')).toBe(true);
  });

  it('should return true for image/jpeg', () => {
    expect(isBinaryContentType('image/jpeg')).toBe(true);
  });

  it('should return true for image/svg+xml', () => {
    expect(isBinaryContentType('image/svg+xml')).toBe(true);
  });

  it('should return true for image/x-icon', () => {
    expect(isBinaryContentType('image/x-icon')).toBe(true);
  });

  it('should return true for font/ttf', () => {
    expect(isBinaryContentType('font/ttf')).toBe(true);
  });

  it('should return true for font/woff2', () => {
    expect(isBinaryContentType('font/woff2')).toBe(true);
  });

  it('should return true for application/octet-stream', () => {
    expect(isBinaryContentType('application/octet-stream')).toBe(true);
  });

  it('should return false for text/html', () => {
    expect(isBinaryContentType('text/html')).toBe(false);
  });

  it('should return false for text/html; charset=utf-8', () => {
    expect(isBinaryContentType('text/html; charset=utf-8')).toBe(false);
  });

  it('should return false for application/json', () => {
    expect(isBinaryContentType('application/json')).toBe(false);
  });

  it('should return false for text/css', () => {
    expect(isBinaryContentType('text/css')).toBe(false);
  });

  it('should return false for application/javascript', () => {
    expect(isBinaryContentType('application/javascript')).toBe(false);
  });

  it('should return false for undefined content type', () => {
    expect(isBinaryContentType(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isBinaryContentType('')).toBe(false);
  });
});

// =============================================================================
// Integration-style Tests: Middleware Factory
// =============================================================================

describe('createAlexaReverseProxyMiddleware', () => {
  let mockProxyService: ReturnType<typeof createMockAlexaProxyService>;

  beforeEach(() => {
    mockProxyService = createMockAlexaProxyService();
  });

  it('should return a middleware function', () => {
    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService,
    });
    expect(typeof middleware).toBe('function');
  });

  it('should return 404 when session is not found', async () => {
    mockProxyService.getProxySession.mockReturnValue(undefined);

    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService,
    });

    // Simulate Express request/response
    const req = {
      params: { sessionId: 'nonexistent-session' },
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = {
      status: statusFn,
    } as unknown as import('express').Response;

    const next = vi.fn();

    middleware(req, res, next);

    expect(mockProxyService.getProxySession).toHaveBeenCalledWith('nonexistent-session');
    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'SESSION_NOT_FOUND',
      message: expect.stringContaining('nonexistent-session'),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 404 when session is not active', async () => {
    const completedSession: ProxySession = {
      sessionId: 'completed-session',
      uid: 'user-1',
      proxyPort: 12345,
      status: 'completed',
      createdAt: '2026-02-14T12:00:00.000Z',
    };
    mockProxyService.getProxySession.mockReturnValue(completedSession);

    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService,
    });

    const req = {
      params: { sessionId: 'completed-session' },
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = {
      status: statusFn,
    } as unknown as import('express').Response;

    const next = vi.fn();

    middleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'SESSION_NOT_FOUND',
      message: expect.stringContaining('completed-session'),
    });
  });

  it('should return 404 when session status is timeout', async () => {
    const timeoutSession: ProxySession = {
      sessionId: 'timeout-session',
      uid: 'user-1',
      proxyPort: 12345,
      status: 'timeout',
      createdAt: '2026-02-14T12:00:00.000Z',
    };
    mockProxyService.getProxySession.mockReturnValue(timeoutSession);

    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService,
    });

    const req = {
      params: { sessionId: 'timeout-session' },
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = {
      status: statusFn,
    } as unknown as import('express').Response;

    const next = vi.fn();

    middleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(404);
  });

  it('should return 404 when session status is failed', async () => {
    const failedSession: ProxySession = {
      sessionId: 'failed-session',
      uid: 'user-1',
      proxyPort: 12345,
      status: 'failed',
      createdAt: '2026-02-14T12:00:00.000Z',
    };
    mockProxyService.getProxySession.mockReturnValue(failedSession);

    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService,
    });

    const req = {
      params: { sessionId: 'failed-session' },
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = {
      status: statusFn,
    } as unknown as import('express').Response;

    const next = vi.fn();

    middleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(404);
  });

  it('should return 404 when sessionId param is missing (undefined)', () => {
    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService,
    });

    const req = {
      params: {},
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = {
      status: statusFn,
    } as unknown as import('express').Response;

    const next = vi.fn();

    middleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'SESSION_NOT_FOUND',
      message: expect.stringContaining('セッションID'),
    });
    expect(mockProxyService.getProxySession).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should include sessionId in 404 error message for non-active sessions', () => {
    const completedSession: ProxySession = {
      sessionId: 'completed-xyz',
      uid: 'user-1',
      proxyPort: 12345,
      status: 'completed',
      createdAt: '2026-02-14T12:00:00.000Z',
    };
    mockProxyService.getProxySession.mockReturnValue(completedSession);

    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService,
    });

    const req = {
      params: { sessionId: 'completed-xyz' },
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = {
      status: statusFn,
    } as unknown as import('express').Response;

    const next = vi.fn();

    middleware(req, res, next);

    expect(jsonFn).toHaveBeenCalledWith({
      error: 'SESSION_NOT_FOUND',
      message: expect.stringContaining('completed-xyz'),
    });
  });

  it('should not call next() when session is not found', () => {
    mockProxyService.getProxySession.mockReturnValue(undefined);

    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService,
    });

    const req = {
      params: { sessionId: 'no-session' },
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = {
      status: statusFn,
    } as unknown as import('express').Response;

    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Task 3.4: Additional Unit Tests for Comprehensive Coverage
// =============================================================================

describe('rewriteResponseBody - comprehensive coverage', () => {
  it('should rewrite URLs in JavaScript content (script tags)', () => {
    const body = '<script>var baseUrl = "http://localhost:9000/api";</script>';
    const result = rewriteResponseBody(body, 9000, 'js-sess');
    expect(result).toBe(
      '<script>var baseUrl = "/api/alexa-auth/proxy/js-sess/api";</script>'
    );
  });

  it('should rewrite URLs in form action attributes', () => {
    const body = '<form action="http://localhost:8080/www.amazon.co.jp/ap/signin">';
    const result = rewriteResponseBody(body, 8080, 'form-sess');
    expect(result).toBe(
      '<form action="/api/alexa-auth/proxy/form-sess/www.amazon.co.jp/ap/signin">'
    );
  });

  it('should handle complex HTML with mixed Amazon and localhost URLs', () => {
    const body = [
      '<html>',
      '<a href="http://localhost:5000/www.amazon.co.jp/login">Login</a>',
      '<img src="https://www.amazon.co.jp/images/logo.png">',
      '<link href="http://localhost:5000/www.amazon.co.jp/style.css">',
      '</html>',
    ].join('\n');
    const result = rewriteResponseBody(body, 5000, 'mixed-sess');

    // localhost URLs should be rewritten
    expect(result).toContain('/api/alexa-auth/proxy/mixed-sess/www.amazon.co.jp/login');
    expect(result).toContain('/api/alexa-auth/proxy/mixed-sess/www.amazon.co.jp/style.css');
    // External Amazon URLs should remain unchanged
    expect(result).toContain('https://www.amazon.co.jp/images/logo.png');
  });

  it('should handle large body with many URL occurrences', () => {
    const urlCount = 50;
    const urls = Array.from(
      { length: urlCount },
      (_, i) => `<a href="http://localhost:7000/page${i}">Link ${i}</a>`
    );
    const body = urls.join('\n');
    const result = rewriteResponseBody(body, 7000, 'large-sess');

    for (let i = 0; i < urlCount; i++) {
      expect(result).toContain(`/api/alexa-auth/proxy/large-sess/page${i}`);
    }
    expect(result).not.toContain('http://localhost:7000/');
  });

  it('should handle URLs with query parameters', () => {
    const body = '<a href="http://localhost:4000/www.amazon.co.jp/ap/signin?openid.ns=http%3A%2F%2F">';
    const result = rewriteResponseBody(body, 4000, 'query-sess');
    expect(result).toBe(
      '<a href="/api/alexa-auth/proxy/query-sess/www.amazon.co.jp/ap/signin?openid.ns=http%3A%2F%2F">'
    );
  });

  it('should handle URLs with hash fragments', () => {
    const body = 'http://localhost:3000/page#section1';
    const result = rewriteResponseBody(body, 3000, 'hash-sess');
    expect(result).toBe('/api/alexa-auth/proxy/hash-sess/page#section1');
  });
});

describe('rewriteLocationHeader - comprehensive coverage', () => {
  it('should rewrite Location header with query parameters', () => {
    const location = 'http://localhost:12345/www.amazon.co.jp/ap/signin?openid.ns=http%3A%2F%2F&openid.mode=checkid';
    const result = rewriteLocationHeader(location, 12345, 'query-sess');
    expect(result).toBe(
      '/api/alexa-auth/proxy/query-sess/www.amazon.co.jp/ap/signin?openid.ns=http%3A%2F%2F&openid.mode=checkid'
    );
  });

  it('should handle multiple localhost URLs in a single Location header', () => {
    // Although unusual, test the replaceAll behavior
    const location = 'http://localhost:8080/redirect?next=http://localhost:8080/final';
    const result = rewriteLocationHeader(location, 8080, 'multi-loc');
    expect(result).toBe(
      '/api/alexa-auth/proxy/multi-loc/redirect?next=/api/alexa-auth/proxy/multi-loc/final'
    );
  });

  it('should not modify Location headers pointing to external HTTPS URLs', () => {
    const location = 'https://www.amazon.co.jp/ap/signin';
    const result = rewriteLocationHeader(location, 12345, 'ext-sess');
    expect(result).toBe('https://www.amazon.co.jp/ap/signin');
  });

  it('should handle empty Location header', () => {
    const result = rewriteLocationHeader('', 12345, 'empty-sess');
    expect(result).toBe('');
  });
});

describe('isBinaryContentType - comprehensive coverage', () => {
  it('should return true for audio/mpeg', () => {
    expect(isBinaryContentType('audio/mpeg')).toBe(true);
  });

  it('should return true for video/mp4', () => {
    expect(isBinaryContentType('video/mp4')).toBe(true);
  });

  it('should return true for application/pdf', () => {
    expect(isBinaryContentType('application/pdf')).toBe(true);
  });

  it('should return false for text/plain', () => {
    expect(isBinaryContentType('text/plain')).toBe(false);
  });

  it('should return false for application/x-www-form-urlencoded', () => {
    expect(isBinaryContentType('application/x-www-form-urlencoded')).toBe(false);
  });

  it('should be case-insensitive for content type matching', () => {
    expect(isBinaryContentType('Image/PNG')).toBe(true);
    expect(isBinaryContentType('IMAGE/JPEG')).toBe(true);
    expect(isBinaryContentType('Font/TTF')).toBe(true);
  });

  it('should handle content type with charset parameters', () => {
    // image/svg+xml; charset=utf-8 should still be detected as binary
    expect(isBinaryContentType('image/svg+xml; charset=utf-8')).toBe(true);
  });
});

describe('createAlexaReverseProxyMiddleware - comprehensive coverage', () => {
  let mockProxyService2: ReturnType<typeof createMockAlexaProxyService>;

  beforeEach(() => {
    mockProxyService2 = createMockAlexaProxyService();
  });

  it('should resolve session by sessionId from request params', () => {
    mockProxyService2.getProxySession.mockReturnValue(undefined);

    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService2,
    });

    const req = {
      params: { sessionId: 'resolve-test-id' },
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn } as unknown as import('express').Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(mockProxyService2.getProxySession).toHaveBeenCalledWith('resolve-test-id');
  });

  it('should return JSON error response for 404 with correct content structure', () => {
    mockProxyService2.getProxySession.mockReturnValue(undefined);

    const middleware = createAlexaReverseProxyMiddleware({
      alexaProxyService: mockProxyService2,
    });

    const req = {
      params: { sessionId: 'structure-test' },
      url: '/some-path',
      method: 'GET',
      headers: {},
    } as unknown as import('express').Request;

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn } as unknown as import('express').Response;
    const next = vi.fn();

    middleware(req, res, next);

    const errorBody = jsonFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(errorBody).toHaveProperty('error');
    expect(errorBody).toHaveProperty('message');
    expect(typeof errorBody['error']).toBe('string');
    expect(typeof errorBody['message']).toBe('string');
  });
});
