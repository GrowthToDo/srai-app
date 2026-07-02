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

/**
 * Status of the seeded practice chain (GET /api/practice-examples). The
 * generated records appear only after the manager approves the practice leaves:
 * approving Leave A creates `generatedCallout`, Leave B creates
 * `generatedOpenShift`. This is what makes the causal chain the curriculum.
 */
export interface PracticeStatus {
  active: boolean;
  items: {
    leaveA: { id: string; status: string } | null;
    leaveB: { id: string; status: string } | null;
    swap: { id: string; status: string } | null;
    generatedCallout: { id: string; status: string } | null;
    generatedOpenShift: { id: string; status: string } | null;
  };
}

/** Local per-step visit flags set once a page is seen while practice is active. */
export interface LearnVisitFlags {
  callouts: boolean;
  openShifts: boolean;
  census: boolean;
  audit: boolean;
}

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
export function deriveGuide(
  o: OnboardingCounts,
  flags: GuideFlags,
  practice?: PracticeStatus | null,
  visits?: LearnVisitFlags
): Guide {
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

  // S6 — celebrated latch is set; surface the daily-ops Learn card and run the
  // guided practice loop. While practice is active, the beacon points at the
  // first incomplete step; before practice starts, it points at the dashboard
  // Learn card. Once every step is done, nothing is beaconed.
  if (flags.celebrated) {
    let beaconHref: string | null = null;
    if (practice?.active) {
      const next = nextIncompleteStep(practice, visits);
      beaconHref = next ? LEARN_STEPS.find((st) => st.key === next)!.href : null;
    } else if (practice && !practice.active) {
      // Learn card offered but practice not started yet → point at the dashboard.
      beaconHref = "/dashboard";
    }
    return { ...base, stage: "S6", beaconHref, showLearn: true };
  }

  // S7 — fallback (e.g. scheduleCount > 0 but activeSchedule is null): nothing to nudge.
  return { ...base, stage: "S7", beaconHref: null };
}

// ===========================================================================
// LEARN-PHASE GUIDED LOOP (S6)
// ===========================================================================

export type LearnStepKey =
  | "leave"
  | "callouts"
  | "open-shifts"
  | "swaps"
  | "census"
  | "audit";

export interface LearnStep {
  key: LearnStepKey;
  order: number;
  href: string;
  title: string;
  /** Dashboard Learn-card blurb. */
  blurb: string;
}

/**
 * The six daily tools, in the order the tutorial teaches them. The order is the
 * causal chain: approving a short-notice leave makes a callout; a planned one
 * makes an open shift; then swaps, census, and finally the audit trail that
 * recorded everything.
 */
export const LEARN_STEPS: readonly LearnStep[] = [
  {
    key: "leave",
    order: 1,
    href: "/leave",
    title: "Approve time off",
    blurb:
      "Two example requests. Approve the short-notice one and it becomes a callout; approve the planned one and it becomes an open shift.",
  },
  {
    key: "callouts",
    order: 2,
    href: "/callouts",
    title: "Handle a callout",
    blurb:
      "The callout you just created. Open it to review the ranked replacement candidates, the way you would for a real short-notice gap.",
  },
  {
    key: "open-shifts",
    order: 3,
    href: "/open-shifts",
    title: "Fill an open shift",
    blurb:
      "The planned leave landed here instead of Callouts — beyond the 7-day callout threshold, so you have time to plan coverage, not escalate.",
  },
  {
    key: "swaps",
    order: 4,
    href: "/swaps",
    title: "Review a shift swap",
    blurb:
      "Two nurses want to trade. Approve or deny — compliance rules (60-hour caps, rest, competency) are checked automatically first.",
  },
  {
    key: "census",
    order: 5,
    href: "/census",
    title: "Adjust the census",
    blurb:
      "Raise a shift's census tier and watch required staffing change and the schedule flag new gaps. Set it back when you are done.",
  },
  {
    key: "audit",
    order: 6,
    href: "/audit",
    title: "Read the audit trail",
    blurb:
      "Every change — publishes, callouts, swaps, overrides — is saved here automatically. Nothing gets lost.",
  },
] as const;

export interface LearnProgress {
  /** Completed step keys. */
  done: Record<LearnStepKey, boolean>;
  /** First incomplete step in order, or null when the tutorial is finished. */
  next: LearnStepKey | null;
  /** How many of the six steps are complete. */
  completedCount: number;
  /** All six done. */
  allComplete: boolean;
}

const NO_VISITS: LearnVisitFlags = {
  callouts: false,
  openShifts: false,
  census: false,
  audit: false,
};

/**
 * Derive per-step completion from the practice status + local visit flags.
 * Pure: pass everything in.
 *
 * 1 leave       — both practice leaves approved (that is what generates 2 & 3).
 * 2 callouts    — the generated callout exists AND the page was visited (or it
 *                 was acted on, i.e. status moved off "open").
 * 3 open-shifts — the generated open shift exists AND the page was visited (or
 *                 it was acted on, i.e. status moved off "pending_approval").
 * 4 swaps       — the practice swap is no longer pending (approved or denied).
 * 5 census      — the census page was visited while practice was active.
 * 6 audit       — the audit page was visited while practice was active.
 */
export function learnProgress(
  practice: PracticeStatus | null | undefined,
  visits: LearnVisitFlags = NO_VISITS
): LearnProgress {
  const items = practice?.items;

  const leaveDone =
    items?.leaveA?.status === "approved" &&
    items?.leaveB?.status === "approved";

  const callout = items?.generatedCallout ?? null;
  const calloutDone =
    !!callout && (visits.callouts || callout.status !== "open");

  const os = items?.generatedOpenShift ?? null;
  const openShiftsDone =
    !!os && (visits.openShifts || os.status !== "pending_approval");

  const swapDone = !!items?.swap && items.swap.status !== "pending";

  const censusDone = visits.census;
  const auditDone = visits.audit;

  const done: Record<LearnStepKey, boolean> = {
    leave: !!leaveDone,
    callouts: !!calloutDone,
    "open-shifts": !!openShiftsDone,
    swaps: !!swapDone,
    census: !!censusDone,
    audit: !!auditDone,
  };

  const next = LEARN_STEPS.find((st) => !done[st.key])?.key ?? null;
  const completedCount = LEARN_STEPS.filter((st) => done[st.key]).length;

  return { done, next, completedCount, allComplete: completedCount === 6 };
}

/** The first incomplete learn step's key, or null when finished. */
export function nextIncompleteStep(
  practice: PracticeStatus | null | undefined,
  visits: LearnVisitFlags = NO_VISITS
): LearnStepKey | null {
  return learnProgress(practice, visits).next;
}

export interface Nudge {
  message: string;
  href?: string;
  linkLabel?: string;
  action?: "staff-reviewed" | "learn-census-done" | "learn-audit-done";
  actionLabel?: string;
}

/** True when the pathname is the exact schedule list page (not a detail route). */
function isScheduleList(pathname: string): boolean {
  return pathname === "/schedule";
}

/** True when the pathname is a schedule detail route (/schedule/<id>). */
function isScheduleDetail(pathname: string): boolean {
  return /^\/schedule\/[^/]+$/.test(pathname);
}

/** Progress suffix shared by every learn-loop nudge: " Step n of 6." */
function stepSuffix(order: number): string {
  return ` Step ${order} of 6.`;
}

/**
 * The S6 practice-loop nudge for a page. Each page's nudge says what to do, then
 * what happened, then where to go next; wherever the manager wanders, an
 * off-loop page pulls them back to the current step. Assumes practice.active.
 */
function getLearnNudge(
  pathname: string,
  practice: PracticeStatus,
  visits: LearnVisitFlags
): Nudge | null {
  const { items } = practice;
  const progress = learnProgress(practice, visits);
  const leaveA = items.leaveA;
  const leaveB = items.leaveB;

  // /leave — approve the two practice requests.
  if (pathname.startsWith("/leave")) {
    const aApproved = leaveA?.status === "approved";
    const bApproved = leaveB?.status === "approved";
    if (aApproved && bApproved) {
      return {
        message:
          "Done here. Next: handle the callout you just created." +
          stepSuffix(1),
        href: "/callouts",
        linkLabel: "Go to Callouts",
      };
    }
    if (aApproved) {
      return {
        message:
          "That shift just became a callout (within 7 days of the shift, your unit's callout threshold). Now approve the planned leave too — it's beyond 7 days, so it becomes an open shift instead." +
          stepSuffix(1),
      };
    }
    return {
      message:
        "Two [PRACTICE] requests below. Approve the short-notice one first — the nurse's shift is inside your 7-day callout threshold (a unit setting), so approving creates a callout." +
        stepSuffix(1),
    };
  }

  // /callouts — review the generated callout's ranked candidates.
  if (pathname.startsWith("/callouts")) {
    if (!items.generatedCallout) return null;
    if (visits.callouts || items.generatedCallout.status !== "open") {
      return {
        message: "Next: the open shift." + stepSuffix(2),
        href: "/open-shifts",
        linkLabel: "Go to Open Shifts",
      };
    }
    return {
      message:
        "This callout came from the leave you approved. Open it and review the ranked replacement candidates — that's how you'd fill a real one. Then continue." +
        stepSuffix(2),
    };
  }

  // /open-shifts — the planned-leave coverage request.
  if (pathname.startsWith("/open-shifts")) {
    if (!items.generatedOpenShift) return null;
    if (visits.openShifts || items.generatedOpenShift.status !== "pending_approval") {
      return {
        message: "Next: review the shift swap." + stepSuffix(3),
        href: "/swaps",
        linkLabel: "Go to Shift Swaps",
      };
    }
    return {
      message:
        "This coverage request came from the planned leave — beyond the 7-day threshold, so it's an open shift, not a callout: you have time to plan instead of escalate. Review the candidates, then continue." +
        stepSuffix(3),
    };
  }

  // /swaps — approve or deny the practice swap.
  if (pathname.startsWith("/swaps")) {
    const swapActed = !!items.swap && items.swap.status !== "pending";
    if (swapActed) {
      return {
        message: "Next: adjust the census." + stepSuffix(4),
        href: "/census",
        linkLabel: "Go to Census",
      };
    }
    return {
      message:
        "Approve or deny the [PRACTICE] swap below — compliance rules (60-hour caps, rest, competency) are checked automatically before it can go through." +
        stepSuffix(4),
    };
  }

  // /census — raise a tier and watch staffing change. Completing this step is
  // explicit (the "Done" button below), so the ①②③ walkthrough stays on screen
  // until the manager has actually worked through it — a mere visit no longer
  // silently marks it done and kills the guidance.
  if (pathname.startsWith("/census")) {
    if (visits.census) {
      return {
        message: "Next: read the audit trail." + stepSuffix(5),
        href: "/audit",
        linkLabel: "Go to Audit Trail",
      };
    }
    return {
      message:
        "① Pick a date in your published schedule ② raise the census tier ③ watch required staffing change and the schedule flag new gaps. Set it back when you're done." +
        stepSuffix(5),
      action: "learn-census-done",
      actionLabel: "Done with census — continue",
    };
  }

  // /audit — the paper trail. Completing this = tutorial done. Explicit finish
  // so the audit step is no longer a dead end: the button marks it done and
  // returns the manager to the dashboard, where the Learn card shows completion.
  if (pathname.startsWith("/audit")) {
    if (visits.audit) {
      return {
        message:
          "That's the whole daily loop. Remove your practice entries from the dashboard Learn card whenever you're ready." +
          stepSuffix(6),
        href: "/dashboard",
        linkLabel: "Back to Dashboard",
      };
    }
    return {
      message:
        "Everything you just did — the approvals, the callout, the swap — was recorded here automatically. This is your paper trail for state surveys and staffing disputes." +
        stepSuffix(6),
      action: "learn-audit-done",
      actionLabel: "Finish tutorial — back to Dashboard",
    };
  }

  // Any OTHER page during S6 with practice active: pull them to the next step.
  if (progress.next) {
    const step = LEARN_STEPS.find((st) => st.key === progress.next)!;
    return {
      message: `Practice in progress — next: ${step.title}.`,
      href: step.href,
      linkLabel: `Go to ${step.title}`,
    };
  }
  return null;
}

/**
 * The one-line contextual nudge for a given stage + page. Audience is nurse
 * managers; copy never references a pilot. Returns null when the current page
 * has nothing stage-relevant to say.
 */
export function getNudge(
  stage: Stage,
  pathname: string,
  activeScheduleId: string | null,
  practice?: PracticeStatus | null,
  visits?: LearnVisitFlags
): Nudge | null {
  // S6 guided practice loop — only speaks while practice is active.
  if (stage === "S6") {
    if (!practice?.active) return null;
    return getLearnNudge(pathname, practice, visits ?? NO_VISITS);
  }

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
            "Check roles, FTE and competency levels below. When your staff list looks right, continue.",
          action: "staff-reviewed",
          actionLabel: "Staff look good — continue",
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
      if (pathname.startsWith("/staff")) {
        return {
          message: "Next: create a schedule period.",
          href: "/schedule",
          linkLabel: "Create schedule",
        };
      }
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
