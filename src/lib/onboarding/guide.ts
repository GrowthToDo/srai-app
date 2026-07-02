/**
 * First-Cycle Guide — pure stage derivation (no React, no browser APIs).
 *
 * A nurse manager's first cycle runs Setup → Staff → create Schedule → Generate
 * → Publish. This module turns raw counts + local flags into a single Stage and
 * the surfaces each stage drives (sidebar beacon, Generate/Publish dots, the
 * one-line nudge, the celebration modal, the Learn card). Keeping it pure means
 * every surface reads one source of truth and the derivation is unit-testable.
 *
 * The `celebrated` latch is sticky: once the first schedule is published we stop
 * pointing at S0–S5 for good (until the flags are reset via the onboarding-reset
 * event), so unpublishing or deleting a schedule never resurrects the beacon.
 */

export interface OnboardingCounts {
  staffCount: number;
  unitsCount: number;
  scheduleCount: number;
  generatedCount: number;
  publishedCount: number;
  activeSchedule: {
    id: string;
    status: string;
    hasAssignments: boolean;
  } | null;
}

export interface GuideFlags {
  staffReviewed: boolean;
  celebrated: boolean;
  dismissed: boolean;
}

export type Stage = "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";

export interface Guide {
  stage: Stage;
  beaconHref: string | null;
  activeScheduleId: string | null;
  dot: "generate" | "publish" | null;
  showCelebration: boolean;
  showLearn: boolean;
  dismissed: boolean;
}

/**
 * Derive the current first-cycle stage. Ordered, first-match-wins.
 *
 * S3/S4 key on the *active* schedule's own assignments, not the global
 * generatedCount — a brand-new empty schedule while an older one already has
 * assignments must land in S3 (generate this one), not skip ahead.
 */
export function deriveGuide(o: OnboardingCounts, flags: GuideFlags): Guide {
  const s = o.activeSchedule;
  const activeScheduleId = s?.id ?? null;

  const base = {
    activeScheduleId,
    dot: null as Guide["dot"],
    showCelebration: false,
    showLearn: false,
    dismissed: flags.dismissed,
  };

  // S0 — no staff or no units imported yet.
  if (o.staffCount === 0 || o.unitsCount === 0) {
    return { ...base, stage: "S0", beaconHref: "/setup" };
  }

  // S1 — imported, but the manager hasn't reviewed the staff list yet.
  if (!flags.staffReviewed) {
    return { ...base, stage: "S1", beaconHref: "/staff" };
  }

  // S2 — staff reviewed, but no schedule period exists.
  if (o.scheduleCount === 0) {
    return { ...base, stage: "S2", beaconHref: "/schedule" };
  }

  // S3 — active schedule exists but hasn't been generated (no assignments).
  if (
    s &&
    !s.hasAssignments &&
    s.status !== "published" &&
    o.publishedCount === 0 &&
    !flags.celebrated
  ) {
    return { ...base, stage: "S3", beaconHref: "/schedule", dot: "generate" };
  }

  // S4 — active schedule is generated (has assignments) but not yet published.
  if (
    s &&
    s.hasAssignments &&
    s.status !== "published" &&
    o.publishedCount === 0 &&
    !flags.celebrated
  ) {
    return { ...base, stage: "S4", beaconHref: "/schedule", dot: "publish" };
  }

  // S5 — first publish landed; show the celebration (until it latches celebrated).
  if (o.publishedCount > 0 && !flags.celebrated) {
    return { ...base, stage: "S5", beaconHref: null, showCelebration: true };
  }

  // S6 — celebrated latch is set; surface the daily-ops Learn card.
  if (flags.celebrated) {
    return { ...base, stage: "S6", beaconHref: null, showLearn: true };
  }

  // S7 — fallback (e.g. scheduleCount > 0 but activeSchedule is null): nothing to nudge.
  return { ...base, stage: "S7", beaconHref: null };
}

export interface Nudge {
  message: string;
  href?: string;
  linkLabel?: string;
}

/** True when the pathname is the exact schedule list page (not a detail route). */
function isScheduleList(pathname: string): boolean {
  return pathname === "/schedule";
}

/** True when the pathname is a schedule detail route (/schedule/<id>). */
function isScheduleDetail(pathname: string): boolean {
  return /^\/schedule\/[^/]+$/.test(pathname);
}

/**
 * The one-line contextual nudge for a given stage + page. Audience is nurse
 * managers; copy never references a pilot. Returns null when the current page
 * has nothing stage-relevant to say.
 */
export function getNudge(
  stage: Stage,
  pathname: string,
  activeScheduleId: string | null
): Nudge | null {
  switch (stage) {
    case "S0":
      if (pathname === "/setup") {
        return {
          message:
            "Import your roster to begin — staff, units, and rules load from one Excel file.",
        };
      }
      return null;

    case "S1":
      if (pathname.startsWith("/staff")) {
        return {
          message:
            "Check your imported nurses — roles, FTE, and competency levels. Then create a schedule period.",
          href: "/schedule",
          linkLabel: "Create schedule",
        };
      }
      if (pathname !== "/setup") {
        return {
          message: "Next: review your staff list.",
          href: "/staff",
          linkLabel: "Go to Staff",
        };
      }
      return null;

    case "S2":
      if (isScheduleList(pathname)) {
        return {
          message: "Create a schedule period — pick the unit and date range.",
        };
      }
      return null;

    case "S3":
      if (isScheduleDetail(pathname)) {
        return {
          message:
            "Click Generate Schedule (top right) — the AI fills the grid in about a minute.",
        };
      }
      if (pathname.startsWith("/scenarios")) {
        return {
          message:
            "Select your schedule and click Generate. Afterwards, publish it from the Schedule page.",
          href: "/schedule",
          linkLabel: "Go to Schedule",
        };
      }
      if (isScheduleList(pathname)) {
        return {
          message: "Open your schedule below, then click Generate Schedule.",
        };
      }
      return null;

    case "S4":
      if (isScheduleDetail(pathname)) {
        return {
          message:
            "Review the grid, then hit Publish (top right) to make it official.",
        };
      }
      if (isScheduleList(pathname) || pathname.startsWith("/scenarios")) {
        return {
          message: "Your schedule is generated — open it and hit Publish.",
          href: activeScheduleId ? `/schedule/${activeScheduleId}` : "/schedule",
          linkLabel: "Open schedule",
        };
      }
      return null;

    default:
      return null;
  }
}
