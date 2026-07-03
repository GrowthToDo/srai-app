/**
 * Pure, DB-free helpers for the nurse portal (Phase 2). Extracted so the
 * next-shift selection and calendar grouping logic are unit-testable without
 * rendering React. No imports, no side effects.
 *
 * The schedule endpoint (GET /api/staff/[id]/schedule) returns day-bucketed
 * data: `{ days: DayData[] }` where each day has a `shifts` array and an
 * optional `leave`. These helpers flatten and select from that shape.
 */

export interface NurseShift {
  assignmentId: string;
  shiftId: string;
  date: string; // YYYY-MM-DD
  shiftType: string; // "day" | "night" | "evening" | ...
  shiftName: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationHours: number;
  unit: string;
  isChargeNurse: boolean;
  isOvertime: boolean;
  isFloat: boolean;
  floatFromUnit: string | null;
  status: string; // "assigned" | "called_out" | ...
  scheduleName: string;
  scheduleId: string;
}

export interface NurseLeave {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
}

export interface NurseDay {
  date: string;
  shifts: NurseShift[];
  leave: NurseLeave | null;
}

/** Flatten day buckets into a single date-sorted list of shifts. */
export function flattenShifts(days: NurseDay[]): NurseShift[] {
  const all: NurseShift[] = [];
  for (const d of days) {
    for (const s of d.shifts) all.push(s);
  }
  return all.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  );
}

/**
 * Upcoming shifts (today or later), soonest first, excluding those the nurse
 * has already called out of or that were cancelled/swapped away. `todayStr` is
 * an injectable YYYY-MM-DD so the selection is deterministic in tests.
 */
export function upcomingShifts(
  days: NurseDay[],
  todayStr: string,
  limit?: number
): NurseShift[] {
  const upcoming = flattenShifts(days).filter(
    (s) =>
      s.date >= todayStr &&
      s.status !== "cancelled" &&
      s.status !== "swapped"
  );
  return typeof limit === "number" ? upcoming.slice(0, limit) : upcoming;
}

/**
 * The single soonest upcoming shift the nurse is still on the hook for (not
 * called out / cancelled / swapped). Returns null when there is none.
 */
export function nextShift(days: NurseDay[], todayStr: string): NurseShift | null {
  const upcoming = flattenShifts(days).filter(
    (s) =>
      s.date >= todayStr &&
      s.status !== "called_out" &&
      s.status !== "cancelled" &&
      s.status !== "swapped"
  );
  return upcoming.length > 0 ? upcoming[0] : null;
}

/**
 * Whole-day difference between two YYYY-MM-DD strings (b - a), computed in UTC
 * to avoid DST drift. Used for the "in N days" countdown on the next-shift hero.
 */
export function daysBetween(aStr: string, bStr: string): number {
  const a = Date.parse(aStr + "T00:00:00Z");
  const b = Date.parse(bStr + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Friendly relative label for a shift date given today: "Today", "Tomorrow",
 * "in N days", or "" for anything in the past (shouldn't happen for upcoming).
 */
export function countdownLabel(todayStr: string, dateStr: string): string {
  const n = daysBetween(todayStr, dateStr);
  if (n <= 0) return n === 0 ? "Today" : "";
  if (n === 1) return "Tomorrow";
  return `in ${n} days`;
}
