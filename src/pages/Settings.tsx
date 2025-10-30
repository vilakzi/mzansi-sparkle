import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { UploadButton } from "@/components/UploadButton";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, User } from "lucide-react";
import { toast } from "sonner";

type PrivacySettings = {
  is_private: boolean;
  who_can_comment: string;
  show_followers: boolean;
  show_following: boolean;
  age_restricted_content: boolean;
};

const Settings = () => {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [settings, setSettings] = useState<PrivacySettings>({
    is_private: false,
    who_can_comment: "everyone",
    show_followers: true,
    show_following: true,
    age_restricted_content: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserProfile();
    fetchPrivacySettings();
  }, []);

  const fetchUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) setUserProfile(data);
  };

  const fetchPrivacySettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("privacy_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setSettings({
          is_private: data.is_private,
          who_can_comment: data.who_can_comment,
          show_followers: data.show_followers,
          show_following: data.show_following,
          age_restricted_content: data.age_restricted_content,
        });
      }
    } catch (error) {
      console.error("Error fetching privacy settings:", error);
      toast.error("Failed to load privacy settings");
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<PrivacySettings>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);

      const { error } = await supabase
        .from("privacy_settings")
        .upsert({
          user_id: user.id,
          ...updatedSettings,
        });

      if (error) throw error;
      toast.success("Settings updated");
    } catch (error) {
      console.error("Error updating settings:", error);
      toast.error("Failed to update settings");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background pb-20">
      <div className="flex justify-center">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
            <div className="flex items-center gap-4 p-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <h1 className="text-2xl font-bold">Privacy & Settings</h1>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Account Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>
                  Manage your profile and account information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setShowEditProfile(true)}
                >
                  <User className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              </CardContent>
            </Card>

            {/* Privacy Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Privacy Settings</CardTitle>
                <CardDescription>
                  Control who can see your content and interact with you
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="private-account">Private Account</Label>
                    <p className="text-sm text-muted-foreground">
                      Only approved followers can see your posts
                    </p>
                  </div>
                  <Switch
                    id="private-account"
                    checked={settings.is_private}
                    onCheckedChange={(checked) => updateSettings({ is_private: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="who-can-comment">Who Can Comment</Label>
                  <Select
                    value={settings.who_can_comment}
                    onValueChange={(value) => updateSettings({ who_can_comment: value })}
                  >
                    <SelectTrigger id="who-can-comment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="followers">Followers Only</SelectItem>
                      <SelectItem value="none">No One</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="show-followers">Show Followers</Label>
                    <p className="text-sm text-muted-foreground">
                      Display your followers list publicly
                    </p>
                  </div>
                  <Switch
                    id="show-followers"
                    checked={settings.show_followers}
                    onCheckedChange={(checked) => updateSettings({ show_followers: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="show-following">Show Following</Label>
                    <p className="text-sm text-muted-foreground">
                      Display who you follow publicly
                    </p>
                  </div>
                  <Switch
                    id="show-following"
                    checked={settings.show_following}
                    onCheckedChange={(checked) => updateSettings({ show_following: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Content Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Content Settings</CardTitle>
                <CardDescription>
                  Manage content restrictions and visibility
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="age-restricted">Age-Restricted Content</Label>
                    <p className="text-sm text-muted-foreground">
                      Mark your content as suitable for mature audiences only
                    </p>
                  </div>
                  <Switch
                    id="age-restricted"
                    checked={settings.age_restricted_content}
                    onCheckedChange={(checked) => updateSettings({ age_restricted_content: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {showUpload && <UploadButton onClose={() => setShowUpload(false)} />}
          
          {userProfile && (
            <EditProfileDialog
              open={showEditProfile}
              onOpenChange={setShowEditProfile}
              profile={userProfile}
              onProfileUpdate={fetchUserProfile}
            />
          )}

          <BottomNav onUploadClick={() => setShowUpload(true)} userProfile={userProfile} />
        </div>
      </div>
    </div>
  );
};

export default Settings;
