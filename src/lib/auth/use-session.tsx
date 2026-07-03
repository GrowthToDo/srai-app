"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

/**
 * Session provider + hook, mirroring the onboarding provider pattern: fetch
 * /api/auth/me once on mount, expose { user, loading, logout }.
 *
 * When AUTH_ENABLED is off, /api/auth/me returns 401 — the provider must treat
 * that as "no session" (user = null) and NOT redirect or crash. The rest of the
 * app is fully usable without a session in that mode.
 */

export interface SessionUser {
  id: string;
  email: string;
  role: "manager" | "nurse";
  staffId: string | null;
  name: string;
}

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SessionUser | null) => {
        if (!cancelled) setUser(data ?? null);
      })
      .catch(() => {
        // AUTH_ENABLED off (401) or a network hiccup — no session, no crash.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* best effort — navigate to login regardless */
    }
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo<SessionContextValue>(
    () => ({ user, loading, logout }),
    [user, loading, logout]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
