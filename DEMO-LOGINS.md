# Demo Logins

Quick reference for the built-in demo accounts. These only work when auth is
enabled (`AUTH_ENABLED=true`); with the flag off (the local default) the app
needs no login at all.

| Account | Email | Password | What you see |
| --- | --- | --- | --- |
| **Manager** | `admin@cah.local` | `changeme-dev` | Full manager app (dashboard, schedules, approvals) |
| **Nurse — James Wilson** (full-time RN, L5 charge) | `james.wilson@cah.local` | `demo1234` | Nurse portal `/my`: schedule calendar, call out, leave, swaps, notifications |
| **Nurse — Olivia Bennett** (per-diem RN) | `olivia.bennett@cah.local` | `demo1234` | Same as James **plus the Availability tab** (per-diem only) |

Notes:

- James's credentials are pre-filled on the login form when `DEMO_PREFILL=true`.
  Olivia's are not — type them manually.
- The manager email/password can be overridden with `SEED_MANAGER_EMAIL` /
  `SEED_MANAGER_PASSWORD` env vars (do this on Railway; never commit real
  credentials).
- Accounts are (re)created idempotently by `npm run db:seed:users`, by a full
  `npm run db:seed`, and automatically after every Excel import.
- To try auth locally:
  `AUTH_ENABLED=true DEMO_PREFILL=true AUTH_SECRET=local-test-secret npm run dev`
- **These are demo defaults, intentionally weak and public.** Before any real
  pilot: set a strong manager password via env, rotate/disable the demo nurses,
  and set `DEMO_PREFILL=false`. Full details: `docs/nurse-auth-phase1-spec.md`.
