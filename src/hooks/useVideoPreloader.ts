import { useEffect, useRef } from 'react';

interface Post {
  id: string;
  media_url: string;
  media_type: 'image' | 'video';
}

interface UseVideoPreloaderOptions {
  posts: Post[];
  currentIndex: number;
  preloadCount?: number;
}

/**
 * Preloads video content for nearby posts to improve scrolling experience
 * Uses link preload for next videos and cleans up distant ones
 */
export function useVideoPreloader({
  posts,
  currentIndex,
  preloadCount = 2,
}: UseVideoPreloaderOptions) {
  const preloadedUrls = useRef<Set<string>>(new Set());
  const preloadElements = useRef<Map<string, HTMLLinkElement>>(new Map());

  useEffect(() => {
    if (posts.length === 0) return;

    // Check connection quality
    const connection = (navigator as any).connection;
    const effectiveType = connection?.effectiveType || '4g';
    const isSlowConnection = ['slow-2g', '2g', '3g'].includes(effectiveType);
    
    // Reduce preload count on slow connections
    const actualPreloadCount = isSlowConnection ? 1 : preloadCount;

    // Calculate range to preload (current + next N posts)
    const preloadStart = currentIndex;
    const preloadEnd = Math.min(posts.length - 1, currentIndex + actualPreloadCount);

    // Get video URLs to preload
    const urlsToPreload: string[] = [];
    for (let i = preloadStart; i <= preloadEnd; i++) {
      const post = posts[i];
      if (post?.media_type === 'video' && !preloadedUrls.current.has(post.media_url)) {
        urlsToPreload.push(post.media_url);
      }
    }

    // Preload new videos using link preload
    urlsToPreload.forEach((url) => {
      if (preloadElements.current.has(url)) return;

      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'video';
      link.href = url;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      
      preloadElements.current.set(url, link);
      preloadedUrls.current.add(url);
    });

    // Clean up preload elements for posts that are far behind
    const cleanupThreshold = currentIndex - 3;
    preloadElements.current.forEach((link, url) => {
      const postIndex = posts.findIndex(p => p.media_url === url);
      if (postIndex !== -1 && postIndex < cleanupThreshold) {
        link.remove();
        preloadElements.current.delete(url);
        preloadedUrls.current.delete(url);
      }
    });

    return () => {
      // Cleanup on unmount
      preloadElements.current.forEach((link) => link.remove());
      preloadElements.current.clear();
      preloadedUrls.current.clear();
    };
  }, [posts, currentIndex, preloadCount]);

  // Also preload using video elements for better browser compatibility
  useEffect(() => {
    if (posts.length === 0) return;

    const preloadStart = currentIndex + 1;
    const preloadEnd = Math.min(posts.length - 1, currentIndex + preloadCount);

    for (let i = preloadStart; i <= preloadEnd; i++) {
      const post = posts[i];
      if (post?.media_type !== 'video') continue;

      // Create a hidden video element to trigger browser preloading
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.src = post.media_url;
      
      // Just load metadata, don't need to keep element
      video.onloadedmetadata = () => {
        video.src = '';
        video.remove();
      };
      
      // Timeout to prevent hanging
      setTimeout(() => {
        if (video.parentNode || video.src) {
          video.src = '';
          video.remove();
        }
      }, 5000);
    }
  }, [posts, currentIndex, preloadCount]);
}

