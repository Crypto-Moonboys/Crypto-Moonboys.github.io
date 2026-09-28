# Moonpet cross-system sanity audit — 28 September 2026

## Baseline and live checks

Base main is `07c56435f7fed6ab70224bdde97755f44998c5c8` (merged #1360).
Production reported that exact commit, deployed at `2026-09-28T11:35:54.152Z`,
and `/health` returned OK. The live game page, Mini App script, play-options
script, Practice script and stylesheet matched main byte for byte. Public
daily, weekly, seasonal and all-time Pet leaderboards and recent activity
returned valid responses.

This audit checks source, isolated SQLite players, fault injection, real browser
flows and read-only public endpoints. It does not inspect every private live
account or modify production player records.

## Confirmed failures and corrections

### Recovery fairness was missing in three other queues

The earlier Daily Run and Journey fixes did not cover Standard Run payouts,
specialist progression or Weekly Boss completion. Two persistently failing
Standard endings or Weekly Boss finishes filled their state-refresh allowance
on every request, blocking later valid records indefinitely. Specialist recovery
also stopped its entire batch at the first thrown error and selected the same
oldest records on the next refresh.

All three now rotate after the last attempted bounded batch and wrap around.
The cursor is saved before processing and uses compare-and-set so an overlapping
reader cannot rewind scheduling. Failed or rejected work remains pending and
retryable. Each specialist source has its own error boundary. Targeted action
or run repairs do not move the unrelated background cursor.

The cursor uses existing private `telegram_settings` keys and is never evidence
of a reward. Ownership, source pet/season, fixed event keys, caps and atomic
settlement still control payment. Empty queues add no statements; each nonempty
queue adds one cursor write. Existing per-refresh source limits are unchanged.

### Failed reads could masquerade as empty player data

Twenty real SQLite fault cases reproduced normal-looking state after required
reads failed: story and raid progress, cosmetics, used district/story attempts,
saved raid claims, items, materials, gear, special-care cooldowns, Weekly Boss
progress/attempts, season XP/claims, economy objectives/receipts, daily/weekly XP
totals, specialist progression, daily mission sources, active runs and timed
activities. The same pattern previously affected Relic Vault and district
mastery.

These required reads now propagate failure through the existing state retry
path. Successful queries returning no records still represent an empty/new
state. Explicit unavailable states already used for Relic Vault, Contracts,
Daily Run authority and partial rollout of the new completion features remain.
The corrections neither delete progress nor create replacement zero records.

### A successful action could leave the screen saying “in progress”

The action endpoint preserves its committed result when the separate response
state read fails, returning `state: null`. The client previously returned early
before displaying that result. A browser regression reproduced this with a
successful finale reward claim and an interrupted story-state read.

The client now displays the actual action result plus “DISPLAY SYNC FAILED. TAP
REFRESH.” It preserves the last valid view. The existing Refresh control reads
the saved state without submitting the claim again. Mobile tests confirm one
reward receipt, one claim request and the restored claimed-victory display.

## Functions, missions and endings checked

| System | Current end/reward and wiring contract |
| --- | --- |
| Adoption, egg care, hatch, roster, callsign, evolution | Owned active pet and lifecycle/level gates; current API and browser suites |
| Feed, Play, Clean, Sleep, Train | Stat effects, costs, cooldowns and source receipts; progression and objective recovery |
| Energy Drink, Dance, Cuddles | Energy/happiness/bond effects, separate cooldowns and daily limits; no Pet XP or official care-objective credit |
| Jobs, timed activities, adventures, events, expeditions | Accepted receipts, costs, saved claims, original-pet rewards and repeat protection |
| Seven daily missions | Feed, Train, full care, Trade, Buy/Upgrade, qualifying Adventure and bank 50 Gold; saved 7/7 bonus once per account/UTC day |
| Daily 7/7 completion | Up to 25 Pet XP, 50 Gold and 1 Style; earned bits survive spending and completed claims survive midnight |
| Daily bounties and Cache | Rotating bounty targets with individual claims; one Cache per account/UTC day |
| Daily Journey | Three of five official objectives; at most one qualified Growth Mark per day; bounded fair recovery |
| Weekly Journey | Five care, three training, three qualifying runs, one boss attempt and two distinct check-in days; one qualified Crest per week |
| Standard Moon Run | Extraction/failure or 100-room completion; banked settlement and source-pet leaderboard credit; recovery fairness corrected here |
| Official Daily Run | Ten-room route and Alley King; saved boss ending, tactics and replay-safe rewards; earlier recovery cursor retained |
| Continuing Contracts | Six/ten-room routes, main goal plus final boss, saved choices; repeatable Contract Rank and three daily bonus slots of up to 20 Pet XP |
| Practice | Repeatable local choices and ending; no official reward or quest credit; route to Contracts |
| Districts and stories | Saved choices, daily limits, district checkpoints and final story cycles; reset-safe recovery and strict state reads |
| Weekly Boss and seasonal raids | Attempt gates, saved attacks/victories, source-pet claims and interrupted settlement; fair Weekly Boss finish recovery corrected here |
| Season progression | Account XP-tier claims; per-pet final evolution plus 60 distinct-day Marks and 10 distinct-week Crests |
| Signal Sovereign finale | Qualified or already-completed pets; three builds, saved turns, free retries and once-per-pet/season payout of up to 100 Pet XP, 200 Gold and 5 Style |
| Arena and Kaiju | Authoritative combat pet, eligibility, costs and settlement; existing regression/browser coverage |
| Shop, trade, market, crafting, upgrades, cosmetics, Relic Vault | Wallet/inventory/capacity checks and duplicate-safe settlement; required reads now distinguish an outage from empty holdings |

A literal-key scan found 62 rendered action keys with Worker references; dynamic
finale/build controls are covered by the completion and browser suites. This
scan is a wiring cross-check, not a substitute for execution tests. Future
breeding, post-season Traits, Sanctuary, Lineage, Fusion and Prestige remain
unavailable. Cosmetic ownership still does not imply a newly implemented equip
feature, and passive relic effects remain inactive.

## Leaderboard and public activity agreement

Website, Mini App and bot use the shared Pet leaderboard projection. Daily and
weekly rankings use accepted Pet XP in their settlement windows; season ranking
uses the source season; all-time includes retained owned pets. Recovered old
rewards do not transfer their source-season XP to a newly selected pet.

The new Standard recovery regression reads the public daily/all-time endpoints
after real payout and confirms each extraction contributes once. Specialist and
Weekly Boss finish tests verify that repairing secondary progression does not
pay primary Pet XP again. Existing tests cover all four periods, archived pets,
new daily/finale rewards, reset boundaries and public activity labels.

Community XP, specialist tracks, Contract Rank, Marks and Crests remain separate
measures. Recent public activity is a receipt feed, not every navigation click.
Wiki entity graphs and Arcade score graphs still have separate inputs; this
patch does not feed Moonpet rewards into either graph.

## Validation and deployment

Twenty-four additional SQLite cases cover the reproduced faults and overlapping
cursor updates. The three expanded suites pass 143 cases. The warm-state limit
remains 180 statements and backlog limit 600; the 50-source backlog peaked at
569 and drained fully. Actual recovery queries compile with D1's five-term
compound SELECT, 100-binding and 32-function-argument limits. The query check
now includes both targeted and rotating specialist recovery.

Three older test fixtures needed their existing table setup before current state
construction. The terminal extraction race fixture now pauses after the terminal
compare-and-set, before payout, so it tests the intended overlap without relying
on promise scheduling. No gameplay guard or test assertion was weakened.

Mobile flows passed at 390×844 and 360×640, including the saved-action/failed-read
case. Full `npm test` passed across all five CI domains. GitHub CI results for
the published commit are recorded in the PR.

After merge, pull clean main, run `npm ci`, then
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`. Compare
`/deployment-info` with the merged commit. GitHub Pages publishes the updated
frontend token `20260928-recovery-state-v1`; reopen the Mini App after publication.
No new D1 migration or VPS restart is required. The already deployed migrations,
including 077, remain required. Never inject database faults into production
for acceptance testing.
