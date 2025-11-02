import { useState, useEffect } from "react";
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

interface UploadSession {
  sessionId: string;
  uploadUrls: string[];
  storagePath: string;
}

export const ChunkedUpload = ({ onClose }: ChunkedUploadProps) => {
  const [open, setOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSession, setUploadSession] = useState<UploadSession | null>(null);
  const [uploadedChunks, setUploadedChunks] = useState<number[]>([]);

  // Check for incomplete uploads on mount
  useEffect(() => {
    checkIncompleteUploads();
  }, []);

  const checkIncompleteUploads = async () => {
    try {
      const { data: sessions } = await supabase
        .from('upload_sessions')
        .select('*')
        .in('status', ['pending', 'uploading'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        const session = sessions[0];
        const shouldResume = confirm(
          `Found incomplete upload: ${session.file_name} (${Math.round(session.uploaded_chunks.length / session.total_chunks * 100)}% complete). Resume?`
        );

        if (shouldResume) {
          // Store session data for resume
          setUploadedChunks(session.uploaded_chunks);
          toast.info('Please select the same file to resume upload');
        }
      }
    } catch (error) {
      console.error('Error checking incomplete uploads:', error);
    }
  };

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
    uploadUrl: string,
    sessionId: string
  ): Promise<void> => {
    // Upload directly to pre-signed URL
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: chunk,
      headers: {
        'Content-Type': file?.type || 'application/octet-stream'
      }
    });

    if (!response.ok) {
      throw new Error(`Chunk ${chunkIndex} upload failed`);
    }

    // Update session in database
    await supabase
      .from('upload_sessions')
      .update({
        uploaded_chunks: [...uploadedChunks, chunkIndex],
        status: 'uploading'
      })
      .eq('id', sessionId);

    setUploadedChunks(prev => [...prev, chunkIndex]);
  };

  const mergeChunks = async (sessionId: string, storagePath: string, totalChunks: number, fileName: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('merge-upload-chunks', {
      body: { 
        sessionId,
        storagePath,
        totalChunks,
        fileName,
        mimeType: file?.type
      }
    });

    if (error) throw error;
    return data.url;
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
      const fileName = `${Date.now()}.${fileExt}`;

      // Small files: direct upload
      if (file.size < CHUNK_SIZE * 2) {
        const filePath = `${user.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("posts-media")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("posts-media")
          .getPublicUrl(filePath);

        await savePost(user.id, publicUrl, mediaType);
        toast.success("Posted successfully!");
        handleClose();
        return;
      }

      // Large files: chunked upload with pre-signed URLs
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Get pre-signed URLs from edge function
      const { data: sessionData, error: sessionError } = await supabase.functions.invoke(
        'generate-upload-url',
        {
          body: {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            totalChunks
          }
        }
      );

      if (sessionError || !sessionData) {
        console.error('Session error:', sessionError);
        toast.error("Failed to initialize upload");
        return;
      }

      setUploadSession({
        sessionId: sessionData.sessionId,
        uploadUrls: sessionData.uploadUrls,
        storagePath: sessionData.storagePath
      });

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        if (paused) {
          toast.info("Upload paused. Click Resume to continue.");
          return;
        }

        // Skip already uploaded chunks (for resume)
        if (uploadedChunks.includes(i)) {
          setUploadProgress(Math.round(((i + 1) / totalChunks) * 90));
          continue;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        await uploadChunk(chunk, i, sessionData.uploadUrls[i], sessionData.sessionId);
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 90));
      }

      // Update session status to uploaded
      await supabase
        .from('upload_sessions')
        .update({ status: 'uploaded' })
        .eq('id', sessionData.sessionId);

      // Merge chunks on server
      toast.loading("Finalizing upload...");
      setUploadProgress(95);
      const publicUrl = await mergeChunks(
        sessionData.sessionId, 
        sessionData.storagePath, 
        totalChunks,
        fileName
      );

      await savePost(user.id, publicUrl, mediaType);

      // Mark session as complete
      await supabase
        .from('upload_sessions')
        .update({ status: 'complete' })
        .eq('id', sessionData.sessionId);

      setUploadProgress(100);
      toast.success("Posted successfully!");
      setFile(null);
      setCaption("");
      setPreview(null);
      setUploadedChunks([]);
      setUploadSession(null);
      handleClose();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed. Click Resume to retry.");
      
      // Mark session as failed
      if (uploadSession) {
        await supabase
          .from('upload_sessions')
          .update({ status: 'failed' })
          .eq('id', uploadSession.sessionId);
      }
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
