/**
 * Device Handler Tests
 *
 * TDD tests for GET /api/devices endpoint.
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import {
  createDeviceRoutes,
  createDeviceHandler,
  type DeviceHandlerDependencies,
} from './device-handler.js';
import type { ApplianceService, ApplianceInfo } from '../config/component-imports.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockApplianceService(): ApplianceService {
  return {
    getAppliances: vi.fn(),
    getApplianceById: vi.fn(),
  };
}

function createTestApp(deps: DeviceHandlerDependencies): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', createDeviceRoutes(deps));
  return app;
}

// ============================================================================
// Device Handler Tests
// ============================================================================

describe('DeviceHandler', () => {
  let mockApplianceService: ApplianceService;
  let mockGetCachedDevices: ReturnType<typeof vi.fn>;
  let mockSetCachedDevices: ReturnType<typeof vi.fn>;
  let deps: DeviceHandlerDependencies;

  beforeEach(() => {
    mockApplianceService = createMockApplianceService();
    mockGetCachedDevices = vi.fn();
    mockSetCachedDevices = vi.fn();
    deps = {
      applianceService: mockApplianceService,
      getCachedDevices: mockGetCachedDevices,
      setCachedDevices: mockSetCachedDevices,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDeviceHandler', () => {
    it('should create a handler with getDevices method', () => {
      const handler = createDeviceHandler(deps);
      expect(handler).toBeDefined();
      expect(handler.getDevices).toBeInstanceOf(Function);
    });
  });

  describe('GET /api/devices', () => {
    // Requirement 1.1: Nature Remoからデバイス一覧を取得して返却
    it('should return device list from Nature Remo API (Req 1.1)', async () => {
      const mockAppliances: ApplianceInfo[] = [
        { id: 'light-1', nickname: 'Living Light', type: 'LIGHT' },
        { id: 'ac-1', nickname: 'Living AC', type: 'AC' },
        { id: 'tv-1', nickname: 'Living TV', type: 'TV' },
      ];
      vi.mocked(mockApplianceService.getAppliances).mockResolvedValue({
        success: true,
        data: mockAppliances,
      });
      mockGetCachedDevices.mockReturnValue(null);

      const app = createTestApp(deps);
      const response = await request(app).get('/api/devices');

      expect(response.status).toBe(200);
      expect(response.body.devices).toHaveLength(3);
      expect(mockApplianceService.getAppliances).toHaveBeenCalled();
    });

    // Requirement 1.2: デバイス情報（ID、名前、タイプ）を正規化して返却
    it('should return normalized device info with id, name, type (Req 1.2)', async () => {
      const mockAppliances: ApplianceInfo[] = [
        { id: 'light-1', nickname: 'Living Room Light', type: 'LIGHT' },
        { id: 'ac-1', nickname: 'Bedroom AC', type: 'AC' },
      ];
      vi.mocked(mockApplianceService.getAppliances).mockResolvedValue({
        success: true,
        data: mockAppliances,
      });
      mockGetCachedDevices.mockReturnValue(null);

      const app = createTestApp(deps);
      const response = await request(app).get('/api/devices');

      expect(response.status).toBe(200);
      expect(response.body.devices[0]).toEqual({
        id: 'light-1',
        name: 'Living Room Light',
        type: 'LIGHT',
      });
      expect(response.body.devices[1]).toEqual({
        id: 'ac-1',
        name: 'Bedroom AC',
        type: 'AC',
      });
    });

    // Requirement 1.3: Nature Remo API障害時は503エラー
    it('should return 503 when Nature Remo API fails (Req 1.3)', async () => {
      vi.mocked(mockApplianceService.getAppliances).mockResolvedValue({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Nature Remo API connection failed',
        },
      });
      mockGetCachedDevices.mockReturnValue(null);

      const app = createTestApp(deps);
      const response = await request(app).get('/api/devices');

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('NATURE_API_ERROR');
      expect(response.body.error.message).toBeDefined();
    });

    // Requirement 1.4: レート制限超過時は429エラーとリトライ可能時刻を返却
    it('should return 429 with retryAfter when rate limit exceeded (Req 1.4)', async () => {
      vi.mocked(mockApplianceService.getAppliances).mockResolvedValue({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Rate limit exceeded',
          cause: {
            code: 'RATE_LIMIT',
            message: 'Rate limit exceeded',
            retryAfter: 120,
          },
        },
      });
      mockGetCachedDevices.mockReturnValue(null);

      const app = createTestApp(deps);
      const response = await request(app).get('/api/devices');

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.error.retryAfter).toBe(120);
    });

    // Caching: Should use cache when available (5min TTL)
    it('should return cached devices when cache is valid', async () => {
      const cachedDevices = [
        { id: 'light-1', name: 'Cached Light', type: 'LIGHT' as const },
      ];
      mockGetCachedDevices.mockReturnValue(cachedDevices);

      const app = createTestApp(deps);
      const response = await request(app).get('/api/devices');

      expect(response.status).toBe(200);
      expect(response.body.devices).toEqual(cachedDevices);
      expect(mockApplianceService.getAppliances).not.toHaveBeenCalled();
    });

    // Caching: Should fetch and cache when cache is empty
    it('should fetch from API and cache when cache is empty', async () => {
      const mockAppliances: ApplianceInfo[] = [
        { id: 'light-1', nickname: 'Living Light', type: 'LIGHT' },
      ];
      vi.mocked(mockApplianceService.getAppliances).mockResolvedValue({
        success: true,
        data: mockAppliances,
      });
      mockGetCachedDevices.mockReturnValue(null);

      const app = createTestApp(deps);
      await request(app).get('/api/devices');

      expect(mockSetCachedDevices).toHaveBeenCalledWith([
        { id: 'light-1', name: 'Living Light', type: 'LIGHT' },
      ]);
    });

    // Edge case: Empty device list
    it('should return empty array when no devices are registered', async () => {
      vi.mocked(mockApplianceService.getAppliances).mockResolvedValue({
        success: true,
        data: [],
      });
      mockGetCachedDevices.mockReturnValue(null);

      const app = createTestApp(deps);
      const response = await request(app).get('/api/devices');

      expect(response.status).toBe(200);
      expect(response.body.devices).toEqual([]);
    });

    // Edge case: IR devices should be included
    it('should include IR type devices', async () => {
      const mockAppliances: ApplianceInfo[] = [
        { id: 'ir-1', nickname: 'Custom Remote', type: 'IR' },
      ];
      vi.mocked(mockApplianceService.getAppliances).mockResolvedValue({
        success: true,
        data: mockAppliances,
      });
      mockGetCachedDevices.mockReturnValue(null);

      const app = createTestApp(deps);
      const response = await request(app).get('/api/devices');

      expect(response.status).toBe(200);
      expect(response.body.devices[0].type).toBe('IR');
    });
  });
});

// ============================================================================
// Device Cache Tests
// ============================================================================

describe('DeviceCache', () => {
  describe('createDeviceCache', () => {
    it('should return null when cache is empty', async () => {
      const { createDeviceCache } = await import('./device-handler.js');
      const cache = createDeviceCache();
      expect(cache.get()).toBeNull();
    });

    it('should return cached value within TTL', async () => {
      const { createDeviceCache } = await import('./device-handler.js');
      const cache = createDeviceCache(5 * 60 * 1000); // 5 minutes
      const devices = [{ id: 'light-1', name: 'Test', type: 'LIGHT' as const }];

      cache.set(devices);
      expect(cache.get()).toEqual(devices);
    });

    it('should return null after TTL expires', async () => {
      vi.useFakeTimers();
      const { createDeviceCache } = await import('./device-handler.js');
      const cache = createDeviceCache(5 * 60 * 1000); // 5 minutes
      const devices = [{ id: 'light-1', name: 'Test', type: 'LIGHT' as const }];

      cache.set(devices);
      expect(cache.get()).toEqual(devices);

      // Advance time by 6 minutes
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(cache.get()).toBeNull();

      vi.useRealTimers();
    });

    it('should clear cache when clear() is called', async () => {
      const { createDeviceCache } = await import('./device-handler.js');
      const cache = createDeviceCache();
      const devices = [{ id: 'light-1', name: 'Test', type: 'LIGHT' as const }];

      cache.set(devices);
      expect(cache.get()).toEqual(devices);

      cache.clear();
      expect(cache.get()).toBeNull();
    });
  });
});
