import { useEffect, useRef } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";

interface FeedPostProps {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string;
  likesCount: number;
  isLiked: boolean;
  isActive: boolean;
  onLike: () => void;
  profile?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

export const FeedPost = ({
  mediaUrl,
  mediaType,
  caption,
  likesCount,
  isLiked,
  isActive,
  onLike,
  profile,
}: FeedPostProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();

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
        {profile && (
          <div 
            className="flex items-center gap-3 mb-4 cursor-pointer"
            onClick={() => navigate(`/profile/${profile.username}`)}
          >
            <Avatar className="h-10 w-10 border-2 border-white">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {profile.display_name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-white font-semibold text-lg">{profile.username}</span>
          </div>
        )}
        
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
