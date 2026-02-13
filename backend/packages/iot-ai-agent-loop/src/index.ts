/**
 * IoT AI Agent Loop - CLI Entry Point
 *
 * Vertex AI (Gemini) の Function Calling を活用し、
 * 画像分析に基づいてIoTデバイス（照明・エアコン）を自律制御する
 * Agentic AI 実験モジュール。
 *
 * Usage: npx tsx src/index.ts --image-dir <path> [--light-id <id>] [--aircon-id <id>]
 *
 * Requirements: 6.1, 6.3, 6.4
 */

import { initializeApp } from './main.js';

initializeApp(process.argv).catch((error: unknown) => {
  console.error('[Fatal Error]', error);
  process.exit(1);
});
