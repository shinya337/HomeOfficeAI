/**
 * Error Utilities
 *
 * Sanitize error messages to prevent internal information leakage in production.
 * In development/test environments, return the actual error message for debugging.
 */

/**
 * Return a sanitized error message suitable for client-facing responses.
 *
 * - Production: always returns a generic Japanese error message
 * - Development/Test: returns the actual error message for debugging
 *
 * @param error - The caught error value (may be Error instance or any thrown value)
 * @returns A safe error message string
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (process.env['NODE_ENV'] === 'production') {
    return 'サーバー内部エラーが発生しました。';
  }
  return error instanceof Error ? error.message : String(error);
}
