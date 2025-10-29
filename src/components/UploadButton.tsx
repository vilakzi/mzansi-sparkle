import { useState, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type UploadButtonProps = {
  onClose?: () => void;
};

export const UploadButton = ({ onClose }: UploadButtonProps) => {
  const [open, setOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const previewUrl = URL.createObjectURL(selectedFile);
      setPreview(previewUrl);
    }
  };

  const handleClose = () => {
    setOpen(false);
    if (onClose) {
      onClose();
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Please login to upload");
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const mediaType = file.type.startsWith("video") ? "video" : "image";

      const { error: uploadError } = await supabase.storage
        .from("posts-media")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("posts-media")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from("posts")
        .insert({
          user_id: user.id,
          media_url: publicUrl,
          media_type: mediaType,
          caption: caption || null,
        });

      if (insertError) throw insertError;

      toast.success("Posted successfully!");
      setFile(null);
      setCaption("");
      setPreview(null);
      handleClose();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Upload error:", error);
      }
      toast.error("Failed to upload post. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {preview ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
              {file?.type.startsWith("video") ? (
                <video src={preview} controls className="h-full w-full object-cover" />
              ) : (
                <img src={preview} alt="Preview" className="h-full w-full object-cover" />
              )}
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 hover:bg-muted">
              <Upload className="mb-2 h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click to upload image or video
              </span>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          )}
          
          <Textarea
            placeholder="Add a caption..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
          />
          
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
          >
            {uploading ? "Uploading..." : "Post"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
