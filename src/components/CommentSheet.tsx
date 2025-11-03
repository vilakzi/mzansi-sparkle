import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Reply, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

type Comment = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_comment_id: string | null;
  profile: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  replies?: Comment[];
};

type CommentSheetProps = {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
};

export const CommentSheet = (
  { postId, isOpen, onClose }: CommentSheetProps,
) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchComments();
    }
  }, [isOpen, postId]);

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from("comments")
        .select(`
          id,
          content,
          created_at,
          user_id,
          parent_comment_id,
          profiles:user_id (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Organize comments into nested structure
      const commentMap = new Map<string, Comment>();
      const rootComments: Comment[] = [];

      (data || []).forEach((comment: any) => {
        const commentObj: Comment = {
          ...comment,
          profile: comment.profiles,
          replies: [],
        };
        commentMap.set(comment.id, commentObj);
      });

      commentMap.forEach((comment) => {
        if (comment.parent_comment_id) {
          const parent = commentMap.get(comment.parent_comment_id);
          if (parent) {
            parent.replies = parent.replies || [];
            parent.replies.push(comment);
          }
        } else {
          rootComments.push(comment);
        }
      });

      setComments(rootComments);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      console.error("Error fetching comments:", error);
      toast.error("Failed to load comments");
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to comment");
        return;
      }

      const { error } = await supabase.from("comments").insert({
        post_id: postId,
        user_id: user.id,
        content: newComment.trim(),
        parent_comment_id: replyingTo,
      });

      if (error) throw error;

      setNewComment("");
      setReplyingTo(null);
      toast.success("Comment posted");
      fetchComments();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      console.error("Error posting comment:", error);
      toast.error("Failed to post comment");
    } finally {
      setLoading(false);
    }
  };

  const CommentItem = (
    { comment, depth = 0 }: { comment: Comment; depth?: number },
  ) => (
    <div className={`${depth > 0 ? "ml-8 mt-3" : "mt-4"}`}>
      <div className="flex gap-3">
        <Avatar
          className="h-8 w-8 cursor-pointer flex-shrink-0"
          onClick={() => navigate(`/profile/${comment.profile.username}`)}
        >
          <AvatarImage src={comment.profile.avatar_url || undefined} />
          <AvatarFallback>
            {comment.profile.display_name[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="bg-muted rounded-lg p-3">
            <div
              className="font-semibold text-sm cursor-pointer hover:underline"
              onClick={() => navigate(`/profile/${comment.profile.username}`)}
            >
              {comment.profile.username}
            </div>
            <p className="text-sm mt-1 break-words">{comment.content}</p>
          </div>

          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span>
              {formatDistanceToNow(new Date(comment.created_at), {
                addSuffix: true,
              })}
            </span>
            <button
              onClick={() => setReplyingTo(comment.id)}
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          </div>

          {comment.replies && comment.replies.length > 0 && (
            <div>
              {comment.replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle>Comments</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-full mt-4">
          <ScrollArea className="flex-1 pr-4">
            {comments.length === 0
              ? (
                <p className="text-center text-muted-foreground py-8">
                  No comments yet. Be the first to comment!
                </p>
              )
              : (
                <div className="pb-4">
                  {comments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} />
                  ))}
                </div>
              )}
          </ScrollArea>

          <div className="border-t pt-4 mt-4">
            {replyingTo && (
              <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground">
                <span>Replying to comment...</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(null)}
                >
                  Cancel
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Textarea
                placeholder="Write a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="min-h-[60px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
              <Button
                onClick={handleSubmitComment}
                disabled={loading || !newComment.trim()}
                size="icon"
                className="flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
