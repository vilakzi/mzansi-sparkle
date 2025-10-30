import { useNavigate, useLocation } from "react-router-dom";
import { Home, Search, PlusCircle, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type BottomNavProps = {
  onUploadClick: () => void;
  userProfile?: {
    username: string;
  };
};

export const BottomNav = ({ onUploadClick, userProfile }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchUnreadCount();
    
    // Subscribe to notification changes
    const channel = supabase
      .channel("notifications-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      setUnreadCount(count || 0);
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    {
      path: "/",
      icon: Home,
      label: "Home",
      onClick: () => navigate("/"),
    },
    {
      path: "/search",
      icon: Search,
      label: "Search",
      onClick: () => navigate("/search"),
    },
    {
      path: "upload",
      icon: PlusCircle,
      label: "Upload",
      onClick: onUploadClick,
      isSpecial: true,
    },
    {
      path: "/notifications",
      icon: Bell,
      label: "Notifications",
      onClick: () => navigate("/notifications"),
      badge: unreadCount,
    },
    {
      path: userProfile ? `/profile/${userProfile.username}` : "/profile",
      icon: User,
      label: "Profile",
      onClick: () => {
        if (userProfile) {
          navigate(`/profile/${userProfile.username}`);
        }
      },
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t safe-bottom">
      <div className="flex justify-around items-center h-16 max-w-2xl mx-auto pb-safe"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {navItems.map((item) => (
          <Button
            key={item.path}
            variant="ghost"
            size="icon"
            onClick={item.onClick}
            className={cn(
              "relative h-12 w-12 rounded-full transition-colors",
              item.isSpecial && "bg-primary text-primary-foreground hover:bg-primary/90",
              !item.isSpecial && isActive(item.path) && "text-primary",
              !item.isSpecial && !isActive(item.path) && "text-muted-foreground"
            )}
          >
            <item.icon className="h-6 w-6" />
            {item.badge !== undefined && item.badge > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
              >
                {item.badge > 99 ? "99+" : item.badge}
              </Badge>
            )}
            <span className="sr-only">{item.label}</span>
          </Button>
        ))}
      </div>
    </nav>
  );
};
