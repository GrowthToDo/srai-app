# Competitor Lessons — Product Ideas Worth Stealing (and Not)

Working notes from deep competitor research. Each entry: what they do, whether
we adopt it, and when. Facts and citations live in the website repo's
`docs/seo/competitor-dossier.md`; this file is the product-decision side.

## From YouShift (researched 2026-07-06 — YC W25, physician-group scheduler)

1. **Points-based preference budget — ADOPT LATER (post-first-pilot).**
   Their staff spend a limited points budget to weight shift preferences, so
   fairness is explainable ("you spent your points on Christmas off, she spent
   hers on weekends"). Map to us as a preference-weighting INPUT to the soft
   rules — nurses rank what matters most each 6-week period, the engine's
   preference-match penalty uses the weights. Explicitly NOT self-scheduling:
   the DON still owns the schedule (founder decision; CAH accountability
   culture). Backlog card, revisit after pilot #1 feedback.

2. **"Every change is compliance-checked in real time" — SAY IT NOW.**
   We already do this (violations modal, swap validation, callout
   escalation). Their copy claims it loudly; ours doesn't. Website copy task,
   zero engineering.

3. **Positioning ammunition — USE IN SALES MATERIALS.**
   As of 2026-07-06 YouShift has: no G2/Capterra/Trustpilot listings, no
   published pricing, no named customers, no nurse/CAH language, "agentic AI"
   marketing with zero technical disclosure. Our contrast: published flat
   pricing, a self-serve demo link, 22 readable rules, CAH-specific
   everything. Against AI buzzwords, "click the demo and read the rules" is
   the stronger pitch to a rural administrator. (Neutral framing rule
   applies in public content — see dossier.)

4. **Swap compatibility indicator — SMALL POLISH, SOMEDAY.**
   Their mobile swap flow shows a "compatibility indicator" before a nurse
   proposes a swap. Our /my swap dialog already filters to eligible partners
   via /api/my/swap-options; surfacing a visible "compatible / creates
   overtime" badge per candidate is a small UX win when we next touch the
   nurse portal.

5. **Wedge-to-OS pattern — AWARENESS ONLY.**
   They ship time clock + labor-cost analytics and openly aim to be "Rippling
   for healthcare." That's the standard post-trust expansion path (scheduling
   → time & attendance → payroll/credentialing). Not our fight pre-revenue;
   remember it when pilots ask "can it also do timekeeping?" — the answer is
   "on the roadmap after scheduling is solid," not "no."

6. **Threat level: LOW-WATCH.** Bottom-up doctor adoption (app-store,
   1000+ individual physicians) doesn't reach CAH DONs. M7 Health remains the
   head-to-head AEO/product competitor. Re-check YouShift ~quarterly for a
   nursing pivot.

## From M7 Health (researched 2026-07-06 — the head-to-head competitor)

1. **The CAH authority lane is claimed but undefended — CONTEST NOW.**
   ChatGPT cites M7's 2026-04-01 CAH post as the answer for "best nurse
   scheduling software for critical access hospitals," yet that post names
   zero CAH customers and contains zero proof — and M7's entire named
   customer list (Ochsner 47 hospitals, ScionHealth, Lifepoint...) is
   multi-hospital systems. Our counter is NOT a fake case study (hard rule:
   we have no pilot customers and never invent results) — it's out-evidencing
   with what's true today: the live demo link, published flat pricing, the
   readable 22-rule list, worked-math posts. Speed matters: their content
   arc is accelerating post-Series-A.

2. **Mechanism specificity beats "AI balances" — DOUBLE DOWN.**
   M7 never says how anything works ("AI forecasts," "AI balances"); their
   own job ad frames AI/ML as something to build; their turnover feature is
   baseline-deviation rules in AI wrapping. We can honestly publish exactly
   how our engine works (greedy + local-search over 22 named rules, three
   variants the DON chooses). Transparency is our cheapest durable
   differentiator against both M7 and YouShift.

3. **They have no native nurse app either (mobile web) — PARITY, note it.**
   No app-store presence found for M7. Our /my portal is the same
   architecture choice; nobody has an app-store advantage in this matchup.

4. **Their turnover-risk feature is a REAL product idea — ADOPT LATER.**
   Flagging "this nurse's callout rate is climbing vs her own baseline /
   she stopped submitting preferences" is rule-based, cheap, and fits our
   data model (callouts, preferences, OT already tracked). Honest framing:
   deviation signals, not "AI prediction." Post-pilot backlog card — a DON
   retention conversation starter.

5. **Their 4-week onboarding claim matches our promise — PROVE OURS.**
   "Most CAHs live within a few weeks, no IT burden" is exactly our one-month
   setup pitch. Ours is backed by a written runbook (spec §6); when pilot #1
   completes onboarding, document the actual timeline — first real proof in
   the category wins the claim.

6. **Threat level: HIGH-ACTIVE.** $10M Series A (2025-07), Ochsner
   system-wide, monthly content, hiring sales/CS. They are moving downmarket
   via content into OUR lane while their product proof stays enterprise.
   Re-check monthly (weekly citation check already covers the AEO side).

## AI landscape — how we use AI vs how they (probably) do

Recorded 2026-07-06 so the reasoning survives the session. Mechanisms below
for competitors are informed inference — neither company discloses its stack.

**Us (fact, not inference):** the scheduling engine is classical algorithmic
optimization — greedy construction + local-search improvement over 22
explicit rules, three weighted variants (Balanced/Fair/Cost) the DON chooses
from. Deterministic, auditable, seconds-fast, zero LLM in the product
runtime. No ML trained on data, no demand forecasting from history (never
claim these). The LLM kind of AI lives in the SERVICE layer: AI agents build
and operate the product, and the managed-service delivery (imports, rule
tuning, support) is founder+AI labor. That is the honest content of
"AI-native service."

**YouShift ("optimization algorithms + agentic AI"):** solver undisclosed;
founders describe the problem correctly as constrained multi-objective
allocation, so a conventional optimizer almost certainly does the math. The
"agentic AI" layer (their job ad: "AI agent layer... turning real-world
operational workflows into agentic, automated systems") is best read as LLM
agents wrapped AROUND the solver — the LLM mediates, never decides:

- natural-language rule setup (admin types a rule, agent translates it into
  solver constraints)
- exception handling (callout arrives, agent evaluates candidates, drafts
  and chases messages, proposes swap chains)
- conversational schedule edits ("move X off Thursday, keep coverage" →
  agent computes minimal repair and proposes it)
- plain-language explanations of constraint decisions

Risk profile of that pattern in a compliance domain: an LLM mis-translating
a rest rule is a patient-safety-adjacent bug — which is exactly why the
agent layer stays an interface, not an authority.

**M7 ("AI forecasts / AI balances"):** outcome-framed language only, never
mechanism; own job ad frames AI/ML as capabilities TO BUILD; flagship
"AI-powered" turnover feature self-describes as baseline-deviation rules.
Assessment: rule-driven heart, AI costume.

**Our roadmap equivalents (post-revenue, DON stays in command):** the two
agentic features that fit CAH life are natural-language rule configuration
and callout-communication drafting; "explain this schedule" narration is a
close third. Solver upgrades (OPTIMUS / CP-SAT spike) are a separate axis
from the agentic layer — do not conflate them. Core thesis: agentic AI is
not a moat; it is LLM glue around the same math all three products run.
Workflow fit for a 25-bed hospital is the moat.
