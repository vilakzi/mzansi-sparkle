import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Debounce helper
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

type VideoTrackingProps = {
  postId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
};

export const useVideoTracking = ({ postId, videoRef, isActive }: VideoTrackingProps) => {
  const sessionIdRef = useRef<string>(`${Date.now()}-${Math.random()}`);
  const startTimeRef = useRef<number>(0);
  const hasTrackedViewRef = useRef<boolean>(false);
  const batchQueueRef = useRef<Array<any>>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const flushBatch = useCallback(async () => {
    if (batchQueueRef.current.length === 0) return;

    try {
      await supabase.from("post_views").insert(batchQueueRef.current);
      batchQueueRef.current = [];
    } catch (error) {
      console.error("Error tracking video views:", error);
    }
  }, []);

  const trackView = useCallback(async (sessionId: string, duration: number, completionRate: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Add to batch queue
      batchQueueRef.current.push({
        post_id: postId,
        user_id: user?.id || null,
        session_id: sessionId,
        watch_duration: duration,
        completion_rate: completionRate,
      });

      // Clear existing timeout
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }

      // Flush batch after 2 seconds of inactivity
      flushTimeoutRef.current = setTimeout(flushBatch, 2000);
    } catch (error) {
      console.error("Error queueing video view:", error);
    }
  }, [postId, flushBatch]);

  // Debounced track view for time updates
  const debouncedTrackView = useCallback(
    debounce((sessionId: string, duration: number, rate: number) => {
      trackView(sessionId, duration, rate);
    }, 1000),
    [trackView]
  );

  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    const video = videoRef.current;
    const sessionId = sessionIdRef.current;
    let watchDuration = 0;

    const handlePlay = () => {
      startTimeRef.current = Date.now();
    };

    const handlePause = () => {
      if (startTimeRef.current) {
        watchDuration += (Date.now() - startTimeRef.current) / 1000;
        startTimeRef.current = 0;
      }
    };

    const handleEnded = async () => {
      handlePause();
      
      if (!hasTrackedViewRef.current) {
        const completionRate = 1;
        await trackView(sessionId, Math.floor(watchDuration), completionRate);
        hasTrackedViewRef.current = true;
      }
    };

    const handleTimeUpdate = () => {
      if (video.currentTime > 0 && video.duration > 0) {
        const currentCompletionRate = video.currentTime / video.duration;
        
        if (!hasTrackedViewRef.current) {
          const watchedEnough = currentCompletionRate >= 0.5 || video.currentTime >= 3;
          
          if (watchedEnough) {
            const currentWatchTime = startTimeRef.current 
              ? watchDuration + (Date.now() - startTimeRef.current) / 1000
              : watchDuration;
            
            debouncedTrackView(sessionId, Math.floor(currentWatchTime), currentCompletionRate);
            hasTrackedViewRef.current = true;
          }
        }
      }
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      
      if (startTimeRef.current) {
        handlePause();
      }

      // Flush any remaining batch on cleanup
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      flushBatch();
    };
  }, [postId, isActive, videoRef, flushBatch, debouncedTrackView]);

  return sessionIdRef.current;
};
