# Post-Fable Operating System — Design

**Date:** 2026-07-03
**Status:** Approved by founder (approach C of A/B/C)
**Scope:** Scheduler repo only (`cah-scheduler`)

## Problem

Fable access ends 2026-07-07. After that, sessions run on Opus (orchestrator) +
Sonnet (workers). Today, four things live mostly in the Fable session's head,
not in the repo:

1. **Orchestration judgment** — how to decompose work, which model per task,
   when to trust vs verify.
2. **Catching subagent misreports** — subagents have under-reported their own
   edits by ~7x; Fable caught this by manually diffing. Nothing enforces it.
3. **Debugging discipline** — repro-first, regression-test-first, root-cause
   habits (e.g. the SQLITE_BUSY build race) are practiced, not written down.
4. **Context continuity** — a fresh session must re-derive the system map,
   env flags, and past decisions from scratch.

Goal: any fresh Opus session boots in minutes and executes at the current
quality bar, with the fragile steps enforced mechanically rather than
remembered.

## Decisions (from founder Q&A)

- Scope: scheduler repo only.
- All four gaps above matter; codify all of them.
- Topology: **Opus orchestrates** day-to-day; Sonnet does mechanical work.
- Enforcement: **blocking gates** (pre-commit hook), not advisory docs.

## Design — five components

### 1. CLAUDE.md rewrite (permanent operating model)

Replace the expiring "Orchestration workflow (ACTIVE ONLY until 2026-07-07,
Fable sessions only)" section with a permanent, model-agnostic **Operating
Model** section:

- **Topology:** the main session (Opus) plans, decomposes, reviews, and does
  design/debugging reasoning itself. Mechanical, well-specified work goes to
  named subagents (see component 4).
- **Spawn matrix:**
  - Architecture / root-cause debugging / high-stakes review → main session
    reasons directly (or spawns `deep-reasoner` for a parallel second opinion).
  - Boilerplate, tests, formatting, well-specified multi-file edits →
    `fast-worker`.
  - Checking another agent's claim → `verifier`.
- **Iron rule:** a subagent self-report is a hypothesis. Accept only after
  running `node scripts/ground-truth.mjs` and reading the actual diff.
- **Session boot ritual:** before the first edit of a session, read
  `docs/ARCHITECTURE.md`, `docs/KNOWN-TRAPS.md`, and `git log --oneline -10`.
- **Debugging protocol:** reproduce on a scratch copy of the DB first → write
  a failing regression test → fix the root cause (never the symptom) → verify
  gate. Never mutate the founder's live dev DB.
- **Doc maintenance rule:** a newly discovered trap or a new architectural
  decision must be written to `KNOWN-TRAPS.md` / `DECISIONS.md` in the same
  session it happens. Non-negotiable, same tier as the existing
  RULES_SPECIFICATION.md rule.

Also fix stale CLAUDE.md facts while rewriting: version line, "No
authentication system" (auth exists behind `AUTH_ENABLED`), build command
description (`build` is pure `next build` now; `prestart` runs drizzle-kit
push), nurse portal `/my`, notifications, onboarding guide — pointers only,
details live in ARCHITECTURE.md.

### 2. Blocking gate — `scripts/verify.mjs` + committed pre-commit hook

`node scripts/verify.mjs` runs, in order, failing fast with a named reason and
fix hint:

1. **Tests:** `vitest run` — 0 failures required.
2. **Types:** `tsc --noEmit` — error count must be ≤ the baseline stored in
   `scripts/tsc-baseline.json` (currently 22, all pre-existing in tests/
   scripts). If the current count is LOWER, the script rewrites the baseline
   down automatically (ratchet; never up) and tells the committer to stage it.
3. **Formatting:** `prettier --check` on staged files only (never repo-wide —
   founder rule).

Flags: `--skip-tests` exists for docs-only commits but prints a loud warning.
The production build smoke is NOT part of the gate (too slow for pre-commit;
Railway CI catches build breaks).

**Hook wiring:** committed `.githooks/pre-commit` (sh script, works under Git
for Windows) runs the verify script. Activated by `"prepare": "git config
core.hooksPath .githooks"` in package.json, so it survives clones with zero
extra dependencies (no husky).

### 3. Ground-truth script — `scripts/ground-truth.mjs`

One-screen mechanical report the orchestrator runs after every subagent,
before accepting its claim:

- `git diff --stat` (working tree vs HEAD by default; `--since <ref>` to
  compare against a pre-agent ref).
- Changed-file list with insertion/deletion counts.
- Test delta: current vitest pass/fail counts vs the last recorded run
  (`verify.mjs` writes its counts to `scripts/.verify-state.json`, gitignored;
  ground-truth reads it and re-runs vitest for the current number).
- tsc error count vs baseline.

Output is designed for eyeball comparison against the agent's self-report
(the mechanical version of what caught the 7x under-reported trim). Works on
both dirty and clean trees; a clean tree with a claim of "files edited" is
itself the red flag.

### 4. Named agents — `.claude/agents/`

Three committed agent definitions with pinned models and baked-in
instructions, so a weaker orchestrator cannot mis-prompt workers:

- **`fast-worker`** (model: sonnet) — executes well-specified implementation
  tasks. Baked in: run `node scripts/verify.mjs` before reporting done; report
  the exact `git diff --stat` output (not a summary); never touch the live dev
  DB; never create files/dirs named `prn` (reserved on Windows); follow
  existing code style.
- **`verifier`** (model: sonnet, read-only tools) — adversarial claim-checker.
  Input: another agent's report. Job: try to REFUTE it against the actual
  diff, tests, and file contents; return confirmed/refuted per claim.
- **`deep-reasoner`** (model: opus) — parallel second opinion on high-stakes
  design/debugging calls. Returns a concise conclusion, never file dumps.

### 5. Context docs

- **`docs/ARCHITECTURE.md`** — system map for session boot: scheduling engine
  (greedy + local search, 3 weight profiles), rule engine, onboarding guide
  stage machine, auth (stateless HMAC cookie, `AUTH_ENABLED`, roles), nurse
  portal `/my`, PRN availability flow, notifications, env flags, Railway
  pipeline (volumes runtime-only, prestart push, build config). Max ~1 page
  per subsystem; pointers into code, not duplicated logic.
- **`docs/KNOWN-TRAPS.md`** — the landmines learned by stepping on them:
  `prn` is a reserved Windows device name; PowerShell WriteAllText BOM /
  mojibake; Turbopack stale CSS (kill server + delete `.next`); Railway
  volumes mount at runtime only; next-build multi-worker SQLITE_BUSY/WAL race;
  all week math goes through `src/lib/date/week.ts`; `ignoreBuildErrors:
true` hides the 22 known tsc errors (check the count, not the build);
  auth/demo env flags; never mutate the live dev DB during agent work;
  scoped prettier only.
- **`docs/DECISIONS.md`** — dated one-liners with a "why" each: heuristic
  engine over CP-SAT (for now), stateless cookie over DB sessions, agency
  always ranked last, pilot offer retired, phase-selection guard reverted
  (fairness regression), etc. Append-only.

## Error handling

- Gate failures: named check, actual vs expected, one-line fix hint, non-zero
  exit. Hook prints how to bypass ONLY for the docs-only case.
- Ground-truth script: never fails; it reports. Missing baseline file → it
  says so and shows how to create it.
- Agent definitions: if a pinned model is unavailable, the Agent tool falls
  back per harness rules; instructions are model-independent.

## Testing

1. `verify.mjs` run against the current repo must pass at the 679-test /
   22-tsc-error baseline.
2. Ratchet test: temporarily lower baseline → verify fails; raise → auto-
   ratchets down.
3. Hook test: throwaway commit with a deliberate prettier violation → blocked;
   fix → passes. Then reset.
4. End-to-end smoke: spawn `fast-worker` on a trivial task, run
   `ground-truth.mjs`, have `verifier` check the report.

## Out of scope (YAGNI)

- Website repo (separate effort if wanted later).
- CI (GitHub Actions) — Railway build is the de-facto CI; revisit if a real
  pilot starts.
- Codex lane — plugin-dependent; the permanent CLAUDE.md section drops it.
- Auto-generated architecture docs — hand-written, maintained by the doc rule.
