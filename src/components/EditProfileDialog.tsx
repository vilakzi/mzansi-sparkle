import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AvatarUpload } from './AvatarUpload';
import { useUsernameAvailability } from '@/hooks/useUsernameAvailability';
import { resizeImage } from '@/lib/imageProcessing';
import { toast } from '@/hooks/use-toast';
import { Loader2, Check, X, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  username_updated_at?: string;
  whatsapp_number?: string;
}

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  onProfileUpdate: () => void;
}

export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  onProfileUpdate,
}: EditProfileDialogProps) {
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio || '');
  const [whatsappNumber, setWhatsappNumber] = useState(profile.whatsapp_number || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const { isChecking, isAvailable, error: usernameError } = useUsernameAvailability(
    username,
    profile.id
  );

  // Calculate username cooldown
  const daysSinceLastChange = profile.username_updated_at 
    ? Math.floor((Date.now() - new Date(profile.username_updated_at).getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;

  const canChangeUsername = daysSinceLastChange >= 30;
  const daysUntilChange = Math.max(0, 30 - daysSinceLastChange);
  const usernameChanged = username !== profile.username;

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setDisplayName(profile.display_name);
      setUsername(profile.username);
      setBio(profile.bio || '');
      setWhatsappNumber(profile.whatsapp_number || '');
      setAvatarFile(null);
      setAvatarPreview('');
      setRemoveAvatar(false);
    }
  }, [open, profile]);

  const handleImageSelect = (file: File) => {
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
  };

  const handleRemoveImage = () => {
    setAvatarFile(null);
    setAvatarPreview('');
    setRemoveAvatar(true);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast({
        title: 'Error',
        description: 'Display name is required',
        variant: 'destructive',
      });
      return;
    }

    if (username.trim().length < 3) {
      toast({
        title: 'Error',
        description: 'Username must be at least 3 characters',
        variant: 'destructive',
      });
      return;
    }

    if (username !== profile.username) {
      if (!canChangeUsername) {
        toast({
          title: 'Error',
          description: `You can change your username again in ${daysUntilChange} days`,
          variant: 'destructive',
        });
        return;
      }

      if (!isAvailable) {
        toast({
          title: 'Error',
          description: usernameError || 'Username is not available',
          variant: 'destructive',
        });
        return;
      }
    }

    setLoading(true);

    try {
      let newAvatarUrl = profile.avatar_url;

      // Update profile first for instant feedback
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.trim() || null,
          whatsapp_number: whatsappNumber.trim() || null,
          username_updated_at: username !== profile.username ? new Date().toISOString() : undefined,
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      // Close dialog and update UI immediately
      onOpenChange(false);
      onProfileUpdate();

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });

      // Handle avatar upload in background
      if (avatarFile) {
        // Resize image
        const resizedBlob = await resizeImage(avatarFile, 400, 400, 0.85);
        const timestamp = Date.now();
        const fileExt = avatarFile.name.split('.').pop();
        const filePath = `${profile.id}/${timestamp}.${fileExt}`;

        // Delete old avatar if exists
        if (profile.avatar_url) {
          const oldPath = profile.avatar_url.split('/').slice(-2).join('/');
          await supabase.storage.from('avatars').remove([oldPath]);
        }

        // Upload new avatar
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, resizedBlob, {
            contentType: avatarFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        newAvatarUrl = publicUrl;

        // Update avatar URL
        await supabase
          .from('profiles')
          .update({ avatar_url: newAvatarUrl })
          .eq('id', profile.id);

        onProfileUpdate();
      } else if (removeAvatar && profile.avatar_url) {
        // Remove avatar in background
        const oldPath = profile.avatar_url.split('/').slice(-2).join('/');
        await supabase.storage.from('avatars').remove([oldPath]);
        
        await supabase
          .from('profiles')
          .update({ avatar_url: null })
          .eq('id', profile.id);

        onProfileUpdate();
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const isFormValid =
    displayName.trim().length > 0 &&
    username.trim().length >= 3 &&
    (username === profile.username || (isAvailable && canChangeUsername));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information and avatar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <AvatarUpload
            currentAvatarUrl={profile.avatar_url}
            displayName={displayName}
            onImageSelect={handleImageSelect}
            onRemoveImage={handleRemoveImage}
            previewUrl={avatarPreview}
          />

          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            {usernameChanged && !canChangeUsername && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You can change your username again in {daysUntilChange} {daysUntilChange === 1 ? 'day' : 'days'}
                </AlertDescription>
              </Alert>
            )}
            {usernameChanged && canChangeUsername && daysSinceLastChange < 60 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Last changed {daysSinceLastChange} {daysSinceLastChange === 1 ? 'day' : 'days'} ago
                </AlertDescription>
              </Alert>
            )}
            <div className="relative">
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="username"
                maxLength={20}
                className="pr-10"
                disabled={usernameChanged && !canChangeUsername}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isChecking && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                {!isChecking && username.length >= 3 && username !== profile.username && canChangeUsername && (
                  <>
                    {isAvailable && <Check className="w-4 h-4 text-green-500" />}
                    {!isAvailable && <X className="w-4 h-4 text-destructive" />}
                  </>
                )}
              </div>
            </div>
            {usernameError && username.length >= 3 && canChangeUsername && (
              <p className="text-xs text-destructive">{usernameError}</p>
            )}
            {username.length >= 3 && isAvailable && username !== profile.username && canChangeUsername && (
              <p className="text-xs text-green-600">Username is available</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              maxLength={150}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">
              {bio.length}/150
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp Number</Label>
            <Input
              id="whatsapp"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+1234567890"
              type="tel"
              maxLength={20}
            />
            <p className="text-xs text-muted-foreground">
              Add your WhatsApp number to let people message you directly
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !isFormValid}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
