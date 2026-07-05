import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import { seedDatabase } from "./seed-core";
import { provisionAuthUsers } from "../lib/auth/provision-users";

// Same DATABASE_PATH override as src/db/index.ts so seeding targets the
// volume-mounted DB on hosted deploys.
const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "cah-scheduler.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

async function seed() {
  await seedDatabase(sqlite, db);
  provisionAuthUsers(db);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
