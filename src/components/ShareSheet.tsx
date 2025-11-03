import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Twitter, Facebook, MessageCircle, Check } from "lucide-react";
import { useState } from "react";

type ShareSheetProps = {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
};

export const ShareSheet = ({ postId, isOpen, onClose }: ShareSheetProps) => {
  const [copied, setCopied] = useState(false);

  const trackShare = async (shareType: string, platform?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("post_shares").insert({
        post_id: postId,
        user_id: user?.id || null,
        share_type: shareType,
        platform: platform,
      });
    } catch (error) {
      console.error("Error tracking share:", error);
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      trackShare("copy_link");
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      toast.error("Failed to copy link");
    }
  };

  const handleExternalShare = (platform: string) => {
    const url = `${window.location.origin}/post/${postId}`;
    const text = "Check out this post!";
    let shareUrl = "";

    switch (platform) {
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        break;
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case "whatsapp":
        shareUrl = `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`;
        break;
    }

    if (shareUrl) {
      window.open(shareUrl, "_blank", "width=600,height=400");
      trackShare("external_platform", platform);
      toast.success(`Shared to ${platform}`);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-auto">
        <SheetHeader>
          <SheetTitle>Share Post</SheetTitle>
        </SheetHeader>

        <div className="grid gap-3 mt-6 pb-6">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={handleCopyLink}
          >
            {copied ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <Copy className="h-5 w-5" />
            )}
            <div className="text-left">
              <div className="font-semibold">Copy Link</div>
              <div className="text-xs text-muted-foreground">
                {copied ? "Link copied!" : "Share anywhere"}
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleExternalShare("twitter")}
          >
            <Twitter className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Twitter</div>
              <div className="text-xs text-muted-foreground">Share on Twitter</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleExternalShare("facebook")}
          >
            <Facebook className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Facebook</div>
              <div className="text-xs text-muted-foreground">Share on Facebook</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleExternalShare("whatsapp")}
          >
            <MessageCircle className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">WhatsApp</div>
              <div className="text-xs text-muted-foreground">Share on WhatsApp</div>
            </div>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
