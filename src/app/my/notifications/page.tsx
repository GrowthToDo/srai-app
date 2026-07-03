"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useSession } from "@/lib/auth/use-session";
import { Card, CardContent } from "@/components/ui/card";
import { SignedOutCard } from "@/components/nurse/signed-out-card";

interface NurseNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "";
  }
}

export default function NotificationsPage() {
  const { user, loading: sessionLoading } = useSession();
  const router = useRouter();
  const staffId = user?.staffId ?? null;

  const [items, setItems] = useState<NurseNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/my/notifications?staffId=${staffId}`);
      const data = await res.json();
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [staffId]);

  // On open: load the list, then mark everything read and tell the bell to
  // re-count. We keep the just-fetched unread dots on screen so the nurse can
  // still see what was new; the badge clears immediately.
  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      await fetchNotifications();
      if (cancelled) return;
      try {
        await fetch(`/api/my/notifications?staffId=${staffId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark-all-read" }),
        });
        window.dispatchEvent(new Event("nurse:notifications-refresh"));
      } catch {
        /* best effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId, fetchNotifications]);

  if (sessionLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!user) return <SignedOutCard />;

  return (
    <div className="space-y-5">
      <h1
        className="text-xl font-semibold"
        style={{ fontFamily: "var(--font-fraunces)" }}
      >
        Notifications
      </h1>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            You&apos;re all caught up.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => {
            const unread = n.readAt === null;
            const clickable = !!n.href;
            return (
              <li key={n.id}>
                <Card
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => n.href && router.push(n.href)}
                  onKeyDown={(e) => {
                    if (n.href && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      router.push(n.href);
                    }
                  }}
                  className={clickable ? "cursor-pointer transition-colors hover:bg-accent/40" : undefined}
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <span
                      aria-hidden
                      className={
                        "mt-1.5 size-2 shrink-0 rounded-full " +
                        (unread ? "bg-red-600" : "bg-transparent")
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && (
                        <div className="text-sm text-muted-foreground">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        {relativeTime(n.createdAt)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
