import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FeedPost } from "./FeedPost";
import { PostErrorBoundary } from "./PostErrorBoundary";
import { toast } from "sonner";
import { FeedLoadingSkeleton } from "./LoadingSkeleton";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { prefetchVideos } from "@/lib/pwaUtils";
import { useVideoPreloader } from "@/hooks/useVideoPreloader";

interface Post {
  id: string;
  media_url: string;
  media_type: "image" | "video";
  caption?: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  user_id: string;
  user_liked?: boolean;
  user_saved?: boolean;
  profile?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

export const VerticalFeed = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [windowStart, setWindowStart] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const postDetectionObserverRef = useRef<IntersectionObserver | null>(null);
  const lastPostRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartYRef = useRef<number>(0);
  const isAtTopRef = useRef<boolean>(false);
  const currentIndexRef = useRef<number>(0);
  const swipeStartYRef = useRef<number>(0);
  const swipeStartTimeRef = useRef<number>(0);
  const isSwipingRef = useRef<boolean>(false);
  
  // Virtual scrolling settings
  const WINDOW_SIZE = 10;
  const PRELOAD_COUNT = 2;
  const LOAD_TRIGGER = 8;
  
  // Dynamic post height (viewport height minus bottom nav)
  const getPostHeight = () => typeof window !== 'undefined' ? window.innerHeight - 64 : 736;
  const [postHeight, setPostHeight] = useState(getPostHeight);
  
  // Update height on resize
  useEffect(() => {
    const handleResize = () => setPostHeight(getPostHeight());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Calculate visible window
  const visibleStart = Math.max(0, windowStart);
  const visibleEnd = Math.min(posts.length, windowStart + WINDOW_SIZE);
  const visiblePosts = posts.slice(visibleStart, visibleEnd);
  
  const topSpacerHeight = visibleStart * postHeight;
  const bottomSpacerHeight = Math.max(0, (posts.length - visibleEnd) * postHeight);

  useEffect(() => {
    const initializeUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setUserId(session.user.id);
    };
    initializeUser();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchPosts();
      const cleanup = setupRealtimeSubscription();
      return () => { cleanup(); };
    }
  }, [userId]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.5 }
    );

    if (lastPostRef.current) {
      observerRef.current.observe(lastPostRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [loadingMore, loading, posts.length]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // IntersectionObserver for accurate post detection
  useEffect(() => {
    if (!containerRef.current || posts.length === 0) return;

    postDetectionObserverRef.current = new IntersectionObserver((entries) => {
      let maxRatio = 0;
      let mostVisibleIndex = currentIndexRef.current;

      entries.forEach((entry) => {
        if (entry.intersectionRatio > maxRatio) {
          maxRatio = entry.intersectionRatio;
          const indexAttr = entry.target.getAttribute('data-post-index');
          if (indexAttr) mostVisibleIndex = parseInt(indexAttr, 10);
        }
      });

      if (maxRatio >= 0.5 && mostVisibleIndex !== currentIndexRef.current) {
        setCurrentIndex(mostVisibleIndex);
        setWindowStart(Math.max(0, mostVisibleIndex - Math.floor(WINDOW_SIZE / 2)));
        if (posts[mostVisibleIndex]) trackView(posts[mostVisibleIndex].id);
      }
    }, {
      root: containerRef.current,
      threshold: [0, 0.25, 0.5, 0.75, 1],
      rootMargin: '0px'
    });

    const postElements = containerRef.current.querySelectorAll('[data-post-index]');
    postElements.forEach((el) => postDetectionObserverRef.current?.observe(el));

    return () => postDetectionObserverRef.current?.disconnect();
  }, [posts, visibleStart, visibleEnd]);

  // Enhanced video preloading for next 2 posts
  useVideoPreloader({
    posts: posts.map(p => ({ id: p.id, media_url: p.media_url, media_type: p.media_type })),
    currentIndex,
    preloadCount: PRELOAD_COUNT,
  });

  // Auto-pause distant videos to save resources
  useEffect(() => {
    if (!containerRef.current || posts.length === 0) return;

    posts.forEach((post, index) => {
      if (post.media_type !== 'video') return;
      
      const postElement = containerRef.current?.querySelector(`[data-post-index="${index}"]`);
      const video = postElement?.querySelector('video');
      if (!video) return;

      const distance = Math.abs(index - currentIndex);
      // Pause videos more than 2 positions away
      if (distance > 2 && !video.paused) video.pause();
      // Ensure only current video plays
      if (index !== currentIndex && !video.paused) video.pause();
    });
  }, [currentIndex, posts]);

  const fetchPosts = async (cursor?: string, isRefresh = false) => {
    try {
      if (isRefresh) setIsRefreshing(true);
      else if (cursor) setLoadingMore(true);
      else setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setLoading(false);
        setLoadingMore(false);
        setIsRefreshing(false);
        return;
      }

      const BATCH_SIZE = 20;
      const offset = cursor ? posts.length : 0;

      const { data: fetchedPosts, error } = await supabase
        .from('posts')
        .select(`
          id, media_url, media_type, caption, likes_count, comments_count,
          shares_count, saves_count, views_count, created_at, user_id,
          profiles!posts_user_id_fkey(username, display_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw error;

      const postIds = (fetchedPosts || []).map(p => p.id);
      const [likesData, savesData] = await Promise.all([
        supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', session.user.id),
        supabase.from('saved_posts').select('post_id').in('post_id', postIds).eq('user_id', session.user.id)
      ]);

      const likedPostIds = new Set(likesData.data?.map(l => l.post_id) || []);
      const savedPostIds = new Set(savesData.data?.map(s => s.post_id) || []);

      const postsWithDetails = (fetchedPosts || []).map((post: any) => ({
        id: post.id,
        media_url: post.media_url,
        media_type: post.media_type,
        caption: post.caption,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
        shares_count: post.shares_count,
        created_at: post.created_at,
        user_id: post.user_id,
        user_liked: likedPostIds.has(post.id),
        user_saved: savedPostIds.has(post.id),
        profile: {
          display_name: post.profiles.display_name,
          username: post.profiles.username,
          avatar_url: post.profiles.avatar_url
        }
      }));

      // Smart video prefetching
      const connection = (navigator as any).connection;
      const effectiveType = connection?.effectiveType || '4g';
      const isSlowConnection = ['slow-2g', '2g', '3g'].includes(effectiveType);
      
      const prefetchLimit = isSlowConnection ? 2 : 3;
      const videoUrls = postsWithDetails
        .filter(post => post.media_type === 'video')
        .slice(0, prefetchLimit)
        .map(post => post.media_url);
      
      if (videoUrls.length > 0 && !isSlowConnection) {
        prefetchVideos(videoUrls).catch(() => {});
      }

      if (isRefresh) setPosts(postsWithDetails);
      else if (cursor) setPosts((current) => [...current, ...postsWithDetails]);
      else setPosts(postsWithDetails);

      setHasMore(fetchedPosts && fetchedPosts.length === BATCH_SIZE);
    } catch (error: any) {
      console.error('Feed fetch error:', error);
      toast.error("Failed to load posts");
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    await fetchPosts("load-more");
  };

  const handleRefresh = async () => {
    if (!userId) return;
    setIsRefreshing(true);
    try {
      await fetchPosts(undefined, true);
      toast.success("Feed refreshed");
    } catch (error) {
      toast.error("Failed to refresh feed");
    }
    setIsRefreshing(false);
  };

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToPost = useCallback((index: number) => {
    if (!containerRef.current || index < 0 || index >= posts.length) return;
    containerRef.current.scrollTo({ top: index * postHeight, behavior: 'smooth' });
  }, [posts.length, postHeight]);

  // Touch handlers for pull-to-refresh and swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    
    const touchY = e.touches[0].clientY;
    const isAtTop = containerRef.current.scrollTop <= 1;
    isAtTopRef.current = isAtTop;
    
    if (isAtTop) touchStartYRef.current = touchY;
    
    swipeStartYRef.current = touchY;
    swipeStartTimeRef.current = Date.now();
    isSwipingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    
    if (isAtTopRef.current) {
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartYRef.current;
      
      if (diff > 0 && containerRef.current.scrollTop <= 1) {
        const distance = Math.min(diff * 0.4, 120);
        setPullDistance(distance);
      } else {
        setPullDistance(0);
        isAtTopRef.current = false;
      }
    }
  };

  const handleTouchEnd = async (e: React.TouchEvent) => {
    const threshold = 60;
    if (pullDistance >= threshold && !isRefreshing) {
      await handleRefresh();
    }
    setPullDistance(0);
    touchStartYRef.current = 0;
    isAtTopRef.current = false;
    
    if (!isSwipingRef.current || !containerRef.current) {
      isSwipingRef.current = false;
      return;
    }
    
    const touchEndY = e.changedTouches[0]?.clientY ?? swipeStartYRef.current;
    const swipeDistance = swipeStartYRef.current - touchEndY;
    const swipeDuration = Date.now() - swipeStartTimeRef.current;
    
    const velocity = Math.abs(swipeDistance) / swipeDuration;
    const minSwipeDistance = 50;
    const minVelocity = 0.3;
    
    if (Math.abs(swipeDistance) > minSwipeDistance && velocity > minVelocity) {
      if (swipeDistance > 0) {
        scrollToPost(Math.min(currentIndexRef.current + 1, posts.length - 1));
      } else {
        scrollToPost(Math.max(currentIndexRef.current - 1, 0));
      }
    }
    
    isSwipingRef.current = false;
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("posts-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async () => {})
      .subscribe();

    return () => supabase.removeChannel(channel);
  };

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      
      const postsRemaining = posts.length - currentIndexRef.current;
      if (postsRemaining <= LOAD_TRIGGER && !loadingMore && hasMore) {
        loadMore();
      }
    }, 150);
  }, [posts.length, loadingMore, hasMore]);

  const markPostAsSeen = async (postId: string) => {
    if (!userId) return;
    try {
      await supabase.from('user_seen_posts').upsert({
        user_id: userId,
        post_id: postId,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'user_id,post_id' });
    } catch {}
  };

  const trackView = async (postId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("post_views").insert({ post_id: postId, user_id: user?.id || null });
      if (user?.id) markPostAsSeen(postId);
    } catch {}
  };

  const handleLike = async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to like posts");
      return;
    }

    const previousPosts = [...posts];
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? { 
              ...post, 
              likes_count: post.user_liked ? post.likes_count - 1 : post.likes_count + 1,
              user_liked: !post.user_liked 
            }
          : post
      )
    );

    const { error } = await supabase.rpc("toggle_post_like", { p_post_id: postId });
    if (error) {
      setPosts(previousPosts);
      toast.error("Failed to update like");
    }
  };

  const handleSaveToggle = async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to save posts");
      return;
    }

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const previousPosts = [...posts];
    setPosts((current) =>
      current.map((p) => p.id === postId ? { ...p, user_saved: !p.user_saved } : p)
    );

    try {
      if (post.user_saved) {
        const { error } = await supabase.from("saved_posts").delete().eq("post_id", postId).eq("user_id", user.id);
        if (error) throw error;
        toast.success("Removed from saved");
      } else {
        const { error } = await supabase.from("saved_posts").insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
        toast.success("Post saved");
      }
    } catch {
      setPosts(previousPosts);
      toast.error("Failed to save post");
    }
  };

  const handleDeletePost = async (postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    setPosts((current) => current.filter(p => p.id !== postId));

    const undoToastId = toast.success("Post deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          setPosts((current) => {
            const newPosts = [...current];
            const insertIndex = current.findIndex(p => new Date(p.created_at) < new Date(post.created_at));
            if (insertIndex === -1) newPosts.push(post);
            else newPosts.splice(insertIndex, 0, post);
            return newPosts;
          });
          clearTimeout(deleteTimeoutId);
        }
      },
      duration: 5000,
    });

    const deleteTimeoutId = setTimeout(async () => {
      try {
        const { error } = await supabase.rpc('delete_post_with_media', { p_post_id: postId });
        if (error) throw error;
        const storagePath = post.media_url.split('/').slice(-2).join('/');
        await supabase.storage.from('posts-media').remove([storagePath]);
      } catch {
        setPosts((current) => {
          const newPosts = [...current];
          const insertIndex = current.findIndex(p => new Date(p.created_at) < new Date(post.created_at));
          if (insertIndex === -1) newPosts.push(post);
          else newPosts.splice(insertIndex, 0, post);
          return newPosts;
        });
        toast.error("Failed to delete post");
      }
    }, 5000);
  };

  if (loading && posts.length === 0) {
    return <FeedLoadingSkeleton />;
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-background">
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="absolute top-0 left-0 right-0 z-50 flex justify-center items-center pointer-events-none"
          style={{
            height: `${Math.min(pullDistance * 1.2, 80)}px`,
            opacity: Math.min(pullDistance / 60, 1),
          }}
        >
          <div className="bg-card backdrop-blur-sm rounded-full p-3 shadow-lg border border-border">
            <RefreshCw 
              className={`h-5 w-5 text-primary transition-transform ${pullDistance >= 60 ? 'animate-spin' : ''}`}
              style={{ transform: `rotate(${pullDistance * 3}deg)` }}
            />
          </div>
        </div>
      )}

      {/* Refresh Button */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          className="touch-manipulation active:scale-90 bg-card/80 backdrop-blur-sm border border-border"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Feed Container */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="h-full overflow-y-scroll snap-y snap-mandatory overscroll-y-contain touch-pan-y scrollbar-hide"
          style={{ 
            WebkitOverflowScrolling: 'touch',
            willChange: 'scroll-position',
            transform: pullDistance > 0 ? `translateY(${Math.min(pullDistance * 0.5, 40)}px)` : 'none',
            transition: pullDistance === 0 ? 'transform 0.3s ease-out' : 'none',
          }}
        >
          {posts.length === 0 && !loading ? (
            <div className="flex h-full items-center justify-center snap-start">
              <div className="text-center space-y-4 px-6 animate-fade-in">
                <p className="text-muted-foreground text-lg">No posts available yet</p>
                <Button onClick={handleRefresh}>Refresh Feed</Button>
              </div>
            </div>
          ) : (
            <>
              {topSpacerHeight > 0 && (
                <div style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" />
              )}
              
              {visiblePosts.map((post, visibleIndex) => {
                const actualIndex = visibleStart + visibleIndex;
                return (
                  <div
                    key={`${post.id}-${actualIndex}`}
                    ref={actualIndex === posts.length - 8 ? lastPostRef : null}
                    data-post-index={actualIndex}
                    className="snap-start snap-always will-change-transform"
                    style={{ height: `${postHeight}px` }}
                  >
                    <PostErrorBoundary postId={post.id}>
                      <FeedPost
                        id={post.id}
                        mediaUrl={post.media_url}
                        mediaType={post.media_type}
                        caption={post.caption}
                        likesCount={post.likes_count}
                        commentsCount={post.comments_count}
                        sharesCount={post.shares_count}
                        isSaved={post.user_saved || false}
                        isLiked={post.user_liked || false}
                        isActive={actualIndex === currentIndex}
                        onLike={() => handleLike(post.id)}
                        onSaveToggle={() => handleSaveToggle(post.id)}
                        onDelete={() => handleDeletePost(post.id)}
                        userId={post.user_id}
                        profile={post.profile}
                      />
                    </PostErrorBoundary>
                  </div>
                );
              })}
              
              {bottomSpacerHeight > 0 && (
                <div style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" />
              )}
              
              {loadingMore && (
                <div className="flex items-center justify-center snap-start" style={{ height: `${postHeight}px` }}>
                  <div className="text-center space-y-4 animate-fade-in">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-muted-foreground">Loading more posts...</p>
                  </div>
                </div>
              )}
              
              {!loadingMore && posts.length > 0 && (
                <div className="flex items-center justify-center snap-start" style={{ height: `${postHeight}px` }}>
                  <div className="text-center space-y-4 px-6 animate-fade-in">
                    <p className="text-muted-foreground">You've reached the end</p>
                    <Button onClick={scrollToTop} variant="default" className="touch-manipulation active:scale-95">
                      Back to top
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerticalFeed;
