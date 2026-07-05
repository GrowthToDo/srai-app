# Demo Showroom (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shareable, always-fresh demo instance: seeded fictional-hospital data with a published schedule, a guarded reset endpoint (nightly cron + UI button), and a visible demo banner — per spec §4 (`docs/superpowers/specs/2026-07-04-production-saas-design.md`).

**Architecture:** Extract the existing seed script's body into a reusable `seedDatabase()`; a new `resetDemoData()` composes it with auth provisioning, schedule generation via the real engine (`runGenerationJob`), publishing, and one pending swap request. A `POST /api/demo/reset` route (existing only when `DEMO_MODE=true`) triggers it; a client banner (driven by `GET /api/demo/status`) shows demo state + reset button. Railway demo service setup is documented for the founder.

**Tech Stack:** Existing stack only — better-sqlite3/Drizzle (synchronous), Next.js App Router routes, vitest. No new dependencies.

## Global Constraints

- **NEVER run any seed/reset code against the founder's live dev DB** (`cah-scheduler.db` in repo root). Every verification run sets `DATABASE_PATH` to a scratch file under the session scratchpad. A task that touches the live DB is a failed task.
- No new npm dependencies.
- The pre-commit gate runs the full suite (~2 min) on every commit: run commits SYNCHRONOUS foreground, timeout 400000ms, never `run_in_background`.
- Prettier only on files you change. Never create files/dirs named exactly `prn`.
- `npm run db:seed` observable behavior must remain identical after the refactor (same output, same data, same exit codes) — deployed instances depend on it.
- Demo gating: every demo surface (route, banner data) must be dead (404 / `{demo:false}`) unless `process.env.DEMO_MODE === "true"`.
- Baselines before this plan: 685 vitest tests passing, 22 tsc errors (all pre-existing).
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

### Deliberate spec deviations (approved)

- Spec §4 lists "one open shift" in the seed; OMITTED — an open shift requires a callout/escalation chain, and the product's built-in practice tutorial creates one live during demos, which is the better sales moment. The seeded pending swap request + pending leaves + PRN availability provide the "alive" feel.
- Fictional hospital naming: the existing seed roster (James Wilson, Olivia Bennett, etc.) is kept — demo logins in `DEMO-LOGINS.md` bind to those names and the roster is already realistic.

---

### Task 1: Extract reusable `seedDatabase()` from seed.ts

**Files:**

- Create: `src/db/seed-core.ts`
- Modify: `src/db/seed.ts` (becomes a thin wrapper)

**Interfaces:**

- Produces: `seedDatabase(sqlite: Database.Database, db: BetterSQLite3Database<typeof schema>): Promise<void>` in `src/db/seed-core.ts` — wipes all tables (existing FK-safe DELETE order) and inserts the full test dataset. No `process.exit`, no console noise beyond what exists, no DB opening (caller owns the connection).
- `src/db/seed.ts` keeps its CLI behavior: opens `DATABASE_PATH ?? cah-scheduler.db`, calls `seedDatabase`, then `provisionAuthUsers`, logs, exits.

- [ ] **Step 1: Read `src/db/seed.ts` end to end** (812 lines). Identify: the module-scope DB opening (lines ~9-14), the `seed()` function body, the trailing invocation with `process.exit`. Note whether `provisionAuthUsers` is already called (it is, per repo history — find the call).

- [ ] **Step 2: Create `src/db/seed-core.ts`** — move the ENTIRE body of `seed()` (the wipe `sqlite.exec` block and all inserts) into:

```ts
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/**
 * Wipes and re-seeds the full test dataset. Extracted from the db:seed CLI so
 * the demo reset endpoint can reuse it. The caller owns the connection; this
 * function never opens a DB, never exits the process.
 */
export async function seedDatabase(
  sqlite: Database.Database,
  db: BetterSQLite3Database<typeof schema>,
): Promise<void> {
  // <moved body of seed(), verbatim — references to module-scope `sqlite`/`db`
  //  now use the parameters; helper functions (uuid, etc.) move along with it>
}
```

Move any helpers the body uses (`uuid()`, date helpers usage stays via imports). Keep the code byte-identical where possible — this is a MOVE, not a rewrite.

- [ ] **Step 3: Rewrite `src/db/seed.ts` as the wrapper** — keep its existing imports for DB opening + `provisionAuthUsers`, call `seedDatabase(sqlite, db)`, preserve existing console output and `process.exit(0)` / error `process.exit(1)` behavior.

- [ ] **Step 4: Verify against a SCRATCH DB — never the live one**

Run (Git Bash):

```bash
SCRATCH="C:/Users/Admin/AppData/Local/Temp/claude/D--Pradeep-Personal-Projects-SimpleScheduleAI-com--New/4e8869bd-abfa-49af-936a-bf25b451518a/scratchpad/demo-p0"
mkdir -p "$SCRATCH" && rm -f "$SCRATCH/seed-test.db"
DATABASE_PATH="$SCRATCH/seed-test.db" npm run db:push && DATABASE_PATH="$SCRATCH/seed-test.db" npm run db:seed
```

Expected: same success output as before the refactor, exit 0. Then sanity-count:

```bash
node -e "const D=require('better-sqlite3');const d=new D(process.env.DATABASE_PATH);console.log('staff',d.prepare('select count(*) c from staff').get().c,'rules',d.prepare('select count(*) c from rule').get().c,'users',d.prepare('select count(*) c from user').get().c)" # with DATABASE_PATH set as above
```

Expected: staff ~29+, rules 22, users 3.

- [ ] **Step 5: Confirm the live dev DB untouched**

Run: `git status --short` (no DB files listed) and compare `stat -c %Y cah-scheduler.db` before/after (unchanged mtime).

- [ ] **Step 6: Gate + commit**

```bash
npx prettier --write src/db/seed-core.ts src/db/seed.ts
git add src/db/seed-core.ts src/db/seed.ts
git commit -m "refactor(seed): extract reusable seedDatabase() from db:seed CLI"
```

---

### Task 2: `resetDemoData()` — seed + auth users + generated PUBLISHED schedule + one pending swap

**Files:**

- Create: `src/lib/demo/reset-demo.ts`
- Test: `src/__tests__/demo/reset-demo.test.ts`

**Interfaces:**

- Consumes: `seedDatabase(sqlite, db)` from Task 1; `provisionAuthUsers(db)` from `src/lib/auth/provision-users.ts`; `runGenerationJob(jobId, scheduleId)` from `src/lib/engine/scheduler/runner.ts` (async; writes assignments + scenarios for the given schedule).
- Produces: `resetDemoData(): Promise<{ scheduleId: string }>` in `src/lib/demo/reset-demo.ts`, operating on the app's default DB connection (`@/db`) — the demo instance's own volume DB.

- [ ] **Step 1: Read the real creation paths first** — the implementer MUST mirror existing handler logic, not invent inserts:
  - `src/app/api/schedules/route.ts` POST — exact fields inserted into `schedule` (+ how shifts are created, if they are).
  - `src/app/api/schedules/[id]/generate/route.ts` — how a `generation_job` row is created and `runGenerationJob` invoked.
  - `src/app/api/schedules/[id]/publish/route.ts` (or wherever publish lives — grep `"published"` under `src/app/api/schedules`) — exact status transition + any notification calls.
  - `src/db/schema.ts` `shiftSwapRequest` table — required fields for a pending swap.

- [ ] **Step 2: Write the failing test** `src/__tests__/demo/reset-demo.test.ts`. Follow the repo's existing DB-test pattern (find one under `src/__tests__/` that builds a scratch DB via `DATABASE_PATH` or an in-memory Database with `db:push`-equivalent schema; mirror it exactly). Test body:

```ts
import { describe, it, expect } from "vitest";
// (mirror the repo's scratch-DB bootstrap here)
import { resetDemoData } from "@/lib/demo/reset-demo";

describe("resetDemoData", () => {
  it("produces a published schedule with assignments, demo users, and one pending swap", async () => {
    const { scheduleId } = await resetDemoData();
    // schedule exists and is published
    // assignments for that schedule > 0
    // user table has the 3 demo accounts
    // exactly one shift_swap_request with status 'pending'
  }, 120_000); // generation is real work; generous timeout
  it("is idempotent — running twice leaves one published schedule", async () => {
    await resetDemoData();
    const second = await resetDemoData();
    // schedules table has exactly 1 row, id === second.scheduleId
  }, 240_000);
});
```

Fill the commented assertions with real queries against the scratch DB. If the repo's test pattern cannot exercise `@/db` against a scratch path (module-scope DATABASE_PATH read), set `process.env.DATABASE_PATH` + `vi.resetModules()` before importing — the middleware tests (`src/__tests__/auth/middleware.test.ts`) show this env-isolation pattern.

- [ ] **Step 3: Run test — expect failure** (`npx vitest run src/__tests__/demo/reset-demo.test.ts` → module not found).

- [ ] **Step 4: Implement `src/lib/demo/reset-demo.ts`:**

```ts
import { db, schema } from "@/db";
import Database from "better-sqlite3"; // only if seedDatabase needs the raw handle — pass the one from @/db's module if exported; otherwise thread it
import { seedDatabase } from "@/db/seed-core";
import { provisionAuthUsers } from "@/lib/auth/provision-users";
import { runGenerationJob } from "@/lib/engine/scheduler/runner";

/**
 * Restores the demo instance to pristine: full reseed, demo logins, one
 * freshly generated + published 6-week schedule, one pending swap request.
 * DEMO-ONLY: callers must gate on DEMO_MODE (the API route does).
 */
export async function resetDemoData(): Promise<{ scheduleId: string }> {
  // 1. wipe + reseed (seedDatabase) — reuse the raw sqlite handle from @/db
  // 2. provisionAuthUsers(db)
  // 3. insert schedule row mirroring /api/schedules POST (6 weeks from current Monday — use getWeekStart from src/lib/date/week.ts)
  // 4. insert generation_job row + await runGenerationJob(jobId, scheduleId)
  // 5. publish: mirror the publish handler's status transition
  // 6. insert ONE pending shift_swap_request between two seeded staff on a generated assignment
  return { scheduleId };
}
```

Notes: `src/db/index.ts` exports `db` — check whether it also exports the raw `sqlite` handle; if not, export it (named `sqlite`) — additive, safe. All week math via `src/lib/date/week.ts` (KNOWN-TRAPS).

- [ ] **Step 5: Run the test — expect pass** (uses scratch DB only). Then `npx vitest run` (full suite) — expect 685 + new passing.

- [ ] **Step 6: Gate + commit**

```bash
npx prettier --write src/lib/demo/reset-demo.ts src/__tests__/demo/reset-demo.test.ts src/db/index.ts
git add -A src/lib/demo src/__tests__/demo src/db/index.ts
git commit -m "feat(demo): resetDemoData — reseed + generated published schedule + pending swap"
```

---

### Task 3: `POST /api/demo/reset` + `GET /api/demo/status`

**Files:**

- Create: `src/app/api/demo/reset/route.ts`
- Create: `src/app/api/demo/status/route.ts`
- Test: `src/__tests__/demo/demo-routes.test.ts`

**Interfaces:**

- Consumes: `resetDemoData()` from Task 2.
- Produces: `POST /api/demo/reset` — 404 unless `DEMO_MODE==="true"`; then 401 unless `Authorization: Bearer ${DEMO_RESET_SECRET}` matches OR the request's `origin`/`referer` host equals the request host (UI button path); 200 `{ ok: true, scheduleId }` on success; 429 if called more than once per 60s (module-scope timestamp — fine for a single-process demo). `GET /api/demo/status` — always 200, `{ demo: boolean }` (true only when `DEMO_MODE==="true"`).

- [ ] **Step 1: Write failing route tests** (same env-isolation pattern as middleware tests — `vi.resetModules()` + dynamic import per case; mock `@/lib/demo/reset-demo` with `vi.mock` so tests don't run real generation):

```ts
// cases:
// DEMO_MODE unset  -> POST /api/demo/reset returns 404; GET status {demo:false}
// DEMO_MODE=true, no auth, foreign origin -> 401
// DEMO_MODE=true, Bearer wrong-secret -> 401
// DEMO_MODE=true, Bearer correct -> 200 {ok:true}, resetDemoData called once
// second call within 60s -> 429
// DEMO_MODE=true, same-origin (origin header == host) -> 200
```

- [ ] **Step 2: Run — expect failures.** **Step 3: Implement both routes:**

```ts
// src/app/api/demo/reset/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { resetDemoData } from "@/lib/demo/reset-demo";

let lastResetAt = 0; // single-process demo instance; module scope is sufficient

export async function POST(request: NextRequest) {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const auth = request.headers.get("authorization");
  const secret = process.env.DEMO_RESET_SECRET;
  const bearerOk = !!secret && auth === `Bearer ${secret}`;
  const originHost = (() => {
    const o = request.headers.get("origin") ?? request.headers.get("referer");
    try {
      return o ? new URL(o).host : null;
    } catch {
      return null;
    }
  })();
  const sameOrigin = !!originHost && originHost === request.nextUrl.host;
  if (!bearerOk && !sameOrigin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (Date.now() - lastResetAt < 60_000) {
    return NextResponse.json({ error: "too many resets" }, { status: 429 });
  }
  lastResetAt = Date.now();
  const { scheduleId } = await resetDemoData();
  return NextResponse.json({ ok: true, scheduleId });
}
```

```ts
// src/app/api/demo/status/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ demo: process.env.DEMO_MODE === "true" });
}
```

- [ ] **Step 4: Tests pass; full suite passes.** **Step 5: Gate + commit** (`feat(demo): guarded demo reset + status routes`).

---

### Task 4: Demo banner with reset button

**Files:**

- Create: `src/components/demo-banner.tsx`
- Modify: `src/app/layout.tsx` (mount banner above children)
- Test: `src/__tests__/demo/demo-banner.test.tsx`

**Interfaces:**

- Consumes: `GET /api/demo/status`, `POST /api/demo/reset` (same-origin path).
- Produces: client component `<DemoBanner />` that renders nothing until status returns `{demo:true}`, then a slim top strip: "Demo environment — sample data, resets nightly." + a "Reset demo" button (confirm dialog → POST → on 200, full page reload). Uses existing UI primitives (`Button`, `AlertDialog` from `src/components/ui/`) and the brand's warm-editorial styling (match existing banner-like elements; hairline border, ivory background).

- [ ] **Step 1: Failing component test** (repo's testing-library pattern — find an existing component test and mirror): renders nothing when fetch resolves `{demo:false}`; renders strip text when `{demo:true}`; clicking Reset + confirming calls fetch POST `/api/demo/reset`.
- [ ] **Step 2: Implement** (client component, `useEffect` fetch of status once, mounted unconditionally in root layout — it self-hides outside demo mode, so founder/tenant instances render nothing and make one cheap status call).
- [ ] **Step 3: Tests + full suite pass.** **Step 4: Gate + commit** (`feat(demo): demo banner with reset control`).

---

### Task 5: Docs + live rehearsal

**Files:**

- Create: `docs/DEMO-SETUP.md`
- Modify: `docs/ARCHITECTURE.md` (short "Demo showroom" note in Deploy section), `docs/DECISIONS.md` (append entry), `DEMO-LOGINS.md` (demo-instance section)

**Interfaces:** consumes everything above.

- [ ] **Step 1: Write `docs/DEMO-SETUP.md`** — founder-facing runbook: (1) Railway → New Service from same repo, attach new volume, set env `DEMO_MODE=true`, `AUTH_ENABLED=true`, `AUTH_SCOPE=nurse_only`, `DEMO_PREFILL=true`, `AUTH_SECRET=<random>`, `DEMO_RESET_SECRET=<random>`, `DATABASE_PATH=/data/demo.db`; (2) first boot: hit `POST /api/demo/reset` with the bearer secret (exact curl line) to seed; (3) nightly reset: cron-job.org free account → POST that URL with the Authorization header, schedule 03:00 CT (exact screenshots not needed, exact field values yes); (4) sharing: send prospects the service URL; nurse-portal demo = login as James (pre-filled); (5) troubleshooting: banner missing ⇒ DEMO_MODE unset; 429 ⇒ wait a minute.
- [ ] **Step 2: DECISIONS.md entry:** `- **2026-07 — Demo showroom as separate service.** Second Railway service + DEMO_MODE flag + guarded reset endpoint; becomes a demo tenant after P2 tenancy (spec §4/§7). Same-origin resets allowed because demo data is disposable by definition.`
- [ ] **Step 3: Local rehearsal against a scratch DB** — run the dev server exactly as the demo service would (`DEMO_MODE=true AUTH_ENABLED=true AUTH_SCOPE=nurse_only DEMO_PREFILL=true AUTH_SECRET=x DEMO_RESET_SECRET=y DATABASE_PATH=<scratch>/demo.db npm run dev -- -p 3005`), then: `POST /api/demo/reset` with bearer → 200; `/dashboard` shows seeded hospital with published schedule; banner visible; `/my` login as James shows shifts; second reset within a minute → 429. Record each check's output in the report. Kill the server after.
- [ ] **Step 4: Gate + commit** (`docs(demo): DEMO-SETUP runbook + decision entry`), push.

---

### Task 6 (controller, not a subagent): Railway setup with the founder

Founder-executed from `docs/DEMO-SETUP.md` (Claude cannot click Railway). Controller verifies afterward: `GET /api/demo/status` on the new URL returns `{demo:true}`, reset works, banner shows, founder confirms share-readiness.
