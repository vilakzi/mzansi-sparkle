import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VerticalFeed } from "@/components/VerticalFeed";
import { ChunkedUpload } from "@/components/ChunkedUpload";
import { BottomNav } from "@/components/BottomNav";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { LoadingScreen } from "@/components/LoadingScreen";
import { isPersonalizedFeedEnabled } from "@/lib/featureFlags";

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

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Check feature flag for feed algorithm
      const usePersonalizedFeed = isPersonalizedFeedEnabled();
      
      // Log feed mode for debugging
      if (usePersonalizedFeed) {
        console.warn('⚠️ Personalized feed is enabled. This may result in slower feed loads (>30s). Consider disabling VITE_PERSONALIZED_FEED for better performance.');
      } else {
        console.info('✓ Using simple feed mode for fast performance.');
      }

      // Use simple feed function (personalized feed functions don't exist yet)
      // TODO: When personalized feed is optimized, add conditional logic here
      const { data: feedData, error } = await supabase.rpc('get_simple_feed', {
        p_user_id: session.user.id,
        p_limit: 10,
        p_offset: 0
      });

      if (error) throw error;

      // Map data to expected format with profile embedded
      const posts = (feedData || []).map((post: any) => ({
        ...post,
        user_liked: post.is_liked,
        user_saved: post.is_saved,
        profile: {
          id: post.user_id,
          username: post.username,
          display_name: post.display_name,
          avatar_url: post.avatar_url,
          bio: post.bio,
          followers_count: post.followers_count,
          following_count: post.following_count,
        }
      }));

      setInitialPosts(posts);
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
