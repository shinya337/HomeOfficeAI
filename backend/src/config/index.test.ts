/**
 * Config Index Tests
 *
 * Verifies that all exports from the config module index are accessible.
 *
 * Requirements: 3.1, 4.1, 4.2, 4.5
 */
import { describe, it, expect } from 'vitest';
import {
  // Integration config
  loadIntegrationConfig,

  // Component factories
  createAgentClient,

  // Dedup functions
  isSameAction,
  isDeviceControlAction,
} from './index.js';

describe('Config Module Index', () => {
  describe('Integration Config exports', () => {
    it('should export loadIntegrationConfig', () => {
      expect(typeof loadIntegrationConfig).toBe('function');
    });
  });

  describe('Component factory exports', () => {
    it('should export createAgentClient', () => {
      expect(typeof createAgentClient).toBe('function');
    });
  });

  describe('Dedup function exports', () => {
    it('should export isSameAction', () => {
      expect(typeof isSameAction).toBe('function');
    });

    it('should export isDeviceControlAction', () => {
      expect(typeof isDeviceControlAction).toBe('function');
    });
  });
});
