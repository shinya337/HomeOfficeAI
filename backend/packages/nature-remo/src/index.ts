/**
 * Nature Remo API Experiment - Entry Point
 *
 * CLI tool for testing Nature Remo Cloud API functionality.
 * Part of HomeOffice.ai IoT integration research.
 *
 * Usage: npx tsx src/index.ts <command> [options]
 *
 * Commands:
 *   devices                     List all devices and sensor values
 *   appliances                  List all appliances
 *   aircon <id> [options]       Control air conditioner
 *   light <id> <on|off>         Control light
 *
 * Requirements: 1.1, 1.3, 7.1
 */

import { main } from './main.js';

main().catch((error: unknown) => {
  console.error('[Fatal Error]', error);
  process.exit(1);
});
