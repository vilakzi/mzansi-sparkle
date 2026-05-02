import { useNavigate, useLocation } from "react-router-dom";
import { Home, Search, PlusCircle, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useCallback } from "react";
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

  const isActive = (path: string) => location.pathname === path;

  const fetchUnread = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      setUnreadCount(count ?? 0);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchUnread();

    // Subscribe to new notifications in realtime
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      channel = supabase
        .channel(`notifications-badge-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => setUnreadCount((n) => n + 1)
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          // Batch mark-as-read: re-fetch count rather than guessing
          () => fetchUnread()
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchUnread]);

  // Clear badge when user is on the Notifications page
  useEffect(() => {
    if (location.pathname === "/notifications") {
      setUnreadCount(0);
    }
  }, [location.pathname]);

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
      path: userProfile ? `/profile/${userProfile.username}` : "",
      icon: User,
      label: "Profile",
      disabled: !userProfile,
      onClick: () => {
        if (userProfile) navigate(`/profile/${userProfile.username}`);
      },
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border">
      <div
        className="flex justify-around items-center h-16 max-w-lg mx-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {navItems.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            size="icon"
            onClick={item.onClick}
            disabled={item.disabled}
            className={cn(
              "relative h-12 w-12 rounded-full transition-colors",
              item.isSpecial && "bg-primary text-primary-foreground hover:bg-primary/90",
              !item.isSpecial && item.path && isActive(item.path) && "text-primary",
              !item.isSpecial && (!item.path || !isActive(item.path)) && "text-muted-foreground",
              item.disabled && "opacity-40"
            )}
          >
            <item.icon className="h-6 w-6" />
            {"badge" in item && item.badge > 0 && (
              <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
            <span className="sr-only">{item.label}</span>
          </Button>
        ))}
      </div>
    </nav>
  );
};
