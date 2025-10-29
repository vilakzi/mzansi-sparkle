import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle, XCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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

const Admin = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const hasAdminRole = roles?.some(r => r.role === "admin" || r.role === "moderator");
      setIsAdmin(hasAdminRole || false);

      if (hasAdminRole) {
        fetchReports();
      } else {
        toast.error("You don't have permission to access this page");
        navigate("/");
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
      navigate("/");
    }
  };

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from("reports")
        .select(`
          *,
          reporter:reporter_id(username, display_name),
          reported_user:reported_user_id(username, display_name),
          post:post_id(caption, media_url),
          comment:comment_id(content)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReports(data as unknown as Report[]);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const updateReportStatus = async (reportId: string, newStatus: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("reports")
        .update({
          status: newStatus,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (error) throw error;

      toast.success(`Report ${newStatus}`);
      fetchReports();
    } catch (error) {
      console.error("Error updating report:", error);
      toast.error("Failed to update report");
    }
  };

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const pendingReports = reports.filter(r => r.status === "pending");
  const reviewedReports = reports.filter(r => r.status !== "pending");

  return (
    <div className="relative min-h-screen bg-background pb-20">
      <div className="flex justify-center">
        <div className="w-full max-w-4xl">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
            <div className="flex items-center gap-4 p-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <h1 className="text-2xl font-bold">Content Moderation</h1>
            </div>
          </div>

          <div className="p-4">
            <Tabs defaultValue="pending">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">
                  Pending ({pendingReports.length})
                </TabsTrigger>
                <TabsTrigger value="reviewed">
                  Reviewed ({reviewedReports.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="space-y-4 mt-4">
                {pendingReports.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      No pending reports
                    </CardContent>
                  </Card>
                ) : (
                  pendingReports.map((report) => (
                    <Card key={report.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-lg">
                              {report.reason.replace(/_/g, " ").toUpperCase()}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              Reported by @{report.reporter?.username || "Unknown"} •{" "}
                              {format(new Date(report.created_at), "MMM d, yyyy")}
                            </p>
                          </div>
                          <Badge>{report.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {report.description && (
                          <p className="text-sm">{report.description}</p>
                        )}

                        {report.reported_user && (
                          <div className="text-sm">
                            <span className="font-semibold">Reported User: </span>
                            @{report.reported_user.username}
                          </div>
                        )}

                        {report.post && (
                          <div className="border rounded-lg p-3 space-y-2">
                            <p className="text-sm font-semibold">Reported Post:</p>
                            {report.post.media_url && (
                              <img
                                src={report.post.media_url}
                                alt="Reported content"
                                className="w-full max-h-48 object-cover rounded"
                              />
                            )}
                            {report.post.caption && (
                              <p className="text-sm">{report.post.caption}</p>
                            )}
                          </div>
                        )}

                        {report.comment && (
                          <div className="border rounded-lg p-3">
                            <p className="text-sm font-semibold mb-1">Reported Comment:</p>
                            <p className="text-sm">{report.comment.content}</p>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (report.post_id) navigate(`/post/${report.post_id}`);
                            }}
                            disabled={!report.post_id}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Content
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateReportStatus(report.id, "dismissed")}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Dismiss
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => updateReportStatus(report.id, "resolved")}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Resolve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="reviewed" className="space-y-4 mt-4">
                {reviewedReports.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      No reviewed reports
                    </CardContent>
                  </Card>
                ) : (
                  reviewedReports.map((report) => (
                    <Card key={report.id} className="opacity-75">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-lg">
                              {report.reason.replace(/_/g, " ").toUpperCase()}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              Reported by @{report.reporter?.username || "Unknown"} •{" "}
                              {format(new Date(report.created_at), "MMM d, yyyy")}
                            </p>
                          </div>
                          <Badge variant={report.status === "resolved" ? "default" : "secondary"}>
                            {report.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {report.description && (
                          <p className="text-sm text-muted-foreground">{report.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))
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
