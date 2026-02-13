/**
 * ApplianceService Tests
 *
 * TDD tests for the ApplianceService.
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApplianceService, type ApplianceService } from './appliance-service.js';
import type { NatureRemoClient } from '../client/nature-remo-client.js';
import type { Appliance, Result, ApiError, Device } from '../types/types.js';

// Mock device for testing
const mockDevice: Device = {
  id: 'device-1',
  name: 'Living Room Remo',
  firmware_version: '2.0.0',
  newest_events: {},
};

// Mock appliances for testing
const mockAirconAppliance: Appliance = {
  id: 'aircon-1',
  nickname: 'Living Room AC',
  type: 'AC',
  device: mockDevice,
  settings: {
    temp: '26',
    temp_unit: 'c',
    mode: 'cool',
    vol: 'auto',
    dir: 'auto',
    dirh: 'auto',
    button: '',
    updated_at: '2026-01-22T10:00:00+09:00',
  },
};

const mockLightAppliance: Appliance = {
  id: 'light-1',
  nickname: 'Living Room Light',
  type: 'LIGHT',
  device: mockDevice,
  light: {
    buttons: [
      { name: 'on', label: 'ON' },
      { name: 'off', label: 'OFF' },
    ],
    state: {
      power: 'on',
      brightness: '80',
    },
  },
};

const mockTvAppliance: Appliance = {
  id: 'tv-1',
  nickname: 'Living Room TV',
  type: 'TV',
  device: mockDevice,
};

const mockIrAppliance: Appliance = {
  id: 'ir-1',
  nickname: 'Custom IR Remote',
  type: 'IR',
  device: mockDevice,
  signals: [
    { id: 'sig-1', name: 'Button 1', image: 'button1.png' },
  ],
};

describe('ApplianceService', () => {
  let mockClient: NatureRemoClient;
  let applianceService: ApplianceService;

  beforeEach(() => {
    // Create mock client
    mockClient = {
      getDevices: vi.fn(),
      getAppliances: vi.fn(),
      updateAirconSettings: vi.fn(),
      controlLight: vi.fn(),
    };
    applianceService = createApplianceService(mockClient);
  });

  describe('getAppliances', () => {
    it('should return appliance info list with ID, nickname, and type (Req 3.1, 3.2)', async () => {
      // Arrange
      const appliances = [mockAirconAppliance, mockLightAppliance, mockTvAppliance];
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: appliances,
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0]).toMatchObject({
          id: 'aircon-1',
          nickname: 'Living Room AC',
          type: 'AC',
        });
        expect(result.data[1]).toMatchObject({
          id: 'light-1',
          nickname: 'Living Room Light',
          type: 'LIGHT',
        });
        expect(result.data[2]).toMatchObject({
          id: 'tv-1',
          nickname: 'Living Room TV',
          type: 'TV',
        });
      }
    });

    it('should include aircon current settings for AC type (Req 3.3)', async () => {
      // Arrange
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [mockAirconAppliance],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].airconSettings).toBeDefined();
        expect(result.data[0].airconSettings).toMatchObject({
          temperature: '26',
          mode: 'cool',
          volume: 'auto',
          power: 'on',
        });
      }
    });

    it('should include light state for LIGHT type (Req 3.4)', async () => {
      // Arrange
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [mockLightAppliance],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].lightState).toBeDefined();
        expect(result.data[0].lightState).toMatchObject({
          power: 'on',
          brightness: '80',
        });
      }
    });

    it('should handle aircon with power-off button as off state', async () => {
      // Arrange
      const offAircon: Appliance = {
        ...mockAirconAppliance,
        settings: {
          ...mockAirconAppliance.settings!,
          button: 'power-off',
        },
      };
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [offAircon],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].airconSettings?.power).toBe('off');
      }
    });

    it('should return empty array when no appliances registered', async () => {
      // Arrange
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should propagate API errors', async () => {
      // Arrange
      const apiError: ApiError = {
        code: 'UNAUTHORIZED',
        message: 'アクセストークンが無効です',
      };
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: false,
        error: apiError,
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.cause).toEqual(apiError);
      }
    });
  });

  describe('getApplianceById', () => {
    it('should return appliance info when found', async () => {
      // Arrange
      const appliances = [mockAirconAppliance, mockLightAppliance];
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: appliances,
      });

      // Act
      const result = await applianceService.getApplianceById('aircon-1');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('aircon-1');
        expect(result.data.nickname).toBe('Living Room AC');
        expect(result.data.type).toBe('AC');
      }
    });

    it('should return error when appliance not found', async () => {
      // Arrange
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [mockAirconAppliance],
      });

      // Act
      const result = await applianceService.getApplianceById('non-existent-id');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('APPLIANCE_NOT_FOUND');
        expect(result.error.message).toContain('non-existent-id');
      }
    });

    it('should propagate API errors', async () => {
      // Arrange
      const apiError: ApiError = {
        code: 'RATE_LIMIT',
        message: 'レート制限に達しました',
        retryAfter: 300,
      };
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: false,
        error: apiError,
      });

      // Act
      const result = await applianceService.getApplianceById('aircon-1');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.cause).toEqual(apiError);
      }
    });
  });

  describe('Type-specific formatting', () => {
    it('should not include airconSettings for non-AC appliances', async () => {
      // Arrange
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [mockLightAppliance, mockTvAppliance],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].airconSettings).toBeUndefined();
        expect(result.data[1].airconSettings).toBeUndefined();
      }
    });

    it('should not include lightState for non-LIGHT appliances', async () => {
      // Arrange
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [mockAirconAppliance, mockTvAppliance],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].lightState).toBeUndefined();
        expect(result.data[1].lightState).toBeUndefined();
      }
    });

    it('should handle light without state', async () => {
      // Arrange
      const lightWithoutState: Appliance = {
        ...mockLightAppliance,
        light: {
          buttons: [{ name: 'on', label: 'ON' }],
        },
      };
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [lightWithoutState],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].lightState).toBeUndefined();
      }
    });

    it('should handle aircon without settings', async () => {
      // Arrange
      const airconWithoutSettings: Appliance = {
        ...mockAirconAppliance,
        settings: undefined,
      };
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [airconWithoutSettings],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].airconSettings).toBeUndefined();
      }
    });

    it('should handle IR appliance type', async () => {
      // Arrange
      vi.mocked(mockClient.getAppliances).mockResolvedValue({
        success: true,
        data: [mockIrAppliance],
      });

      // Act
      const result = await applianceService.getAppliances();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].type).toBe('IR');
        expect(result.data[0].airconSettings).toBeUndefined();
        expect(result.data[0].lightState).toBeUndefined();
      }
    });
  });
});
