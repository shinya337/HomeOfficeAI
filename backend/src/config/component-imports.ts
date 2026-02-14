/**
 * Component Imports
 *
 * Re-exports existing package components for use in homeoffice-api.
 * This module centralizes imports from external packages,
 * making it easy to integrate and maintain.
 *
 * Requirements: 3.1, 4.1, 4.2, 4.5, 1.3, 9.2
 */

// =============================================================================
// AgentClient - AI Image Analysis (Requirement 3.1)
// =============================================================================
export {
  createAgentClient,
  type AgentClientService,
} from '../../packages/iot-ai-agent-loop/src/agent/agent-client.js';

// =============================================================================
// ActionDispatcher - IoT Device Control (Requirements 4.1, 4.2)
// Note: homeoffice-api uses its own local createActionDispatcher (Req 7.1, 7.2)
//       but ActionDispatcherService type is still consumed
// =============================================================================
export type {
  ActionDispatcherService,
} from '../../packages/iot-ai-agent-loop/src/dispatcher/action-dispatcher.js';

// =============================================================================
// DeviceStateService - Device State Retrieval
// Note: homeoffice-api uses its own local createDeviceStateService
//       but DeviceState type is consumed by analyze-handler tests
// =============================================================================
export type {
  DeviceState,
} from '../../packages/iot-ai-agent-loop/src/services/device-state-service.js';

// =============================================================================
// Nature Remo Client and Services
// =============================================================================
export {
  createNatureRemoClient,
} from '../../packages/nature-remo/src/client/nature-remo-client.js';

export {
  createRateLimitMonitor,
} from '../../packages/nature-remo/src/client/rate-limit-monitor.js';

export {
  createApplianceService,
  type ApplianceService,
  type ApplianceInfo,
} from '../../packages/nature-remo/src/services/appliance-service.js';

export {
  createLightService,
} from '../../packages/nature-remo/src/services/light-service.js';

export {
  createAirconService,
} from '../../packages/nature-remo/src/services/aircon-service.js';

// =============================================================================
// Dedup Actions - Duplicate Action Prevention (Requirement 4.5)
// =============================================================================
export {
  isSameAction,
  isDeviceControlAction,
} from '../../packages/iot-ai-agent-loop/src/loop/dedup-actions.js';

// =============================================================================
// Type Definitions
// =============================================================================
export type {
  AgentAction,
  ActionResult,
  AgentError,
} from '../../packages/iot-ai-agent-loop/src/types/actions.js';

// =============================================================================
// AlexaService - Alexa Device Control (Task 5.1, Req 1.3, 9.2)
// =============================================================================
export {
  createAlexaService,
  createAlexaRemoteForProxy,
  type AlexaService,
} from '../../packages/alexa-remote2/src/services/alexa-service.js';

export {
  loadAlexaConfig,
} from '../../packages/alexa-remote2/src/config/alexa-config.js';
