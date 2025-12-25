import { useState, useRef, useEffect } from "react";
import { 
  Settings, 
  Gauge, 
  Check,
  ChevronLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { hapticSelect } from "@/lib/haptics";

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
}

type MenuView = 'main' | 'speed' | 'quality';

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const QUALITY_OPTIONS = [
  { label: 'Auto', value: 'auto' },
  { label: '720p', value: '720' },
  { label: '480p', value: '480' },
  { label: '360p', value: '360' },
];

export const VideoControls = ({ videoRef, isActive }: VideoControlsProps) => {
  const [open, setOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [quality, setQuality] = useState('auto');

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

  const handleQualityChange = (q: string) => {
    setQuality(q);
    hapticSelect();
    // Quality switching would require HLS/DASH implementation
    // For now, we just track the preference
    setMenuView('main');
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
        <span className="text-muted-foreground capitalize">{quality}</span>
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
            quality === option.value 
              ? "bg-primary/20 text-primary" 
              : "hover:bg-secondary/50"
          )}
        >
          <span>{option.label}</span>
          {quality === option.value && <Check className="h-4 w-4" />}
        </button>
      ))}
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
        className="w-56 p-2 bg-card/95 backdrop-blur-xl border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {menuView === 'main' && renderMainMenu()}
        {menuView === 'speed' && renderSpeedMenu()}
        {menuView === 'quality' && renderQualityMenu()}
      </PopoverContent>
    </Popover>
  );
};
