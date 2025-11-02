import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VerticalFeed } from "@/components/VerticalFeed";
import { ChunkedUpload } from "@/components/ChunkedUpload";
import { BottomNav } from "@/components/BottomNav";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { LoadingScreen } from "@/components/LoadingScreen";

type Profile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const Index = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [initialPosts, setInitialPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadInitialData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          navigate("/auth");
        } else {
          setUser(session.user);
          loadInitialData();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadInitialData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setUser(session.user);

      // Use optimized single-query function for initial load
      const { data, error } = await supabase.rpc('get_initial_feed_data', {
        p_user_id: session.user.id
      });

      if (error) throw error;

      if (data && typeof data === 'object' && data !== null) {
        const feedData = data as { profile: Profile; posts: any[] };
        setProfile(feedData.profile);
        setInitialPosts(feedData.posts || []);
      }
    } catch (error) {
      console.error("Error loading initial data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadClick = () => {
    setShowUpload(true);
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="relative bg-background min-h-screen">
      <PWAInstallPrompt />
      
      <div className="flex justify-center">
        <div className="relative w-full max-w-md">
          <VerticalFeed initialPosts={initialPosts} />
          
          {showUpload && (
            <ChunkedUpload onClose={() => setShowUpload(false)} />
          )}
          
          <BottomNav onUploadClick={handleUploadClick} userProfile={profile} />
        </div>
      </div>
    </div>
  );
};

export default Index;
