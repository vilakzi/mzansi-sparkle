import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VerticalFeed } from "@/components/VerticalFeed";
import { UploadButton } from "@/components/UploadButton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User as UserIcon, Search, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type Profile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const Index = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          navigate("/auth");
        } else {
          setUser(session.user);
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="relative bg-background">
      <div className="flex justify-center">
        <div className="relative w-full max-w-md">
          <div className="fixed top-4 left-4 right-4 z-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigate("/search")}
              >
                <Search className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigate("/trending")}
              >
                <TrendingUp className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              {profile && (
                <Avatar 
                  className="h-8 w-8 cursor-pointer" 
                  onClick={() => navigate(`/profile/${profile.username}`)}
                >
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback>
                    <UserIcon className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
          
          <VerticalFeed />
          <UploadButton />
        </div>
      </div>
    </div>
  );
};

export default Index;
