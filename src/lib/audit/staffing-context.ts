import { db } from "@/db";
import { shift, shiftDefinition, censusBand, assignment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEffectiveRequired } from "@/lib/analytics/effective-required";

export interface StaffingSnapshot {
  assigned: number;
  required: number;
  /** assigned - required. Positive = excess staff, negative = short. */
  delta: number;
}

/**
 * Current staffing position for one shift: how many people are actually on it
 * versus how many the census band requires right now.
 *
 * Counting rules are deliberately identical to the dashboard's overstaffed /
 * understaffed counters (`src/app/api/dashboard/route.ts`) — cancelled and
 * called_out assignments are excluded — so an audit line can never disagree
 * with the number the manager sees on screen.
 */
export function getStaffingSnapshot(shiftId: string): StaffingSnapshot | null {
  const s = db.select().from(shift).where(eq(shift.id, shiftId)).get();
  if (!s) return null;

  const def = db
    .select({
      unit: shiftDefinition.unit,
      requiredStaffCount: shiftDefinition.requiredStaffCount,
    })
    .from(shiftDefinition)
    .where(eq(shiftDefinition.id, s.shiftDefinitionId))
    .get();

  const bands = db
    .select()
    .from(censusBand)
    .where(eq(censusBand.isActive, true))
    .all();

  const base = s.requiredStaffCount ?? def?.requiredStaffCount ?? 0;
  const required = getEffectiveRequired(
    s.censusBandId,
    s.acuityLevel,
    def?.unit ?? null,
    s.actualCensus,
    base,
    bands,
  );

  const rows = db
    .select({ status: assignment.status })
    .from(assignment)
    .where(eq(assignment.shiftId, shiftId))
    .all();
  const assigned = rows.filter(
    (a) => a.status !== "cancelled" && a.status !== "called_out",
  ).length;

  return { assigned, required, delta: assigned - required };
}

/**
 * One-sentence staffing consequence, for appending to an audit description.
 *
 * Why this exists: an audit reader seeing "Census tier changed from yellow to
 * blue" cannot tell whether that mattered. Stating the resulting position — and
 * naming excess staff explicitly — is what makes the trail useful months later,
 * and is what ties a later send-home back to the census decision that caused it.
 *
 * Returns "" when the shift can't be resolved, so callers can append safely.
 */
export function describeStaffing(shiftId: string): string {
  const snap = getStaffingSnapshot(shiftId);
  if (!snap) return "";
  const { assigned, required, delta } = snap;
  const position =
    delta > 0
      ? `${delta} over requirement — excess staff, candidate for flex-home/VTO`
      : delta < 0
        ? `${Math.abs(delta)} short of requirement`
        : "staffing matches requirement";
  return ` — now ${assigned} assigned / ${required} required (${position})`;
}
