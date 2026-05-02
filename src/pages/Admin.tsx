import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle, XCircle, Eye, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const PAGE_SIZE = 20;

type Report = {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  reported_user_id: string | null;
  reporter: { username: string; display_name: string } | null;
  reported_user: { username: string; display_name: string } | null;
  post: { caption: string; media_url: string } | null;
  comment: { content: string } | null;
};

const ReportSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <Card key={i}>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full rounded" />
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const ReportCard = ({
  report,
  showActions,
  onAction,
}: {
  report: Report;
  showActions: boolean;
  onAction: (id: string, status: string) => void;
}) => {
  const navigate = useNavigate();
  return (
    <Card className={!showActions ? "opacity-75" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base">
              {report.reason.replace(/_/g, " ").toUpperCase()}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Reported by @{report.reporter?.username || "Unknown"} ·{" "}
              {format(new Date(report.created_at), "MMM d, yyyy")}
            </p>
          </div>
          <Badge variant={report.status === "resolved" ? "default" : report.status === "pending" ? "outline" : "secondary"}>
            {report.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {report.description && (
          <p className="text-sm text-muted-foreground">{report.description}</p>
        )}
        {report.reported_user && (
          <p className="text-sm">
            <span className="font-semibold">User: </span>
            @{report.reported_user.username}
          </p>
        )}
        {report.post && (
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reported post</p>
            {report.post.media_url && (
              <img
                src={report.post.media_url}
                alt="Reported content"
                className="w-full max-h-40 object-cover rounded"
                loading="lazy"
              />
            )}
            {report.post.caption && (
              <p className="text-sm line-clamp-2">{report.post.caption}</p>
            )}
          </div>
        )}
        {report.comment && (
          <div className="border rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reported comment</p>
            <p className="text-sm">{report.comment.content}</p>
          </div>
        )}

        {showActions && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { if (report.post_id) navigate(`/post/${report.post_id}`); }}
              disabled={!report.post_id}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction(report.id, "dismissed")}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={() => onAction(report.id, "resolved")}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Resolve
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Admin = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Separate state for each tab to allow independent pagination
  const [pending, setPending] = useState<Report[]>([]);
  const [pendingCursor, setPendingCursor] = useState<string | null>(null);
  const [pendingHasMore, setPendingHasMore] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [reviewed, setReviewed] = useState<Report[]>([]);
  const [reviewedCursor, setReviewedCursor] = useState<string | null>(null);
  const [reviewedHasMore, setReviewedHasMore] = useState(true);
  const [reviewedLoading, setReviewedLoading] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const hasRole = roles?.some((r) => r.role === "admin" || r.role === "moderator");
      if (!hasRole) {
        toast.error("You don't have permission to access this page");
        navigate("/");
        return;
      }

      setIsAdmin(true);
      // Load first page of both tabs in parallel
      fetchReports("pending", null, true);
      fetchReports("reviewed", null, true);
    } catch {
      navigate("/");
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchReports = useCallback(
    async (statusFilter: "pending" | "reviewed", cursor: string | null, isInitial = false) => {
      const setLoading = statusFilter === "pending" ? setPendingLoading : setReviewedLoading;
      const setData = statusFilter === "pending" ? setPending : setReviewed;
      const setCursor = statusFilter === "pending" ? setPendingCursor : setReviewedCursor;
      const setHasMore = statusFilter === "pending" ? setPendingHasMore : setReviewedHasMore;

      setLoading(true);
      try {
        let query = supabase
          .from("reports")
          .select(`
            *,
            reporter:reporter_id(username, display_name),
            reported_user:reported_user_id(username, display_name),
            post:post_id(caption, media_url),
            comment:comment_id(content)
          `)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);

        if (statusFilter === "pending") {
          query = query.eq("status", "pending");
        } else {
          query = query.neq("status", "pending");
        }

        if (cursor) {
          query = query.lt("created_at", cursor);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = (data || []) as unknown as Report[];
        const last = rows[rows.length - 1];

        setHasMore(rows.length === PAGE_SIZE);
        setCursor(last?.created_at ?? null);
        setData((prev) => (isInitial ? rows : [...prev, ...rows]));
      } catch {
        toast.error("Failed to load reports");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleAction = async (reportId: string, newStatus: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("reports")
        .update({ status: newStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", reportId);

      if (error) throw error;

      toast.success(`Report ${newStatus}`);
      // Move from pending to reviewed in local state
      setPending((prev) => {
        const found = prev.find((r) => r.id === reportId);
        if (found) setReviewed((rv) => [{ ...found, status: newStatus }, ...rv]);
        return prev.filter((r) => r.id !== reportId);
      });
    } catch {
      toast.error("Failed to update report");
    }
  };

  if (checkingAuth || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background pb-20">
      <div className="flex justify-center">
        <div className="w-full max-w-4xl">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
            <div className="flex items-center gap-4 p-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <h1 className="text-2xl font-bold">Content Moderation</h1>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                onClick={() => {
                  fetchReports("pending", null, true);
                  fetchReports("reviewed", null, true);
                }}
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-4">
            <Tabs defaultValue="pending">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">
                  Pending {pending.length > 0 && `(${pending.length}${pendingHasMore ? "+" : ""})`}
                </TabsTrigger>
                <TabsTrigger value="reviewed">
                  Reviewed {reviewed.length > 0 && `(${reviewed.length}${reviewedHasMore ? "+" : ""})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="space-y-4 mt-4">
                {pendingLoading && pending.length === 0 ? (
                  <ReportSkeleton />
                ) : pending.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      No pending reports — all clear!
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {pending.map((r) => (
                      <ReportCard key={r.id} report={r} showActions onAction={handleAction} />
                    ))}
                    {pendingHasMore && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => fetchReports("pending", pendingCursor)}
                        disabled={pendingLoading}
                      >
                        {pendingLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {pendingLoading ? "Loading..." : "Load more"}
                      </Button>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="reviewed" className="space-y-4 mt-4">
                {reviewedLoading && reviewed.length === 0 ? (
                  <ReportSkeleton />
                ) : reviewed.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      No reviewed reports yet
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {reviewed.map((r) => (
                      <ReportCard key={r.id} report={r} showActions={false} onAction={handleAction} />
                    ))}
                    {reviewedHasMore && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => fetchReports("reviewed", reviewedCursor)}
                        disabled={reviewedLoading}
                      >
                        {reviewedLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {reviewedLoading ? "Loading..." : "Load more"}
                      </Button>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
