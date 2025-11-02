import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FeedPost } from "./FeedPost";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { FeedLoadingSkeleton } from "./LoadingSkeleton";
import { RefreshCw, ArrowUp } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

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
  is_liked?: boolean;
  is_saved?: boolean;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio?: string;
  followers_count?: number;
  following_count?: number;
}

type VerticalFeedProps = {
  initialPosts?: Post[];
};

export const VerticalFeed = ({ initialPosts = [] }: VerticalFeedProps) => {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(initialPosts.length === 0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedType, setFeedType] = useState<"for-you" | "following">("for-you");
  const [userId, setUserId] = useState<string | null>(null);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastPostRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const profileCacheRef = useRef<Map<string, any>>(new Map());
  const trackedPostsRef = useRef<Set<string>>(new Set()); // Dedupe tracking

  useEffect(() => {
    const initializeUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
      }
    };
    initializeUser();
  }, []);

  // Initialize with provided posts
  useEffect(() => {
    if (initialPosts.length > 0) {
      setPosts(initialPosts);
      setLoading(false);
    }
  }, [initialPosts]);

  useEffect(() => {
    if (userId && initialPosts.length === 0) {
      fetchPosts();
      const cleanup = setupRealtimeSubscription();
      return cleanup;
    }
  }, [userId]);

  useEffect(() => {
    if (userId && initialPosts.length === 0) {
      setPosts([]);
      setHasMore(true);
      setLoading(true);
      trackedPostsRef.current.clear(); // Clear tracking cache on feed change
      fetchPosts();
    }
  }, [feedType, userId]);

  useEffect(() => {
    // Setup intersection observer for infinite scroll - trigger earlier
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
      // Force a tiny delay to ensure DOM is ready
      setTimeout(() => {
        setCurrentIndex(0);
      }, 100);
    }
  }, [posts.length]);

  // Keep all videos in DOM for caching, but hide distant ones
  const VISIBLE_RANGE = 3; // Show current + 3 before + 3 after

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

      const BATCH_SIZE = 10;
      const offset = cursor ? posts.length : 0;

      // Use simple feed function
      const { data: feedData, error } = await supabase.rpc("get_simple_feed", {
        p_user_id: session.user.id,
        p_feed_type: feedType,
        p_limit: BATCH_SIZE,
        p_offset: offset,
      });

      if (error) throw error;

      const fetchedPosts = (feedData || []).map((post: any) => ({
        ...post,
        media_type: post.media_type as "image" | "video",
        user_liked: post.is_liked,
        user_saved: post.is_saved,
        profile: {
          id: post.user_id,
          username: post.username,
          display_name: post.display_name,
          avatar_url: post.avatar_url,
          bio: post.bio,
          followers_count: post.followers_count,
          following_count: post.following_count,
        }
      }));

      if (isRefresh) {
        setPosts(fetchedPosts);
        setNewPostsCount(0);
      } else if (cursor) {
        setPosts((current) => [...current, ...fetchedPosts]);
      } else {
        setPosts(fetchedPosts);
      }

      setHasMore(fetchedPosts.length === BATCH_SIZE);
      
      setLoading(false);
      setLoadingMore(false);
      setIsRefreshing(false);
    } catch (error: any) {
      console.error(`Feed fetch error (${feedType}):`, error);
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
    await fetchPosts(undefined, true);
    toast.success("Feed refreshed");
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
          // Notify about new posts
          setNewPostsCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    // Debounce scroll handling - increased delay for better performance
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      
      const scrollTop = containerRef.current.scrollTop;
      const containerHeight = containerRef.current.clientHeight;
      
      // Calculate which post is most visible (center of viewport)
      const centerPoint = scrollTop + (containerHeight / 2);
      const index = Math.floor(centerPoint / window.innerHeight);
      
      if (index !== currentIndex && index >= 0 && index < posts.length) {
        setCurrentIndex(index);
        
        // Track view - fire-and-forget
        if (posts[index]) {
          trackView(posts[index].id);
        }
      }
    }, 200); // Increased from 100ms to 200ms for less overhead
  }, [currentIndex, posts]);

  const trackView = (postId: string) => {
    // Dedupe: Don't track same post multiple times
    if (trackedPostsRef.current.has(postId)) return;
    trackedPostsRef.current.add(postId);
    
    // Fire-and-forget: completely non-blocking tracking
    setTimeout(() => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        void supabase.from("post_views").insert({
          post_id: postId,
          user_id: user?.id || null,
        });
      });
    }, 0);
  };

  const handleLike = async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to like posts");
      return;
    }

    const { data, error } = await supabase.rpc("toggle_post_like", {
      p_post_id: postId,
    });

    if (error) {
      toast.error("Failed to update like");
      if (import.meta.env.DEV) {
        console.error(error);
      }
    } else if (data && data.length > 0) {
      const { liked, new_count } = data[0];
      
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? { ...post, likes_count: new_count, is_liked: liked }
            : post
        )
      );
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

    try {
      if (post.is_saved) {
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

      setPosts((current) =>
        current.map((p) =>
          p.id === postId ? { ...p, is_saved: !p.is_saved } : p
        )
      );
    } catch (error: any) {
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

    // Show undo toast with action
    const undoToastId = toast.success("Post deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          // Restore post to UI
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

    // Set timeout for actual deletion
    const deleteTimeoutId = setTimeout(async () => {
      try {
        // Delete from database
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
      {/* Feed Type Tabs */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="relative">
          <Tabs value={feedType} onValueChange={(value) => setFeedType(value as "for-you" | "following")} className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-12 rounded-none">
              <TabsTrigger value="for-you" className="text-sm font-medium relative">
                For You
                {newPostsCount > 0 && feedType === "for-you" && (
                  <Badge variant="destructive" className="ml-2 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                    {newPostsCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="following" className="text-sm font-medium">
                Following
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        {/* New Posts Banner */}
        {newPostsCount > 0 && currentIndex > 0 && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 z-20 mt-2">
            <Button
              variant="secondary"
              size="sm"
              className="shadow-lg"
              onClick={() => {
                scrollToTop();
                setNewPostsCount(0);
              }}
            >
              <ArrowUp className="h-4 w-4 mr-1" />
              {newPostsCount} new {newPostsCount === 1 ? 'post' : 'posts'}
            </Button>
          </div>
        )}
      </div>

      {/* Feed Content */}
      <div className="flex flex-1 justify-center relative">
        <div
          ref={containerRef}
          className="h-full w-full max-w-md snap-y snap-mandatory overflow-y-scroll scrollbar-hide scroll-smooth"
          onScroll={handleScroll}
          style={{ scrollSnapType: 'y mandatory' }}
        >
          {posts.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground mb-4">
                  {feedType === "following" ? "No posts from people you follow" : "No posts yet"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {feedType === "following" ? "Follow some users to see their posts here" : "Discover amazing content"}
                </p>
                <Button onClick={handleRefresh} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Feed
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Render ALL posts, hide distant ones to preserve video cache */}
              {posts.map((post, index) => {
                const distanceFromCurrent = Math.abs(index - currentIndex);
                const isInVisibleRange = distanceFromCurrent <= VISIBLE_RANGE;
                
                return (
                  <div
                    key={`${post.id}-${index}`}
                    ref={index === posts.length - 5 ? lastPostRef : null}
                    className="snap-start snap-always"
                    style={{
                      // Keep in DOM but hide if too far from current
                      display: isInVisibleRange ? 'block' : 'none',
                      // Optimize rendering for hidden elements
                      opacity: isInVisibleRange ? 1 : 0,
                      pointerEvents: isInVisibleRange ? 'auto' : 'none',
                    }}
                  >
                    <FeedPost
                      id={post.id}
                      mediaUrl={post.media_url}
                      mediaType={post.media_type}
                      caption={post.caption}
                      likesCount={post.likes_count}
                      commentsCount={post.comments_count}
                      sharesCount={post.shares_count}
                      isSaved={post.is_saved || false}
                      isLiked={post.is_liked || false}
                      isActive={index === currentIndex}
                      isPrevious={index === currentIndex - 1}
                      isNext={index === currentIndex + 1}
                      nextVideoUrl={
                        index === currentIndex && posts[index + 1]?.media_type === 'video'
                          ? posts[index + 1]?.media_url
                          : undefined
                      }
                      onLike={() => handleLike(post.id)}
                      onSaveToggle={() => handleSaveToggle(post.id)}
                      onDelete={() => handleDeletePost(post.id)}
                      profile={{ 
                        display_name: post.display_name, 
                        username: post.username, 
                        avatar_url: post.avatar_url 
                      }}
                      userId={post.user_id}
                    />
                  </div>
                );
              })}
              {loadingMore && (
                <div className="flex h-screen items-center justify-center snap-start">
                  <div className="text-center space-y-4">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-muted-foreground">Loading more amazing content...</p>
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
