/**
 * Tests for Nature Remo API Client
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNatureRemoClient } from './nature-remo-client.js';
import type { RateLimitMonitor } from './rate-limit-monitor.js';
import type { Device, Appliance, AirconSettings, LightState } from '../types/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock console to prevent log noise and verify logging
const mockConsole = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
vi.stubGlobal('console', { ...console, ...mockConsole });

describe('NatureRemoClient', () => {
  const TEST_TOKEN = 'test-token-12345';
  const BASE_URL = 'https://api.nature.global';

  let mockRateLimitMonitor: RateLimitMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitMonitor = {
      updateFromHeaders: vi.fn(),
      getRateLimitInfo: vi.fn().mockReturnValue({
        limit: 30,
        remaining: 25,
        resetAt: new Date(),
      }),
      isNearLimit: vi.fn().mockReturnValue(false),
      getResetTimeRemaining: vi.fn().mockReturnValue(300),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createNatureRemoClient', () => {
    it('should create a client instance', () => {
      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      expect(client).toBeDefined();
      expect(client.getDevices).toBeDefined();
      expect(client.getAppliances).toBeDefined();
      expect(client.updateAirconSettings).toBeDefined();
      expect(client.controlLight).toBeDefined();
    });

    it('should throw error if token is empty', () => {
      expect(() => createNatureRemoClient('', mockRateLimitMonitor)).toThrow(
        'NATURE_REMO_TOKEN 環境変数が設定されていません'
      );
    });

    it('should throw error if token is whitespace only', () => {
      expect(() => createNatureRemoClient('   ', mockRateLimitMonitor)).toThrow(
        'NATURE_REMO_TOKEN 環境変数が設定されていません'
      );
    });
  });

  describe('Authorization header (Requirement 1.2)', () => {
    it('should include Bearer token in Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve([]),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.getDevices();

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/1/devices`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_TOKEN}`,
          }),
        })
      );
    });
  });

  describe('Token security (Requirement 1.4)', () => {
    it('should not log token value', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve([]),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.getDevices();

      // Verify token is not in any log output
      const allLogCalls = [
        ...mockConsole.log.mock.calls.flat(),
        ...mockConsole.warn.mock.calls.flat(),
        ...mockConsole.error.mock.calls.flat(),
      ];

      for (const logMessage of allLogCalls) {
        if (typeof logMessage === 'string') {
          expect(logMessage).not.toContain(TEST_TOKEN);
        }
      }
    });
  });

  describe('getDevices (Requirement 2.1)', () => {
    it('should call GET /1/devices endpoint', async () => {
      const mockDevices: Device[] = [
        {
          id: 'device-1',
          name: 'Living Room',
          firmware_version: '1.0.0',
          newest_events: {
            te: { val: 25.5, created_at: '2026-01-22T00:00:00Z' },
            hu: { val: 60, created_at: '2026-01-22T00:00:00Z' },
            il: { val: 100, created_at: '2026-01-22T00:00:00Z' },
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve(mockDevices),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.getDevices();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockDevices);
      }
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/1/devices`,
        expect.any(Object)
      );
    });

    it('should return empty array when no devices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve([]),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.getDevices();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('getAppliances (Requirement 3.1)', () => {
    it('should call GET /1/appliances endpoint', async () => {
      const mockAppliances: Appliance[] = [
        {
          id: 'appliance-1',
          nickname: 'My AC',
          type: 'AC',
          device: {
            id: 'device-1',
            name: 'Living Room',
            firmware_version: '1.0.0',
            newest_events: {},
          },
          settings: {
            temp: '26',
            temp_unit: 'c',
            mode: 'cool',
            vol: 'auto',
            dir: 'auto',
            dirh: 'auto',
            button: '',
            updated_at: '2026-01-22T00:00:00Z',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve(mockAppliances),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.getAppliances();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockAppliances);
      }
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/1/appliances`,
        expect.any(Object)
      );
    });
  });

  describe('updateAirconSettings (Requirement 4.1)', () => {
    it('should call POST /1/appliances/{id}/aircon_settings endpoint', async () => {
      const mockSettings: AirconSettings = {
        temp: '26',
        temp_unit: 'c',
        mode: 'cool',
        vol: 'auto',
        dir: 'auto',
        dirh: 'auto',
        button: '',
        updated_at: '2026-01-22T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve(mockSettings),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.updateAirconSettings('appliance-1', {
        temperature: '26',
        operation_mode: 'cool',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockSettings);
      }
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/1/appliances/appliance-1/aircon_settings`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('should send temperature parameter correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve({}),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.updateAirconSettings('appliance-1', {
        temperature: '24',
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit] | undefined;
      expect(callArgs?.[1]?.body).toContain('temperature=24');
    });

    it('should send operation_mode parameter correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve({}),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.updateAirconSettings('appliance-1', {
        operation_mode: 'warm',
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit] | undefined;
      expect(callArgs?.[1]?.body).toContain('operation_mode=warm');
    });

    it('should send air_volume parameter correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve({}),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.updateAirconSettings('appliance-1', {
        air_volume: '2',
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit] | undefined;
      expect(callArgs?.[1]?.body).toContain('air_volume=2');
    });

    it('should send button parameter for power-off', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve({}),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.updateAirconSettings('appliance-1', {
        button: 'power-off',
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit] | undefined;
      expect(callArgs?.[1]?.body).toContain('button=power-off');
    });
  });

  describe('controlLight (Requirement 5.1)', () => {
    it('should call POST /1/appliances/{id}/light endpoint', async () => {
      const mockLightState: LightState = {
        power: 'on',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve(mockLightState),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.controlLight('appliance-2', 'on');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/1/appliances/appliance-2/light`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('should send button=on for turning on', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve({}),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.controlLight('appliance-2', 'on');

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit] | undefined;
      expect(callArgs?.[1]?.body).toBe('button=on');
    });

    it('should send button=off for turning off', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '29',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve({}),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.controlLight('appliance-2', 'off');

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit] | undefined;
      expect(callArgs?.[1]?.body).toBe('button=off');
    });
  });

  describe('Error handling - 401 Unauthorized (Requirement 6.2)', () => {
    it('should return UNAUTHORIZED error for 401 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: () => Promise.resolve({ code: 401, message: 'Unauthorized' }),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.getDevices();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
        expect(result.error.message).toBe('アクセストークンが無効です');
      }
    });
  });

  describe('Error handling - 404 Not Found (Requirement 6.3)', () => {
    it('should return NOT_FOUND error for 404 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: () => Promise.resolve({ code: 404, message: 'Not Found' }),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.getDevices();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toBe('リソースが見つかりません');
      }
    });
  });

  describe('Error handling - 429 Rate Limit (Requirement 6.1)', () => {
    it('should return RATE_LIMIT error for 429 status with retryAfter', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({
          'X-Rate-Limit-Reset': resetTime.toString(),
        }),
        json: () => Promise.resolve({ code: 429, message: 'Rate limit exceeded' }),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.getDevices();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RATE_LIMIT');
        expect(result.error.retryAfter).toBeGreaterThan(0);
      }
    });
  });

  describe('Error handling - Network Error (Requirement 6.4)', () => {
    it('should return NETWORK_ERROR for fetch failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.getDevices();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NETWORK_ERROR');
        expect(result.error.message).toBe('ネットワーク接続を確認してください');
      }
    });
  });

  describe('Rate limit monitoring (Requirement 6.5)', () => {
    it('should update rate limit monitor from response headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Rate-Limit-Limit': '30',
          'X-Rate-Limit-Remaining': '25',
          'X-Rate-Limit-Reset': '1700000000',
        }),
        json: () => Promise.resolve([]),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      await client.getDevices();

      expect(mockRateLimitMonitor.updateFromHeaders).toHaveBeenCalled();
    });
  });

  describe('Unknown errors', () => {
    it('should return UNKNOWN error for unexpected status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: () => Promise.resolve({ code: 500, message: 'Internal Server Error' }),
      });

      const client = createNatureRemoClient(TEST_TOKEN, mockRateLimitMonitor);
      const result = await client.getDevices();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNKNOWN');
      }
    });
  });
});
