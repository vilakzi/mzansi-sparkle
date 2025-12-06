import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type VideoTrackingProps = {
  postId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
};

export const useVideoTracking = ({ postId, videoRef, isActive }: VideoTrackingProps) => {
  const sessionIdRef = useRef<string>(`${Date.now()}-${Math.random()}`);
  const startTimeRef = useRef<number>(0);
  const hasTrackedViewRef = useRef<boolean>(false);
  const lastCheckTimeRef = useRef<number>(0);

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
        const completionRate = 1; // 100% completion
        await trackView(sessionId, Math.floor(watchDuration), completionRate);
        hasTrackedViewRef.current = true;
      }
    };

    const handleTimeUpdate = async () => {
      // Debounce: only check once per second to prevent excessive DB writes
      const now = Date.now();
      if (now - lastCheckTimeRef.current < 1000) return;
      lastCheckTimeRef.current = now;

      // Already tracked, skip further checks
      if (hasTrackedViewRef.current) return;

      if (video.currentTime > 0 && video.duration > 0) {
        const currentCompletionRate = video.currentTime / video.duration;
        
        // Track view when user watches at least 50% or 3 seconds (whichever comes first)
        const watchedEnough = currentCompletionRate >= 0.5 || video.currentTime >= 3;
        
        if (watchedEnough) {
          const currentWatchTime = startTimeRef.current 
            ? watchDuration + (Date.now() - startTimeRef.current) / 1000
            : watchDuration;
          
          await trackView(sessionId, Math.floor(currentWatchTime), currentCompletionRate);
          hasTrackedViewRef.current = true;
        }
      }
    };

    const trackView = async (sessionId: string, duration: number, completionRate: number) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        // Only insert basic view tracking - post_views table doesn't have watch_duration/completion_rate
        await supabase.from("post_views").insert({
          post_id: postId,
          user_id: user?.id || null,
        });
        
        console.log('[useVideoTracking] View tracked:', {
          postId,
          userId: user?.id,
          sessionId,
          watchDuration: duration,
          completionRate: completionRate.toFixed(2),
        });
      } catch (error) {
        console.error("Error tracking video view:", error);
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
      
      // Track final duration on cleanup
      if (startTimeRef.current) {
        handlePause();
      }
    };
  }, [postId, isActive]);

  return sessionIdRef.current;
};
