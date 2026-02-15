/**
 * Analyze Handler
 *
 * Express routes for analyze API endpoint.
 * Requirements: 3.1, 3.3, 3.4, 4.3, 4.4, 6.5
 *
 * Endpoints:
 * - POST /api/analyze - Analyze an image and execute appropriate action
 */
import { Router, Request, Response } from 'express';
import type { SessionManagerService } from '../services/session-manager.js';
import type { AnalyzeHandlerService } from '../services/analyze-handler.js';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ErrorResponse,
  ImageData,
} from '../types/api-types.js';
import { ErrorCodes, Intervals, ToolNames } from '../types/api-types.js';
import { sanitizeErrorMessage } from '../config/error-utils.js';

/**
 * Dependencies for the analyze routes
 */
export interface AnalyzeHandlerDependencies {
  readonly sessionManager: SessionManagerService;
  readonly analyzeHandler: AnalyzeHandlerService;
}

/**
 * Validate the analyze request body
 * @returns Error message if invalid, null if valid
 */
function validateAnalyzeRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  const request = body as Record<string, unknown>;

  if (!request.image) {
    return 'image field is required';
  }

  if (typeof request.image !== 'object' || request.image === null) {
    return 'image must be an object';
  }

  const image = request.image as Record<string, unknown>;

  if (typeof image.base64 !== 'string') {
    return 'image.base64 is required and must be a string';
  }

  if (image.base64.length === 0) {
    return 'image.base64 cannot be empty';
  }

  if (typeof image.mimeType !== 'string') {
    return 'image.mimeType is required and must be a string';
  }

  return null;
}

/**
 * Create fallback response for AI/IoT errors
 */
function createFallbackResponse(errorCode: string, errorMessage: string): AnalyzeResponse {
  const fallbackAction = {
    tool: ToolNames.DO_NOTHING,
    params: {},
  };
  const fallbackResult = {
    executed: false,
    message: 'Fallback to do_nothing due to error',
  };
  return {
    success: true,
    action: fallbackAction,
    result: fallbackResult,
    actions: [fallbackAction],
    results: [fallbackResult],
    nextIntervalMs: Intervals.DEFAULT,
    error: {
      code: errorCode,
      message: errorMessage,
    },
  };
}

/**
 * Create Express router with analyze API route
 *
 * @param deps - Dependencies for the handler
 * @returns Express Router with analyze endpoint
 */
export function createAnalyzeRoutes(deps: AnalyzeHandlerDependencies): Router {
  const router = Router();
  const { sessionManager, analyzeHandler } = deps;

  /**
   * POST /api/analyze
   * Analyze an image and execute appropriate action
   * Requirements: 3.1, 3.3, 3.4, 4.3, 4.4, 6.5
   */
  router.post('/analyze', async (req: Request, res: Response) => {
    try {
      // Step 1: Check for active session (Req 6.5)
      if (!sessionManager.hasActiveSession()) {
        const errorResponse: ErrorResponse = {
          error: {
            code: ErrorCodes.NO_ACTIVE_SESSION,
            message: 'No active session. Start a session before analyzing.',
          },
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Step 1.5: Validate sessionId if provided (Task 6.3)
      const requestBody = req.body as Record<string, unknown>;
      const requestSessionId = typeof requestBody.sessionId === 'string' ? requestBody.sessionId : undefined;
      if (requestSessionId !== undefined && sessionManager.getSession(requestSessionId) === undefined) {
        const errorResponse: ErrorResponse = {
          error: {
            code: ErrorCodes.NO_ACTIVE_SESSION,
            message: `Session not found: ${requestSessionId}`,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Step 2: Validate request body
      const validationError = validateAnalyzeRequest(req.body);
      if (validationError !== null) {
        const errorResponse: ErrorResponse = {
          error: {
            code: ErrorCodes.INVALID_REQUEST,
            message: validationError,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }

      const analyzeRequest = req.body as AnalyzeRequest;
      const imageData: ImageData = {
        base64: analyzeRequest.image.base64,
        mimeType: analyzeRequest.image.mimeType,
      };

      // Step 3: Call analyze handler with optional sessionId (Task 6.3)
      const sessionId = analyzeRequest.sessionId;
      const result = await analyzeHandler.analyze(imageData, sessionId);

      // Step 4: Handle result
      if (!result.ok) {
        // AI or IoT error - return fallback do_nothing response (Req 3.4)
        console.error(`[Analyze] Error: ${result.error.code} - ${result.error.message}`);
        const fallbackResponse = createFallbackResponse(
          result.error.code,
          result.error.message
        );
        res.json(fallbackResponse);
        return;
      }

      // Step 5: Format successful response（並列Function Calling対応）
      const analyzeResponse: AnalyzeResponse = {
        success: true,
        action: {
          tool: result.value.action.tool,
          params: result.value.action.params,
        },
        result: {
          executed: result.value.actionResult.executed,
          message: result.value.actionResult.message,
          ...(result.value.actionResult.speechTexts ? { speechTexts: result.value.actionResult.speechTexts } : {}),
        },
        actions: result.value.actions.map(a => ({ tool: a.tool, params: a.params })),
        results: result.value.actionResults.map(r => ({
          executed: r.executed,
          message: r.message,
          ...(r.speechTexts ? { speechTexts: r.speechTexts } : {}),
        })),
        nextIntervalMs: result.value.nextIntervalMs,
      };

      // Include device state if available
      if (result.value.deviceState) {
        (analyzeResponse as { deviceState?: unknown }).deviceState = {
          light: result.value.deviceState.light
            ? { power: result.value.deviceState.light.power }
            : null,
          aircon: result.value.deviceState.aircon
            ? {
                temperature: result.value.deviceState.aircon.temperature,
                mode: result.value.deviceState.aircon.mode,
              }
            : null,
          alexa: result.value.deviceState.alexa ?? null,
        };
      }

      res.json(analyzeResponse);
    } catch (error) {
      // Internal error - return 500
      const errorResponse: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: sanitizeErrorMessage(error),
        },
      };
      res.status(500).json(errorResponse);
    }
  });

  return router;
}
