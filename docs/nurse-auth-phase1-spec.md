# Nurse Auth — Phase 1

Login, sessions, and role-based route protection for SimpleScheduleAI. Phase 1
adds a real login and enforces a manager/nurse split without changing any
existing behavior when auth is switched off.

## Design decisions

- **Two identities, one link.** `user` (login accounts) is separate from `staff`
  (the HR record). A manager account has `staffId = null`; a nurse account links
  to their staff row (`onDelete cascade`). Passwords are stored as a
  self-describing scrypt string `saltHex:derivedKeyHex`.
- **Off by default.** The middleware is a **total no-op** unless
  `AUTH_ENABLED === "true"`. Local dev with no env file is unaffected — every
  route stays open and every handler behaves exactly as before.
- **Edge-pure session layer.** `src/lib/auth/session.ts` uses **only Web Crypto**
  (`crypto.subtle` HMAC-SHA-256), `TextEncoder`, and hand-rolled base64url — no
  `node:crypto`, no `Buffer`, no `@/db`. It runs in the Edge middleware, in Node
  route handlers, and under vitest unchanged. Password hashing
  (`src/lib/auth/password.ts`, scrypt) is **Node-only** and never imported by
  middleware.
- **Two-layer authorization.** `roles.ts` (pure, DB-free, first-match-wins rule
  table) decides whether a role may reach a *route*. Handlers enforce *row-level
  ownership* using the `x-staff-id` request header the middleware attaches. When
  auth is off, that header is absent and handlers behave as before.
- **Least-invasive login chrome.** The root layout delegates chrome to a small
  client `AppShell` that renders the manager Sidebar + `<main>` for every route
  except `/login`, which renders bare. No page directories moved into a route
  group, so every existing page's markup is identical.

## Role matrix

Managers may do everything. Nurses are **default-deny** with this allow-list
(first match wins); everything else is denied.

| Route                                | Methods    | Nurse |
| ------------------------------------ | ---------- | ----- |
| `/api/auth/*`                        | any        | allow |
| `/api/staff/[id]/schedule`           | GET        | allow (handler enforces `id === self`) |
| `/api/staff-leave`                   | GET, POST  | allow (POST forces `staffId = self`) |
| `/api/callouts`                      | POST       | allow (must own the assignment, else 403) |
| `/api/swap-requests`                 | GET, POST  | allow (POST forces `requestingStaffId = self`) |
| `/api/prn-availability`              | GET, POST  | allow |
| `/api/schedules`, `/api/schedules/[id]` | GET     | allow (Phase 2 TODO: published-only) |
| everything else under `/api/*`       | any        | **deny (403)** |
| `/my*`, `/login`                     | pages      | allow |
| every other page (manager pages)     | pages      | **deny → redirect `/my`** |

Invalid/missing session: `/api/*` → `401 {error:"unauthorized"}`; pages →
redirect `/login?next=<path>`.

### In-handler ownership (Phase 1)

- `GET /api/staff/[id]/schedule` — nurse + `id !== x-staff-id` → 403.
- `POST /api/staff-leave` — nurse → `staffId` forced to `x-staff-id`.
- `POST /api/swap-requests` — nurse → `requestingStaffId` forced to `x-staff-id`.
- `POST /api/callouts` — nurse → the target assignment must belong to
  `x-staff-id`, else 403.

Deferred to Phase 2 (marked with `PHASE 2 TODO` in code): nurse-facing list
filtering, published-only schedule filtering for nurses, and the swap-accept
split.

## Session cookie

- Name `ssai_session`; value `base64url(json(payload)).base64url(hmac)`.
- Payload `{ uid, role, staffId, exp }`, `exp` unix ms, 30-day lifetime.
- Attributes: `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`, plus `Secure`
  only when `NODE_ENV === "production"`.
- **Rolling re-issue.** Once the cookie is older than ~1 day
  (`shouldReissue`), the middleware refreshes it via `Set-Cookie` on the
  response — an active user's session never expires out from under them.

## Environment variables

See `.env.example`. Summary:

| Var                     | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `AUTH_SECRET`           | HMAC signing key. **Required** in prod when auth on. |
| `AUTH_ENABLED`          | `"true"` enforces login; anything else is a no-op.   |
| `DEMO_PREFILL`          | `"true"` pre-fills demo nurse creds on `/login`.     |
| `SEED_MANAGER_EMAIL`    | Manager login email (default `admin@cah.local`).     |
| `SEED_MANAGER_PASSWORD` | Manager login password (default `changeme-dev`).     |
| `DATABASE_PATH`         | SQLite file path (persistent volume on a host).      |

### Startup guardrails

At middleware module load: production + `AUTH_ENABLED=true` + no `AUTH_SECRET`
→ **throw**. Production + `DEMO_PREFILL=true` → loud `console.warn` banner.

## Seed accounts

`npm run db:seed` (full wipe + reseed) now also creates:

- **Manager** — `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD`
  (default `admin@cah.local` / `changeme-dev`), `staffId = null`.
- **Demo nurse** — `james.wilson@cah.local` / `demo1234`, linked to James
  Wilson's staff row.

`npm run db:seed:users` (`src/db/create-users.ts`) provisions **only** those two
accounts, non-destructively (`onConflictDoNothing` on email) — safe to run
repeatedly on a live DB.

## Rollout (Railway)

Schema and seed changes are **code-only**; they deploy through the existing
`prestart` hook (`drizzle-kit push`) — no manual `db:push` this session.

1. Deploy the code (adds the `user` table via `prestart`'s `drizzle-kit push`).
2. Set env: `AUTH_SECRET=<random 32-byte hex>`, `AUTH_ENABLED=true`,
   `DEMO_PREFILL=true` (for the demo), and a real
   `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD`.
3. Run `npm run db:seed:users` **once** to create the login accounts (assumes
   staff already seeded).
4. Visit `/login`. The demo nurse is pre-filled; "Log in as manager" clears the
   fields for a manager sign-in.

To roll back instantly, set `AUTH_ENABLED=false` — the middleware becomes a
no-op and the app is fully open again; no data migration needed.
