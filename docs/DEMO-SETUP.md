# Demo Showroom — Setup & Operations

The demo showroom is a second Railway service running this same repo. It
starts empty and Reset always wipes back to empty — it's a from-scratch
onboarding sandbox for usability testing, not a furnished showroom. Share its
URL with any prospect; they can click everything and touch nothing real.

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

## 2. First boot — the demo starts empty

The fresh service starts with an empty database, and reset always wipes back
to empty too — the demo is a from-scratch onboarding sandbox, not a
furnished showroom. Optionally reset first to confirm the endpoint works:

```bash
curl -X POST https://<demo-url>/api/demo/reset \
  -H "Authorization: Bearer <DEMO_RESET_SECRET>"
```

Near-instant (no engine run). Response: `{"ok":true}`.

To actually populate the demo, go to `/setup` and use "Download Template" —
GET `/api/import` serves the bundled sample workbook
(`public/sample-hospital-data.xlsx`) whenever the database has no staff —
then upload that same file back through the import UI. This gives the demo
~33 staff across ICU/ER, default shift definitions, rules, and census bands.
No schedule is generated automatically; the tester builds one from the
Getting Started guide, same as a real first-time user would.

## 3. Nightly reset (recommended)

Use any free scheduler (e.g. cron-job.org):

- URL: `https://<demo-url>/api/demo/reset`
- Method: `POST`
- Header: `Authorization: Bearer <DEMO_RESET_SECRET>`
- Schedule: daily, 03:00 America/Chicago
- Timeout: default is fine — reset no longer runs the engine, it's near-instant

Anyone demoing can also click **Reset demo** in the banner — same effect,
no secret needed from inside the page.

## 4. Giving a demo

The demo starts empty on purpose — it's testing the real from-scratch
onboarding journey, not a pre-furnished showroom. Walk a prospect (or
yourself) through it in this order:

1. Send the URL — the prospect lands on the manager app (no login).
2. Follow the Getting Started guide's first step: go to `/setup` and click
   **Download Template** — since the database has no staff yet, this serves
   the bundled sample workbook (`public/sample-hospital-data.xlsx`) instead
   of an empty template.
3. Upload that same file back through the `/setup` import UI.
4. Continue with the Getting Started guide from there (rules, census bands,
   generating a schedule, etc).
5. Nurse portal logins (James, Olivia — see `DEMO-LOGINS.md`) only work
   **after** import, since they're provisioned against staff rows that don't
   exist until the sample workbook is imported. Open `/login` on a phone (or
   narrow window) to try them post-import.

The amber banner marks it as a demo; the Reset button wipes everything back
to empty if a previous visitor left a mess, ready for the next walkthrough.

## 5. Troubleshooting

| Symptom                                          | Cause / fix                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No banner, reset returns 404                     | `DEMO_MODE` is not `true` on the service.                                                                                                                                                                           |
| Reset returns 401                                | Wrong/missing `DEMO_RESET_SECRET` bearer header (or the call is cross-origin without the secret).                                                                                                                   |
| Reset returns 429                                | Successful reset within the last 60s — wait a minute. (This limit is enforced reliably in the deployed single-process server; under local `next dev` it may not trigger — dev recompiles don't share module state.) |
| Nurse login says invalid/not found after a reset | Reset wipes staff, which cascade-deletes any nurse login bound to it — import the sample workbook again before trying James/Olivia.                                                                                 |

## 6. Relationship to production

The demo service never shares data with any real instance: separate service,
separate volume, separate secrets. The reset endpoint physically cannot run
elsewhere — `resetDemoData()` throws unless `DEMO_MODE=true`, and no other
deployment sets that flag. After the multi-tenant foundation lands (spec
§3, `docs/superpowers/specs/2026-07-04-production-saas-design.md`), this
service is replaced by a `demo` tenant and retired.
