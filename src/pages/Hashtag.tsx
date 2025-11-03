import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Hash } from "lucide-react";
import { toast } from "sonner";

type HashtagPost = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  likes_count: number;
  comments_count: number;
};

const Hashtag = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<HashtagPost[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (name) {
      fetchHashtagPosts();
    }
  }, [name]);

  const fetchHashtagPosts = async () => {
    try {
      // Get hashtag info
      const { data: hashtagData, error: hashtagError } = await supabase
        .from("hashtags")
        .select("id, posts_count")
        .eq("name", name)
        .single();

      if (hashtagError) throw hashtagError;
      setPostsCount(hashtagData.posts_count);

      // Get post IDs linked to this hashtag
      const { data: postHashtagsData, error: postHashtagsError } =
        await supabase
          .from("post_hashtags")
          .select("post_id")
          .eq("hashtag_id", hashtagData.id);

      if (postHashtagsError) throw postHashtagsError;

      const postIds = (postHashtagsData || []).map((ph) => ph.post_id);

      if (postIds.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // Get the actual posts
      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select(
          "id, media_url, media_type, caption, likes_count, comments_count",
        )
        .in("id", postIds)
        .order("created_at", { ascending: false });

      if (postsError) throw postsError;
      setPosts(postsData || []);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      console.error("Error fetching hashtag posts:", error);
      toast.error("Failed to load hashtag posts");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 z-50 bg-background border-b p-4">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Hash className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">#{name}</h1>
              <p className="text-muted-foreground">
                {postsCount} {postsCount === 1 ? "post" : "posts"}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          {posts.length === 0
            ? (
              <p className="text-center text-muted-foreground py-12">
                No posts with this hashtag yet
              </p>
            )
            : (
              <div className="grid grid-cols-3 gap-1">
                {posts.map((post) => (
                  <Card
                    key={post.id}
                    className="aspect-square overflow-hidden relative group cursor-pointer"
                  >
                    {post.media_type.startsWith("image")
                      ? (
                        <img
                          src={post.media_url}
                          alt={post.caption || "Post"}
                          className="w-full h-full object-cover"
                        />
                      )
                      : (
                        <video
                          src={post.media_url}
                          className="w-full h-full object-cover"
                        />
                      )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="text-white text-center text-sm">
                        <div>❤️ {post.likes_count}</div>
                        <div>💬 {post.comments_count}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Hashtag;
