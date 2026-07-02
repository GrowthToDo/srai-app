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
  type PracticeStatus,
  type LearnVisitFlags,
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

// Per-step visit flags for the S6 practice loop. Set once a page is seen while
// practice is active AND its prerequisite record exists.
const LEARN_VISIT_KEYS = {
  callouts: "fcg:learn:callouts",
  openShifts: "fcg:learn:open-shifts",
  census: "fcg:learn:census",
  audit: "fcg:learn:audit",
} as const;

// Legacy dashboard/learn flags cleared on reset so a re-import truly starts over.
// The fcg:learn:* practice visit flags are cleared explicitly on reset too.
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

function readVisits(): LearnVisitFlags {
  if (typeof window === "undefined") {
    return { callouts: false, openShifts: false, census: false, audit: false };
  }
  return {
    callouts: localStorage.getItem(LEARN_VISIT_KEYS.callouts) === "true",
    openShifts: localStorage.getItem(LEARN_VISIT_KEYS.openShifts) === "true",
    census: localStorage.getItem(LEARN_VISIT_KEYS.census) === "true",
    audit: localStorage.getItem(LEARN_VISIT_KEYS.audit) === "true",
  };
}

interface OnboardingContextValue {
  guide: Guide | null;
  counts: OnboardingCounts | null;
  flags: GuideFlags;
  practice: PracticeStatus | null;
  visits: LearnVisitFlags;
  markStaffReviewed: () => void;
  markCelebrated: () => void;
  dismiss: () => void;
  refresh: () => void;
  /** Seed the practice chain then refresh. Returns the API error message on 4xx (e.g. 422). */
  startPractice: () => Promise<string | null>;
  /** Tear down the practice chain then refresh. */
  removePractice: () => Promise<void>;
  /** Mark a learn step complete (writes fcg:learn:<key> + updates state). Used by
   *  the explicit "Done with census / Finish tutorial" nudge buttons. */
  markLearnStep: (key: "callouts" | "openShifts" | "census" | "audit") => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<OnboardingCounts | null>(null);
  const [practice, setPractice] = useState<PracticeStatus | null>(null);
  const [flags, setFlags] = useState<GuideFlags>(() => ({
    staffReviewed: false,
    celebrated: false,
    dismissed: false,
  }));
  const [visits, setVisits] = useState<LearnVisitFlags>(() => ({
    callouts: false,
    openShifts: false,
    census: false,
    audit: false,
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
    // Practice status rides the same refresh triggers as the counts.
    fetch("/api/practice-examples")
      .then((r) => r.json())
      .then((j) => setPractice(j ?? null))
      .catch(() => {
        /* fail closed — leave practice as-is */
      });
  }, []);

  // Initial fetch + hydrate flags from localStorage (client-only).
  useEffect(() => {
    setFlags(readFlags());
    setVisits(readVisits());
    refresh();
  }, [refresh]);

  // Milestone actions dispatch this after import/generate/publish.
  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener("onboarding-refresh", onRefresh);
    return () => window.removeEventListener("onboarding-refresh", onRefresh);
  }, [refresh]);

  // Cross-tab flag changes: re-derive (no network needed). fcg:learn:* keys feed
  // the visit flags; the other fcg:* keys feed the stage flags.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("fcg:learn:")) {
        setVisits(readVisits());
      } else if (e.key && e.key.startsWith("fcg:")) {
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
      setPractice(null);
      Object.values(FLAG_KEYS).forEach((k) => localStorage.removeItem(k));
      Object.values(LEARN_VISIT_KEYS).forEach((k) => localStorage.removeItem(k));
      LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
      setFlags(readFlags());
      setVisits(readVisits());
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

  // Seed the practice chain. Returns null on success, or the API error message
  // (e.g. the 422 "publish a schedule first" copy) so the Learn card can show it.
  const startPractice = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/practice-examples", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.error ?? "Could not start practice mode.";
      }
      refresh();
      return null;
    } catch {
      return "Could not start practice mode.";
    }
  }, [refresh]);

  // Tear down the practice chain and clear the local visit flags so a future
  // practice run starts clean.
  const removePractice = useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/practice-examples", { method: "DELETE" });
    } catch {
      /* best effort — refresh below reconciles from the server */
    }
    Object.values(LEARN_VISIT_KEYS).forEach((k) => localStorage.removeItem(k));
    setVisits(readVisits());
    refresh();
  }, [refresh]);

  // Set the per-step visit flag when the manager lands on a learn page WHILE
  // practice is active AND that step's prerequisite record exists. Only the
  // callouts/open-shifts steps auto-complete on visit (and only once the
  // generated record exists, so a premature visit does not skip the lesson).
  //
  // Census and audit do NOT auto-complete on visit: a mere-visit flag killed
  // their walkthrough nudge the instant the page loaded, so the ①②③ guidance
  // never got a chance to guide. Those two steps are now completed explicitly
  // by the nudge's action button (markLearnStep), which lets the walkthrough
  // stay on screen until the manager says they are done.
  useEffect(() => {
    const p = practice;
    if (!p?.active) return;
    const mark = (key: string) => {
      if (localStorage.getItem(key) !== "true") {
        localStorage.setItem(key, "true");
        setVisits(readVisits());
      }
    };
    if (pathname.startsWith("/callouts") && p.items.generatedCallout) {
      mark(LEARN_VISIT_KEYS.callouts);
    } else if (pathname.startsWith("/open-shifts") && p.items.generatedOpenShift) {
      mark(LEARN_VISIT_KEYS.openShifts);
    }
    // Re-run when the practice status changes too: a manager already sitting on
    // /callouts when the generated callout appears should still be marked.
  }, [pathname, practice]);

  // Explicitly complete a learn step (fcg:learn:<key>). The census/audit nudges
  // call this from their "Done / Finish" action button so their walkthrough is
  // dismissed on the manager's command, not on arrival. Same-tab writes don't
  // fire "storage", so we update React state directly.
  const markLearnStep = useCallback(
    (key: "callouts" | "openShifts" | "census" | "audit") => {
      const storageKey = LEARN_VISIT_KEYS[key];
      if (localStorage.getItem(storageKey) !== "true") {
        localStorage.setItem(storageKey, "true");
        setVisits(readVisits());
      }
    },
    []
  );

  // Route changes don't refetch on their own, but stale counts strand a surface
  // on a milestone that already advanced. On each pathname change, refetch when
  // the last fetch is older than the staleness window.
  useEffect(() => {
    if (Date.now() - lastFetchRef.current > CACHE_STALE_MS) {
      refresh();
    }
  }, [pathname, refresh]);

  // guide is null while counts are still loading — surfaces fail closed. The
  // S6 beacon reads practice + visits to point at the next incomplete step.
  const guide = useMemo(
    () => (counts ? deriveGuide(counts, flags, practice, visits) : null),
    [counts, flags, practice, visits]
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({
      guide,
      counts,
      flags,
      practice,
      visits,
      markStaffReviewed,
      markCelebrated,
      dismiss,
      refresh,
      startPractice,
      removePractice,
      markLearnStep,
    }),
    [
      guide,
      counts,
      flags,
      practice,
      visits,
      markStaffReviewed,
      markCelebrated,
      dismiss,
      refresh,
      startPractice,
      removePractice,
      markLearnStep,
    ]
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
