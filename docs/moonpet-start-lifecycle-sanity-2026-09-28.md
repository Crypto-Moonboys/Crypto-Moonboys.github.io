# Moonpet startup and lifecycle sanity audit — 28 September 2026

## Baseline and method

Audited merged main `1fae1ff4e701ff26c28d6131891a761a4e78ef50` (#1362).
Production reported this commit, deployed at `2026-09-28T12:56:49.439Z`, and
health returned OK. The game page, Mini App, play-options, Practice and CSS
matched main byte for byte. Public daily/weekly/seasonal/all-time Pet rankings
returned 2/2/3/5 entries; recent activity returned 20 items.

This follows the [run authority audit](moonpet-run-authority-sanity-2026-09-28.md).
Verification combines source inspection, real SQLite players, injected failures,
concurrent requests, browser flows and read-only live endpoints. It does not
inspect or change every private production account.

## Confirmed gaps and fixes

### An interrupted Daily start could still strand its player

The previous room repair required an existing Daily reservation. If the canonical
run saved but its reservation did not, Refresh displayed Standard controls that
the server correctly blocked. If creation analytics or condition selection
failed later, Refresh restored a room without the intended Daily condition.

Daily classification now detects an incomplete, unplayed start and completes
initialization before returning its board. Normal creation and recovery share
one initializer. Recovery requires the original run-start receipt, matching
owner/pet/season tuple, canonical Daily ID/day/seed, Moon Alley route and an
unplayed run. It never takes its pet or day from the active selection/current
clock. The Daily summary is read after recovery so it agrees with the board.

The existing creation receipt preserves a previously selected legacy condition.
Existing rooms and outcomes are not replaced; rules v2 are installed only under
the existing no-room/first-room gate. Concurrent refreshes reuse the same
reservation, analytics, modifier and room keys. An action can recover the start
without a preceding Refresh. Continued setup failure propagates to the retry
path. Recovery neither settles a run nor awards run XP/currency.

This repair is deliberately limited to intact, unplayed start evidence. It does
not infer repairs for corrupted ownership, changed seeds, missing source
receipts, or a run that already has a resolved/failed room. Those cases remain
unavailable rather than receiving guessed reservations, rules or rewards.

### Required lifecycle and identity reads still hid database failures

Fourteen isolated cases returned a normal-looking response after these reads
failed: adoption authority, account profile/wallet, saved lifecycle, evolution
reveal stage, incubation usage, rare-morph memory/stage/traits, pet age, identity
scope, identity stage, memories, personalities and boss victories.

Required lifecycle and identity projections now distinguish a successful empty
query from a failed query. The Mini App's existing retry path preserves the last
valid state. The age projection uses its existing explicit PROGRESSION
UNAVAILABLE card. Guidance requires its identity reads; optional reaction text
retains its existing fallback. No replacement zero records are created.

The same failure could bypass the hatch gate: both the Mini App and bot API
started a Daily Run for an egg after the lifecycle lookup failed. These gameplay
gates and the matching legacy Telegram guards now propagate read failure.
Combat retains its explicit closed lifecycle-unavailable capability response.
Two additional regressions prove no run is created and the normal hatch gate
still rejects the egg after the database recovers.

Three older isolated test fixtures lacked current identity tables or the pet-age
column. They now supply the real schema dependencies; production schema and
migrations are unchanged.

## Gameplay, endings and public synchronization

A scan found 62 literal rendered button action keys, all with Worker references.
Dynamic controls are covered by browser and dispatch tests; the scan alone is
not proof of correct execution. The full regression matrix includes:

| Area | End, reward and wiring checked |
| --- | --- |
| Egg care, hatch, roster, evolution, rare morph | Owner/lifecycle/level/age gates; saved identity; failure handling above |
| Feed, Play, Clean, Sleep, Train | Stat/cost/cooldown effects and accepted source receipts |
| Energy Drink, Dance, Cuddles | Stats and special-action limits; no official Pet XP/care-objective credit |
| Daily checklist and bounties | Seven earned missions, duplicate-safe 7/7 bonus, individual bounty claims and UTC reset |
| Daily Cache and Daily Journey | Saved Cache claim; three-of-five objectives and at most one qualified Growth Mark/day |
| Weekly Journey and Weekly Boss | Five objectives, two distinct check-in days, qualified Crest, saved victory and reward recovery |
| Standard Run and official Daily Run | Standard extraction/100-room end; Daily ten-room route, tactics, Alley King, source-pet settlement and terminal records |
| Continuing Contracts and Practice | Saved Contract choices, six-/ten-room goals, drafts/final boss, rank/capped bonuses; Practice remains local |
| Districts, story chains and raids | Saved choices, checkpoint bosses, final cycles, limits and recoverable source-pet rewards |
| Season tiers and Signal Sovereign | Tier claims, final evolution/60 Marks/10 Crests; three finale builds, saved turns, retries and one payout/pet/season |
| Jobs, activities and expeditions | Costs, saved choices/claims, original-pet rewards and duplicate protection |
| Shop, trade, crafting, upgrades, cosmetics and Relic Vault | Wallet/stock/capacity, ownership, equipment use and interrupted claims |
| Arena and Kaiju | Existing combat eligibility, ownership, battle and settlement suites |
| Website/Mini App/bot Pet rankings | Shared accepted-XP projection, all four periods, original-pet/season attribution and public activity receipts |

The patch changes no quest threshold, economic cap or official reward policy.
Future breeding, Sanctuary/Lineage/Fusion/Prestige and post-season Traits remain
unavailable. Passive relic effects and cosmetic equip functionality are not
silently introduced. Practice still grants no official progress.

Official Daily score, Community XP, Contract Rank, specialist progress, Marks
and Crests are separate measures from Pet XP rankings. Public activity records
receipts rather than navigation clicks. The wiki graph check passed: 327 nodes,
1,629 edges, matching full/mobile data. Wiki relationship and Arcade graphs have
separate inputs from Moonpet rewards.

## Validation and deployment

All 28 new regressions fail against the base runtime and pass with the patch.
The two expanded focused suites pass 148 tests. They include season changes,
archived source pets, overlapping refreshes, direct action repair, persistent
outages, legacy rules and invalid source evidence. No normal-state SQL statement
is added when there is no incomplete Daily start; recovery handles the one
account-active run instead of scanning an unbounded backlog.

Full `npm test` passed all five domains, including the 390×844 and 360×640
player loops and public leaderboard/activity browsers at 390/360/1280 pixels.
Warm-state/backlog SQL limits remain 180/600; the 50-source recovery fixture
peaked at 569 and drained fully. Published CI results are recorded in the PR. After merge, pull
clean main, run `npm ci`, deploy with
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`, and compare
`/deployment-info` with the merged commit. Worker deployment is required;
no new D1 migration, frontend asset release or VPS restart is required.
