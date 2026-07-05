import { db, sqlite, schema } from "@/db";
import { and, eq, ne } from "drizzle-orm";
import { seedDatabase } from "@/db/seed-core";
import { provisionAuthUsers } from "@/lib/auth/provision-users";
import { runGenerationJob } from "@/lib/engine/scheduler/runner";
import { buildShiftInserts } from "@/lib/schedules/build-shifts";
import { getWeekStart, addDays } from "@/lib/date/week";
import {
  insertNotification,
  composeSchedulePublished,
} from "@/lib/notifications/notify";

const {
  schedule,
  shiftDefinition,
  shift,
  censusBand,
  assignment,
  generationJob,
  shiftSwapRequest,
  exceptionLog,
  notification,
} = schema;

const DEMO_UNIT = "ICU";
// Mirrors the unit's own schedulePeriodWeeks (6) seeded in seed-core.ts.
const DEMO_SCHEDULE_WEEKS = 6;

/**
 * Restores the demo instance to pristine: full reseed, demo logins, one
 * freshly generated + published 6-week schedule, one pending swap request.
 * DEMO-ONLY: callers must gate on DEMO_MODE (the API route does).
 */
export async function resetDemoData(): Promise<{ scheduleId: string }> {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error(
      "resetDemoData is demo-only: refusing to run without DEMO_MODE=true",
    );
  }

  // 1. Wipe + reseed the full test dataset (units, staff, rules, a draft
  // schedule with manual assignments, etc). Extracted from db:seed so this
  // reset endpoint can reuse it — see src/db/seed-core.ts.
  await seedDatabase(sqlite, db);

  // 2. Auth accounts (manager + 2 demo nurses) — the single source of all 3
  // demo logins, kept in sync with DEMO-LOGINS.md. seedDatabase no longer
  // creates user rows itself (Task 1 fix), so this is required every reset.
  provisionAuthUsers(db);

  // seedDatabase's own dataset includes a draft schedule with manual
  // assignments, callouts, and 3 swap requests (fixtures for the non-demo
  // test dataset). The demo showroom needs exactly ONE schedule (the
  // generated+published one below) and exactly ONE pending swap, so remove
  // seedDatabase's draft schedule and its dependents first. Same FK-safe
  // order seedDatabase itself uses to wipe (shift_swap_request/callout have
  // no ON DELETE CASCADE on assignment.id, so they must go before it).
  sqlite.exec(`
    DELETE FROM shift_swap_request;
    DELETE FROM callout;
    DELETE FROM assignment;
    DELETE FROM schedule;
  `);

  // 3. Insert a schedule row mirroring POST /api/schedules exactly: fields,
  // shift-instance generation via buildShiftInserts, and the audit log entry.
  // A 6-week period starting at the current week's Monday (getWeekStart —
  // never hand-rolled getDay() arithmetic) keeps the demo schedule "current"
  // no matter when the reset runs.
  const todayStr = new Date().toISOString().slice(0, 10);
  const startDate = getWeekStart(todayStr);
  const endDate = addDays(startDate, DEMO_SCHEDULE_WEEKS * 7 - 1);

  const newSchedule = db
    .insert(schedule)
    .values({
      name: "Demo Schedule",
      startDate,
      endDate,
      unit: DEMO_UNIT,
      status: "draft",
      notes: "Demo showroom schedule — recreated on every reset.",
    })
    .returning()
    .get();
  const scheduleId = newSchedule.id;

  const definitions = db
    .select()
    .from(shiftDefinition)
    .where(
      and(
        eq(shiftDefinition.unit, DEMO_UNIT),
        eq(shiftDefinition.isActive, true),
      ),
    )
    .all();

  const greenBand = db
    .select()
    .from(censusBand)
    .where(
      and(
        eq(censusBand.unit, DEMO_UNIT),
        eq(censusBand.color, "green"),
        eq(censusBand.isActive, true),
      ),
    )
    .get();

  const inserts = buildShiftInserts(
    scheduleId,
    startDate,
    endDate,
    definitions,
    "green",
    greenBand?.id ?? null,
  );
  for (const values of inserts) {
    db.insert(shift).values(values).run();
  }

  db.insert(exceptionLog)
    .values({
      entityType: "schedule",
      entityId: scheduleId,
      action: "created",
      description: `Schedule created: ${newSchedule.name} (${startDate} to ${endDate})`,
      newState: { name: newSchedule.name, startDate, endDate, unit: DEMO_UNIT },
      performedBy: "nurse_manager",
    })
    .run();

  // 4. Insert a generation_job row + run the real engine, mirroring
  // POST /api/scenarios/generate. runGenerationJob writes assignments and
  // scenarios directly against @/db's connection.
  const job = db
    .insert(generationJob)
    .values({
      scheduleId,
      status: "pending",
      progress: 0,
      currentPhase: "Queued",
    })
    .returning()
    .get();

  await runGenerationJob(job.id, scheduleId);

  // 5. Publish: mirror the publish transition in PUT /api/schedules/[id]
  // (status -> published, publishedAt stamped, audit log entry, best-effort
  // notifications to every staff member with a live assignment).
  const publishedAt = new Date().toISOString();
  const published = db
    .update(schedule)
    .set({
      status: "published",
      updatedAt: publishedAt,
      publishedAt,
    })
    .where(eq(schedule.id, scheduleId))
    .returning()
    .get();

  db.insert(exceptionLog)
    .values({
      entityType: "schedule",
      entityId: scheduleId,
      action: "published",
      description: `Schedule published: ${published.name}`,
      previousState: { status: "draft" },
      newState: { status: published.status },
      performedBy: "nurse_manager",
    })
    .run();

  // Best-effort — a notify failure must never break the demo reset (mirrors
  // the try/catch around the publish handler's notification loop).
  try {
    const assignedStaff = db
      .select({ staffId: assignment.staffId })
      .from(assignment)
      .where(
        and(
          eq(assignment.scheduleId, scheduleId),
          ne(assignment.status, "cancelled"),
          ne(assignment.status, "called_out"),
        ),
      )
      .all();
    const distinctStaffIds = [...new Set(assignedStaff.map((a) => a.staffId))];
    for (const staffId of distinctStaffIds) {
      insertNotification(
        db,
        notification,
        composeSchedulePublished({
          staffId,
          scheduleName: published.name,
          startDate: published.startDate,
          endDate: published.endDate,
        }),
      );
    }
  } catch (err) {
    console.error("[demo] schedule_published notify failed", err);
  }

  // 6. Insert ONE pending shift_swap_request between two seeded staff on a
  // generated assignment, so the demo showroom has a live swap to approve.
  const generatedAssignments = db
    .select({ id: assignment.id, staffId: assignment.staffId })
    .from(assignment)
    .where(eq(assignment.scheduleId, scheduleId))
    .all();

  const requesting = generatedAssignments[0];
  const target = generatedAssignments.find(
    (a) => a.staffId !== requesting.staffId,
  );

  db.insert(shiftSwapRequest)
    .values({
      requestingAssignmentId: requesting.id,
      requestingStaffId: requesting.staffId,
      targetAssignmentId: target?.id ?? null,
      targetStaffId: target?.staffId ?? null,
      status: "pending",
      notes: "Demo swap request — awaiting manager review.",
    })
    .run();

  return { scheduleId };
}
