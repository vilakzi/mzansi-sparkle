import { useEffect, useState } from "react";

interface BufferIndicatorProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  progress: number;
}

export const BufferIndicator = ({ videoRef, progress }: BufferIndicatorProps) => {
  const [bufferedProgress, setBufferedProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateBuffer = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const duration = video.duration;
        if (duration > 0) {
          setBufferedProgress((bufferedEnd / duration) * 100);
        }
      }
    };

    video.addEventListener('progress', updateBuffer);
    video.addEventListener('loadedmetadata', updateBuffer);
    
    // Initial check
    updateBuffer();

    return () => {
      video.removeEventListener('progress', updateBuffer);
      video.removeEventListener('loadedmetadata', updateBuffer);
    };
  }, [videoRef]);

  return (
    <div 
      className="absolute top-1/2 -translate-y-1/2 h-1 bg-foreground/20 rounded-full transition-all"
      style={{ width: `${bufferedProgress}%` }}
    />
  );
};
