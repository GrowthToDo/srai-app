"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * Chrome wrapper. Every app route gets the manager Sidebar + scrolling main.
 * Two exceptions render bare (no manager sidebar): the /login route (its own
 * centered layout in src/app/login/layout.tsx) and the nurse portal /my* (its
 * own mobile-first chrome in src/app/my/layout.tsx). AppShell steps aside for
 * both so the manager Sidebar never leaks into the nurse app.
 *
 * This keeps the root layout a server component and every existing manager
 * page's markup identical — only /login and /my opt out of the chrome.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const isNursePortal = pathname === "/my" || pathname.startsWith("/my/");

  if (isLogin || isNursePortal) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
