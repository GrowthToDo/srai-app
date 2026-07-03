import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import { provisionAuthUsers } from "../lib/auth/provision-users";

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

async function main() {
  const managerEmail = process.env.SEED_MANAGER_EMAIL ?? "admin@cah.local";
  const result = provisionAuthUsers(db);

  console.log(
    result.managerCreated
      ? `✓ Created manager user ${managerEmail}`
      : `• Manager user ${managerEmail} already exists — skipped`
  );
  for (const nurse of result.nurses) {
    if (nurse.skippedNoStaff) {
      console.log(
        `• Matching staff for ${nurse.email} not found — demo nurse user not created. Run db:seed first.`
      );
    } else {
      console.log(
        nurse.created
          ? `✓ Created demo nurse user ${nurse.email}`
          : `• Demo nurse user ${nurse.email} already exists — skipped`
      );
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("create-users failed:", err);
  process.exit(1);
});
