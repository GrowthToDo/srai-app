"use client";

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  CalendarDays,
  LogOut,
  Plane,
  Repeat,
} from "lucide-react";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/nurse/notification-bell";

/**
 * Nurse portal chrome (Phase 2). Mobile-first: a compact top bar with the
 * wordmark + the nurse's first name + a logout icon-button, and a sticky bottom
 * tab bar (My Schedule / Leave / Swaps). The whole app is capped at max-w-md and
 * centered so it reads like a phone app even on a desktop. Content gets bottom
 * padding to clear the fixed tab bar.
 *
 * AppShell renders /my* bare (no manager sidebar), so this layout owns all the
 * chrome for the nurse surface.
 */

const BASE_TABS = [
  { href: "/my", label: "My Schedule", icon: CalendarDays },
  { href: "/my/leave", label: "Leave", icon: Plane },
  { href: "/my/swaps", label: "Swaps", icon: Repeat },
] as const;

// Only per_diem (PRN) nurses submit availability, so the 4th tab is theirs
// alone. Full-time nurses like James see the 3 base tabs unchanged.
const AVAILABILITY_TAB = {
  href: "/my/availability",
  label: "Availability",
  icon: CalendarCheck,
} as const;

export default function NurseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, loading, logout } = useSession();

  const tabs =
    user?.employmentType === "per_diem"
      ? [...BASE_TABS, AVAILABILITY_TAB]
      : BASE_TABS;

  const firstName =
    !loading && user?.name ? user.name.split(" ")[0] : loading ? "" : "";

  function isActive(href: string) {
    if (href === "/my") return pathname === "/my";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-col leading-tight">
          <span
            className="text-base font-semibold text-primary"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            {APP_NAME}
          </span>
          {firstName && (
            <span className="text-xs text-muted-foreground">
              Hi, {firstName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          {user && (
            <button
              type="button"
              onClick={() => logout()}
              aria-label="Log out"
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="size-5" />
            </button>
          )}
        </div>
      </header>

      {/* Content — pad the bottom so the sticky tab bar never covers it. */}
      <main className="flex-1 px-4 pt-4 pb-28">{children}</main>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md items-stretch border-t border-border bg-background/95 backdrop-blur">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "text-primary")} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
