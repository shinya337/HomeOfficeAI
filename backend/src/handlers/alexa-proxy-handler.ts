/**
 * Alexa Proxy Handler
 *
 * Express routes for Alexa Proxy authentication API endpoints.
 * All endpoints require authentication (Require Auth guard applied externally).
 * Uses req.user.uid for user isolation -- each user can only access their own sessions.
 *
 * Endpoints:
 * - POST /start -- Start a new proxy authentication session
 * - GET /status/:sessionId -- Poll session status (active/completed/failed/timeout)
 *
 * Requirements: 1.1, 5.3, 5.5
 * Task: 3.1
 */
import { Router, type Request, type Response } from 'express';
import type { AlexaProxyService, AlexaProxyErrorCode } from '../types/alexa-proxy-types.js';
import type { AuthenticatedUser } from '../types/auth-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Dependencies for Alexa proxy routes.
 */
export interface AlexaProxyRouteDependencies {
  readonly alexaProxyService: AlexaProxyService;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Map AlexaProxyErrorCode to HTTP status codes.
 */
const ERROR_STATUS_MAP: Record<AlexaProxyErrorCode, number> = {
  SESSION_ALREADY_ACTIVE: 409,
  SESSION_NOT_FOUND: 404,
  PROXY_START_FAILED: 500,
  SAVE_FAILED: 500,
  TIMEOUT: 500,
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract the authenticated user's UID from the request.
 * Assumes requireAuth middleware has already verified the user is authenticated.
 *
 * @returns The user's UID
 */
function getUserUid(req: Request): string {
  const user = (req as unknown as { user: AuthenticatedUser }).user;
  return user.uid;
}

// =============================================================================
// Route Factory
// =============================================================================

/**
 * Create Express router with Alexa Proxy authentication API routes.
 *
 * @param deps - Dependencies including AlexaProxyService
 * @returns Express Router with proxy auth endpoints
 */
export function createAlexaProxyRoutes(
  deps: AlexaProxyRouteDependencies
): Router {
  const { alexaProxyService } = deps;
  const router = Router();

  /**
   * POST /start
   * Start a new Alexa Proxy authentication session.
   * Returns sessionId and proxyUrl for the popup window.
   * Requirements: 1.1, 5.3
   */
  router.post('/start', async (req: Request, res: Response): Promise<void> => {
    try {
      const uid = getUserUid(req);

      const result = await alexaProxyService.startProxySession(uid);

      if (!result.ok) {
        const statusCode = ERROR_STATUS_MAP[result.error.code];
        res.status(statusCode).json({
          error: result.error.code,
          message: result.error.message,
        });
        return;
      }

      const { sessionId } = result.value;
      res.json({
        sessionId,
        proxyUrl: `/api/alexa-auth/proxy/${sessionId}/`,
      });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message:
          error instanceof Error ? error.message : 'サーバー内部エラーが発生しました。',
      });
    }
  });

  /**
   * GET /status/:sessionId
   * Poll the status of a proxy authentication session.
   * Returns status and completed flag for frontend polling.
   * Verifies session ownership (rejects access to other user's sessions).
   * Requirements: 5.3, 5.5
   */
  router.get('/status/:sessionId', (req: Request, res: Response): void => {
    const uid = getUserUid(req);
    const sessionId = req.params['sessionId']!;

    const session = alexaProxyService.getProxySession(sessionId);

    if (!session) {
      res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: `Proxyセッションが見つかりません: ${sessionId}`,
      });
      return;
    }

    // Verify session ownership
    if (session.uid !== uid) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: '他のユーザーのセッションにはアクセスできません。',
      });
      return;
    }

    res.json({
      status: session.status,
      completed: session.status === 'completed',
    });
  });

  return router;
}
