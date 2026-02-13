/**
 * DynamicToolBuilder Service
 *
 * Generates Function Calling tool definitions dynamically based on allowed devices.
 * This enables permission-based tool availability for the AI agent.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import type { FunctionDeclaration } from '@google-cloud/vertexai';
import type { AllowedDevice, DeviceType } from '../types/device-types.js';
import {
  getToolForDeviceType,
  getAlwaysIncludedTools,
  getAllDeviceTypes,
  getAlexaTools,
} from '../tools/tool-registry.js';

/**
 * DynamicToolBuilder service interface
 */
export interface DynamicToolBuilderService {
  /**
   * Generate tools based on allowed devices
   *
   * @param allowedDevices - List of allowed devices. undefined = all tools (backward compatibility)
   * @returns Array of FunctionDeclaration for use with Vertex AI
   */
  generateTools(
    allowedDevices: readonly AllowedDevice[] | undefined
  ): readonly FunctionDeclaration[];
}

/**
 * Create a DynamicToolBuilder service instance
 *
 * @returns DynamicToolBuilderService instance
 */
export function createDynamicToolBuilder(): DynamicToolBuilderService {
  return {
    generateTools(
      allowedDevices: readonly AllowedDevice[] | undefined
    ): readonly FunctionDeclaration[] {
      const tools: FunctionDeclaration[] = [];

      // Determine which device types to include
      let deviceTypesToInclude: DeviceType[];

      if (allowedDevices === undefined) {
        // Backward compatibility: include all device tools
        deviceTypesToInclude = getAllDeviceTypes();
      } else {
        // Get unique device types from allowed devices
        const uniqueTypes = new Set<DeviceType>();
        for (const device of allowedDevices) {
          uniqueTypes.add(device.type);
        }
        deviceTypesToInclude = Array.from(uniqueTypes);
      }

      // Build a map of allowed tool names per device type (from allowedTools)
      const allowedToolsByType = new Map<DeviceType, readonly string[] | undefined>();
      if (allowedDevices !== undefined) {
        for (const device of allowedDevices) {
          // Use the first device's allowedTools for each type
          // (multiple devices of same type share tool definitions)
          if (!allowedToolsByType.has(device.type)) {
            allowedToolsByType.set(device.type, device.allowedTools);
          }
        }
      }

      // Add tools for allowed device types
      for (const deviceType of deviceTypesToInclude) {
        const deviceAllowedTools = allowedToolsByType.get(deviceType);

        if (deviceType === 'ALEXA') {
          const alexaTools = getAlexaTools();
          if (deviceAllowedTools !== undefined) {
            tools.push(...alexaTools.filter(t => deviceAllowedTools.includes(t.name)));
          } else {
            tools.push(...alexaTools);
          }
        } else {
          const tool = getToolForDeviceType(deviceType);
          if (tool !== undefined) {
            if (deviceAllowedTools !== undefined) {
              if (deviceAllowedTools.includes(tool.name)) {
                tools.push(tool);
              }
            } else {
              tools.push(tool);
            }
          }
        }
      }

      // Always include monitoring tools
      const alwaysIncluded = getAlwaysIncludedTools();
      tools.push(...alwaysIncluded);

      return tools;
    },
  };
}
