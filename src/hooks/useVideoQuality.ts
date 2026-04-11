import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VideoQualityPreference = "auto" | "high" | "low";
export type EffectiveQuality = "high" | "low";

interface NetworkInfo {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

export interface UseVideoQualityReturn {
  preference: VideoQualityPreference;
  effectiveQuality: EffectiveQuality;
  networkStatus: "fast" | "slow" | "unknown";
  setPreference: (pref: VideoQualityPreference) => void;
  isLoading: boolean;
}

const STORAGE_KEY = "video_quality_preference";

// Get network information from Navigator API
const getNetworkInfo = (): NetworkInfo | null => {
  const connection = (navigator as any).connection;
  if (!connection) return null;
  
  return {
    effectiveType: connection.effectiveType || "4g",
    downlink: connection.downlink || 10,
    rtt: connection.rtt || 50,
    saveData: connection.saveData || false,
  };
};

// Determine network status based on connection info
export const getNetworkStatus = (): "fast" | "slow" | "unknown" => {
  const info = getNetworkInfo();
  if (!info) return "unknown";
  
  // User has data saver enabled
  if (info.saveData) return "slow";
  
  // Check effective connection type
  const slowTypes = ["slow-2g", "2g", "3g"];
  if (slowTypes.includes(info.effectiveType)) return "slow";
  
  // Check downlink speed (Mbps)
  if (info.downlink < 1.5) return "slow";
  
  // Check round-trip time (ms)
  if (info.rtt > 400) return "slow";
  
  return "fast";
};

export const useVideoQuality = (): UseVideoQualityReturn => {
  // Initialize from localStorage for instant load
  const [preference, setPreferenceState] = useState<VideoQualityPreference>(() => {
    if (typeof window === "undefined") return "auto";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "auto" || stored === "high" || stored === "low") {
      return stored;
    }
    return "auto";
  });
  
  const [networkStatus, setNetworkStatus] = useState<"fast" | "slow" | "unknown">(
    () => getNetworkStatus()
  );
  const [isLoading, setIsLoading] = useState(true);

  // Calculate effective quality based on preference and network
  const effectiveQuality: EffectiveQuality = 
    preference === "auto" 
      ? (networkStatus === "slow" ? "low" : "high")
      : preference === "high" 
        ? "high" 
        : "low";

  // Monitor network changes
  useEffect(() => {
    const connection = (navigator as any).connection;
    if (!connection) return;

    const handleChange = () => {
      setNetworkStatus(getNetworkStatus());
    };

    connection.addEventListener("change", handleChange);
    return () => connection.removeEventListener("change", handleChange);
  }, []);

  // Initial network status check on mount
  useEffect(() => {
    setNetworkStatus(getNetworkStatus());
  }, []);

  // Fetch preference from database on mount
  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        // Use localStorage as primary storage (instant, works offline)
        // This is sufficient for video quality preference
        setIsLoading(false);
      } catch (error) {
        console.error("[useVideoQuality] Error fetching preference:", error);
        setIsLoading(false);
      }
    };

    fetchPreference();
  }, []);

  // Update preference and persist
  const setPreference = useCallback((pref: VideoQualityPreference) => {
    setPreferenceState(pref);
    localStorage.setItem(STORAGE_KEY, pref);
  }, []);

  return {
    preference,
    effectiveQuality,
    networkStatus,
    setPreference,
    isLoading,
  };
};
