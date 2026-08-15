/**
 * Tests for POST/DELETE /api/my/open-shifts/[id]/interest — the raise-a-hand
 * guard rails.
 *
 * Business rules (founder direction 2026-08-15, production spec P7):
 * - interest requires a nurse identity (403 without x-staff-id)
 * - only fillable postings take interest (409 once filled/cancelled)
 * - a nurse cannot volunteer for their own vacated shift (409)
 * - the engine's eligibility list gates the hand (422 when not a candidate)
 * - duplicate hands are idempotent, not errors
 * - interest NEVER mutates assignments — it only inserts an interest row
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOpenShiftGet = vi.hoisted(() => vi.fn());
const mockInterestGet = vi.hoisted(() => vi.fn());
const mockStaffGet = vi.hoisted(() => vi.fn());
const mockInsertReturningGet = vi.hoisted(() => vi.fn());
const mockDeleteRun = vi.hoisted(() => vi.fn());
const mockCandidates = vi.hoisted(() => vi.fn());
const mockLogAudit = vi.hoisted(() => vi.fn());

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
  openShift: { _table: "openShift", id: "os$id" },
  openShiftInterest: {
    _table: "openShiftInterest",
    id: "osi$id",
    openShiftId: "osi$openShiftId",
    staffId: "osi$staffId",
  },
  staff: {
    _table: "staff",
    id: "staff$id",
    firstName: "staff$fn",
    lastName: "staff$ln",
  },
}));

vi.mock("@/db", () => {
  const makeFrom = (table: { _table: string }) => {
    const getFor = () => {
      if (table._table === "openShift") return mockOpenShiftGet;
      if (table._table === "openShiftInterest") return mockInterestGet;
      return mockStaffGet;
    };
    return {
      where: () => ({ get: getFor(), all: vi.fn(() => []) }),
    };
  };
  return {
    db: {
      select: () => ({ from: makeFrom }),
      insert: () => ({
        values: () => ({
          returning: () => ({ get: mockInsertReturningGet }),
          run: vi.fn(),
        }),
      }),
      delete: () => ({ where: () => ({ run: mockDeleteRun }) }),
    },
  };
});

vi.mock("@/lib/coverage/find-candidates", () => ({
  findCandidatesForShift: mockCandidates,
}));

vi.mock("@/lib/audit/logger", () => ({ logAuditEvent: mockLogAudit }));

import { POST, DELETE } from "@/app/api/my/open-shifts/[id]/interest/route";

const OPEN_SHIFT_ID = "os-001";
const NURSE_ID = "staff-042";

const pendingOpenShift = {
  id: OPEN_SHIFT_ID,
  shiftId: "shift-001",
  originalStaffId: "staff-001",
  status: "pending_approval",
};

function makeReq(
  method: "POST" | "DELETE",
  headers: Record<string, string> = {},
) {
  return new Request(
    `http://localhost/api/my/open-shifts/${OPEN_SHIFT_ID}/interest`,
    {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: method === "POST" ? "{}" : undefined,
    },
  );
}

function makeParams() {
  return { params: Promise.resolve({ id: OPEN_SHIFT_ID }) };
}

const nurseHeaders = { "x-user-role": "nurse", "x-staff-id": NURSE_ID };

describe("open-shift interest — raise a hand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenShiftGet.mockReturnValue(pendingOpenShift);
    mockInterestGet.mockReturnValue(undefined);
    mockStaffGet.mockReturnValue({ firstName: "Riley", lastName: "Nguyen" });
    mockInsertReturningGet.mockReturnValue({ id: "interest-1" });
    mockCandidates.mockResolvedValue({
      candidates: [
        { staffId: NURSE_ID, staffName: "Riley Nguyen", source: "per_diem" },
      ],
      escalationStepsChecked: [],
    });
  });

  it("eligible nurse raises a hand (201) and it is audit-logged", async () => {
    const res = await POST(makeReq("POST", nurseHeaders), makeParams());
    expect((res as { status: number }).status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "open_shift_interest",
        description: expect.stringContaining("Riley Nguyen"),
      }),
    );
  });

  it("no staff identity → 403", async () => {
    const res = await POST(makeReq("POST"), makeParams());
    expect((res as { status: number }).status).toBe(403);
  });

  it("filled posting no longer takes interest (409)", async () => {
    mockOpenShiftGet.mockReturnValue({ ...pendingOpenShift, status: "filled" });
    const res = await POST(makeReq("POST", nurseHeaders), makeParams());
    expect((res as { status: number }).status).toBe(409);
  });

  it("cannot volunteer for your own vacated shift (409)", async () => {
    mockOpenShiftGet.mockReturnValue({
      ...pendingOpenShift,
      originalStaffId: NURSE_ID,
    });
    const res = await POST(makeReq("POST", nurseHeaders), makeParams());
    expect((res as { status: number }).status).toBe(409);
  });

  it("rule-ineligible nurse is rejected (422) — engine gates the hand", async () => {
    mockCandidates.mockResolvedValue({
      candidates: [
        { staffId: "someone-else", staffName: "X", source: "float" },
      ],
      escalationStepsChecked: [],
    });
    const res = await POST(makeReq("POST", nurseHeaders), makeParams());
    expect((res as { status: number }).status).toBe(422);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("duplicate hand is idempotent, not an error", async () => {
    mockInterestGet.mockReturnValue({ id: "interest-1", staffId: NURSE_ID });
    const res = await POST(makeReq("POST", nurseHeaders), makeParams());
    expect((res as { status: number }).status).toBe(200);
    const body = (res as unknown as { _data: { alreadyInterested?: boolean } })
      ._data;
    expect(body.alreadyInterested).toBe(true);
  });

  it("withdraw deletes the hand and logs it", async () => {
    mockInterestGet.mockReturnValue({ id: "interest-1", staffId: NURSE_ID });
    const res = await DELETE(makeReq("DELETE", nurseHeaders), makeParams());
    expect((res as { status: number }).status).toBe(200);
    expect(mockDeleteRun).toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "open_shift_interest_withdrawn" }),
    );
  });
});
