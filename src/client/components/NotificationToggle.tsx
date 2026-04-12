import { cn } from "../lib/utils"
import { usePushNotifications } from "../hooks/usePushNotifications"

export function NotificationToggle() {
  const { supported, subscribed, subscribe, unsubscribe, loading } = usePushNotifications()

  if (!supported) return null

  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-muted-foreground/60">Notifications</span>
      <button
        className={cn(
          "rounded-md px-2 py-0.5 capitalize transition-colors",
          subscribed ? "bg-muted text-foreground" : "hover:bg-muted/50 hover:text-foreground",
        )}
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
      >
        {subscribed ? "on" : "off"}
      </button>
    </div>
  )
}
