import { useEffect, useRef, useState, useCallback } from "react";
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, Play, MoreVertical, Flag, Trash2, RefreshCw, Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { CommentSheet } from "./CommentSheet";
import { ShareSheet } from "./ShareSheet";
import { ReportDialog } from "./ReportDialog";
import { VideoControls } from "./VideoControls";
import { BufferIndicator } from "./BufferIndicator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useVideoTracking } from "@/hooks/useVideoTracking";
import { hapticLike, hapticSave, hapticSnap } from "@/lib/haptics";
import { getVideoErrorMessage, checkVideoFormatSupport } from "@/lib/videoFormatUtils";
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
  const [retryCount, setRetryCount] = useState(0);
  const [mediaError, setMediaError] = useState<{
    type: string;
    message: string;
    suggestion?: string;
    isNetworkError: boolean;
  } | null>(null);
  const [formatChecked, setFormatChecked] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasAutoRetried, setHasAutoRetried] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(9 / 16);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const MAX_RETRIES = 1;

  // Track video engagement
  useVideoTracking({ postId: id, videoRef, isActive });

  // Check format support on mount
  useEffect(() => {
    if (mediaType === 'video' && mediaUrl && !formatChecked) {
      const formatCheck = checkVideoFormatSupport('', mediaUrl);
      if (!formatCheck.isSupported && formatCheck.fallbackMessage) {
        console.warn('[FeedPost] Video format may not be supported:', {
          postId: id,
          url: mediaUrl,
          format: formatCheck.format,
        });
      }
      setFormatChecked(true);
    }
  }, [mediaType, mediaUrl, formatChecked, id]);

  // Enhanced media error handling with format-aware messages
  const handleMediaError = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const error = video.error;
    console.error('[FeedPost] Video loading error:', { 
      postId: id, 
      errorCode: error?.code,
      errorMessage: error?.message,
      mediaUrl: mediaUrl.substring(0, 100) + '...',
    });

    // Get format-aware error message
    const errorInfo = getVideoErrorMessage(error?.code, mediaUrl);
    const isNetworkError = error?.code === MediaError.MEDIA_ERR_NETWORK || !navigator.onLine;

    // For format/decode errors, don't retry - it won't help
    const isFormatError = error?.code === MediaError.MEDIA_ERR_DECODE || 
                          error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;

    if (retryCount < MAX_RETRIES && navigator.onLine && !isFormatError) {
      setRetryCount(prev => prev + 1);
      console.log('[FeedPost] Retrying video load...', { retryCount: retryCount + 1 });
      setTimeout(() => {
        if (videoRef.current) videoRef.current.load();
      }, 1000);
    } else {
      setMediaError({ 
        type: errorInfo.type, 
        message: errorInfo.message, 
        suggestion: errorInfo.suggestion,
        isNetworkError,
      });
      
      // Only auto-retry for network errors, not format errors
      if (!hasAutoRetried && navigator.onLine && !isFormatError) {
        setTimeout(() => {
          setHasAutoRetried(true);
          setMediaError(null);
          setRetryCount(0);
          if (videoRef.current) videoRef.current.load();
        }, 2000);
      }
    }
  }, [id, mediaUrl, retryCount, hasAutoRetried]);

  // Handle buffering states
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mediaType !== 'video') return;

    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handlePlaying = () => setIsBuffering(false);
    const handleError = () => handleMediaError();
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if (video.videoWidth && video.videoHeight) {
        setVideoAspectRatio(video.videoWidth / video.videoHeight);
      }
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [mediaType, handleMediaError]);

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
      hapticSnap();
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

  // Auto-hide controls
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  const handleVideoClick = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // Double tap to like
      handleLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 1000);
    } else {
      // Single tap to toggle play/pause and show controls
      if (videoRef.current) {
        if (isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
        } else {
          videoRef.current.play();
          setIsPlaying(true);
        }
      }
      showControlsTemporarily();
    }
    lastTapRef.current = now;
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
    showControlsTemporarily();
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
    hapticLike();
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 300);
    onLike();
  };

  const handleSave = () => {
    hapticSave();
    onSaveToggle();
  };

  const renderCaption = () => {
    if (!caption) return null;

    const parts = caption.split(/(#[a-zA-Z0-9_]+)/g);
    const isLong = caption.length > 80;
    
    return (
      <div className="pointer-events-auto">
        <p 
          className={cn(
            "text-foreground text-sm font-medium transition-all",
            !captionExpanded && isLong && "line-clamp-2"
          )}
        >
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
        {isLong && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setCaptionExpanded(!captionExpanded);
            }}
            className="text-muted-foreground text-xs mt-1 hover:text-foreground"
          >
            {captionExpanded ? "Show less" : "... more"}
          </button>
        )}
      </div>
    );
  };

  const isVerticalVideo = videoAspectRatio < 1;

  return (
    <div className="relative h-full w-full snap-start snap-always bg-black flex items-center justify-center overflow-hidden">
      {/* Media container */}
      <div className="absolute inset-0 flex items-center justify-center">
        {mediaType === "video" ? (
          <>
            {mediaError ? (
              <div className="flex flex-col items-center justify-center text-foreground p-6 space-y-4 max-w-xs">
                <div className="bg-destructive/10 rounded-full p-4">
                  <RefreshCw className="h-8 w-8 text-destructive" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-display font-semibold text-destructive">{mediaError.type}</p>
                  <p className="text-sm text-muted-foreground">{mediaError.message}</p>
                  {mediaError.suggestion && (
                    <p className="text-xs text-muted-foreground/70 mt-2">{mediaError.suggestion}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMediaError(null);
                    setRetryCount(0);
                    setHasAutoRetried(false);
                    setFormatChecked(false);
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
                  autoPlay={isActive}
                  preload="metadata"
                  onClick={handleVideoClick}
                />

                {/* Buffering indicator */}
                {isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-sm rounded-full p-3">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  </div>
                )}

                {/* Play indicator */}
                {!isPlaying && !isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-sm rounded-full p-4">
                      <Play className="h-12 w-12 text-white" fill="white" />
                    </div>
                  </div>
                )}

                {/* Double tap heart animation */}
                {showHeart && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Heart className="h-28 w-28 text-red-500 animate-heart-burst" fill="currentColor" />
                  </div>
                )}
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

      {/* Top controls - auto-hiding */}
      {mediaType === 'video' && !mediaError && (
        <div 
          className={cn(
            "absolute top-0 left-0 right-0 flex items-center justify-between p-3 z-20 transition-opacity duration-300",
            showControls || !isPlaying ? "opacity-100" : "opacity-0"
          )}
        >
          <VideoControls videoRef={videoRef} isActive={isActive} />
          
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="bg-black/40 backdrop-blur-sm rounded-full p-2 text-white transition-all hover:bg-black/60 active:scale-90"
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-black/40 backdrop-blur-sm rounded-full text-white hover:bg-black/60 h-9 w-9"
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
          </div>
        </div>
      )}

      {/* Right side action bar (TikTok style) */}
      <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5 z-10">
        {/* Profile avatar */}
        {profile && (
          <div className="relative mb-2">
            <Avatar 
              className="h-12 w-12 border-2 border-white cursor-pointer transition-transform active:scale-95 shadow-lg"
              onClick={() => navigate(`/profile/${profile.username}`)}
            >
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground font-display text-sm">
                {profile.display_name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {currentUserId && currentUserId !== userId && (
              <button className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary rounded-full p-1 shadow-lg">
                <UserPlus className="h-3 w-3 text-primary-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Like button */}
        <button
          onClick={handleLike}
          className={cn(
            "flex flex-col items-center gap-1 transition-all active:scale-90",
            likeAnimating && "animate-scale-bounce"
          )}
        >
          <div className={cn(
            "p-2 rounded-full transition-all",
            isLiked ? "bg-red-500/20" : "bg-black/30 backdrop-blur-sm"
          )}>
            <Heart className={cn(
              "h-7 w-7 transition-all",
              isLiked ? "fill-red-500 text-red-500" : "text-white"
            )} />
          </div>
          <span className="text-white text-xs font-semibold tabular-nums drop-shadow-lg">{likesCount}</span>
        </button>
        
        {/* Comment button */}
        <button
          onClick={() => setShowComments(true)}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
            <MessageCircle className="h-7 w-7 text-white" />
          </div>
          <span className="text-white text-xs font-semibold tabular-nums drop-shadow-lg">{commentsCount}</span>
        </button>
        
        {/* Share button */}
        <button
          onClick={() => setShowShare(true)}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
            <Share2 className="h-7 w-7 text-white" />
          </div>
          <span className="text-white text-xs font-semibold tabular-nums drop-shadow-lg">{sharesCount}</span>
        </button>
        
        {/* Save button */}
        <button
          onClick={handleSave}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <div className={cn(
            "p-2 rounded-full transition-all",
            isSaved ? "bg-yellow-500/20" : "bg-black/30 backdrop-blur-sm"
          )}>
            <Bookmark className={cn(
              "h-7 w-7 transition-all",
              isSaved ? "fill-yellow-400 text-yellow-400" : "text-white"
            )} />
          </div>
        </button>
      </div>

      {/* Bottom info overlay - minimal gradient */}
      <div className="absolute bottom-0 left-0 right-20 bg-gradient-to-t from-black/60 via-black/30 to-transparent p-4 pb-5 pointer-events-none z-10">
        {/* Video seekbar */}
        {mediaType === 'video' && !mediaError && (
          <div className="mb-3 pointer-events-auto">
            <div 
              className="relative h-1 bg-white/30 rounded-full cursor-pointer group"
              onMouseDown={handleSeekBarMouseDown}
              onTouchStart={handleSeekBarTouch}
              onTouchMove={handleSeekBarTouchMove}
              onTouchEnd={handleSeekBarTouchEnd}
            >
              <BufferIndicator videoRef={videoRef} progress={progress} />
              <div 
                className="absolute top-0 left-0 h-full bg-white rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
              <div 
                className="absolute top-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
                style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
            <div className="flex items-center justify-between text-white/80 text-xs mt-1">
              <span className="tabular-nums">{formatTime(currentTime)}</span>
              <span className="tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>
        )}
        
        {/* User info row */}
        {profile && (
          <div 
            className="flex items-center gap-2 mb-2 pointer-events-auto cursor-pointer"
            onClick={() => navigate(`/profile/${profile.username}`)}
          >
            <span className="text-white font-semibold text-sm">@{profile.username}</span>
            {currentUserId && currentUserId !== userId && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  toast.info("Follow feature coming soon");
                }}
                className="px-2 py-0.5 border border-white/50 rounded text-white text-xs hover:bg-white/10"
              >
                Follow
              </button>
            )}
          </div>
        )}
        
        {renderCaption()}
      </div>
      
      <CommentSheet postId={id} isOpen={showComments} onClose={() => setShowComments(false)} />
      <ShareSheet postId={id} isOpen={showShare} onClose={() => setShowShare(false)} />
      <ReportDialog isOpen={showReport} onClose={() => setShowReport(false)} postId={id} />
    </div>
  );
};
