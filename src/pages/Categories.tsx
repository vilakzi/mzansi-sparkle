import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { CategoryLoadingSkeleton } from "@/components/LoadingSkeleton";
import { toast } from "sonner";

type Category = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  posts_count: number;
};

type Profile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const Categories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCategories();
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user.id)
        .single();

      if (data) {
        setUserProfile(data);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("post_categories")
        .select("*")
        .order("posts_count", { ascending: false });

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (categoryName: string) => {
    navigate(`/category/${categoryName}`);
  };

  if (loading) {
    return <CategoryLoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
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
          <h1 className="text-xl font-semibold">Browse Categories</h1>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="max-w-2xl mx-auto p-4">
        <div className="grid grid-cols-2 gap-4">
          {categories.map((category) => (
            <Card
              key={category.id}
              className="p-6 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleCategoryClick(category.name)}
            >
              <div className="flex flex-col items-center text-center gap-3">
                {category.icon && (
                  <div className="text-4xl">{category.icon}</div>
                )}
                <div>
                  <h3 className="font-semibold text-lg mb-1">
                    {category.display_name}
                  </h3>
                  {category.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {category.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {category.posts_count} {category.posts_count === 1 ? "post" : "posts"}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {categories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No categories available</p>
          </div>
        )}
      </div>

      <BottomNav onUploadClick={() => {}} userProfile={userProfile} />
    </div>
  );
};

export default Categories;
