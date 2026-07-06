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
