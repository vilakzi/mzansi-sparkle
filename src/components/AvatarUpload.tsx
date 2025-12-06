import { useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, X } from 'lucide-react';
import { validateImageFile } from '@/lib/imageProcessing';
import { toast } from '@/hooks/use-toast';

interface AvatarUploadProps {
  currentAvatarUrl?: string;
  displayName: string;
  onImageSelect: (file: File) => void;
  onRemoveImage: () => void;
  previewUrl?: string;
}

export function AvatarUpload({
  currentAvatarUrl,
  displayName,
  onImageSelect,
  onRemoveImage,
  previewUrl,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (file: File) => {
    const validation = validateImageFile(file);
    if (!validation.isValid) {
      toast({
        title: 'Invalid image',
        description: validation.error,
        variant: 'destructive',
      });
      return;
    }

    onImageSelect(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const avatarSrc = previewUrl || currentAvatarUrl;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`relative group ${isDragging ? 'ring-2 ring-primary' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Avatar className="w-32 h-32">
          <AvatarImage src={avatarSrc} alt={displayName} />
          <AvatarFallback className="text-3xl">
            {displayName?.charAt(0).toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        
        <button
          type="button"
          onClick={handleClick}
          className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 group-hover:opacity-100 rounded-full transition-opacity touch-target"
        >
          <Camera className="w-8 h-8 text-foreground" />
        </button>

        {avatarSrc && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveImage();
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="text-center">
        <Button type="button" variant="outline" size="sm" onClick={handleClick}>
          {avatarSrc ? 'Change Photo' : 'Upload Photo'}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          JPG, PNG, WebP or GIF. Max 5MB.
        </p>
      </div>
    </div>
  );
}
