/**
 * Rate Limit Monitor Tests
 *
 * TDD tests for RateLimitMonitor component.
 * Requirements: 6.1, 6.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RateLimitMonitor,
  createRateLimitMonitor,
  type RateLimitInfo,
} from './rate-limit-monitor.js';

describe('RateLimitMonitor', () => {
  let monitor: RateLimitMonitor;

  beforeEach(() => {
    monitor = createRateLimitMonitor();
    vi.restoreAllMocks();
  });

  describe('updateFromHeaders', () => {
    it('should extract X-Rate-Limit-Limit header', () => {
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '25',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);
      const info = monitor.getRateLimitInfo();

      expect(info.limit).toBe(30);
    });

    it('should extract X-Rate-Limit-Remaining header', () => {
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '15',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);
      const info = monitor.getRateLimitInfo();

      expect(info.remaining).toBe(15);
    });

    it('should extract X-Rate-Limit-Reset header as Date', () => {
      const resetTimestamp = 1706000000;
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '20',
        'X-Rate-Limit-Reset': String(resetTimestamp),
      });

      monitor.updateFromHeaders(headers);
      const info = monitor.getRateLimitInfo();

      expect(info.resetAt).toBeInstanceOf(Date);
      expect(info.resetAt.getTime()).toBe(resetTimestamp * 1000);
    });

    it('should handle missing headers gracefully', () => {
      const headers = new Headers({});

      monitor.updateFromHeaders(headers);
      const info = monitor.getRateLimitInfo();

      // Default values when headers are missing
      expect(info.limit).toBe(30); // Default Nature Remo limit
      expect(info.remaining).toBe(30);
    });

    it('should update values on subsequent calls', () => {
      const headers1 = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '29',
        'X-Rate-Limit-Reset': '1706000000',
      });
      const headers2 = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '28',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers1);
      expect(monitor.getRateLimitInfo().remaining).toBe(29);

      monitor.updateFromHeaders(headers2);
      expect(monitor.getRateLimitInfo().remaining).toBe(28);
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return current rate limit information', () => {
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '20',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);
      const info = monitor.getRateLimitInfo();

      expect(info).toEqual<RateLimitInfo>({
        limit: 30,
        remaining: 20,
        resetAt: new Date(1706000000 * 1000),
      });
    });

    it('should return default values before any headers are received', () => {
      const info = monitor.getRateLimitInfo();

      expect(info.limit).toBe(30);
      expect(info.remaining).toBe(30);
      expect(info.resetAt).toBeInstanceOf(Date);
    });
  });

  describe('isNearLimit', () => {
    it('should return true when remaining is below default threshold (10)', () => {
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '5',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);

      expect(monitor.isNearLimit()).toBe(true);
    });

    it('should return false when remaining is above default threshold', () => {
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '15',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);

      expect(monitor.isNearLimit()).toBe(false);
    });

    it('should return true when remaining equals threshold', () => {
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '10',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);

      expect(monitor.isNearLimit()).toBe(true);
    });

    it('should support custom threshold', () => {
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '15',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);

      expect(monitor.isNearLimit(15)).toBe(true);
      expect(monitor.isNearLimit(14)).toBe(false);
    });
  });

  describe('warning log output (Requirement 6.5)', () => {
    it('should log warning when remaining requests are low', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '5',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('5');
    });

    it('should not log warning when remaining requests are sufficient', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '20',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log remaining count on each update (Requirement 6.5)', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '20',
        'X-Rate-Limit-Reset': '1706000000',
      });

      monitor.updateFromHeaders(headers);

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('20');
    });
  });

  describe('getResetTimeRemaining (Requirement 6.1)', () => {
    it('should return seconds until rate limit reset', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '0',
        'X-Rate-Limit-Reset': String(futureTime),
      });

      monitor.updateFromHeaders(headers);
      const secondsRemaining = monitor.getResetTimeRemaining();

      // Allow for small timing differences
      expect(secondsRemaining).toBeGreaterThan(290);
      expect(secondsRemaining).toBeLessThanOrEqual(300);
    });

    it('should return 0 when reset time has passed', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      const headers = new Headers({
        'X-Rate-Limit-Limit': '30',
        'X-Rate-Limit-Remaining': '0',
        'X-Rate-Limit-Reset': String(pastTime),
      });

      monitor.updateFromHeaders(headers);
      const secondsRemaining = monitor.getResetTimeRemaining();

      expect(secondsRemaining).toBe(0);
    });
  });
});
