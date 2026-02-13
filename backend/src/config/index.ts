/**
 * Configuration Module Index
 *
 * Centralizes all configuration exports for homeoffice-api.
 * This includes:
 * - Integration configuration (environment variables)
 * - Component imports from packages
 *
 * Requirements: 3.1, 4.1, 4.2, 4.5
 */

// Integration configuration
export {
  loadIntegrationConfig,
  type IntegrationConfig,
  type IntegrationConfigError,
  type IntegrationConfigErrorCode,
  type AgentConfig,
} from './integration-config.js';

// Component imports from packages
export {
  // AgentClient
  createAgentClient,
  type AgentClientService,

  // ActionDispatcher type (local factory used instead - Req 7.1, 7.2)
  type ActionDispatcherService,

  // DeviceState type (local factory used instead)
  type DeviceState,

  // Nature Remo Client and Services
  createNatureRemoClient,
  createRateLimitMonitor,
  createApplianceService,
  type ApplianceService,
  createLightService,
  createAirconService,

  // Dedup actions
  isSameAction,
  isDeviceControlAction,

  // Action types
  type AgentAction,
  type ActionResult,
  type AgentError,
} from './component-imports.js';
