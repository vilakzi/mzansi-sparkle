import { Bell, BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useState } from "react";

export const PushNotificationPrompt = () => {
  const { permission, isSubscribed, isLoading, isSupported, subscribe, unsubscribe } =
    usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  // Don't render if unsupported, already decided, or dismissed
  if (!isSupported || permission === "denied" || dismissed) return null;
  if (isSubscribed) return null;
  if (permission === "granted" && isSubscribed) return null;

  return (
    <div className="mx-4 mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Bell className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Stay in the loop</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Get notified when someone likes, comments, or follows you.
        </p>
        <Button
          size="sm"
          className="mt-3"
          onClick={subscribe}
          disabled={isLoading}
        >
          {isLoading ? "Enabling..." : "Enable notifications"}
        </Button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

// Compact toggle for Settings page
export const PushNotificationToggle = () => {
  const { isSubscribed, isLoading, isSupported, permission, subscribe, unsubscribe } =
    usePushNotifications();

  if (!isSupported) {
    return (
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium">Push notifications</p>
          <p className="text-xs text-muted-foreground">Not supported in this browser</p>
        </div>
        <BellOff className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">Push notifications</p>
        <p className="text-xs text-muted-foreground">
          {permission === "denied"
            ? "Blocked in browser — enable in site settings"
            : isSubscribed
            ? "You'll be notified of likes, comments, follows"
            : "Get notified even when the app is closed"}
        </p>
      </div>
      <Button
        size="sm"
        variant={isSubscribed ? "outline" : "default"}
        onClick={isSubscribed ? unsubscribe : subscribe}
        disabled={isLoading || permission === "denied"}
      >
        {isLoading ? "..." : isSubscribed ? "Disable" : "Enable"}
      </Button>
    </div>
  );
};
