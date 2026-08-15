/**
 * bestPickAdjustment — the shared fatigue/fairness/OT-cost brain both rankers
 * use (founder direction 2026-08-15: "sometimes the best pick can be better").
 *
 * Contract pinned here:
 * - every applied penalty emits a human-readable note (no silent ranking)
 * - penalties are tie-breaker sized, capped, and only fire past thresholds
 * - a fresh, fair, straight-time candidate gets delta 0 and no notes
 */
import { describe, it, expect, vi } from "vitest";

// countRecentPickups touches the DB; bestPickAdjustment must stay pure. Mock
// @/db so importing the module never opens a SQLite file in unit tests.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ callout: {}, openShift: {} }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  isNotNull: vi.fn(),
}));

import { bestPickAdjustment } from "@/lib/coverage/scoring";

const fresh = {
  restHoursBefore: undefined,
  consecutiveDaysBeforeShift: 0,
  weekendsThisPeriod: 0,
  recentPickups: 0,
  hoursThisWeek: 24,
  durationHours: 12,
};

describe("bestPickAdjustment", () => {
  it("fresh, fair, straight-time candidate: no adjustment, no notes", () => {
    const adj = bestPickAdjustment(fresh);
    expect(adj.delta).toBe(0);
    expect(adj.notes).toEqual([]);
  });

  it("short turnaround (10-12h rest) ranks down with a note", () => {
    const adj = bestPickAdjustment({ ...fresh, restHoursBefore: 11 });
    expect(adj.delta).toBe(-8);
    expect(adj.notes[0]).toContain("Short turnaround");
  });

  it("12h+ rest is not penalized", () => {
    expect(bestPickAdjustment({ ...fresh, restHoursBefore: 12 }).delta).toBe(0);
  });

  it("consecutive days penalize from day 4 and cap", () => {
    expect(
      bestPickAdjustment({ ...fresh, consecutiveDaysBeforeShift: 3 }).delta,
    ).toBe(0);
    expect(
      bestPickAdjustment({ ...fresh, consecutiveDaysBeforeShift: 4 }).delta,
    ).toBe(-5);
    expect(
      bestPickAdjustment({ ...fresh, consecutiveDaysBeforeShift: 5 }).delta,
    ).toBe(-10);
    // Cap: day 10 straight is not linearly worse than day 6
    expect(
      bestPickAdjustment({ ...fresh, consecutiveDaysBeforeShift: 9 }).delta,
    ).toBe(-15);
  });

  it("weekend load penalizes from the 3rd weekend and caps", () => {
    expect(bestPickAdjustment({ ...fresh, weekendsThisPeriod: 2 }).delta).toBe(
      0,
    );
    expect(bestPickAdjustment({ ...fresh, weekendsThisPeriod: 3 }).delta).toBe(
      -3,
    );
    expect(bestPickAdjustment({ ...fresh, weekendsThisPeriod: 6 }).delta).toBe(
      -6,
    );
  });

  it("recent pickups rotate the ask (capped)", () => {
    const one = bestPickAdjustment({ ...fresh, recentPickups: 1 });
    expect(one.delta).toBe(-6);
    expect(one.notes[0]).toContain("rotating the ask");
    expect(bestPickAdjustment({ ...fresh, recentPickups: 5 }).delta).toBe(-12);
  });

  it("OT hours cost proportionally: 4h OT is cheaper than 12h OT", () => {
    // 38h + 12h shift = 10 OT hours
    const tenOt = bestPickAdjustment({ ...fresh, hoursThisWeek: 38 });
    expect(tenOt.delta).toBe(-10);
    // No note: OT is presented as a con/badge by the UIs (escalation design
    // contract) — the penalty only orders candidates within the OT tier.
    expect(tenOt.notes).toEqual([]);
    // 30h + 12h = 2 OT hours — cheaper, smaller penalty
    expect(bestPickAdjustment({ ...fresh, hoursThisWeek: 30 }).delta).toBe(-2);
    // 20h + 12h = 32h — no OT, no penalty
    expect(bestPickAdjustment({ ...fresh, hoursThisWeek: 20 }).delta).toBe(0);
  });

  it("penalties stack; every non-OT penalty has a note", () => {
    const adj = bestPickAdjustment({
      restHoursBefore: 10.5,
      consecutiveDaysBeforeShift: 5,
      weekendsThisPeriod: 3,
      recentPickups: 1,
      hoursThisWeek: 36,
      durationHours: 12,
    });
    // -8 rest, -10 consecutive, -3 weekend, -6 pickup, -8 OT hours
    expect(adj.delta).toBe(-35);
    expect(adj.notes).toHaveLength(4);
  });
});
