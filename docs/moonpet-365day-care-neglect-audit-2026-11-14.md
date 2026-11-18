# Moonpet permanent progression, care and neglect — source audit
**14 November 2026 · Draft sandbox only · No gameplay or database mutations**

## Verified current permanent-pet authority

The definitive evolution configuration is `workers/moonboys-api/pets/content/evolutions.json`, corroborated by `docs/moonpet-source-of-truth.md`. Moonpets are **permanent**: there is no 90-day automatic completion. The age gates below are **minimum ownership ages**, not guaranteed automatic unlock dates. An individual pet also needs its level, qualifying boss wins, relics and inventory requirements before evolution.

| Evolution | Minimum pet age (days) | Pet level | Growth Marks (distinct UTC days) | Weekly Crests (distinct qualifying weeks) | Alley King victories | Relics | Required materials |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Street Moonpet | 7 | 5 | 7 | 1 | 0 | 0 | 5 Scrap Metal |
| Cyber Moonpet | 28 | 20 | 21 | 3 | 3 | 2 | 10 Scrap Metal; 3 Evolution Fragments |
| Elite Moonpet | 84 | 35 | 60 | 10 | 8 | 5 | 20 Scrap Metal; 8 Evolution Fragments |
| Moon Guardian | 182 | 45 | 120 | 22 | 12 | 8 | 36 Scrap Metal; 20 Evolution Fragments |
| Legendary Moon Guardian | **365** | **50** | **240** | **44** | **15** | **10** | **60 Scrap Metal; 40 Evolution Fragments** |

The egg/Secret Bot stage precedes the first listed evolution. A 365-day anniversary **alone** cannot grant Legendary. Historic earned XP, Marks, Crests and owned pets persist across later competition quarters. Historical quarter/week evidence remains saved, and new ownership clocks use the pet creation date, not a global quarterly reset.

## Obsolete statements versus legitimate seasonal records

The current source of truth and evolution JSON supersede earlier **90-day total-life / 60 Marks / 10 Crests / days 78–90 Legendary** statements in `docs/moonpet-season-economy-calibration.md`, `docs/pet-game-catch-up-rules.md` and `docs/pet-game-seasonal-model.md`. Those values describe dated Season 1 calibration and must not be copied into permanent-pet public instructions. Nine September source audits also recorded 60/10 as the then-current completion marker; this PR labels those exact cells as historical and superseded rather than rewriting the results they actually observed.

The remaining 90-day references were classified, not blanket-replaced. Legacy Arcade and NBG London competition windows, anti-cheat season buckets, retained client-performance samples, dated roguelite plans, and requested 7/30/90-day simulations are legitimate non-lifecycle uses. Separate quarterly competitions, seasonal leaderboards, migrations and old receipts remain valid and are not erased or renamed.

## Actual care and XP boundaries established from source

The current persistent care data path includes `workers/moonboys-api/pets/care-writes.js` and `workers/moonboys-api/pets/care-decay.js`. The latter advances hunger (+4.5/hour), happiness (-2.8/hour), cleanliness (-3.2/hour) and energy (-2.2/hour) from an authoritative elapsed time and derives health; it is **not** by itself a proposed neglect-debt ledger. `care-writes.js` writes accepted receipt-backed care changes to the owner pet and computes its current XP/level in the D1 transaction. A client button press, a prospective Next Best Action, an open notification or a cached preview is **not** a committed care receipt. Background cooldowns, egg/incubation, switch-of-pet and unavailable/failed actions must be distinguished from deliberate absence.

The directly repeatable care actions currently award the following base values before an accepted receipt is clamped by the remaining daily allowance. Equipment can add the source-defined Pet XP bonus; the transaction saves the actual post-cap amount, so displayed or configured rewards are never proof of earnings.

| Care action | Base Pet XP | Base Community XP | Cooldown and eligibility |
| --- | ---: | ---: | --- |
| Feed | 6 | 2 | 45 seconds; shares the account window with cooked bag meals |
| Play | 10 | 3 | 45 seconds; consumes 12 energy before later decay/stat clamping |
| Clean | 6 | 2 | 45 seconds |
| Sleep | 5 | 1 | 45 seconds; unavailable while a background Sleep/Train activity is active |
| Train | 20 | 6 | 45 seconds; requires at least 18 current energy and is unavailable during a background Sleep/Train activity |
| Energy Drink | 0 | 0 | 10 minutes; maximum 3 accepted uses per UTC day |
| Dance | 0 | 0 | 5 minutes; maximum 5 accepted uses per UTC day |
| Cuddles | 0 | 0 | 5 minutes; maximum 5 accepted uses per UTC day |

`workers/moonboys-api/worker.js` and `workers/moonboys-api/pets/roguelite-foundation.js` enforce a **1,200 Pet XP account/UTC-day aggregate cap** across accepted Pet event receipts and a separate 250 Community XP cap. The Daily Cache offers at most 40 Pet XP from the remaining allowance. Other jobs, runs, events, contracts, activities, bosses and completion claims have source-specific fixed, scaled or bounded rewards, but all permanent Pet XP settlement still enters the same receipt sum and cannot exceed the remaining 1,200. The specialist progression tracks have their own daily award limits (`care` 300, `training` 240, `adventure` 360, `arena` 300, `job` 240 and `bond` 180); those track limits are not additional Pet XP allowances.

The visible-level curve is permanent Pet XP authority: `level = min(100, 1 + floor(sqrt(pet_xp / 40)))`. Therefore Levels 5/20/35/45/50 require at least 640/14,440/46,240/77,440/96,040 lifetime Pet XP respectively, and Level 100 requires 392,040. XP alone does not evolve a pet; the age, Mark, Crest, boss, relic and material gates in the table above still apply.

The 1,200 cap is a safety ceiling, **not** an observed or attainable typical daily return. Source inspection establishes configured offers, cooldowns and accepted-receipt caps, not production cohort earnings. Actual median/casual/dedicated XP per UTC day requires an anonymized query over accepted `telegram_pet_events.pet_xp_awarded`, including zero-activity accounts and cohort definitions. Neither the cap nor the simulator's normalized daily budget is used here as the everyday player's earning rate.

Optional Telegram notifications use a saved preference in `workers/moonboys-api/migrations/032_telegram_pets_notifications.sql` (`enabled`, `last_notified_at`, `last_reason`). The Worker invokes the scanner on the `*/5 * * * *` cron, considers at most 35 opted-in active accounts per scan with a wraparound cursor, and enforces a 180-minute cooldown per immutable source pet after confirmed delivery. **A five-minute tick is not one message to each player.** A message is prepared only for saved progress/unlock notices or a current decayed-state alert (health ≤45, hunger ≥75, cleanliness ≤35, energy ≤25, happiness ≤35, or an unfinished daily mission). One progress message includes at most three saved notices.

Immediately before sending, the scanner rechecks opt-in, source-pet ownership and cooldown and acquires a per-source lease. A confirmed Telegram result writes the source delivery cursor and compatibility `last_notified_at`/`last_reason`; a definitive failure releases the lease for retry; an uncertain transport result is marked `needs_review` and is not automatically duplicated. A 15-second request timeout, overlapping-scan lease and active-pet switch guards are source-tested. The regression suites `scripts/moonpet-notification-settings.test.mjs` and `scripts/moonpet-guidance-notification-scope.test.mjs` exercise save/read failures, opt-out, fair scanning, retries, overlap prevention, delivery acknowledgement and source-pet switching. This source audit does not claim a verified production sent/delivered count; that requires authenticated delivery records and an observed schedule-to-send comparison.

## Next Best Action and mission integration

`workers/moonboys-api/pets/player-guidance.js` already chooses a Next Best Action from committed state. It prioritizes saved reward/activity recovery and active runs, then dangerous vitals, available care, rewards/evolution gates, missions, bosses and economy actions. Daily care-set missions route to the first unfinished Feed/Play/Clean step, while the Mini App also exposes Daily and Weekly Journey guidance. The proposed attendance system must reuse these eligibility and destination decisions so it never penalizes a player for an action the UI correctly says is blocked.

Guidance remains advisory: viewing an action plan, opening a notification, acknowledging a notice, seeing a mission, or receiving a Next Best Action is not attendance. Only the accepted, idempotent, source-pet receipt can count. A future read-only care report should add tomorrow/today attendance status beside the existing Next Best Action and mission guidance, and should prefer recovery or urgent vitals over a generic attendance prompt.

## Necessary server-side evidence before introducing any penalty

- **Eligibility:** define an approved, versioned set of permitted care windows by pet state and action cooldown, including hatch/adoption boundaries, account outages and unavailable activities. Opting out of Telegram reminders must never count as neglect.
- **Attendance:** count only committed, idempotent, pet-owned `feed`, `play`, `clean`, `sleep` or age-appropriate incubation receipts when actually eligible. Ensure any minimum set is realistically completable once daily. Daily/Weekly Journey or checklist **claims** and optional purchases cannot be mandatory attendance.
- **Attribution:** lock eligible pet, original receipt day and timezone to UTC. Never move a receipt or penalty to another selected pet by switching slots. Avoid multiplying account-wide penalties by the number of owned pets.
- **Reversibility:** do **not** deduct permanent Pet XP, Growth Marks, Crests, level, boss progress, earned milestones, historic competition XP or settled rewards.
- **No fabricated production analytics:** measure accepted Pet XP per day using retained server events and separately record queued, attempted, accepted and successfully delivered Telegram notices. Never call an event count a delivered message.

## Neglect model — illustrative only

The standalone simulator is explicitly **not connected to live gameplay**. Its first expanded 8× research is preserved in [Moonpet neglect model comparison: 8× target](moonpet-neglect-8x-model-comparison-2026-11-14.md). The later [economic stress test](moonpet-neglect-economy-stress-test-2026-11-14.md) adds 180-day returns, all five withholding rates, four debt caps, cap-level earners, equal-opportunity comparisons and mandatory success gates, and supersedes the first recovery recommendation.

The recommended review candidate now uses the Aggressive 2×→8× seven-day curve. One daily basis is 22 Care Standing units, anchored to the configured Feed/Play/Clean base rewards rather than a fabricated typical yield. Full abandonment assesses 44 units on day 1 and accumulates 770 units by day 7. Partial care is proportional, but only all three distinct accepted actions reset the streak.

Debt is separate from permanent Pet XP. Stress testing rejected the rule that converted withheld XP into debt repayment because high earners escaped faster. The revised candidate temporarily reduces future server-authoritative Pet XP awards by 10–25%, but **only a complete care set repays standing**, at 44 units per qualifying day. Seven missed days create 770 debt and require 18 complete-care days at every earning profile. Prolonged neglect is bounded at 1,540 units and clears in at most 35 complete-care days. Earned XP, levels, Growth Marks, Weekly Crests, boss wins, relics, achievements and historical competition results are never removed.

Day 8+ remains capped at 8× while debt can grow only to the 1,540 hard bound. Existing authoritative condition decay supplies the extended-neglect consequence; no permanent injury or second stat-loss system is proposed. The account-scoped balance is identical for 1, 2 or 5 owned pets, and Telegram opt-out has no effect on attendance or debt.

These values **remain unapproved, documentation-only and shadow-only**. GK must approve all policy and eligibility values after zero-inclusive cohort analysis. No live withholding, standing ledger, migration or settlement job exists in this PR.

## Staged implementation — subject to explicit approval

1. **Evidence + policy:** finish source-to-receipt mapping, audit sample anonymized server XP and notification delivery records, determine eligible once-daily care policy, choose an acceptable recovery time and agree values.
2. **Additive D1 schema:** migration with versioned `care_day_evidence`, settlement receipts keyed by eligible pet/day/policy version, and a separate Care Standing balance; unique indexes, FK/ownership checks and safe migration backups. No rewrite of earned XP or historic rows.
3. **Read-only mode:** expose eligible windows, accepted receipts and tomorrow/next best care to authenticated players. Check against existing Daily/Weekly Journey and Next Best Action to avoid misleading guidance.
4. **Cron shadow mode:** settle only complete prior UTC days; immutable/idempotent receipts, guarded source-pet attribution, cursor-based retries and bounded backfills, crash-safe cron lease and explicit outage exclusions. Log simulated penalties **without applying them**.
5. **Rehearsal and sign-off:** repeatable 7/30/90/365 scenarios, age transitions, ownership switches, all opt-out states, delivery failures, UTC rollover, retry/replay, D1 partial failures, multiple pets and temporary service outages. Compare model risk with real-cohort data.
6. **Opt-in pilot only after separate approval:** feature-flagged Care Standing with hard cap and documented recovery mechanics. A rollback disables all scoring writes immediately and preserves ledger/source evidence for audit. No live negative Pet XP.

**Current outcome:** PR audit and simulator only. No new D1 tables, scheduled jobs, Telegram messages, XP deductions, user-care enforcement or migrations are enabled by this draft.
