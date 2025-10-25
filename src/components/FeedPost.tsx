import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedPostProps {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string;
  likesCount: number;
  isActive: boolean;
  onLike: () => void;
}

export const FeedPost = ({
  mediaUrl,
  mediaType,
  caption,
  likesCount,
  isActive,
  onLike,
}: FeedPostProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      if (isActive) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  }, [isActive]);

  const handleLike = () => {
    setIsLiked(!isLiked);
    onLike();
  };

  return (
    <div className="relative h-screen w-full snap-start snap-always">
      {mediaType === "video" ? (
        <video
          ref={videoRef}
          src={mediaUrl}
          className="h-full w-full object-cover"
          loop
          playsInline
          muted
        />
      ) : (
        <img
          src={mediaUrl}
          alt="Post"
          className="h-full w-full object-cover"
        />
      )}
      
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-6">
        {caption && (
          <p className="mb-4 text-white text-lg font-medium">{caption}</p>
        )}
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleLike}
            className="flex items-center gap-2 text-white transition-transform active:scale-90"
          >
            <Heart
              className={cn(
                "h-8 w-8",
                isLiked && "fill-red-500 text-red-500"
              )}
            />
            <span className="text-lg font-semibold">{likesCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
