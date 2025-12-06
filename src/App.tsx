import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Search from "./pages/Search";
import Trending from "./pages/Trending";
import Hashtag from "./pages/Hashtag";
import Saved from "./pages/Saved";
import Notifications from "./pages/Notifications";
import PostDetail from "./pages/PostDetail";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import Messages from "./pages/Messages";
import Conversation from "./pages/Conversation";
import Categories from "./pages/Categories";
import Category from "./pages/Category";
import { logPWAStatus, clearOldCaches } from "./lib/pwaUtils";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Initialize PWA utilities
    const initPWA = async () => {
      await logPWAStatus();
      await clearOldCaches();
      
      console.log('[App] PWA initialized with hot-reload support');
      console.log('[App] Videos will be cached adaptively based on network quality');
      
      // Check if PWA is installable
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
      if (isInstalled) {
        console.log('[App] Running as installed PWA');
      } else {
        console.log('[App] Running in browser - install prompt may appear');
      }
    };

    initPWA();

    // Log network changes
    const handleOnline = () => {
      console.log('[App] Network: ONLINE');
    };
    
    const handleOffline = () => {
      console.log('[App] Network: OFFLINE - Using cached content');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
            <Route path="/categories" element={<Categories />} />
            <Route path="/category/:name" element={<Category />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
