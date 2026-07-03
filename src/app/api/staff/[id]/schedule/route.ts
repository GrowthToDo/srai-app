import { db } from "@/db";
import { staff, assignment, shift, shiftDefinition, staffLeave, schedule } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: staffId } = await params;

  // Phase 1 ownership: a nurse may only read their OWN schedule. Identity comes
  // from the middleware headers; when absent (AUTH_ENABLED off) behavior is
  // unchanged from before.
  const role = request.headers.get("x-user-role");
  const callerStaffId = request.headers.get("x-staff-id");
  if (role === "nurse" && staffId !== callerStaffId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate query parameters are required" },
      { status: 400 }
    );
  }

  // Verify staff exists
  const staffRecord = db.select().from(staff).where(eq(staff.id, staffId)).get();
  if (!staffRecord) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  // Get all assignments for this staff in the date range
  const assignments = db
    .select({
      assignmentId: assignment.id,
      shiftId: shift.id,
      date: shift.date,
      shiftType: shiftDefinition.shiftType,
      shiftName: shiftDefinition.name,
      startTime: shiftDefinition.startTime,
      endTime: shiftDefinition.endTime,
      durationHours: shiftDefinition.durationHours,
      unit: shiftDefinition.unit,
      isChargeNurse: assignment.isChargeNurse,
      isOvertime: assignment.isOvertime,
      isFloat: assignment.isFloat,
      floatFromUnit: assignment.floatFromUnit,
      status: assignment.status,
      scheduleName: schedule.name,
      scheduleId: schedule.id,
    })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .innerJoin(schedule, eq(assignment.scheduleId, schedule.id))
    .where(
      and(
        eq(assignment.staffId, staffId),
        gte(shift.date, startDate),
        lte(shift.date, endDate)
      )
    )
    .all();

  // Get all approved leaves for this staff in the date range
  const leaves = db
    .select()
    .from(staffLeave)
    .where(
      and(
        eq(staffLeave.staffId, staffId),
        eq(staffLeave.status, "approved"),
        lte(staffLeave.startDate, endDate),
        gte(staffLeave.endDate, startDate)
      )
    )
    .all();

  // Build a day-by-day map
  const dayData: Record<string, {
    date: string;
    shifts: typeof assignments;
    leave: typeof leaves[0] | null;
  }> = {};

  // Initialize all days in range
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0];
    dayData[dateStr] = { date: dateStr, shifts: [], leave: null };
    current.setDate(current.getDate() + 1);
  }

  // Add assignments
  for (const a of assignments) {
    if (dayData[a.date]) {
      dayData[a.date].shifts.push(a);
    }
  }

  // Add leaves (check date range for multi-day leaves)
  for (const l of leaves) {
    const leaveStart = new Date(l.startDate);
    const leaveEnd = new Date(l.endDate);
    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);

    const effectiveStart = leaveStart > rangeStart ? leaveStart : rangeStart;
    const effectiveEnd = leaveEnd < rangeEnd ? leaveEnd : rangeEnd;

    const d = new Date(effectiveStart);
    while (d <= effectiveEnd) {
      const dateStr = d.toISOString().split("T")[0];
      if (dayData[dateStr]) {
        dayData[dateStr].leave = l;
      }
      d.setDate(d.getDate() + 1);
    }
  }

  return NextResponse.json({
    staffId,
    staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
    startDate,
    endDate,
    days: Object.values(dayData).sort((a, b) => a.date.localeCompare(b.date)),
  });
}
