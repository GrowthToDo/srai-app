# Post-Fable Operating System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify the Fable-era orchestration quality (gates, ground-truthing, agents, context docs) into the scheduler repo so Opus+Sonnet sessions execute at the same bar after 2026-07-07.

**Architecture:** Two Node scripts (`verify.mjs` blocking gate, `ground-truth.mjs` claim report) wired to a committed pre-commit hook; three named agent definitions in `.claude/agents/`; three context docs; a permanent Operating Model section replacing the expiring Fable section in CLAUDE.md.

**Tech Stack:** Plain Node 20 `.mjs` scripts (no new deps), sh pre-commit hook via `core.hooksPath`, Claude Code agent markdown format.

**Spec:** `docs/superpowers/specs/2026-07-03-post-fable-operating-system-design.md`

## Global Constraints

- No new npm dependencies (no husky; hooks via `core.hooksPath .githooks`).
- Prettier is only ever run on specific files, never repo-wide (founder rule).
- Never mutate the founder's live dev DB (`cah-scheduler.db` in repo root) — scripts read git/test/tsc state only.
- Never create a file or directory named exactly `prn` (reserved Windows device name).
- Current baselines: **679 vitest tests passing, 0 failing; 22 pre-existing tsc errors** (all in tests/scripts; app compiles clean).
- Repo root: `D:\Pradeep\Personal\Projects\Nurse-scheduling new`. All paths below relative to it.
- Every commit message ends with `Co-Authored-By:` trailer per harness rules.

---

### Task 1: `scripts/verify.mjs` blocking gate + tsc baseline

**Files:**

- Create: `scripts/verify.mjs`
- Create: `scripts/tsc-baseline.json`
- Modify: `package.json` (add `verify` script)
- Modify: `.gitignore` (add `scripts/.verify-state.json`)

**Interfaces:**

- Produces: `node scripts/verify.mjs [--skip-tests]` — exit 0 = gate passed; nonzero with named reason. Writes `scripts/.verify-state.json` (`{ testsPassed, testsFailed, tscErrors, at }`) consumed by Task 3.
- Produces: `scripts/tsc-baseline.json` (`{ "maxErrors": 22 }`) consumed by Tasks 2 and 3.

- [ ] **Step 1: Write `scripts/tsc-baseline.json`**

```json
{ "maxErrors": 22 }
```

- [ ] **Step 2: Write `scripts/verify.mjs`**

```js
#!/usr/bin/env node
/**
 * Blocking verification gate (spec: docs/superpowers/specs/2026-07-03-post-fable-operating-system-design.md).
 * Checks, in order, failing fast with a named reason + fix hint:
 *   1. vitest run          — 0 failures required          (--skip-tests to bypass, loudly)
 *   2. tsc --noEmit        — error count <= baseline; auto-ratchets baseline DOWN
 *   3. prettier --check    — staged files only, never repo-wide
 * Writes scripts/.verify-state.json for ground-truth.mjs.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
const baselinePath = path.join(scriptsDir, "tsc-baseline.json");
const statePath = path.join(scriptsDir, ".verify-state.json");
const skipTests = process.argv.includes("--skip-tests");

function run(cmd, args) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: res.status ?? 1,
    out: `${res.stdout ?? ""}\n${res.stderr ?? ""}`,
  };
}

function fail(check, actual, expected, hint) {
  console.error(`\n✗ GATE FAILED — ${check}`);
  console.error(`  actual:   ${actual}`);
  console.error(`  expected: ${expected}`);
  console.error(`  fix:      ${hint}`);
  process.exit(1);
}

const state = {
  testsPassed: null,
  testsFailed: null,
  tscErrors: null,
  at: new Date().toISOString(),
};

// ── 1. Tests ────────────────────────────────────────────────────────────────
if (skipTests) {
  console.warn(
    "⚠⚠⚠  --skip-tests: TEST SUITE NOT RUN. Only acceptable for docs-only commits.  ⚠⚠⚠",
  );
} else {
  console.log("[1/3] vitest run …");
  const t = run("npx", ["vitest", "run", "--reporter=default"]);
  const passed = t.out.match(/Tests\s+(\d+)\s+passed/);
  const failed = t.out.match(/(\d+)\s+failed/);
  state.testsPassed = passed ? Number(passed[1]) : null;
  state.testsFailed = failed ? Number(failed[1]) : 0;
  if (t.code !== 0 || state.testsFailed > 0 || state.testsPassed === null) {
    console.error(t.out.split("\n").slice(-30).join("\n"));
    fail(
      "tests",
      `${state.testsFailed ?? "?"} failed / exit ${t.code}`,
      "0 failed",
      "run `npx vitest run` and fix failures before committing",
    );
  }
  console.log(`      ✓ ${state.testsPassed} tests passed`);
}

// ── 2. Types (ratcheted baseline) ───────────────────────────────────────────
console.log("[2/3] tsc --noEmit …");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")).maxErrors;
const ts = run("npx", ["tsc", "--noEmit"]);
const tscErrors = (ts.out.match(/error TS\d+/g) ?? []).length;
state.tscErrors = tscErrors;
if (tscErrors > baseline) {
  console.error(
    ts.out
      .split("\n")
      .filter((l) => /error TS\d+/.test(l))
      .slice(0, 20)
      .join("\n"),
  );
  fail(
    "typescript",
    `${tscErrors} errors`,
    `<= ${baseline} (baseline)`,
    "you introduced new type errors — fix them (the app build ignores tsc, so this gate is the only thing watching)",
  );
}
if (tscErrors < baseline) {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ maxErrors: tscErrors }) + "\n",
  );
  console.log(
    `      ✓ ${tscErrors} errors — baseline ratcheted ${baseline} → ${tscErrors}. Stage scripts/tsc-baseline.json with this commit.`,
  );
} else {
  console.log(`      ✓ ${tscErrors} errors (== baseline)`);
}

// ── 3. Prettier on staged files only ────────────────────────────────────────
console.log("[3/3] prettier --check (staged files) …");
const stagedRaw = run("git", [
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMR",
]).out;
const staged = stagedRaw
  .split("\n")
  .map((f) => f.trim())
  .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css)$/.test(f))
  .filter((f) => fs.existsSync(path.join(root, f)));
if (staged.length === 0) {
  console.log("      ✓ no staged formattable files — skipped");
} else {
  const p = run("npx", [
    "prettier",
    "--check",
    ...staged.map((f) => JSON.stringify(f)),
  ]);
  if (p.code !== 0) {
    console.error(p.out.trim());
    fail(
      "prettier",
      "staged files not formatted",
      "prettier-clean",
      `npx prettier --write ${staged.join(" ")} && git add ${staged.join(" ")}`,
    );
  }
  console.log(`      ✓ ${staged.length} staged files formatted`);
}

fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log("\n✓ GATE PASSED");
```

- [ ] **Step 3: Add npm script + gitignore entry**

In `package.json` `"scripts"`, add:

```json
"verify": "node scripts/verify.mjs"
```

Append to `.gitignore`:

```
scripts/.verify-state.json
```

- [ ] **Step 4: Run the gate against the current repo — must pass**

Run: `npm run verify`
Expected: `[1/3] … ✓ 679 tests passed`, `[2/3] … ✓ 22 errors (== baseline)`, `[3/3] … skipped or ✓`, `✓ GATE PASSED`, exit 0. `scripts/.verify-state.json` exists and shows `"testsPassed": 679, "tscErrors": 22`.

- [ ] **Step 5: Ratchet + failure behavior test**

Run: edit `scripts/tsc-baseline.json` to `{ "maxErrors": 10 }`, run `npm run verify` → Expected: `✗ GATE FAILED — typescript`, exit 1.
Then set `{ "maxErrors": 30 }`, run again → Expected: pass, and file auto-rewritten to `{ "maxErrors": 22 }` (ratchet down).
Confirm file ends at `{ "maxErrors": 22 }`.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify.mjs scripts/tsc-baseline.json package.json .gitignore
git commit -m "feat(gate): verify.mjs blocking gate (tests, ratcheted tsc baseline, staged prettier)"
```

---

### Task 2: Committed pre-commit hook

**Files:**

- Create: `.githooks/pre-commit`
- Modify: `package.json` (add `prepare` script)

**Interfaces:**

- Consumes: `node scripts/verify.mjs [--skip-tests]` from Task 1.
- Produces: every `git commit` in this repo runs the gate; `VERIFY_SKIP_TESTS=1 git commit …` = docs-only escape hatch.

- [ ] **Step 1: Write `.githooks/pre-commit`**

```sh
#!/bin/sh
# Blocking verify gate — see docs/superpowers/specs/2026-07-03-post-fable-operating-system-design.md
# Docs-only escape hatch: VERIFY_SKIP_TESTS=1 git commit …  (tests skipped, tsc+prettier still enforced)
if [ "$VERIFY_SKIP_TESTS" = "1" ]; then
  node scripts/verify.mjs --skip-tests
else
  node scripts/verify.mjs
fi
status=$?
if [ $status -ne 0 ]; then
  echo ""
  echo "Commit blocked by the verify gate (see failure above)."
  echo "Docs-only commit? Re-run as: VERIFY_SKIP_TESTS=1 git commit …"
  exit $status
fi
```

- [ ] **Step 2: Wire it up**

In `package.json` `"scripts"`, add (keep any existing prepare content if present — check first):

```json
"prepare": "git config core.hooksPath .githooks"
```

Run: `npm run prepare` then `git config core.hooksPath`
Expected: prints `.githooks`

- [ ] **Step 3: Hook blocks a bad commit**

Create `scratch-hook-test.ts` in repo root containing exactly `const x   =   1;;;` (deliberately unformatted; also stage it):

Run: `git add scratch-hook-test.ts && git commit -m "hook test"`
Expected: commit BLOCKED (prettier check fails on the staged file; tests+tsc pass first — this takes ~1-2 min).
Then clean up: `git reset HEAD scratch-hook-test.ts && rm scratch-hook-test.ts`

- [ ] **Step 4: Commit (hook now guards this very commit)**

```bash
git add .githooks/pre-commit package.json
git commit -m "feat(gate): committed pre-commit hook via core.hooksPath (no husky)"
```

Expected: gate runs during this commit and passes.

---

### Task 3: `scripts/ground-truth.mjs` claim report

**Files:**

- Create: `scripts/ground-truth.mjs`
- Modify: `package.json` (add `ground-truth` script)

**Interfaces:**

- Consumes: `scripts/.verify-state.json` + `scripts/tsc-baseline.json` from Task 1.
- Produces: `node scripts/ground-truth.mjs [--since <ref>] [--full]` — always exits 0; prints diff stat, changed/untracked files, test + tsc deltas. `--full` re-runs vitest+tsc for live numbers; default is fast (git-only + last recorded state).

- [ ] **Step 1: Write `scripts/ground-truth.mjs`**

```js
#!/usr/bin/env node
/**
 * Ground-truth report: mechanical facts to compare against a subagent's
 * self-report. A self-report is a hypothesis; this output is the fact.
 * Never fails — it reports. (spec: docs/superpowers/specs/2026-07-03-…-design.md)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const ref = sinceIdx !== -1 ? args[sinceIdx + 1] : "HEAD";
const full = args.includes("--full");

function run(cmd, cmdArgs) {
  const res = spawnSync(cmd, cmdArgs, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
}

console.log(`── GROUND TRUTH (vs ${ref}) ──────────────────────────────`);

console.log("\n# git diff --stat");
console.log(run("git", ["diff", ref, "--stat"]) || "(no tracked changes)");

const untracked = run("git", ["ls-files", "--others", "--exclude-standard"]);
console.log("\n# untracked files");
console.log(untracked || "(none)");

console.log("\n# staged (git diff --cached --stat)");
console.log(run("git", ["diff", "--cached", "--stat"]) || "(nothing staged)");

// Baselines
let baseline = "?";
try {
  baseline = JSON.parse(
    fs.readFileSync(path.join(scriptsDir, "tsc-baseline.json"), "utf8"),
  ).maxErrors;
} catch {}
let last = null;
try {
  last = JSON.parse(
    fs.readFileSync(path.join(scriptsDir, ".verify-state.json"), "utf8"),
  );
} catch {}

console.log("\n# recorded state (last verify run)");
console.log(
  last
    ? `${last.testsPassed} tests passed, ${last.testsFailed} failed, ${last.tscErrors} tsc errors — at ${last.at}`
    : "(none — run `npm run verify` to record one)",
);
console.log(`tsc baseline: ${baseline}`);

if (full) {
  console.log("\n# live run (--full)");
  const t = run("npx", ["vitest", "run", "--reporter=default"]);
  const passed = t.match(/Tests\s+(\d+)\s+passed/)?.[1] ?? "?";
  const failed = t.match(/(\d+)\s+failed/)?.[1] ?? "0";
  const tsOut = run("npx", ["tsc", "--noEmit"]);
  const tscNow = (tsOut.match(/error TS\d+/g) ?? []).length;
  console.log(`tests now: ${passed} passed, ${failed} failed`);
  console.log(`tsc now:   ${tscNow} errors (baseline ${baseline})`);
  if (last) {
    console.log(
      `delta:     tests ${passed - last.testsPassed >= 0 ? "+" : ""}${passed - last.testsPassed}, tsc ${tscNow - last.tscErrors >= 0 ? "+" : ""}${tscNow - last.tscErrors}`,
    );
  }
}

console.log(
  "\n── Compare the above against the agent's claim. Clean tree + a claim of edits = red flag. ──",
);
```

- [ ] **Step 2: Add npm script**

```json
"ground-truth": "node scripts/ground-truth.mjs"
```

- [ ] **Step 3: Verify on dirty and clean tree**

Run: `npm run ground-truth` (tree currently has this task's uncommitted files)
Expected: diff --stat empty, untracked shows `scripts/ground-truth.mjs`, recorded state shows 679/0/22, exit 0.
Run: `npm run ground-truth -- --since HEAD~2`
Expected: stat vs 2 commits back, exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/ground-truth.mjs package.json
git commit -m "feat(gate): ground-truth.mjs — mechanical subagent claim report"
```

---

### Task 4: Named agents in `.claude/agents/`

**Files:**

- Create: `.claude/agents/fast-worker.md`
- Create: `.claude/agents/verifier.md`
- Create: `.claude/agents/deep-reasoner.md`

**Interfaces:**

- Consumes: `npm run verify`, `npm run ground-truth` from Tasks 1+3.
- Produces: agent types `fast-worker`, `verifier`, `deep-reasoner` invocable via the Agent tool's `subagent_type` (they appear in the agent registry once committed).

- [ ] **Step 1: Write `.claude/agents/fast-worker.md`**

```markdown
---
name: fast-worker
description: Executes well-specified, mechanical implementation tasks (boilerplate, tests, formatting, multi-file edits with precise specs). Use for work where the spec is complete and judgment calls are not expected.
model: sonnet
---

You are the fast-worker for the CAH Scheduler repo. You execute precisely
specified tasks. You do not redesign, expand scope, or make judgment calls —
if the spec is ambiguous, stop and report the ambiguity instead of guessing.

Hard rules (violating any of these makes your work unusable):

1. Before reporting done, run `npm run verify` and include its final line in
   your report. If the gate fails, fix your work until it passes — do not
   report done with a failing gate.
2. Your report MUST include the verbatim output of `git diff --stat` — the
   exact command output, not a summary or estimate. Self-reported numbers
   without this are discarded.
3. Never read from or write to `cah-scheduler.db` (the founder's live dev DB)
   or run seed/db-push commands unless the task explicitly says to.
4. Never create a file or directory named exactly `prn` — it is a reserved
   Windows device name and breaks git. Use `prn-availability` style names.
5. Match the surrounding code's style, comment density, and idioms. Read
   neighboring files before writing.
6. Run prettier only on files you changed, never repo-wide.
7. Do not commit unless the task explicitly says to commit.

Report format: what you changed and why (2-4 sentences), the verbatim
`git diff --stat`, the verify gate result line, any deviations from spec.
```

- [ ] **Step 2: Write `.claude/agents/verifier.md`**

```markdown
---
name: verifier
description: Adversarial claim-checker. Given another agent's report of completed work, tries to REFUTE each claim against the actual diff, tests, and file contents. Use after any subagent whose work matters.
model: sonnet
tools: Read, Grep, Glob, Bash
---

You are the verifier for the CAH Scheduler repo. You receive another agent's
self-report. Your job is to try to REFUTE it — assume it is wrong until the
evidence says otherwise. Past agents have under-reported their own edits by
7x; your skepticism is the defense.

Method:

1. Run `npm run ground-truth` (add `-- --since <ref>` if given a pre-work ref)
   and compare every number in the claim against it.
2. For each claimed change: open the file, confirm the change exists and does
   what is claimed. For each claimed test: confirm the test file exists and
   the test name appears in it.
3. Check for UNCLAIMED changes: files in the diff the report never mentions.
4. Check for collateral damage: deleted code, removed tests, changed baselines
   the report does not justify.
5. You are read-only with respect to the work: never fix, revert, or improve
   anything. Bash is for git/test/type commands only.

Return a verdict table: each claim → CONFIRMED / REFUTED / UNVERIFIABLE, with
one line of evidence each, then a final PASS/FAIL with the single most
important discrepancy first. A clean working tree plus a claim of edits is an
automatic FAIL.
```

- [ ] **Step 3: Write `.claude/agents/deep-reasoner.md`**

```markdown
---
name: deep-reasoner
description: Second opinion on high-stakes design and debugging calls (architecture choices, root-cause analysis, risky migrations). Spawn in parallel with the main session's own reasoning; synthesize both.
model: opus
---

You are the deep-reasoner for the CAH Scheduler repo (Next.js 16 App Router,
React 19, better-sqlite3 + Drizzle, synchronous DB, heuristic scheduling
engine under src/lib/engine/scheduler/). You think through hard problems and
return a conclusion the orchestrator can act on.

Rules:

1. Read `docs/ARCHITECTURE.md` and `docs/KNOWN-TRAPS.md` before reasoning —
   this repo has non-obvious constraints (Railway volumes are runtime-only,
   all week math must go through src/lib/date/week.ts, tsc errors are hidden
   from the build by ignoreBuildErrors).
2. Ground every recommendation in real hospital operations: payroll cost,
   nurse fatigue, charge-nurse coverage, what a 25-bed CAH scheduling manager
   would actually do. A technically elegant answer that fails this test is a
   wrong answer.
3. Debugging: reproduce before theorizing; name the root cause, not the
   symptom; propose the regression test that would have caught it.
4. Return a CONCISE conclusion: the decision, why, the two strongest
   objections you considered, and concrete next actions. No file dumps, no
   exhaustive surveys.
```

- [ ] **Step 4: Verify agent registry picks them up**

Run: from a Claude Code session in this repo, check the available-agents list (or `ls .claude/agents/`).
Expected: three files exist; frontmatter parses (name/description/model lines present, `---` fences intact).

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/
git commit -m "feat(agents): fast-worker, verifier, deep-reasoner pinned agent definitions"
```

---

### Task 5: `docs/KNOWN-TRAPS.md` + `docs/DECISIONS.md`

**Files:**

- Create: `docs/KNOWN-TRAPS.md`
- Create: `docs/DECISIONS.md`

**Interfaces:**

- Produces: the two docs the CLAUDE.md boot ritual (Task 7) and deep-reasoner (Task 4) reference by exact path.

- [ ] **Step 1: Write `docs/KNOWN-TRAPS.md`** (content below is the verified trap list from the Fable era; keep entries terse — symptom, cause, rule)

```markdown
# Known Traps

Landmines this repo has already stepped on. Read before your first edit of a
session. When you discover a new one, add it HERE in the same session — that
rule is in CLAUDE.md and is not optional.

## Windows / tooling

- **`prn` is a reserved DOS device name.** Git cannot open files or dirs named
  exactly `prn` ("No such file or directory" while the file visibly exists).
  Use `prn-availability` style names. Same family: `con`, `aux`, `nul`.
- **PowerShell file writes add BOM / cause mojibake.** `WriteAllText` and
  `Out-File` default to BOM'd encodings that break tooling. Prefer the Edit
  tool; if scripting, use `New-Object System.Text.UTF8Encoding($false)` and
  verify the bytes afterward.
- **Turbopack serves stale CSS across restarts.** If a style edit refuses to
  appear: kill the dev server AND `rm -rf .next`, then restart.
- **Prettier repo-wide is forbidden.** It churns unrelated files and the
  founder reverts it. Only ever format the files you changed.

## Build / deploy (Railway)

- **Volumes mount at RUNTIME only.** During `next build` the volume dir does
  not exist; `src/db/index.ts` mkdirs the DB dir so build-time module eval
  survives. Never assume `/data` exists at build.
- **`next build` page-data collection uses multiple workers**, each opening
  its own SQLite connection to a fresh throwaway DB → they race on the
  DELETE→WAL conversion → `SQLITE_BUSY`. Defenses live in `src/db/index.ts`
  (busy timeout, open retry, tolerated WAL race). Never fires locally because
  the local DB is already WAL — do not "simplify" this away.
- **`typescript.ignoreBuildErrors: true` is set** (next.config). The build
  passing says nothing about types. The verify gate's ratcheted baseline
  (currently 22 pre-existing errors, all in tests/scripts) is the only type
  watchdog. Check the count, not the build.
- **Build script must stay pure `next build`.** Schema push happens at
  `prestart` (drizzle-kit push against the mounted volume), not at build.

## Data / domain

- **Never mutate the founder's live dev DB** (`cah-scheduler.db`) during agent
  work — he tests against it between sessions. Debug on a scratch copy
  (`cp cah-scheduler.db <scratchpad>/…`) first.
- **All week math goes through `src/lib/date/week.ts`** (UTC-safe Mon–Sun).
  Hand-rolled `getDay()` arithmetic has already caused a 24h-vs-36h weekly
  hours bug. If you need week bounds, import them.
- **Agency staff must ALWAYS rank last** in candidate suggestions regardless
  of overtime status — cost order is straight-time → OT → agency. A past sort
  change silently ranked agency #1; the regression test in
  `src/lib/coverage/` guards it.
- **Auth is flag-gated.** `AUTH_ENABLED !== "true"` = total no-op (no login,
  no middleware). Demo accounts + local run command: `DEMO-LOGINS.md`.
  Excel import cascade-deletes nurse logins; `provisionAuthUsers()` re-creates
  them post-import — keep that call if you touch the import route.

## Process

- **A subagent's self-report is a hypothesis.** One under-reported its edits
  by ~7x. `npm run ground-truth` prints the facts; the verifier agent
  adversarially checks claims. Accept nothing without the diff.
```

- [ ] **Step 2: Write `docs/DECISIONS.md`**

```markdown
# Decision Log

Dated, append-only. One entry per decision: what + why. New architectural
decisions get appended in the same session they are made (CLAUDE.md rule).

- **2025-XX — Heuristic engine over CP-SAT.** Greedy construction + local
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
```

(Implementer: fix the `2025-XX` placeholder by checking `git log` for when the scheduler engine landed — use that month.)

- [ ] **Step 3: Verify + commit**

Run: `npx prettier --write docs/KNOWN-TRAPS.md docs/DECISIONS.md`

```bash
git add docs/KNOWN-TRAPS.md docs/DECISIONS.md
git commit -m "docs: KNOWN-TRAPS + DECISIONS — codified Fable-era institutional knowledge"
```

---

### Task 6: `docs/ARCHITECTURE.md` system map

**Files:**

- Create: `docs/ARCHITECTURE.md`

**Interfaces:**

- Consumes: nothing. Written from the code itself (verify every claim by reading the referenced file — do not trust memory).
- Produces: the boot document CLAUDE.md (Task 7) references.

- [ ] **Step 1: Write `docs/ARCHITECTURE.md`** with exactly these sections, each ≤1 page, each ending with "Key files:" pointers. Facts to cover per section (verify each against code before writing):

```markdown
# Architecture

Session-boot system map. Pointers, not duplicated logic — code is the truth.
Sections: Scheduling engine · Rule engine · Onboarding guide · Auth ·
Nurse portal · PRN availability · Notifications · Env flags · Deploy pipeline.
```

1. **Scheduling engine** — greedy construction (`greedy.ts`) then local-search swap improvement (`local-search.ts`); 3 weight profiles (BALANCED/FAIR/COST_OPTIMIZED in `weight-profiles.ts`); FAIR/COST variants derive from the Balanced base (why the reverted guard broke them); `runner.ts` writes 3 variants + `generation_job` rows. Key files: `src/lib/engine/scheduler/*`.
2. **Rule engine** — 13 hard rules (blocking) + 8 soft rules (scored); evaluators in `src/lib/engine/rules/`, registered in `rules/index.ts`; UI language is "compliance rules"/"fairness rules". Full spec: `RULES_SPECIFICATION.md`.
3. **Onboarding guide** — pure stage machine S0–S7 in `src/lib/onboarding/guide.ts`; provider/hook `use-onboarding.tsx`; `fcg:*` localStorage flags; `onboarding-refresh`/`onboarding-reset` window events; practice tutorial seeds `[PRACTICE]` records via `/api/practice-examples` with transactional teardown.
4. **Auth** — additive `user` table; scrypt hashes; stateless HMAC-SHA-256 cookie (`ssai_session`, Web Crypto only, Edge-safe) in `src/lib/auth/session.ts`; role map `roles.ts`; middleware gates only when `AUTH_ENABLED==="true"`; `provisionAuthUsers` re-creates demo logins post-import; demo creds in `DEMO-LOGINS.md`.
5. **Nurse portal** — `/my` mobile-first (max-w-md, bottom tabs); published schedules only; server stamps nurse `staffId` from `x-staff-id` header on POSTs; swap accept keeps manager final approval.
6. **PRN availability** — template-schedule upsert keyed (staffId, scheduleId) in `/api/prn-availability`; shared `RecordAvailabilityDialog`; preset chips (`src/lib/prn-availability.ts` `togglePreset`/`datesForWeekdays`); nurse self-serve at `/my/availability` (per_diem only).
7. **Notifications** — additive `notification` table; fail-safe triggers (publish, swap lifecycle, leave decisions); `/api/my/notifications`.
8. **Env flags** — `AUTH_ENABLED`, `AUTH_SECRET`, `DEMO_PREFILL`, `SEED_MANAGER_EMAIL/PASSWORD`, `DATABASE_PATH`.
9. **Deploy (Railway)** — volume at `/data` runtime-only; `build` = pure `next build`; `prestart` = drizzle-kit push; `ignoreBuildErrors: true` (verify gate owns types); SQLITE_BUSY defenses in `src/db/index.ts`.

- [ ] **Step 2: Fact-check pass**

For each section, open at least the primary key file and confirm one load-bearing fact (e.g., `grep -n "S7" src/lib/onboarding/guide.ts`, `grep -n "AUTH_ENABLED" src/middleware.ts`). Fix anything stale.

- [ ] **Step 3: Prettier + commit**

```bash
npx prettier --write docs/ARCHITECTURE.md
git add docs/ARCHITECTURE.md
git commit -m "docs: ARCHITECTURE.md — session-boot system map"
```

---

### Task 7: CLAUDE.md rewrite (permanent Operating Model + stale-fact fixes)

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: every artifact above by exact path/name (`npm run verify`, `npm run ground-truth`, `fast-worker`, `verifier`, `deep-reasoner`, `docs/ARCHITECTURE.md`, `docs/KNOWN-TRAPS.md`, `docs/DECISIONS.md`).

- [ ] **Step 1: Delete the expiring section**

Remove the entire `## Orchestration workflow (ACTIVE ONLY until 2026-07-07, Fable sessions only)` section (currently the last section of CLAUDE.md).

- [ ] **Step 2: Insert the permanent Operating Model section** (place it right after "Working Style Preferences"):

```markdown
## Operating Model (permanent, model-agnostic)

The main session orchestrates: plan, decompose, review, synthesize. Mechanical
work goes to named subagents. This holds for any main-session model.

### Session boot ritual (before the first edit)

1. Read `docs/ARCHITECTURE.md` (system map) and `docs/KNOWN-TRAPS.md`.
2. `git log --oneline -10` for recent movement.
3. Check `scripts/tsc-baseline.json` for the current type-error baseline.

### Spawn matrix

| Work                                                   | Who                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Architecture, root-cause debugging, high-stakes review | Main session reasons directly                               |
| Second opinion on a high-stakes call                   | `deep-reasoner` agent, in parallel; synthesize both answers |
| Boilerplate, tests, formatting, well-specified edits   | `fast-worker` agent (precise spec, no judgment calls)       |
| Checking any subagent's claim                          | `verifier` agent, or `npm run ground-truth` + read the diff |

### Iron rules

- **A subagent self-report is a hypothesis.** Accept only after
  `npm run ground-truth` (compare its output to the claim) or a `verifier`
  pass. A clean tree plus a claim of edits is an automatic reject.
- **The verify gate is blocking.** `npm run verify` runs on every commit via
  the pre-commit hook: tests must pass, tsc errors ≤ ratcheted baseline,
  staged files prettier-clean. `VERIFY_SKIP_TESTS=1` exists for docs-only
  commits and nothing else.
- **Debugging protocol:** reproduce on a scratch COPY of the DB (never the
  live `cah-scheduler.db`) → write the failing regression test → fix the root
  cause, not the symptom → gate.
- **Doc maintenance:** a new trap → `docs/KNOWN-TRAPS.md`; a new architectural
  decision → `docs/DECISIONS.md`; same session, no exceptions — same tier as
  the RULES_SPECIFICATION.md rule above.
```

- [ ] **Step 3: Fix stale facts elsewhere in CLAUDE.md**

- Version line `1.7.0` → current (check `package.json` / `CHANGELOG.md`).
- `npm run build # db:push + db:seed + next build` → `npm run build # pure next build (schema push happens at prestart)`.
- Important Notes: replace `**No authentication system** — assumed internal hospital use` with `**Auth is flag-gated** — AUTH_ENABLED !== "true" disables it entirely; demo accounts in DEMO-LOGINS.md; nurse portal at /my`.
- Project Structure tree: add one-liners for `src/app/my/` (nurse portal), `src/app/login/`, `src/lib/auth/`, `src/lib/onboarding/`, `src/lib/date/week.ts`, `src/middleware.ts`.
- Reference Documents: add `docs/ARCHITECTURE.md`, `docs/KNOWN-TRAPS.md`, `docs/DECISIONS.md`, `DEMO-LOGINS.md`.

- [ ] **Step 4: Prettier + commit**

```bash
npx prettier --write CLAUDE.md
git add CLAUDE.md
git commit -m "docs(claude): permanent Operating Model replaces Fable-gated section; fix stale facts"
```

---

### Task 8: End-to-end smoke + push

**Files:** none new.

- [ ] **Step 1: Full gate from scratch**

Run: `rm scripts/.verify-state.json` (if present) then `npm run verify`
Expected: full pass at 679/22, state file regenerated.

- [ ] **Step 2: Orchestration smoke test**

From the main session: spawn `fast-worker` with a trivial, precisely specified task (e.g., "append a `## Maintenance log` heading with today's date to docs/KNOWN-TRAPS.md; run npm run verify; report verbatim git diff --stat"). Then:

1. Run `npm run ground-truth` yourself; compare to its report.
2. Spawn `verifier` with the fast-worker's report.
   Expected: fast-worker report contains verbatim diff stat + gate line; verifier returns CONFIRMED verdicts; numbers agree.

- [ ] **Step 3: Push everything**

```bash
git push origin main
git log --oneline -8
```

Expected: Tasks 1–7 commits on `SimpleScheduleAI-com/cah-scheduler` main; Railway build passes (gate scripts don't affect the build).

- [ ] **Step 4: Update the website-repo memory**

In the Claude memory dir for this project, note: post-Fable operating system live in scheduler repo (verify gate, ground-truth, 3 named agents, 3 context docs); Fable-gated CLAUDE.md sections now obsolete — the scheduler one is replaced; the website repo's local copy should be cleaned up next time that repo is touched with authorization.
