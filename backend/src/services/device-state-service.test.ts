/**
 * DeviceStateService Tests
 *
 * Tests for the device state service that filters by allowed devices.
 * Requirements: 6.1, 6.2, 6.3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDeviceStateService,
  type DeviceStateServiceDependencies,
  type FilteredDeviceState,
} from './device-state-service.js';
import type { AllowedDevice, DeviceType } from '../types/device-types.js';
import type { ApplianceService, ApplianceInfo } from '../../packages/nature-remo/src/services/appliance-service.js';
import type { ServiceError, Result } from '../../packages/nature-remo/src/types/types.js';
import type { AlexaService } from '../../packages/alexa-remote2/src/services/alexa-service.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockApplianceService(
  result: Result<ApplianceInfo[], ServiceError>
): ApplianceService {
  return {
    getAppliances: vi.fn().mockResolvedValue(result),
    getApplianceById: vi.fn(),
  };
}

function makeLightAppliance(id: string, power: 'on' | 'off'): ApplianceInfo {
  return {
    id,
    nickname: 'Test Light',
    type: 'LIGHT',
    lightState: { power },
  };
}

function makeAirconAppliance(
  id: string,
  temperature: string,
  mode: string
): ApplianceInfo {
  return {
    id,
    nickname: 'Test Aircon',
    type: 'AC',
    airconSettings: { temperature, mode, volume: 'auto', power: 'on' },
  };
}

function makeTvAppliance(id: string): ApplianceInfo {
  return {
    id,
    nickname: 'Test TV',
    type: 'TV',
  };
}

function makeAllowedDevice(id: string, type: DeviceType): AllowedDevice {
  return { id, type };
}

function createMockAlexaService(opts: {
  connected: boolean;
  playerState?: 'PLAYING' | 'PAUSED' | 'IDLE';
  devices?: Array<{ serialNumber: string; name: string; family: string }>;
}): AlexaService {
  const devices = opts.devices ?? [{ serialNumber: 'ECHO-001', name: 'Echo', family: 'ECHO' }];
  return {
    isConnected: vi.fn().mockReturnValue(opts.connected),
    getDevices: vi.fn().mockReturnValue({
      success: true,
      data: opts.connected ? devices : [],
    }),
    getPlayerInfo: vi.fn().mockResolvedValue(
      opts.playerState !== undefined
        ? { success: true, data: { state: opts.playerState } }
        : { success: false, error: { code: 'AUTH_ERROR', message: 'Not connected' } }
    ),
    speak: vi.fn(),
    announce: vi.fn(),
    getRoutines: vi.fn(),
    executeRoutine: vi.fn(),
    setVolume: vi.fn(),
    playWeather: vi.fn(),
    playFlashBriefing: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('DeviceStateService', () => {
  let mockApplianceService: ApplianceService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDeviceStateService', () => {
    it('should create a service with getDeviceState method', () => {
      mockApplianceService = createMockApplianceService({
        success: true,
        data: [],
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      expect(service).toBeDefined();
      expect(typeof service.getDeviceState).toBe('function');
    });
  });

  describe('allowedDevices filtering (Req 6.1, 6.2)', () => {
    it('should return only allowed LIGHT device state', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeLightAppliance('light-002', 'off'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('light-001', 'LIGHT'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toEqual({ power: 'on' });
        expect(result.value.aircon).toBeNull();
      }
    });

    it('should return only allowed AC device state', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
        makeAirconAppliance('aircon-002', '28', 'warm'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('aircon-001', 'AC'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toBeNull();
        expect(result.value.aircon).toEqual({ temperature: '26', mode: 'cool' });
      }
    });

    it('should return both light and aircon state when both are allowed', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('light-001', 'LIGHT'),
        makeAllowedDevice('aircon-001', 'AC'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toEqual({ power: 'on' });
        expect(result.value.aircon).toEqual({ temperature: '26', mode: 'cool' });
      }
    });

    it('should NOT return non-allowed device state (Req 6.2)', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeLightAppliance('light-002', 'off'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
        makeAirconAppliance('aircon-002', '28', 'warm'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      // Only light-002 and aircon-002 are allowed
      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('light-002', 'LIGHT'),
        makeAllowedDevice('aircon-002', 'AC'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should return light-002 (off) not light-001 (on)
        expect(result.value.light).toEqual({ power: 'off' });
        // Should return aircon-002 (28C warm) not aircon-001 (26C cool)
        expect(result.value.aircon).toEqual({ temperature: '28', mode: 'warm' });
      }
    });

    it('should return null for device types not in allowed list', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      // Only TV is allowed (no actual TV state exists in the system)
      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('tv-001', 'TV'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toBeNull();
        expect(result.value.aircon).toBeNull();
      }
    });

    it('should return null for both when empty allowed devices', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const result = await service.getDeviceState([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toBeNull();
        expect(result.value.aircon).toBeNull();
      }
    });

    it('should use first allowed device when multiple of same type are allowed', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeLightAppliance('light-002', 'off'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      // Both lights allowed, but light-002 comes first in the list
      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('light-002', 'LIGHT'),
        makeAllowedDevice('light-001', 'LIGHT'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should return the first allowed device (light-002 which is off)
        expect(result.value.light).toEqual({ power: 'off' });
      }
    });
  });

  describe('backward compatibility - undefined allowedDevices', () => {
    it('should return all device states when allowedDevices is undefined', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const result = await service.getDeviceState(undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toEqual({ power: 'on' });
        expect(result.value.aircon).toEqual({ temperature: '26', mode: 'cool' });
      }
    });

    it('should return first device state of each type when multiple exist and allowedDevices is undefined', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeLightAppliance('light-002', 'off'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
        makeAirconAppliance('aircon-002', '28', 'warm'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const result = await service.getDeviceState(undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should return first light (light-001 on)
        expect(result.value.light).toEqual({ power: 'on' });
        // Should return first aircon (aircon-001 26C cool)
        expect(result.value.aircon).toEqual({ temperature: '26', mode: 'cool' });
      }
    });
  });

  describe('API error handling', () => {
    it('should return error when API call fails', async () => {
      mockApplianceService = createMockApplianceService({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Nature Remo API connection failed',
        },
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const result = await service.getDeviceState(undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.message).toContain('Nature Remo');
      }
    });

    it('should return error when rate limited', async () => {
      mockApplianceService = createMockApplianceService({
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Rate limit exceeded',
          cause: { code: 'RATE_LIMIT', message: 'Rate limit exceeded' },
        },
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const result = await service.getDeviceState([]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('API_ERROR');
      }
    });
  });

  describe('device not found scenarios', () => {
    it('should return null when allowed device ID does not exist in API response', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      // Allowed device ID doesn't exist
      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('light-999', 'LIGHT'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toBeNull();
      }
    });

    it('should return null when appliance has no state data', async () => {
      // Appliance exists but has no lightState
      const appliances: ApplianceInfo[] = [
        { id: 'light-001', nickname: 'Test Light', type: 'LIGHT' },
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('light-001', 'LIGHT'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.light).toBeNull();
      }
    });
  });

  describe('getAllowedDeviceIds helper (for prompt building - Req 6.3)', () => {
    it('should return allowed device IDs when filtering', async () => {
      const appliances: ApplianceInfo[] = [
        makeLightAppliance('light-001', 'on'),
        makeAirconAppliance('aircon-001', '26', 'cool'),
      ];
      mockApplianceService = createMockApplianceService({
        success: true,
        data: appliances,
      });
      const service = createDeviceStateService({ applianceService: mockApplianceService });

      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('light-001', 'LIGHT'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // The returned state should only contain allowed device data
        // This ensures the prompt builder (Req 6.3) receives only allowed device states
        expect(result.value.light).not.toBeNull();
        expect(result.value.aircon).toBeNull();
      }
    });
  });

  describe('Alexa state retrieval', () => {
    it('should return alexa state when alexaService is provided and ALEXA is allowed', async () => {
      mockApplianceService = createMockApplianceService({ success: true, data: [] });
      const mockAlexaService = createMockAlexaService({ connected: true, playerState: 'PLAYING' });
      const service = createDeviceStateService({
        applianceService: mockApplianceService,
        alexaService: mockAlexaService,
      });

      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('alexa-001', 'ALEXA'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alexa).toEqual({ connected: true, playerState: 'PLAYING' });
      }
    });

    it('should return alexa disconnected when not connected', async () => {
      mockApplianceService = createMockApplianceService({ success: true, data: [] });
      const mockAlexaService = createMockAlexaService({ connected: false });
      const service = createDeviceStateService({
        applianceService: mockApplianceService,
        alexaService: mockAlexaService,
      });

      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('alexa-001', 'ALEXA'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alexa).toEqual({ connected: false });
      }
    });

    it('should return null when ALEXA is not in allowed devices', async () => {
      mockApplianceService = createMockApplianceService({ success: true, data: [] });
      const mockAlexaService = createMockAlexaService({ connected: true, playerState: 'IDLE' });
      const service = createDeviceStateService({
        applianceService: mockApplianceService,
        alexaService: mockAlexaService,
      });

      const allowedDevices: AllowedDevice[] = [
        makeAllowedDevice('light-001', 'LIGHT'),
      ];
      const result = await service.getDeviceState(allowedDevices);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alexa).toBeNull();
      }
    });

    it('should return null when alexaService is not provided', async () => {
      mockApplianceService = createMockApplianceService({ success: true, data: [] });
      const service = createDeviceStateService({
        applianceService: mockApplianceService,
      });

      const result = await service.getDeviceState(undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alexa).toBeNull();
      }
    });

    it('should return connected without playerState when no devices found', async () => {
      mockApplianceService = createMockApplianceService({ success: true, data: [] });
      const mockAlexaService = createMockAlexaService({ connected: true, playerState: 'IDLE', devices: [] });
      (mockAlexaService.getDevices as ReturnType<typeof vi.fn>).mockReturnValue({ success: true, data: [] });
      const service = createDeviceStateService({
        applianceService: mockApplianceService,
        alexaService: mockAlexaService,
      });

      const result = await service.getDeviceState(undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alexa).toEqual({ connected: true });
      }
    });
  });
});
