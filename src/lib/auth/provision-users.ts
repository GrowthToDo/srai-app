// Relative imports (not "@/...") so the standalone db:seed:users tsx script can
// resolve this module too — tsx doesn't apply the Next path alias.
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema";
import { hashPassword } from "./password";

/** Shared demo-nurse password. Both demo logins use it until rotation. */
const DEMO_NURSE_PASSWORD = "demo1234";

/**
 * The demo nurse logins provisioned alongside the manager. Each binds to a
 * staff row by name when the roster contains that person.
 * - James Wilson (full_time) — the pre-fillable demo login on /login.
 * - Olivia Bennett (per_diem) — a second demo login exercising the PRN
 *   availability surface; never pre-filled on the login form.
 */
const DEMO_NURSES = [
  { firstName: "James", lastName: "Wilson", email: "james.wilson@cah.local" },
  {
    firstName: "Olivia",
    lastName: "Bennett",
    email: "olivia.bennett@cah.local",
  },
] as const;

/** Per-demo-nurse provisioning outcome. */
export interface DemoNurseResult {
  email: string;
  /** A new login row was inserted this run. */
  created: boolean;
  /** No matching staff row in the roster, so no login was provisioned. */
  skippedNoStaff: boolean;
}

/**
 * Idempotent auth-account provisioning, shared by the standalone
 * `db:seed:users` script and the Excel import route.
 *
 * Why the import route needs this: `user.staffId` cascades on staff deletion,
 * and a full-replace import wipes the staff table — which silently deleted the
 * demo nurse's login every time the founder re-imported (the manager account
 * survives because its staffId is null). Re-provisioning after import restores
 * the demo nurses whenever a matching staff member exists in the new roster.
 */
export function provisionAuthUsers(db: BetterSQLite3Database<typeof schema>): {
  managerCreated: boolean;
  nurses: DemoNurseResult[];
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

  const nurses: DemoNurseResult[] = DEMO_NURSES.map((demo) => {
    const staffRow = db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.firstName, demo.firstName),
          eq(schema.staff.lastName, demo.lastName)
        )
      )
      .get();

    if (!staffRow) {
      return { email: demo.email, created: false, skippedNoStaff: true };
    }

    const nurseResult = db
      .insert(schema.user)
      .values({
        id: crypto.randomUUID(),
        email: demo.email,
        role: "nurse",
        staffId: staffRow.id,
        passwordHash: hashPassword(DEMO_NURSE_PASSWORD),
      })
      .onConflictDoNothing({ target: schema.user.email })
      .run();

    return {
      email: demo.email,
      created: nurseResult.changes > 0,
      skippedNoStaff: false,
    };
  });

  return {
    managerCreated: managerResult.changes > 0,
    nurses,
  };
}
