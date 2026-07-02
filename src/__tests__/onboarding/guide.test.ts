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
  type OnboardingCounts,
  type GuideFlags,
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
