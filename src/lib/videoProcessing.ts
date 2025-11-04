/**
 * Video processing utilities for compression and validation
 * Production-grade video handling for social media platform
 */

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_DURATION = 60; // 60 seconds
const MAX_VIDEO_WIDTH = 1280;
const MAX_VIDEO_HEIGHT = 720;

export interface VideoValidationResult {
  isValid: boolean;
  error?: string;
  duration?: number;
  width?: number;
  height?: number;
}

/**
 * Validate video file before upload
 */
export async function validateVideoFile(file: File): Promise<VideoValidationResult> {
  // Check file size
  if (file.size > MAX_VIDEO_SIZE) {
    return {
      isValid: false,
      error: `Video must be under 50MB (current: ${(file.size / 1024 / 1024).toFixed(1)}MB)`
    };
  }

  // Check file type
  if (!file.type.startsWith('video/')) {
    return {
      isValid: false,
      error: 'File must be a video'
    };
  }

  // Get video metadata
  try {
    const metadata = await getVideoMetadata(file);

    // Check duration
    if (metadata.duration > MAX_VIDEO_DURATION) {
      return {
        isValid: false,
        error: `Video must be under ${MAX_VIDEO_DURATION} seconds (current: ${Math.floor(metadata.duration)}s)`
      };
    }

    return {
      isValid: true,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Unable to read video file. Please try a different video.'
    };
  }
}

/**
 * Get video metadata (duration, dimensions)
 */
export function getVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight
      });
    };

    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Check if video needs compression based on dimensions
 */
export async function shouldCompressVideo(file: File): Promise<boolean> {
  try {
    const metadata = await getVideoMetadata(file);
    return metadata.width > MAX_VIDEO_WIDTH || metadata.height > MAX_VIDEO_HEIGHT;
  } catch {
    return false;
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
