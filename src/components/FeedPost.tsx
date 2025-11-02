import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, Play, Pause, MoreVertical, Flag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { CommentSheet } from "./CommentSheet";
import { ShareSheet } from "./ShareSheet";
import { ReportDialog } from "./ReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useVideoTracking } from "@/hooks/useVideoTracking";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

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
  onDelete?: () => void;
  userId?: string;
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
  onDelete,
  userId,
  profile,
}: FeedPostProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showHeart, setShowHeart] = useState(false);
  const lastTapRef = useRef<number>(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const wasPlayingRef = useRef(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Track video engagement
  useVideoTracking({ postId: id, videoRef, isActive });

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  // Handle video play/pause based on isActive state
  useEffect(() => {
    if (!videoRef.current || mediaType !== "video") return;
    
    if (isActive) {
      videoRef.current.play().catch(() => {
        // Ignore autoplay errors
      });
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isActive, mediaType]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateProgress = () => {
      if (!isScrubbing) {
        const progress = (video.currentTime / video.duration) * 100;
        setProgress(progress);
        setCurrentTime(video.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    return () => {
      video.removeEventListener('timeupdate', updateProgress);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [isScrubbing]);

  const handleVideoClick = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // Double tap - like
      handleLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 1000);
    } else {
      // Single tap - play/pause
      if (videoRef.current) {
        if (isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
        } else {
          videoRef.current.play();
          setIsPlaying(true);
        }
      }
    }

    lastTapRef.current = now;
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeekBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (videoRef.current) {
      wasPlayingRef.current = !videoRef.current.paused;
      videoRef.current.pause();
    }
    
    setIsScrubbing(true);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const initialX = e.clientX - rect.left;
    const initialPercentage = Math.max(0, Math.min(1, initialX / rect.width));
    
    if (videoRef.current) {
      const newTime = initialPercentage * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      setProgress(initialPercentage * 100);
      setCurrentTime(newTime);
    }
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const moveX = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, moveX / rect.width));
      
      if (videoRef.current) {
        const newTime = percentage * videoRef.current.duration;
        videoRef.current.currentTime = newTime;
        setProgress(percentage * 100);
        setCurrentTime(newTime);
      }
    };
    
    const handleMouseUp = () => {
      setIsScrubbing(false);
      if (videoRef.current && wasPlayingRef.current) {
        videoRef.current.play();
        setIsPlaying(true);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSeekBarTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (videoRef.current) {
      wasPlayingRef.current = !videoRef.current.paused;
      videoRef.current.pause();
    }
    
    setIsScrubbing(true);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, touchX / rect.width));
    
    if (videoRef.current) {
      const newTime = percentage * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      setProgress(percentage * 100);
      setCurrentTime(newTime);
    }
  };

  const handleSeekBarTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!isScrubbing) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, touchX / rect.width));
    
    if (videoRef.current) {
      const newTime = percentage * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      setProgress(percentage * 100);
      setCurrentTime(newTime);
    }
  };

  const handleSeekBarTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setIsScrubbing(false);
    if (videoRef.current && wasPlayingRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekToPercentage = (percentage: number) => {
    if (videoRef.current) {
      const newTime = percentage * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      setProgress(percentage * 100);
      setCurrentTime(newTime);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLike = () => {
    onLike();
  };

  const renderCaption = () => {
    if (!caption) return null;

    // Split caption by hashtags and render them as clickable
    const parts = caption.split(/(#[a-zA-Z0-9_]+)/g);
    
    return (
      <p className="mb-4 text-white text-lg font-medium pointer-events-auto">
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
        <div className="relative h-full w-full">
          <div className="absolute inset-0 pointer-events-none" onClick={handleVideoClick}>
            <div className="w-full h-full pointer-events-auto" />
          </div>
          <video
            ref={videoRef}
            src={mediaUrl}
            className="h-full w-full object-cover pointer-events-none"
            loop
            playsInline
            muted={isMuted}
          />

          {/* Play/Pause indicator */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/50 rounded-full p-4">
                <Play className="h-16 w-16 text-white" fill="white" />
              </div>
            </div>
          )}

          {/* Double tap heart animation */}
          {showHeart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Heart 
                className="h-32 w-32 text-red-500 animate-ping" 
                fill="red"
              />
            </div>
          )}

          {/* Volume control */}
          <button
            onClick={toggleMute}
            className="absolute top-6 right-16 bg-black/50 rounded-full p-3 text-white transition-transform active:scale-90 z-10 pointer-events-auto"
          >
            {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          </button>

          {/* More options menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-6 right-6 bg-black/50 rounded-full text-white hover:bg-black/70 z-10 pointer-events-auto"
              >
                <MoreVertical className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[100] bg-background">
              {currentUserId === userId && onDelete && (
                <DropdownMenuItem 
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowReport(true)}>
                <Flag className="h-4 w-4 mr-2" />
                Report Post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <img
          src={mediaUrl}
          alt="Post"
          className="h-full w-full object-cover"
        />
      )}
      
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-6 pb-32 pointer-events-none z-10">
        {profile && (
          <div className="mb-4 pointer-events-auto">
            <Avatar 
              className="h-12 w-12 border-2 border-white cursor-pointer transition-transform active:scale-90"
              onClick={() => navigate(`/profile/${profile.username}`)}
            >
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {profile.display_name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
        
        
        {renderCaption()}
        
        <div className="flex items-center justify-between mb-2 pointer-events-auto">
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

      {/* Interactive seekbar - positioned after gradient to ensure visibility */}
      {mediaType === 'video' && (
        <div className="absolute bottom-24 left-0 right-0 px-4 z-[70] pointer-events-auto">
          <div className="flex items-center gap-2 text-white text-xs mb-1">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div 
            className="relative h-1 bg-white/30 rounded-full cursor-pointer group py-3"
            onMouseDown={handleSeekBarMouseDown}
            onTouchStart={handleSeekBarTouch}
            onTouchMove={handleSeekBarTouchMove}
            onTouchEnd={handleSeekBarTouchEnd}
          >
            <div 
              className="h-1 bg-white rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
        </div>
      )}
      
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

      <ReportDialog
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        postId={id}
      />
    </div>
  );
};
