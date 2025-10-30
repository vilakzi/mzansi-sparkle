import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VerticalFeed } from "@/components/VerticalFeed";
import { UploadButton } from "@/components/UploadButton";
import { BottomNav } from "@/components/BottomNav";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { toast } from "sonner";

type Profile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const Index = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
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

  const handleUploadClick = () => {
    setShowUpload(true);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="relative bg-background min-h-screen">
      <PWAInstallPrompt />
      
      <div className="flex justify-center">
        <div className="relative w-full max-w-md">
          <VerticalFeed />
          
          {showUpload && (
            <UploadButton onClose={() => setShowUpload(false)} />
          )}
          
          <BottomNav onUploadClick={handleUploadClick} userProfile={profile} />
        </div>
      </div>
    </div>
  );
};

export default Index;
