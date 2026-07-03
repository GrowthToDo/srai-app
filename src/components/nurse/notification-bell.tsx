"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useSession } from "@/lib/auth/use-session";

/**
 * Top-bar bell with an unread-count badge. Polls the notifications endpoint on
 * mount and on tab visibility change (no websockets). A `refresh` event on
 * window ("nurse:notifications-refresh") lets any mutation on the surface ask
 * the bell to re-count immediately.
 */
export function NotificationBell() {
  const { user } = useSession();
  const staffId = user?.staffId ?? null;
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!staffId) return;
    try {
      const res = await fetch(`/api/my/notifications?staffId=${staffId}`);
      if (!res.ok) return;
      const data = await res.json();
      setUnread(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch {
      /* best effort — leave the last known count */
    }
  }, [staffId]);

  useEffect(() => {
    if (!staffId) return;
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("nurse:notifications-refresh", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("nurse:notifications-refresh", refresh);
    };
  }, [staffId, refresh]);

  if (!user) return null;

  return (
    <Link
      href="/my/notifications"
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
