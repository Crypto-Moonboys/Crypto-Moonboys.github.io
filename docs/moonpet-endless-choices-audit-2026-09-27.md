# Moonpet player choices and quest wiring audit — 27 September 2026

Base: merged PR #1335, `7057ea60804072c133db75e04a7adcfcfc237aab`.
The public Worker reported that commit, deployed at
`2026-09-27T06:36:56.931Z`; `/health` returned `{"ok":true}`.
Only public deployment metadata was read. Gameplay verification uses local
SQLite accounts and real Worker handlers, not production player mutations.

## Confirmed navigation defect

Weekly Journey rendered all five objectives as text with no activity buttons.
The run label said “Daily Moon Runs”, although accepted standard completions /
extractions also qualify. A reproduction on the base found that misleading
label and zero `data-jump` controls; an assertion requiring a route failed.

Each unfinished weekly objective now links to its qualifying panel and explains
what counts. Completed objectives do not generate more unfinished-work links.
Daily missions show alternative qualifying routes for shopping (shop/equipment),
adventure (Adventure/Moon Run/district/story/seasonal raid), and holding 50 Moon
Gold (jobs/unclaimed cache). Navigation issues no gameplay request. Activity
panels retain their real gates and costs. Play Now opens Daily Journey objectives,
Weekly Journey targets and the seven daily missions separately.

The actual Daily Journey still requires its official accepted events. Standard
runs, Contracts and Practice do not substitute for official Daily Run objectives.
Contracts and Practice also do not give Weekly Journey progress.

## Continuing Contract expansion

New contracts save version 6. Players choose one of six goals, one of three
builds, an unlocked difficulty, an optional side objective, and a route length.

| Main goal | Standard: 6 rooms | Long: 10 rooms |
| --- | --- | --- |
| Map the Backstreets | 4 successful routes | 7 successful routes |
| Recover the Lost Tech | 65 remaining salvage | 120 remaining salvage |
| Bring the Courier Home | 50 remaining route HP | 50 remaining route HP |
| Break the Blockade | 3 successful bold routes | 5 successful bold routes |
| Trace the Lost Signal | 3 successful search routes | 5 successful search routes |
| Restock the Crew | 5 remaining supplies | 8 remaining supplies |

All goals require finishing the full route alive. Reaching a target early does
not complete it or reserve a bonus. Spending salvage or supplies can put a
resource goal below its target again. Failure and abandonment earn zero rank.

Standard drafts remain after rooms 2 and 4. Long drafts occur after rooms 2, 4,
6 and 8. The original preparation, supply alternative and redraw decisions stay
available under their rules. A redraw appears only when different unowned perks
remain; its displayed count is the actual replacement count. No extra draft is
created at the finish. Later rooms use increasing threat and failure damage.
The final authored barrier appears in the last room for the chosen length.

Format, goal, targets and progress are server-owned. Moves cannot shorten a run,
change its goal or inject wins. Saved versions 1–5 still finish after six rooms
and keep their original mechanics. Starts without a format remain Standard,
which supports older clients during rollout. Each accepted move uses the existing
saved revision guard, including preparations, supplies and redraws.

Long runs offer more opportunities to earn salvage/rank, but the existing payout
budget is unchanged: the first three account-wide successes each UTC day reserve
up to 20 Pet XP apiece within the normal 1,200 cap. A long run uses one slot and
gives no larger XP award. No new currency, item, material, leaderboard, Growth
Mark or Weekly Crest reward is introduced. Runs remain playable at zero energy,
without a gameplay cooldown, after bonus slots are exhausted.

The Route Collection now has 108 combinations: 6 goals × 3 builds × 3 tiers ×
2 lengths. Historical records count as Standard. Long completions never clear
Standard records, or vice versa. Records belong to the active pet and season.
Shortcuts select length/build/tier and focus the quest; Start remains explicit.
The latest run’s selected length is restored alongside build/tier/side objective
on completion and reload. Existing tier unlocks remain five/fifteen completions.

## Audit coverage and appropriate choices

| Player system | Wiring / meaningful choice | Verification in this pass |
| --- | --- | --- |
| Adoption, eggs, care, incubation, evolution | Lifecycle gates, care cooldowns, active pet authority | Existing API/lifecycle suites; mobile egg action locks and all six screens |
| Official Daily Run | Risk choices, checkpoint tactics, extraction and saved attempts | Existing daily authority/settlement tests and 10,000-run simulation; mobile choice/reload flow |
| Standard Moon Run | Energy-funded repeatable routes and extract/bank decisions | Existing source-pet, energy, terminal reward and weekly evidence tests |
| Continuing Contracts | Goals/builds/tiers/side goals; two lengths; preparation; drafts; supplies; redraws | 4,320 mixed-outcome simulations; completion checks for all 108 setups; SQLite authority/races/recovery; mobile ten-room finish at zero energy |
| Practice | Unlimited local roguelite goals/builds/drafts | 900 simulations and mobile reload/extraction; no gameplay posts |
| Daily / Weekly Journey and missions | Real evidence targets and activity shortcuts | Existing accepted-event/duplicate/season authority suites; new route mappings and mobile navigation checks |
| Bounties, districts, stories, Adventures | Qualifying actions, authored approaches, real previews | Existing reward/cost/cooldown/ownership tests and mobile bounty/Adventure flows |
| Background activities and jobs | Duration trade-offs; play other routes while time accumulates | Existing claim/cooldown/recovery tests; mobile activity-to-Contract navigation |
| Weekly Boss, Seasonal Raid, expeditions | Attack and destination trade-offs; bounded attempts; saved rewards | Existing authority/retry/cost/settlement tests and mobile recovery flows |
| Market, inventory, crafting, equipment | Explicit spending, complete paid bundles, ingredient goals, use/equip | Existing capacity/race/rollback/craft/use tests and mobile market/planner checks |
| Arena / Kaiju | Capability-gated combat controls and dispatch | Dedicated backend and action-wiring suites; no live human-opponent session performed |
| Seasons, profiles, collections | Pet/season ownership, explicit claims, active slot isolation | Existing progression/reward tests; new separate-format records and mobile saved setup checks |

Roguelite drafts belong in multi-step runs, where earlier choices affect later
rooms. Care actions and paid purchases should remain predictable. Timed work
already runs alongside Contracts, so adding a draft to each care click would
add friction without giving the player a longer activity.

The clearest next content extension is more authored rooms with distinct rules,
followed by optional route modifiers and boss-specific Contract endings. Those
are future options, not features in this change. Relic passive powers, visible
Style Lab cosmetics and locked roadmap systems remain explicitly inactive.

## Validation and rollout

Focused engine, navigation, Mini App and art-cache tests pass. The mobile suite
passes at 390×844 and 360×640 using real handlers. It covers all six screens,
weekly links without spending, six goal buttons, format preservation on refresh,
four long-run drafts, saved room-six continuation, ten-room completion, one
20-XP bonus, zero-energy play and separate format records. Existing purchase,
crafting, boss, raid, daily tactic and interrupted reward paths also pass.

The local aggregate `npm test` passed Arcade, Worker/API, Wiki and WAX, then
both Moonpet mobile sizes. It stopped in the unchanged Avatar Builder browser
test at line 545: “Successful export must be announced in the ARIA live region.”
The provisioned browser returned an empty live-region string. Avatar Builder
files are unchanged; this is not counted as a full-suite pass. GitHub’s standard
visual gate must pass before merge readiness. Final CI outcomes are recorded
on the PR. A passing
fixture does not establish that every historical account, Telegram client,
live opponent or network failure has been exercised. Balance simulation checks
mechanics and reachability, not measured player retention or real win rates.

After merge, deploy `moonboys-api` with the provenance script from clean main.
Pages publishes the `20260927-contract-routes-v1` assets and launch URL. No new
D1 migration or VPS restart is required; migration 076 remains the existing
Contracts prerequisite. Start a new contract to choose a Long Route; old saves
correctly remain six rooms. Verify the Worker commit matches merged main, open
weekly objective links, finish a new Long Route and check its separate record.
