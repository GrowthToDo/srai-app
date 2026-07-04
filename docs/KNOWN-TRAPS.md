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

## Maintenance log

- 2026-07-04 — file created as part of the post-Fable operating system (spec: docs/superpowers/specs/2026-07-03-post-fable-operating-system-design.md).
