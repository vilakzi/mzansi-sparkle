import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VerticalFeed } from "@/components/VerticalFeed";
import { UploadButton } from "@/components/UploadButton";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { AlertCircle, Loader } from "lucide-react";

type Profile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const Index = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const navigate = useNavigate();
  const profileFetchRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/auth");
          return;
        }
        setUser(session.user);
        await fetchProfile(session.user.id);
      } catch (error) {
        console.error("Auth initialization error:", error);
        navigate("/auth");
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session) {
          navigate("/auth");
        } else {
          setUser(session.user);
          // Clear any pending profile fetch
          if (profileFetchRef.current) {
            clearTimeout(profileFetchRef.current);
          }
          setIsLoadingProfile(true);
          await fetchProfile(session.user.id);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
      if (profileFetchRef.current) {
        clearTimeout(profileFetchRef.current);
      }
    };
  }, [navigate]);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      setProfileError(null);
      const { data, error } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfileError("Failed to load profile");
      toast.error("Failed to load profile");
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Logged out successfully");
      navigate("/auth");
    } catch (error) {
      toast.error("Failed to logout");
      console.error("Logout error:", error);
    }
  }, [navigate]);

  const handleUploadClick = useCallback(() => {
    setShowUpload(true);
  }, []);

  const handleUploadClose = useCallback(() => {
    setShowUpload(false);
  }, []);

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-background">
      <div className="flex justify-center">
        <div className="relative w-full max-w-md">
          {profileError && (
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-md">
              <AlertCircle className="h-4 w-4" />
              <span>{profileError}</span>
            </div>
          )}

          <VerticalFeed />
          
          {showUpload && (
            <UploadButton onClose={handleUploadClose} />
          )}
          
          <BottomNav 
            onUploadClick={handleUploadClick} 
            userProfile={profile}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
