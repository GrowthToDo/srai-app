/**
 * Pure eligibility filter for the "Ask for a swap → pick a colleague" list.
 *
 * The directed-swap approval path (PUT /api/swap-requests/[id]) hard-blocks any
 * role mismatch: a swap between two different roles is rejected with
 * `role-compatibility` before any other check. To keep the offer list free of
 * pairings that would be rejected at approval, a requester may only be offered
 * colleagues of the SAME role. This mirrors the engine's ROLE_RANK floor
 * (RN=3, LPN=2, CNA=1) collapsed to its only workable swap case — equal rank —
 * since a swap is a two-way trade and both directions must satisfy the floor,
 * which is only true when the ranks are equal (i.e. the roles match).
 *
 * DB-free so it is unit-testable. The route feeds it active staff rows.
 */

export interface SwapCandidateStaff {
  id: string;
  role: string;
  isActive: boolean;
}

/**
 * Filter a pool of staff to those eligible to be offered a directed swap by
 * `requester`: active, same role as the requester, and not the requester.
 */
export function eligibleSwapColleagues<T extends SwapCandidateStaff>(
  requester: { id: string; role: string },
  pool: T[]
): T[] {
  return pool.filter(
    (s) => s.isActive && s.id !== requester.id && s.role === requester.role
  );
}
