import { useState, useEffect, useRef, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Reply, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

const PAGE_SIZE = 20;

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

const CommentSkeleton = () => (
  <div className="mt-4 space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex gap-3">
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    ))}
  </div>
);

export const CommentSheet = ({ postId, isOpen, onClose }: CommentSheetProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setComments([]);
      setPage(0);
      setHasMore(true);
      fetchComments(0, true);
    }
  }, [isOpen, postId]);

  const fetchComments = useCallback(async (pageNum: number, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

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
        .is("parent_comment_id", null)         // only root comments in paginated query
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const rootComments: Comment[] = (data || []).map((c: any) => ({
        ...c,
        profile: c.profiles,
        replies: [],
      }));

      // Fetch replies for this page of root comments in a single query
      if (rootComments.length > 0) {
        const rootIds = rootComments.map((c) => c.id);
        const { data: repliesData } = await supabase
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
          .in("parent_comment_id", rootIds)
          .order("created_at", { ascending: true });

        if (repliesData) {
          const replyMap = new Map<string, Comment[]>();
          repliesData.forEach((r: any) => {
            const reply: Comment = { ...r, profile: r.profiles, replies: [] };
            const bucket = replyMap.get(r.parent_comment_id) || [];
            bucket.push(reply);
            replyMap.set(r.parent_comment_id, bucket);
          });
          rootComments.forEach((c) => {
            c.replies = replyMap.get(c.id) || [];
          });
        }
      }

      setHasMore(rootComments.length === PAGE_SIZE);
      setComments((prev) => (isInitial ? rootComments : [...prev, ...rootComments]));
      setPage(pageNum);
    } catch (error: any) {
      console.error("Error fetching comments:", error);
      toast.error("Failed to load comments");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [postId]);

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to comment");
        return;
      }

      // Optimistic insert — show immediately, then sync
      const optimisticComment: Comment = {
        id: `temp-${Date.now()}`,
        content: newComment.trim(),
        created_at: new Date().toISOString(),
        user_id: user.id,
        parent_comment_id: replyingTo?.id ?? null,
        profile: { username: "you", display_name: "You", avatar_url: null },
        replies: [],
      };

      if (!replyingTo) {
        setComments((prev) => [optimisticComment, ...prev]);
      } else {
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyingTo.id
              ? { ...c, replies: [...(c.replies || []), optimisticComment] }
              : c
          )
        );
      }

      const { error } = await supabase.from("comments").insert({
        post_id: postId,
        user_id: user.id,
        content: newComment.trim(),
        parent_comment_id: replyingTo?.id ?? null,
      });

      if (error) throw error;

      setNewComment("");
      setReplyingTo(null);
      // Refresh first page to get real IDs
      fetchComments(0, true);
    } catch (error: any) {
      console.error("Error posting comment:", error);
      toast.error("Failed to post comment");
      // Remove the optimistic comment on failure
      setComments((prev) => prev.filter((c) => !c.id.startsWith("temp-")));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = (commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username });
    textareaRef.current?.focus();
  };

  const CommentItem = ({ comment, depth = 0 }: { comment: Comment; depth?: number }) => (
    <div className={`${depth > 0 ? "ml-8 mt-3" : "mt-4"}`}>
      <div className="flex gap-3">
        <Avatar
          className="h-8 w-8 cursor-pointer flex-shrink-0"
          onClick={() => navigate(`/profile/${comment.profile.username}`)}
        >
          <AvatarImage src={comment.profile.avatar_url || undefined} />
          <AvatarFallback>{comment.profile.display_name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
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
            <span>{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
            {depth === 0 && (
              <button
                onClick={() => handleReply(comment.id, comment.profile.username)}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <Reply className="h-3 w-3" />
                Reply
              </button>
            )}
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
      <SheetContent side="bottom" className="h-[80vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>Comments</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-4 mt-4">
          {loading ? (
            <CommentSkeleton />
          ) : comments.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-base font-medium mb-1">No comments yet</p>
              <p className="text-sm">Be the first to comment!</p>
            </div>
          ) : (
            <div className="pb-4">
              {comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}

              {hasMore && (
                <Button
                  variant="ghost"
                  className="w-full mt-4 text-muted-foreground"
                  onClick={() => fetchComments(page + 1)}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {loadingMore ? "Loading..." : "Load more comments"}
                </Button>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="border-t pt-4 mt-2">
          {replyingTo && (
            <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <span>Replying to <strong>@{replyingTo.username}</strong></span>
              <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)}>
                Cancel
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
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
              disabled={submitting || !newComment.trim()}
              size="icon"
              className="flex-shrink-0 self-end"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
