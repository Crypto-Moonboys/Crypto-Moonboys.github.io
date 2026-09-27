# Moonpet contract records and Trade sanity audit — 27 September 2026

Base: merged PR #1329, `a23b6160e19aff12bf68466af2356de41429a7c7`.
Production reported this commit at `/deployment-info`, deployed at
`2026-09-27T01:49:57.461Z`. Verification uses source, local Worker/SQLite
fixtures and mobile browser automation; no private production player changed.

## Findings fixed

| Finding | Fix |
| --- | --- |
| Two simultaneous Trade requests both passed the pre-transaction cooldown and settled | Recheck the account cooldown inside the same transaction that reserves and applies the result |
| Trade could use stale affordability or Pet XP if another action changed state before the transaction | Recheck stake balance, active-pet ownership and XP before writing; reject stale requests without a trade event or reward |
| The account daily XP total could change after the preflight cap check | Recheck cap headroom in the transaction; a refreshed request still works with zero XP when the cap is exhausted |
| Trade buttons looked available during the five-minute cooldown and above the current balance | Project cooldown and affordability in state; disable controls and register cooldown expiry with the normal refresh schedule |
| Finishing a contract discarded the previous build/tier/side objective from the next setup | Restore the last saved setup on completion and reload; players can still change it |
| Contract records combined all builds and difficulties, offering little direction after the daily XP bonus | Add a saved Route Collection covering the 27 goal/build/tier combinations, with clear counts, best rank and an uncleared-route shortcut |

The concurrent Trade regression fails against the base: two distinct requests
both settle. After the fix, one settles and the other receives the current
cooldown. Identical accepted request keys still return their existing receipt.
Trade outcome probabilities, stakes, rewards and cooldown duration are unchanged.
No automatic retry places a trade for the player.

## Continuous-play upgrade

The Route Collection uses three goals × three builds × three difficulty tiers.
Existing successful contracts count automatically. Each combination keeps its
completion count and best rank score for the active pet and season. Repeating
one route does not clear a different combination; failed and abandoned runs
count for neither clears nor rank. Earlier saved contract versions remain valid.

The board offers the first unlocked uncleared combination. Choosing it, or
another record, fills the build and tier controls and focuses the appropriate
quest button. It sends no gameplay request. The player starts the chosen quest
explicitly, through the existing server validation. Tier 2 still requires five
completions; tier 3 still requires fifteen. A record shortcut cannot bypass this.

The checklist has no additional currency, Pet XP or official quest reward.
Contracts retain unlimited rank/completion play without pet energy or cooldowns.
The first three successful contracts per account/UTC day retain their existing
up-to-20 Pet XP bonuses and caps. Practice remains unlimited and reward-free.
Official daily/weekly content keeps its real cadence. This gives players a
concrete collection to pursue after bonuses without changing the growth economy.

## Audit coverage

| Surface | Verification |
| --- | --- |
| Care, egg lifecycle and the three new care poses | Existing lifecycle/pose/cooldown tests; mobile egg locks and care controls |
| Daily missions, Daily Journey, Weekly Journey | Existing accepted-event, pet-authority and reward tests; objective route coverage |
| Standard and Daily Moon Runs | Run/bank/energy/source-pet regressions; mobile daily tactics, odds, score and reload |
| Contracts | 1,080 simulations, saved versions, preparation, side objectives, concurrent moves, protected bonuses, collection aggregation and setup selection |
| Practice | 900 simulations plus mobile local-save isolation and replay |
| Bounties, districts and story chains | Existing qualifying-evidence, choice/retry/claim tests and mobile bounty routes |
| Weekly/seasonal bosses | Existing attempt/damage/ownership tests; mobile raid choices and saved old reward recovery |
| Jobs, Adventures and Street Events | Existing handlers and previews; mobile actions, cooldowns and reset |
| Timed activities | Previous interrupted-claim fix, duration previews and recovery remain covered in Worker and mobile tests |
| Trade | New simultaneous requests, same-key duplicate, balance/XP/active-pet/cap changes, affordability, cooldown/reload and expiry checks |
| Gear, inventory, crafting, cosmetics and market | Existing cost, ownership and settlement regressions |
| Arena, Kaiju and unavailable systems | Existing capability, gameplay and cleanup tests; no roadmap status changed |

This is not evidence that every historical production account has been tested.
No speculative deletion of old art, recovery handlers or saved-run compatibility
was performed. The verified release is the exact tree published in the new PR.

## Validation

- Worker/API domain: all 68 commands passed.
- Arcade domain: all 23 commands passed.
- New Trade test reproduces the base concurrency bug, then checks one accepted
  trade, one payment, duplicate receipts and transactional stale-state rejection.
- Collection tests check 27 records, tier gates, owner isolation, legacy clears,
  repeat counts, best rank and abandonment; existing reward/authority tests pass.
- Worker/SQLite browser suite passed at 390×844 and 360×640, including both new
  flows and all prior scenarios. Mobile collection screenshots were inspected.
- Changed runtime JavaScript syntax, public-copy guard, anti-drift and whitespace
  checks passed. Full five-domain GitHub CI remains the merge gate.

## Deployment

Redeploy `moonboys-api` with the provenance script after merge. No new migration
or VPS restart. Route records reuse migration 076's existing saved contracts.
Pages publishes frontend cache version `20260927-contract-records-v1`.

After deployment, confirm the merged SHA, reopen Telegram and check the Route
Collection and retained setup after a contract. In Economy, a Trade should show
its cooldown after acceptance and after reload; unaffordable stakes stay locked.
