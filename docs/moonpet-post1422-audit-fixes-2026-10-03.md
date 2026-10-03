# Moonpet post-PR1422 audit and fixes — 3 October 2026

Audited base: `45bf372ca130c852911259eab7c7be2bfcf0bc6b` (latest `main` at audit start). Read `AGENT_EDITING_RULES.md` and the current Moonpet source of truth before editing. Work is isolated on `sandbox/moonpet-post1422-fixes-20261003`, with a backup branch.

## Complete confirmed finding list

Four P2 / Medium defect families were confirmed. No additional High-severity defect was confirmed. These are reproducible source/SQLite/local Worker findings; this report does not claim production database access or exhaustive coverage of every random seed.

| Defect | Reproduction and impact | Fix |
| --- | --- | --- |
| Mixed calendar projections | A state request starts at `2026-09-30T23:59:59.999Z` and crosses midnight during a read. Full state previously showed Q4 competition/guidance XP 500 beside the Q3 leaderboard XP 300, with September 30 Journey and October 1 checklist. Missions also mixed its competition quarter with the Finale quarter. Ordinary midnight and Sunday/Monday had the same day/week defect. Stored XP was unchanged. | Capture one clock and pass it through guidance, rewards, roster, checklist, Finale, Journey, pet presentation and cooldowns. Validate calendar provenance alongside existing source-pet/achievement checks before publishing Full, Missions, Core and Profile. Saved historical reward periods remain independent. |
| Care decay erased by retry frequency | After one accepted Weekly Boss strike, 60 duplicate retries a minute apart kept hunger 0, happiness/cleanliness 100 and energy 88. One retry after the same hour produced hunger 5, happiness 97, cleanliness 97 and energy 86. Each small delta rounded away while the clock advanced. | Preserve fractional care in existing numeric columns and round public meters. SQL care/item settlement and legacy run/profile writers retain fractions. Short atomic-read intervals retain their anchor; reward and run writes cannot advance that anchor without settling decay. Energy eligibility uses the displayed rounded meter, with debits clamped at zero. Guarded ownership/snapshot writes and the instance-authority marker remain intact. |
| Old Weekly Boss payout credited another Journey week | An exact winning attack at Sunday `2026-10-04T23:59:59.999Z` was saved as a victory just after Monday midnight. Claim-before-backfill dated the payout October 5/W41 and counted it as a week-2 attempt; the subsequent backfill also counted the actual win in week 1. Backfill-before-claim kept the original period. Three owned pets and a different selected pet reproduce it. This boss reward grants currency, not Pet XP. | Resolve the exact winning source and retained ownership before payout/Crest attribution, independently of accepted backfill presence. Use the proven attempt day and source clock; never use recovery time. Payout receipts are no longer attempt evidence, including rematch eligibility. Progress and qualification readers revalidate the event-to-objective mapping, excluding retained wrong payout-based objectives. Exact winning attempts/backfills still recover the original progress. |
| Daily Completion / Finale acknowledged unsaved claim markers | After durable payment, SQLite `RAISE(IGNORE)` on `claimed_at` returned zero changes. Both handlers still returned `reward_pending: false`, despite the marker remaining null. The resolved no-op acknowledgement case lacked coverage. | Require exactly one acknowledged source-row update before clearing pending. A thrown, failed or ignored acknowledgement preserves the accepted payment with pending/refresh status. Retry uses the original receipt and source day/pet/quarter, repairs only the marker and cannot repay. |

No historical ownership, evidence, objective, victory, payment receipt or reward data is deleted or rewritten. Already awarded Growth Marks and Weekly Crests remain recorded. Wrong payout-based objective rows are retained for audit and excluded from new unawarded qualification; the actual source attempt can recover its original objective. Missing proven legacy attribution remains unavailable instead of using a different pet or a recovery date.

## Audit scope and healthy controls

The [user option matrix](moonpet-post1422-options-2026-10-03.md) records 94 button call sites, 67 distinct visible mutation action keys and 42 pet-related Telegram command aliases at the base commit. All visible actions resolve in the dispatcher. Navigation, dynamic choices, settings and planned-system boundaries were traced separately.

The audit covers care/incubation/evolution, permanent spaces and deletion, daily cache/checklists/Journey/Run, weekly Journey/shared boss/participation, quarterly tiers and Finale, standard runs/extraction/failure, contracts, districts/chains/seasonal raids, activities/jobs, adventures/random encounters, Arena/Kaiju, bounties/expeditions/market, inventory/crafting/upgrades/style/trade and alert settings. Completed, failed, extracted, abandoned, cancelled, expired and pending-payment paths were checked where each system supports them.

Seventeen additional SQLite/Worker/browser control programs passed after the fixes: XP reconciliation; XP channels; Community XP; standard and Daily choice matrices; Journey probes/districts/endings; evolution; care; catalog; adventure/style; bounties; spend recovery; Trade/cancel endings; optional modules; multi-pet combat. Daily, weekly, seasonal and all-time accounting remained consistent in the tested two-/three-pet cases. These supplemental probes run locally from the audit workspace; the four new regressions below are committed and registered in CI.

## Committed regressions and validation

New suites:

```sh
node scripts/moonpet-projection-periods.test.mjs
node scripts/moonpet-care-frequency.test.mjs
node scripts/moonpet-weekly-payout-period.test.mjs
node scripts/moonpet-completion-acknowledgements.test.mjs
```

They cover 24 authenticated state rollover cases across four hydration modes and two interleaving points, action hydration after a quarter-boundary commit, equivalent 10-second/minute/hour decay, authenticated duplicate retries, three-pet care/source isolation, a concurrent snapshot write, explicit care rewards, integer energy thresholds, short reward-clock preservation, claim/backfill ordering, retained wrong evidence, and interrupted/no-op claim acknowledgements with source-pet switches and duplicate payment checks. Existing authority fixtures now include a proven winning attack; integer-meter assertions allow persisted fractional care. Precise accumulation is asserted by the new frequency suite.

Complete required commands:

```sh
npm run ci:worker-api
npm run ci:arcade
npm run ci:wiki
npm run ci:wax
PLAYWRIGHT_BROWSERS_PATH=/tmp/moonpet-playwright CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run ci:visual
```

Validation result: **PASS** for all five complete domains and all four focused suites. The registered command counts are 117 Worker/API, 24 Arcade, 24 Wiki, 17 WAX and 15 Visual (197 total). Worker/API includes action synchronization, public rankings/quests/progression, Daily and Weekly Journey/Run/bosses, combat/completion/Finale, season rewards, deletion/recovery, player loop, webhook authentication and notification settings. Visual includes the real local Worker/SQLite Mini App browser loop and public synchronization tests.

## Deployment and preservation

No new migration is required: existing non-STRICT SQLite/D1 numeric care columns accept and preserve fractional values under their current bounds. Schema, migration manifests and production migration-verification surfaces are unchanged. Previously required migrations through 089 remain prerequisites.

No new Cloudflare secret is required. The existing `TELEGRAM_WEBHOOK_SECRET` must remain a Cloudflare Worker secret of 32–256 allowed characters, with matching Telegram webhook registration and successful readiness checks. Follow the [exact secret setup and Telegram registration process](telegram-webhook-security.md). Do not place the value in source, logs, responses or Wrangler variables.

After review/merge approval, use the normal Worker release process. No player-facing HTML, JavaScript, CSS or asset is changed, so no client cache-version bump or site-index regeneration is required by this backend release; the complete Wiki/Visual checks verify index and asset contracts.

The 1,000 Arcade XP entry requirement, three current permanent spaces, lifetime Pet XP/evolution, competition-only daily/weekly/quarterly scores, purchased ownership and shared account wallet remain intact. Pets never automatically expire or reset. Breeding remains planned and is not exposed as live gameplay.

No production deployment was performed. No production account was accessed or changed. Production D1/bindings were unavailable, and live Worker access was blocked by the execution environment's network policy; validation uses source, local authenticated Worker requests, SQLite and local browser fixtures. The PR must not be merged or deployed by this task.
