import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, UserPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { FeedPost } from "@/components/FeedPost";

type Profile = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
};

type Post = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  likes_count: number;
  created_at: string;
  user_liked: boolean;
};

const Profile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("username", username)
          .single();

        if (profileError) throw profileError;
        setProfile(profileData);

        if (user?.id && profileData.id !== user.id) {
          const { data: followData } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", user.id)
            .eq("following_id", profileData.id)
            .single();
          
          setIsFollowing(!!followData);
        }

        const { data: postsData, error: postsError } = await supabase
          .from("posts")
          .select(`
            id,
            media_url,
            media_type,
            caption,
            likes_count,
            created_at
          `)
          .eq("user_id", profileData.id)
          .order("created_at", { ascending: false });

        if (postsError) throw postsError;

        const postsWithLikes = user?.id ? await Promise.all(
          (postsData || []).map(async (post) => {
            const { data: likeData } = await supabase
              .from("post_likes")
              .select("id")
              .eq("post_id", post.id)
              .eq("user_id", user.id)
              .single();
            
            return { ...post, user_liked: !!likeData };
          })
        ) : (postsData || []).map(post => ({ ...post, user_liked: false }));

        setPosts(postsWithLikes);
      } catch (error: any) {
        toast.error("Failed to load profile");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  const handleFollow = async () => {
    if (!currentUserId || !profile) return;

    try {
      const { data, error } = await supabase.rpc("toggle_follow", {
        p_following_id: profile.id,
      });

      if (error) throw error;

      const result = data[0];
      setIsFollowing(result.is_following);
      setProfile({
        ...profile,
        followers_count: result.new_follower_count,
      });

      toast.success(result.is_following ? "Following" : "Unfollowed");
    } catch (error: any) {
      toast.error(error.message || "Failed to update follow status");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Profile not found</p>
      </div>
    );
  }

  const isOwnProfile = currentUserId === profile.id;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto">
        <div className="p-4 flex items-center gap-4 border-b">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">{profile.username}</h1>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-6 mb-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {profile.display_name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <h2 className="text-2xl font-bold">{profile.display_name}</h2>
                {!isOwnProfile && currentUserId && (
                  <Button 
                    onClick={handleFollow}
                    variant={isFollowing ? "outline" : "default"}
                    size="sm"
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="h-4 w-4 mr-1" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-1" />
                        Follow
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div className="flex gap-6 mb-4">
                <div>
                  <span className="font-semibold">{posts.length}</span>
                  <span className="text-muted-foreground ml-1">posts</span>
                </div>
                <div>
                  <span className="font-semibold">{profile.followers_count}</span>
                  <span className="text-muted-foreground ml-1">followers</span>
                </div>
                <div>
                  <span className="font-semibold">{profile.following_count}</span>
                  <span className="text-muted-foreground ml-1">following</span>
                </div>
              </div>

              {profile.bio && <p className="text-sm">{profile.bio}</p>}
            </div>
          </div>

          <Tabs defaultValue="posts" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="posts" className="flex-1">Posts</TabsTrigger>
            </TabsList>
            
            <TabsContent value="posts" className="mt-6">
              <div className="grid grid-cols-3 gap-1">
                {posts.map((post) => (
                  <Card 
                    key={post.id} 
                    className="aspect-square overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => {/* Could open post modal */}}
                  >
                    {post.media_type.startsWith("image") ? (
                      <img 
                        src={post.media_url} 
                        alt={post.caption || "Post"} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video 
                        src={post.media_url} 
                        className="w-full h-full object-cover"
                      />
                    )}
                  </Card>
                ))}
              </div>
              
              {posts.length === 0 && (
                <p className="text-center text-muted-foreground py-12">No posts yet</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Profile;
