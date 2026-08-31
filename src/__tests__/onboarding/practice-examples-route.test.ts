/**
 * Tests for POST /api/practice-examples — precondition messages + windows.
 *
 * Live incident 2026-08-31: the demo told a manager who HAD just published a
 * schedule to "publish a schedule first". The route now distinguishes its
 * preconditions (no published schedule at all / published but no shifts in
 * the coming 14 days / missing a specific ingredient) and its candidate
 * windows follow the 7-day callout threshold: Leave A 2-6 days out (inside),
 * Leave B 8-14 days out (beyond).
 *
 * Same scratch-DB pattern as src/__tests__/audit/staffing-context.test.ts —
 * DATABASE_PATH is read at module load in src/db/index.ts, so the schema is
 * pushed to a template file once, byte-copied per test, and the route module
 * is dynamically imported after vi.resetModules().
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
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "practice-examples-test-"));
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

/** Local-date string n days from today — matches the route's daysFromToday. */
function dayOut(n: number): string {
  return format(addDays(new Date(), n), "yyyy-MM-dd");
}

/**
 * Seeds a schedule (status per opts) with one 12h day shift per entry in
 * `shifts`, each assigned to the named staff member. Staff are created on
 * first mention.
 */
async function seed(opts: {
  scheduleStatus: "draft" | "published";
  /** Schedule period as day offsets from today; defaults to [0, 27]. */
  scheduleRange?: { start: number; end: number };
  shifts: { staffId: string; role: "RN" | "LPN"; daysOut: number }[];
}) {
  vi.resetModules();
  const dbMod = await import("@/db");
  const schema = await import("@/db/schema");
  openHandles.push(dbMod.sqlite);
  const { db } = dbMod;

  db.insert(schema.unit)
    .values({ id: "u1", name: "ICU", description: "test unit" })
    .run();
  db.insert(schema.shiftDefinition)
    .values({
      id: "sd1",
      name: "Day",
      unit: "ICU",
      shiftType: "day",
      startTime: "07:00",
      endTime: "19:00",
      durationHours: 12,
      requiredStaffCount: 2,
    })
    .run();
  db.insert(schema.schedule)
    .values({
      id: "sch1",
      name: "Test period",
      startDate: dayOut(opts.scheduleRange?.start ?? 0),
      endDate: dayOut(opts.scheduleRange?.end ?? 27),
      status: opts.scheduleStatus,
    })
    .run();

  const seenStaff = new Set<string>();
  for (const [i, entry] of opts.shifts.entries()) {
    if (!seenStaff.has(entry.staffId)) {
      seenStaff.add(entry.staffId);
      db.insert(schema.staff)
        .values({
          id: entry.staffId,
          firstName: entry.staffId,
          lastName: "Test",
          role: entry.role,
          employmentType: "full_time",
          hireDate: "2024-01-01",
        })
        .run();
    }
    db.insert(schema.shift)
      .values({
        id: `sh${i}`,
        scheduleId: "sch1",
        shiftDefinitionId: "sd1",
        date: dayOut(entry.daysOut),
      })
      .run();
    db.insert(schema.assignment)
      .values({
        id: `a${i}`,
        scheduleId: "sch1",
        shiftId: `sh${i}`,
        staffId: entry.staffId,
        status: "assigned",
      })
      .run();
  }

  const route = await import("@/app/api/practice-examples/route");
  return route;
}

async function postAndParse(route: { POST: () => Promise<Response> }) {
  const res = await route.POST();
  return { status: res.status, body: await res.json() };
}

describe("POST /api/practice-examples preconditions", () => {
  it("with no published schedule at all: says publish first", async () => {
    const route = await seed({
      scheduleStatus: "draft",
      shifts: [
        { staffId: "nurseA", role: "RN", daysOut: 3 },
        { staffId: "nurseB", role: "RN", daysOut: 9 },
      ],
    });
    const { status, body } = await postAndParse(route);
    expect(status).toBe(422);
    expect(body.error).toMatch(/Publish a schedule first/);
  });

  it("published schedule already over: names the end date, not 'publish first'", async () => {
    // Founder's live case 2026-08-31: period ran Aug 17-30, today is the 31st.
    // Offsets stay ≥2 days in the past so the check is TZ-safe (the window
    // query's today-string is UTC-derived while daysFromToday is local).
    const route = await seed({
      scheduleStatus: "published",
      scheduleRange: { start: -16, end: -2 },
      shifts: [
        { staffId: "nurseA", role: "RN", daysOut: -3 },
        { staffId: "nurseB", role: "RN", daysOut: -2 },
      ],
    });
    const { status, body } = await postAndParse(route);
    expect(status).toBe(422);
    expect(body.error).toMatch(/ended on \d{4}-\d{2}-\d{2}/);
    expect(body.error).toMatch(/no schedule covers today/);
    expect(body.error).not.toMatch(/Publish a schedule first/);
  });

  it("published but nothing in the next 14 days: says so instead of 'publish first'", async () => {
    const route = await seed({
      scheduleStatus: "published",
      shifts: [{ staffId: "nurseA", role: "RN", daysOut: 20 }],
    });
    const { status, body } = await postAndParse(route);
    expect(status).toBe(422);
    expect(body.error).toMatch(/no upcoming shifts in the next 14 days/);
    expect(body.error).not.toMatch(/Publish a schedule first/);
  });

  it("names the missing ingredient when the window has shifts but no two RNs", async () => {
    const route = await seed({
      scheduleStatus: "published",
      shifts: [
        { staffId: "lvnA", role: "LPN", daysOut: 2 },
        { staffId: "lvnB", role: "LPN", daysOut: 8 },
      ],
    });
    const { status, body } = await postAndParse(route);
    expect(status).toBe(422);
    expect(body.error).toMatch(/two RNs/);
    expect(body.error).not.toMatch(/Publish a schedule first/);
  });

  it("seeds the full chain at the widened window boundaries (2 and 8 days out)", async () => {
    const route = await seed({
      scheduleStatus: "published",
      shifts: [
        { staffId: "nurseA", role: "RN", daysOut: 2 },
        { staffId: "nurseB", role: "RN", daysOut: 8 },
        { staffId: "nurseC", role: "RN", daysOut: 3 },
        { staffId: "nurseD", role: "RN", daysOut: 4 },
      ],
    });
    const { status, body } = await postAndParse(route);
    expect(status).toBe(201);
    expect(body.created.leaveA.daysOut).toBe(2);
    expect(body.created.leaveB.daysOut).toBe(8);
    expect(body.created.swap.requesting).not.toBe(body.created.swap.target);
  });
});
