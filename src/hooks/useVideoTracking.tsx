import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type VideoTrackingProps = {
  postId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
};

/**
 * Simplified video tracking hook - tracks views when video is watched
 * Uses non-blocking approach to avoid impacting playback performance
 */
export const useVideoTracking = ({ postId, videoRef, isActive }: VideoTrackingProps) => {
  const hasTrackedViewRef = useRef<boolean>(false);

  const trackView = useCallback(async () => {
    if (hasTrackedViewRef.current) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Non-blocking tracking - don't wait for response
      queueMicrotask(async () => {
        try {
          await supabase.from("post_views").insert({
            post_id: postId,
            user_id: user?.id || null,
          });
        } catch (err) {
          // Silently fail - tracking is not critical
        }
      });

      hasTrackedViewRef.current = true;
    } catch (error) {
      // Silently fail
    }
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
