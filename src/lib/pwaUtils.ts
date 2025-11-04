/**
 * PWA utility functions for cache management and offline support
 */

// Check if app is running as installed PWA
export const isPWA = (): boolean => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true ||
         document.referrer.includes('android-app://');
};

// Get cache statistics
export const getCacheStats = async (): Promise<{
  videoCacheSize: number;
  imageCacheSize: number;
  totalCacheSize: number;
}> => {
  if (!('caches' in window)) {
    return { videoCacheSize: 0, imageCacheSize: 0, totalCacheSize: 0 };
  }

  let videoCacheSize = 0;
  let imageCacheSize = 0;
  let totalCacheSize = 0;

  try {
    const cacheNames = await caches.keys();
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      
      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          const size = blob.size;
          totalCacheSize += size;
          
          if (cacheName.includes('video')) {
            videoCacheSize += size;
          } else if (cacheName.includes('image')) {
            imageCacheSize += size;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error calculating cache stats:', error);
  }

  return { videoCacheSize, imageCacheSize, totalCacheSize };
};

// Clear old caches
export const clearOldCaches = async (): Promise<void> => {
  if (!('caches' in window)) return;

  try {
    const cacheNames = await caches.keys();
    const cachesToDelete = cacheNames.filter(name => 
      !name.includes('-v1') // Keep current version caches
    );
    
    await Promise.all(
      cachesToDelete.map(cacheName => caches.delete(cacheName))
    );
    
    console.log(`[PWA] Cleared ${cachesToDelete.length} old caches`);
  } catch (error) {
    console.error('Error clearing old caches:', error);
  }
};

// Prefetch critical videos
export const prefetchVideos = async (videoUrls: string[]): Promise<void> => {
  if (!('caches' in window)) return;

  try {
    const cache = await caches.open('video-cache-v1');
    
    console.log(`[PWA] Prefetching ${videoUrls.length} videos...`);
    
    await Promise.all(
      videoUrls.map(async (url) => {
        try {
          // Check if already cached
          const cachedResponse = await cache.match(url);
          if (!cachedResponse) {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
              console.log(`[PWA] Cached video: ${url}`);
            }
          }
        } catch (error) {
          console.error(`[PWA] Failed to cache video ${url}:`, error);
        }
      })
    );
  } catch (error) {
    console.error('Error prefetching videos:', error);
  }
};

// Format bytes to human readable
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

// Check network status
export const getNetworkStatus = (): {
  online: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
} => {
  const connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;
  
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType,
    downlink: connection?.downlink,
    rtt: connection?.rtt,
  };
};

// Log PWA status
export const logPWAStatus = async (): Promise<void> => {
  console.log('[PWA] Status:', {
    isInstalled: isPWA(),
    online: navigator.onLine,
    cacheAvailable: 'caches' in window,
    serviceWorkerAvailable: 'serviceWorker' in navigator,
  });

  if ('caches' in window) {
    const stats = await getCacheStats();
    console.log('[PWA] Cache Stats:', {
      videos: formatBytes(stats.videoCacheSize),
      images: formatBytes(stats.imageCacheSize),
      total: formatBytes(stats.totalCacheSize),
    });
  }

  const network = getNetworkStatus();
  console.log('[PWA] Network:', network);
};
