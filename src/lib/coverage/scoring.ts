import { db } from "@/db";
import { callout, openShift } from "@/db/schema";
import { and, eq, gte, isNotNull } from "drizzle-orm";

/**
 * Shared "best pick" scoring adjustments — one brain for both rankers.
 *
 * The callout escalation list (src/lib/callout/escalation.ts) and the
 * open-shift recommendations (src/lib/coverage/find-candidates.ts) grew as
 * parallel implementations and drifted (the PRN-availability gap was found
 * exactly there, 2026-08-15). Everything ADDED to candidate scoring from now
 * on lives here so the two surfaces cannot disagree about what "better"
 * means.
 *
 * Design rule carried over from both rankers: penalties are explainable and
 * every applied penalty emits a human-readable note — the DON must always be
 * able to see WHY someone ranked down. No black boxes.
 *
 * Weights are FIRST-PASS values (founder-approved direction, 2026-08-15) and
 * deliberately sized as tie-breakers within a competency level (10 pts/level)
 * rather than safety overrides: fatigue and fairness reorder comparable
 * nurses; they never promote an under-qualified one.
 *
 * Cost note: hourly rates are deliberately not modeled (founder policy — all
 * cost claims stay in hours). "Cheaper" therefore means fewer projected
 * overtime hours; the escalation order (float → PRN → OT → agency) and the
 * straight-time-first sort remain the primary cost structure.
 */

export const SOURCE_BONUS: Record<string, number> = {
  float: 30,
  per_diem: 20,
  overtime: 10,
  agency: 0,
};

/** How far back a covered callout / filled open shift counts as "recent". */
export const FAIRNESS_WINDOW_DAYS = 14;

export interface AdjustmentInput {
  /** Hours of rest before this shift, when known (undefined = 24h+). */
  restHoursBefore?: number;
  /** Consecutive working days ending the day before this shift. */
  consecutiveDaysBeforeShift: number;
  /** Weekend shifts already assigned in the current schedule period. */
  weekendsThisPeriod: number;
  /** Coverage pickups (callouts covered + open shifts filled) in the window. */
  recentPickups: number;
  /** Current scheduled hours this week. */
  hoursThisWeek: number;
  /** Duration of the shift being covered. */
  durationHours: number;
}

export interface Adjustment {
  delta: number;
  notes: string[];
}

/**
 * Fatigue + fairness + OT-cost adjustment, applied on top of the base score.
 *
 * - Short turnaround (10–12h rest): legal but rough — rank down, don't hide.
 * - Consecutive days: from day 4 onward each day costs more; a nurse on a
 *   long run stops being the "best" pick even at equal competency.
 * - Weekend load: 3rd+ weekend this period ranks down (mirrors the
 *   generator's weekend-fairness rule).
 * - Recent pickups: whoever covered for the unit most recently yields the
 *   top spot — spreads the asks instead of burning out the reliable one.
 * - OT hours: WITHIN the overtime tier (both rankers already sort
 *   straight-time first), fewer projected OT hours ranks higher — 4h of OT
 *   is cheaper than 12h.
 */
export function bestPickAdjustment(input: AdjustmentInput): Adjustment {
  let delta = 0;
  const notes: string[] = [];

  if (input.restHoursBefore !== undefined && input.restHoursBefore < 12) {
    delta -= 8;
    notes.push(
      `Short turnaround — ${Math.round(input.restHoursBefore)}h rest before this shift (ranked down)`,
    );
  }

  const daysBeyond = Math.max(0, input.consecutiveDaysBeforeShift - 3);
  if (daysBeyond > 0) {
    const penalty = Math.min(daysBeyond * 5, 15);
    delta -= penalty;
    notes.push(
      `${input.consecutiveDaysBeforeShift} consecutive days already — this would be day ${input.consecutiveDaysBeforeShift + 1} (ranked down)`,
    );
  }

  const weekendsBeyond = Math.max(0, input.weekendsThisPeriod - 2);
  if (weekendsBeyond > 0) {
    const penalty = Math.min(weekendsBeyond * 3, 6);
    delta -= penalty;
    notes.push(
      `${input.weekendsThisPeriod} weekends already worked this period (ranked down)`,
    );
  }

  if (input.recentPickups > 0) {
    const penalty = Math.min(input.recentPickups * 6, 12);
    delta -= penalty;
    notes.push(
      `Covered ${input.recentPickups} extra shift${input.recentPickups > 1 ? "s" : ""} in the last ${FAIRNESS_WINDOW_DAYS} days — rotating the ask`,
    );
  }

  // No note for the OT-hours penalty: both surfaces already present overtime
  // as a con/badge in their UI (a design contract pinned by the escalation
  // tests — "OT is a con, not a reason"). The penalty only ORDERS candidates
  // within the OT tier: 4h of overtime outranks 12h.
  const otHours = Math.max(0, input.hoursThisWeek + input.durationHours - 40);
  if (otHours > 0) {
    delta -= Math.min(otHours, 12);
  }

  return { delta, notes };
}

/**
 * Coverage pickups by this nurse in the fairness window: callouts they
 * covered (replacementStaffId, resolved) plus open shifts they filled.
 * Window is relative to NOW — this feeds a live ops ranking, not a
 * historical report.
 */
export function countRecentPickups(staffId: string): number {
  const since = new Date(
    Date.now() - FAIRNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const coveredCallouts = db
    .select({ id: callout.id })
    .from(callout)
    .where(
      and(
        eq(callout.replacementStaffId, staffId),
        isNotNull(callout.resolvedAt),
        gte(callout.resolvedAt, since),
      ),
    )
    .all().length;

  const filledOpenShifts = db
    .select({ id: openShift.id })
    .from(openShift)
    .where(
      and(
        eq(openShift.filledByStaffId, staffId),
        isNotNull(openShift.filledAt),
        gte(openShift.filledAt, since),
      ),
    )
    .all().length;

  return coveredCallouts + filledOpenShifts;
}
