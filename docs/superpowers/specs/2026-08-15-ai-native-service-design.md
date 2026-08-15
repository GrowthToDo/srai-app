# AI-Native Service Design — SSAI's application of the EMCAP playbook

Status: approved direction (founder, 2026-08-15). Source: "The AI-Native
Services Playbook" (Emergence Capital, emcap.com). This doc maps that playbook
onto SimpleScheduleAI's service mode and is the reference for every decision
about service delivery, metrics, and the automation roadmap. It extends — does
not replace — the production spec (`2026-07-04-production-saas-design.md`).

Definition being applied: an AI-Native Service "collapses software and services
into one integrated system," delivering complete outcomes at 50%+ gross margin,
where AI does a material share of the work. The failure mode it warns against
is **Mirage PMF**: revenue growth powered by hidden human labor.

---

## 1. Scorecard — where we already comply, where we don't

Aligned (no action): narrow scope (nurse scheduling, TX CAHs only), downmarket
homogeneity (25-bed CAHs are structurally similar → productizes fast), demo-led
GTM (live demo, competitors show decks), outcome pricing from day one (flat
$1,000–1,500/mo, never labor-hours — we skip the painful transition the
playbook describes), AI genuinely does the core work (the engine generates the
schedules).

Gaps this doc closes: no AI-leverage metric, no data rights, no unit-economics
honesty, Mirage-PMF trap ahead of us (onboarding + per-account labor), domain
credibility (being worked: first customer + clinical advisor, both in
progress), and — the biggest upgrade — the service's outcome promise itself
(§5).

Playbook sections deliberately skipped: M&A (irrelevant at this stage),
incumbent partnerships (TORCH deferred until after first customer).

## 2. The two-metric system

Two north stars, two jobs, never merged into one number.

### 2a. FMH — founder-minutes per hospital-month (internal; the HURT analog)

Every minute the founder spends **delivering** the service for a specific
hospital in a month. Excluded: sales, content, product development (R&D, not
COGS). Onboarding minutes logged separately per hospital (one-time cost with
its own ratchet, §7).

Log: gitignored `ops/service-log.csv` in this repo (same treatment as
`leads/`). Schema: `date, hospital, minutes, category, note`. Categories:
`schedule_check | rule_tweak | callout_help | comms | import_fix | report |
onboarding | other`. Discipline: log within a minute of each touch (phone
notes app fine, transcribe weekly). The category totals ARE the automation
shopping list — no guessing where the time goes.

Targets (founder's own numbers): ≤5 hrs/hospital months 1–2 of an account,
≤2 hrs by months 4–6. As FMH → 0, margins → software margins.

What shrinks FMH (stated precisely, because "the algo learns" is not our
mechanism — the engine is deterministic): (a) the hospital's rule config
converging, (b) the runbook maturing, (c) delivery agents absorbing routine
founder tasks (§6), (d) config templates from prior hospitals (§4 Loop 1).

### 2b. Customer outcome pair (external; what the hospital buys)

- **Covered-shift rate** — % of required shift-slots filled at shift start,
  computed from assignments vs effective-required (census-aware; the
  `effective-required` cascade and the staffing-context audit notes already
  give us this).
- **Callout-to-covered time** — median minutes from `callout_logged` to
  `callout_filled` (both timestamps already in the audit log).

These headline the monthly proof-of-work report (§5d). The customer never
sees FMH; the founder never lets the outcome pair slip to buy FMH.

**The read-together rule (monthly, 1st-of-month ritual):** FMH falling while
coverage holds = the AINS model working. FMH falling while coverage slips =
neglect dressed as automation. Reviewed side by side, per hospital, before
any other business decision that month.

## 3. Honest unit economics (the playbook's COGS rule, applied)

Founder labor belongs in COGS even though nobody invoices it. Impute $100/hr
(assumption; revisit at first hire). Per hospital at $1,250/mo average:

| Scenario     | Founder hrs | Labor COGS | Infra (hosting+SMS+AI share) | Gross margin                       |
| ------------ | ----------- | ---------- | ---------------------------- | ---------------------------------- |
| Launch state | 5           | $500       | ~$50–75                      | **~55%** — services-firm territory |
| Target state | 2           | $200       | ~$50–75                      | **~78–80%** — real AINS            |
| Stretch      | 1           | $100       | ~$50–75                      | ~86%                               |

The 55% row is not failure — it is month 1–2 of every account. It becomes
Mirage PMF only if it never moves (tripwires, §7). At 8–12 hospitals solo
(founder's stated capacity target), steady state must sit at ≤2 hrs/account
or delivery alone consumes 16–24 hrs/month before sales, content, or product.

## 4. Data rights and the flywheel (internal use only — founder decision)

### 4a. Engagement-letter clause (draft; lawyer reviews before signature #1)

> "[Hospital] owns all of its data. [Hospital] grants SimpleScheduleAI the
> right to use de-identified operational data — such as scheduling
> configurations, staffing patterns, and callout statistics, with all
> hospital, staff, and patient identifiers removed — to maintain and improve
> the services provided to its customers. SimpleScheduleAI will not publish,
> sell, or share this data, and will not use it in any form that could
> identify [Hospital] or its staff. Upon termination, [Hospital]'s data is
> deleted per the offboarding terms; improvements already incorporated into
> the service are retained."

No published benchmarks (founder call, 2026-08-15). Door stays open for an
opt-in benchmark program later. Portability stays a trust asset: full export,
no lock-in — the moat is value and habit, never hostage data.

### 4b. The five loops (how data improves a deterministic solver)

The solver never "learns." The data improves its inputs, its scoring, its
rulebook, and our confidence to replace it:

1. **Default-config library.** Each hospital's converged config (bands, rule
   weights, quotas, escalation orders) feeds unit-type templates. Hospital #5
   starts from "median TX-CAH ICU config," not from scratch. Cuts onboarding
   and `rule_tweak` FMH. Maintained by hand.
2. **Revealed-preference tuning.** `scenario_selected` tells us which of the
   three drafts DONs actually pick (if "Cost" is never chosen, the presets are
   wrong). Post-generation manual edits are labels saying "the solver was
   wrong here" — clustered, they expose miscalibrated weights/thresholds.
   Metric: **post-generation edit rate** (edits per 100 assignments), our
   schedule-quality analog of HURT. Falling edit rate = solver converging on
   what a DON would have done.
3. **Missing-rule discovery.** Overrides carry `overriddenRuleId` +
   justification. Repeated similar justifications across hospitals = a
   missing rule type → new evaluator, shipped to every customer. The rulebook
   grows 22 → N on evidence.
4. **Private benchmark suite.** Every generation run logs seed + score
   breakdown and is reproducible. Each real hospital-period becomes a stored
   instance with a DON-approved answer. Solver upgrades (CP-SAT spike) get
   judged against this library, not argued about. A library of real CAH
   instances with accepted solutions is a data moat competitors cannot
   download.
5. **Operational priors.** Callout rates by shift/day/season and census-band
   history enable advisory surfaces ("Friday nights run 18% callout here —
   this draft leaves you one float short Fridays"). Framing is always
   "deviation signals," never "AI predicts" — same honesty rule we hold M7 to.

## 5. The service ladder — JTBD framing (founder direction, 2026-08-15)

### 5a. The reframe

The DON does not hire us for information; they hire us for absence of
problems. A candidate shortlist at 3am is homework; a filled shift at 3am is
the job. Every service loop must end with the customer receiving an outcome
or making exactly one tap-decision — never doing legwork.

This upgrades the promise from "a compliant schedule arrives" to **"your unit
stays staffed — around the clock."** No competitor in the CAH lane delivers
the closed loop (YouShift describes the pattern for physician groups; M7 does
not attempt it). When the coverage desk ships for real, it is a natural
second pricing tier; do not reprice before then.

### 5b. The autonomy principle

The agent executes all mechanics. Humans keep exactly three decision types:

1. **Money** — agency call-in, forced OT beyond threshold, VTO/send-home
2. **Compliance overrides** — anything that would break one of the 22 rules
3. **People judgment** — disputes, performance, interpersonal constraints

**Trust dial, per hospital, per loop:** confirm-each-action → auto-within-
policy, flipped only by the DON after watching the loop be right. Autonomy is
granted by the customer per workflow, never assumed.

### 5c. The canonical loop — 3am callout, fully specified

1. **Detect** — nurse texts/calls the unit's SSAI number: "sick, can't make
   day shift."
2. **Validate before contact** — the deterministic engine screens every
   potential replacement against all 22 rules plus the unit's escalation
   sequence (float → per-diem → OT → agency). Nobody is ever offered a shift
   the system would refuse to assign. This rule-checked outreach is the
   differentiator over any generic call-bot.
3. **Contact** — sequential in ranked order, never blast-all: SMS first; no
   reply in ~10 min at night → voice call (a ring wakes, a text doesn't).
   Timeouts per candidate, then next.
4. **Collect + select** — first qualified yes per policy wins; others get
   "covered, thanks" (their responses feed fairness data).
5. **Execute** — schedule updated; audit log records the full contact trail
   (who was asked, in what order, who declined — the fairness receipt).
6. **Report the outcome** — DON wakes to: "Night callout 3:02, Sarah K.
   confirmed 3:41, schedule updated. No action needed." A receipt, not a task.
7. **Decision-ready escalation** — list exhausted → "Nobody accepted.
   Options: (a) agency ~$X, (b) OT for J. — needs your override, (c) run
   short 1 slot, census green." Failure arrives packaged as a decision.

### 5d. The full ladder

| DON's job (their words)                                  | Full-loop version                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Callout → shift covered, without me working the phones" | §5c                                                                                                                                                                                                                                                                                       |
| "Tomorrow must not blow up"                              | 48h scan each morning; a gap STARTS the fill loop; 6am message says "was short, now covered"                                                                                                                                                                                              |
| "PRN availability always current"                        | Agent runs monthly collection conversation per PRN nurse; parses in; flags only non-responders                                                                                                                                                                                            |
| "Swaps without me playing telephone"                     | Nurse texts "can't do Tuesday" → agent finds rule-clean counterpart swaps, gets both to agree, applies per the DON's dial                                                                                                                                                                 |
| "Census drops → fair releases, no awkward call"          | Detect excess (staffing-context audit notes, shipped 2026-08-11) → DON approves the release (money) → agent picks per `lowCensusOrder` + flex-hours rotation, notifies, logs                                                                                                              |
| "A schedule nobody fights about"                         | Existing core loop                                                                                                                                                                                                                                                                        |
| Monthly proof-of-work report                             | Line items sourced from audit actions: schedules generated (`schedule_auto_generated`), rule checks + overrides, callouts covered + median fill time, census changes + releases, retainer changes made. Assembled by hand (~15 min, logged as `report`) until FMH justifies the generator |

Every row ends with an outcome delivered or one tap. If a row ends with "and
then the DON does the legwork," it is not done.

## 6. Bounded-autonomy architecture (answering our own critique)

We wrote about YouShift: "an LLM mis-translating a rest rule is a
patient-safety-adjacent bug." Our loops must survive that sentence.

- **The deterministic core decides; the LLM converses.** Eligibility, rule
  checks, ranking, and selection are engine code. The LLM layer only drafts
  and interprets messages. No LLM output ever directly mutates a schedule.
- **Conservative parsing.** Only unambiguous confirmations auto-process
  (exact-token YES/NO reply formats, stated in the outbound message).
  "I guess, if nobody else can..." → human. Ambiguity always falls to a
  person, never to a guess.
- **Timeout ceilings.** Every loop has a maximum unattended duration; not
  covered within it → DON (and founder) woken with decision-ready options.
  The system never silently spins. The published escalation SLA (1hr
  business / 3hr after-hours for coverage-blocking issues) applies to
  machine loops too.
- **Dead-man fallback.** The hospital always retains its paper phone list
  and the old manual process; stated plainly at onboarding. If our channel
  is down, they are degraded, not stranded.
- **Consent is architectural.** TCPA prior express consent from every nurse
  is a required onboarding artifact (signup sheet in the P4 runbook), since
  the entire ladder rides the SMS/voice channel. Twilio 10DLC business-SMS
  registration takes days–weeks → start it before hospital #1 goes live.
  Nurse phone numbers are PII: minimum retention, never exported, covered by
  the engagement letter. Callout reasons are health-adjacent — store the
  minimum ("sick"), never diagnosis detail.

## 7. Tripwires (Mirage-PMF warning signs, made operational)

"Schedule period" = one 6-week cycle. Median FMH = median across active
hospitals (meaningful from ≥3; before that, the 5-hr ceiling governs).

1. **FMH flat** — a hospital within 10% across 3 consecutive periods while
   above 2 hrs → stop selling; automate that hospital's top time-category
   before the next signature.
2. **Bespoke creep** — any hospital >2× median FMH → standardize or
   re-scope. ICP discipline, not heroics.
3. **Onboarding ratchet** — onboarding minutes for hospital N must be less
   than for N-1. Miss once = investigate; twice = stop selling until the
   runbook is fixed.
4. **Custom-code-before-contract** — default no (Crosby's "comfortable
   saying no"). Log it; three hospitals asking = roadmap item.
5. **Coverage guard** — outcome pair (§2b) degrading in any month voids all
   FMH celebration until restored.

Pausing sales on a tripwire is a pre-agreed move, not a panic.

## 8. Sequencing

Interleaves with the production spec's phases (P1 accounts, P3 trust pack,
P4 runbook precede hospital #1; P2 file-per-tenant gated on hospital #2).

**Now (pre-customer, cheap, time-sensitive):**

- Create `ops/service-log.csv` + gitignore entry; start logging any real
  service-like work immediately (practice the habit) — DONE 2026-08-16
- Conversation artifacts (§11a): every prospect/DON interaction leaves a
  2-minute note in `ops/conversations/` within a day — DIR CREATED 2026-08-16
- Data clause → engagement-letter template (P4); flag for lawyer review
- Proof-of-work report template (one page; §5d line items)
- Consent artifact + nurse-channel expectations → P4 runbook
- Start Twilio 10DLC registration when hospital #1 is in closing

**Hospital #1–2 (deliberately unscalable):**

- "Sleep at the customer's office" onboarding; document the runbook AS YOU
  GO; log everything, `onboarding` category separate
- Channel build ladder step (a): Twilio number, message templates, inbound
  logging — needed even for the manual routine
- Callout desk delivered MANUALLY: system ranks, founder texts from console.
  Written into the runbook → legitimately claimable as service capability
  (written-routine test, capability inventory §1b)
- Monthly ritual begins: per-hospital health (outcome pair → FMH → category
  totals) first, everything else second

**Hospital #3+ (automation on evidence):**

- Channel ladder (b) attended loop → (c) unattended + DON confirm-each →
  (d) auto-within-policy, each step earned via the trust dial
- First delivery agents chosen by FMH category totals (predicted winners:
  comms drafter, import cleaner, report generator — but the log decides)
- Loop 1 config templates begin paying out; edit-rate metric (Loop 2) starts
  driving weight tuning

**The one exception to build-on-evidence:** the unattended night loop can
never be delivered manually (founder sleeps), so channel infrastructure is a
build decision, not an FMH decision — but it still enters via the ladder
above, not as a big-bang bot.

**Explicitly deferred:** TORCH formal partnership (after first customer),
published benchmarks (needs opt-in program), voice-AI beyond simple night
calls, coverage-desk pricing tier (when it ships for real), M&A (n/a).

**Demo backlog note:** the demo imperative applies to the new promise too —
eventually the demo should simulate the callout loop (fake SMS thread,
ranked contacts, filled shift). Show, don't tell.

## 9. Claims guardrails (so ambition never becomes overclaim)

Everything in §5–6 is ROADMAP until shipped or runbook-real. Rules of the
capability inventory (`docs/seo/product-capability-inventory-2026-08.md`
§1b, website repo) govern:

- SERVICE claim requires: software does it, OR the founder does it as a
  routine WRITTEN in the runbook (written-routine test, 2026-08-11)
- PRODUCT claim requires: software does it unassisted
- The manual callout desk becomes claimable the day its runbook entry
  exists; the autonomous loop becomes claimable the day it runs unattended
- "AI-native service" self-label stays (registry canon); mechanism honesty
  stays (we say exactly what the AI does — the anti-M7 rule)

## 10. Team note (playbook §I, solo-adapted)

The delivery "team" is founder + AI agents under the repo's operating model
(verify gate, ground-truth, agent contracts). The playbook's "hire product
leadership early" translates to: the first hire, when a tripwire or capacity
forces it, is a DELIVERY person (service ops), not sales — sales stays
founder-led while credibility is the constraint. Clinical advisor (in
progress) covers the domain-credibility gap alongside customer #1's DON
becoming the reference.

## 11. Company-brain addendum (Blomfield / YC Startup School Paris, adopted 2026-08-16)

Source: "Building And Structuring An AI Native Company" (Tom Blomfield, YC —
youtu.be/Z3JyAqh4ixg). His five-layer loop (sensors → policy → tools →
quality gates → learning, humans at the edge) matches what §§4-6 already
build INTO THE SERVICE. This addendum applies the same layers to
SSAI-the-company. Two adopted practices, two notes.

### 11a. Conversation artifacts — close the sensor gap (ADOPTED, starts now)

The repos already are the company brain: dossiers, runbooks, DECISIONS.md,
KNOWN-TRAPS, memory — all agent-legible, and the reason delivery agents
compound instead of restarting. The un-instrumented sensor is the founder's
VOICE interactions: prospect calls, DON conversations, emails — today they
evaporate.

Ritual: within a day of any hospital/prospect interaction, a 2-minute note
lands in the scheduler repo at `ops/conversations/YYYY-MM-DD-<who>.md`
(gitignored path, same treatment as `leads/` — real names stay out of the
public repo). Capture: who, what they objected to, the exact phrases they
used for their pain, what confused them, what they asked that we couldn't
answer. Agents then fold these into: the objection library (lead-gen
playbook), the website FAQ, the P4 runbook, and the facts dossier — the
"office hours → living user manual" pattern. An unanswerable question
appearing twice = a runbook or FAQ entry by default.

### 11b. The founder-gate trust dial (ADOPTED, activates with hospital #1)

The DON gets a confirm-each → auto-within-policy dial (§5b); the founder's
own draft-check gets the same dial, pointed inward. Driven by the
post-generation edit rate (§4b Loop 2), per hospital:

- **Full check** (default): every draft reviewed before delivery.
- **Spot check**: edit rate below ~5 edits/100 assignments for 2 consecutive
  periods → review one draft per period in depth + scan the others'
  rule-violation and understaffed counts only.
- **Anomaly-triggered**: additionally, ANY of these always force a full
  review regardless of tier — new rule config change that period, census
  band changes, first period after onboarding, understaffed count > 0, or a
  DON complaint.

The gate earns its way down per hospital on evidence, exactly like the
customer-facing dial — it never disappears, it narrows. This is the
principled `schedule_check` FMH reducer the spec previously lacked. Log tier
changes in DECISIONS.md.

### 11c. Notes (recorded, not yet operationalized)

- **Token-before-headcount test** (amends §7): when a tripwire fires, the
  fix is agents + runbook FIRST; a hire is the last resort after an
  automation attempt demonstrably failed, never the reflex. And amending §3:
  infra/AI COGS RISING while labor COGS falls is the AINS signature working
  as intended — "if your API bill doesn't make you uncomfortable, you're not
  doing enough" (Blomfield). Do not misread a growing token bill as waste;
  read it against FMH falling.
- **Sales-call simulation** (cross-ref: docs/lead-gen-playbook.md Phase 5):
  before the first real administrator call, rehearse against an AI playing a
  skeptical CAH DON built from the ICP + objection library. The first real
  call should not be the first rep.
- **Explicitly NOT adopted:** the 80%-leaner-headcount framing as public
  message. Hospitals hear "AI replaces staff" as a threat; our calibrated
  positioning ("your nurses never have to learn a new app") stays.
