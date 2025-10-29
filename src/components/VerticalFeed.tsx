import { useEffect, useState, useRef } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPosts();
    setupRealtimeSubscription();
  }, []);

  const fetchPosts = async () => {
    const { data: postsData, error } = await supabase
      .from("posts")
      .select(`
        *,
        profiles:user_id (
          display_name,
          username,
          avatar_url
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load posts");
      if (import.meta.env.DEV) {
        console.error(error);
      }
      setLoading(false);
      return;
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user && postsData) {
      // Fetch user's likes and saved posts
      const [{ data: userLikes }, { data: userSaved }] = await Promise.all([
        supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", user.id),
        supabase
          .from("saved_posts")
          .select("post_id")
          .eq("user_id", user.id)
      ]);
      
      const likedPostIds = new Set(userLikes?.map(like => like.post_id) || []);
      const savedPostIds = new Set(userSaved?.map(save => save.post_id) || []);
      
      // Add user_liked and user_saved flags to each post
      const postsWithLikes = postsData.map((post: any) => ({
        ...post,
        user_liked: likedPostIds.has(post.id),
        user_saved: savedPostIds.has(post.id),
        profile: post.profiles
      })) as Post[];
      
      setPosts(postsWithLikes);
    } else {
      setPosts((postsData || []).map((post: any) => ({
        ...post,
        user_liked: false,
        user_saved: false,
        profile: post.profiles
      })) as Post[]);
    }
    
    setLoading(false);
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
          setPosts((current) => [payload.new as Post, ...current]);
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading feed...</p>
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
          <FeedPost
            key={post.id}
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
        ))}
      </div>
    </div>
  );
};
