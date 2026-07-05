# SimpleScheduleAI Scheduler — Production SaaS Design

**Date:** 2026-07-04
**Status:** Approved by founder (Option C; demo showroom built first, remainder executed post-Fable by Opus/Sonnet sessions)
**Audience:** Any engineer (or AI session) joining the project cold. Read this,
then `docs/ARCHITECTURE.md` (how the current app works inside), then
`docs/KNOWN-TRAPS.md` (mistakes already made once). Those three documents plus
`CLAUDE.md` are the complete onboarding path.

---

## 1. What this product is

**SimpleScheduleAI** sells AI-assisted nurse scheduling to **Critical Access
Hospitals (CAHs)** — rural US hospitals with ≤25 beds and roughly 20–60
nursing staff, starting in Texas. The buyer is the hospital
Administrator/CEO; the daily user is the Nurse Manager / Director of Nursing
(DON); nurses use a mobile portal for schedules, leave, callouts, and swaps.

The product is this repository: a Next.js web app that imports a staff roster
from Excel, generates rule-compliant 6-week schedules (13 hard "compliance"
rules, 9 soft "fairness" rules), and manages the daily churn — callouts, open
shifts, leave approvals, swap requests, PRN (per-diem) availability, census
changes — with a full audit trail.

**Go-to-market (fixed input for this design):** the marketing site
(SimpleScheduleAI.com, separate repo) sells the product now. When a hospital
signs, the founder promises a **one-month setup**. Those four weeks are for
onboarding the hospital — not for building the product — so the platform work
below must be finished before the first "yes," or very shortly after.

**Business decisions this design takes as given:**

- One application serving many hospitals (SaaS), not one deployment per
  hospital.
- 12-month horizon: 1–3 pilot hospitals. Tiny data volumes throughout.
- Solo founder + AI agents. No on-call. Boring, managed infrastructure only.
- Infrastructure budget under $100/month until revenue.
- Hospital buyers will probe security/backups/uptime; answers must be honest
  and cheap (no SOC2 program yet).

## 2. Where the product stands today (prototype state)

Single-tenant: the whole database IS one hospital's data. Deployed as one
Railway service (`cah-scheduler-v2-production.up.railway.app`) with a
volume-mounted SQLite file. Auth exists but is flag-gated
(`AUTH_ENABLED`), with hard-coded demo accounts (see `DEMO-LOGINS.md`);
`AUTH_SCOPE=nurse_only` opens manager surfaces without login while keeping
the nurse portal locked. 685 automated tests; a blocking pre-commit gate
(`npm run verify`); development operating model documented in `CLAUDE.md`.

**The load-bearing technical fact — read this twice.** The app uses
`better-sqlite3`, a **synchronous** database driver. Every one of ~481 DB
call sites across 55 files (including the scheduling engine's hot paths and
13 synchronous transactions) assumes instant, non-awaited answers. Any move
to an async driver (Postgres, Turso/libSQL — whose JS client is also
promise-based) forces rewriting all of them. That rewrite is weeks of risky
churn that delivers nothing a pilot hospital can see. This single fact drives
the architecture choice below.

## 3. The architecture decision (Option C): one database file per hospital

**Chosen:** keep `better-sqlite3` exactly as-is and give **each hospital its
own SQLite database file**. Multi-tenancy happens at the file level, not the
row level.

Plain-English model: each hospital's data is a separate **filing cabinet**.
The app adds a **receptionist** — resolve which hospital the logged-in user
belongs to, open that hospital's cabinet, nothing else changes. Isolation is
physical: a query against St. Albans' database cannot return another
hospital's rows because the connection literally cannot see them. For a solo
developer this is the property that matters — there is no `WHERE tenant_id`
to forget. It is also the stronger sales sentence: "each hospital's data
lives in its own separate database."

**Rejected alternatives (and when to revisit):**

- **Postgres, row-level tenancy** — the textbook SaaS answer. Rejected now
  because of the async rewrite (above) and because 1–3 tiny hospitals have no
  cross-tenant query needs. Revisit at ~20+ hospitals or when a genuine
  cross-hospital analytics product appears; the `getTenantDb()` seam (below)
  is deliberately the only thing that would change shape.
- **Turso/libSQL per-tenant** — attractive managed backups, but its client is
  async, so it costs the same rewrite as Postgres with less ecosystem. A
  deep-reasoner review initially recommended it claiming sync compatibility;
  that claim was checked and found wrong. Lesson recorded here on purpose:
  verify driver sync/async claims against the actual client API.

### 3.1 Components

**Control plane (the receptionist's ledger).** A small separate SQLite file
(`control.db`, same volume) owning what is deliberately NOT per-hospital:

- `tenant` — id, slug, display name, status (active/suspended), createdAt.
- `user` — id, email, passwordHash (scrypt, as today), role
  (manager | nurse), `tenantId`, `staffId` (row id inside that tenant's DB),
  invite/reset token fields.
- `invite` — token, email, role, tenantId, expiresAt, usedAt.

The existing per-tenant `user` table migrates here; sessions gain a
`tenantId` claim next to `uid`/`role`/`staffId` in the signed cookie. The
cookie remains the single source of tenant identity — never a header, path
param, or request body.

**Tenant DB resolution (`getTenantDb`).** A factory replacing today's
module-level singleton:

- `getTenantDb(tenantId)` → opens (and caches, LRU, a handful at pilot
  scale) `/{DATA_DIR}/tenants/{tenantId}.db` with the same WAL/foreign-keys
  pragmas and the same build-time-race defenses that live in `src/db/index.ts`
  today (mkdir, retry, busy timeout — see KNOWN-TRAPS).
- Route handlers stop importing `db` and instead call
  `getTenantDb(request-derived tenantId)`. Deleting the `@/db` singleton
  export makes "forgot to scope" a compile error, not a silent data leak.
- The migration is mechanical (55 files, one pattern), guarded by the
  685-test suite, and is exactly the shape of work the repo's `fast-worker`
  agent + verify gate exist for. The 13 synchronous `db.transaction()` sites
  get hand review; everything else is pattern-replace.
- Schema changes apply per tenant file: `prestart` loops
  `drizzle-kit push` over `tenants/*.db` (trivial at pilot counts).

**Identity flows.** Real invites replace seeded accounts: founder creates a
tenant + invites the DON by email (Resend, free tier); she sets her password
via a tokenized link; she invites her nurses the same way (or the founder
bulk-invites from the imported roster). Password reset uses the same token
mechanism. `DEMO_PREFILL` and `AUTH_SCOPE=nurse_only` become impossible in
production builds — a startup guard throws if either is set while
`NODE_ENV === "production"` and `DEMO_MODE !== "true"`.

### 3.2 What deliberately does NOT exist yet (YAGNI, revisit with revenue)

Billing/Stripe (pilots are invoiced manually), SSO/SAML, self-serve signup
(the founder provisions every tenant by hand — that IS the managed service),
SOC2 program, autoscaling/multi-region, cross-tenant analytics, CP-SAT
optimizer (OPTIMUS — separate parked project), native mobile apps (the `/my`
portal is mobile-web by design).

## 4. The demo showroom (build FIRST — sales needs it now)

A permanently fresh, safe-to-share demo at its own URL, so any prospect can
click through a realistic hospital without touching real data.

- **Deployment:** second Railway service, same repo/image, own volume.
  Env: `DEMO_MODE=true`, `AUTH_ENABLED=true`, `AUTH_SCOPE=nurse_only`
  (manager surfaces open instantly — no login friction in a sales demo),
  `DEMO_PREFILL=true` (one-tap nurse login for showing the mobile portal).
- **Seed data:** one fictional hospital ("Cedar Creek Regional" or similar) —
  ~30 staff across ICU/ER/Med-Surg with realistic names/levels/FTEs, a
  published 6-week schedule, a handful of pending leaves, one open shift, one
  swap request, PRN availability on file — so every screen has something
  alive on it. Built on the existing `src/db/seed.ts` machinery plus
  `provisionAuthUsers`.
- **Reset:** `POST /api/demo/reset` — exists ONLY when `DEMO_MODE=true`
  (404 otherwise), additionally guarded by a `DEMO_RESET_SECRET` bearer
  token. Wipes and reseeds inside the existing transactional seed path.
  Called two ways: nightly by a scheduled job (Railway cron or free external
  cron), and manually via a small "Reset demo" control in the UI banner.
- **Banner:** persistent, unobtrusive strip on every page when
  `DEMO_MODE=true`: "Demo environment — sample data, resets nightly."
- **Safety rails:** demo service has no real data by construction; reset
  endpoint cannot exist on the founder's instance or any tenant instance;
  demo seed marks itself so support can distinguish demo screenshots.
- **Future:** once tenancy (§3) lands, the showroom becomes a `demo` tenant
  with the same reset job, and the second service is retired.

## 5. Trust pack — the answers a CAH administrator will ask for

| They ask                           | The honest answer we build                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where is our data? Who can see it? | Your hospital's data is in its own separate database. Role-based access (manager vs nurse); every change is written to an audit log (already shipped).                                                                                                                                                                                                                                                        |
| What if you lose it?               | Nightly automated backups of every hospital file to independent storage (Litestream streaming to Cloudflare R2, ~$0/mo at this scale), plus a **practiced, documented restore** — we run a restore drill and keep the transcript, so the claim is tested fact.                                                                                                                                                |
| Is it encrypted?                   | TLS in transit (Railway default); encryption at rest on the storage layer; backups encrypted. Nothing more claimed than is true.                                                                                                                                                                                                                                                                              |
| Uptime / SLA?                      | Honest pre-revenue answer: single-region managed infrastructure, uptime monitoring with alerting (BetterStack/UptimeRobot free tier), error tracking (Sentry free tier), no formal SLA yet — paired with the backup/restore guarantee. Do not invent 99.9%.                                                                                                                                                   |
| HIPAA / BAA?                       | The scheduler processes **staff scheduling data, not patient records**. Census inputs are numeric bed counts/acuity bands only — never patient identifiers — so a HIPAA business-associate relationship is very likely not created. **Action item: one-line legal confirmation before this goes in writing to a buyer**, plus a product guardrail keeping census inputs numeric-only so the claim stays true. |
| What if you disappear?             | Their data is exportable (Excel export exists; add a full-data export per tenant); stated in the one-pager.                                                                                                                                                                                                                                                                                                   |

Deliverable: a one-page security & reliability summary (kept in this repo,
rendered on the website) answering exactly these, no marketing inflation.

## 6. The one-month onboarding runbook (what the founder's promise costs)

A written, repeatable script so "setup takes one month" is calm instead of
heroic. Week by week:

1. **Week 1 — Collect & configure.** Signed hospital returns the staff
   workbook (existing Excel template); founder creates the tenant, imports
   the roster, configures units, shifts, census bands, and any rule
   deviations with the DON on a call.
2. **Week 2 — Shadow schedule.** Generate a 6-week schedule alongside their
   current hand-made one; review violations and fairness with the DON; tune
   preferences/rules. (The First-Cycle Guide + practice tutorial already in
   the product carry most of the DON training.)
3. **Week 3 — Nurse rollout.** Invite nurses to the mobile portal; nurses
   verify their own schedules, submit availability (PRN) and leave; fix
   roster errors this surfaces.
4. **Week 4 — Go live.** Publish the first real schedule; daily-churn
   walkthrough (callout → escalation → open shift → swap approval); handoff
   checklist signed; support channel (email/phone) opened.

Each week ends with a named artifact (configured tenant, approved shadow
schedule, >80% nurse activation, published live schedule) so slippage is
visible immediately.

## 7. Execution phases, owners, and effort

| Phase | What                                                                         | Effort   | Owner                                 |
| ----- | ---------------------------------------------------------------------------- | -------- | ------------------------------------- |
| P0    | Demo showroom (§4)                                                           | 2–3 days | **This session (Fable) — now**        |
| P1    | Control plane + invites + prod guards (§3.1 identity)                        | 1–2 wks  | Opus-orchestrated sessions post-Fable |
| P2    | `getTenantDb` migration, singleton deleted, per-tenant schema push           | 2–3 wks  | Opus + fast-worker/verifier agents    |
| P3    | Trust pack: Litestream backups + restore drill + monitoring + one-pager (§5) | ~1 wk    | Opus-orchestrated                     |
| P4    | Onboarding runbook doc + tenant provisioning CLI (§6)                        | ~3 days  | Opus-orchestrated                     |
| P5    | Fold demo into a `demo` tenant; retire second service                        | ~1 day   | After P2                              |

Order note: P1 and P3 can interleave; P2 is the long pole and should not
start until P1's session/tenant claim shape is settled. Every phase runs
under the repo's operating model: spec → plan → subagent execution → verify
gate → ground-truth (see `CLAUDE.md`).

## 8. Cost picture (monthly, pre-revenue)

Railway two services + volumes ~$10–25 · Cloudflare R2 backup storage ~$0–5 ·
Resend email free tier · Sentry free tier · uptime monitor free tier ·
domain already owned. **Total: well under $100.**

## 9. Risks and honest unknowns

- **File-per-tenant is unconventional.** Fewer tutorials to lean on; the
  mitigation is the single `getTenantDb` seam and this document. If a future
  engineer's instinct is "this should be Postgres," §2–3 is the argument they
  must beat: at this scale the sync rewrite buys nothing a hospital notices.
- **Backups are self-assembled** (Litestream), not vendor-managed. Mitigated
  by the restore drill being a deliverable, not an intention.
- **HIPAA stance rests on "no patient identifiers ever."** One census
  free-text field added carelessly could void it. Guardrail + legal
  confirmation are in §5 for exactly this reason.
- **Schema migrations multiply per tenant.** At pilot scale a loop over N
  files is fine; at ~50+ tenants this needs a real migration runner with
  per-tenant version tracking — noted for the Postgres-revisit conversation.
- **Session compromise = tenant access.** The stateless cookie has no server
  revocation; rotation of `AUTH_SECRET` invalidates all sessions (documented
  in the auth spec). Acceptable at pilot scale; revisit with revenue.

## 10. Glossary for the non-technical reader

- **Tenant** — one customer hospital and everything it owns in the system.
- **Control plane** — the small "front office" database that knows which
  hospitals and logins exist; it holds no schedules.
- **SQLite / better-sqlite3** — the database engine; one self-contained file
  per hospital, read synchronously (instant answers, no waiting).
- **Seed / reseed** — filling a database with prepared sample data.
- **Litestream** — a small background tool that continuously copies a SQLite
  file's changes to cloud storage, giving point-in-time backups.
- **BAA (Business Associate Agreement)** — the HIPAA contract required when a
  vendor handles patient data; our position is that we don't handle patient
  data, only staff schedules.
