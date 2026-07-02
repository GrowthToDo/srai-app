/**
 * Tests for POST /api/scenarios/generate — published-schedule guard.
 *
 * Business rule: regenerating a schedule deletes ALL of its assignments
 * (including manual fills and callout replacements) and replaces them with a
 * fresh auto-generated set. Once a schedule is published, staff are relying
 * on it — regeneration must be blocked with HTTP 409 until the manager
 * explicitly unpublishes.
 *
 * Strategy: mock @/db, next/server, and the runner so no real SQLite file or
 * background job is touched (same approach as the leave-denial tests).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const mockScheduleGet = vi.hoisted(() => vi.fn());
const mockJobsAll = vi.hoisted(() => vi.fn());
const mockStaffAll = vi.hoisted(() => vi.fn());
const mockShiftsAll = vi.hoisted(() => vi.fn());
const mockInsertReturningGet = vi.hoisted(() => vi.fn());
const mockRunGenerationJob = vi.hoisted(() => vi.fn(async () => undefined));
const mockUpdateSet = vi.hoisted(() => vi.fn());

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
}));

vi.mock("@/db/schema", () => ({
  schedule: { _table: "schedule", id: "sched$id", status: "sched$status" },
  generationJob: { _table: "generationJob", id: "job$id", scheduleId: "job$scheduleId", status: "job$status" },
  staff: { _table: "staff", id: "staff$id", isActive: "staff$isActive", homeUnit: "staff$homeUnit" },
  shift: { _table: "shift", id: "shift$id", scheduleId: "shift$scheduleId" },
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: (table: { _table: string }) => ({
        where: () => ({
          get: table._table === "schedule" ? mockScheduleGet : vi.fn(),
          all:
            table._table === "generationJob"
              ? mockJobsAll
              : table._table === "staff"
              ? mockStaffAll
              : table._table === "shift"
              ? mockShiftsAll
              : vi.fn(() => []),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => ({ get: mockInsertReturningGet }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        mockUpdateSet(vals);
        return { where: () => ({ run: vi.fn() }) };
      },
    }),
  },
}));

vi.mock("@/lib/engine/scheduler/runner", () => ({
  runGenerationJob: mockRunGenerationJob,
}));

// ─── Import SUT after mocks ──────────────────────────────────────────────────

import { POST } from "@/app/api/scenarios/generate/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCHEDULE_ID = "sched-001";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/scenarios/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/scenarios/generate — published-schedule guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobsAll.mockReturnValue([]);
    // Preflight passes by default: the unit has active staff and shifts exist.
    mockStaffAll.mockReturnValue([{ id: "staff-001" }]);
    mockShiftsAll.mockReturnValue([{ id: "shift-001" }]);
    mockInsertReturningGet.mockReturnValue({ id: "job-001" });
  });

  it("returns 409 when the schedule is published", async () => {
    mockScheduleGet.mockReturnValue({ id: SCHEDULE_ID, status: "published" });
    const res = await POST(makeRequest({ scheduleId: SCHEDULE_ID }));
    expect((res as { status: number }).status).toBe(409);
  });

  it("explains that the schedule must be unpublished first", async () => {
    mockScheduleGet.mockReturnValue({ id: SCHEDULE_ID, status: "published" });
    const res = (await POST(makeRequest({ scheduleId: SCHEDULE_ID }))) as {
      _data: { error: string };
    };
    expect(res._data.error).toMatch(/unpublish/i);
  });

  it("does not create a generation job for a published schedule", async () => {
    mockScheduleGet.mockReturnValue({ id: SCHEDULE_ID, status: "published" });
    await POST(makeRequest({ scheduleId: SCHEDULE_ID }));
    expect(mockInsertReturningGet).not.toHaveBeenCalled();
  });

  it("still creates a generation job for a draft schedule", async () => {
    mockScheduleGet.mockReturnValue({ id: SCHEDULE_ID, status: "draft" });
    const res = (await POST(makeRequest({ scheduleId: SCHEDULE_ID }))) as unknown as {
      _data: { jobId: string };
      status: number;
    };
    expect(res.status).toBe(200);
    expect(res._data.jobId).toBe("job-001");
  });

  it("reclaims a stale running job (process died) and proceeds with generation", async () => {
    // A job stuck in 'running' for 20 minutes means the process died mid-job.
    // Without reclamation the hospital is permanently blocked from generating.
    mockScheduleGet.mockReturnValue({ id: SCHEDULE_ID, status: "draft" });
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockJobsAll.mockReturnValue([
      { id: "job-stale", scheduleId: SCHEDULE_ID, status: "running", startedAt: staleTime, createdAt: staleTime },
    ]);
    const res = (await POST(makeRequest({ scheduleId: SCHEDULE_ID }))) as unknown as {
      status: number;
      _data: { jobId?: string };
    };
    expect(res.status).toBe(200);
    expect(res._data.jobId).toBe("job-001");
    const failedUpdates = mockUpdateSet.mock.calls.filter(
      (c) => (c[0] as { status?: string }).status === "failed"
    );
    expect(failedUpdates.length).toBe(1);
  });

  it("returns 422 and creates no job when the unit has no active staff", async () => {
    mockScheduleGet.mockReturnValue({ id: SCHEDULE_ID, status: "draft", unit: "ICU" });
    mockStaffAll.mockReturnValue([]);
    const res = (await POST(makeRequest({ scheduleId: SCHEDULE_ID }))) as unknown as {
      status: number;
      _data: { error: string };
    };
    expect(res.status).toBe(422);
    expect(res._data.error).toContain("No active staff are assigned to ICU");
    expect(mockInsertReturningGet).not.toHaveBeenCalled();
  });

  it("returns 422 and creates no job when the schedule period has no shifts", async () => {
    mockScheduleGet.mockReturnValue({ id: SCHEDULE_ID, status: "draft", unit: "ICU" });
    mockShiftsAll.mockReturnValue([]);
    const res = (await POST(makeRequest({ scheduleId: SCHEDULE_ID }))) as unknown as {
      status: number;
      _data: { error: string };
    };
    expect(res.status).toBe(422);
    expect(res._data.error).toMatch(/no shifts yet/i);
    expect(mockInsertReturningGet).not.toHaveBeenCalled();
  });

  it("still returns 409 for a recent running job", async () => {
    mockScheduleGet.mockReturnValue({ id: SCHEDULE_ID, status: "draft" });
    const recentTime = new Date(Date.now() - 60 * 1000).toISOString();
    mockJobsAll.mockReturnValue([
      { id: "job-live", scheduleId: SCHEDULE_ID, status: "running", startedAt: recentTime, createdAt: recentTime },
    ]);
    const res = await POST(makeRequest({ scheduleId: SCHEDULE_ID }));
    expect((res as { status: number }).status).toBe(409);
  });
});
