/**
 * Credential Handler
 *
 * Express routes for IoT credential management API endpoints.
 * All endpoints require authentication (Require Auth guard applied externally).
 * Uses req.user.uid for user isolation — each user can only access their own credentials.
 *
 * Endpoints:
 * - PUT /api/credentials/:service — Save token (with empty string validation)
 * - GET /api/credentials/status — Get all credential statuses (no raw token values)
 * - DELETE /api/credentials/:service — Delete a specific credential
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 7.4
 */
import { Router, type Request, type Response } from 'express';
import type { CredentialService } from '../services/credential-service.js';
import type { AuthenticatedUser } from '../types/auth-types.js';
import { sanitizeErrorMessage } from '../config/error-utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Dependencies for credential routes.
 */
export interface CredentialRouteDependencies {
  readonly credentialService: CredentialService;
}

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

/**
 * Validate the token field from the request body.
 * Returns the trimmed token string if valid, or null if invalid.
 */
function validateToken(
  body: unknown
): { valid: true; token: string } | { valid: false } {
  if (body === null || body === undefined || typeof body !== 'object') {
    return { valid: false };
  }

  const token = (body as Record<string, unknown>)['token'];

  if (typeof token !== 'string') {
    return { valid: false };
  }

  if (token.trim() === '') {
    return { valid: false };
  }

  return { valid: true, token };
}

// =============================================================================
// Route Factory
// =============================================================================

/**
 * Create Express router with credential management API routes.
 *
 * @param deps - Dependencies including CredentialService
 * @returns Express Router with credential endpoints
 */
export function createCredentialRoutes(
  deps: CredentialRouteDependencies
): Router {
  const { credentialService } = deps;
  const router = Router();

  /**
   * PUT /:service
   * Save a token for the specified service.
   * Validates that token is a non-empty string.
   * Requirements: 4.1, 7.4
   */
  router.put('/:service', async (req: Request, res: Response): Promise<void> => {
    try {
      const uid = getUserUid(req);
      const service = req.params['service']!;

      // Validate token input
      const validation = validateToken(req.body);
      if (!validation.valid) {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'トークンは空でない文字列で指定してください。',
        });
        return;
      }

      const result = await credentialService.saveToken(uid, service, validation.token);

      if (!result.ok) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'クレデンシャルの保存に失敗しました。',
        });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message:
          sanitizeErrorMessage(error),
      });
    }
  });

  /**
   * GET /status
   * Get credential configuration status for all services.
   * Does NOT return raw token values (Requirement 7.4).
   * Requirements: 4.2, 7.4
   */
  router.get('/status', async (req: Request, res: Response): Promise<void> => {
    try {
      const uid = getUserUid(req);

      const result = await credentialService.getStatus(uid);

      if (!result.ok) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'クレデンシャルステータスの取得に失敗しました。',
        });
        return;
      }

      res.json({ credentials: result.value });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message:
          sanitizeErrorMessage(error),
      });
    }
  });

  /**
   * DELETE /:service
   * Delete the credential for the specified service.
   * Requirements: 4.3
   */
  router.delete('/:service', async (req: Request, res: Response): Promise<void> => {
    try {
      const uid = getUserUid(req);
      const service = req.params['service']!;

      const result = await credentialService.deleteToken(uid, service);

      if (!result.ok) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'クレデンシャルの削除に失敗しました。',
        });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message:
          sanitizeErrorMessage(error),
      });
    }
  });

  return router;
}
