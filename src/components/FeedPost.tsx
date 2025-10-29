import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Share2, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { CommentSheet } from "./CommentSheet";
import { ShareSheet } from "./ShareSheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useVideoTracking } from "@/hooks/useVideoTracking";

interface FeedPostProps {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isSaved: boolean;
  isLiked: boolean;
  isActive: boolean;
  onLike: () => void;
  onSaveToggle: () => void;
  profile?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

export const FeedPost = ({
  id,
  mediaUrl,
  mediaType,
  caption,
  likesCount,
  commentsCount,
  sharesCount,
  isSaved,
  isLiked,
  isActive,
  onLike,
  onSaveToggle,
  profile,
}: FeedPostProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // Track video engagement
  useVideoTracking({ postId: id, videoRef, isActive });

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

  const renderCaption = () => {
    if (!caption) return null;

    // Split caption by hashtags and render them as clickable
    const parts = caption.split(/(#[a-zA-Z0-9_]+)/g);
    
    return (
      <p className="mb-4 text-white text-lg font-medium">
        {parts.map((part, index) => {
          if (part.startsWith("#")) {
            const hashtagName = part.substring(1);
            return (
              <span
                key={index}
                className="text-primary cursor-pointer hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/hashtag/${hashtagName}`);
                }}
              >
                {part}
              </span>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </p>
    );
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
      
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-6 pb-24">
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
        
        
        {renderCaption()}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
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
            
            <button
              onClick={() => setShowComments(true)}
              className="flex items-center gap-2 text-white transition-transform active:scale-90"
            >
              <MessageCircle className="h-8 w-8" />
              <span className="text-lg font-semibold">{commentsCount}</span>
            </button>
            
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-2 text-white transition-transform active:scale-90"
            >
              <Share2 className="h-8 w-8" />
              <span className="text-lg font-semibold">{sharesCount}</span>
            </button>
          </div>
          
          <button
            onClick={onSaveToggle}
            className="text-white transition-transform active:scale-90"
          >
            <Bookmark
              className={cn(
                "h-8 w-8",
                isSaved && "fill-white"
              )}
            />
          </button>
        </div>
      </div>
      
      <CommentSheet 
        postId={id} 
        isOpen={showComments} 
        onClose={() => setShowComments(false)} 
      />
      
      <ShareSheet
        postId={id}
        isOpen={showShare}
        onClose={() => setShowShare(false)}
      />
    </div>
  );
};
