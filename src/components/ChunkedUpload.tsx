import { useState } from "react";
import { Upload, X, Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { Progress } from "./ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ChunkedUploadProps = {
  onClose?: () => void;
};

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

export const ChunkedUpload = ({ onClose }: ChunkedUploadProps) => {
  const [open, setOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedChunks, setUploadedChunks] = useState<number[]>([]);
  const [uploadId, setUploadId] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const previewUrl = URL.createObjectURL(selectedFile);
      setPreview(previewUrl);
      setUploadedChunks([]);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    if (uploading && !paused) {
      toast.error("Please pause the upload before closing");
      return;
    }
    setOpen(false);
    if (onClose) {
      onClose();
    }
  };

  const uploadChunk = async (
    chunk: Blob,
    chunkIndex: number,
    totalChunks: number,
    fileName: string
  ): Promise<void> => {
    const chunkFileName = `${fileName}.part${chunkIndex}`;
    
    const { error } = await supabase.storage
      .from("posts-media")
      .upload(chunkFileName, chunk, {
        cacheControl: "3600",
        upsert: false
      });

    if (error) throw error;

    setUploadedChunks(prev => [...prev, chunkIndex]);
    setUploadProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
  };

  const mergeChunks = async (fileName: string, totalChunks: number): Promise<string> => {
    // Call edge function to merge chunks on server
    const { data, error } = await supabase.functions.invoke('merge-upload-chunks', {
      body: { fileName, totalChunks }
    });

    if (error) throw error;
    return data.publicUrl;
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);
    setPaused(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Please login to upload");
        return;
      }

      const mediaType = file.type.startsWith("video") ? "video" : "image";
      const fileExt = file.name.split(".").pop();
      const baseFileName = `${user.id}/${Date.now()}`;
      const fileName = `${baseFileName}.${fileExt}`;

      // Small files: direct upload
      if (file.size < CHUNK_SIZE * 2) {
        const { error: uploadError } = await supabase.storage
          .from("posts-media")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("posts-media")
          .getPublicUrl(fileName);

        await savePost(user.id, publicUrl, mediaType);
        toast.success("Posted successfully!");
        handleClose();
        return;
      }

      // Large files: chunked upload
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const uploadSessionId = `${user.id}-${Date.now()}`;
      setUploadId(uploadSessionId);

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        if (paused) {
          toast.info("Upload paused. Click Resume to continue.");
          return;
        }

        // Skip already uploaded chunks (for resume)
        if (uploadedChunks.includes(i)) continue;

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        await uploadChunk(chunk, i, totalChunks, baseFileName);
      }

      // Merge chunks on server
      toast.loading("Finalizing upload...");
      const publicUrl = await mergeChunks(baseFileName, totalChunks);

      await savePost(user.id, publicUrl, mediaType);

      toast.success("Posted successfully!");
      setFile(null);
      setCaption("");
      setPreview(null);
      setUploadedChunks([]);
      handleClose();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed. Click Resume to retry.");
    } finally {
      setUploading(false);
    }
  };

  const savePost = async (userId: string, mediaUrl: string, mediaType: string) => {
    const { error: insertError } = await supabase
      .from("posts")
      .insert({
        user_id: userId,
        media_url: mediaUrl,
        media_type: mediaType,
        caption: caption || null,
      });

    if (insertError) throw insertError;
  };

  const handlePauseResume = () => {
    if (uploading) {
      setPaused(!paused);
      toast.info(paused ? "Resuming upload..." : "Upload paused");
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
                  setUploadedChunks([]);
                }}
                disabled={uploading}
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

          {file && file.size > CHUNK_SIZE * 2 && (
            <div className="text-sm text-muted-foreground">
              Large file detected. Chunked upload will be used.
            </div>
          )}
          
          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-sm text-center text-muted-foreground">
                {uploadProgress}% uploaded
              </p>
            </div>
          )}
          
          <Textarea
            placeholder="Add a caption..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            disabled={uploading}
          />
          
          <div className="flex gap-2">
            {uploading && file && file.size > CHUNK_SIZE * 2 && (
              <Button
                variant="outline"
                onClick={handlePauseResume}
                className="flex-1"
              >
                {paused ? (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </>
                )}
              </Button>
            )}
            
            <Button
              onClick={handleUpload}
              disabled={!file || (uploading && !paused)}
              className="flex-1"
            >
              {uploading && !paused ? "Uploading..." : paused ? "Paused" : "Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
