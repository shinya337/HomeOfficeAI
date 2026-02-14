/**
 * Optional Auth Middleware
 *
 * Firebase ID token verification middleware for Express.
 * Implements optional authentication (guest mode passthrough)
 * and required authentication guard.
 *
 * - Optional: Extracts Bearer token, verifies with Firebase Admin SDK.
 *   Sets req.user to AuthenticatedUser or null (guest mode).
 * - Required: Rejects requests where req.user is null with 401.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { AuthenticatedUser } from '../types/auth-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Auth middleware factory interface.
 * Creates middleware functions for optional and required authentication.
 */
export interface AuthMiddlewareFactory {
  createOptionalAuthMiddleware(): RequestHandler;
  createRequireAuthMiddleware(): RequestHandler;
}

// =============================================================================
// Constants
// =============================================================================

/** Firebase Auth error code for expired ID tokens */
const TOKEN_EXPIRED_CODE = 'auth/id-token-expired';

/** Bearer token prefix in Authorization header */
const BEARER_PREFIX = 'Bearer ';

// =============================================================================
// Implementation
// =============================================================================

/**
 * Extract Bearer token from Authorization header.
 *
 * @param authorizationHeader - The Authorization header value
 * @returns The token string, or null if no valid Bearer token found
 */
function extractBearerToken(
  authorizationHeader: string | undefined
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  if (token === '') {
    return null;
  }

  return token;
}

/**
 * Create auth middleware factory with Firebase Admin Auth dependency.
 *
 * @param auth - Firebase Admin Auth instance for token verification
 * @returns AuthMiddlewareFactory with optional and required auth middleware creators
 */
export function createAuthMiddleware(auth: Auth): AuthMiddlewareFactory {
  function createOptionalAuthMiddleware(): RequestHandler {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      const token = extractBearerToken(req.headers.authorization);

      // No token: guest mode
      if (token === null) {
        (req as unknown as { user: AuthenticatedUser | null }).user = null;
        next();
        return;
      }

      // Token present: verify with Firebase Admin SDK
      try {
        const decodedToken = await auth.verifyIdToken(token);

        const user: AuthenticatedUser = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          displayName: decodedToken.name as string | undefined,
          photoURL: decodedToken.picture as string | undefined,
        };

        (req as unknown as { user: AuthenticatedUser | null }).user = user;
        next();
      } catch (error) {
        // Determine error type based on Firebase Auth error code
        const firebaseError = error as { code?: string; message?: string };
        const isExpired = firebaseError.code === TOKEN_EXPIRED_CODE;

        res.status(401).json({
          error: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          message: isExpired
            ? 'IDトークンの有効期限が切れています。再ログインしてください。'
            : 'IDトークンが無効です。',
        });
      }
    };
  }

  function createRequireAuthMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      const user = (req as unknown as { user: AuthenticatedUser | null }).user;

      if (user === null || user === undefined) {
        res.status(401).json({
          error: 'AUTH_REQUIRED',
          message: 'このエンドポイントには認証が必要です。',
        });
        return;
      }

      next();
    };
  }

  return {
    createOptionalAuthMiddleware,
    createRequireAuthMiddleware,
  };
}
