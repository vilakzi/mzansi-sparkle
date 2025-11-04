import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FeedPost } from "./FeedPost";
import { PostErrorBoundary } from "./PostErrorBoundary";
import { toast } from "sonner";
import { FeedLoadingSkeleton } from "./LoadingSkeleton";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { prefetchVideos } from "@/lib/pwaUtils";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastPostRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Production-grade settings for memory and performance
  const WINDOW_SIZE = 5; // Keep only 5 posts in DOM
  const PRELOAD_COUNT = 2; // Preload 2 videos ahead
  const LOAD_TRIGGER = 8; // Load more when 8 posts remaining

  useEffect(() => {
    const initializeUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
      }
    };
    initializeUser();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchPosts();
      const cleanup = setupRealtimeSubscription();
      return cleanup;
    }
  }, [userId]);


  useEffect(() => {
    // Setup intersection observer for infinite scroll
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

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadingMore, loading, posts.length]);

  // Ensure first post is active on mount
  useEffect(() => {
    if (posts.length > 0 && currentIndex === 0) {
      setTimeout(() => {
        setCurrentIndex(0);
      }, 100);
    }
  }, [posts.length]);

  // Smart preloading with windowing for memory efficiency
  useEffect(() => {
    if (!containerRef.current || posts.length === 0) return;

    // Preload current + PRELOAD_COUNT ahead
    for (let i = currentIndex; i <= Math.min(currentIndex + PRELOAD_COUNT, posts.length - 1); i++) {
      const postElement = containerRef.current.querySelector(`[data-post-index="${i}"]`);
      if (postElement) {
        const video = postElement.querySelector('video');
        if (video && video.readyState < 2) {
          video.load();
        }
      }
    }

    // Aggressive memory cleanup - unload videos far from current
    posts.forEach((_, index) => {
      if (Math.abs(index - currentIndex) > WINDOW_SIZE) {
        const postElement = containerRef.current?.querySelector(`[data-post-index="${index}"]`);
        if (postElement) {
          const video = postElement.querySelector('video');
          if (video) {
            video.pause();
            video.src = '';
            video.load();
          }
        }
      }
    });
  }, [currentIndex, posts, WINDOW_SIZE, PRELOAD_COUNT]);

  const fetchPosts = async (cursor?: string, isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setLoading(false);
        setLoadingMore(false);
        setIsRefreshing(false);
        return;
      }

      const BATCH_SIZE = 20;
      const offset = cursor ? posts.length : 0;

      // Simple direct query - specify the relationship explicitly
      const { data: fetchedPosts, error } = await supabase
        .from('posts')
        .select(`
          id,
          media_url,
          media_type,
          caption,
          likes_count,
          comments_count,
          shares_count,
          saves_count,
          views_count,
          created_at,
          user_id,
          profiles!posts_user_id_fkey(username, display_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw error;

      // Check if user liked/saved each post
      const postIds = (fetchedPosts || []).map(p => p.id);
      const [likesData, savesData] = await Promise.all([
        supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', session.user.id),
        supabase.from('saved_posts').select('post_id').in('post_id', postIds).eq('user_id', session.user.id)
      ]);

      const likedPostIds = new Set(likesData.data?.map(l => l.post_id) || []);
      const savedPostIds = new Set(savesData.data?.map(s => s.post_id) || []);

      // Map to Post interface
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

      // Prefetch videos for instant playback (PWA caching)
      const videoUrls = postsWithDetails
        .filter(post => post.media_type === 'video')
        .slice(0, 5) // Prefetch first 5 videos
        .map(post => post.media_url);
      
      if (videoUrls.length > 0) {
        console.log(`[VerticalFeed] Prefetching ${videoUrls.length} videos for offline playback`);
        prefetchVideos(videoUrls).catch(err => 
          console.warn('[VerticalFeed] Video prefetch failed:', err)
        );
      }

      if (isRefresh) {
        setPosts(postsWithDetails);
      } else if (cursor) {
        setPosts((current) => [...current, ...postsWithDetails]);
      } else {
        setPosts(postsWithDetails);
      }

      // Check if we have more posts
      setHasMore(fetchedPosts && fetchedPosts.length === BATCH_SIZE);
      
      setLoading(false);
      setLoadingMore(false);
      setIsRefreshing(false);
    } catch (error: any) {
      console.error('Feed fetch error:', error);
      toast.error("Failed to load posts");
      
      setLoading(false);
      setLoadingMore(false);
      setIsRefreshing(false);
      setHasMore(false);
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
      // Get timestamp of newest post in current feed
      const newestPostTime = posts[0]?.created_at;
      
      // Just do a full refresh
      await fetchPosts(undefined, true);
      toast.success("Feed refreshed");
    } catch (error) {
      console.error('Refresh error:', error);
      toast.error("Failed to refresh feed");
    }
    
    setIsRefreshing(false);
  };

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("posts-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts",
        },
        async (payload) => {
          // New post added - could fetch if needed
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    // Debounce scroll handling
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      
      const scrollTop = containerRef.current.scrollTop;
      const containerHeight = containerRef.current.clientHeight;
      
      const centerPoint = scrollTop + (containerHeight / 2);
      const index = Math.floor(centerPoint / window.innerHeight);
      
      if (index !== currentIndex && index >= 0 && index < posts.length) {
        setCurrentIndex(index);
        
        // Update window for virtualization
        const newWindowStart = Math.max(0, index - Math.floor(WINDOW_SIZE / 2));
        setWindowStart(newWindowStart);
        
        if (posts[index]) {
          trackView(posts[index].id);
        }
      }

      // Smart load trigger
      const postsRemaining = posts.length - index;
      if (postsRemaining <= LOAD_TRIGGER && !loadingMore && hasMore) {
        loadMore();
      }
    }, 100);
  }, [currentIndex, posts, loadingMore, hasMore]);

  const markPostAsSeen = async (postId: string) => {
    if (!userId) return;
    
    // Silently track in background for smart rotation
    try {
      await supabase.from('user_seen_posts').upsert({
        user_id: userId,
        post_id: postId,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'user_id,post_id' });
    } catch (error) {
      // Fail silently
    }
  };

  const trackView = async (postId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from("post_views").insert({
        post_id: postId,
        user_id: user?.id || null,
      });

      // Mark post as seen for smart feed rotation
      if (user?.id) {
        markPostAsSeen(postId);
      }
    } catch (error) {
      // Silently fail
    }
  };

  const handleLike = async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to like posts");
      return;
    }

    // Optimistic UI update - instant feedback!
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

    // Make API call
    const { error } = await supabase.rpc("toggle_post_like", {
      p_post_id: postId,
    });

    if (error) {
      // Rollback on error
      setPosts(previousPosts);
      toast.error("Failed to update like");
      if (import.meta.env.DEV) {
        console.error(error);
      }
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

    // Optimistic UI update
    const previousPosts = [...posts];
    setPosts((current) =>
      current.map((p) =>
        p.id === postId ? { ...p, user_saved: !p.user_saved } : p
      )
    );

    try {
      if (post.user_saved) {
        // Unsave
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);

        if (error) throw error;
        toast.success("Post removed from saved");
      } else {
        // Save
        const { error } = await supabase
          .from("saved_posts")
          .insert({ post_id: postId, user_id: user.id });

        if (error) throw error;
        toast.success("Post saved");
      }
    } catch (error: any) {
      // Rollback on error
      setPosts(previousPosts);
      toast.error("Failed to save post");
      if (import.meta.env.DEV) {
        console.error(error);
      }
    }
  };

  const handleDeletePost = async (postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    // Optimistically remove from UI
    setPosts((current) => current.filter(p => p.id !== postId));

    // Show undo toast
    const undoToastId = toast.success("Post deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          // Restore post
          setPosts((current) => {
            const newPosts = [...current];
            const insertIndex = current.findIndex(p => new Date(p.created_at) < new Date(post.created_at));
            if (insertIndex === -1) {
              newPosts.push(post);
            } else {
              newPosts.splice(insertIndex, 0, post);
            }
            return newPosts;
          });
          clearTimeout(deleteTimeoutId);
        }
      },
      duration: 5000,
    });

    // Actual deletion
    const deleteTimeoutId = setTimeout(async () => {
      try {
        const { error: deleteError } = await supabase.rpc('delete_post_with_media', {
          p_post_id: postId
        });

        if (deleteError) throw deleteError;

        // Delete from storage
        const storagePath = post.media_url.split('/').slice(-2).join('/');
        await supabase.storage.from('posts-media').remove([storagePath]);
      } catch (error: any) {
        console.error('Error deleting post:', error);
        // Restore post on error
        setPosts((current) => {
          const newPosts = [...current];
          const insertIndex = current.findIndex(p => new Date(p.created_at) < new Date(post.created_at));
          if (insertIndex === -1) {
            newPosts.push(post);
          } else {
            newPosts.splice(insertIndex, 0, post);
          }
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
    <div className="h-screen flex flex-col bg-background">
      {/* Simple Refresh Button */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          className="touch-manipulation active:scale-90 transition-transform bg-background/80 backdrop-blur-sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Feed Container - Optimized for mobile */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll snap-y snap-mandatory overscroll-y-contain touch-pan-y"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            willChange: 'scroll-position'
          }}
        >
          {posts.length === 0 && !loading ? (
            <div className="flex h-screen items-center justify-center snap-start">
              <div className="text-center space-y-4 px-6 animate-fade-in">
                <p className="text-muted-foreground text-lg">
                  No posts available yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Discover amazing content
                </p>
                <Button onClick={handleRefresh}>Refresh Feed</Button>
              </div>
            </div>
          ) : (
            <>
              {posts.map((post, index) => (
                <div
                  key={`${post.id}-${index}`}
                  ref={index === posts.length - 8 ? lastPostRef : null}
                  data-post-index={index}
                  className="snap-start snap-always will-change-transform"
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
                      isActive={index === currentIndex}
                      onLike={() => handleLike(post.id)}
                      onSaveToggle={() => handleSaveToggle(post.id)}
                      onDelete={() => handleDeletePost(post.id)}
                      userId={post.user_id}
                      profile={post.profile}
                    />
                  </PostErrorBoundary>
                </div>
              ))}
              {loadingMore && (
                <div className="flex h-screen items-center justify-center snap-start">
                  <div className="text-center space-y-4 animate-fade-in">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-muted-foreground">
                      {posts.length > 50 
                        ? "Discovering more content..." 
                        : "Loading more posts..."}
                    </p>
                  </div>
                </div>
              )}
              {!loadingMore && posts.length > 0 && (
                <div className="flex h-screen items-center justify-center snap-start">
                  <div className="text-center space-y-4 px-6 animate-fade-in">
                    <p className="text-muted-foreground">Keep scrolling - there's always more!</p>
                    <Button 
                      onClick={scrollToTop}
                      variant="default"
                      className="touch-manipulation active:scale-95"
                    >
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
