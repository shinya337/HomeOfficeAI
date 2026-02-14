/**
 * Camera Capture Module for HomeOffice.ai
 *
 * Provides functions to capture still frames from video streams.
 * Uses Canvas API to capture frames and convert to Base64 JPEG format.
 *
 * Requirements: 2.2, 2.3
 * - 2.2: Capture still images from webcam at 5-minute intervals
 * - 2.3: Base64 encode captured images and send to POST /api/analyze
 */

/**
 * MIME type for captured images
 * @type {string}
 */
export const CAPTURE_MIME_TYPE = 'image/jpeg';

/**
 * Quality setting for JPEG encoding (0.0 to 1.0)
 * @type {number}
 */
export const CAPTURE_QUALITY = 0.8;

/**
 * Check if a video element has a ready stream for capture
 *
 * A stream is considered ready when:
 * 1. The video element exists
 * 2. The video has a srcObject (MediaStream)
 * 3. The video has non-zero dimensions (stream is producing frames)
 *
 * @param {HTMLVideoElement|null} video - The video element to check
 * @returns {boolean} True if stream is ready for capture
 */
export function isStreamReady(video) {
  if (!video) {
    return false;
  }

  if (!video.srcObject) {
    return false;
  }

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return false;
  }

  return true;
}

/**
 * Capture a single frame from a video element as a Base64 JPEG string
 *
 * Creates an off-screen canvas, draws the current video frame,
 * and exports it as a Base64-encoded JPEG data URL.
 *
 * @param {HTMLVideoElement|null} video - The video element to capture from
 * @returns {string|null} Base64 data URL (data:image/jpeg;base64,...) or null if capture fails
 *
 * @example
 * const videoElement = document.getElementById('webcam');
 * const base64Image = captureFrame(videoElement);
 * if (base64Image) {
 *   // Send to backend for analysis
 *   await analyze(base64Image);
 * }
 */
export function captureFrame(video) {
  // Validate video element and stream readiness
  if (!isStreamReady(video)) {
    return null;
  }

  // Create off-screen canvas with video dimensions
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw current video frame onto canvas
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0);

  // Export as JPEG Base64 data URL
  return canvas.toDataURL(CAPTURE_MIME_TYPE, CAPTURE_QUALITY);
}

/**
 * Capture result object containing base64 data and metadata
 * @typedef {Object} CaptureResult
 * @property {string} base64 - Base64-encoded image data URL
 * @property {string} mimeType - MIME type of the captured image
 */

/**
 * Capture a frame with metadata (base64 and mimeType)
 *
 * This function is useful when you need both the image data
 * and its MIME type for API requests.
 *
 * @param {HTMLVideoElement|null} video - The video element to capture from
 * @returns {CaptureResult|null} Capture result with base64 and mimeType, or null if capture fails
 *
 * @example
 * const result = captureFrameWithMetadata(videoElement);
 * if (result) {
 *   console.log(result.base64);    // 'data:image/jpeg;base64,...'
 *   console.log(result.mimeType);  // 'image/jpeg'
 * }
 */
export function captureFrameWithMetadata(video) {
  const base64 = captureFrame(video);

  if (!base64) {
    return null;
  }

  return {
    base64,
    mimeType: CAPTURE_MIME_TYPE,
  };
}
