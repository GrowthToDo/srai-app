import { db } from "@/db";
import { openShift, openShiftInterest, staff } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { findCandidatesForShift } from "@/lib/coverage/find-candidates";
import { logAuditEvent } from "@/lib/audit/logger";

/**
 * POST   /api/my/open-shifts/[id]/interest — raise a hand for an open shift.
 * DELETE /api/my/open-shifts/[id]/interest — withdraw a raised hand.
 *
 * Interest is NOT assignment: the manager sees raised hands on /open-shifts
 * and confirms the fill through the existing approve/fill flow — nurses never
 * self-assign (production spec P7). The server re-validates eligibility at
 * raise time so a stale board can't record a hand the engine would reject.
 */

function callerIdentity(request: Request) {
  return {
    role: request.headers.get("x-user-role"),
    staffId: request.headers.get("x-staff-id"),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { staffId } = callerIdentity(request);
  if (!staffId) {
    return NextResponse.json(
      { error: "Sign in as a nurse to raise a hand." },
      { status: 403 },
    );
  }

  const existing = db
    .select()
    .from(openShift)
    .where(eq(openShift.id, id))
    .get();
  if (!existing) {
    return NextResponse.json(
      { error: "Open shift not found" },
      { status: 404 },
    );
  }
  if (!["pending_approval", "approved"].includes(existing.status)) {
    return NextResponse.json(
      { error: "This open shift is no longer taking interest." },
      { status: 409 },
    );
  }
  if (existing.originalStaffId === staffId) {
    return NextResponse.json(
      { error: "This vacancy came from your own schedule." },
      { status: 409 },
    );
  }

  // Rule-eligibility gate — same engine the manager's recommendations use.
  const { candidates } = await findCandidatesForShift(
    existing.shiftId,
    existing.originalStaffId,
    Infinity,
  );
  if (!candidates.some((c) => c.staffId === staffId)) {
    return NextResponse.json(
      {
        error:
          "You're not eligible for this shift under the current rules (rest hours, weekly hours, or competency).",
      },
      { status: 422 },
    );
  }

  const already = db
    .select()
    .from(openShiftInterest)
    .where(
      and(
        eq(openShiftInterest.openShiftId, id),
        eq(openShiftInterest.staffId, staffId),
      ),
    )
    .get();
  if (already) {
    return NextResponse.json({ success: true, alreadyInterested: true });
  }

  const body = await request.json().catch(() => ({}));
  const inserted = db
    .insert(openShiftInterest)
    .values({
      openShiftId: id,
      staffId,
      note:
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : null,
    })
    .returning()
    .get();

  const staffRecord = db
    .select({ firstName: staff.firstName, lastName: staff.lastName })
    .from(staff)
    .where(eq(staff.id, staffId))
    .get();
  const staffName = staffRecord
    ? `${staffRecord.firstName} ${staffRecord.lastName}`
    : staffId;

  logAuditEvent({
    entityType: "open_shift",
    entityId: id,
    action: "open_shift_interest",
    description: `${staffName} raised a hand for this open shift`,
    newState: { interestId: inserted.id, staffId },
    performedBy: staffName,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { staffId } = callerIdentity(request);
  if (!staffId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = db
    .select()
    .from(openShiftInterest)
    .where(
      and(
        eq(openShiftInterest.openShiftId, id),
        eq(openShiftInterest.staffId, staffId),
      ),
    )
    .get();
  if (!existing) {
    return NextResponse.json({ success: true });
  }

  db.delete(openShiftInterest)
    .where(eq(openShiftInterest.id, existing.id))
    .run();

  const staffRecord = db
    .select({ firstName: staff.firstName, lastName: staff.lastName })
    .from(staff)
    .where(eq(staff.id, staffId))
    .get();
  const staffName = staffRecord
    ? `${staffRecord.firstName} ${staffRecord.lastName}`
    : staffId;

  logAuditEvent({
    entityType: "open_shift",
    entityId: id,
    action: "open_shift_interest_withdrawn",
    description: `${staffName} withdrew their hand for this open shift`,
    previousState: { interestId: existing.id, staffId },
    performedBy: staffName,
  });

  return NextResponse.json({ success: true });
}
