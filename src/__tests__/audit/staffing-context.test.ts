/**
 * describeStaffing() is what makes a census-change or assignment-removal audit
 * entry legible months later: it names the resulting staffing position and,
 * crucially, calls excess staff out explicitly so a later send-home has a
 * visible cause in the trail.
 *
 * Same scratch-DB pattern as src/__tests__/demo/reset-demo.test.ts —
 * DATABASE_PATH is read at module load in src/db/index.ts, so the schema is
 * built with `drizzle-kit push --force` against a temp file BEFORE @/db is
 * dynamically imported. The founder's live cah-scheduler.db is never touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const ORIGINAL_ENV = { ...process.env };

let scratchDir: string;
let scratchDbPath: string;
let openHandles: import("better-sqlite3").Database[] = [];

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "staffing-ctx-test-"));
  scratchDbPath = path.join(scratchDir, "scratch.db");
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
}, 30_000);

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

/**
 * Seeds one shift requiring `required` staff with `assignedCount` active
 * assignments (plus optionally one cancelled assignment, which must NOT count).
 */
async function seedShift(opts: {
  required: number;
  assignedCount: number;
  withCancelled?: boolean;
}) {
  vi.resetModules();
  const dbMod = await import("@/db");
  const schema = await import("@/db/schema");
  openHandles.push(dbMod.sqlite);
  const { db } = dbMod;

  const unitName = "ICU";
  db.insert(schema.unit)
    .values({ id: "u1", name: unitName, description: "test unit" })
    .run();

  db.insert(schema.shiftDefinition)
    .values({
      id: "sd1",
      name: "Day",
      unit: unitName,
      shiftType: "day",
      startTime: "07:00",
      endTime: "19:00",
      durationHours: 12,
      requiredStaffCount: opts.required,
    })
    .run();

  db.insert(schema.schedule)
    .values({
      id: "sch1",
      name: "Test period",
      startDate: "2026-08-01",
      endDate: "2026-09-11",
      status: "draft",
    })
    .run();

  db.insert(schema.shift)
    .values({
      id: "sh1",
      scheduleId: "sch1",
      shiftDefinitionId: "sd1",
      date: "2026-08-05",
      requiredStaffCount: opts.required,
    })
    .run();

  for (let i = 0; i < opts.assignedCount; i++) {
    db.insert(schema.staff)
      .values({
        id: `st${i}`,
        firstName: "Nurse",
        lastName: `N${i}`,
        role: "RN",
        employmentType: "full_time",
        hireDate: "2024-01-01",
      })
      .run();
    db.insert(schema.assignment)
      .values({
        id: `a${i}`,
        scheduleId: "sch1",
        shiftId: "sh1",
        staffId: `st${i}`,
        status: "assigned",
      })
      .run();
  }

  if (opts.withCancelled) {
    db.insert(schema.staff)
      .values({
        id: "stC",
        firstName: "Cancelled",
        lastName: "Person",
        role: "RN",
        employmentType: "full_time",
        hireDate: "2024-01-01",
      })
      .run();
    db.insert(schema.assignment)
      .values({
        id: "aC",
        scheduleId: "sch1",
        shiftId: "sh1",
        staffId: "stC",
        status: "cancelled",
      })
      .run();
  }

  const mod = await import("@/lib/audit/staffing-context");
  return mod;
}

describe("describeStaffing", () => {
  it("names excess staff explicitly when a shift is over requirement", async () => {
    const { describeStaffing, getStaffingSnapshot } = await seedShift({
      required: 3,
      assignedCount: 5,
    });

    const snap = getStaffingSnapshot("sh1");
    expect(snap).toEqual({ assigned: 5, required: 3, delta: 2 });

    const note = describeStaffing("sh1");
    expect(note).toContain("5 assigned / 3 required");
    expect(note).toContain("2 over requirement");
    // The phrase an audit reader scans for:
    expect(note).toContain("excess staff");
  });

  it("reports a shortfall when a shift is under requirement", async () => {
    const { describeStaffing } = await seedShift({
      required: 4,
      assignedCount: 2,
    });
    const note = describeStaffing("sh1");
    expect(note).toContain("2 assigned / 4 required");
    expect(note).toContain("2 short of requirement");
    expect(note).not.toContain("excess staff");
  });

  it("reports a match when assigned equals required", async () => {
    const { describeStaffing } = await seedShift({
      required: 3,
      assignedCount: 3,
    });
    expect(describeStaffing("sh1")).toContain("staffing matches requirement");
  });

  it("excludes cancelled assignments, matching the dashboard's counters", async () => {
    const { getStaffingSnapshot } = await seedShift({
      required: 3,
      assignedCount: 3,
      withCancelled: true,
    });
    // 4 assignment rows exist, but the cancelled one must not count.
    expect(getStaffingSnapshot("sh1")).toEqual({
      assigned: 3,
      required: 3,
      delta: 0,
    });
  });

  it("returns an empty string for an unknown shift so callers can append safely", async () => {
    const { describeStaffing } = await seedShift({
      required: 3,
      assignedCount: 3,
    });
    expect(describeStaffing("does-not-exist")).toBe("");
  });
});
