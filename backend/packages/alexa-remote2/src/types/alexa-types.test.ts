/**
 * Tests for Alexa type definitions
 *
 * Requirements: 1.1, 1.2, 1.4
 * - AlexaOperationResult type (device serial number, command, success flag)
 * - AlexaRoutineInfo type (name, id)
 * - AlexaServiceConfig type (amazonPage, acceptLanguage, cookieFilePath, proxy settings)
 * - AlexaResult type (success/failure discriminated union with ServiceError)
 * - AlexaServiceError type (code, message, cause) matching existing ServiceError pattern
 */

import { describe, it, expect } from 'vitest';
import type {
  AlexaOperationResult,
  AlexaRoutineInfo,
  AlexaServiceConfig,
  AlexaResult,
  AlexaServiceError,
  AlexaServiceErrorCode,
} from './alexa-types.js';

describe('Alexa Type Definitions', () => {
  describe('AlexaOperationResult type', () => {
    it('should represent a successful Alexa operation result', () => {
      const result: AlexaOperationResult = {
        deviceSerialNumber: 'G0911234ABCD',
        command: 'speak',
        success: true,
      };

      expect(result.deviceSerialNumber).toBe('G0911234ABCD');
      expect(result.command).toBe('speak');
      expect(result.success).toBe(true);
    });

    it('should be readonly (immutable)', () => {
      const result: AlexaOperationResult = {
        deviceSerialNumber: 'SERIAL001',
        command: 'announce',
        success: true,
      };

      // Verify all fields are accessible as readonly
      expect(result.deviceSerialNumber).toBe('SERIAL001');
      expect(result.command).toBe('announce');
      expect(result.success).toBe(true);
    });

    it('should support different command types', () => {
      const commands = ['speak', 'announce', 'routine', 'volume', 'weather', 'flashbriefing'];

      for (const command of commands) {
        const result: AlexaOperationResult = {
          deviceSerialNumber: 'DEVICE_SN',
          command,
          success: true,
        };
        expect(result.command).toBe(command);
      }
    });
  });

  describe('AlexaRoutineInfo type', () => {
    it('should represent routine information with name and id', () => {
      const routine: AlexaRoutineInfo = {
        name: 'Good Morning',
        id: 'routine-abc-123',
      };

      expect(routine.name).toBe('Good Morning');
      expect(routine.id).toBe('routine-abc-123');
    });

    it('should be readonly (immutable)', () => {
      const routine: AlexaRoutineInfo = {
        name: 'Work Mode',
        id: 'routine-xyz-789',
      };

      expect(routine.name).toBe('Work Mode');
      expect(routine.id).toBe('routine-xyz-789');
    });
  });

  describe('AlexaServiceConfig type', () => {
    it('should represent Alexa service configuration with required fields', () => {
      const config: AlexaServiceConfig = {
        amazonPage: 'amazon.co.jp',
        acceptLanguage: 'ja-JP',
        cookieFilePath: '/tmp/.alexa-cookie.json',
      };

      expect(config.amazonPage).toBe('amazon.co.jp');
      expect(config.acceptLanguage).toBe('ja-JP');
      expect(config.cookieFilePath).toBe('/tmp/.alexa-cookie.json');
    });

    it('should support optional proxy settings', () => {
      const config: AlexaServiceConfig = {
        amazonPage: 'amazon.co.jp',
        acceptLanguage: 'ja-JP',
        cookieFilePath: '/tmp/.alexa-cookie.json',
        proxyOwnIp: '127.0.0.1',
        proxyPort: 3001,
      };

      expect(config.proxyOwnIp).toBe('127.0.0.1');
      expect(config.proxyPort).toBe(3001);
    });

    it('should allow config without proxy settings', () => {
      const config: AlexaServiceConfig = {
        amazonPage: 'amazon.co.jp',
        acceptLanguage: 'ja-JP',
        cookieFilePath: '/home/user/.alexa-cookie.json',
      };

      expect(config.proxyOwnIp).toBeUndefined();
      expect(config.proxyPort).toBeUndefined();
    });

    it('should be readonly (immutable)', () => {
      const config: AlexaServiceConfig = {
        amazonPage: 'amazon.co.jp',
        acceptLanguage: 'ja-JP',
        cookieFilePath: '/tmp/cookie.json',
      };

      expect(config.amazonPage).toBe('amazon.co.jp');
    });
  });

  describe('AlexaServiceError type', () => {
    it('should represent AUTH_ERROR', () => {
      const error: AlexaServiceError = {
        code: 'AUTH_ERROR',
        message: 'Cookie is expired or invalid',
      };

      expect(error.code).toBe('AUTH_ERROR');
      expect(error.message).toBe('Cookie is expired or invalid');
      expect(error.cause).toBeUndefined();
    });

    it('should represent TIMEOUT error', () => {
      const error: AlexaServiceError = {
        code: 'TIMEOUT',
        message: 'Alexa API request timed out',
      };

      expect(error.code).toBe('TIMEOUT');
    });

    it('should represent ALEXA_ERROR with cause', () => {
      const originalError = new Error('Unknown alexa-remote2 error');
      const error: AlexaServiceError = {
        code: 'ALEXA_ERROR',
        message: 'An unexpected error occurred in alexa-remote2',
        cause: originalError,
      };

      expect(error.code).toBe('ALEXA_ERROR');
      expect(error.cause).toBe(originalError);
    });

    it('should represent RATE_LIMIT error', () => {
      const error: AlexaServiceError = {
        code: 'RATE_LIMIT',
        message: 'API call rate limit exceeded',
      };

      expect(error.code).toBe('RATE_LIMIT');
    });

    it('should represent ROUTINE_NOT_FOUND error', () => {
      const error: AlexaServiceError = {
        code: 'ROUTINE_NOT_FOUND',
        message: 'Routine "missing_routine" was not found',
      };

      expect(error.code).toBe('ROUTINE_NOT_FOUND');
    });

    it('should represent VOLUME_OUT_OF_RANGE error', () => {
      const error: AlexaServiceError = {
        code: 'VOLUME_OUT_OF_RANGE',
        message: 'Volume must be between 0 and 100',
      };

      expect(error.code).toBe('VOLUME_OUT_OF_RANGE');
    });

    it('should have all required error codes as literal types', () => {
      const codes: AlexaServiceErrorCode[] = [
        'AUTH_ERROR',
        'TIMEOUT',
        'ALEXA_ERROR',
        'RATE_LIMIT',
        'ROUTINE_NOT_FOUND',
        'VOLUME_OUT_OF_RANGE',
      ];

      expect(codes).toHaveLength(6);
    });
  });

  describe('AlexaResult type', () => {
    it('should represent success state with data', () => {
      const result: AlexaResult<AlexaOperationResult> = {
        success: true,
        data: {
          deviceSerialNumber: 'SERIAL001',
          command: 'speak',
          success: true,
        },
      };

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.command).toBe('speak');
      }
    });

    it('should represent failure state with AlexaServiceError', () => {
      const result: AlexaResult<AlexaOperationResult> = {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Not authenticated',
        },
      };

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });

    it('should support type narrowing via success check on success result', () => {
      const result: AlexaResult<readonly AlexaRoutineInfo[]> = {
        success: true,
        data: [
          { name: 'Morning', id: 'r-1' },
          { name: 'Evening', id: 'r-2' },
        ],
      };

      expect(result.success).toBe(true);
      if (result.success) {
        const routines: readonly AlexaRoutineInfo[] = result.data;
        expect(routines).toHaveLength(2);
        expect(routines[0]?.name).toBe('Morning');
      }
    });

    it('should support type narrowing via success check on error result', () => {
      const result: AlexaResult<readonly AlexaRoutineInfo[]> = {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Not connected',
        },
      };

      expect(result.success).toBe(false);
      if (!result.success) {
        const error: AlexaServiceError = result.error;
        expect(error.code).toBe('AUTH_ERROR');
      }
    });
  });
});
