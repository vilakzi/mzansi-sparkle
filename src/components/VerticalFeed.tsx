import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FeedPost } from "./FeedPost";
import { toast } from "sonner";
import { FeedLoadingSkeleton } from "./LoadingSkeleton";
import { RefreshCw, ArrowUp } from "lucide-react";
import { Button } from "./ui/button";
import fetchFeed from "@/services/feed";

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
  const [userId, setUserId] = useState<string | null>(null);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastPostRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const profileCacheRef = useRef<Map<string, unknown>>(new Map());
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

  useEffect(() => {
    if (posts.length > 0 && currentIndex === 0) {
      setTimeout(() => {
        setCurrentIndex(0);
      }, 100);
    }
  }, [posts.length]);

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

      // Use centralized feed service (simple or personalized depending on feature flag)
      const { rows } = await fetchFeed({
        userId: session.user.id,
        feedType: "for-you",
        limit: BATCH_SIZE,
        offset,
      });

      const fetchedPosts = (rows || []).map((post: unknown) => {
        const postTyped = post as Post & { is_liked: boolean; is_saved: boolean };
        return {
        ...postTyped,
        media_type: postTyped.media_type as "image" | "video",
        user_liked: postTyped.is_liked,
        user_saved: postTyped.is_saved,
        profile: {
          id: postTyped.user_id,
          username: postTyped.username,
          display_name: postTyped.display_name,
          avatar_url: postTyped.avatar_url,
          bio: postTyped.bio,
          followers_count: postTyped.followers_count,
          following_count: postTyped.following_count,
        }
      };
      });

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
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
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
    }, 200);
  }, [currentIndex, posts]);

  const trackView = (postId: string) => {
    if (trackedPostsRef.current.has(postId)) return;
    trackedPostsRef.current.add(postId);
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
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);

        if (error) throw error;
        toast.success("Post removed from saved");
      } else {
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      toast.error("Failed to save post");
      if (import.meta.env.DEV) {
        console.error(error);
      }
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
    const deleteTimeoutId = setTimeout(async () => {
      try {
        const { error: deleteError } = await supabase.rpc('delete_post_with_media', {
          p_post_id: postId
        });

        if (deleteError) throw deleteError;
        const storagePath = post.media_url.split('/').slice(-2).join('/');
        await supabase.storage.from('posts-media').remove([storagePath]);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error(String(error));
        }
        console.error('Error deleting post:', error);
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
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Feed</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
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
      </header>
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
                  No posts yet
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Discover amazing content
                </p>
                <Button onClick={handleRefresh} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Feed
                </Button>
              </div>
            </div>
          ) : (
            <>
              {posts.map((post, index) => {
                const distanceFromCurrent = Math.abs(index - currentIndex);
                const isInVisibleRange = distanceFromCurrent <= VISIBLE_RANGE;
                return (
                  <div
                    key={`${post.id}-${index}`}
                    ref={index === posts.length - 5 ? lastPostRef : null}
                    className="snap-start snap-always"
                    style={{
                      display: isInVisibleRange ? 'block' : 'none',
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

export default VerticalFeed;