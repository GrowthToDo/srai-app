/**
 * Tests for GET /api/dashboard — schedule-coverage alerts.
 *
 * Founder's live gap 2026-08-31: the "schedule ending soon" alert fires only
 * for 0-7 days before the end, so the day AFTER the last period ends — when
 * swaps, callouts, and practice mode all go dark — the dashboard went silent.
 * The route now reports `scheduleEnded` for that state; it must be loud, not
 * absent.
 *
 * Same scratch-DB pattern as src/__tests__/audit/staffing-context.test.ts.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { addDays, format } from "date-fns";

vi.setConfig({ testTimeout: 30_000 });

const ORIGINAL_ENV = { ...process.env };

let baseDir: string;
let templateDbPath: string;
let scratchDbPath: string;
let testSeq = 0;
let openHandles: import("better-sqlite3").Database[] = [];

beforeAll(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-coverage-test-"));
  templateDbPath = path.join(baseDir, "template.db");
  const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DATABASE_PATH: templateDbPath },
  });
  if (push.status !== 0) {
    throw new Error(
      `drizzle-kit push failed for template DB: ${push.stdout}\n${push.stderr}`,
    );
  }
}, 60_000);

beforeEach(() => {
  scratchDbPath = path.join(baseDir, `scratch-${testSeq++}.db`);
  fs.copyFileSync(templateDbPath, scratchDbPath);
  process.env.DATABASE_PATH = scratchDbPath;
});

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
});

afterAll(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

function dayOut(n: number): string {
  return format(addDays(new Date(), n), "yyyy-MM-dd");
}

/** Seeds one published schedule spanning the given day offsets, then returns
 * the dashboard GET's parsed JSON. */
async function dashboardWithSchedule(range: { start: number; end: number }) {
  vi.resetModules();
  const dbMod = await import("@/db");
  const schema = await import("@/db/schema");
  openHandles.push(dbMod.sqlite);
  dbMod.db
    .insert(schema.schedule)
    .values({
      id: "sch1",
      name: "Test period",
      startDate: dayOut(range.start),
      endDate: dayOut(range.end),
      status: "published",
    })
    .run();
  const route = await import("@/app/api/dashboard/route");
  const res = await route.GET();
  return res.json();
}

describe("GET /api/dashboard schedule coverage", () => {
  it("reports scheduleEnded (loudly, with the end date) after the last period is over", async () => {
    // Founder's case: period ended yesterday, nothing follows.
    const body = await dashboardWithSchedule({ start: -14, end: -1 });
    expect(body.scheduleEnded).toEqual({ endDate: dayOut(-1), daysAgo: 1 });
    expect(body.scheduleEndingSoon).toBeNull();
  });

  it("reports scheduleEndingSoon inside the 7-day runway with no next period", async () => {
    const body = await dashboardWithSchedule({ start: -11, end: 3 });
    expect(body.scheduleEndingSoon).toEqual({ daysUntilEnd: 3 });
    expect(body.scheduleEnded).toBeNull();
  });

  it("stays quiet while the published schedule has runway left", async () => {
    const body = await dashboardWithSchedule({ start: -4, end: 10 });
    expect(body.scheduleEndingSoon).toBeNull();
    expect(body.scheduleEnded).toBeNull();
  });
});
