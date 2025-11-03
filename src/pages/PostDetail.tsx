import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Bookmark,
  Heart,
  MessageCircle,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CommentSheet } from "@/components/CommentSheet";
import { ShareSheet } from "@/components/ShareSheet";
import { formatDistanceToNow } from "date-fns";
import { PostDetailLoadingSkeleton } from "@/components/LoadingSkeleton";

type Post = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  user_liked: boolean;
  user_saved: boolean;
  profile: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
};

const PostDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    if (id) {
      fetchPost();
    }
  }, [id]);

  const fetchPost = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: postData, error } = await supabase
        .from("posts")
        .select(`
          id,
          media_url,
          media_type,
          caption,
          likes_count,
          comments_count,
          shares_count,
          created_at,
          profiles:user_id (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      if (user) {
        const [{ data: likeData }, { data: savedData }] = await Promise.all([
          supabase
            .from("post_likes")
            .select("id")
            .eq("post_id", id)
            .eq("user_id", user.id)
            .single(),
          supabase
            .from("saved_posts")
            .select("id")
            .eq("post_id", id)
            .eq("user_id", user.id)
            .single(),
        ]);

        setPost({
          ...postData,
          user_liked: !!likeData,
          user_saved: !!savedData,
          profile: postData.profiles,
        });
      } else {
        setPost({
          ...postData,
          user_liked: false,
          user_saved: false,
          profile: postData.profiles,
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      console.error("Error fetching post:", error);
      toast.error("Failed to load post");
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!post) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to like posts");
      return;
    }

    const { data, error } = await supabase.rpc("toggle_post_like", {
      p_post_id: post.id,
    });

    if (error) {
      toast.error("Failed to update like");
    } else if (data && data.length > 0) {
      const { liked, new_count } = data[0];
      setPost({ ...post, user_liked: liked, likes_count: new_count });
    }
  };

  const handleSaveToggle = async () => {
    if (!post) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to save posts");
      return;
    }

    try {
      if (post.user_saved) {
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);

        if (error) throw error;
        toast.success("Post removed from saved");
      } else {
        const { error } = await supabase
          .from("saved_posts")
          .insert({ post_id: post.id, user_id: user.id });

        if (error) throw error;
        toast.success("Post saved");
      }

      setPost({ ...post, user_saved: !post.user_saved });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      toast.error("Failed to save post");
    }
  };

  if (loading || !post) {
    return <PostDetailLoadingSkeleton />;
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <p className="text-muted-foreground mb-4">Post not found</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 z-40 bg-background border-b p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>

        <div>
          {/* User info */}
          <div className="p-4 flex items-center gap-3 border-b">
            <Avatar
              className="h-10 w-10 cursor-pointer"
              onClick={() => navigate(`/profile/${post.profile.username}`)}
            >
              <AvatarImage src={post.profile.avatar_url || undefined} />
              <AvatarFallback>
                {post.profile.display_name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div
                className="font-semibold cursor-pointer hover:underline"
                onClick={() => navigate(`/profile/${post.profile.username}`)}
              >
                {post.profile.username}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.created_at), {
                  addSuffix: true,
                })}
              </div>
            </div>
          </div>

          {/* Media */}
          <div className="aspect-square bg-black">
            {post.media_type.startsWith("image")
              ? (
                <img
                  src={post.media_url}
                  alt={post.caption || "Post"}
                  className="w-full h-full object-contain"
                />
              )
              : (
                <video
                  src={post.media_url}
                  controls
                  className="w-full h-full object-contain"
                />
              )}
          </div>

          {/* Actions */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleLike}
                  className="flex items-center gap-2"
                >
                  <Heart
                    className={cn(
                      "h-6 w-6",
                      post.user_liked && "fill-red-500 text-red-500",
                    )}
                  />
                  <span className="font-semibold">{post.likes_count}</span>
                </button>

                <button
                  onClick={() => setShowComments(true)}
                  className="flex items-center gap-2"
                >
                  <MessageCircle className="h-6 w-6" />
                  <span className="font-semibold">{post.comments_count}</span>
                </button>

                <button
                  onClick={() => setShowShare(true)}
                  className="flex items-center gap-2"
                >
                  <Share2 className="h-6 w-6" />
                  <span className="font-semibold">{post.shares_count}</span>
                </button>
              </div>

              <button onClick={handleSaveToggle}>
                <Bookmark
                  className={cn("h-6 w-6", post.user_saved && "fill-current")}
                />
              </button>
            </div>

            {post.caption && <p className="text-sm">{post.caption}</p>}
          </div>

          {/* Comments section */}
          <div className="p-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowComments(true)}
            >
              View all {post.comments_count} comments
            </Button>
          </div>
        </div>

        <CommentSheet
          postId={post.id}
          isOpen={showComments}
          onClose={() => setShowComments(false)}
        />

        <ShareSheet
          postId={post.id}
          isOpen={showShare}
          onClose={() => setShowShare(false)}
        />
      </div>
    </div>
  );
};

export default PostDetail;
