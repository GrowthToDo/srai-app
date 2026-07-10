# Stickiness Strategy — Making SSAI a Habit, Not a Tool

Planning document (2026-07-06, founder-requested). No execution implied;
build order lives at the end as phases gated on real usage evidence.
Framework: Nir Eyal's Hooked loop (Trigger → Action → Variable Reward →
Investment), extended with the three levers that matter more in B2B:
stored value / data gravity, multi-stakeholder entrenchment, and workflow
centrality. Guardrail throughout: hospital trust is the brand — habit
design yes, manipulation no (no fake urgency, no engagement bait, no
dark patterns; every "reward" must be real operational information).

## 0. The core problem stickiness must solve

A schedule generator is used ~8 times a year (six-week cycles). Nobody
builds a habit around 8 annual touches, and a product used 8 times a year
is trivially replaceable at renewal. The product only becomes sticky when
it owns the DAILY layer — callouts, swaps, leave, census, open shifts —
and when leaving would mean losing accumulated history that cannot be
exported into a competitor. Both are already product strengths; stickiness
work = surfacing and compounding them, not building something new.

## 1. Hooked loops, per persona

### 1a. The DON / nurse manager (the daily user)

- **Triggers.** The best triggers are external and real: a nurse calls out
  (unpredictable, urgent, emotional — the perfect habit trigger because the
  product demonstrably wins the moment), a leave request arrives, census
  changes, the generation window opens. Product's job: be the reflexive
  first tab for each. Notification → one click → the exact screen.
  Manufactured trigger worth adding: a WEEKLY DIGEST ("3 things need your
  attention: 1 pending swap, 2 leave requests, Sunday night is 1 RN
  short") — one email, Monday morning, before the huddle. Internal trigger
  to cultivate over time: the anxiety "is the unit covered?" should have
  one reflexive answer — open the dashboard.
- **Action (keep it minimal).** Log callout → ranked shortlist appears.
  That flow is already the product's best habit-former: effort collapses
  from working down a phone list to three targeted calls.
- **Variable reward.** Genuine variability already exists: who tops the
  shortlist, whether a swap resolves cleanly, what generation produces.
  Add earned-insight rewards (Eyal's "rewards of the self"): violations
  trending to zero across cycles, fairness spread narrowing, estimated
  OT avoided this period. Numbers that move = reasons to look.
- **Investment (the flywheel).** Every rule tweak, preference recorded,
  approved leave, resolved callout, and completed cycle makes the NEXT
  schedule better and the tool more theirs. Surface this explicitly:
  "12 rules tuned to your unit · 3 cycles of history" — investment users
  can SEE is investment they defend.

### 1b. Nurses (the entrenchment multiplier — most important long-term)

The DON can be sold to; nurses make it unremovable. When 30 nurses check
their schedule on their phones, submit availability, and pick up open
shifts through the portal, a DON who considers switching faces a staff
revolt. Bottom-up entrenchment is the strongest retention force in
workforce software.

- **Triggers:** schedule published (already notifies), swap request aimed
  at you, open shift you're eligible for (this one is money in a nurse's
  pocket — the highest-value nurse-side notification we can build).
- **Action:** check schedule / accept swap / claim shift — each one tap
  after login.
- **Variable reward:** did my preferences get honored this cycle? Is
  there an open shift worth taking? Swap accepted? All genuinely variable,
  all real.
- **Investment:** preferences, PRN availability, swap history — personal
  data that makes THEIR schedule better, which they lose by leaving.
  A nurse who maintains her availability in the portal has a stake in it.

### 1c. The Administrator / CEO (the renewal signer)

Uses the product ~never; decides renewal. Their loop runs on reporting,
not usage: a MONTHLY STAFFING HEALTH report (email/PDF) — OT trend, agency
usage, fill rate, compliance posture, fairness spread. One page, board-
meeting ready. The buyer's habit is reading the number that proves the
spend; give it to them without asking. (Also the natural home for our
worked-math DNA.)

## 2. Stored value — the moats that compound (data gravity)

1. **The fairness ledger is the crown jewel.** Holiday and weekend
   history is CUMULATIVE ACROSS YEARS: who worked last Christmas decides
   who works this one. A competitor starting fresh cannot know this —
   switching tools literally breaks fairness continuity, and nurses will
   notice. Surface it (per-nurse "worked Thanksgiving 2026, exempt 2027")
   so its value is visible long before anyone thinks about leaving.
2. **Tuned rule configuration.** 22 rules bent to one unit's reality over
   several cycles = a bespoke fit no fresh install has on day one.
3. **The audit trail as evidence archive.** Every approval, override, and
   swap decision with timestamps — dispute insurance and survey-readiness
   that only grows. "Your last 18 months of staffing decisions,
   documented" is a renewal argument by itself.
4. **Preference/availability corpus.** The longer nurses feed it, the
   better schedules get — classic data-gravity loop, entirely honest.

Principle: we never hold data hostage (export always works — it's in the
trust pack). Stored value must make staying BETTER, not leaving painful
by force. Fairness continuity does this naturally: the data is portable,
but no competitor's engine consumes it.

## 3. Workflow centrality — become the system of record

Stickiness endgame: SSAI is where scheduling TRUTH lives. Any question —
"who's on tonight?", "why is she off?", "who approved that swap?" — has
one answer: check SSAI. Each daily-churn feature already pulls toward
this; the discipline is ensuring every schedule-touching event is easier
to do IN the product than around it (the moment DONs resolve callouts by
text and back-fill the tool, centrality is lost). Watch this in pilot #1
usability sessions specifically.

## 4. What we deliberately will NOT do

- Streaks, badges, points-for-engagement, confetti beyond the existing
  first-publish celebration — clinical users smell gamification instantly.
- Artificial scarcity/urgency, re-engagement spam, guilt copy.
- Notification volume that trains people to ignore notifications: every
  nurse notification must be actionable about THEIR shift/money/request.
- Data lock-in by obstruction (see §2 principle).

## 5. Phasing (gated on evidence, not calendar)

- **Phase 0 — already shipped, frame as stickiness:** publish
  notifications, swap/leave/callout loops, practice tutorial (an
  investment mechanic — completing it is sunk learning), audit log,
  preference/PRN capture. Launch messaging should sell the daily layer,
  not just generation.
- **Phase A — with pilot #1 (cheap, high leverage):** DON weekly digest
  email; admin monthly staffing-health report; make the fairness ledger
  visible per nurse (holiday/weekend history view). All three are
  read-only surfaces over data we already store.
- **Phase B — once nurses are active:** open-shift eligibility
  notifications (nurse-side money loop); "your preferences honored: 8/10
  this cycle" transparency card (trust + investment reward). NOTE: this is
  NEW nurse-portal surface — today open shifts are manager-side only (the
  system ranks candidates, the DON calls the nurse; nurses neither see nor
  claim open shifts in /my). Design as notify + express-interest with DON
  confirmation — never nurse self-assignment.
- **Phase C — insight rewards:** turnover-risk deviation cards for the
  DON (see competitor-lessons.md M7 item 4 — honest baseline-deviation
  framing); cycle-over-cycle trends (violations, OT, fairness spread).
- **Phase D — system-of-record expansion:** timekeeping-lite/etc. only
  after scheduling stickiness is proven (see YouShift wedge note in
  competitor-lessons.md).

## 6. How we'll know it's working (define before pilot #1)

- DON: opens/week outside generation week (target: it becomes daily);
  % of callouts logged in-system (vs discovered after the fact); digest
  open-and-click.
- Nurses: % of roster active in portal monthly (target >70%); % of
  swaps initiated in-app; time-to-view after publish.
- Aha moments to instrument: first callout resolved via shortlist
  (<5 min), first swap completed end-to-end, first cycle where a nurse's
  submitted preference visibly shaped the schedule.
- The renewal question at month 5 of a pilot should already be answered
  by usage: if nurses check it weekly and the DON's Monday starts in it,
  renewal is a formality.
