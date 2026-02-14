/**
 * Alexa Reverse Proxy Middleware
 *
 * Express middleware that reverse-proxies requests from
 * /api/alexa-auth/proxy/:sessionId/* to the internal alexa-cookie2 proxy
 * running on localhost:{proxyPort}.
 *
 * Features:
 * - Session resolution: sessionId -> proxyPort via AlexaProxyService
 * - Path prefix removal: strips /api/alexa-auth/proxy/:sessionId from path
 * - Response body URL rewriting: replaces http://localhost:{port}/ with
 *   /api/alexa-auth/proxy/{sessionId}/ for HTML/text responses
 * - Location header rewriting for 3xx redirects
 * - Binary response passthrough (no body rewriting for images, fonts, etc.)
 * - Automatic gzip/brotli/deflate decompression via responseInterceptor
 *
 * Requirements: 1.2, 1.5
 * Task: 3.2
 */
import type http from 'node:http';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import type { AlexaProxyService } from '../types/alexa-proxy-types.js';

// =============================================================================
// Constants
// =============================================================================

/** Public proxy URL path prefix template */
const PROXY_PATH_PREFIX = '/api/alexa-auth/proxy';

/** Content types that should NOT have body rewriting applied */
const BINARY_CONTENT_TYPE_PREFIXES: readonly string[] = [
  'image/',
  'font/',
  'application/octet-stream',
  'application/pdf',
  'audio/',
  'video/',
];

// =============================================================================
// Types
// =============================================================================

/**
 * Dependencies for creating the Alexa reverse proxy middleware.
 */
export interface AlexaReverseProxyDependencies {
  readonly alexaProxyService: AlexaProxyService;
}

// =============================================================================
// Pure Helper Functions (exported for unit testing)
// =============================================================================

/**
 * Rewrite response body by replacing internal localhost proxy URLs
 * with the public-facing reverse proxy path.
 *
 * Replaces: http://localhost:{proxyPort}/ -> /api/alexa-auth/proxy/{sessionId}/
 *
 * @param body - The response body string
 * @param proxyPort - The internal proxy port number
 * @param sessionId - The proxy session ID
 * @returns The rewritten body string
 */
export function rewriteResponseBody(
  body: string,
  proxyPort: number,
  sessionId: string
): string {
  if (body === '') {
    return body;
  }

  const localhostUrl = `http://localhost:${proxyPort}/`;
  const publicPath = `${PROXY_PATH_PREFIX}/${sessionId}/`;

  return body.replaceAll(localhostUrl, publicPath);
}

/**
 * Rewrite a Location header value by replacing internal localhost proxy URLs
 * with the public-facing reverse proxy path.
 *
 * @param location - The Location header value
 * @param proxyPort - The internal proxy port number
 * @param sessionId - The proxy session ID
 * @returns The rewritten Location header value
 */
export function rewriteLocationHeader(
  location: string,
  proxyPort: number,
  sessionId: string
): string {
  const localhostUrl = `http://localhost:${proxyPort}/`;
  const publicPath = `${PROXY_PATH_PREFIX}/${sessionId}/`;

  return location.replaceAll(localhostUrl, publicPath);
}

/**
 * Determine if a Content-Type header indicates binary content
 * that should NOT have body URL rewriting applied.
 *
 * @param contentType - The Content-Type header value (may be undefined)
 * @returns true if the content type is binary
 */
export function isBinaryContentType(contentType: string | undefined): boolean {
  if (!contentType || contentType === '') {
    return false;
  }

  const lowerType = contentType.toLowerCase();
  return BINARY_CONTENT_TYPE_PREFIXES.some((prefix) =>
    lowerType.startsWith(prefix)
  );
}

// =============================================================================
// Middleware Factory
// =============================================================================

/**
 * Create Express middleware for Alexa reverse proxy.
 *
 * This middleware handles ALL /api/alexa-auth/proxy/:sessionId/* requests by:
 * 1. Resolving sessionId to an active ProxySession
 * 2. Forwarding the request to http://localhost:{proxyPort}/
 * 3. Rewriting response body and Location headers
 *
 * @param deps - Dependencies including AlexaProxyService
 * @returns Express middleware function
 */
export function createAlexaReverseProxyMiddleware(
  deps: AlexaReverseProxyDependencies
): RequestHandler {
  const { alexaProxyService } = deps;

  /**
   * Pre-check middleware that validates the session before proxying.
   * Returns 404 if session not found or not active.
   * If session is valid, attaches proxyPort and sessionId to req for the proxy.
   */
  return (req: Request, res: Response, next: NextFunction): void => {
    const sessionId = req.params['sessionId'];

    if (!sessionId) {
      res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: 'セッションIDが指定されていません。',
      });
      return;
    }

    const session = alexaProxyService.getProxySession(sessionId);

    if (!session || session.status !== 'active') {
      res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: `アクティブなProxyセッションが見つかりません: ${sessionId}`,
      });
      return;
    }

    const { proxyPort } = session;

    // Create a per-request proxy middleware using http-proxy-middleware
    // Explicit generic types needed to match responseInterceptor return type
    const proxyMiddleware = createProxyMiddleware<http.IncomingMessage, http.ServerResponse>({
      target: `http://localhost:${proxyPort}`,
      changeOrigin: true,
      selfHandleResponse: true,
      // Remove the /api/alexa-auth/proxy/:sessionId prefix from the path
      pathRewrite: {
        [`^${PROXY_PATH_PREFIX}/${sessionId}`]: '',
      },
      on: {
        proxyRes: responseInterceptor(
          async (responseBuffer, proxyRes, _req, proxyResResponse) => {
            const contentType = proxyRes.headers['content-type'];

            // Rewrite Location header for redirects (3xx)
            const locationHeader = proxyRes.headers['location'];
            if (locationHeader) {
              const rewrittenLocation = rewriteLocationHeader(
                locationHeader,
                proxyPort,
                sessionId
              );
              (proxyResResponse as Response).setHeader(
                'location',
                rewrittenLocation
              );
            }

            // Skip body rewriting for binary responses
            if (isBinaryContentType(contentType)) {
              return responseBuffer;
            }

            // Rewrite body for text responses
            const body = responseBuffer.toString('utf8');
            const rewrittenBody = rewriteResponseBody(
              body,
              proxyPort,
              sessionId
            );
            return rewrittenBody;
          }
        ),
        error: (err: Error, _req: unknown, res: unknown) => {
          console.error(
            `[AlexaReverseProxy] Proxy error for session ${sessionId}:`,
            err.message
          );
          const expressRes = res as Response;
          if (!expressRes.headersSent) {
            expressRes.status(502).json({
              error: 'PROXY_UNAVAILABLE',
              message: '内部Proxyサーバーに接続できません。',
            });
          }
        },
      },
    });

    // Forward to the proxy middleware
    proxyMiddleware(req, res, next);
  };
}
