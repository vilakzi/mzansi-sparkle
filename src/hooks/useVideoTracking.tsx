import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type VideoTrackingProps = {
  postId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
};

/**
 * Ultra-lightweight video tracking - fire-and-forget approach
 * Zero impact on playback performance
 */
export const useVideoTracking = ({ postId, videoRef, isActive }: VideoTrackingProps) => {
  const hasTrackedViewRef = useRef<boolean>(false);

  const trackView = useCallback(() => {
    if (hasTrackedViewRef.current) return;
    
    hasTrackedViewRef.current = true;

    // Fire-and-forget: completely non-blocking, no await
    setTimeout(() => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        void supabase.from("post_views").insert({
          post_id: postId,
          user_id: user?.id || null,
        });
      });
    }, 0);
  }, [postId]);

  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    const video = videoRef.current;

    // Track view after 3 seconds of playback or 50% completion
    const handleTimeUpdate = () => {
      if (video.currentTime > 3 || (video.duration > 0 && video.currentTime / video.duration >= 0.5)) {
        trackView();
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [postId, isActive, videoRef, trackView]);

  return postId; // Return postId for compatibility
};
