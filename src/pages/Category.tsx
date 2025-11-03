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
      // Categories feature coming soon - tables not yet created
      setPosts([]);
      setLoading(false);
    } catch (error) {
      console.error("Error loading category:", error);
      toast.error("Failed to load category");
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
          <div>
            <h1 className="text-xl font-semibold">Categories</h1>
            <p className="text-sm text-muted-foreground">Feature coming soon</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-4">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Category feature coming soon</p>
          <Button 
            onClick={() => navigate("/")} 
            className="mt-4"
          >
            Back to Feed
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Category;