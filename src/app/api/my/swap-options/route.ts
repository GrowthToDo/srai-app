import { db } from "@/db";
import {
  staff,
  assignment,
  shift,
  shiftDefinition,
  schedule,
} from "@/db/schema";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { eligibleSwapColleagues } from "@/lib/swap/swap-options";

/**
 * GET /api/my/swap-options?assignmentId=<myAssignmentId>
 *
 * Nurse-facing. Given the session nurse and one of their own assignments,
 * returns colleagues eligible to swap with (active, SAME role, excluding self),
 * each with their upcoming assignments in published schedules over the next 35
 * days. Minimal payload — no sensitive fields.
 *
 * Ownership: the requesting nurse is identified from the x-staff-id header (set
 * by middleware when AUTH_ENABLED). The `assignmentId` must belong to that
 * nurse; a nurse cannot enumerate options for someone else's assignment. When
 * AUTH_ENABLED is off, the header is absent and the assignment's own staffId is
 * used as the requester identity (dev/open mode).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assignmentId = searchParams.get("assignmentId");

  if (!assignmentId) {
    return NextResponse.json(
      { error: "assignmentId query parameter is required" },
      { status: 400 }
    );
  }

  const myAssignment = db
    .select({ id: assignment.id, staffId: assignment.staffId })
    .from(assignment)
    .where(eq(assignment.id, assignmentId))
    .get();

  if (!myAssignment) {
    return NextResponse.json(
      { error: "Assignment not found" },
      { status: 404 }
    );
  }

  // Ownership: nurses may only request options for their OWN assignment.
  const role = request.headers.get("x-user-role");
  const callerStaffId = request.headers.get("x-staff-id");
  if (role === "nurse" && callerStaffId && myAssignment.staffId !== callerStaffId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requesterStaffId = myAssignment.staffId;
  const requester = db
    .select({ id: staff.id, role: staff.role })
    .from(staff)
    .where(eq(staff.id, requesterStaffId))
    .get();

  if (!requester) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  // Active staff pool, then filter to same-role colleagues (pure helper).
  const pool = db
    .select({ id: staff.id, firstName: staff.firstName, lastName: staff.lastName, role: staff.role, isActive: staff.isActive })
    .from(staff)
    .where(eq(staff.isActive, true))
    .all();

  const colleagues = eligibleSwapColleagues(
    { id: requester.id, role: requester.role },
    pool
  );

  if (colleagues.length === 0) {
    return NextResponse.json([]);
  }

  // Upcoming published assignments for the colleague pool: date in [today, +35d].
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + 35);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const colleagueIds = new Set(colleagues.map((c) => c.id));

  const rows = db
    .select({
      staffId: assignment.staffId,
      assignmentId: assignment.id,
      date: shift.date,
      shiftType: shiftDefinition.shiftType,
      startTime: shiftDefinition.startTime,
      endTime: shiftDefinition.endTime,
    })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .innerJoin(schedule, eq(assignment.scheduleId, schedule.id))
    .where(
      and(
        eq(schedule.status, "published"),
        eq(assignment.status, "assigned"),
        gte(shift.date, today),
        lte(shift.date, horizonStr),
        ne(assignment.id, assignmentId)
      )
    )
    .all();

  // Group upcoming assignments by colleague; drop rows outside the pool.
  const byStaff = new Map<string, { assignmentId: string; date: string; shiftType: string; startTime: string; endTime: string }[]>();
  for (const r of rows) {
    if (!colleagueIds.has(r.staffId)) continue;
    const list = byStaff.get(r.staffId) ?? [];
    list.push({
      assignmentId: r.assignmentId,
      date: r.date,
      shiftType: r.shiftType,
      startTime: r.startTime,
      endTime: r.endTime,
    });
    byStaff.set(r.staffId, list);
  }

  const result = colleagues.map((c) => ({
    staffId: c.id,
    name: `${c.firstName} ${c.lastName}`,
    role: c.role,
    assignments: (byStaff.get(c.id) ?? []).sort(
      (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
    ),
  }));

  return NextResponse.json(result);
}
