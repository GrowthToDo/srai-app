# Demo Showroom — Setup & Operations

The demo showroom is a second Railway service running this same repo, filled
with a fictional hospital and wiped back to pristine on demand. Share its URL
with any prospect; they can click everything and touch nothing real.

Rehearsed end-to-end locally on 2026-07-04 (all checks in
`docs/superpowers/plans/2026-07-04-demo-showroom.md` Task 5 passed: status
flag, seeded reset with published schedule, manager-open/nurse-locked split,
banner, nurse login with populated calendar, DB sanity).

## 1. Create the service (Railway, one time)

1. Railway project → **New Service → GitHub repo** → select
   `SimpleScheduleAI-com/cah-scheduler` (same repo as production).
2. Attach a **Volume** to the new service, mount path `/data`.
3. Set these variables on the service (Settings → Variables):

| Variable            | Value                                        |
| ------------------- | -------------------------------------------- |
| `DEMO_MODE`         | `true`                                       |
| `AUTH_ENABLED`      | `true`                                       |
| `AUTH_SCOPE`        | `nurse_only`                                 |
| `DEMO_PREFILL`      | `true`                                       |
| `AUTH_SECRET`       | long random string (32+ chars, generate new) |
| `DEMO_RESET_SECRET` | different long random string                 |
| `DATABASE_PATH`     | `/data/demo.db`                              |

4. Deploy. Optionally add a nicer domain (e.g.
   `demo.simplescheduleai.com`) under Settings → Networking.

Why these flags: `DEMO_MODE` turns on the banner, the reset endpoint, and the
reset guard; `AUTH_SCOPE=nurse_only` lets prospects into the manager app with
zero login friction while the nurse portal still demos a real login;
`DEMO_PREFILL` pre-fills James's credentials on the login page so the mobile
portal demo is one tap.

## 2. First boot — seed the hospital

The fresh service starts with an empty database. Seed it once:

```bash
curl -X POST https://<demo-url>/api/demo/reset \
  -H "Authorization: Bearer <DEMO_RESET_SECRET>"
```

Takes ~10–60 seconds (it runs the real scheduling engine). Response:
`{"ok":true,"scheduleId":"…"}`. The demo now has ~33 staff across ICU/ER, a
published 6-week schedule (~700 assignments), pending leave requests, PRN
availability, one pending swap request, and the three demo logins from
`DEMO-LOGINS.md`.

## 3. Nightly reset (recommended)

Use any free scheduler (e.g. cron-job.org):

- URL: `https://<demo-url>/api/demo/reset`
- Method: `POST`
- Header: `Authorization: Bearer <DEMO_RESET_SECRET>`
- Schedule: daily, 03:00 America/Chicago
- Timeout: give it 120s+ (engine run)

Anyone demoing can also click **Reset demo** in the banner — same effect,
no secret needed from inside the page.

## 4. Giving a demo

- Send the URL — the prospect lands straight on the manager app (no login).
- The amber banner marks it as a demo; the Reset button restores pristine
  state in about a minute if a previous visitor left a mess.
- Nurse portal: open `/login` on a phone (or narrow window) — James's
  credentials are pre-filled; Olivia (`olivia.bennett@cah.local` /
  `demo1234`) shows the per-diem availability flow. All logins:
  `DEMO-LOGINS.md`.
- The First-Cycle Guide's practice tutorial (dashboard) is the best live
  walkthrough of callouts, open shifts, and swaps — it creates and cleans up
  its own examples.

## 5. Troubleshooting

| Symptom                                           | Cause / fix                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No banner, reset returns 404                      | `DEMO_MODE` is not `true` on the service.                                                                                                                                                                           |
| Reset returns 401                                 | Wrong/missing `DEMO_RESET_SECRET` bearer header (or the call is cross-origin without the secret).                                                                                                                   |
| Reset returns 429                                 | Successful reset within the last 60s — wait a minute. (This limit is enforced reliably in the deployed single-process server; under local `next dev` it may not trigger — dev recompiles don't share module state.) |
| Nurse login says invalid/logged out after a reset | Resets recreate accounts with new internal ids, which orphans old sessions — just log in again (passwords unchanged).                                                                                               |
| Seed curl times out                               | Engine still running; re-check the schedule in the UI before retrying — then wait 60s for the rate limit.                                                                                                           |

## 6. Relationship to production

The demo service never shares data with any real instance: separate service,
separate volume, separate secrets. The reset endpoint physically cannot run
elsewhere — `resetDemoData()` throws unless `DEMO_MODE=true`, and no other
deployment sets that flag. After the multi-tenant foundation lands (spec
§3, `docs/superpowers/specs/2026-07-04-production-saas-design.md`), this
service is replaced by a `demo` tenant and retired.
