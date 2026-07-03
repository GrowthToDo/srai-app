/**
 * Unit tests for the pure nurse-portal schedule helpers.
 */
import { describe, it, expect } from "vitest";
import {
  flattenShifts,
  upcomingShifts,
  nextShift,
  daysBetween,
  countdownLabel,
  type NurseDay,
  type NurseShift,
} from "@/lib/nurse/schedule-helpers";

function shift(overrides: Partial<NurseShift> & { date: string }): NurseShift {
  return {
    assignmentId: `a-${overrides.date}-${overrides.startTime ?? "07:00"}`,
    shiftId: `s-${overrides.date}`,
    shiftType: "day",
    shiftName: "Day",
    startTime: "07:00",
    endTime: "19:00",
    durationHours: 12,
    unit: "ICU",
    isChargeNurse: false,
    isOvertime: false,
    isFloat: false,
    floatFromUnit: null,
    status: "assigned",
    scheduleName: "Sched",
    scheduleId: "sched-1",
    ...overrides,
  };
}

function day(date: string, shifts: NurseShift[], leave: NurseDay["leave"] = null): NurseDay {
  return { date, shifts, leave };
}

describe("flattenShifts", () => {
  it("flattens and sorts by date then start time", () => {
    const days: NurseDay[] = [
      day("2026-07-10", [shift({ date: "2026-07-10", startTime: "19:00" })]),
      day("2026-07-05", [
        shift({ date: "2026-07-05", startTime: "19:00" }),
        shift({ date: "2026-07-05", startTime: "07:00" }),
      ]),
    ];
    const flat = flattenShifts(days);
    expect(flat.map((s) => `${s.date} ${s.startTime}`)).toEqual([
      "2026-07-05 07:00",
      "2026-07-05 19:00",
      "2026-07-10 19:00",
    ]);
  });

  it("returns empty for no shifts", () => {
    expect(flattenShifts([day("2026-07-01", [])])).toEqual([]);
  });
});

describe("upcomingShifts", () => {
  const days: NurseDay[] = [
    day("2026-07-01", [shift({ date: "2026-07-01" })]), // past
    day("2026-07-06", [shift({ date: "2026-07-06" })]), // today
    day("2026-07-08", [shift({ date: "2026-07-08", status: "cancelled" })]),
    day("2026-07-09", [shift({ date: "2026-07-09", status: "called_out" })]),
    day("2026-07-10", [shift({ date: "2026-07-10" })]),
  ];

  it("keeps today and future, drops past, cancelled, and swapped", () => {
    const up = upcomingShifts(days, "2026-07-06");
    expect(up.map((s) => s.date)).toEqual([
      "2026-07-06",
      "2026-07-09", // called_out still shows (nurse sees their called-out shift badge)
      "2026-07-10",
    ]);
  });

  it("respects the limit", () => {
    expect(upcomingShifts(days, "2026-07-06", 1).map((s) => s.date)).toEqual([
      "2026-07-06",
    ]);
  });
});

describe("nextShift", () => {
  it("returns the soonest shift the nurse is still on the hook for", () => {
    const days: NurseDay[] = [
      day("2026-07-06", [shift({ date: "2026-07-06", status: "called_out" })]),
      day("2026-07-07", [shift({ date: "2026-07-07" })]),
    ];
    const next = nextShift(days, "2026-07-06");
    expect(next?.date).toBe("2026-07-07");
  });

  it("returns null when nothing is upcoming", () => {
    const days: NurseDay[] = [day("2026-07-01", [shift({ date: "2026-07-01" })])];
    expect(nextShift(days, "2026-07-06")).toBeNull();
  });
});

describe("daysBetween", () => {
  it("counts whole days in UTC", () => {
    expect(daysBetween("2026-07-06", "2026-07-09")).toBe(3);
    expect(daysBetween("2026-07-06", "2026-07-06")).toBe(0);
  });
  it("crosses a month/DST boundary cleanly", () => {
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });
});

describe("countdownLabel", () => {
  it("labels today, tomorrow, and N days", () => {
    expect(countdownLabel("2026-07-06", "2026-07-06")).toBe("Today");
    expect(countdownLabel("2026-07-06", "2026-07-07")).toBe("Tomorrow");
    expect(countdownLabel("2026-07-06", "2026-07-09")).toBe("in 3 days");
  });
});
