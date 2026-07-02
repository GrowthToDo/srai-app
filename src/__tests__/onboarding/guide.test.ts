/**
 * Unit tests for the pure First-Cycle Guide derivation (src/lib/onboarding/guide.ts).
 *
 * These lock the stage machine: the ordered, first-match-wins derivation and the
 * page-aware nudge copy. The key invariants under test are (1) S3/S4 key on the
 * *active* schedule's own assignments, not the global generatedCount, and (2) the
 * `celebrated` latch is sticky — unpublishing after the first publish never
 * resurrects the earlier stages.
 */

import { describe, it, expect } from "vitest";
import {
  deriveGuide,
  getNudge,
  learnProgress,
  nextIncompleteStep,
  LEARN_STEPS,
  type OnboardingCounts,
  type GuideFlags,
  type PracticeStatus,
  type LearnVisitFlags,
} from "@/lib/onboarding/guide";

const noFlags: GuideFlags = {
  staffReviewed: false,
  celebrated: false,
  dismissed: false,
};

function counts(overrides: Partial<OnboardingCounts> = {}): OnboardingCounts {
  return {
    staffCount: 10,
    unitsCount: 2,
    scheduleCount: 0,
    generatedCount: 0,
    publishedCount: 0,
    activeSchedule: null,
    ...overrides,
  };
}

const draftEmpty = { id: "sch-1", status: "draft", hasAssignments: false };
const draftFilled = { id: "sch-1", status: "draft", hasAssignments: true };
const publishedSched = { id: "sch-1", status: "published", hasAssignments: true };

describe("deriveGuide — happy path per stage", () => {
  it("S0 when no staff", () => {
    const g = deriveGuide(counts({ staffCount: 0 }), noFlags);
    expect(g.stage).toBe("S0");
    expect(g.beaconHref).toBe("/setup");
  });

  it("S0 when no units", () => {
    const g = deriveGuide(counts({ unitsCount: 0 }), noFlags);
    expect(g.stage).toBe("S0");
    expect(g.beaconHref).toBe("/setup");
  });

  it("S1 when staff imported but not reviewed", () => {
    const g = deriveGuide(counts(), noFlags);
    expect(g.stage).toBe("S1");
    expect(g.beaconHref).toBe("/staff");
  });

  it("S2 when staff reviewed but no schedule", () => {
    const g = deriveGuide(counts({ scheduleCount: 0 }), { ...noFlags, staffReviewed: true });
    expect(g.stage).toBe("S2");
    expect(g.beaconHref).toBe("/schedule");
  });

  it("S3 when active schedule exists but is empty (generate)", () => {
    const g = deriveGuide(
      counts({ scheduleCount: 1, activeSchedule: draftEmpty }),
      { ...noFlags, staffReviewed: true }
    );
    expect(g.stage).toBe("S3");
    expect(g.beaconHref).toBe("/schedule");
    expect(g.dot).toBe("generate");
    expect(g.activeScheduleId).toBe("sch-1");
  });

  it("S4 when active schedule is generated but not published (publish)", () => {
    const g = deriveGuide(
      counts({ scheduleCount: 1, generatedCount: 1, activeSchedule: draftFilled }),
      { ...noFlags, staffReviewed: true }
    );
    expect(g.stage).toBe("S4");
    expect(g.beaconHref).toBe("/schedule");
    expect(g.dot).toBe("publish");
  });

  it("S5 when first schedule published, not yet celebrated (celebration)", () => {
    const g = deriveGuide(
      counts({ scheduleCount: 1, publishedCount: 1, activeSchedule: publishedSched }),
      { ...noFlags, staffReviewed: true }
    );
    expect(g.stage).toBe("S5");
    expect(g.showCelebration).toBe(true);
    expect(g.beaconHref).toBeNull();
  });

  it("S6 once celebrated (Learn card)", () => {
    const g = deriveGuide(
      counts({ scheduleCount: 1, publishedCount: 1, activeSchedule: publishedSched }),
      { ...noFlags, staffReviewed: true, celebrated: true }
    );
    expect(g.stage).toBe("S6");
    expect(g.showLearn).toBe(true);
    expect(g.beaconHref).toBeNull();
  });

  it("S7 fallback: schedule exists but activeSchedule is null", () => {
    const g = deriveGuide(
      counts({ scheduleCount: 3, activeSchedule: null }),
      { ...noFlags, staffReviewed: true }
    );
    expect(g.stage).toBe("S7");
    expect(g.beaconHref).toBeNull();
    expect(g.dot).toBeNull();
  });
});

describe("deriveGuide — edge cases", () => {
  it("brand-new empty schedule while an older one has assignments → S3, not S4/S6", () => {
    // Global generatedCount is high (old schedule generated), but the *active*
    // (newest) schedule is empty → must land on generate this one.
    const g = deriveGuide(
      counts({ scheduleCount: 2, generatedCount: 1, activeSchedule: draftEmpty }),
      { ...noFlags, staffReviewed: true }
    );
    expect(g.stage).toBe("S3");
    expect(g.dot).toBe("generate");
  });

  it("manual assignments (no generator run) → S4 via hasAssignments", () => {
    // generatedCount stays 0 (generator never ran), but the active schedule has
    // manually-added assignments → publish stage.
    const g = deriveGuide(
      counts({ scheduleCount: 1, generatedCount: 0, activeSchedule: draftFilled }),
      { ...noFlags, staffReviewed: true }
    );
    expect(g.stage).toBe("S4");
    expect(g.dot).toBe("publish");
  });

  it("publish → unpublish with celebrated=true stays S6 (sticky latch)", () => {
    // Schedule was unpublished (status draft, publishedCount 0) but celebrated
    // latched → never resurrect S3/S4/S5.
    const g = deriveGuide(
      counts({ scheduleCount: 1, publishedCount: 0, activeSchedule: draftFilled }),
      { ...noFlags, staffReviewed: true, celebrated: true }
    );
    expect(g.stage).toBe("S6");
    expect(g.beaconHref).toBeNull();
  });

  it("flags reset + small counts returns to S0", () => {
    const g = deriveGuide(counts({ staffCount: 0, unitsCount: 0 }), noFlags);
    expect(g.stage).toBe("S0");
  });

  it("flags reset with imported data returns to S1", () => {
    const g = deriveGuide(counts(), noFlags);
    expect(g.stage).toBe("S1");
  });

  it("dismissed is exposed on the guide but derivation still runs", () => {
    // S5 must still latch even while dismissed so the celebration surface can
    // decide; dismissed only suppresses beacon/dot/nudge surfaces.
    const g = deriveGuide(
      counts({ scheduleCount: 1, publishedCount: 1, activeSchedule: publishedSched }),
      { ...noFlags, staffReviewed: true, dismissed: true }
    );
    expect(g.dismissed).toBe(true);
    expect(g.stage).toBe("S5");
    expect(g.showCelebration).toBe(true);
  });
});

describe("getNudge — copy per stage/page", () => {
  it("S0 on /setup returns the import prompt", () => {
    const n = getNudge("S0", "/setup", null);
    expect(n?.message).toContain("Import your roster");
  });

  it("S1 on /staff returns the staff-reviewed confirmation action", () => {
    const n = getNudge("S1", "/staff", null);
    expect(n?.action).toBe("staff-reviewed");
    expect(n?.actionLabel).toBe("Staff look good — continue");
    // Confirmation nudge is an explicit action, not a passive link.
    expect(n?.href).toBeUndefined();
  });

  it("S2 on /staff points to create a schedule", () => {
    const n = getNudge("S2", "/staff", null);
    expect(n?.href).toBe("/schedule");
    expect(n?.linkLabel).toBe("Create schedule");
  });

  it("S1 on another page points back to staff", () => {
    const n = getNudge("S1", "/dashboard", null);
    expect(n?.href).toBe("/staff");
    expect(n?.linkLabel).toBe("Go to Staff");
  });

  it("S1 on /setup returns null", () => {
    expect(getNudge("S1", "/setup", null)).toBeNull();
  });

  it("S3 on the schedule detail page prompts Generate", () => {
    const n = getNudge("S3", "/schedule/sch-1", "sch-1");
    expect(n?.message).toContain("Generate Schedule");
  });

  it("S4 on a list/scenarios page links to the active schedule", () => {
    const n = getNudge("S4", "/scenarios", "sch-9");
    expect(n?.href).toBe("/schedule/sch-9");
    expect(n?.linkLabel).toBe("Open schedule");
  });

  it("returns null for stages with no page-relevant copy", () => {
    expect(getNudge("S5", "/dashboard", null)).toBeNull();
    expect(getNudge("S6", "/schedule", null)).toBeNull();
    expect(getNudge("S7", "/schedule", null)).toBeNull();
  });
});

describe("consistency — nudge targets never contradict the beacon (S0–S4)", () => {
  const cases: { stage: "S0" | "S1" | "S2" | "S3" | "S4"; o: OnboardingCounts; f: GuideFlags }[] = [
    { stage: "S0", o: counts({ staffCount: 0 }), f: noFlags },
    { stage: "S1", o: counts(), f: noFlags },
    { stage: "S2", o: counts({ scheduleCount: 0 }), f: { ...noFlags, staffReviewed: true } },
    { stage: "S3", o: counts({ scheduleCount: 1, activeSchedule: draftEmpty }), f: { ...noFlags, staffReviewed: true } },
    { stage: "S4", o: counts({ scheduleCount: 1, activeSchedule: draftFilled }), f: { ...noFlags, staffReviewed: true } },
  ];

  it("every S0–S4 nudge href resolves to a real target and matches its stage", () => {
    for (const { stage, o, f } of cases) {
      const g = deriveGuide(o, f);
      expect(g.stage).toBe(stage);
      // A page where this stage has a link-bearing nudge: the href must be a
      // concrete route, never contradict the beacon by pointing "backwards".
      // S1 nudge on a neutral page points to /staff (== beacon).
      if (stage === "S1") {
        const n = getNudge(stage, "/dashboard", g.activeScheduleId);
        expect(n?.href).toBe(g.beaconHref);
      }
      // S4 nudge on scenarios points to the active schedule detail, which lives
      // under the beacon's /schedule surface.
      if (stage === "S4") {
        const n = getNudge(stage, "/scenarios", g.activeScheduleId);
        expect(n?.href).toBe(`/schedule/${g.activeScheduleId}`);
        expect(g.beaconHref).toBe("/schedule");
      }
    }
  });
});

// ===========================================================================
// LEARN-PHASE GUIDED LOOP (S6)
// ===========================================================================

const noVisits: LearnVisitFlags = {
  callouts: false,
  openShifts: false,
  census: false,
  audit: false,
};

function practiceStatus(
  overrides: Partial<PracticeStatus["items"]> = {},
  active = true
): PracticeStatus {
  return {
    active,
    items: {
      leaveA: { id: "la", status: "pending" },
      leaveB: { id: "lb", status: "pending" },
      swap: { id: "sw", status: "pending" },
      generatedCallout: null,
      generatedOpenShift: null,
      ...overrides,
    },
  };
}

const celebrated: GuideFlags = { staffReviewed: true, celebrated: true, dismissed: false };
const s6Counts = counts({
  scheduleCount: 1,
  publishedCount: 1,
  activeSchedule: publishedSched,
});

describe("learnProgress — step completion mapping", () => {
  it("nothing done when practice fresh (all pending, no generated records)", () => {
    const p = learnProgress(practiceStatus(), noVisits);
    expect(p.completedCount).toBe(0);
    expect(p.next).toBe("leave");
    expect(p.allComplete).toBe(false);
  });

  it("leave step needs BOTH practice leaves approved", () => {
    const oneApproved = learnProgress(
      practiceStatus({ leaveA: { id: "la", status: "approved" } }),
      noVisits
    );
    expect(oneApproved.done.leave).toBe(false);

    const bothApproved = learnProgress(
      practiceStatus({
        leaveA: { id: "la", status: "approved" },
        leaveB: { id: "lb", status: "approved" },
      }),
      noVisits
    );
    expect(bothApproved.done.leave).toBe(true);
    expect(bothApproved.next).toBe("callouts");
  });

  it("callouts step: generated callout must exist AND be visited/acted", () => {
    // Exists but not visited and still open → not done.
    const notYet = learnProgress(
      practiceStatus({ generatedCallout: { id: "c", status: "open" } }),
      noVisits
    );
    expect(notYet.done.callouts).toBe(false);

    // Visited → done.
    const visited = learnProgress(
      practiceStatus({ generatedCallout: { id: "c", status: "open" } }),
      { ...noVisits, callouts: true }
    );
    expect(visited.done.callouts).toBe(true);

    // Acted on (status moved off "open") → done even without a visit flag.
    const acted = learnProgress(
      practiceStatus({ generatedCallout: { id: "c", status: "filled" } }),
      noVisits
    );
    expect(acted.done.callouts).toBe(true);
  });

  it("open-shifts step: generated open shift must exist AND be visited/acted", () => {
    const notYet = learnProgress(
      practiceStatus({ generatedOpenShift: { id: "o", status: "pending_approval" } }),
      noVisits
    );
    expect(notYet.done["open-shifts"]).toBe(false);

    const acted = learnProgress(
      practiceStatus({ generatedOpenShift: { id: "o", status: "filled" } }),
      noVisits
    );
    expect(acted.done["open-shifts"]).toBe(true);
  });

  it("swap step done once the swap is no longer pending", () => {
    expect(learnProgress(practiceStatus({ swap: { id: "sw", status: "approved" } }), noVisits).done.swaps).toBe(true);
    expect(learnProgress(practiceStatus({ swap: { id: "sw", status: "denied" } }), noVisits).done.swaps).toBe(true);
    expect(learnProgress(practiceStatus({ swap: { id: "sw", status: "pending" } }), noVisits).done.swaps).toBe(false);
  });

  it("census + audit steps are visit-driven", () => {
    const p = learnProgress(practiceStatus(), { ...noVisits, census: true, audit: true });
    expect(p.done.census).toBe(true);
    expect(p.done.audit).toBe(true);
  });

  it("all six complete → allComplete, next null", () => {
    const p = learnProgress(
      practiceStatus({
        leaveA: { id: "la", status: "approved" },
        leaveB: { id: "lb", status: "approved" },
        generatedCallout: { id: "c", status: "filled" },
        generatedOpenShift: { id: "o", status: "filled" },
        swap: { id: "sw", status: "approved" },
      }),
      { callouts: true, openShifts: true, census: true, audit: true }
    );
    expect(p.completedCount).toBe(6);
    expect(p.allComplete).toBe(true);
    expect(p.next).toBeNull();
  });

  it("nextIncompleteStep walks the ordered steps", () => {
    // leave done → next callouts
    expect(
      nextIncompleteStep(
        practiceStatus({
          leaveA: { id: "la", status: "approved" },
          leaveB: { id: "lb", status: "approved" },
        }),
        noVisits
      )
    ).toBe("callouts");
  });
});

describe("deriveGuide S6 — beacon points at the next incomplete step", () => {
  it("practice not started → beacon points at the dashboard Learn card", () => {
    const g = deriveGuide(s6Counts, celebrated, practiceStatus({}, false), noVisits);
    expect(g.stage).toBe("S6");
    expect(g.beaconHref).toBe("/dashboard");
  });

  it("practice active, nothing done → beacon at /leave (step 1)", () => {
    const g = deriveGuide(s6Counts, celebrated, practiceStatus(), noVisits);
    expect(g.beaconHref).toBe("/leave");
  });

  it("beacon advances to /callouts after both leaves approved", () => {
    const g = deriveGuide(
      s6Counts,
      celebrated,
      practiceStatus({
        leaveA: { id: "la", status: "approved" },
        leaveB: { id: "lb", status: "approved" },
        generatedCallout: { id: "c", status: "open" },
      }),
      noVisits
    );
    expect(g.beaconHref).toBe("/callouts");
  });

  it("all steps complete → no beacon", () => {
    const g = deriveGuide(
      s6Counts,
      celebrated,
      practiceStatus({
        leaveA: { id: "la", status: "approved" },
        leaveB: { id: "lb", status: "approved" },
        generatedCallout: { id: "c", status: "filled" },
        generatedOpenShift: { id: "o", status: "filled" },
        swap: { id: "sw", status: "approved" },
      }),
      { callouts: true, openShifts: true, census: true, audit: true }
    );
    expect(g.beaconHref).toBeNull();
  });

  it("every LEARN_STEPS href is a real route the beacon can point at", () => {
    for (const step of LEARN_STEPS) {
      expect(step.href.startsWith("/")).toBe(true);
    }
    expect(LEARN_STEPS.map((s) => s.key)).toEqual([
      "leave",
      "callouts",
      "open-shifts",
      "swaps",
      "census",
      "audit",
    ]);
  });
});

describe("getNudge S6 — practice-aware copy per page", () => {
  it("suppressed entirely when practice is not active", () => {
    expect(getNudge("S6", "/leave", null, practiceStatus({}, false), noVisits)).toBeNull();
    expect(getNudge("S6", "/leave", null, null, noVisits)).toBeNull();
  });

  it("/leave before any approval prompts the short-notice one first with the 7-day threshold framing", () => {
    const n = getNudge("S6", "/leave", null, practiceStatus(), noVisits);
    expect(n?.message).toContain("short-notice");
    expect(n?.message).toContain("7-day callout threshold");
    expect(n?.message).toContain("Step 1 of 6");
  });

  it("/leave after Leave A approved explains the callout and points at the planned leave", () => {
    const n = getNudge(
      "S6",
      "/leave",
      null,
      practiceStatus({ leaveA: { id: "la", status: "approved" } }),
      noVisits
    );
    expect(n?.message).toContain("callout");
    expect(n?.message).toContain("open shift");
  });

  it("/leave after both approved points to Callouts", () => {
    const n = getNudge(
      "S6",
      "/leave",
      null,
      practiceStatus({
        leaveA: { id: "la", status: "approved" },
        leaveB: { id: "lb", status: "approved" },
      }),
      noVisits
    );
    expect(n?.href).toBe("/callouts");
    expect(n?.linkLabel).toBe("Go to Callouts");
  });

  it("a wander page during S6 pulls the manager to the current step", () => {
    const n = getNudge("S6", "/staff", null, practiceStatus(), noVisits);
    expect(n?.message).toContain("Practice in progress");
    expect(n?.href).toBe("/leave"); // next incomplete step
  });

  it("/census nudge teaches the tier lever, then advances to audit once visited", () => {
    const before = getNudge("S6", "/census", null, practiceStatus(), noVisits);
    expect(before?.message).toContain("census tier");
    const after = getNudge("S6", "/census", null, practiceStatus(), { ...noVisits, census: true });
    expect(after?.href).toBe("/audit");
  });

  it("/census walkthrough carries an explicit 'done' action (not auto-completed on visit)", () => {
    // The ①②③ walkthrough must stay on screen and offer an explicit completion
    // button — a mere-visit flag used to kill it instantly.
    const n = getNudge("S6", "/census", null, practiceStatus(), noVisits);
    expect(n?.action).toBe("learn-census-done");
    expect(n?.actionLabel).toBe("Done with census — continue");
    // ①②③ walkthrough copy is preserved.
    expect(n?.message).toContain("①");
    expect(n?.message).toContain("census tier");
  });

  it("/audit before completion offers the 'Finish tutorial' action (no dead end)", () => {
    const n = getNudge("S6", "/audit", null, practiceStatus(), noVisits);
    expect(n?.action).toBe("learn-audit-done");
    expect(n?.actionLabel).toBe("Finish tutorial — back to Dashboard");
    expect(n?.message).toContain("paper trail");
    expect(n?.message).toContain("Step 6 of 6");
  });

  it("/audit after completion points back to the dashboard, no action button", () => {
    const n = getNudge("S6", "/audit", null, practiceStatus(), { ...noVisits, audit: true });
    expect(n?.action).toBeUndefined();
    expect(n?.href).toBe("/dashboard");
    expect(n?.linkLabel).toBe("Back to Dashboard");
  });
});
