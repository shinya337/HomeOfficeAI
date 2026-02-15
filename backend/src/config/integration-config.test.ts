/**
 * Integration Configuration Tests
 *
 * Tests for environment variable loading and existing component
 * import configuration for homeoffice-api integration.
 *
 * Requirements: 3.1, 4.1, 4.2, 4.5, 7.1, 7.2, 7.3
 *
 * Note: LIGHT_APPLIANCE_ID and AIRCON_APPLIANCE_ID environment variables
 * have been removed in favor of dynamic device selection via session.
 * Device IDs are now obtained from the session's allowedDevices, not from
 * environment variables.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadIntegrationConfig,
  type IntegrationConfig,
  type IntegrationConfigError,
} from './integration-config.js';

describe('loadIntegrationConfig', () => {
  // Store original env values
  let originalProjectId: string | undefined;
  let originalNatureRemoToken: string | undefined;
  let originalVertexAiLocation: string | undefined;
  let originalGeminiModel: string | undefined;

  beforeEach(() => {
    // Save original values
    originalProjectId = process.env.GOOGLE_CLOUD_PROJECT;
    originalNatureRemoToken = process.env.NATURE_REMO_TOKEN;
    originalVertexAiLocation = process.env.VERTEX_AI_LOCATION;
    originalGeminiModel = process.env.GEMINI_MODEL;

    // Clear all relevant env vars
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.NATURE_REMO_TOKEN;
    delete process.env.VERTEX_AI_LOCATION;
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    // Restore original values
    if (originalProjectId !== undefined) {
      process.env.GOOGLE_CLOUD_PROJECT = originalProjectId;
    } else {
      delete process.env.GOOGLE_CLOUD_PROJECT;
    }
    if (originalNatureRemoToken !== undefined) {
      process.env.NATURE_REMO_TOKEN = originalNatureRemoToken;
    } else {
      delete process.env.NATURE_REMO_TOKEN;
    }
    if (originalVertexAiLocation !== undefined) {
      process.env.VERTEX_AI_LOCATION = originalVertexAiLocation;
    } else {
      delete process.env.VERTEX_AI_LOCATION;
    }
    if (originalGeminiModel !== undefined) {
      process.env.GEMINI_MODEL = originalGeminiModel;
    } else {
      delete process.env.GEMINI_MODEL;
    }
  });

  describe('successful configuration (Req 7.1, 7.2, 7.3)', () => {
    it('should load configuration without LIGHT_APPLIANCE_ID and AIRCON_APPLIANCE_ID', () => {
      // Arrange - only required env vars (device IDs are no longer required)
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentConfig.projectId).toBe('test-project');
        expect(result.value.agentConfig.natureRemoToken).toBe('test-token');
        // ApplianceConfig should no longer exist
        expect((result.value as any).applianceConfig).toBeUndefined();
      }
    });

    it('should use default values for optional environment variables', () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentConfig.location).toBe('us-central1');
        expect(result.value.agentConfig.model).toBe('gemini-2.5-flash');
      }
    });

    it('should use custom values for optional environment variables when provided', () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.NATURE_REMO_TOKEN = 'test-token';
      process.env.VERTEX_AI_LOCATION = 'asia-northeast1';
      process.env.GEMINI_MODEL = 'gemini-pro';

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentConfig.location).toBe('asia-northeast1');
        expect(result.value.agentConfig.model).toBe('gemini-pro');
      }
    });

    it('should keep NATURE_REMO_TOKEN for API authentication (Req 7.3)', () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.NATURE_REMO_TOKEN = 'my-nature-remo-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentConfig.natureRemoToken).toBe('my-nature-remo-token');
      }
    });
  });

  describe('error handling', () => {
    it('should return error when GOOGLE_CLOUD_PROJECT is missing', () => {
      // Arrange
      process.env.NATURE_REMO_TOKEN = 'test-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_PROJECT_ID');
        expect(result.error.message).toContain('GOOGLE_CLOUD_PROJECT');
      }
    });

    it('should succeed when NATURE_REMO_TOKEN is missing (IoT-less mode)', () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      // Act
      const result = loadIntegrationConfig();

      // Assert - should succeed with empty natureRemoToken
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentConfig.natureRemoToken).toBe('');
      }
    });

    it('should NOT return error when LIGHT_APPLIANCE_ID is missing (Req 7.1)', () => {
      // Arrange - only required env vars, no device IDs
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert - should succeed without LIGHT_APPLIANCE_ID
      expect(result.ok).toBe(true);
    });

    it('should NOT return error when AIRCON_APPLIANCE_ID is missing (Req 7.2)', () => {
      // Arrange - only required env vars, no device IDs
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert - should succeed without AIRCON_APPLIANCE_ID
      expect(result.ok).toBe(true);
    });

    it('should return error with empty string for required variables', () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT = '';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_PROJECT_ID');
      }
    });

    it('should return error with whitespace-only string for required variables', () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT = '   ';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_PROJECT_ID');
      }
    });

    it('should provide helpful suggestion in error', () => {
      // Arrange - no env vars set

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.suggestion).toBeDefined();
        expect(result.error.suggestion.length).toBeGreaterThan(0);
      }
    });
  });

  describe('configuration structure', () => {
    it('should return IntegrationConfig with agentConfig only (no applianceConfig)', () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.NATURE_REMO_TOKEN = 'test-token';

      // Act
      const result = loadIntegrationConfig();

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const config: IntegrationConfig = result.value;
        // Check agentConfig structure
        expect(config.agentConfig).toBeDefined();
        expect(typeof config.agentConfig.projectId).toBe('string');
        expect(typeof config.agentConfig.location).toBe('string');
        expect(typeof config.agentConfig.model).toBe('string');
        expect(typeof config.agentConfig.natureRemoToken).toBe('string');

        // applianceConfig should no longer exist
        expect((config as any).applianceConfig).toBeUndefined();
      }
    });
  });
});
