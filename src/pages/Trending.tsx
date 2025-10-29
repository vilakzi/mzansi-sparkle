import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { ArrowLeft, Hash, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type TrendingPost = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  likes_count: number;
  comments_count: number;
  views_count: number;
  engagement_score: number;
};

type TrendingHashtag = {
  id: string;
  name: string;
  posts_count: number;
};

const Trending = () => {
  const navigate = useNavigate();
  const [trendingPosts, setTrendingPosts] = useState<TrendingPost[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<TrendingHashtag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username: string } | undefined>();

  useEffect(() => {
    fetchTrending();
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

  const fetchTrending = async () => {
    try {
      // Fetch recent posts and calculate engagement
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select("id, media_url, media_type, caption, likes_count, comments_count, views_count")
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(100);

      if (postsError) throw postsError;

      // Calculate engagement score and sort
      const postsWithScore = (postsData || []).map(post => ({
        ...post,
        engagement_score: (post.likes_count * 3) + (post.comments_count * 2) + post.views_count
      })).sort((a, b) => b.engagement_score - a.engagement_score).slice(0, 50);

      setTrendingPosts(postsWithScore);

      // Fetch trending hashtags
      const { data: hashtagsData, error: hashtagsError } = await supabase
        .from("hashtags")
        .select("id, name, posts_count")
        .order("posts_count", { ascending: false })
        .limit(20);

      if (hashtagsError) throw hashtagsError;
      setTrendingHashtags(hashtagsData || []);
    } catch (error: any) {
      console.error("Error fetching trending:", error);
      toast.error("Failed to load trending content");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading trending content...</p>
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
            <TrendingUp className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Trending</h1>
          </div>
        </div>

        <Tabs defaultValue="posts" className="p-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="hashtags">Hashtags</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-4">
            {trendingPosts.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                No trending posts yet
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {trendingPosts.map((post) => (
                  <Card
                    key={post.id}
                    className="aspect-square overflow-hidden relative group cursor-pointer"
                  >
                    {post.media_type.startsWith("image") ? (
                      <img
                        src={post.media_url}
                        alt={post.caption || "Trending post"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={post.media_url}
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="text-white text-center text-sm">
                        <div>❤️ {post.likes_count}</div>
                        <div>💬 {post.comments_count}</div>
                        <div>👁️ {post.views_count}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="hashtags" className="space-y-3 mt-4">
            {trendingHashtags.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                No trending hashtags yet
              </p>
            ) : (
              trendingHashtags.map((hashtag, index) => (
                <Card
                  key={hashtag.id}
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => navigate(`/hashtag/${hashtag.name}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-bold text-muted-foreground w-8">
                      {index + 1}
                    </div>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Hash className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">#{hashtag.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {hashtag.posts_count} posts
                      </div>
                    </div>
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
      
      <BottomNav onUploadClick={() => setShowUpload(true)} userProfile={userProfile} />
    </div>
  );
};

export default Trending;
