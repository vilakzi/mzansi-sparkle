import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { UploadButton } from "@/components/UploadButton";
import { Heart, MessageCircle, UserPlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  actor: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  post_id: string | null;
  comment_id: string | null;
};

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username: string } | undefined>();

  useEffect(() => {
    fetchNotifications();
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

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(`
          id,
          type,
          read,
          created_at,
          post_id,
          comment_id,
          actor:profiles!notifications_actor_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);

      // Mark all as read
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
        return <Heart className="h-5 w-5 text-red-500" />;
      case "comment":
      case "comment_reply":
        return <MessageCircle className="h-5 w-5 text-blue-500" />;
      case "follow":
        return <UserPlus className="h-5 w-5 text-green-500" />;
      default:
        return null;
    }
  };

  const getNotificationText = (notification: Notification) => {
    const actor = notification.actor.username;
    switch (notification.type) {
      case "like":
        return `${actor} liked your post`;
      case "comment":
        return `${actor} commented on your post`;
      case "comment_reply":
        return `${actor} replied to your comment`;
      case "follow":
        return `${actor} started following you`;
      default:
        return "New notification";
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.type === "follow") {
      navigate(`/profile/${notification.actor.username}`);
    } else if (notification.post_id) {
      navigate(`/post/${notification.post_id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-20">
        <p className="text-muted-foreground">Loading notifications...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 z-40 bg-background border-b p-4">
          <h1 className="text-xl font-semibold">Notifications</h1>
        </div>

        <div className="p-4 space-y-2">
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No notifications yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                We'll notify you when someone interacts with your posts
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <Card
                key={notification.id}
                className={cn(
                  "p-4 cursor-pointer hover:bg-accent transition-colors",
                  !notification.read && "bg-primary/5"
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex gap-3">
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarImage src={notification.actor.avatar_url || undefined} />
                    <AvatarFallback>
                      {notification.actor.display_name[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-semibold">
                            {notification.actor.username}
                          </span>{" "}
                          {getNotificationText(notification).split(notification.actor.username)[1]}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      {getNotificationIcon(notification.type)}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
      
      {showUpload && <UploadButton onClose={() => setShowUpload(false)} />}
      <BottomNav onUploadClick={() => setShowUpload(true)} userProfile={userProfile} />
    </div>
  );
};

export default Notifications;
