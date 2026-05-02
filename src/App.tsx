import React, { Suspense, lazy, useEffect } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { VideoQualityProvider } from "@/contexts/VideoQualityContext";
import { FeedLoadingSkeleton } from "@/components/LoadingSkeleton";
import { logPWAStatus, clearOldCaches } from "./lib/pwaUtils";

// Eagerly load the index page — it's the first thing users see
import Index from "./pages/Index";

// All other routes lazy-loaded — each becomes its own JS chunk
const Auth = lazy(() => import("./pages/Auth"));
const Profile = lazy(() => import("./pages/Profile"));
const Search = lazy(() => import("./pages/Search"));
const Trending = lazy(() => import("./pages/Trending"));
const Hashtag = lazy(() => import("./pages/Hashtag"));
const Saved = lazy(() => import("./pages/Saved"));
const Notifications = lazy(() => import("./pages/Notifications"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Messages = lazy(() => import("./pages/Messages"));
const Conversation = lazy(() => import("./pages/Conversation"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,        // 2 min — data stays fresh, no immediate refetch
      gcTime: 1000 * 60 * 10,          // 10 min — keep unused data in memory
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: false,      // don't blast the DB every tab switch
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-pulse flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-muted" />
      <div className="w-32 h-2 rounded bg-muted" />
    </div>
  </div>
);

const App = () => {
  useEffect(() => {
    const initPWA = async () => {
      await logPWAStatus();
      await clearOldCaches();
    };

    initPWA();

    const handleOnline = () => toast.success("Back online");
    const handleOffline = () => toast.warning("You're offline — using cached content");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <VideoQualityProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/profile/:username" element={<Profile />} />
                <Route path="/search" element={<Search />} />
                <Route path="/trending" element={<Trending />} />
                <Route path="/hashtag/:name" element={<Hashtag />} />
                <Route path="/saved" element={<Saved />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/post/:id" element={<PostDetail />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/messages/:conversationId" element={<Conversation />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </VideoQualityProvider>
    </QueryClientProvider>
  );
};

export default App;
