"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * Chrome wrapper. Every app route gets the manager Sidebar + scrolling main.
 * The /login route is the one exception: it renders its own centered layout
 * with no sidebar (see src/app/login/layout.tsx), so AppShell steps aside and
 * renders children bare there.
 *
 * This keeps the root layout a server component and every existing page's
 * markup identical — only /login opts out of the chrome.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");

  if (isLogin) {
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
