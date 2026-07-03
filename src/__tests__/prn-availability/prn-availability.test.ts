/**
 * Unit tests for src/lib/prn-availability.ts — pure date helpers shared by the
 * PRN availability API routes and UI (no DB).
 */
import { describe, it, expect } from "vitest";
import {
  PRN_TEMPLATE_SCHEDULE_ID,
  serializeAvailableDates,
  toIsoDate,
  datesForWeekdays,
  togglePreset,
} from "@/lib/prn-availability";

describe("serializeAvailableDates", () => {
  it("de-duplicates and sorts chronologically", () => {
    expect(
      serializeAvailableDates([
        "2026-07-09",
        "2026-07-04",
        "2026-07-09",
        "2026-07-01",
      ])
    ).toEqual(["2026-07-01", "2026-07-04", "2026-07-09"]);
  });

  it("drops malformed and empty entries", () => {
    expect(
      serializeAvailableDates([
        "2026-07-04",
        "not-a-date",
        "",
        "2026-7-4",
        "  2026-07-05  ",
      ])
    ).toEqual(["2026-07-04", "2026-07-05"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(serializeAvailableDates([])).toEqual([]);
  });

  it("produces a plain JSON-serializable string[]", () => {
    const out = serializeAvailableDates(["2026-07-04"]);
    expect(JSON.parse(JSON.stringify(out))).toEqual(["2026-07-04"]);
  });
});

describe("toIsoDate", () => {
  it("formats a Date as local YYYY-MM-DD (not UTC-shifted)", () => {
    // Local midnight — must stay on the same calendar day regardless of tz.
    const d = new Date(2026, 6, 4, 0, 0, 0); // July 4, 2026 local
    expect(toIsoDate(d)).toBe("2026-07-04");
  });

  it("zero-pads month and day", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips through serializeAvailableDates", () => {
    const dates = [new Date(2026, 6, 9), new Date(2026, 6, 4)];
    expect(serializeAvailableDates(dates.map(toIsoDate))).toEqual([
      "2026-07-04",
      "2026-07-09",
    ]);
  });
});

describe("PRN_TEMPLATE_SCHEDULE_ID", () => {
  it("is the fixed FK anchor shared across import + UI submissions", () => {
    expect(PRN_TEMPLATE_SCHEDULE_ID).toBe(
      "00000000-0000-0000-0000-000000000001"
    );
  });
});

describe("datesForWeekdays", () => {
  it("includes both window edges when they match", () => {
    // Wed Jul 1, 2026 -> Fri Jul 3, 2026; ask for Wednesdays and Fridays.
    const from = new Date(2026, 6, 1);
    const to = new Date(2026, 6, 3);
    const dates = datesForWeekdays([3, 5], from, to); // Wed=3, Fri=5
    expect(dates.map(toIsoDate)).toEqual(["2026-07-01", "2026-07-03"]);
  });

  it("filters to only the requested weekdays across a full week", () => {
    // Sun Jul 5 .. Sat Jul 11, 2026 — a full week.
    const from = new Date(2026, 6, 5);
    const to = new Date(2026, 6, 11);
    const weekends = datesForWeekdays([0, 6], from, to);
    expect(weekends.map(toIsoDate)).toEqual(["2026-07-05", "2026-07-11"]);

    const weekdays = datesForWeekdays([1, 2, 3, 4, 5], from, to);
    expect(weekdays.map(toIsoDate)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ]);
  });

  it("returns an empty array when no weekday in range matches", () => {
    // A single Wednesday, asking only for Mondays.
    const from = new Date(2026, 6, 1);
    const to = new Date(2026, 6, 1);
    expect(datesForWeekdays([1], from, to)).toEqual([]);
  });

  it("returns a single date when from equals to and matches", () => {
    const day = new Date(2026, 6, 1); // Wednesday
    expect(datesForWeekdays([3], day, day).map(toIsoDate)).toEqual([
      "2026-07-01",
    ]);
  });
});

describe("togglePreset", () => {
  it("adds all preset dates when none are currently selected", () => {
    const preset = [new Date(2026, 6, 6), new Date(2026, 6, 7)];
    const result = togglePreset([], preset);
    expect(result.map(toIsoDate).sort()).toEqual([
      "2026-07-06",
      "2026-07-07",
    ]);
  });

  it("adds only the missing dates when the preset is partially selected", () => {
    const current = [new Date(2026, 6, 6)];
    const preset = [new Date(2026, 6, 6), new Date(2026, 6, 7)];
    const result = togglePreset(current, preset);
    expect(result.map(toIsoDate).sort()).toEqual([
      "2026-07-06",
      "2026-07-07",
    ]);
  });

  it("removes all preset dates when the full preset is already selected", () => {
    const current = [
      new Date(2026, 6, 6),
      new Date(2026, 6, 7),
      new Date(2026, 6, 8), // an extra date outside the preset
    ];
    const preset = [new Date(2026, 6, 6), new Date(2026, 6, 7)];
    const result = togglePreset(current, preset);
    expect(result.map(toIsoDate)).toEqual(["2026-07-08"]);
  });

  it("dedupes when the current selection already has duplicate-equivalent dates", () => {
    const current = [new Date(2026, 6, 6, 0, 0, 0)];
    const preset = [
      new Date(2026, 6, 6, 12, 30, 0), // same calendar day, different time
      new Date(2026, 6, 7),
    ];
    const result = togglePreset(current, preset);
    expect(result.map(toIsoDate).sort()).toEqual([
      "2026-07-06",
      "2026-07-07",
    ]);
    // No duplicate entries for the already-selected day.
    expect(result.map(toIsoDate)).toHaveLength(2);
  });

  it("no-ops (returns empty) when toggling an empty preset against an empty selection", () => {
    expect(togglePreset([], [])).toEqual([]);
  });
});
