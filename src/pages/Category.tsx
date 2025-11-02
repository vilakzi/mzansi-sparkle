import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Heart, MessageCircle } from "lucide-react";
import { toast } from "sonner";

type CategoryPost = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  likes_count: number;
  comments_count: number;
};

type CategoryInfo = {
  id: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  posts_count: number;
};

const Category = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<CategoryPost[]>([]);
  const [categoryInfo, setCategoryInfo] = useState<CategoryInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (name) {
      fetchCategoryPosts(name);
    }
  }, [name]);

  const fetchCategoryPosts = async (categoryName: string) => {
    try {
      setLoading(true);
      // Category feature removed - redirect to trending
      toast.info("Categories feature is no longer available");
      navigate("/trending");
    } catch (error) {
      console.error("Error:", error);
      navigate("/trending");
    } finally {
      setLoading(false);
    }
  };

  const handlePostClick = (postId: string) => {
    navigate(`/post/${postId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!categoryInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Category not found</p>
          <Button onClick={() => navigate("/categories")}>Browse Categories</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center gap-4 p-4 max-w-2xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="shrink-0"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex items-center gap-3">
            {categoryInfo.icon && (
              <div className="text-2xl">{categoryInfo.icon}</div>
            )}
            <div>
              <h1 className="text-xl font-semibold">{categoryInfo.display_name}</h1>
              {categoryInfo.description && (
                <p className="text-sm text-muted-foreground">{categoryInfo.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Posts Grid */}
      <div className="max-w-2xl mx-auto p-4">
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            {categoryInfo.posts_count} {categoryInfo.posts_count === 1 ? "post" : "posts"}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <div
              key={post.id}
              className="relative aspect-square cursor-pointer group"
              onClick={() => handlePostClick(post.id)}
            >
              {post.media_type === "video" ? (
                <video
                  src={post.media_url}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : (
                <img
                  src={post.media_url}
                  alt={post.caption || "Post"}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                <div className="flex items-center gap-1 text-white">
                  <Heart className="h-5 w-5 fill-current" />
                  <span className="font-semibold">{post.likes_count}</span>
                </div>
                <div className="flex items-center gap-1 text-white">
                  <MessageCircle className="h-5 w-5 fill-current" />
                  <span className="font-semibold">{post.comments_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No posts in this category yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Category;
