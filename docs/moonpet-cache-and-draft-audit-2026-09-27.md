# Moonpet reward and continuing-play audit — 27 September 2026

Base: merged PR #1332, `518b1021844a5a88f1139a82da1a5e43b1705c1b`.
Production reported that exact commit, deployed at `2026-09-27T03:40:01.630Z`.
This audit uses current source, actual Worker handlers, SQLite transactions and
mobile browser fixtures. No private production player data was changed.

## Confirmed defects

| Finding | Fix |
| --- | --- |
| Daily Cache saved an absolute XP snapshot, overwriting XP earned after its preflight | Calculate the allowed reward inside the transaction and add it to current source-pet XP |
| The daily XP total could change between reading it and awarding the cache | Recheck the existing account/day cap in the receipt INSERT; return the actual credited amount |
| Cache compatibility writes and response could target the newly selected pet | Credit the captured instance, mirror only while that pet remains selected, and return its current state plus account wallet |
| Replaying a cache callback after a pet switch could grant specialist progression to the wrong pet | Preserve original receipt ownership and its idempotent runtime key; retries can finish interrupted Bond delivery for that pet, while unattributed legacy receipts cannot infer a target |
| Season reward rejection still inserted a claimed marker | Write the marker only after successful settlement; expose the real rejection reason |
| An old unpaid marker hid a season reward, while a missing marker hid proof of payment | Derive claimed status from the awarded unified receipt, retaining the existing owner/season/tier idempotency key |
| Daily Cache remained an apparently usable button after collection | Show claimed state, original XP receipt, live UTC reset, and a Contracts continuation link |
| Countdown markup hid explicit claimed/used status labels | Show the status alongside the live timer |

The base XP reproduction starts at 3,240 Pet XP and inserts another 30 XP before
the cache transaction. The old handler leaves 3,280 instead of 3,310. The fixed
handler preserves both awards. The independent season reproduction blocks the
real unified payout through an unresolved wallet record: the old handler still
inserts a claimed marker, while the new handler leaves the reward claimable.

Daily Cache rewards stay at 40 Moon Gold, two Style Tokens and up to 40 Pet XP,
once per account/UTC day. Its existing account/day 1,200 Pet XP cap is preserved.
No extra Community XP, crystals or items are introduced. Wallet and source-pet
mutations, season XP and receipt acceptance commit together. Mid-transaction
failure rolls everything back. Concurrent different requests cannot take a
second cache; identical requests replay the original receipt.

Season rewards stay account-owned. Tier thresholds and evolution Style bonus
are unchanged. Historical unpaid compatibility markers can be recovered without
a migration because the payment ledger now determines the visible claimed state.
A paid receipt is authoritative even if its compatibility marker was never
written. Recovery never guesses a missing payment or pays an existing receipt
again.

## Continuing Contracts upgrade

New v4 contracts offer **Take Supply Cache** after rooms two and four, alongside
the existing three upgrades. It trades that draft's upgrade opportunity for two
contract supplies. Those supplies can fund healing or Scout Ahead, or help the
Well Supplied optional objective. It does not advance the room, add a perk,
change pet stats, grant inventory or award XP/currency on its own.

The server consumes the saved draft with its existing revision comparison.
Parallel clicks cannot double-collect; the client cannot choose the amount or
submit a free cache outside a draft. Closing the app preserves the decision.
V1/v2/v3 saved contracts keep their original choices. V4 retains v3's room
effects, preparations, side objectives and rank formula. Rank remains unlimited;
the first-three-successes account/day Pet XP bonus and its cap are unchanged.

This deepens a continuing loop already available at zero pet energy. Official
Daily Runs, missions, journeys, bounties and bosses keep their actual daily or
weekly limits. Contracts and local Practice remain the way to keep playing
between those resets. Practice remains reward-free.

## Sanity coverage and boundaries

| Surface | Verification |
| --- | --- |
| Care, egg lifecycle and three pose actions | Existing eligibility, pose, cooldown, ownership and mobile checks |
| Daily/Weekly Journey and missions | Existing accepted-evidence suites, cache source-pet attribution and mobile objective routes |
| Standard and Official Daily Runs | Existing source-pet, room choices, odds, tactics, extraction, reward caps and reset suites |
| Contracts | Existing 1,080 simulations, version compatibility, preparations, objectives, rank records and rewards; new supply-choice state/authority/replay tests |
| Practice | Existing 900 simulations and mobile save/reload, isolation and no-reward requests |
| Jobs, Trade, Adventures and timed activities | Existing concurrent settlement, affordability, cooldown and interrupted claim checks |
| Districts, stories, expeditions and bosses | Previously merged choice persistence, source ownership, energy, attempt caps and reward recovery regressions |
| Bounties, market, equipment, crafting and inventory | Existing evidence, balances, quantities, ownership and duplicate protections |
| Season rewards | New failed payout, historical unpaid marker, paid receipt without marker and duplicate payment tests |
| Arena and Kaiju | Existing capability gates, action routes, match state, cleanup and reward checks |

Relic passive effects and future roadmap systems retain their existing inactive
or locked classifications. Saved run versions, old reward evidence, art and
migration history remain compatibility inputs; none were deleted as presumed
dead files. Test coverage is not proof that every historical live account or
real Telegram device has been exercised.

## Validation and rollout

The new settlement tests reproduce both defects against the base, then check
XP races, cap races, concurrent claims, source-pet switches, transaction rollback,
UTC reset, duplicate Bond prevention and season payment recovery. Contract tests
check immutable input, old versions, no reward on drafting, saved supplies and
parallel selection. The existing Worker/API domain contains 71 commands.

The mobile flow exercises the supply draft and reload, actual cache claim and
claimed state after reload, navigation to Contracts, and season reward rejection
followed by recovery. Screenshots target the new controls at 390×844 and 360×640.
Local validation passed all 71 Worker/API commands, Arcade, Wiki and WAX, plus
both mobile browser flows. The aggregate `npm test` then failed the unchanged
Avatar Builder export ARIA assertion under the locally provisioned browser.
The focused settlement and full API suites also passed after the final Bond
retry guard change. The PR records exact GitHub CI results; all five CI domains
remain the merge gate. No tests or gates are removed to bypass failures.

After merge, deploy `moonboys-api` from clean current main using
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`. Pages publishes
cache version `20260927-cache-drafts-v1`. No new D1 migration or VPS restart is
required. The existing contracts table from migration 076 is still a prerequisite.

Reopen Telegram. Verify Daily Cache shows the correct allowance, pays once and
shows its reset after reload. Open Contracts and reach a draft: Take Supply Cache
should add exactly two supplies without advancing the room or adding a perk.
Any previously unpaid season tier should remain claimable until its payout is
confirmed. Compare `/deployment-info` with the merged main commit.
