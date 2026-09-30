# Moonpet hard audit — 2026-09-30

Reviewed baseline: `58193d434` (merged PR #1400).

## Scope

The audit followed the live player path from each Mini App control to its
authenticated Worker action, persisted evidence, reward settlement, mission
projection and public Pet read surfaces. It covered:

- Home care, cooldowns, lifecycle, pet switching and season slots
- Play, Practice, Standard Run, official Daily Run and Contracts
- Daily checklist, Daily Journey, Weekly Journey, season tiers and finale
- Shop purchases, free owned-gear switching, upgrades, crafting and Market
- Weekly Boss, Arena, Kaiju, saved endings and retry settlement
- Pet leaderboard periods, public Pet activity and Community/chart boundaries

The existing action-parity and browser suites remain the reachability authority.
Pet XP is intentionally published only to Pet leaderboard/activity projections.
Community XP, Arcade scores and the wiki relationship graph remain separate
authorities; copying Pet XP into those displays would be a new product rule, not
a synchronization repair.

## Fixed findings

### Official Daily Run omitted from the seven-goal checklist

The Play Options control routes the Adventure mission to Moon Run, and Standard
Run completions satisfied the goal, but accepted `daily_moon_run` receipts did
not. Weekly Journey already recognized the same receipt. The mismatch is fixed
in both the state-time calculation and the durable event triggers.

Migration `083_moonpet_daily_run_completion_credit.sql` recreates the insert and
accept triggers with `daily_moon_run` mapped to the Adventure bit. The trigger is
required so a completed run still receives credit when state rendering fails or
the player returns after UTC rollover.

### Daily Journey could silently lose room objective credit

Daily Run synchronization previously treated a resolved D1 `{ success: false }`
room-ledger read as an empty run. It could finalize aggregate records without
recording combat/explorer objective evidence. The read now uses the shared strict
D1 result validator. A failure remains in the recovery queue; retry records the
objective and terminal aggregate exactly once.

### Season-slot reads could mislabel a D1 outage

Purchase and switch authority reads could turn an unavailable database response
into “pet not adopted” or “slot not switchable.” Required profile, ownership,
wallet, creation and target-pet reads now distinguish a successful missing row
from an unavailable read. Failures propagate to the existing retry response and
cannot spend Arcade XP or move the active-pet pointer.

### Daily Shop-goal evidence could appear as zero

The permanent-equipment upgrade count is required mission evidence. Its aggregate
read now rejects resolved D1 failures instead of presenting zero upgrades.

### Canonical documentation named the retired cursor table

The source-of-truth now names `telegram_pet_recovery_cursors`, matching migration
081 and the live recovery code. Older dated audit documents retain their reviewed
historical wording.

## Verified contracts

- Accepted daily actions latch checklist progress; the seven-goal claim is fixed,
  capped, assigned to one source pet and idempotent.
- Daily/weekly Journey rewards retain original pet, season and evidence keys.
- Weekly Boss, run bosses and Signal Sovereign have terminal state, saved retry
  paths and one reward receipt.
- Permanent gear is purchased once; owned gear switching remains free and does
  not satisfy the shopping goal. Market and crafting also do not satisfy it.
- Practice awards its bounded official Training progress; Style Lab and relic
  passives remain active on their documented systems.
- Daily, weekly, seasonal and all-time Pet ranks share accepted Pet reward
  authorities. Public Pet activity uses the same accepted receipts.
- Successful empty reads remain empty. Failed or malformed required reads enter
  retry behavior rather than inventing zero state, missing ownership or a fresh
  action.

## Deployment

After merge, apply D1 migration 083 first, then deploy `moonboys-api` with the
provenance script. Migration 083 is backward-compatible with the previous Worker,
while applying it first guarantees durable Daily Run checklist credit throughout
the rollout. GitHub Pages will publish the documentation change automatically.
No asset generation or cache-version bump is required.
