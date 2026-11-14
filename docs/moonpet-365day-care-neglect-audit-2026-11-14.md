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

The current source of truth and evolution JSON supersede earlier **90-day total-life / 60 Marks / 10 Crests / days 78–90 Legendary** statements in `docs/moonpet-season-economy-calibration.md`, `docs/pet-game-catch-up-rules.md` and `docs/pet-game-seasonal-model.md`. Those values describe dated Season 1 calibration and must not be copied into permanent-pet public instructions. Separate quarterly competitions, seasonal leaderboards and old receipts remain valid and must not be erased or renamed. These three documents receive notice banners in this PR; historic paragraphs are retained intact as evidence.

## Actual care and XP boundaries established from source

The current persistent care data path includes `workers/moonboys-api/pets/care-writes.js` and `pets/care-decay.js`. The latter advances hunger (+4.5/hour), happiness (-2.8/hour), cleanliness (-3.2/hour) and energy (-2.2/hour) from an authoritative elapsed time and derives health; it is **not** by itself a proposed neglect-debt ledger. `care-writes.js` writes accepted receipt-backed care changes to the owner pet and computes its current XP/level in the D1 transaction. A client button press, a prospective Next Best Action, an open notification or a cached preview is **not** a committed care receipt. Background cooldowns, egg/incubation, switch-of-pet and unavailable/failed actions must be distinguished from deliberate absence.

`docs/moonpet-source-of-truth.md` explicitly establishes the separate **1,200 Pet XP account/UTC-day cap**. It is a hard aggregate limit, **not** an observed or attainable typical daily return. Actual median/casual/dedicated XP/day cannot be inferred from the cap, and cannot be certified without anonymized production receipt cohorts. Neither the cap nor the proposed sandbox `dailyCareBudget` should be used as the everyday player's earning rate.

Optional Telegram notifications use a saved preference in `migrations/032_telegram_pets_notifications.sql` (`enabled`, `last_notified_at`, `last_reason`). The source regression suites `scripts/moonpet-notification-settings.test.mjs` and `scripts/moonpet-guidance-notification-scope.test.mjs` exercise setting failures, opt-out, a bounded 35-account scanner, per-pet cooldown/retries, overlap prevention, delivered-message acknowledgement and source-pet switching. The `scheduled/phase5-cron-plan.js` comments describe an existing five-minute base tick. **A scheduled tick is not one Telegram message to each player.** This document does not claim any verified production sent/delivered/reminder count; that requires authenticated delivery records and an observed schedule-to-send comparison.

## Necessary server-side evidence before introducing any penalty

- **Eligibility:** define an approved, versioned set of permitted care windows by pet state and action cooldown, including hatch/adoption boundaries, account outages and unavailable activities. Opting out of Telegram reminders must never count as neglect.
- **Attendance:** count only committed, idempotent, pet-owned `feed`, `play`, `clean`, `sleep` or age-appropriate incubation receipts when actually eligible. Ensure any minimum set is realistically completable once daily. Daily/Weekly Journey or checklist **claims** and optional purchases cannot be mandatory attendance.
- **Attribution:** lock eligible pet, original receipt day and timezone to UTC. Never move a receipt or penalty to another selected pet by switching slots. Avoid multiplying account-wide penalties by the number of owned pets.
- **Reversibility:** do **not** deduct permanent Pet XP, Growth Marks, Crests, level, boss progress, earned milestones, historic competition XP or settled rewards.
- **No fabricated production analytics:** measure accepted Pet XP per day using retained server events and separately record queued, attempted, accepted and successfully delivered Telegram notices. Never call an event count a delivered message.

## Neglect model — illustrative only

The standalone simulator is explicitly **not connected to live gameplay**. It should be read as a risk demonstration and candidate-policy comparison, not as a source of XP values or evidence of player behavior.

A straight indefinite daily 8× penalty would create an unrecoverable backlog: at the default illustrative 100-unit budget, 365 days of continuous total neglect implies far more than a realistic re-engagement process can repay. **Therefore no indefinite negative-XP or accumulated 365-day debt is proposed for implementation.**

The expanded simulator separately shows:
- 7/30/90/365-day horizons, with casual/regular/dedicated and partial-care *hypothetical* attendance patterns;
- per-day streak escalation, bounded debt, and recovery after renewed eligible care;
- accounts with 1, 2 and 5 pets to reveal multiplication hazards.

A proposed future Care Standing should be account-scoped (or explicitly guarded against duplicate per-pet charging), reversible, capped, decaying on genuine care and bounded to a recovery period reviewed against real attendance. Values **remain unapproved**; never substitute simulator default values for the live economy.

## Staged implementation — subject to explicit approval

1. **Evidence + policy:** finish source-to-receipt mapping, audit sample anonymized server XP and notification delivery records, determine eligible once-daily care policy, choose an acceptable recovery time and agree values.
2. **Additive D1 schema:** migration with versioned `care_day_evidence`, settlement receipts keyed by eligible pet/day/policy version, and a separate Care Standing balance; unique indexes, FK/ownership checks and safe migration backups. No rewrite of earned XP or historic rows.
3. **Read-only mode:** expose eligible windows, accepted receipts and tomorrow/next best care to authenticated players. Check against existing Daily/Weekly Journey and Next Best Action to avoid misleading guidance.
4. **Cron shadow mode:** settle only complete prior UTC days; immutable/idempotent receipts, guarded source-pet attribution, cursor-based retries and bounded backfills, crash-safe cron lease and explicit outage exclusions. Log simulated penalties **without applying them**.
5. **Rehearsal and sign-off:** repeatable 7/30/90/365 scenarios, age transitions, ownership switches, all opt-out states, delivery failures, UTC rollover, retry/replay, D1 partial failures, multiple pets and temporary service outages. Compare model risk with real-cohort data.
6. **Opt-in pilot only after separate approval:** feature-flagged Care Standing with hard cap and documented recovery mechanics. A rollback disables all scoring writes immediately and preserves ledger/source evidence for audit. No live negative Pet XP.

**Current outcome:** PR audit and simulator only. No new D1 tables, scheduled jobs, Telegram messages, XP deductions, user-care enforcement or migrations are enabled by this draft.
