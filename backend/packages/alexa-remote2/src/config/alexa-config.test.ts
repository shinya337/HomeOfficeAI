/**
 * Tests for Alexa configuration loader
 *
 * Requirements: 1.4, 2.1
 * - AlexaServiceConfig loading from environment variables
 * - Default values for amazonPage and acceptLanguage
 * - Cookie file path configuration
 * - Optional proxy settings
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadAlexaConfig } from './alexa-config.js';
import type { AlexaServiceConfig } from '../types/alexa-types.js';

describe('AlexaConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all Alexa-related env vars
    delete process.env['ALEXA_COOKIE_FILE_PATH'];
    delete process.env['ALEXA_PROXY_OWN_IP'];
    delete process.env['ALEXA_PROXY_PORT'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadAlexaConfig', () => {
    it('should return config with default amazonPage and acceptLanguage', () => {
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/.alexa-cookie.json';

      const result = loadAlexaConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amazonPage).toBe('amazon.co.jp');
        expect(result.data.acceptLanguage).toBe('ja-JP');
      }
    });

    it('should read cookie file path from environment variable', () => {
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/home/user/.alexa-cookie.json';

      const result = loadAlexaConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cookieFilePath).toBe('/home/user/.alexa-cookie.json');
      }
    });

    it('should use default cookie file path when not set', () => {
      // No ALEXA_COOKIE_FILE_PATH set

      const result = loadAlexaConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cookieFilePath).toContain('.alexa-cookie.json');
      }
    });

    it('should read optional proxy settings from environment variables', () => {
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/cookie.json';
      process.env['ALEXA_PROXY_OWN_IP'] = '192.168.1.100';
      process.env['ALEXA_PROXY_PORT'] = '3456';

      const result = loadAlexaConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proxyOwnIp).toBe('192.168.1.100');
        expect(result.data.proxyPort).toBe(3456);
      }
    });

    it('should leave proxy settings undefined when not set', () => {
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/cookie.json';

      const result = loadAlexaConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proxyOwnIp).toBeUndefined();
        expect(result.data.proxyPort).toBeUndefined();
      }
    });

    it('should return error when proxy port is not a valid number', () => {
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/cookie.json';
      process.env['ALEXA_PROXY_PORT'] = 'not-a-number';

      const result = loadAlexaConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CONFIG');
      }
    });

    it('should trim whitespace from cookie file path', () => {
      process.env['ALEXA_COOKIE_FILE_PATH'] = '  /tmp/cookie.json  ';

      const result = loadAlexaConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cookieFilePath).toBe('/tmp/cookie.json');
      }
    });

    it('should return config conforming to AlexaServiceConfig interface', () => {
      process.env['ALEXA_COOKIE_FILE_PATH'] = '/tmp/cookie.json';

      const result = loadAlexaConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        const config: AlexaServiceConfig = result.data;
        expect(config).toHaveProperty('amazonPage');
        expect(config).toHaveProperty('acceptLanguage');
        expect(config).toHaveProperty('cookieFilePath');
      }
    });
  });
});
