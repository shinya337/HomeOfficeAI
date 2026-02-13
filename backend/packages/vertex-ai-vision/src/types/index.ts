/**
 * Type definitions for Vertex AI Vision Experiment
 *
 * Re-exports all types from individual modules for convenient importing.
 */

// Result types
export type { Result, Success, Failure } from './result.js';
export {
  ok,
  err,
  isOk,
  isErr,
} from './result.js';

// Error types
export type {
  ImageError,
  ImageErrorCode,
  VisionError,
  VisionErrorCode,
  ConfigError,
  ConfigErrorCode,
} from './result.js';

// Data model types
export type {
  ImageMimeType,
  ImageData,
  AnalysisResult,
  Config,
  VisionClientConfig,
} from './models.js';
