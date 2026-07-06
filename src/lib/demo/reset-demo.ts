import { db } from "@/db";
import * as schema from "@/db/schema";
import { provisionAuthUsers } from "@/lib/auth/provision-users";

/**
 * Wipes the demo instance back to a completely empty hospital. The demo no
 * longer ships furnished with a fake hospital — testers exercise the real
 * from-scratch onboarding flow themselves: they hit /setup, use "Download
 * sample data" (GET /api/import serves the bundled sample workbook when the
 * DB is empty), and import it. Reset just clears everything so the next
 * tester gets the same blank slate.
 * DEMO-ONLY: callers must gate on DEMO_MODE (the API route does).
 */
export async function resetDemoData(): Promise<{ staffCount: number }> {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error(
      "resetDemoData is demo-only: refusing to run without DEMO_MODE=true",
    );
  }

  // Wipe every table, FK-safe order — mirrors deleteAllData() in
  // src/app/api/import/route.ts (kept in sync manually; that function isn't
  // exported, so the order is duplicated here).
  db.delete(schema.exceptionLog).run();
  db.delete(schema.scenario).run();
  db.delete(schema.callout).run();
  db.delete(schema.shiftSwapRequest).run();
  db.delete(schema.openShift).run();

  db.delete(schema.assignment).run();
  db.delete(schema.staffHolidayAssignment).run();
  db.delete(schema.prnAvailability).run();
  db.delete(schema.staffLeave).run();

  db.delete(schema.shift).run();
  db.delete(schema.shiftDefinition).run();
  db.delete(schema.schedule).run();

  db.delete(schema.staffPreferences).run();
  db.delete(schema.staff).run();

  db.delete(schema.censusBand).run();
  db.delete(schema.rule).run();
  db.delete(schema.publicHoliday).run();
  db.delete(schema.unit).run();

  // Auth accounts: with no staff left, nurse logins skip gracefully
  // (skippedNoStaff: true) and only the manager account gets (re)created.
  provisionAuthUsers(db);

  const staffCount = db.select().from(schema.staff).all().length;
  return { staffCount };
}
