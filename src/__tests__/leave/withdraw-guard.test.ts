/**
 * Tests for DELETE /api/staff-leave/[id] — the nurse withdraw guard.
 *
 * Business rule (founder, 2026-08-15): a nurse may withdraw THEIR OWN request
 * while it is still pending. Once decided, coverage may already be in motion —
 * undoing is a manager action. Managers keep the unrestricted delete.
 *
 * Same mock strategy as denial-validation.test.ts: no real SQLite touched.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelectGet = vi.hoisted(() => vi.fn());
const mockDeleteRun = vi.hoisted(() => vi.fn());
const mockInsertRun = vi.hoisted(() => vi.fn());
const capturedInserts = vi.hoisted(() => [] as Record<string, unknown>[]);

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
  gte: vi.fn((a: unknown, b: unknown) => ({ _gte: [a, b] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ _lte: [a, b] })),
}));

vi.mock("@/db/schema", () => ({
  staffLeave: { id: "sl$id", staffId: "sl$staffId", status: "sl$status" },
  exceptionLog: { id: "el$id" },
  assignment: {
    id: "assign$id",
    staffId: "assign$staffId",
    status: "assign$status",
    shiftId: "assign$shiftId",
    scheduleId: "assign$scheduleId",
  },
  shift: { id: "shift$id", date: "shift$date" },
  schedule: { id: "sched$id", unit: "sched$unit" },
  unit: { id: "unit$id", name: "unit$name" },
  openShift: { id: "os$id" },
  callout: { id: "co$id" },
  staff: {
    id: "staff$id",
    firstName: "staff$firstName",
    lastName: "staff$lastName",
  },
}));

vi.mock("@/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromResult: any = {
    where: () => ({ get: mockSelectGet, all: vi.fn(() => []) }),
    all: vi.fn(() => []),
  };
  fromResult.innerJoin = () => fromResult;
  return {
    db: {
      select: () => ({ from: () => fromResult }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          capturedInserts.push(vals);
          return { run: mockInsertRun };
        },
      }),
      delete: () => ({ where: () => ({ run: mockDeleteRun }) }),
    },
  };
});

vi.mock("@/lib/coverage/find-candidates", () => ({
  findCandidatesForShift: vi.fn(async () => ({
    candidates: [],
    escalationStepsChecked: [],
  })),
}));

import { DELETE } from "@/app/api/staff-leave/[id]/route";

const LEAVE_ID = "leave-001";
const OWNER_ID = "staff-001";

const pendingLeave = {
  id: LEAVE_ID,
  staffId: OWNER_ID,
  leaveType: "vacation",
  startDate: "2026-09-01",
  endDate: "2026-09-02",
  status: "pending",
  reason: null,
};

function makeDelete(headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/staff-leave/${LEAVE_ID}`, {
    method: "DELETE",
    headers,
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: LEAVE_ID }) };
}

describe("staff-leave DELETE — nurse withdraw guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedInserts.length = 0;
    // First select = the leave row; second = the staff name lookup.
    mockSelectGet
      .mockReturnValueOnce(pendingLeave)
      .mockReturnValue({ firstName: "Jane", lastName: "Doe" });
  });

  it("nurse withdraws their own pending request", async () => {
    const res = await DELETE(
      makeDelete({ "x-user-role": "nurse", "x-staff-id": OWNER_ID }),
      makeParams(),
    );
    expect((res as { status: number }).status).toBe(200);
    expect(mockDeleteRun).toHaveBeenCalled();
  });

  it("nurse cannot withdraw someone else's request (403)", async () => {
    const res = await DELETE(
      makeDelete({ "x-user-role": "nurse", "x-staff-id": "staff-999" }),
      makeParams(),
    );
    expect((res as { status: number }).status).toBe(403);
    expect(mockDeleteRun).not.toHaveBeenCalled();
  });

  it("nurse cannot withdraw an already-approved request (409)", async () => {
    mockSelectGet.mockReset();
    mockSelectGet
      .mockReturnValueOnce({ ...pendingLeave, status: "approved" })
      .mockReturnValue({ firstName: "Jane", lastName: "Doe" });
    const res = await DELETE(
      makeDelete({ "x-user-role": "nurse", "x-staff-id": OWNER_ID }),
      makeParams(),
    );
    expect((res as { status: number }).status).toBe(409);
    expect(mockDeleteRun).not.toHaveBeenCalled();
  });

  it("manager delete stays unrestricted", async () => {
    mockSelectGet.mockReset();
    mockSelectGet
      .mockReturnValueOnce({ ...pendingLeave, status: "approved" })
      .mockReturnValue({ firstName: "Jane", lastName: "Doe" });
    const res = await DELETE(makeDelete(), makeParams());
    expect((res as { status: number }).status).toBe(200);
    expect(mockDeleteRun).toHaveBeenCalled();
  });

  it("audit entry says 'withdrawn by' and credits the nurse for the nurse path", async () => {
    await DELETE(
      makeDelete({ "x-user-role": "nurse", "x-staff-id": OWNER_ID }),
      makeParams(),
    );
    const audit = capturedInserts.find((v) => v.entityType === "leave");
    expect(audit).toBeDefined();
    expect(String(audit!.description)).toContain("withdrawn by Jane Doe");
    expect(audit!.performedBy).toBe("Jane Doe");
  });
});
