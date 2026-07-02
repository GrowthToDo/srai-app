import { db } from "@/db";
import { staffLeave, openShift, callout, shiftSwapRequest, staff, prnAvailability, unit, schedule, assignment } from "@/db/schema";
import { eq, or, count, countDistinct, and, ne, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const pendingLeave = db
    .select({ count: count() })
    .from(staffLeave)
    .where(eq(staffLeave.status, "pending"))
    .get();

  const pendingOpenShifts = db
    .select({ count: count() })
    .from(openShift)
    .where(or(eq(openShift.status, "pending_approval"), eq(openShift.status, "no_candidates")))
    .get();

  const openCallouts = db
    .select({ count: count() })
    .from(callout)
    .where(eq(callout.status, "open"))
    .get();

  const pendingSwaps = db
    .select({ count: count() })
    .from(shiftSwapRequest)
    .where(eq(shiftSwapRequest.status, "pending"))
    .get();

  const prnStaff = db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.isActive, true), eq(staff.employmentType, "per_diem")))
    .all();

  const submittedPrnIds = new Set(
    db.select({ staffId: prnAvailability.staffId }).from(prnAvailability).all().map((r) => r.staffId)
  );
  const prnMissingCount = prnStaff.filter((s) => !submittedPrnIds.has(s.id)).length;

  // Onboarding progress — drives the sidebar "next step" beacon until the
  // manager completes one full cycle (first published schedule).
  const staffCount = db.select({ count: count() }).from(staff).where(eq(staff.isActive, true)).get();
  const unitsCount = db.select({ count: count() }).from(unit).where(eq(unit.isActive, true)).get();
  const scheduleCount = db.select({ count: count() }).from(schedule).get();
  const publishedCount = db
    .select({ count: count() })
    .from(schedule)
    .where(eq(schedule.status, "published"))
    .get();
  // Schedules that have at least one assignment — i.e. generation has been run.
  const generatedCount = db
    .select({ count: countDistinct(assignment.scheduleId) })
    .from(assignment)
    .get();

  // Newest non-archived schedule drives the first-cycle guide's S3/S4 stages.
  // hasAssignments keys on *this* schedule's own rows, so a fresh empty schedule
  // stays at "generate" even if an older schedule already has assignments.
  const newestSchedule = db
    .select({ id: schedule.id, status: schedule.status })
    .from(schedule)
    .where(ne(schedule.status, "archived"))
    .orderBy(desc(schedule.createdAt))
    .get();

  let activeSchedule: { id: string; status: string; hasAssignments: boolean } | null = null;
  if (newestSchedule) {
    const assignmentForSchedule = db
      .select({ count: count() })
      .from(assignment)
      .where(eq(assignment.scheduleId, newestSchedule.id))
      .get();
    activeSchedule = {
      id: newestSchedule.id,
      status: newestSchedule.status,
      hasAssignments: (assignmentForSchedule?.count ?? 0) > 0,
    };
  }

  return NextResponse.json({
    pendingLeaveCount: pendingLeave?.count ?? 0,
    openShiftsCount: pendingOpenShifts?.count ?? 0,
    openCallouts: openCallouts?.count ?? 0,
    pendingSwapsCount: pendingSwaps?.count ?? 0,
    prnMissingCount,
    onboarding: {
      staffCount: staffCount?.count ?? 0,
      unitsCount: unitsCount?.count ?? 0,
      scheduleCount: scheduleCount?.count ?? 0,
      generatedCount: generatedCount?.count ?? 0,
      publishedCount: publishedCount?.count ?? 0,
      activeSchedule,
    },
  });
}
