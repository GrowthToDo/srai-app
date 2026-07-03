/**
 * Unit tests for src/lib/prn-availability.ts — pure date helpers shared by the
 * PRN availability API routes and UI (no DB).
 */
import { describe, it, expect } from "vitest";
import {
  PRN_TEMPLATE_SCHEDULE_ID,
  serializeAvailableDates,
  toIsoDate,
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
