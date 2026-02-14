/**
 * Rate Limit Monitor for Nature Remo Cloud API
 *
 * Monitors API response headers to track rate limit status.
 * Provides warnings when approaching the limit.
 *
 * Requirements: 6.1, 6.5
 *
 * Nature Remo API Rate Limit:
 * - 30 requests per 5 minutes
 * - Headers: X-Rate-Limit-Limit, X-Rate-Limit-Remaining, X-Rate-Limit-Reset
 */

import type { RateLimitInfo } from '../types/types.js';

// Re-export for backward compatibility
export type { RateLimitInfo } from '../types/types.js';

/**
 * Rate limit monitor interface.
 * Tracks API rate limits from response headers.
 */
export interface RateLimitMonitor {
  /**
   * Update rate limit state from API response headers.
   * Logs a warning if remaining requests are below threshold.
   *
   * @param headers - Response headers from API call
   */
  updateFromHeaders(headers: Headers): void;

  /**
   * Get current rate limit information.
   *
   * @returns Current rate limit state
   */
  getRateLimitInfo(): RateLimitInfo;

  /**
   * Check if remaining requests are near the limit.
   *
   * @param threshold - Number of requests to consider "near limit" (default: 10)
   * @returns true if remaining <= threshold
   */
  isNearLimit(threshold?: number): boolean;

  /**
   * Get seconds remaining until rate limit reset.
   *
   * @returns Seconds until reset, or 0 if reset time has passed
   */
  getResetTimeRemaining(): number;
}

/** Default rate limit for Nature Remo API */
const DEFAULT_LIMIT = 30;

/** Default threshold for warning logs */
const DEFAULT_WARNING_THRESHOLD = 10;

/**
 * Create a new rate limit monitor instance.
 *
 * @returns RateLimitMonitor instance
 */
export function createRateLimitMonitor(): RateLimitMonitor {
  // Internal state
  let limit = DEFAULT_LIMIT;
  let remaining = DEFAULT_LIMIT;
  let resetAt = new Date();

  const updateFromHeaders = (headers: Headers): void => {
    const limitHeader = headers.get('X-Rate-Limit-Limit');
    const remainingHeader = headers.get('X-Rate-Limit-Remaining');
    const resetHeader = headers.get('X-Rate-Limit-Reset');

    if (limitHeader !== null) {
      const parsedLimit = parseInt(limitHeader, 10);
      if (!isNaN(parsedLimit)) {
        limit = parsedLimit;
      }
    }

    if (remainingHeader !== null) {
      const parsedRemaining = parseInt(remainingHeader, 10);
      if (!isNaN(parsedRemaining)) {
        remaining = parsedRemaining;
      }
    }

    if (resetHeader !== null) {
      const parsedReset = parseInt(resetHeader, 10);
      if (!isNaN(parsedReset)) {
        // API returns Unix timestamp in seconds
        resetAt = new Date(parsedReset * 1000);
      }
    }

    // Log remaining count on each update (Requirement 6.5)
    console.log(`[RateLimit] Remaining requests: ${remaining}/${limit}`);

    // Warn if near limit (Requirement 6.5)
    if (remaining <= DEFAULT_WARNING_THRESHOLD) {
      const resetSeconds = getResetTimeRemaining();
      console.warn(
        `[RateLimit] Warning: Only ${remaining} requests remaining. ` +
          `Reset in ${resetSeconds} seconds.`
      );
    }
  };

  const getRateLimitInfo = (): RateLimitInfo => {
    return {
      limit,
      remaining,
      resetAt,
    };
  };

  const isNearLimit = (threshold: number = DEFAULT_WARNING_THRESHOLD): boolean => {
    return remaining <= threshold;
  };

  const getResetTimeRemaining = (): number => {
    const now = Date.now();
    const resetTime = resetAt.getTime();
    const diff = resetTime - now;
    return Math.max(0, Math.floor(diff / 1000));
  };

  return {
    updateFromHeaders,
    getRateLimitInfo,
    isNearLimit,
    getResetTimeRemaining,
  };
}
