import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import path from "path";
import { hashPassword } from "../lib/auth/password";

/**
 * Standalone user provisioner (npm run db:seed:users).
 *
 * Unlike src/db/seed.ts, this does NOT wipe anything. It inserts ONLY the two
 * Phase 1 auth accounts — a manager and the demo nurse — using
 * onConflictDoNothing on email, so it is safe to run repeatedly on a live DB.
 *
 * Rollout: after the schema is deployed (via the prestart drizzle-kit push) and
 * staff exist (from db:seed), run this once to create the login accounts.
 */

const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "cah-scheduler.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

function uuid() {
  return crypto.randomUUID();
}

async function main() {
  const managerEmail = process.env.SEED_MANAGER_EMAIL ?? "admin@cah.local";
  const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? "changeme-dev";

  // Manager account (no staff link).
  const managerResult = db
    .insert(schema.user)
    .values({
      id: uuid(),
      email: managerEmail,
      role: "manager",
      staffId: null,
      passwordHash: hashPassword(managerPassword),
    })
    .onConflictDoNothing({ target: schema.user.email })
    .run();
  console.log(
    managerResult.changes > 0
      ? `✓ Created manager user ${managerEmail}`
      : `• Manager user ${managerEmail} already exists — skipped`
  );

  // Demo nurse — link to James Wilson if he exists in staff.
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

  if (!james) {
    console.log(
      "• James Wilson not found in staff — demo nurse user not created. Run db:seed first."
    );
  } else {
    const nurseResult = db
      .insert(schema.user)
      .values({
        id: uuid(),
        email: "james.wilson@cah.local",
        role: "nurse",
        staffId: james.id,
        passwordHash: hashPassword("demo1234"),
      })
      .onConflictDoNothing({ target: schema.user.email })
      .run();
    console.log(
      nurseResult.changes > 0
        ? "✓ Created demo nurse user james.wilson@cah.local"
        : "• Demo nurse user james.wilson@cah.local already exists — skipped"
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("create-users failed:", err);
  process.exit(1);
});
