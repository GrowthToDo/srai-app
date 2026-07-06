/**
 * resetDemoData() runs against @/db's module-scope connection (DATABASE_PATH
 * is read at module load time — see src/db/index.ts), so this test points
 * DATABASE_PATH at a scratch file and vi.resetModules() + dynamically
 * imports @/db fresh, mirroring the env-isolation pattern in
 * src/__tests__/auth/middleware.test.ts.
 *
 * Schema setup: the repo's checked-in drizzle/*.sql migrations predate the
 * `user` and `notification` tables (the live DB was advanced with `db:push`
 * schema-diffing, not `db:generate`), so replaying them leaves those tables
 * missing. `drizzle-kit push --force` against the scratch DATABASE_PATH
 * builds the exact current schema instead — scoped to the scratch file via
 * an explicit env override, never touching the default `cah-scheduler.db`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import * as schema from "@/db/schema";

const ORIGINAL_ENV = { ...process.env };

let scratchDir: string;
let scratchDbPath: string;
// Each vi.resetModules() + re-import of @/db opens a fresh better-sqlite3
// connection to the same scratch file (WAL mode allows concurrent
// connections). Track every one so afterEach can close them all — an
// unclosed handle holds a Windows file lock and rmSync fails with EBUSY.
let openHandles: import("better-sqlite3").Database[] = [];

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "reset-demo-test-"));
  scratchDbPath = path.join(scratchDir, "scratch.db");

  // Build the scratch file's schema BEFORE @/db opens it, so the
  // module-scope connection in src/db/index.ts sees a fully-formed schema on
  // first open (it never runs migrations/push itself).
  const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DATABASE_PATH: scratchDbPath },
  });
  if (push.status !== 0) {
    throw new Error(
      `drizzle-kit push failed for scratch DB: ${push.stdout}\n${push.stderr}`,
    );
  }

  process.env.DATABASE_PATH = scratchDbPath;
  process.env.DEMO_MODE = "true";
}, 30_000); // drizzle-kit push spawns a subprocess; can exceed vitest's 10s
// default hookTimeout under full-suite load even though it runs in ~1-2s
// standalone (this hook, not resetDemoData itself, is what's slow now).

afterEach(() => {
  for (const handle of openHandles) {
    try {
      handle.close();
    } catch {
      // already closed
    }
  }
  openHandles = [];
  process.env = { ...ORIGINAL_ENV };
  fs.rmSync(scratchDir, { recursive: true, force: true });
});

async function loadResetDemoData() {
  vi.resetModules();
  const mod = await import("@/lib/demo/reset-demo");
  const dbMod = await import("@/db");
  openHandles.push(dbMod.sqlite);
  return mod.resetDemoData;
}

// Reuses the module registry loadResetDemoData() just populated (no
// vi.resetModules() here) so this returns the SAME @/db connection the most
// recent resetDemoData() call wrote through, not a fresh connection.
async function loadDb() {
  return import("@/db");
}

describe("resetDemoData", () => {
  it('refuses to run when DEMO_MODE is not "true"', async () => {
    delete process.env.DEMO_MODE;
    const resetDemoData = await loadResetDemoData();
    await expect(resetDemoData()).rejects.toThrow(
      "resetDemoData is demo-only: refusing to run without DEMO_MODE=true",
    );
  });

  it("wipes everything to empty, leaving exactly one manager user", async () => {
    const resetDemoData = await loadResetDemoData();
    const result = await resetDemoData();
    expect(result.staffCount).toBe(0);

    const { db } = await loadDb();

    const staff = db.select().from(schema.staff).all();
    expect(staff.length).toBe(0);

    const schedules = db.select().from(schema.schedule).all();
    expect(schedules.length).toBe(0);

    const assignments = db.select().from(schema.assignment).all();
    expect(assignments.length).toBe(0);

    // Fresh wipe means no staff, so nurse logins skip — only the manager
    // account gets created.
    const users = db.select().from(schema.user).all();
    expect(users.length).toBe(1);
    expect(users[0].role).toBe("manager");

    // The reset epoch is stamped so browsers can invalidate stale local
    // onboarding flags (served via GET /api/demo/status).
    const { getDemoResetEpoch } = await import("@/lib/demo/reset-demo");
    const epoch = getDemoResetEpoch();
    expect(epoch).toBeTruthy();
    expect(new Date(epoch as string).toString()).not.toBe("Invalid Date");
  });

  it("is idempotent — running twice leaves the same empty state", async () => {
    const resetDemoData = await loadResetDemoData();
    await resetDemoData();
    const second = await resetDemoData();

    expect(second.staffCount).toBe(0);

    const { db } = await loadDb();

    const staff = db.select().from(schema.staff).all();
    expect(staff.length).toBe(0);

    const schedules = db.select().from(schema.schedule).all();
    expect(schedules.length).toBe(0);

    const assignments = db.select().from(schema.assignment).all();
    expect(assignments.length).toBe(0);

    // onConflictDoNothing in provisionAuthUsers means no duplicate manager
    // row on the second reset.
    const users = db.select().from(schema.user).all();
    expect(users.length).toBe(1);
    expect(users[0].role).toBe("manager");
  });
});
