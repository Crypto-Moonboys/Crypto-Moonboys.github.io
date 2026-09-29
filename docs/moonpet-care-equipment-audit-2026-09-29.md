# Moonpet care, equipment and completion follow-up — 29 September 2026

## Baseline and scope

Main and the live Worker both report `4056641edad8f5274f9a44b2bdaeea300f7b439c`
(PR #1378); deployment time is `2026-09-29T13:27:42.970Z`. The unmodified
Worker/API domain and the complete mobile gameplay fixture passed before edits.
This is a follow-up to [the wider read-integrity audit](moonpet-read-integrity-audit-2026-09-29.md),
with additional coverage for equipment changes during care and advertised Shop effects.

## Reproduced defects and fixes

1. **Care could commit old equipment bonuses after an upgrade.** Its reservation
   compared equipped keys but not the separate paid level/mastery rows. Four new
   SQLite reproductions initially failed: real paid upgrade, mastery change,
   missing-row backfill, and deletion all allowed a stale Feed result to commit.
   Care now compares the relevant progression snapshot inside the same batch as
   its receipt, stat changes, wallet and XP projections. A mismatch rejects the
   action without consuming a cooldown or paying rewards. Retry recalculates it.
   Food applies to Feed, toy to Play, and outfit to ordinary care; unrelated slots
   and other accounts do not block the action. Standard Run uses the same extracted
   guard without changing its existing behavior. No queries or migrations added.
2. **Shop/equipment descriptions drifted from gameplay.** Crystal Bowl promised
   health but actually restores energy; outfit wording implied that the three
   stat-only buttons could earn gear XP/currency; Hoverboard did not identify its
   Standard Run benefits. These descriptions now match existing formulas. The
   legacy Telegram gear summary no longer prints utility-registry targets such
   as training/job bonuses that were never applied. It shows the actual multiplier
   and the same live Shop descriptions. `/petgear` still opens Mini App Equipment
   when the live Mini App flag is enabled. No reward formula or balance is changed.

3. **Progress notices could hide rejected-action feedback.** The mobile test
   reproduced a rejected care response whose explanation was immediately replaced
   by a queued unlock notice. Rejected actions now retain their explanation and
   leave notices unacknowledged for a later successful action or refresh.

The Mini App explains a stale care rejection and leaves the button available.
A mobile browser regression changes equipment immediately before the care batch,
checks that message, and then successfully retries at both tested viewport sizes.

## User loop and payout coverage

| Area | Verified path |
| --- | --- |
| Care / roster / progression | Active pet authority, cooldowns, energy, stat-only actions, source attribution, overlapping care, gear upgrade/mastery races and retry |
| Permanent Shop | All 17 purchases and 153 paid upgrade transitions; free owned-item switching, replay, concurrent equip/buy guards and complete-collection daily credit |
| Market / crafting / inventory | All 12 offers, five recipes, six usable items, costs/capacity, replay and source-pet rewards |
| Daily checklist / Journey / Cache / bounties | Seven checklist goals plus one 7/7 payout; distinct objective evidence, saved claims and day rollover |
| Official Daily Run | Saved ten-room run, checkpoint tactics, Alley King ending and interrupted payout recovery |
| Weekly Journey / Boss | Five objectives, distinct check-in days, original pet/week, recoverable Crest, boss defeat and reward claim |
| Standard Run / Contracts | Choices, failure/extraction/completion, bosses, saved room recovery, repeat play with bounded official rewards |
| Districts / stories / raids / expeditions | Saved choices/checkpoints, ending claims, limits and recovery |
| Season | Tier claims, final evolution + 60 distinct-day Marks + 10 distinct-week Crests; Signal Sovereign finale, saved moves, failure/retry and one victory payout |
| Arena / Kaiju | Existing source-pet, costs, saved battle outcomes and settlement regressions |
| Public projections | Accepted receipts, daily/weekly/seasonal/all-time boards, recent activity and Community XP rollback/retry |

These are executable local fixtures and public read-only checks, not inspection
of every private production account or live human-opponent match. Practice has
no official rewards. Style Lab collection and inactive passive relic powers retain
their explicit limitations. Breeding, Traits, Sanctuary, Lineage, Fusion and
Prestige remain unavailable in the Mini App.

## Public checks and unresolved history

All four public leaderboard periods returned HTTP 200. Fresh public scores:

| Public username | Daily | Weekly | Seasonal | All-time |
| --- | ---: | ---: | ---: | ---: |
| HenrikPiga | No row | No row | 6,935 | 6,935 |
| Graffpunks | 100 | 748 | 4,127 | 4,127 |
| noballgames | 1,200 | 2,400 | 1,901 | 1,901 |

Graffpunks increased by 65 in each period since the prior audit's public snapshot.
The previously identified **2,400 weekly versus 1,901 all-time** historical
mismatch remains. Migration 078 preserved accepted daily/weekly history while
rebasing impossible season counters; it did not reconcile every period. Private
ledger evidence is still required to choose a defensible historical repair.
This audit does not change production records or claim all history is reconciled.

The public activity endpoint also responds successfully. Website, Mini App and
bot share the same official Pet leaderboard projection. Activity is a receipt
feed, not every click. Community/Arcade scores and Contract Rank are separate.
Wiki graph data does not consume Pet XP. Live graph/Pets verification passed with
327 Wiki nodes, 1,629 edges and matching full/mobile verification time
`2026-09-29T09:58:40.424Z`.

## Validation and release

New care regressions cover four progression mutations, toy/outfit mastery,
unrelated account/slot isolation, retry, no duplicate reward, and all four XP
projections. The full catalog remains executable, and the complete gear summary
fits Telegram's message limit. Existing Standard Run progression-race tests stay
in the required suite. Full suite results and exact commands are recorded in the PR.

After merge, deploy `moonboys-api` using the provenance wrapper and allow GitHub
Pages to publish the new Mini App script version. No new D1 migration or VPS
restart is required. Reopen the Mini App, inspect the corrected Shop copy, and
confirm normal care, gear switching/upgrading and public boards. No production
write, merge or deployment was performed by this audit.
