# Decision Log

Dated, append-only. One entry per decision: what + why. New architectural
decisions get appended in the same session they are made (CLAUDE.md rule).

- **2026-02 — Heuristic engine over CP-SAT.** Greedy construction + local
  search with 3 weight profiles (Balanced/Fair/Cost). Good-enough schedules in
  seconds on a $5 container; CP-SAT (OPTIMUS) parked as a spike until quality
  demands it.
- **2026-06 — Phase-selection optimizer guard REVERTED.** It fixed violation
  counts but tanked variant fairness (Balanced 69%→31%) because FAIR/COST
  derive from the Balanced base. Do not reintroduce without re-measuring all
  three variants.
- **2026-06 — Agency ranked last, always.** Candidate cost order is
  straight-time → overtime → agency; agency premium exceeds OT premium in
  practice, and CAH managers expect it.
- **2026-06 — Stateless HMAC session cookie over DB sessions.** Edge
  middleware can verify with Web Crypto only (no node:crypto/Buffer/DB in
  middleware); 30-day rolling `ssai_session`; revocation-by-rotation is
  acceptable at demo scale.
- **2026-06 — Auth is additive and flag-gated** (`AUTH_ENABLED`), so the
  no-auth local workflow and hosted demo coexist; nurse portal lives at `/my`,
  mobile-first, published-schedules-only.
- **2026-06 — Callout vs open shift split by leave length.** Leave ≤7 days →
  callout flow; >7 days → open shift (per-unit `calloutThresholdDays`,
  default 7).
- **2026-07 — Pre-commit verify gate + ratcheted tsc baseline.** Tests must
  pass and the type-error count may never rise; baseline auto-ratchets down.
  Chosen over CI because Railway build is the de-facto CI and the founder
  works solo-local.
- **2026-07 — Post-Fable operating model.** Opus orchestrates, Sonnet workers
  (`fast-worker`/`verifier`), Opus `deep-reasoner` for second opinions. Spec:
  docs/superpowers/specs/2026-07-03-post-fable-operating-system-design.md.
