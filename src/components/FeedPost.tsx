import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, Play, Pause, MoreVertical, Flag, Trash2, RefreshCw } from "lucide-react";
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
  const hasInitializedRef = useRef(false);
  const preloadedRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);
  const [mediaError, setMediaError] = useState<{
    type: string;
    message: string;
    isNetworkError: boolean;
  } | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasAutoRetried, setHasAutoRetried] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(9 / 16); // Default to vertical
  
  const MAX_RETRIES = 1;

  // Track video engagement
  useVideoTracking({ postId: id, videoRef, isActive });

  // Enhanced media error handling
  const handleMediaError = () => {
    const video = videoRef.current;
    if (!video) return;

    const error = video.error;
    console.error('[FeedPost] Video loading error:', { postId: id, error: error?.message });

    const isOnline = navigator.onLine;
    let errorType = 'Unknown Error';
    let errorMessage = 'Unable to load video. Please try again.';
    let isNetworkError = false;

    if (!isOnline) {
      errorType = 'Network Error';
      errorMessage = 'No internet connection. Please check your network.';
      isNetworkError = true;
    } else if (error) {
      switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorType = 'Playback Aborted';
          errorMessage = 'Video playback was aborted.';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorType = 'Network Error';
          errorMessage = 'Network error while loading video.';
          isNetworkError = true;
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorType = 'Decode Error';
          errorMessage = 'Video format not supported.';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorType = 'Source Not Found';
          errorMessage = 'Video not available.';
          break;
      }
    }

    if (retryCount < MAX_RETRIES && isOnline) {
      setRetryCount(prev => prev + 1);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.load();
      }, 1000);
    } else {
      setMediaError({ type: errorType, message: errorMessage, isNetworkError });
      
      if (!hasAutoRetried && isOnline) {
        setTimeout(() => {
          setHasAutoRetried(true);
          setMediaError(null);
          setRetryCount(0);
          if (videoRef.current) videoRef.current.load();
        }, 2000);
      }
    }
  };

  // Handle buffering states
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mediaType !== 'video') return;

    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleError = () => handleMediaError();
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      // Calculate aspect ratio for proper display
      if (video.videoWidth && video.videoHeight) {
        setVideoAspectRatio(video.videoWidth / video.videoHeight);
      }
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [mediaType, retryCount]);

  // Preload video
  useEffect(() => {
    if (mediaType === 'video' && !preloadedRef.current && videoRef.current) {
      videoRef.current.preload = 'auto';
      videoRef.current.load();
      preloadedRef.current = true;
    }
  }, [mediaType]);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  // Handle initial video play
  useEffect(() => {
    if (videoRef.current && mediaType === "video" && isActive && !hasInitializedRef.current) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      hasInitializedRef.current = true;
    }
  }, [mediaType, isActive]);

  // Handle video play/pause when isActive changes
  useEffect(() => {
    if (!videoRef.current || mediaType !== "video") return;
    
    if (isActive) {
      videoRef.current.play().catch(() => {});
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

    video.addEventListener('timeupdate', updateProgress);
    return () => video.removeEventListener('timeupdate', updateProgress);
  }, [isScrubbing]);

  const handleVideoClick = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      handleLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 1000);
    } else {
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
    setIsScrubbing(false);
    if (videoRef.current && wasPlayingRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
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

    const parts = caption.split(/(#[a-zA-Z0-9_]+)/g);
    
    return (
      <p className="mb-3 text-foreground text-base font-medium pointer-events-auto line-clamp-2">
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

  // Determine if video is vertical or horizontal
  const isVerticalVideo = videoAspectRatio < 1;

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full snap-start snap-always bg-background flex items-center justify-center overflow-hidden">
      {/* Media container with proper aspect ratio handling */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {mediaType === "video" ? (
          <>
            {mediaError ? (
              <div className="flex flex-col items-center justify-center text-foreground p-6 space-y-4">
                <div className="text-center space-y-2">
                  <p className="text-lg font-semibold text-destructive">{mediaError.type}</p>
                  <p className="text-sm text-muted-foreground">{mediaError.message}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMediaError(null);
                    setRetryCount(0);
                    setHasAutoRetried(false);
                    if (videoRef.current) videoRef.current.load();
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  className={cn(
                    "max-h-full max-w-full will-change-transform",
                    isVerticalVideo ? "h-full w-auto" : "w-full h-auto"
                  )}
                  style={{ objectFit: 'contain' }}
                  loop
                  playsInline
                  muted={isMuted}
                  preload="auto"
                  onClick={handleVideoClick}
                />

                {/* Buffering indicator */}
                {isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <div className="bg-black/60 rounded-full p-3">
                      <RefreshCw className="h-6 w-6 text-foreground animate-spin" />
                    </div>
                  </div>
                )}

                {/* Play/Pause indicator */}
                {!isPlaying && !isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 rounded-full p-4">
                      <Play className="h-16 w-16 text-foreground" fill="white" />
                    </div>
                  </div>
                )}

                {/* Double tap heart animation */}
                {showHeart && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Heart className="h-32 w-32 text-destructive animate-ping" fill="currentColor" />
                  </div>
                )}

                {/* Volume control */}
                <button
                  onClick={toggleMute}
                  className="absolute top-4 right-14 bg-black/50 rounded-full p-2.5 text-foreground transition-transform active:scale-90 z-10"
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>

                {/* More options menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-4 right-4 bg-black/50 rounded-full text-foreground hover:bg-black/70 z-10 h-10 w-10"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[100]">
                    {currentUserId === userId && onDelete && (
                      <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
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
              </>
            )}
          </>
        ) : (
          <img
            src={mediaUrl}
            alt="Post"
            className="max-h-full max-w-full object-contain"
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      
      {/* Bottom overlay with user info and actions */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-6 pointer-events-none z-10">
        {/* User info */}
        {profile && (
          <div className="flex items-center gap-3 mb-3 pointer-events-auto">
            <Avatar 
              className="h-10 w-10 border-2 border-foreground/20 cursor-pointer transition-transform active:scale-95"
              onClick={() => navigate(`/profile/${profile.username}`)}
            >
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {profile.display_name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div 
              className="cursor-pointer"
              onClick={() => navigate(`/profile/${profile.username}`)}
            >
              <p className="text-foreground font-semibold text-sm">{profile.display_name}</p>
              <p className="text-muted-foreground text-xs">@{profile.username}</p>
            </div>
          </div>
        )}
        
        {renderCaption()}
        
        {/* Action buttons */}
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-5">
            <button
              onClick={handleLike}
              className="flex items-center gap-1.5 text-foreground transition-transform active:scale-90"
            >
              <Heart className={cn("h-7 w-7", isLiked && "fill-destructive text-destructive")} />
              <span className="text-sm font-medium">{likesCount}</span>
            </button>
            
            <button
              onClick={() => setShowComments(true)}
              className="flex items-center gap-1.5 text-foreground transition-transform active:scale-90"
            >
              <MessageCircle className="h-7 w-7" />
              <span className="text-sm font-medium">{commentsCount}</span>
            </button>
            
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 text-foreground transition-transform active:scale-90"
            >
              <Share2 className="h-7 w-7" />
              <span className="text-sm font-medium">{sharesCount}</span>
            </button>
          </div>
          
          <button
            onClick={onSaveToggle}
            className="text-foreground transition-transform active:scale-90"
          >
            <Bookmark className={cn("h-7 w-7", isSaved && "fill-foreground")} />
          </button>
        </div>
      </div>

      {/* Video seekbar */}
      {mediaType === 'video' && !mediaError && (
        <div className="absolute bottom-20 left-0 right-0 px-4 z-20 pointer-events-auto">
          <div className="flex items-center gap-2 text-foreground text-xs mb-1.5">
            <span className="tabular-nums">{formatTime(currentTime)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="tabular-nums text-muted-foreground">{formatTime(duration)}</span>
          </div>
          <div 
            className="relative h-1 bg-foreground/30 rounded-full cursor-pointer group py-2.5"
            onMouseDown={handleSeekBarMouseDown}
            onTouchStart={handleSeekBarTouch}
            onTouchMove={handleSeekBarTouchMove}
            onTouchEnd={handleSeekBarTouchEnd}
          >
            <div className="absolute top-1/2 -translate-y-1/2 h-1 w-full bg-foreground/30 rounded-full" />
            <div 
              className="absolute top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-foreground rounded-full shadow-lg"
              style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
        </div>
      )}
      
      <CommentSheet postId={id} isOpen={showComments} onClose={() => setShowComments(false)} />
      <ShareSheet postId={id} isOpen={showShare} onClose={() => setShowShare(false)} />
      <ReportDialog isOpen={showReport} onClose={() => setShowReport(false)} postId={id} />
    </div>
  );
};
