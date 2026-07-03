import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

// DATABASE_PATH lets hosted deploys (Railway) point the DB at a persistent
// volume (e.g. /data/cah-scheduler.db) — the container filesystem is wiped on
// every redeploy. Unset locally, it falls back to the project directory.
const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "cah-scheduler.db");
// Railway volumes are mounted at RUNTIME only — during `next build` (and any
// tests run in the build container) the volume directory doesn't exist yet, and
// better-sqlite3 refuses to create the file in a missing directory. Creating it
// here makes build-time module evaluation safe; at runtime the real volume is
// mounted over the same path.
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// `next build` collects page data with MULTIPLE worker processes, each of which
// evaluates this module and opens its own connection to the (fresh, throwaway)
// build-time DB file. Concurrent workers can race on the initial file creation
// and on the DELETE→WAL journal-mode conversion (a write to the DB header),
// which surfaces as SQLITE_BUSY and kills the build. Two defenses:
//   1. A generous busy timeout so lock contention waits instead of throwing.
//   2. Retry the open, and tolerate a lost WAL race — the losing connection
//      keeps the default journal mode, which is fine for read-only page-data
//      collection. At runtime there is a single server process, so neither
//      defense ever fires there.
function openDatabase(file: string): Database.Database {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return new Database(file, { timeout: 15000 });
    } catch (err) {
      lastErr = err;
      // Synchronous backoff (better-sqlite3 is sync; this path only runs when
      // concurrent build workers collide, never in the running server).
      const until = Date.now() + 100 * (attempt + 1);
      while (Date.now() < until) {
        /* spin */
      }
    }
  }
  throw lastErr;
}

const sqlite = openDatabase(dbPath);

try {
  sqlite.pragma("journal_mode = WAL");
} catch {
  console.warn(
    "[db] journal_mode=WAL not applied on this connection (concurrent build worker race) — continuing with default journal mode",
  );
}
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
