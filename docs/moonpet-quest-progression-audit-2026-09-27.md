# Moonpet quest progression audit — 27 September 2026

Base: merged PR #1324, `5986d90d19c8026e48727f4ff6ae39b57a42aebb`.
The public production Worker reported this same commit, deployed at
`2026-09-26T23:47:05.260Z`, when this pass began. This is a new implementation
PR, not another comment on a merged PR. Production player data was not changed.

## Findings addressed

| Finding | Change |
| --- | --- |
| Incomplete bounties showed progress without a route to the required action | All ten rotating bounty definitions map to their qualifying panels. Bring It Home offers both Moon Run and Adventure |
| Completed and claimed bounties looked alike | Separate READY TO CLAIM and CLAIMED states, with claim controls only when appropriate |
| Play Now buried outstanding rewards and had only a generic bounty-board link | Prioritize ready bounty claims and finished activities; link the closest unfinished bounty directly to its action panel |
| Care-bounty copy implied any care button counted | Name Feed, Play, Clean, Sleep and Train. Explain that the three stat-only care buttons do not count; item consumption remains separate |
| Bring It Home omitted an eligible action from its description | Describe the existing Adventure alternative; no change to reward eligibility |
| Moon Fabric advertised future equipment upgrades, although the current recipes use it for consumables | Name the actual Moon Snack, Clean Wipe and Style Patch crafting uses |
| Contract room scenes were cosmetic | Eight room conditions now change actual route odds, salvage or failure damage for new contracts |
| Repeat contracts lacked optional challenges and visible records per goal | Add three optional side objectives, goal completion counts, best rank totals and explicit progress to the next difficulty unlock |
| Supply use was labelled as a 100% clear despite earning no route-clear credit | Label it RECOVER and retain its cost, healing and no-clear explanation |

The suspected gear-level UI issue was ruled out: the server already includes
the level requirement in `affordable`. Its existing gate is unchanged.

## Meaningful repeatable choices

| Optional objective | Requirement | Added reward |
| --- | --- | --- |
| All Routes | At least one successful cover, bold and search route | 60 × tier Contract Rank |
| Daredevil | Three successful bold routes | 60 × tier Contract Rank |
| Well Supplied | Finish carrying at least five supplies | 60 × tier Contract Rank |

Choose at most one before starting, or keep Main Goal Only. The main contract
must also succeed. Missing the optional target does not fail the main goal.
Failure and abandonment earn zero rank. Extra rank is included in the displayed
total, not a second claim. No extra XP, currency, materials or official quest
credit is created. Rank remains separate from pet level and leaderboards.

Room conditions create opportunities to change the plan: patrols favor cover,
caches favor search, rival stashes increase bold-route salvage, and the final
checkpoint changes the risk/reward tradeoff. Preview and resolution share the
same rules. The displayed values include room, tier, build and upgrades; clear
chance stays between 30% and 98%.

New contracts save version 2, the optional objective and successful route
counts in the existing state JSON. Existing version 1 contracts retain their
original odds, resources and rank calculation. These compatibility paths are
needed for saved games and must not be removed as dead code.

Goal records are computed from completed contracts belonging to the same
account, active pet and season. They include previous completions. The existing
revision, active-slot, ownership and server-randomness checks govern every new
decision. A client cannot submit wins, change its selected objective mid-run,
or supply a rank/reward amount.

## Player loop and boundaries

| Surface | Behavior checked |
| --- | --- |
| Egg, care and special poses | Egg care/practice availability; existing lifecycle and stat-only action restrictions; art/action-pack regression checks |
| Seven missions and Daily/Weekly Journey | Existing evidence authority and navigation; contracts and practice do not satisfy official Daily Run goals |
| Standard Moon Run | Existing energy, choices, banking, source-pet and reward authority regressions |
| Official Daily Run | Existing one-attempt account/day limit and new tactics from PR #1324; browser choice/reload/score agreement |
| Continuing Contracts | Repeatable saved quests at zero pet energy, three builds/goals/tiers, upgrades, room effects and optional rank objectives |
| Practice | Unlimited local simulation, no backend rewards or pet costs; isolation across pets |
| Bounties and timed activities | Action routes and ready-claim navigation; real bounty claim settlement; existing account/day limits |
| Stories, districts, jobs, bosses, Arena and Kaiju | Existing server unlock, ownership, affordability, reward and settlement regressions |
| Inventory, crafting, gear, market and cosmetics | Existing mutation and cost regressions; copy reflects current Moon Fabric use |
| Relics and future systems | Passive relic powers remain inactive; planned/locked systems are not advertised as newly implemented |

Players can continue contracts or practice after exhausting daily rewards or
care cooldowns. Contracts still reserve up to 20 Pet XP for only the first
three successes per account/UTC day, within the normal daily cap. Rank and
goal records continue afterwards. Closing the app preserves the saved contract.
Four bounty targets reset at 00:00 UTC; navigation never performs an action.

## Verification

- `node scripts/ci-domain-runner.mjs worker-api`: all 66 commands passed.
- `node scripts/ci-domain-runner.mjs arcade`: all 23 commands passed.
- Contract suite: 1,080 simulated runs across goals, builds, tiers and optional
  targets; 879 clears, 201 failures, 2,151 upgrade drafts. Tests cover all eight
  room effects, preview/outcome boundaries, side-goal success/failure, saved v1
  runs, malformed/forged inputs, retries, ownership, concurrent moves, capped
  XP, zero-energy play and per-goal records.
- Player-loop suite: all ten bounty destination sets and 33 literal server
  action handlers; 900 practice simulations; claimed/unfinished/egg routing.
- `CHROMIUM_EXECUTABLE_PATH=/tmp/moonpet-browser.J3v1S9/chromium MOONPET_BROWSER_SCREENSHOT=/tmp/moonpet-quests.png node scripts/moonpet-player-loop-browser.test.mjs`:
  real Worker/SQLite fixtures at 390×844 and 360×640, all six screens, bounty
  navigation and claim, saved side objective, room effects, unchanged contract
  XP/currency/energy and Daily Run tactics. Screenshots inspected.
- Changed JavaScript passed `node --check`; `git diff --check`,
  `node scripts/public-copy-trust-guard.test.mjs` and
  `node scripts/anti-drift-check.mjs` passed.

The full `npm test` command was not run locally. GitHub CI is the final gate
for all five domains and repository policy checks. These tests do not prove
that every private production account or historical data shape was exercised.

## Deployment

Deploy the Worker after merge using the repository provenance script. This
change adds no migration; previously merged migration 076 remains required.
The normal Pages workflow publishes the frontend. No VPS restart is needed.
The frontend cache version is `20260927-quest-progression-v1`.

After deployment, reopen Telegram and verify an unfinished bounty reaches its
action panel, a completed bounty shows CLAIMED after collection, and a new
contract shows Optional Side Objective plus a room effect. Resume an existing
contract without resetting it. Check `/deployment-info` against merged main.
