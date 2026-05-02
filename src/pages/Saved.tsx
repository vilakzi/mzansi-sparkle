import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BottomNav } from "@/components/BottomNav";
import { UploadButton } from "@/components/UploadButton";
import { ResponsiveImage } from "@/components/ResponsiveImage";
import { ArrowLeft, Bookmark, Heart, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 24;

type SavedPost = {
  id: string;
  post_id: string;
  saved_at: string;
  posts: {
    id: string;
    media_url: string;
    media_type: string;
    caption: string | null;
    likes_count: number;
    comments_count: number;
  };
};

const GridSkeleton = () => (
  <div className="grid grid-cols-3 gap-1">
    {Array.from({ length: 12 }).map((_, i) => (
      <Skeleton key={i} className="aspect-square" />
    ))}
  </div>
);

const Saved = () => {
  const navigate = useNavigate();
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username: string } | undefined>();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const [profileResult, savedResult] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", user.id).single(),
        fetchPage(null, user.id),
      ]);

      if (profileResult.data) setUserProfile(profileResult.data);
      if (savedResult) {
        setSavedPosts(savedResult.rows);
        setCursor(savedResult.nextCursor);
        setHasMore(savedResult.hasMore);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load saved posts");
    } finally {
      setLoading(false);
    }
  };

  const fetchPage = async (cursorValue: string | null, userId?: string) => {
    const { data: { user } } = userId
      ? { data: { user: { id: userId } } }
      : await supabase.auth.getUser();
    if (!user) return null;

    let query = supabase
      .from("saved_posts")
      .select(`
        id,
        post_id,
        created_at,
        posts:post_id (
          id,
          media_url,
          media_type,
          caption,
          likes_count,
          comments_count
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (cursorValue) {
      query = query.lt("created_at", cursorValue);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map((r: any) => ({
      ...r,
      saved_at: r.created_at,
    })) as SavedPost[];

    const last = rows[rows.length - 1];
    return {
      rows,
      hasMore: rows.length === PAGE_SIZE,
      nextCursor: last?.saved_at ?? null,
    };
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const result = await fetchPage(cursor);
      if (result) {
        setSavedPosts((prev) => [...prev, ...result.rows]);
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      }
    } catch (err: any) {
      toast.error("Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, cursor]);

  // Infinite scroll via IntersectionObserver on the sentinel
  useEffect(() => {
    if (!sentinelRef.current) return;
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMore]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 z-50 bg-background border-b p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Bookmark className="h-5 w-5" />
            <h1 className="text-xl font-semibold">Saved Posts</h1>
            {savedPosts.length > 0 && (
              <span className="ml-auto text-sm text-muted-foreground">{savedPosts.length}{hasMore ? "+" : ""}</span>
            )}
          </div>
        </div>

        <div className="p-1">
          {loading ? (
            <div className="p-3">
              <GridSkeleton />
            </div>
          ) : savedPosts.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Bookmark className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="font-medium text-muted-foreground">No saved posts yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Tap the bookmark icon on any post to save it here
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-[2px]">
                {savedPosts.map((savedPost) => (
                  <div
                    key={savedPost.id}
                    className="aspect-square overflow-hidden relative group cursor-pointer"
                    onClick={() => navigate(`/post/${savedPost.post_id}`)}
                  >
                    {savedPost.posts.media_type.startsWith("image") ? (
                      <ResponsiveImage
                        src={savedPost.posts.media_url}
                        alt={savedPost.posts.caption || "Saved post"}
                        className="w-full h-full"
                        sizes="(max-width: 640px) 33vw, 200px"
                        quality={75}
                      />
                    ) : (
                      <video
                        src={savedPost.posts.media_url}
                        className="w-full h-full object-cover"
                        preload="none"
                        muted
                      />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <span className="text-white text-xs font-semibold flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" />
                        {savedPost.posts.likes_count.toLocaleString()}
                      </span>
                      <span className="text-white text-xs font-semibold flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {savedPost.posts.comments_count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-4" />

              {loadingMore && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!hasMore && savedPosts.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">
                  All {savedPosts.length} saved posts loaded
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {showUpload && <UploadButton onClose={() => setShowUpload(false)} />}
      <BottomNav onUploadClick={() => setShowUpload(true)} userProfile={userProfile} />
    </div>
  );
};

export default Saved;
