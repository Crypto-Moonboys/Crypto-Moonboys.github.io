# Moonpet Shop and completion sanity audit — 29 September 2026

## Baseline and verdict

Main and the live Worker match `d5d2460b6fd579d9379f76b26f89c412f008c4ea`.
Production reports deployment at `2026-09-29T10:30:19.734Z`. The previous
Rename, Trade and economy care-decay fixes are present.

No failed purchase, lost crafted output, duplicate upgrade debit or consumable
XP mismatch was reproduced in the catalog audit. One additional error-handling
bug was reproduced: a failed Weekly Boss claim-list read returns a successful
empty list and hides a saved payout. This PR fixes that read. The full report
also fixes free equipment switching and daily shopping wording, and adds the
authorized beta correction for impossible season totals.

## Findings

### Fixed: Weekly Boss claim-list read failures hide rewards

`getPendingPetWeeklyBossRewards` caught every database error and returned `[]`.
That made an unavailable read indistinguishable from having no reward to claim,
including an older victory belonging to another retained pet.

The read now propagates failures through the existing Mini App state retry path.
A previous valid client state is retained; a first load can retry. Successful
empty reads still mean no pending claim. Recovery/settlement and reward amounts
are unchanged. Ten SQLite cases cover thrown errors, resolved `success: false`,
missing results, malformed results and null responses, each with an empty list
and a saved older payout. The eight resolved-response cases reproduced the
review finding before the follow-up guard. Restored reads return the same claim
data and preserve wallet/XP balances.

Eight existing state-building fixtures omitted the victory table. They now load
the existing 058/061 migrations. The general API fixture replaces its three
abbreviated season tables; two combat-gate fixtures retain their deliberate
isolated completion-marker setup before loading the migrations. No gameplay
assertions were removed. These are test corrections, not new migrations.

### Fixed: owned gear switches for free

Shop and Equipment now offer a free Equip action for owned permanent gear.
The server validates account ownership, active pet, level and current slot in
one transaction. Upgrades and mastery are retained; switching grants no XP,
currency, purchase mission credit or extra rewards. Old Buy buttons also route
owned gear to the free switch, and simultaneous purchase requests cannot debit
an item that became owned while checkout was in flight. Accepted older purchase
receipts can recover a missing ownership row without charging again.

The daily shopping mission explicitly requires a new permanent gear purchase or
an equipment upgrade. Market purchases, crafting and free switches do not count.
Once every permanent item is level 10, this goal auto-completes each day; players
still complete the other six goals to claim the daily bonus.

### Prepared beta correction: impossible season counters

Fresh public API responses returned healthy data, but the same discrepancies
remain after deployment:

| Public username | Seasonal XP | All-time XP | Difference |
| --- | ---: | ---: | ---: |
| HenrikPiga | 9,077 | 6,935 | 2,142 |
| Graffpunks | 4,099 | 4,027 | 72 |
| noballgames | 2,400 | 1,901 | 499 |

Website, bot and Mini App use a shared Pet projection. Daily/weekly totals use
accepted Pet XP receipts; seasonal uses a season counter; all-time sums retained
owned pets. Shared read code does not reconcile those stored authorities.
The user authorized discarding beta data if necessary. Migration 078 instead
performs a narrow rebaseline: only season counters greater than all retained
owned Pet XP are replaced with the saved XP of owned pets in that season.
An audit table stores the old counter, retained season/all-time sums, accepted
receipt sum and application time. This establishes a beta baseline; it does not
claim to reconstruct missing history or prove which earlier writer was wrong.
Valid counters, pet progression, currency, equipment, daily/weekly XP receipts
and claimed rewards are preserved. No rewards are replayed. Rerunning the
migration does not reset new XP for already-corrected rows.

Migration fixtures reproduce all three reported pairs and verify subsequent real
care rewards increment the season and all-time boards together. Multiple seasons
and invalid unowned instance rows are covered. This migration has NOT been run
against production here; no Cloudflare credentials are available in this session.
`scripts/audit-moonpet-xp-ledger.sql` remains available for deeper history review.

## Shop and economy execution coverage

The added catalog suite exercises real handlers against SQLite:

- All 17 permanent items: exact currency debits, equipped slot and request replay.
- All 153 paid upgrade transitions (17 items, levels 2 through 10), with replay.
- All five crafting recipes: output quantities and replay.
- All six consumables: one item consumed, replay protection and matching daily,
  weekly, seasonal and all-time Pet XP totals.
- All 12 Market offers across their actual daily rotations: complete currency,
  item/material bundle, one accepted receipt, zero Pet XP and repeat-purchase protection.

Existing tests additionally exercise capacity rejection, exact-fit bundles,
concurrent purchases, a pet switch during checkout, failed writes/rollback,
material sources, gear mastery and combat/care effects. These are fixture checks,
not purchases made against real player accounts.

## Daily, weekly and season loop checks

| Loop | Ending / reward / synchronization |
| --- | --- |
| Daily checklist | Seven goals; one 7/7 bonus up to 25 Pet XP, 50 Gold and 1 Style; latched progress and unclaimed complete days survive midnight |
| Daily Journey | Three of five objectives for one qualified Growth Mark per pet/day; saved source-pet evidence and recovery |
| Daily Cache and bounties | Daily source receipts and bounded claims; previous care-clock fix verified |
| Official Daily Run | Ten-room route, Alley King ending and recoverable terminal payout |
| Weekly Journey | All five objectives for a Crest, including two check-ins on distinct days; original pet/season and rotating backlog recovery |
| Weekly Boss | Saved tactics/attempts, victory and payout recovery; claim-list outage corrected here |
| Standard Run / Contracts | Saved choices, failure/extraction/completion; Contracts have goals and a final boss with replay and pending reward recovery |
| Season tiers / completion | Tier claims; final evolution plus 60 distinct-day Marks and 10 distinct-week Crests; retained completion records |
| Signal Sovereign finale | Three builds, saved turns, failure/retry and first-victory reward up to 100 Pet XP, 200 Gold and 5 Style; original season attribution |

Backend regression suites also cover incubation/hatch, pet slots, care,
Dance/Energy Drink/Cuddles, jobs/timed activities, expeditions, districts, stories,
seasonal raids, Arena/Kaiju authority, resource caps and rejected/stale actions.
Mobile browser fixtures exercise all six screens and the completion/claim routes
at 390×844 and 360×640. Public rankings are exercised at 360, 390 and 1280 pixels,
including four periods, activity identity, refresh, stale-data retention and retry.

The existing limits remain: Practice gives no official progress; Style Lab
purchases are collection records without visual/stat effects; passive relic
powers are inactive; breeding and the post-season systems remain unavailable
in the Mini App. Community XP, Contract Rank, Arcade ranks and Wiki graphs are
separate from Pet XP and should not receive duplicate Pet XP updates.

## Verification and release

The unmodified deployed backend domain, catalog suite, focused outage regressions
and mobile/public browser suites pass. The patched full-suite result and GitHub
checks are recorded in the PR. The audit did not exercise every real user account
or an authenticated live human-opponent match, and it had no private D1 access.

After approved merge, apply migration 078 and deploy `moonboys-api` with the
provenance wrapper. Existing migrations must already be present; the migration
verifier now also requests 077 and 078. GitHub Pages publishes the updated game
controls and cache versions. No VPS restart is needed.

From Windows Command Prompt at the repository root:

```bat
git switch main
git pull --ff-only origin main
npm ci
npx wrangler d1 export wikicoms --remote --config workers/moonboys-api/wrangler.toml --output wikicoms-before-078.sql
npx wrangler d1 migrations apply wikicoms --remote --config workers/moonboys-api/wrangler.toml
node scripts/deploy-worker-with-provenance.mjs moonboys-api
npx wrangler d1 execute wikicoms --remote --config workers/moonboys-api/wrangler.toml --file scripts/check-moonpet-beta-xp-rebaseline.sql
```

Keep the exported database private and outside commits. The final check returns
counts only: `pending_corrections` and `impossible_season_totals` must both be 0.
An applied count of 0 is valid if the counters were already corrected before
migration. Refresh the four public leaderboard periods after deployment.
