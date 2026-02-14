/**
 * Data Model Types for Vertex AI Vision Experiment
 *
 * Defines the core data structures used throughout the application
 * for image processing, analysis results, and configuration.
 */

/**
 * Supported image MIME types
 */
export type ImageMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

/**
 * Image data structure containing Base64-encoded image and metadata
 */
export interface ImageData {
  /** Base64 encoded image data */
  base64: string;
  /** MIME type of the image (image/jpeg, image/png, etc.) */
  mimeType: ImageMimeType;
  /** Original file path of the image */
  filePath: string;
}

/**
 * Result of image analysis from Vertex AI Gemini Vision API
 */
export interface AnalysisResult {
  /** Generated text description or analysis */
  text: string;
  /** Model name used for the analysis */
  model: string;
  /** Processing time in milliseconds */
  durationMs: number;
}

/**
 * Application configuration loaded from environment variables
 */
export interface Config {
  /** Google Cloud Project ID */
  projectId: string;
  /** Vertex AI region/location */
  location: string;
  /** Gemini model name */
  model: string;
  /** Debug mode flag for verbose logging */
  debug: boolean;
}

/**
 * Configuration for VisionClient extending base Config
 * with optional timeout settings
 */
export interface VisionClientConfig extends Config {
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}
