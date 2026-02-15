/**
 * Preferences Handler
 *
 * Express routes for user preferences API endpoints.
 * All endpoints require authentication (Require Auth guard applied externally).
 * Uses req.user.uid for user isolation.
 *
 * Endpoints:
 * - PUT /api/preferences — Save user preferences (camera, voice, selectedDevices)
 * - GET /api/preferences — Get user preferences
 */
import { Router, type Request, type Response } from 'express';
import type { PreferencesService } from '../services/preferences-service.js';
import type { AuthenticatedUser } from '../types/auth-types.js';

// =============================================================================
// Types
// =============================================================================

export interface PreferencesRouteDependencies {
  readonly preferencesService: PreferencesService;
}

// =============================================================================
// Helpers
// =============================================================================

function getUserUid(req: Request): string {
  const user = (req as unknown as { user: AuthenticatedUser }).user;
  return user.uid;
}

/**
 * Validate preferences body.
 * camera and voice must be booleans, selectedDevices must be an array.
 */
function validatePreferences(
  body: unknown
): { valid: true; camera: boolean; voice: boolean; selectedDevices: unknown[] } | { valid: false } {
  if (body === null || body === undefined || typeof body !== 'object') {
    return { valid: false };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj['camera'] !== 'boolean') {
    return { valid: false };
  }

  if (typeof obj['voice'] !== 'boolean') {
    return { valid: false };
  }

  if (!Array.isArray(obj['selectedDevices'])) {
    return { valid: false };
  }

  return {
    valid: true,
    camera: obj['camera'],
    voice: obj['voice'],
    selectedDevices: obj['selectedDevices'],
  };
}

// =============================================================================
// Route Factory
// =============================================================================

export function createPreferencesRoutes(
  deps: PreferencesRouteDependencies
): Router {
  const { preferencesService } = deps;
  const router = Router();

  /**
   * PUT /
   * Save user preferences.
   */
  router.put('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const uid = getUserUid(req);

      const validation = validatePreferences(req.body);
      if (!validation.valid) {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'camera (boolean), voice (boolean), selectedDevices (array) は必須です。',
        });
        return;
      }

      const result = await preferencesService.savePreferences(uid, {
        camera: validation.camera,
        voice: validation.voice,
        selectedDevices: validation.selectedDevices.map((d: unknown) => {
          const device = d as Record<string, unknown>;
          return {
            id: String(device['id'] ?? ''),
            ...(typeof device['name'] === 'string' ? { name: device['name'] } : {}),
            type: String(device['type'] ?? ''),
            ...(Array.isArray(device['allowedTools']) ? { allowedTools: device['allowedTools'] as string[] } : {}),
          };
        }),
      });

      if (!result.ok) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: '設定の保存に失敗しました。',
        });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message:
          error instanceof Error ? error.message : 'サーバー内部エラーが発生しました。',
      });
    }
  });

  /**
   * GET /
   * Get user preferences.
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const uid = getUserUid(req);

      const result = await preferencesService.getPreferences(uid);

      if (!result.ok) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: '設定の取得に失敗しました。',
        });
        return;
      }

      res.json({ preferences: result.value });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message:
          error instanceof Error ? error.message : 'サーバー内部エラーが発生しました。',
      });
    }
  });

  return router;
}
