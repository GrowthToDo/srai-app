/**
 * Tests for PUT /api/schedules/[id] — empty-publish guard.
 *
 * Business rule: publishing a schedule with zero assignments is always a
 * mistake — nurses would be notified about a blank period, and everything
 * that reads "the published schedule" (swap dialog, callout escalation,
 * practice mode) starves. The compliance gate can't catch it because an
 * empty schedule has no violations, so the draft→published transition must
 * be rejected with HTTP 422. Live incident 2026-08-31: the demo instance
 * ended up with a published-but-empty schedule and both the swap dialog and
 * practice mode appeared broken.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const scheduleGet = vi.hoisted(() => vi.fn());
const assignmentAll = vi.hoisted(() => vi.fn<() => unknown[]>(() => []));
const updateReturningGet = vi.hoisted(() => vi.fn());
const insertRun = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _data: data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  ne: vi.fn((a: unknown, b: unknown) => ({ _ne: [a, b] })),
  gte: vi.fn((a: unknown, b: unknown) => ({ _gte: [a, b] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ _lte: [a, b] })),
}));

vi.mock("@/db/schema", () => ({
  schedule: { _table: "schedule", id: "sched$id", status: "sched$status" },
  shift: { _table: "shift", id: "shift$id", date: "shift$date" },
  shiftDefinition: { _table: "shiftDefinition", id: "def$id" },
  assignment: {
    _table: "assignment",
    id: "assign$id",
    staffId: "assign$staffId",
    scheduleId: "assign$scheduleId",
    status: "assign$status",
  },
  staff: { _table: "staff", id: "staff$id" },
  censusBand: { _table: "censusBand", id: "cb$id" },
  exceptionLog: { _table: "exceptionLog", id: "ex$id" },
  unit: { _table: "unit", id: "unit$id" },
  notification: { _table: "notification", id: "notif$id" },
}));

vi.mock("@/lib/notifications/notify", () => ({
  insertNotification: vi.fn(),
  composeSchedulePublished: vi.fn(() => ({})),
}));

vi.mock("@/db", () => {
  const makeFromResult = (table: { _table: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = {
      where: () => ({
        get: table._table === "schedule" ? scheduleGet : vi.fn(),
        all: table._table === "assignment" ? assignmentAll : vi.fn(() => []),
      }),
      all: vi.fn(() => []),
    };
    res.innerJoin = () => res;
    return res;
  };
  return {
    db: {
      select: () => ({ from: makeFromResult }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: () => ({ get: updateReturningGet }) }),
        }),
      }),
      insert: () => ({
        values: () => ({
          run: insertRun,
          returning: () => ({ get: vi.fn() }),
        }),
      }),
      delete: () => ({ where: () => ({ run: vi.fn() }) }),
    },
  };
});

import { PUT } from "@/app/api/schedules/[id]/route";

function makeRequest(body: Record<string, unknown>): Request {
  return { json: async () => body } as unknown as Request;
}

function callPut(body: Record<string, unknown>) {
  return PUT(makeRequest(body), {
    params: Promise.resolve({ id: "sched-1" }),
  }) as Promise<{
    status: number;
    json: () => Promise<Record<string, string>>;
  }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateReturningGet.mockReturnValue({
    id: "sched-1",
    name: "September 2026",
    status: "published",
    startDate: "2026-09-01",
    endDate: "2026-09-28",
  });
});

describe("PUT /api/schedules/[id] empty-publish guard", () => {
  it("rejects publishing a draft schedule with zero assignments (422)", async () => {
    scheduleGet.mockReturnValue({ id: "sched-1", status: "draft" });
    assignmentAll.mockReturnValue([]);

    const res = await callPut({ status: "published" });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/no staff assignments/i);
    expect(updateReturningGet).not.toHaveBeenCalled();
  });

  it("allows publishing once the schedule has assignments", async () => {
    scheduleGet.mockReturnValue({ id: "sched-1", status: "draft" });
    assignmentAll.mockReturnValue([{ id: "a1", staffId: "s1" }]);

    const res = await callPut({ status: "published" });
    expect(res.status).toBe(200);
    expect(updateReturningGet).toHaveBeenCalled();
  });

  it("does not block non-publish updates of an empty schedule", async () => {
    scheduleGet.mockReturnValue({ id: "sched-1", status: "draft" });
    assignmentAll.mockReturnValue([]);
    updateReturningGet.mockReturnValue({
      id: "sched-1",
      name: "Renamed",
      status: "draft",
      startDate: "2026-09-01",
      endDate: "2026-09-28",
    });

    const res = await callPut({ status: "draft", name: "Renamed" });
    expect(res.status).toBe(200);
    expect(updateReturningGet).toHaveBeenCalled();
  });

  it("guards only the transition — an already-published schedule can still be renamed", async () => {
    scheduleGet.mockReturnValue({ id: "sched-1", status: "published" });
    assignmentAll.mockReturnValue([]);

    const res = await callPut({ status: "published", name: "Renamed" });
    expect(res.status).toBe(200);
    expect(updateReturningGet).toHaveBeenCalled();
  });
});
