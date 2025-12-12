import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, UserPlus, UserMinus, Settings, ShieldAlert, MoreVertical, Edit, Trash2, MessageCircle, Grid3X3, Play } from "lucide-react";
import { toast } from "sonner";
import { ReportDialog } from "@/components/ReportDialog";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { ProfileLoadingSkeleton } from "@/components/LoadingSkeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Profile = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  whatsapp_number: string | null;
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
  const [showReport, setShowReport] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

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
          .select(`id, media_url, media_type, caption, likes_count, created_at`)
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

  const handleMessage = async () => {
    if (!currentUserId || !profile) return;
    
    try {
      const { data, error } = await supabase.rpc('get_or_create_conversation', {
        p_other_user_id: profile.id
      });
      
      if (error) throw error;
      navigate(`/conversation/${data}`);
    } catch (error: any) {
      toast.error("Failed to start conversation");
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!currentUserId) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    setPosts((current) => current.filter(p => p.id !== postId));
    setPostToDelete(null);

    toast.success("Post deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          setPosts((current) => [...current, post].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ));
          clearTimeout(deleteTimeoutId);
        }
      },
      duration: 5000,
    });

    const deleteTimeoutId = setTimeout(async () => {
      try {
        const { error: deleteError } = await supabase.rpc('delete_post_with_media', {
          p_post_id: postId
        });

        if (deleteError) throw deleteError;

        const storagePath = post.media_url.split('/').slice(-2).join('/');
        await supabase.storage.from('posts-media').remove([storagePath]);
      } catch (error: any) {
        console.error('Error deleting post:', error);
        setPosts((current) => [...current, post].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
        toast.error("Failed to delete post");
      }
    }, 5000);
  };

  const refreshProfile = async () => {
    if (!username) return;
    
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();

      if (profileData) {
        setProfile(profileData);
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  };

  if (loading) {
    return <ProfileLoadingSkeleton />;
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
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-lg font-semibold truncate">{profile.username}</h1>
            </div>
            {isOwnProfile ? (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setShowEditProfile(true)} className="h-9 w-9">
                  <Edit className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} className="h-9 w-9">
                  <Settings className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowReport(true)}>
                    Report User
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    if (!currentUserId) return;
                    const { error } = await supabase.from("blocked_users").insert({
                      blocker_id: currentUserId,
                      blocked_id: profile.id,
                    });
                    if (!error) {
                      setIsBlocked(true);
                      toast.success("User blocked");
                    }
                  }}>
                    <ShieldAlert className="h-4 w-4 mr-2" />
                    Block User
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>
        
        <ReportDialog isOpen={showReport} onClose={() => setShowReport(false)} userId={profile.id} />

        {isOwnProfile && profile && (
          <EditProfileDialog
            open={showEditProfile}
            onOpenChange={setShowEditProfile}
            profile={profile}
            onProfileUpdate={refreshProfile}
          />
        )}

        <AlertDialog open={!!postToDelete} onOpenChange={() => setPostToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Post</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this post? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (postToDelete) {
                    handleDeletePost(postToDelete);
                    setPostToDelete(null);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Profile Info */}
        <div className="px-4 py-6">
          <div className="flex gap-5">
            {/* Avatar */}
            <Avatar className="h-20 w-20 flex-shrink-0 ring-2 ring-border">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {profile.display_name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Stats */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate mb-1">{profile.display_name}</h2>
              <p className="text-muted-foreground text-sm mb-3">@{profile.username}</p>
              
              <div className="flex gap-5">
                <div className="text-center">
                  <p className="font-bold text-lg">{posts.length}</p>
                  <p className="text-muted-foreground text-xs">Posts</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-lg">{profile.followers_count}</p>
                  <p className="text-muted-foreground text-xs">Followers</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-lg">{profile.following_count}</p>
                  <p className="text-muted-foreground text-xs">Following</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="text-sm mt-4 text-foreground/90 leading-relaxed">{profile.bio}</p>
          )}

          {/* Action Buttons */}
          {!isOwnProfile && currentUserId && (
            <div className="flex gap-2 mt-4">
              <Button 
                onClick={handleFollow}
                variant={isFollowing ? "outline" : "default"}
                className="flex-1"
              >
                {isFollowing ? (
                  <>
                    <UserMinus className="h-4 w-4 mr-2" />
                    Unfollow
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Follow
                  </>
                )}
              </Button>
              
              <Button variant="outline" onClick={handleMessage} className="flex-1">
                <MessageCircle className="h-4 w-4 mr-2" />
                Message
              </Button>
              
              {isFollowing && profile.whatsapp_number && (
                <WhatsAppButton
                  phoneNumber={profile.whatsapp_number}
                  displayName={profile.display_name}
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0"
                />
              )}
            </div>
          )}
        </div>

        {/* Posts Grid */}
        <Tabs defaultValue="posts" className="w-full">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-12">
            <TabsTrigger 
              value="posts" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Grid3X3 className="h-5 w-5" />
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="posts" className="mt-0">
            {posts.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-muted-foreground">No posts yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {posts.map((post) => (
                  <div 
                    key={post.id} 
                    className="relative aspect-square group cursor-pointer bg-muted"
                    onClick={() => navigate(`/post/${post.id}`)}
                  >
                    {post.media_type.startsWith("image") ? (
                      <img 
                        src={post.media_url} 
                        alt={post.caption || "Post"} 
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="relative w-full h-full">
                        <video 
                          src={post.media_url} 
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-black/40 rounded-full p-2">
                            <Play className="h-5 w-5 text-white" fill="white" />
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Hover overlay with delete for own posts */}
                    {isOwnProfile && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPostToDelete(post.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Profile;
