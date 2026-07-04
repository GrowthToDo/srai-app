# Architecture

Session-boot system map. Pointers, not duplicated logic — code is the truth.
Sections: Scheduling engine · Rule engine · Onboarding guide · Auth ·
Nurse portal · PRN availability · Notifications · Env flags · Deploy pipeline.

## Scheduling engine

Generation is a pipeline, not one algorithm: `greedyConstruct()` (`greedy.ts`)
builds an initial assignment set, then `localSearch()` (`local-search.ts`)
runs randomized swap improvement on top of it. Three weight profiles shape
scoring — `BALANCED`, `FAIR`, `COST_OPTIMIZED` — defined in
`weight-profiles.ts` as independent literal weight tables (overtime,
preference, weekendCount, consecutiveWeekends, holidayFairness, skillMix,
float, chargeClustering, agency).

`runner.ts` does NOT run three independent greedy+local-search passes. It
generates BALANCED first (greedy + local search), then derives FAIR and COST
from that same assignment set: FAIR runs only `weekendRedistributionSweep()`
under FAIR weights (no local-search pass — a prior version's 300-iteration
FAIR local-search interacted badly with the sweep's `staffConsecWeekendDelta`
scoring and was removed in v1.7.10); COST runs
`overtimeReductionSweep()` then `weekendRedistributionSweep()` under COST
weights. Starting both from the Balanced base is deliberate: it guarantees
FAIR's fairness score and COST's OT count can only improve relative to
Balanced, which an independent run could not guarantee. Whatever "reverted
guard" question comes up about FAIR/COST regressions, start by reading the
comments at `runner.ts` around the BALANCED → FAIR → COST derivation, not the
weight tables themselves.

All three variants are scored (`scoreFromDrafts`) and written: BALANCED to
the live `assignment` table, FAIR/COST as `scenario` rows. Each generation
run is tracked in a `generation_job` row (progress, status).

Key files: `src/lib/engine/scheduler/greedy.ts`,
`src/lib/engine/scheduler/local-search.ts`,
`src/lib/engine/scheduler/weight-profiles.ts`,
`src/lib/engine/scheduler/runner.ts`.

## Rule engine

Two tiers: hard rules block an assignment outright (eligibility filter
during generation, hard failure on swap/manual edit); soft rules are scored
penalties that shape which eligible candidate wins, and drive the
FAIR/COST weight profiles above. `src/lib/engine/rules/index.ts` registers
13 hard evaluators (min-staff, charge-nurse, patient-ratio, rest-hours,
max-consecutive, icu-competency, level1-preceptor, level2-supervision,
no-overlapping-shifts, prn-availability, staff-on-leave, on-call-limits,
max-hours-60 — spec §3.1–3.13) and the spec's 8 numbered soft rules
(§4.1–4.8: overtime-v2, weekend-count, consecutive-weekends,
holiday-fairness, preference-match, float-penalty, charge-clustering,
skill-mix) plus one later soft addition, weekend-exempt (v1.6.17, documented
in the spec changelog) — so the registry holds 9 soft evaluators total.
`overtime-v2` supersedes the legacy `overtime-cost`/`weekend-fairness`
evaluators, which exist as files but are intentionally NOT registered, to
avoid double-penalizing the same hours or weekends under two rules at once.

UI copy calls these "compliance rules" (e.g. swap approval: "compliance
rules (60-hour caps, rest, competency) are checked automatically"), not
"hard/soft rules" — that split is an implementation detail.

Full spec, including per-rule parameters and the generation algorithm
narrative: `RULES_SPECIFICATION.md`.

Key files: `src/lib/engine/rules/index.ts`, `src/lib/engine/rules/*.ts`,
`RULES_SPECIFICATION.md`.

## Onboarding guide

`src/lib/onboarding/guide.ts` is a pure function stage machine, `Stage = "S0"
| "S1" | ... | "S7"`, derived from DB state (staff/units imported, schedule
generated, published) plus a few latched flags — it does not itself read or
write storage. Stages: S0 no staff/units imported → S1 imported but staff
list unreviewed → S2 reviewed but no schedule period → S3 schedule exists,
ungenerated → S4 generated, unpublished → S5 first publish (celebration) →
S6 daily-ops "Learn" guided practice loop → S7 fallback/inconsistent state.

`src/lib/onboarding/use-onboarding.tsx` is the provider/hook that reads DB
state, layers `fcg:*` localStorage flags (`fcg:staffReviewed`,
`fcg:celebrated`, `fcg:dismissed`, `fcg:learn:callouts`,
`fcg:learn:open-shifts`, `fcg:learn:census`, `fcg:learn:audit`) on top, and
re-derives on the `onboarding-refresh` window event (same-tab milestone
actions) and the `storage` event (cross-tab flag sync). `onboarding-reset`
clears all flags back to S0-eligible.

The S6 practice tutorial seeds fake leave/swap requests tagged with a
`"[PRACTICE]"` marker in their `notes` column (no schema change) via
`POST /api/practice-examples`; `DELETE` on the same route is a deterministic,
idempotent teardown wrapped in a `db.transaction()` that reverts the whole
chain (including foreign-key-ordered deletes) so practice data never leaks
into real records.

Key files: `src/lib/onboarding/guide.ts`,
`src/lib/onboarding/use-onboarding.tsx`,
`src/app/api/practice-examples/route.ts`.

## Auth

Auth is additive, not a rewrite: a `user` table (scrypt password hashes) and
a `roles.ts` role map sit alongside the existing staff data. Sessions are a
stateless signed cookie — `SESSION_COOKIE_NAME = "ssai_session"`
(`src/lib/auth/session.ts`) — an HMAC-SHA-256 signature over the payload,
built entirely on Web Crypto (`crypto.subtle`), so it works unmodified on
the Edge middleware runtime (no Node-only crypto).

`src/middleware.ts` gates only when `process.env.AUTH_ENABLED === "true"`;
otherwise every request passes through unauthenticated
(`if (!AUTH_ENABLED) return NextResponse.next();`). In production, if
`AUTH_ENABLED` is true and `AUTH_SECRET` is unset, middleware throws at
startup rather than silently running unsigned sessions.

`provisionAuthUsers()` (`src/lib/auth/provision-users.ts`) re-creates the
demo manager login (`SEED_MANAGER_EMAIL`/`SEED_MANAGER_PASSWORD`, defaulting
to `admin@cah.local` / `changeme-dev`) after every Excel data import, since
import can wipe/replace staff rows the user table's identities depend on.
Demo credentials for all seeded roles are documented in `DEMO-LOGINS.md`
(repo root).

Key files: `src/lib/auth/session.ts`, `src/lib/auth/roles.ts`,
`src/lib/auth/provision-users.ts`, `src/middleware.ts`, `DEMO-LOGINS.md`.

## Nurse portal

Lives entirely under `src/app/my/` (`layout.tsx`, `page.tsx`, plus
`availability/`, `leave/`, `notifications/`, `swaps/`). The whole section is
capped at `max-w-md` with a bottom tab bar — mobile-first by construction,
not a responsive breakpoint of the manager UI. Nurses only ever see
published schedules (draft/scenario data stays manager-only).

There is no client-trusted staff identity: the API routes the portal writes
to (e.g. `POST /api/prn-availability`, `POST /api/staff-leave`) authorize by
reading the `x-staff-id` and `x-user-role` request headers server-side —
when the caller's role is `nurse`, the write is forced to the caller's own
staff row, so a nurse can only submit availability or leave for themselves;
the client cannot spoof another nurse's ID by tampering with a request body.

Shift swaps a nurse proposes still require a manager to approve — the nurse
UI is explicit that a swap request is "sent to your manager for final
approval" (`src/app/my/swaps/page.tsx`); nurses cannot approve their own or
peers' swaps.

Key files: `src/app/my/layout.tsx`, `src/app/my/page.tsx`,
`src/app/my/swaps/page.tsx`.

## PRN availability

PRN (per-diem) staff record which dates they're available against one
shared template schedule, not per real schedule period. `POST
/api/prn-availability` (`src/app/api/prn-availability/route.ts`) upserts on
the `(staffId, scheduleId)` pair: if a row already exists for that staff +
schedule it updates in place, otherwise it inserts — so a nurse always has
exactly one availability row per schedule. UI callers omit `scheduleId` and
the route defaults it to `PRN_TEMPLATE_SCHEDULE_ID`; only the Excel importer
sends an explicit one.

The same dialog component, `RecordAvailabilityDialog`
(`src/components/prn-availability/record-availability-dialog.tsx`), backs
both the manager's quick-entry flow (`/availability`, staff detail dialog)
and nurse self-serve. Preset weekday chips ("all Saturdays," etc.) are
computed by `togglePreset()`/`datesForWeekdays()` in
`src/lib/prn-availability.ts`, shared by both entry points so the date math
can't drift between manager and nurse forms.

Nurse self-serve lives at `/my/availability` and is gated to
`employmentType === "per_diem"` — full-time/part-time nurses get a message
that their schedule isn't availability-based instead of the form.

Key files: `src/app/api/prn-availability/route.ts`,
`src/lib/prn-availability.ts`,
`src/components/prn-availability/record-availability-dialog.tsx`,
`src/app/my/availability/page.tsx`.

## Notifications

Additive `notification` table (`src/db/schema.ts`): one row per in-app
notification delivered to a staff member, indexed on `(staffId, readAt)` and
`createdAt`. `readAt` stays null until the nurse opens the notifications
page, which marks all their unread notifications read in one mutation.

Triggers live in `src/lib/notifications/notify.ts` and are fail-safe by
design: notifications are a best-effort side effect, and callers wrap every
notify call in try/catch that logs — a failure to notify must never block or
roll back the underlying business action. Call sites: schedule publish
(`/api/schedules/[id]`), the swap lifecycle (`/api/swap-requests`,
`/api/swap-requests/[id]`), and leave decisions (`/api/staff-leave/[id]`).
Nurses read their own notifications via `GET /api/my/notifications`.

Key files: `src/lib/notifications/notify.ts`, `src/db/schema.ts`
(`notification` table), `src/app/api/my/notifications/`.

## Env flags

- `AUTH_ENABLED` — `"true"` turns on session-cookie auth in
  `src/middleware.ts`; any other value (including unset) leaves every route
  open.
- `AUTH_SECRET` — HMAC signing key for the session cookie
  (`src/lib/auth/session.ts`); required in production when `AUTH_ENABLED`
  is true (middleware throws at startup otherwise).
- `DEMO_PREFILL` — `"true"` prefills demo credentials on the login form
  (`src/app/login/page.tsx`); also triggers a startup warning if true in
  production.
- `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD` — override the seeded demo
  manager identity (`src/db/seed.ts`, `src/lib/auth/provision-users.ts`,
  `src/db/create-users.ts`); default to `admin@cah.local` /
  `changeme-dev`.
- `DATABASE_PATH` — absolute path to the SQLite file (`src/db/index.ts`);
  unset locally (falls back to `cah-scheduler.db` in the project root), set
  in production to point at the Railway persistent volume.

Key files: `src/middleware.ts`, `src/lib/auth/session.ts`,
`src/app/login/page.tsx`, `src/db/index.ts`.

## Deploy (Railway)

`package.json` scripts: `build` is a plain `next build` — it does NOT run
tests or a DB push (that stricter path is the separate `build:checked`
script: `test && db:push && next build`, used for local/CI verification, not
the deploy build). `prestart` runs `drizzle-kit push` — schema migration
happens once at container start, immediately before `next start`, against
whatever `DATABASE_PATH` points at.

`next.config.ts` sets `typescript: { ignoreBuildErrors: true }` — the
production build does not fail on type errors. This is intentional: type
safety is enforced by the separate CI/pre-commit gate (`build:checked` /
lint / typecheck), not by the Railway build step, so a type regression
blocks a commit rather than blocking (or silently shipping) a deploy.

Railway's persistent volume is mounted at `/data` at **runtime only** — it
does not exist during the build. `src/db/index.ts` handles this: it
`mkdirSync`s the DB directory unconditionally (safe no-op if the real volume
is already mounted, necessary when it isn't yet), and wraps the SQLite file
open in a retry loop with a 15s busy timeout, because `next build` runs
page-data collection in multiple worker processes that can race on
creating the build-time throwaway DB file or on the DELETE→WAL journal-mode
conversion — surfacing as `SQLITE_BUSY` and killing the build if unguarded.
Neither defense fires at runtime (single server process, real volume
already mounted).

Key files: `package.json` (scripts), `next.config.ts`, `src/db/index.ts`.
