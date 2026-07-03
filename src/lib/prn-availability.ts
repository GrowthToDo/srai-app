/**
 * Shared PRN-availability constants + pure helpers.
 *
 * Kept DB-free and side-effect-free so both the API routes and the client
 * pages can import them, and so the date-serialization logic is unit-testable
 * without a database.
 */

/**
 * Fixed schedule ID used as the FK anchor for ALL PRN availability rows.
 *
 * The rule engine loads PRN availability across every schedule (it never
 * filters by scheduleId), so this single anchor has no scheduling impact — it
 * only satisfies the `prn_availability.schedule_id` NOT NULL foreign key. The
 * Excel import route, the manager quick-entry dialog, and the nurse
 * self-service page all key their submissions to this same ID, which is why the
 * POST handler's upsert on (staffId, scheduleId) reliably de-dupes a nurse to a
 * single availability row.
 *
 * A matching schedule row ("PRN Import Template") is created by the seed and by
 * the import route; do not remove it.
 */
export const PRN_TEMPLATE_SCHEDULE_ID =
  "00000000-0000-0000-0000-000000000001";

/** Matches a YYYY-MM-DD calendar date. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a set of availability dates into the canonical stored form: a
 * de-duplicated, chronologically sorted array of YYYY-MM-DD strings with any
 * malformed entries dropped. `prn_availability.available_dates` is a JSON
 * `string[]` column, so this is the exact shape the POST/PUT handlers persist.
 */
export function serializeAvailableDates(dates: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of dates) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (ISO_DATE_RE.test(value)) {
      seen.add(value);
    }
  }
  return Array.from(seen).sort();
}

/** Format a Date as a local (not UTC) YYYY-MM-DD string. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Every local-time date in the inclusive [from, to] window whose `getDay()`
 * (0=Sun..6=Sat) is one of `weekdays`. Used to power the mass-select preset
 * chips ("Weekdays", "Weekends", "Mon", etc.) on the PRN availability
 * pickers. Comparisons stay in local time to match `toIsoDate`.
 */
export function datesForWeekdays(
  weekdays: readonly number[],
  from: Date,
  to: Date
): Date[] {
  const wanted = new Set(weekdays);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  const result: Date[] = [];
  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setDate(cursor.getDate() + 1)
  ) {
    if (wanted.has(cursor.getDay())) {
      result.push(new Date(cursor));
    }
  }
  return result;
}

/**
 * Toggle a preset's dates against the current selection: if every date in
 * `presetDates` is already selected (compared by `toIsoDate`), remove them
 * all; otherwise add whichever preset dates are missing. Pure and
 * dedupe-safe — used by the preset chip buttons above the multi-select
 * calendars.
 */
export function togglePreset(current: Date[], presetDates: Date[]): Date[] {
  const currentIso = new Set(current.map(toIsoDate));
  const presetIso = new Set(presetDates.map(toIsoDate));

  const allSelected =
    presetIso.size > 0 &&
    Array.from(presetIso).every((iso) => currentIso.has(iso));

  if (allSelected) {
    return current.filter((d) => !presetIso.has(toIsoDate(d)));
  }

  const additions = presetDates.filter((d) => !currentIso.has(toIsoDate(d)));
  return [...current, ...additions];
}
