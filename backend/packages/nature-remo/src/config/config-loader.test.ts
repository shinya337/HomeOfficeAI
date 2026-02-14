import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, ConfigError } from './config-loader.js';

describe('ConfigLoader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env['NATURE_REMO_TOKEN'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should return success with token when NATURE_REMO_TOKEN is set', () => {
      process.env['NATURE_REMO_TOKEN'] = 'test-token-12345';

      const result = loadConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.natureRemoToken).toBe('test-token-12345');
      }
    });

    it('should return error when NATURE_REMO_TOKEN is not set', () => {
      delete process.env['NATURE_REMO_TOKEN'];

      const result = loadConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOKEN_NOT_SET');
      }
    });

    it('should return error when NATURE_REMO_TOKEN is empty string', () => {
      process.env['NATURE_REMO_TOKEN'] = '';

      const result = loadConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOKEN_NOT_SET');
      }
    });

    it('should include suggestion to reference .env.sample in error', () => {
      delete process.env['NATURE_REMO_TOKEN'];

      const result = loadConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.suggestion).toContain('.env.sample');
      }
    });

    it('should provide clear error message when token is not set', () => {
      delete process.env['NATURE_REMO_TOKEN'];

      const result = loadConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBeTruthy();
        expect(result.error.message.length).toBeGreaterThan(0);
      }
    });

    it('should trim whitespace from token value', () => {
      process.env['NATURE_REMO_TOKEN'] = '  token-with-spaces  ';

      const result = loadConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.natureRemoToken).toBe('token-with-spaces');
      }
    });

    it('should treat whitespace-only token as not set', () => {
      process.env['NATURE_REMO_TOKEN'] = '   ';

      const result = loadConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOKEN_NOT_SET');
      }
    });
  });

  describe('ConfigError type', () => {
    it('should have required fields: code, message, suggestion', () => {
      delete process.env['NATURE_REMO_TOKEN'];

      const result = loadConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error: ConfigError = result.error;
        expect(error).toHaveProperty('code');
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('suggestion');
      }
    });
  });
});
