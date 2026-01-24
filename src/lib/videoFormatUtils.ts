/**
 * Video format detection and browser compatibility utilities
 */

export interface VideoFormatSupport {
  mp4: boolean;
  webm: boolean;
  ogg: boolean;
  mov: boolean;
  hevc: boolean;
}

export interface FormatCheckResult {
  isSupported: boolean;
  format: string;
  codec?: string;
  fallbackMessage?: string;
}

// Common video MIME types and their codecs
const VIDEO_FORMATS = {
  'video/mp4': {
    name: 'MP4',
    codecs: ['avc1.42E01E', 'avc1.4D401E', 'avc1.64001E'], // H.264 variants
  },
  'video/webm': {
    name: 'WebM',
    codecs: ['vp8', 'vp9', 'vp09.00.10.08'],
  },
  'video/ogg': {
    name: 'OGG',
    codecs: ['theora'],
  },
  'video/quicktime': {
    name: 'QuickTime (MOV)',
    codecs: ['avc1'],
  },
  'video/mp4; codecs="hvc1"': {
    name: 'HEVC/H.265',
    codecs: ['hvc1', 'hev1'],
  },
} as const;

/**
 * Check browser support for common video formats
 */
export function getVideoFormatSupport(): VideoFormatSupport {
  const video = document.createElement('video');
  
  return {
    mp4: video.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '',
    webm: video.canPlayType('video/webm; codecs="vp8"') !== '' || 
          video.canPlayType('video/webm; codecs="vp9"') !== '',
    ogg: video.canPlayType('video/ogg; codecs="theora"') !== '',
    mov: video.canPlayType('video/quicktime') !== '' ||
         video.canPlayType('video/mp4') !== '', // MOV often works as MP4
    hevc: video.canPlayType('video/mp4; codecs="hvc1"') !== '' ||
          video.canPlayType('video/mp4; codecs="hev1"') !== '',
  };
}

/**
 * Check if a specific video URL/MIME type is likely supported
 */
export function checkVideoFormatSupport(mimeType: string, url?: string): FormatCheckResult {
  const video = document.createElement('video');
  
  // Infer format from URL extension if MIME type not provided
  let format = mimeType;
  if (!format && url) {
    const extension = url.split('.').pop()?.toLowerCase().split('?')[0];
    switch (extension) {
      case 'mp4':
      case 'm4v':
        format = 'video/mp4';
        break;
      case 'webm':
        format = 'video/webm';
        break;
      case 'mov':
        format = 'video/quicktime';
        break;
      case 'ogg':
      case 'ogv':
        format = 'video/ogg';
        break;
      default:
        format = 'video/mp4'; // Default assumption
    }
  }

  const canPlay = video.canPlayType(format);
  const isSupported = canPlay === 'probably' || canPlay === 'maybe';

  let fallbackMessage: string | undefined;
  
  if (!isSupported) {
    const formatInfo = VIDEO_FORMATS[format as keyof typeof VIDEO_FORMATS];
    const formatName = formatInfo?.name || format;
    
    if (format === 'video/quicktime' || url?.toLowerCase().includes('.mov')) {
      fallbackMessage = `${formatName} videos may not play in this browser. Try uploading MP4 or WebM format.`;
    } else if (format.includes('hvc1') || format.includes('hev1')) {
      fallbackMessage = 'HEVC/H.265 video is not supported in this browser. Please use H.264/MP4 format.';
    } else {
      fallbackMessage = `This video format (${formatName}) is not supported. Please try MP4 or WebM format.`;
    }
  }

  return {
    isSupported,
    format,
    fallbackMessage,
  };
}

/**
 * Get user-friendly error message based on error type and format
 */
export function getVideoErrorMessage(
  errorCode: number | undefined,
  mediaUrl: string
): { type: string; message: string; suggestion?: string } {
  const extension = mediaUrl.split('.').pop()?.toLowerCase().split('?')[0] || '';
  const formatCheck = checkVideoFormatSupport('', mediaUrl);
  
  // Check if it's a format issue first
  if (!formatCheck.isSupported && formatCheck.fallbackMessage) {
    return {
      type: 'Format Not Supported',
      message: formatCheck.fallbackMessage,
      suggestion: 'Try re-uploading in MP4 (H.264) format for best compatibility.',
    };
  }

  const isOnline = navigator.onLine;
  
  if (!isOnline) {
    return {
      type: 'No Connection',
      message: 'You appear to be offline.',
      suggestion: 'Check your internet connection and try again.',
    };
  }

  switch (errorCode) {
    case MediaError.MEDIA_ERR_ABORTED:
      return {
        type: 'Playback Stopped',
        message: 'Video playback was interrupted.',
        suggestion: 'Tap to retry playing.',
      };
    
    case MediaError.MEDIA_ERR_NETWORK:
      return {
        type: 'Connection Error',
        message: 'Failed to load video due to network issues.',
        suggestion: 'Check your connection and tap to retry.',
      };
    
    case MediaError.MEDIA_ERR_DECODE:
      // This is often a format/codec issue
      if (['mov', 'quicktime'].includes(extension)) {
        return {
          type: 'Format Issue',
          message: 'This MOV video cannot be decoded by your browser.',
          suggestion: 'Videos work best in MP4 format.',
        };
      }
      return {
        type: 'Decode Error',
        message: 'This video could not be decoded.',
        suggestion: 'The video file may be corrupted or use an unsupported codec.',
      };
    
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      if (['mov', 'quicktime', 'm4v'].includes(extension)) {
        return {
          type: 'Format Not Supported',
          message: 'QuickTime videos may not work in all browsers.',
          suggestion: 'For best compatibility, use MP4 or WebM format.',
        };
      }
      return {
        type: 'Video Unavailable',
        message: 'This video could not be loaded.',
        suggestion: 'The video may have been removed or the link is broken.',
      };
    
    default:
      return {
        type: 'Playback Error',
        message: 'Unable to play this video.',
        suggestion: 'Tap retry or check back later.',
      };
  }
}

/**
 * Check if video can be played before attempting playback
 */
export async function probeVideoPlayability(url: string): Promise<{
  canPlay: boolean;
  duration?: number;
  width?: number;
  height?: number;
  error?: string;
}> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    const timeout = setTimeout(() => {
      video.src = '';
      resolve({ canPlay: false, error: 'Video metadata load timeout' });
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      resolve({
        canPlay: true,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      video.src = '';
    };

    video.onerror = () => {
      clearTimeout(timeout);
      const error = video.error;
      resolve({
        canPlay: false,
        error: error?.message || 'Failed to load video metadata',
      });
      video.src = '';
    };

    video.src = url;
  });
}

/**
 * Validate video format during upload
 */
export function validateVideoFormat(file: File): {
  isValid: boolean;
  warning?: string;
  error?: string;
} {
  const supportedTypes = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
  ];

  const mimeType = file.type.toLowerCase();
  
  if (!mimeType.startsWith('video/')) {
    return {
      isValid: false,
      error: 'File must be a video.',
    };
  }

  if (!supportedTypes.includes(mimeType)) {
    return {
      isValid: false,
      error: `Video format "${mimeType}" is not supported. Please use MP4, WebM, or MOV.`,
    };
  }

  // Check browser support and warn for MOV/QuickTime
  const formatCheck = checkVideoFormatSupport(mimeType);
  
  if (mimeType === 'video/quicktime') {
    return {
      isValid: true,
      warning: 'MOV videos may not play on all devices. Consider using MP4 for best compatibility.',
    };
  }

  if (!formatCheck.isSupported) {
    return {
      isValid: true,
      warning: formatCheck.fallbackMessage,
    };
  }

  return { isValid: true };
}
