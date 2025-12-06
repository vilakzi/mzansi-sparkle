import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FeedPost } from "./FeedPost";
import { toast } from "sonner";

interface Post {
  id: string;
  media_url: string;
  media_type: "image" | "video";
  caption?: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  user_liked?: boolean;
  user_saved?: boolean;
  profile?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

const BATCH_SIZE = 15;

export const VerticalFeed = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastPostRef = useRef<HTMLDivElement>(null);
  const paginationCursorRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const channelRef = useRef<any>(null);

  // Initial fetch on mount
  useEffect(() => {
    fetchPosts();
    const cleanup = setupRealtimeSubscription();
    
    return () => {
      cleanup();
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Setup intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading && !isFetchingRef.current) {
          loadMore();
        }
      },
      { threshold: 0.3 }
    );

    if (lastPostRef.current) {
      observerRef.current.observe(lastPostRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loadingMore, loading]);

  const fetchUserEngagement = useCallback(
    async (postIds: string[], userId?: string) => {
      if (!userId || postIds.length === 0) {
        return { likedPostIds: new Set(), savedPostIds: new Set() };
      }

      try {
        const [{ data: userLikes }, { data: userSaved }] = await Promise.all([
          supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", userId)
            .in("post_id", postIds),
          supabase
            .from("saved_posts")
            .select("post_id")
            .eq("user_id", userId)
            .in("post_id", postIds),
        ]);

        return {
          likedPostIds: new Set(userLikes?.map((like) => like.post_id) || []),
          savedPostIds: new Set(userSaved?.map((save) => save.post_id) || []),
        };
      } catch (err) {
        console.error("Failed to fetch user engagement:", err);
        return { likedPostIds: new Set(), savedPostIds: new Set() };
      }
    },
    []
  );

  const fetchPosts = useCallback(
    async (cursor?: string) => {
      if (isFetchingRef.current) return;

      try {
        isFetchingRef.current = true;
        setError(null);

        let query = supabase
          .from("posts")
          .select(
            `
            *,
            profiles:user_id (
              display_name,
              username,
              avatar_url
            )
          `,
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .limit(BATCH_SIZE);

        if (cursor) {
          query = query.lt("created_at", cursor);
        }

        const { data: postsData, error: queryError } = await query;

        if (queryError) {
          throw queryError;
        }

        if (!postsData || postsData.length === 0) {
          setHasMore(false);
          if (!cursor) {
            setPosts([]);
          }
          isFetchingRef.current = false;
          return;
        }

        // Check if there are more posts
        if (postsData.length < BATCH_SIZE) {
          setHasMore(false);
        }

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        // Fetch user engagement (likes and saves)
        const postIds = postsData.map((p) => p.id);
        const { likedPostIds, savedPostIds } = await fetchUserEngagement(
          postIds,
          user?.id
        );

        // Transform posts with engagement data
        const transformedPosts = postsData.map((post: any) => ({
          ...post,
          user_liked: likedPostIds.has(post.id),
          user_saved: savedPostIds.has(post.id),
          profile: post.profiles,
        })) as Post[];

        // Avoid duplicates when appending
        if (cursor) {
          setPosts((current) => {
            const existingIds = new Set(current.map((p) => p.id));
            const newPosts = transformedPosts.filter(
              (p) => !existingIds.has(p.id)
            );
            return [...current, ...newPosts];
          });
        } else {
          setPosts(transformedPosts);
        }

        // Update cursor for next fetch
        if (transformedPosts.length > 0) {
          paginationCursorRef.current =
            transformedPosts[transformedPosts.length - 1].created_at;
        }

        setRetryCount(0);
      } catch (err) {
        console.error("Error fetching posts:", err);
        setError(err instanceof Error ? err.message : "Failed to load posts");
        
        // Retry logic
        if (retryCount < 2) {
          setRetryCount((prev) => prev + 1);
          toast.error("Retrying...");
          setTimeout(() => fetchPosts(cursor), 2000);
        } else {
          toast.error("Failed to load posts. Please try again.");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        isFetchingRef.current = false;
      }
    },
    [retryCount, fetchUserEngagement]
  );
  };

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || loadingMore || !hasMore || posts.length === 0) {
      return;
    }

    setLoadingMore(true);
    await fetchPosts(paginationCursorRef.current || undefined);
  }, [fetchPosts, hasMore, loadingMore, posts.length]);

  const setupRealtimeSubscription = useCallback(() => {
    try {
      channelRef.current = supabase
        .channel("posts-changes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "posts",
          },
          (payload) => {
            const newPost = {
              ...payload.new,
              user_liked: false,
              user_saved: false,
              profile: (payload.new as any).profiles,
            } as Post;
            
            setPosts((current) => {
              // Avoid duplicates
              if (current.some((p) => p.id === newPost.id)) {
                return current;
              }
              return [newPost, ...current];
            });
          }
        )
        .subscribe();

      return () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
      };
    } catch (err) {
      console.error("Error setting up realtime subscription:", err);
      return () => {};
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const scrollTop = containerRef.current.scrollTop;
    const index = Math.round(scrollTop / window.innerHeight);

    if (index !== currentIndex) {
      setCurrentIndex(Math.max(0, index));

      // Track view when user scrolls to a new post
      if (posts[index]) {
        trackView(posts[index].id);
      }
    }
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
      // Silently fail - view tracking is not critical
      if (import.meta.env.DEV) {
        console.error("View tracking error:", error);
      }
    }
  };

  const handleLike = useCallback(async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to like posts");
      return;
    }

    try {
      const { data, error } = await supabase.rpc("toggle_post_like", {
        p_post_id: postId,
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const { liked, new_count } = data[0];

        setPosts((current) =>
          current.map((post) =>
            post.id === postId
              ? { ...post, likes_count: new_count, user_liked: liked }
              : post
          )
        );
      }
    } catch (err) {
      toast.error("Failed to update like");
      if (import.meta.env.DEV) {
        console.error(err);
      }
    }
  }, []);

  const handleSaveToggle = useCallback(async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to save posts");
      return;
    }

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

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

      setPosts((current) =>
        current.map((p) =>
          p.id === postId ? { ...p, user_saved: !p.user_saved } : p
        )
      );
    } catch (error: any) {
      toast.error("Failed to save post");
      if (import.meta.env.DEV) {
        console.error(error);
      }
    }
  }, [posts]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading feed...</p>
        </div>
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchPosts();
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">No posts yet. Be the first to post!</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-background">
      <div
        ref={containerRef}
        className="h-screen w-full max-w-md snap-y snap-mandatory overflow-y-scroll scrollbar-hide"
        onScroll={handleScroll}
      >
        {posts.map((post, index) => (
          <div
            key={post.id}
            ref={index === posts.length - 3 ? lastPostRef : undefined}
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
              profile={post.profile}
            />
          </div>
        ))}
        {loadingMore && (
          <div className="flex h-screen items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-2" />
              <p className="text-muted-foreground">Loading more posts...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};