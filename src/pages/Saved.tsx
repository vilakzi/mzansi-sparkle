import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { UploadButton } from "@/components/UploadButton";
import { ArrowLeft, Bookmark } from "lucide-react";
import { toast } from "sonner";

type SavedPost = {
  id: string;
  post_id: string;
  posts: {
    id: string;
    media_url: string;
    media_type: string;
    caption: string | null;
    likes_count: number;
    comments_count: number;
  };
};

const Saved = () => {
  const navigate = useNavigate();
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username: string } | undefined>();

  useEffect(() => {
    fetchSavedPosts();
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (data) setUserProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchSavedPosts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("saved_posts")
        .select(`
          id,
          post_id,
          posts:post_id (
            id,
            media_url,
            media_type,
            caption,
            likes_count,
            comments_count
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSavedPosts(data || []);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Error fetching saved posts:", error.message);
      } else {
        console.error("Error fetching saved posts:", String(error));
      }
      toast.error("Failed to load saved posts");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading saved posts...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 z-50 bg-background border-b p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Bookmark className="h-5 w-5" />
            <h1 className="text-xl font-semibold">Saved Posts</h1>
          </div>
        </div>

        <div className="p-4">
          {savedPosts.length === 0 ? (
            <div className="text-center py-12">
              <Bookmark className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground">No saved posts yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Save posts to view them later
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {savedPosts.map((savedPost) => (
                <Card
                  key={savedPost.id}
                  className="aspect-square overflow-hidden relative group cursor-pointer"
                >
                  {savedPost.posts.media_type.startsWith("image") ? (
                    <img
                      src={savedPost.posts.media_url}
                      alt={savedPost.posts.caption || "Saved post"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={savedPost.posts.media_url}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center text-sm">
                      <div>❤️ {savedPost.posts.likes_count}</div>
                      <div>💬 {savedPost.posts.comments_count}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {showUpload && <UploadButton onClose={() => setShowUpload(false)} />}
      <BottomNav onUploadClick={() => setShowUpload(true)} userProfile={userProfile} />
    </div>
  );
};

export default Saved;
