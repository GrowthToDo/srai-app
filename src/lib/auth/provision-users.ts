// Relative imports (not "@/...") so the standalone db:seed:users tsx script can
// resolve this module too — tsx doesn't apply the Next path alias.
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema";
import { hashPassword } from "./password";

/**
 * Idempotent auth-account provisioning, shared by the standalone
 * `db:seed:users` script and the Excel import route.
 *
 * Why the import route needs this: `user.staffId` cascades on staff deletion,
 * and a full-replace import wipes the staff table — which silently deleted the
 * demo nurse's login every time the founder re-imported (the manager account
 * survives because its staffId is null). Re-provisioning after import restores
 * the demo nurse whenever a matching staff member exists in the new roster.
 */
export function provisionAuthUsers(db: BetterSQLite3Database<typeof schema>): {
  managerCreated: boolean;
  nurseCreated: boolean;
  nurseSkippedNoStaff: boolean;
} {
  const managerEmail = process.env.SEED_MANAGER_EMAIL ?? "admin@cah.local";
  const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? "changeme-dev";

  const managerResult = db
    .insert(schema.user)
    .values({
      id: crypto.randomUUID(),
      email: managerEmail,
      role: "manager",
      staffId: null,
      passwordHash: hashPassword(managerPassword),
    })
    .onConflictDoNothing({ target: schema.user.email })
    .run();

  // Demo nurse — bound to James Wilson when the roster contains him.
  const james = db
    .select({ id: schema.staff.id })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.firstName, "James"),
        eq(schema.staff.lastName, "Wilson")
      )
    )
    .get();

  let nurseCreated = false;
  if (james) {
    const nurseResult = db
      .insert(schema.user)
      .values({
        id: crypto.randomUUID(),
        email: "james.wilson@cah.local",
        role: "nurse",
        staffId: james.id,
        passwordHash: hashPassword("demo1234"),
      })
      .onConflictDoNothing({ target: schema.user.email })
      .run();
    nurseCreated = nurseResult.changes > 0;
  }

  return {
    managerCreated: managerResult.changes > 0,
    nurseCreated,
    nurseSkippedNoStaff: !james,
  };
}
