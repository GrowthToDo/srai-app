/**
 * Practice-record marker helpers (shared, pure, no React).
 *
 * Practice-mode seeds records into the manager's REAL tables (staffLeave,
 * shiftSwapRequest, and the callouts / open shifts those approvals generate),
 * identified only by a "[PRACTICE]" marker embedded in one of their own text
 * fields — never by a schema column. Imported hospital data legitimately holds
 * REAL pending leave requests and open shifts too, so the list pages MUST be
 * able to tell a seeded practice row apart from a real one client-side. These
 * two helpers are that single source of truth: every list page detects with
 * `isPracticeText` and cleans the displayed copy with `stripPracticeMarker`.
 *
 * Detection is deliberately field-specific per page (documented in each page):
 *   leave       — notes (falls back to reason)
 *   swaps       — notes
 *   open-shifts — reasonDetail
 *   callouts    — reasonDetail (falls back to reason)
 */

/** The literal marker embedded in every seeded practice record. */
export const PRACTICE_MARKER = "[PRACTICE]";

/**
 * True when a record's marker field carries the "[PRACTICE]" tag. Null/undefined
 * (a real record with no notes) is safely not-practice.
 */
export function isPracticeText(
  value: string | null | undefined
): boolean {
  return typeof value === "string" && value.includes(PRACTICE_MARKER);
}

/**
 * Strip a leading "[PRACTICE] " (or bare "[PRACTICE]") prefix so the display copy
 * reads cleanly and the "Practice" badge carries the signal instead. Any marker
 * that appears mid-string is also removed. Returns "" for null/undefined.
 */
export function stripPracticeMarker(
  value: string | null | undefined
): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\[PRACTICE\]\s*/g, "")
    .trim();
}
