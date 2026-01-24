import { useState, useEffect } from "react";
import { 
  Settings, 
  Gauge, 
  Check,
  ChevronLeft,
  Wifi,
  Signal,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { hapticSelect } from "@/lib/haptics";
import { useVideoQualityContext } from "@/contexts/VideoQualityContext";
import { VideoQualityPreference } from "@/hooks/useVideoQuality";

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
}

type MenuView = 'main' | 'speed' | 'quality';

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const QUALITY_OPTIONS: { label: string; value: VideoQualityPreference; icon: React.ReactNode; description: string }[] = [
  { 
    label: 'Auto', 
    value: 'auto', 
    icon: <Zap className="h-4 w-4 text-primary" />,
    description: 'Adapts to network'
  },
  { 
    label: 'High', 
    value: 'high', 
    icon: <Wifi className="h-4 w-4" />,
    description: 'Best quality'
  },
  { 
    label: 'Low', 
    value: 'low', 
    icon: <Signal className="h-4 w-4" />,
    description: 'Saves data'
  },
];

export const VideoControls = ({ videoRef, isActive }: VideoControlsProps) => {
  const [open, setOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  const { preference, effectiveQuality, networkStatus, setPreference } = useVideoQualityContext();

  // Reset menu view when popover closes
  useEffect(() => {
    if (!open) {
      setMenuView('main');
    }
  }, [open]);

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
      hapticSelect();
    }
    setMenuView('main');
  };

  const handleQualityChange = (q: VideoQualityPreference) => {
    setPreference(q);
    hapticSelect();
    setMenuView('main');
  };

  const getQualityLabel = () => {
    if (preference === 'auto') {
      return `Auto (${effectiveQuality === 'high' ? 'HD' : 'SD'})`;
    }
    return preference === 'high' ? 'High' : 'Low';
  };

  const renderMainMenu = () => (
    <div className="space-y-1">
      <button
        onClick={() => setMenuView('speed')}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-sm"
      >
        <div className="flex items-center gap-3">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span>Playback speed</span>
        </div>
        <span className="text-muted-foreground">{playbackSpeed}x</span>
      </button>
      
      <button
        onClick={() => setMenuView('quality')}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-sm"
      >
        <div className="flex items-center gap-3">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span>Quality</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {preference === 'auto' && networkStatus === 'slow' && (
            <Signal className="h-3 w-3 text-yellow-500" />
          )}
          {preference === 'auto' && networkStatus === 'fast' && (
            <Wifi className="h-3 w-3 text-green-500" />
          )}
          <span>{getQualityLabel()}</span>
        </div>
      </button>
    </div>
  );

  const renderSpeedMenu = () => (
    <div className="space-y-1">
      <button
        onClick={() => setMenuView('main')}
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Playback speed
      </button>
      <div className="h-px bg-border my-2" />
      {PLAYBACK_SPEEDS.map((speed) => (
        <button
          key={speed}
          onClick={() => handleSpeedChange(speed)}
          className={cn(
            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-sm",
            playbackSpeed === speed 
              ? "bg-primary/20 text-primary" 
              : "hover:bg-secondary/50"
          )}
        >
          <span>{speed === 1 ? 'Normal' : `${speed}x`}</span>
          {playbackSpeed === speed && <Check className="h-4 w-4" />}
        </button>
      ))}
    </div>
  );

  const renderQualityMenu = () => (
    <div className="space-y-1">
      <button
        onClick={() => setMenuView('main')}
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Quality
      </button>
      <div className="h-px bg-border my-2" />
      {QUALITY_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => handleQualityChange(option.value)}
          className={cn(
            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-sm",
            preference === option.value 
              ? "bg-primary/20 text-primary" 
              : "hover:bg-secondary/50"
          )}
        >
          <div className="flex items-center gap-3">
            {option.icon}
            <div className="text-left">
              <span className="block">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </div>
          </div>
          {preference === option.value && <Check className="h-4 w-4" />}
        </button>
      ))}
      
      {/* Network status indicator for Auto mode */}
      {preference === 'auto' && (
        <div className="mt-2 px-3 py-2 text-xs text-muted-foreground border-t border-border pt-3">
          <div className="flex items-center gap-2">
            {networkStatus === 'fast' ? (
              <Wifi className="h-3 w-3 text-green-500" />
            ) : networkStatus === 'slow' ? (
              <Signal className="h-3 w-3 text-yellow-500" />
            ) : (
              <Signal className="h-3 w-3" />
            )}
            <span>
              {networkStatus === 'fast' && 'Fast connection • HD quality'}
              {networkStatus === 'slow' && 'Slow connection • SD quality'}
              {networkStatus === 'unknown' && 'Checking network...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  if (!isActive) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="bg-black/50 backdrop-blur-sm rounded-full p-2.5 text-foreground transition-all hover:bg-black/70 active:scale-90"
          onClick={(e) => e.stopPropagation()}
        >
          <Settings className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        align="start" 
        side="bottom"
        className="w-64 p-2 bg-card/95 backdrop-blur-xl border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {menuView === 'main' && renderMainMenu()}
        {menuView === 'speed' && renderSpeedMenu()}
        {menuView === 'quality' && renderQualityMenu()}
      </PopoverContent>
    </Popover>
  );
};