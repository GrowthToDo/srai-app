"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  deriveGuide,
  type Guide,
  type GuideFlags,
  type OnboardingCounts,
} from "@/lib/onboarding/guide";

/**
 * First-Cycle Guide provider + hook.
 *
 * One place fetches /api/notifications and holds the onboarding counts; every
 * surface (sidebar beacon, Generate/Publish dots, nudges, celebration, dashboard
 * checklist) derives from the same counts + local flags. This avoids the old
 * pattern where each component re-fetched and re-implemented the "next step"
 * logic and they drifted out of sync.
 *
 * Refresh triggers are deliberate: milestone actions dispatch "onboarding-refresh"
 * (import done, generated, published), cross-tab flag writes fire "storage", and
 * returning to a stale tab re-fetches. Route changes do NOT refetch — the counts
 * only move on real actions, so navigation stays cheap.
 */

const FLAG_KEYS = {
  staffReviewed: "fcg:staffReviewed",
  celebrated: "fcg:celebrated",
  dismissed: "fcg:dismissed",
} as const;

// Legacy dashboard/learn flags cleared on reset so a re-import truly starts over.
const LEGACY_KEYS = [
  "gettingStartedDismissed",
  "learnDailyOpsDismissed",
  "learnVisited",
];

const CACHE_STALE_MS = 10_000;

function readFlags(): GuideFlags {
  if (typeof window === "undefined") {
    return { staffReviewed: false, celebrated: false, dismissed: false };
  }
  return {
    staffReviewed: localStorage.getItem(FLAG_KEYS.staffReviewed) === "true",
    celebrated: localStorage.getItem(FLAG_KEYS.celebrated) === "true",
    dismissed: localStorage.getItem(FLAG_KEYS.dismissed) === "true",
  };
}

interface OnboardingContextValue {
  guide: Guide | null;
  counts: OnboardingCounts | null;
  flags: GuideFlags;
  markStaffReviewed: () => void;
  markCelebrated: () => void;
  dismiss: () => void;
  refresh: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<OnboardingCounts | null>(null);
  const [flags, setFlags] = useState<GuideFlags>(() => ({
    staffReviewed: false,
    celebrated: false,
    dismissed: false,
  }));
  const lastFetchRef = useRef(0);

  const refresh = useCallback(() => {
    lastFetchRef.current = Date.now();
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((j) => setCounts(j.onboarding ?? null))
      .catch(() => {
        /* fail closed — leave counts as-is so guide stays null until we succeed */
      });
  }, []);

  // Initial fetch + hydrate flags from localStorage (client-only).
  useEffect(() => {
    setFlags(readFlags());
    refresh();
  }, [refresh]);

  // Milestone actions dispatch this after import/generate/publish.
  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener("onboarding-refresh", onRefresh);
    return () => window.removeEventListener("onboarding-refresh", onRefresh);
  }, [refresh]);

  // Cross-tab flag changes: re-derive (no network needed).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("fcg:")) {
        setFlags(readFlags());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Returning to a stale tab refetches; a fresh tab does not thrash the API.
  useEffect(() => {
    const onVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetchRef.current > CACHE_STALE_MS
      ) {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh]);

  // Full reset: setup page dispatches this on a successful import so a re-import
  // starts the first cycle over. Clears the new namespace + legacy keys.
  useEffect(() => {
    const onReset = () => {
      // Blank the counts FIRST (synchronously) so the derived guide goes null
      // this render — no surface (especially the celebration modal) can act on
      // pre-reset counts while we clear flags and refetch.
      setCounts(null);
      Object.values(FLAG_KEYS).forEach((k) => localStorage.removeItem(k));
      LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
      setFlags(readFlags());
      refresh();
    };
    window.addEventListener("onboarding-reset", onReset);
    return () => window.removeEventListener("onboarding-reset", onReset);
  }, [refresh]);

  // Same-tab localStorage writes don't fire "storage", so flag mutators update
  // React state immediately (and persist).
  const writeFlag = useCallback((key: keyof typeof FLAG_KEYS) => {
    localStorage.setItem(FLAG_KEYS[key], "true");
    setFlags((prev) => ({ ...prev, [key]: true }));
  }, []);

  const markStaffReviewed = useCallback(
    () => writeFlag("staffReviewed"),
    [writeFlag]
  );
  const markCelebrated = useCallback(() => writeFlag("celebrated"), [writeFlag]);
  const dismiss = useCallback(() => writeFlag("dismissed"), [writeFlag]);

  // Route changes don't refetch on their own, but stale counts strand a surface
  // on a milestone that already advanced. On each pathname change, refetch when
  // the last fetch is older than the staleness window.
  useEffect(() => {
    if (Date.now() - lastFetchRef.current > CACHE_STALE_MS) {
      refresh();
    }
  }, [pathname, refresh]);

  // guide is null while counts are still loading — surfaces fail closed.
  const guide = useMemo(
    () => (counts ? deriveGuide(counts, flags) : null),
    [counts, flags]
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({
      guide,
      counts,
      flags,
      markStaffReviewed,
      markCelebrated,
      dismiss,
      refresh,
    }),
    [guide, counts, flags, markStaffReviewed, markCelebrated, dismiss, refresh]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return ctx;
}
