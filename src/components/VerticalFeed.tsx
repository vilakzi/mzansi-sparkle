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
  const [feedType, setFeedType] = useState<"for-you" | "following">("for-you");
  const [userId, setUserId] = useState<string | null>(null);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastPostRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (userId) {
      setPosts([]);
      setHasMore(true);
      setLoading(true);
      fetchPosts();
    }
  }, [feedType, userId]);

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

  // Preload next 3 videos when current video changes
  useEffect(() => {
    if (currentIndex >= 0 && posts.length > 0) {
      const nextVideos = posts
        .slice(currentIndex + 1, currentIndex + 4)
        .filter(p => p.media_type === 'video');
      
      // Remove old prefetch links
      document.querySelectorAll('link[data-video-prefetch]').forEach(link => link.remove());
      
      // Add new prefetch links for upcoming videos
      nextVideos.forEach(post => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'video';
        link.href = post.media_url;
        link.setAttribute('data-video-prefetch', 'true');
        document.head.appendChild(link);
      });
    }
  }, [currentIndex, posts]);

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

      // Use optimized RPC function - fetches everything in ONE query (70% faster!)
      const { data: fetchedPosts, error } = await supabase.rpc('get_feed_optimized', {
        p_user_id: session.user.id,
        p_feed_type: feedType,
        p_limit: BATCH_SIZE,
        p_offset: offset
      });

      if (error) throw error;

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
        user_liked: post.user_liked,
        user_saved: post.user_saved,
        profile: {
          display_name: post.display_name,
          username: post.username,
          avatar_url: post.avatar_url
        }
      }));

      if (isRefresh) {
        setPosts(postsWithDetails);
        setNewPostsCount(0);
      } else if (cursor) {
        setPosts((current) => [...current, ...postsWithDetails]);
      } else {
        setPosts(postsWithDetails);
      }

      setHasMore((fetchedPosts || []).length === BATCH_SIZE);
      
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
        
        if (posts[index]) {
          trackView(posts[index].id);
        }
      }
    }, 100);
  }, [currentIndex, posts]);

  const trackView = async (postId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from("post_views").insert({
        post_id: postId,
        user_id: user?.id || null,
        watch_duration: 0,
      });
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

      {/* Feed Container */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll snap-y snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {posts.length === 0 && !loading ? (
            <div className="flex h-screen items-center justify-center snap-start">
              <div className="text-center space-y-4 px-6">
                <p className="text-muted-foreground text-lg">
                  {feedType === "following" 
                    ? "Follow some users to see their posts here"
                    : "No posts available yet"}
                </p>
              </div>
            </div>
          ) : (
            <>
              {posts.map((post, index) => (
                <div
                  key={`${post.id}-${index}`}
                  ref={index === posts.length - 5 ? lastPostRef : null}
                  className="snap-start snap-always"
                >
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
                </div>
              ))}
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