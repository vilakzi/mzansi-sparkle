import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Edit,
  MessageCircle,
  MoreVertical,
  Settings,
  ShieldAlert,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { FeedPost } from "@/components/FeedPost";
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

        const postsWithLikes = user?.id
          ? await Promise.all(
            (postsData || []).map(async (post) => {
              const { data: likeData } = await supabase
                .from("post_likes")
                .select("id")
                .eq("post_id", post.id)
                .eq("user_id", user.id)
                .single();

              return { ...post, user_liked: !!likeData };
            }),
          )
          : (postsData || []).map((post) => ({ ...post, user_liked: false }));

        setPosts(postsWithLikes);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error(String(error));
        }
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update follow status",
      );
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!currentUserId) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    // Optimistically remove from UI
    setPosts((current) => current.filter((p) => p.id !== postId));

    // Close the dialog
    setPostToDelete(null);

    // Show undo toast with action
    toast.success("Post deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          // Restore post to UI
          setPosts((current) =>
            [...current, post].sort((a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            )
          );
          clearTimeout(deleteTimeoutId);
        },
      },
      duration: 5000,
    });

    // Set timeout for actual deletion
    const deleteTimeoutId = setTimeout(async () => {
      try {
        // Delete from database
        const { error: deleteError } = await supabase.rpc(
          "delete_post_with_media",
          {
            p_post_id: postId,
          },
        );

        if (deleteError) throw deleteError;

        // Delete from storage
        const storagePath = post.media_url.split("/").slice(-2).join("/");
        await supabase.storage.from("posts-media").remove([storagePath]);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error(String(error));
        }
        console.error("Error deleting post:", error);
        // Restore post on error
        setPosts((current) =>
          [...current, post].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        );
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
      console.error("Error refreshing profile:", error);
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
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto">
        <div className="p-4 flex items-center justify-between border-b">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">{profile.username}</h1>
          </div>
          {isOwnProfile
            ? (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEditProfile(true)}
                >
                  <Edit className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/settings")}
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </div>
            )
            : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowReport(true)}>
                    Report User
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      if (!currentUserId) return;
                      const { error } = await supabase.from("blocked_users")
                        .insert({
                          blocker_id: currentUserId,
                          blocked_id: profile.id,
                        });
                      if (!error) {
                        setIsBlocked(true);
                        toast.success("User blocked");
                      }
                    }}
                  >
                    <ShieldAlert className="h-4 w-4 mr-2" />
                    Block User
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
        </div>

        <ReportDialog
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          userId={profile.id}
        />

        {isOwnProfile && profile && (
          <EditProfileDialog
            open={showEditProfile}
            onOpenChange={setShowEditProfile}
            profile={profile}
            onProfileUpdate={refreshProfile}
          />
        )}

        <AlertDialog
          open={!!postToDelete}
          onOpenChange={() => setPostToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Post</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this post? This action cannot be
                undone.
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

        <div className="p-6">
          <div className="flex items-start gap-6 mb-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {profile.display_name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                <h2 className="text-2xl font-bold">{profile.display_name}</h2>
                {!isOwnProfile && currentUserId && (
                  <>
                    <Button
                      onClick={handleFollow}
                      variant={isFollowing ? "outline" : "default"}
                      size="sm"
                    >
                      {isFollowing
                        ? (
                          <>
                            <UserMinus className="h-4 w-4 mr-1" />
                            Unfollow
                          </>
                        )
                        : (
                          <>
                            <UserPlus className="h-4 w-4 mr-1" />
                            Follow
                          </>
                        )}
                    </Button>
                    {profile.whatsapp_number && (
                      <WhatsAppButton
                        phoneNumber={profile.whatsapp_number}
                        displayName={profile.display_name}
                        variant="outline"
                        size="sm"
                      />
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-6 mb-4">
                <div>
                  <span className="font-semibold">{posts.length}</span>
                  <span className="text-muted-foreground ml-1">posts</span>
                </div>
                <div>
                  <span className="font-semibold">
                    {profile.followers_count}
                  </span>
                  <span className="text-muted-foreground ml-1">followers</span>
                </div>
                <div>
                  <span className="font-semibold">
                    {profile.following_count}
                  </span>
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
                  <div key={post.id} className="relative group">
                    <Card
                      className="aspect-square overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {/* Could open post modal */}}
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
                    </Card>
                    {isOwnProfile && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPostToDelete(post.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {posts.length === 0 && (
                <p className="text-center text-muted-foreground py-12">
                  No posts yet
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Profile;
