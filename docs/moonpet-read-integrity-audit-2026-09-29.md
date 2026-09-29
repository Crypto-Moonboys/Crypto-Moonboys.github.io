# Moonpet game, Shop and leaderboard audit — 29 September 2026

## Baseline and verdict

Audited main: `156da4788cca8e270fadc6c72c3abf934c2c5165`. The live Worker
reports `2a6fc48a7d435b4e7c66db2769d37e4f692c7867`, deployed at
`2026-09-29T11:54:38.775Z`. Only the background image changed after that merge.
The operator confirmed migrations 077/078 succeeded, three beta season counters
were corrected, and both pending corrections and impossible season totals were 0.

The exercised gameplay, shop and completion routes are connected. This audit
found another occurrence of the resolved D1 read-failure bug, across shared
rankings and saved game projections. The patch makes those outages retryable.
It does not establish that every historical leaderboard period is reconciled.

## Reproduced defect

D1 can resolve `.all()` with `success: false` and empty/missing results. Removing
`.catch(() => [])` alone does not protect this case. The existing Weekly Boss
list and equipment ownership guards already handled it, but other readers did
not. The new regression suite initially failed 44 of 55 checks on main:

- Public daily, weekly, seasonal, all-time and run-depth ranks could return a
  successful empty board. Activity could also return an empty feed, or throw
  outside its error handler for a malformed non-array result.
- Twenty required Mini App projections could publish empty inventory, gear,
  materials, checklist/Journey progress, daily bonuses, finale eligibility,
  story/raid progress, cosmetics, saved attempts, pending raid rewards,
  cooldowns, economy claims and achievements/season claims.
- Relic Vault could label a failed read as an available empty collection.

A shared result guard rejects failed/malformed query envelopes while preserving
successful empty arrays. Public readers return their existing generic 503
responses, so the website keeps its prior standings and offers Retry. Required
state reads use the Mini App refresh error path. The existing explicit Relic
Vault unavailable display and Weekly Journey syncing display are retained.
Missing completion-feature migrations still report those features unavailable,
including resolved database failures, without exposing raw database errors.
Crafting, upgrading and Style Lab also reject unreadable material balances
before reserving or spending; an outage is not reported as insufficient funds.

No new queries, migration, reward amounts, progression gates or UI controls are
introduced. Existing SQL settlement and idempotency guards remain in place.
This guards the audited query boundaries; it is not a claim that every database
reader in the repository now uses this helper.

## Game options and completion coverage

A literal client scan found 62 action keys, all represented in the Mini App
dispatcher. Dynamic purchase/care/finale controls and local Practice additionally
use the existing gameplay/browser tests; the scan alone is not a click test.

| System | Ending, reward and authority checked |
| --- | --- |
| Egg, hatch, roster, care and evolution | Ownership, lifecycle, cooldown/energy gates, current pet and accepted XP receipts |
| Dance, Energy Drink, Cuddles | Stat benefits, animations and limits; no official Pet XP or Journey care credit |
| Permanent Shop / Equipment | 17 purchases, 153 upgrade transitions; free owned-gear switching, retained mastery, replay and concurrent purchase/equip guards |
| Market, crafting, inventory | All 12 offers, five recipes and six consumables; full bundles, capacity, exact costs, replay and four-period XP checks |
| Daily checklist | Seven goals, one 7/7 payout; completed unclaimed days survive midnight; new gear/upgrade shopping credit, maxed collection exception |
| Daily Journey / Cache / bounties | Three of five objectives for a Growth Mark; separate bounded rewards and saved source evidence |
| Official Daily Run | Ten-room route, tactics, Alley King and interrupted terminal reward recovery |
| Weekly Journey | All five objectives including two distinct check-in days; original pet/week and recoverable Crest |
| Weekly Boss | Saved attempts/tactics, defeat, original-pet reward and archived payout recovery |
| Standard Run / Contracts | Failure, extraction or completion; saved choices and boss endings; Contracts repeat with bounded daily Pet XP bonuses |
| Districts, stories, raids, expeditions | Saved decisions, limits, checkpoints/ending claims and source-pet recovery |
| Season tiers / completion | Tier receipts; final evolution, 60 distinct-day Marks and 10 distinct-week Crests; optional Signal Sovereign finale with saved turns and first-victory payout |
| Arena / Kaiju | Source-pet battle authority, costs, outcomes and settlement recovery in fixtures |

Practice has a local ending and no official rewards. Style Lab records collected
unlocks without visual/stat effects. Passive relic powers are inactive. Breeding,
Traits, Sanctuary, Lineage, Fusion and Prestige remain unavailable in the Mini
App. These are explicit feature limits, not newly broken action handlers.

## Public synchronization and remaining beta history

Fresh public reads returned all four website periods and recent activity.
The shared projection is used by the website, bot and Mini App. Current public
scores observed during this audit:

| Public username | Daily | Weekly | Seasonal | All-time |
| --- | ---: | ---: | ---: | ---: |
| HenrikPiga | No row | No row | 6,935 | 6,935 |
| Graffpunks | 35 | 683 | 4,062 | 4,062 |
| noballgames | 1,200 | 2,400 | 1,901 | 1,901 |

The three repaired seasonal/all-time pairs agree. **One historical weekly score
still exceeds retained all-time XP: 2,400 versus 1,901.** Migration 078 deliberately
preserved accepted daily/weekly event history while rebasing impossible season
counters. Its two count checks did not test weekly receipt totals. This is a
remaining historical discrepancy, not evidence that the migration failed or
that this patch creates fresh XP loss. Public data cannot establish which old
receipts or retained XP are wrong. Private ledger evidence is still required
before changing that history; no production data was changed in this audit.

New rewards continue to use accepted receipts for daily/weekly, the source
season counter for seasonal, and retained owned pet XP for all-time. Public
activity is a recent receipt feed, not every button click. Community XP,
Contract Rank and Arcade ranks are separate. Wiki entity graphs do not consume
Pet XP and need no duplicate game-score update.

## Verification and release

- Unmodified main: complete Worker/API domain and both mobile gameplay sizes passed.
- New focused suite: 62 checks, including saved-state recovery, weekly syncing,
  rejected material preflights, malformed public reads, valid empty lists and
  partial migration rollout.
- Mobile browser suite now covers both thrown and resolved read failures in
  Relic Vault and a saved finale payout followed by a failed state refresh.
- Live graph/Pets verification passed: 327 Wiki nodes, 1,629 edges, matching
  full/mobile graphs verified at `2026-09-29T09:58:40.424Z`.
- Full patched `npm test`, syntax/diff checks and GitHub CI results are recorded
  in the PR. Existing catalog, concurrent settlement and recovery-budget tests
  remain required; no assertions or budgets are relaxed.

Coverage is source tracing, isolated SQLite/browser execution and public read-only
requests. No private production D1 inspection or live human-opponent match was
performed. After merge, deploy `moonboys-api` with the provenance wrapper. No new
migration, frontend cache bump or VPS restart is needed. Check refresh/retry,
owned items and pending claims, plus all four public leaderboard periods.
