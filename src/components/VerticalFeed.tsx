import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FeedPost } from "./FeedPost";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { FeedLoadingSkeleton } from "./LoadingSkeleton";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastPostRef = useRef<HTMLDivElement>(null);

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
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
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
  }, [hasMore, loadingMore, loading, posts.length]);

  const fetchPosts = async (cursor?: string) => {
    try {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const BATCH_SIZE = 15;
      let fetchedPosts: any[] = [];

      if (feedType === "following") {
        // Use the following feed function
        const { data, error } = await supabase.rpc("get_following_feed", {
          p_user_id: session.user.id,
          p_limit: BATCH_SIZE,
          p_offset: cursor ? posts.length : 0
        });

        if (error) throw error;
        fetchedPosts = data || [];
      } else {
        // Use the personalized feed function
        const { data, error } = await supabase.rpc("get_personalized_feed", {
          p_user_id: session.user.id,
          p_limit: BATCH_SIZE,
          p_offset: cursor ? posts.length : 0
        });

        if (error) throw error;
        fetchedPosts = data || [];
      }

      // Check if there are more posts
      if (!fetchedPosts || fetchedPosts.length < BATCH_SIZE) {
        setHasMore(false);
      }

      // Fetch additional profile and interaction data for each post
      const postsWithDetails = await Promise.all(
        fetchedPosts.map(async (post) => {
          const [profileData, likeData, saveData] = await Promise.all([
            supabase
              .from("profiles")
              .select("username, display_name, avatar_url")
              .eq("id", post.user_id)
              .single(),
            supabase
              .from("post_likes")
              .select("user_id")
              .eq("post_id", post.id)
              .eq("user_id", session.user.id)
              .maybeSingle(),
            supabase
              .from("saved_posts")
              .select("user_id")
              .eq("post_id", post.id)
              .eq("user_id", session.user.id)
              .maybeSingle()
          ]);

          return {
            ...post,
            profile: profileData.data,
            user_liked: !!likeData.data,
            user_saved: !!saveData.data
          };
        })
      );

      if (cursor) {
        setPosts((current) => [...current, ...postsWithDetails]);
      } else {
        setPosts(postsWithDetails);
      }
      
      setLoading(false);
      setLoadingMore(false);
    } catch (error) {
      toast.error("Failed to load posts");
      if (import.meta.env.DEV) {
        console.error(error);
      }
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    
    setLoadingMore(true);
    await fetchPosts("load-more");
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
        (payload) => {
          if (feedType === "for-you") {
            setPosts((current) => [payload.new as Post, ...current]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    
    const scrollTop = containerRef.current.scrollTop;
    const index = Math.round(scrollTop / window.innerHeight);
    
    if (index !== currentIndex) {
      setCurrentIndex(index);
      
      // Track view when user scrolls to a new post
      if (posts[index]) {
        trackView(posts[index].id);
      }
    }
  };

  const trackView = async (postId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from("post_views").insert({
        post_id: postId,
        user_id: user?.id || null,
        watch_duration: 0,
      });

      // Update user interests based on this view
      if (user?.id) {
        await supabase.rpc("update_user_interests_from_interaction", {
          p_user_id: user.id,
          p_post_id: postId
        });
      }
    } catch (error) {
      // Silently fail - view tracking is not critical
      if (import.meta.env.DEV) {
        console.error("View tracking error:", error);
      }
    }
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
            ? { ...post, likes_count: new_count, user_liked: liked }
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
        <Tabs value={feedType} onValueChange={(value) => setFeedType(value as "for-you" | "following")} className="w-full">
          <TabsList className="w-full grid grid-cols-2 h-12 rounded-none">
            <TabsTrigger value="for-you" className="text-sm font-medium">
              For You
            </TabsTrigger>
            <TabsTrigger value="following" className="text-sm font-medium">
              Following
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Feed Content */}
      <div className="flex flex-1 justify-center">
        <div
          ref={containerRef}
          className="h-full w-full max-w-md snap-y snap-mandatory overflow-y-scroll scrollbar-hide"
          onScroll={handleScroll}
        >
          {posts.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  {feedType === "following" ? "No posts from people you follow" : "No posts yet"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {feedType === "following" ? "Follow some users to see their posts here" : "Be the first to share something!"}
                </p>
              </div>
            </div>
          ) : (
            <>
              {posts.map((post, index) => (
                <div
                  key={post.id}
                  ref={index === posts.length - 3 ? lastPostRef : null}
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
                <div className="flex h-screen items-center justify-center">
                  <p className="text-muted-foreground">Loading more posts...</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
