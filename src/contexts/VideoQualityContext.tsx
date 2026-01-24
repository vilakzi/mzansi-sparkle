import React, { createContext, useContext, ReactNode } from "react";
import { useVideoQuality, UseVideoQualityReturn } from "@/hooks/useVideoQuality";

const VideoQualityContext = createContext<UseVideoQualityReturn | null>(null);

interface VideoQualityProviderProps {
  children: ReactNode;
}

export const VideoQualityProvider: React.FC<VideoQualityProviderProps> = ({ children }) => {
  const quality = useVideoQuality();
  
  return (
    <VideoQualityContext.Provider value={quality}>
      {children}
    </VideoQualityContext.Provider>
  );
};

export const useVideoQualityContext = (): UseVideoQualityReturn => {
  const context = useContext(VideoQualityContext);
  if (!context) {
    throw new Error("useVideoQualityContext must be used within VideoQualityProvider");
  }
  return context;
};
