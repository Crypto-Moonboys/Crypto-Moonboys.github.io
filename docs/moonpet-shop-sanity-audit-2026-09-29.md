# Moonpet Shop and completion sanity audit — 29 September 2026

## Baseline and verdict

Main and the live Worker match `d5d2460b6fd579d9379f76b26f89c412f008c4ea`.
Production reports deployment at `2026-09-29T10:30:19.734Z`. The previous
Rename, Trade and economy care-decay fixes are present.

No failed purchase, lost crafted output, duplicate upgrade debit or consumable
XP mismatch was reproduced in the catalog audit. One additional error-handling
bug was reproduced: a failed Weekly Boss claim-list read returns a successful
empty list and hides a saved payout. This PR fixes that read. The full report
also distinguishes an existing Shop usability gap and unreconciled live totals.

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

### Open Shop usability gap: owned gear has no free re-equip control

The set panel can say `EQUIP OWNED SET PIECES`, but the only Shop action is
`buy`. Replacing Moon Kibble with another food, then selecting Moon Kibble again,
charges another 45 Gold. Its existing level/mastery is retained; level 10 remained
10 in the test. The button shows the purchase price, so this is an awkward
loadout/economy contract rather than a hidden duplicate-request charge.

A separate owned-equipment control would improve build choices. It should have
server-verified ownership and active-pet authority, preserve mastery, cost no new
purchase currency, and grant no purchase quest credit or XP. This audit does not
silently change those economy rules. Current daily shopping credit accepts a
permanent gear purchase or equipment upgrade; Market purchases and crafting do
not fill that checklist bit. The wording could distinguish those routes better.

### Still open: historical leaderboard totals disagree

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
Existing `scripts/audit-moonpet-xp-ledger.sql` provides the private read-only next
step. Public numbers alone do not identify the correct repair or historical
cause. No player totals or reward receipts were changed by this audit.

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

After approved merge, deploy `moonboys-api` with the provenance wrapper. No new
D1 migration, frontend cache bump or VPS restart is required. Existing schema
migrations, including 058/061 and completion migration 077, remain prerequisites.
Neither this error-handling fix nor deployment repairs historical XP totals.
