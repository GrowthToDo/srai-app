import { db } from "@/db";
import {
  openShift,
  openShiftInterest,
  shift,
  shiftDefinition,
} from "@/db/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { findCandidatesForShift } from "@/lib/coverage/find-candidates";

/**
 * GET /api/my/open-shifts — the nurse-facing open-shift board.
 *
 * Returns ONLY open shifts the calling nurse is rule-eligible to cover:
 * eligibility is the engine's own candidate computation (full list, not the
 * manager's top-3 — visibility is not a recommendation). A nurse never sees a
 * shift the system would refuse to assign them. Interest state rides along so
 * the UI can render raise/withdraw without a second call.
 *
 * Managers have their own richer surface (/open-shifts); this endpoint is
 * nurse-role only by design — without a staff identity there is nothing to be
 * eligible AS.
 */
export async function GET(request: Request) {
  const callerStaffId = request.headers.get("x-staff-id");
  if (!callerStaffId) {
    return NextResponse.json([]);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Board shows fillable postings only: pending_approval + approved. Filled,
  // cancelled and no_candidates are done deals.
  const rows = db
    .select({
      id: openShift.id,
      shiftId: openShift.shiftId,
      originalStaffId: openShift.originalStaffId,
      reason: openShift.reason,
      status: openShift.status,
      priority: openShift.priority,
      shiftDate: shift.date,
      shiftType: shiftDefinition.shiftType,
      shiftName: shiftDefinition.name,
      startTime: shiftDefinition.startTime,
      endTime: shiftDefinition.endTime,
      unit: shiftDefinition.unit,
    })
    .from(openShift)
    .innerJoin(shift, eq(openShift.shiftId, shift.id))
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .where(
      and(
        inArray(openShift.status, ["pending_approval", "approved"]),
        gte(shift.date, today),
      ),
    )
    .orderBy(shift.date)
    .all();

  // A nurse never sees their own vacated shift as pick-up-able.
  const candidateRows = rows.filter((r) => r.originalStaffId !== callerStaffId);

  // Eligibility per posting via the engine (few open shifts at CAH scale, so
  // per-request recomputation is cheap and always current — a stored snapshot
  // would go stale as the week's hours accumulate).
  const eligible: typeof candidateRows = [];
  for (const r of candidateRows) {
    const { candidates } = await findCandidatesForShift(
      r.shiftId,
      r.originalStaffId,
      Infinity,
    );
    if (candidates.some((c) => c.staffId === callerStaffId)) {
      eligible.push(r);
    }
  }

  const interests =
    eligible.length > 0
      ? db
          .select({
            openShiftId: openShiftInterest.openShiftId,
            staffId: openShiftInterest.staffId,
          })
          .from(openShiftInterest)
          .where(
            inArray(
              openShiftInterest.openShiftId,
              eligible.map((r) => r.id),
            ),
          )
          .all()
      : [];

  return NextResponse.json(
    eligible.map((r) => ({
      id: r.id,
      shiftId: r.shiftId,
      date: r.shiftDate,
      shiftType: r.shiftType,
      shiftName: r.shiftName,
      startTime: r.startTime,
      endTime: r.endTime,
      unit: r.unit,
      priority: r.priority,
      interested: interests.some(
        (i) => i.openShiftId === r.id && i.staffId === callerStaffId,
      ),
      interestCount: interests.filter((i) => i.openShiftId === r.id).length,
    })),
  );
}
