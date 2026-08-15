/**
 * Fluidity of the availability/hours computations (founder scenario,
 * 2026-08-15): "James Wilson works three days this week — recommending him
 * for a fourth shows OT. If he calls out or goes on leave for one of those
 * shifts, a NEW recommendation must see the freed hours and stop flagging
 * OT." The system must always rank against what a nurse will ACTUALLY work,
 * never against stale assignment rows.
 *
 * Pins, against a real scratch DB (same pattern as reset-demo.test.ts):
 * - weekly hours drop when an assignment is called_out / cancelled / swapped
 * - a callout on date D makes the nurse unavailable for ALL of date D
 * - weekend-fairness and consecutive-day counts ignore not-worked days
 * - a called-out D-1 shift manufactures no phantom short-rest exclusion
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

// Scratch-DB tests do real drizzle inserts + first-load of the full module
// graph; under full-suite load the 5s default test timeout flakes.
vi.setConfig({ testTimeout: 30_000 });

const ORIGINAL_ENV = { ...process.env };

let baseDir: string;
let templateDbPath: string;
let scratchDbPath: string;
let testSeq = 0;
let openHandles: import("better-sqlite3").Database[] = [];

// Schema is pushed ONCE per file, then each test gets a byte-copy of the
// template. Running drizzle-kit push per TEST made several scratch-DB test
// files spawn concurrent npx processes under full-suite load; pushes crawled
// past the hook timeout, and a timed-out hook left DATABASE_PATH aimed at the
// previous test's already-seeded DB → "UNIQUE constraint failed" (2026-08-15).
beforeAll(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "fluidity-test-"));
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

const JAMES = "james-wilson";
// Monday-anchored week: Mon 2026-09-07 … Sun 2026-09-13.
const TUE = "2026-09-08";
const WED = "2026-09-09";
const THU = "2026-09-10";
const FRI = "2026-09-11";
const SAT = "2026-09-12";

interface Db {
  db: import("drizzle-orm/better-sqlite3").BetterSQLite3Database<
    typeof import("@/db/schema")
  >;
  sqlite: import("better-sqlite3").Database;
}

/**
 * Seed: James assigned Tue/Wed/Thu day shifts (3 × 12h = 36h), plus unassigned
 * day shifts Fri/Sat and night shifts Tue/Fri for the same-day / rest cases.
 */
async function seed() {
  vi.resetModules();
  const dbMod = (await import("@/db")) as unknown as Db;
  const schema = await import("@/db/schema");
  openHandles.push(dbMod.sqlite);
  const { db } = dbMod;

  db.insert(schema.unit)
    .values({ id: "u1", name: "ICU", description: "test" })
    .run();
  db.insert(schema.shiftDefinition)
    .values([
      {
        id: "day",
        name: "Day",
        unit: "ICU",
        shiftType: "day",
        startTime: "07:00",
        endTime: "19:00",
        durationHours: 12,
        requiredStaffCount: 2,
      },
      {
        id: "night",
        name: "Night",
        unit: "ICU",
        shiftType: "night",
        startTime: "19:00",
        endTime: "07:00",
        durationHours: 12,
        requiredStaffCount: 2,
      },
    ])
    .run();
  db.insert(schema.schedule)
    .values({
      id: "sch1",
      name: "Period",
      startDate: "2026-09-01",
      endDate: "2026-10-12",
      status: "published",
    })
    .run();

  const shifts = [
    { id: "sh-tue-day", def: "day", date: TUE },
    { id: "sh-wed-day", def: "day", date: WED },
    { id: "sh-thu-day", def: "day", date: THU },
    { id: "sh-fri-day", def: "day", date: FRI },
    { id: "sh-sat-day", def: "day", date: SAT },
    { id: "sh-tue-night", def: "night", date: TUE },
    { id: "sh-fri-night", def: "night", date: FRI },
  ];
  db.insert(schema.shift)
    .values(
      shifts.map((s) => ({
        id: s.id,
        scheduleId: "sch1",
        shiftDefinitionId: s.def,
        date: s.date,
        requiredStaffCount: 2,
      })),
    )
    .run();

  db.insert(schema.staff)
    .values({
      id: JAMES,
      firstName: "James",
      lastName: "Wilson",
      role: "RN",
      employmentType: "full_time",
      hireDate: "2024-01-01",
    })
    .run();

  db.insert(schema.assignment)
    .values(
      ["sh-tue-day", "sh-wed-day", "sh-thu-day"].map((shiftId, i) => ({
        id: `a${i}`,
        scheduleId: "sch1",
        shiftId,
        staffId: JAMES,
        status: "assigned" as const,
      })),
    )
    .run();

  const coverage = await import("@/lib/coverage/find-candidates");
  const history = await import("@/lib/coverage/staff-history");
  return { db, schema, coverage, history };
}

const SAT_DAY_SHIFT = {
  id: "sh-sat-day",
  date: SAT,
  startTime: "07:00",
  endTime: "19:00",
  durationHours: 12,
  unit: "ICU",
  shiftType: "day",
  scheduleId: "sch1",
};

function setStatus(
  db: Db["db"],
  schema: typeof import("@/db/schema"),
  assignmentId: string,
  status: "called_out" | "cancelled" | "swapped",
) {
  const { eq } = require("drizzle-orm") as typeof import("drizzle-orm");
  db.update(schema.assignment)
    .set({ status })
    .where(eq(schema.assignment.id, assignmentId))
    .run();
}

describe("availability fluidity — the James Wilson scenario", () => {
  it("3 worked shifts = 36h; a 4th would be OT", async () => {
    const { coverage } = await seed();
    const result = await coverage.checkStaffAvailability(JAMES, SAT_DAY_SHIFT);
    expect(result.available).toBe(true);
    expect(result.hoursThisWeek).toBe(36); // +12h = 48h → caller flags OT
  });

  it("calling out of one shift frees those hours — no more phantom OT", async () => {
    const { db, schema, coverage } = await seed();
    setStatus(db, schema, "a0", "called_out"); // Tuesday released
    const result = await coverage.checkStaffAvailability(JAMES, SAT_DAY_SHIFT);
    expect(result.available).toBe(true);
    expect(result.hoursThisWeek).toBe(24); // +12h = 36h → straight time
  });

  it("leave-cancelled and swapped-away hours are freed too", async () => {
    const { db, schema, coverage } = await seed();
    setStatus(db, schema, "a0", "cancelled"); // leave approval released Tue
    setStatus(db, schema, "a1", "swapped"); // Wed given away via open swap
    const result = await coverage.checkStaffAvailability(JAMES, SAT_DAY_SHIFT);
    expect(result.hoursThisWeek).toBe(12); // only Thursday remains
  });

  it("called out on a date = unavailable for EVERY shift that date", async () => {
    const { db, schema, coverage } = await seed();
    setStatus(db, schema, "a0", "called_out"); // called out of Tuesday DAY
    const result = await coverage.checkStaffAvailability(JAMES, {
      ...SAT_DAY_SHIFT,
      id: "sh-tue-night",
      date: TUE,
      startTime: "19:00",
      endTime: "07:00",
      shiftType: "night",
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe("Called out of a shift this day");
  });

  it("weekend-fairness count ignores a called-out weekend shift", async () => {
    const { db, schema, history } = await seed();
    db.insert(schema.assignment)
      .values({
        id: "a-sat",
        scheduleId: "sch1",
        shiftId: "sh-sat-day",
        staffId: JAMES,
        status: "assigned",
      })
      .run();
    expect(history.countWeekendsInSchedulePeriod(JAMES, "sch1")).toBe(1);
    setStatus(db, schema, "a-sat", "called_out");
    expect(history.countWeekendsInSchedulePeriod(JAMES, "sch1")).toBe(0);
  });

  it("consecutive-day streak breaks at a called-out day", async () => {
    const { db, schema, history } = await seed();
    // Tue+Wed+Thu worked → 3 consecutive days before Friday.
    expect(history.countConsecutiveDaysBefore(JAMES, FRI)).toBe(3);
    // Wednesday called out → the streak seen from Friday is just Thursday.
    setStatus(db, schema, "a1", "called_out");
    expect(history.countConsecutiveDaysBefore(JAMES, FRI)).toBe(1);
  });

  it("a called-out night shift manufactures no phantom short-rest block", async () => {
    const { db, schema, coverage } = await seed();
    // Friday night 19:00–07:00 assigned → Saturday 07:00 day start = 0h rest.
    db.insert(schema.assignment)
      .values({
        id: "a-fri-n",
        scheduleId: "sch1",
        shiftId: "sh-fri-night",
        staffId: JAMES,
        status: "assigned",
      })
      .run();
    const blocked = await coverage.checkStaffAvailability(JAMES, SAT_DAY_SHIFT);
    expect(blocked.available).toBe(false); // genuinely short rest

    // He called out of that Friday night — it was never worked, so Saturday
    // must be open again.
    setStatus(db, schema, "a-fri-n", "called_out");
    const freed = await coverage.checkStaffAvailability(JAMES, SAT_DAY_SHIFT);
    expect(freed.available).toBe(true);
  });
});
