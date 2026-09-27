# Moonpet activity and action sanity audit — 27 September 2026

Base: merged PR #1328, `e7859db0331662d57a112394429d6662a8852c9c`.
Production `/deployment-info` reported this commit, deployed at
`2026-09-27T01:25:55.230Z`. No private production player was changed.

## Confirmed problems and fixes

| Finding | Resolution |
| --- | --- |
| An interrupted timed-activity claim became invisible; Start then failed with `activity_claim_pending` | Include recoverable claims in guidance and Play Now, with an enabled recovery button and the original saved preview |
| A running activity took priority over an unfinished Moon Run and urgent care | Ready claims retain priority; accumulating activities no longer hide playable runs or care |
| Work and Economy showed enabled actions to egg players although the server requires hatching | Apply the existing lifecycle locks to action buttons, preserving egg care and cleanup exceptions |
| Four activity buttons gave no duration/reward/cost comparison | Add expandable comparisons derived from the same calculation as settlement |
| Players could not see the Explore crystal/map trade-off before claiming | Show the thirty-minute crystal and its replacement by a map at two hours |
| Work offered little direction during a wait | Add direct Contracts and Practice routes; the background timer keeps running |

The recovery regression failed against the base code. Its fixture interrupts
settlement after the reward is committed, then checks that a subsequent state
read exposes the saved claim and retry does not change balances or create a
second accepted reward. This PR changes discovery and presentation, not reward
amounts, ownership rules, cap enforcement or settlement authority.

## Gameplay coverage

| Surface | Audit and verification |
| --- | --- |
| Egg, care, Dance, Energy Drink, Cuddles | Lifecycle and pose regressions; egg Work/Economy locks and care controls in mobile browser |
| All six navigation screens | Actual frontend with Worker/SQLite fixtures at 390×844 and 360×640; navigation and horizontal bounds |
| Daily missions, Daily Journey and Weekly Journey | Existing accepted-event, pet ownership and reward tests; objective routes remain wired |
| Official Daily Run | Existing attempt/authority tests; mobile tactic, odds, score, reload and room decisions |
| Standard Moon Run | Existing run, bank/extract, energy, duplicate and source-pet tests |
| Continuing Contracts | 1,080 simulations plus authority/concurrency checks; mobile preparations, side objectives, completion and reload |
| Practice | 900 simulations; browser-local isolation, drafts and replay; no backend gameplay calls |
| Districts, story chains, weekly and seasonal bosses | Existing choice, retry and reward regressions; mobile raid energy choices and older saved rewards |
| Street Events, Adventures and jobs | Preview regression tests; mobile Adventure/job action, cooldown and expiry checks |
| Timed activities | All four catalogs; minimum/30-minute/2-hour/cap boundaries; recovery before starting another activity; mobile start, wait, ready and recovery |
| Economy, equipment, crafting, inventory, cosmetics, market | Existing cost, ownership and settlement suites; egg controls show hatching requirement |
| Arena, Kaiju and future panels | Existing capability, matchmaking, action and cleanup tests; no future feature advertised as newly live |

This is source and fixture coverage, not a claim to have exercised every
historical private account in production. Preserved compatibility and recovery
paths are necessary code, including older saved contract versions. No asset
pack or legacy handler was deleted just because it was older.

## Where repeat play belongs

Contracts remain the saved, repeatable quest loop: six rooms, three builds,
three goals, optional side objectives, room effects, upgrade drafts and optional
preparation decisions. Rank and completions continue after the first three
successful account/day XP bonuses. No pet energy or cooldown is required.
Practice supplies unlimited local runs without progression rewards.

Daily/weekly objectives, districts, authored stories and raids keep their
actual cadence. Making those rewards unlimited would change the progression
economy; this PR does not do that. Timed activities instead become an informed
background choice alongside active play. Players can leave and resume without
abandoning their saved contracts. Existing activity expiry remains visible.

## Validation and deployment

- Worker/API domain: 67 commands passed, including the new activity test.
- Arcade domain: 23 commands passed.
- Mobile Worker/SQLite browser scenarios: both sizes passed, including existing
  gameplay and the added egg gates, activity comparison, navigation and recovery.
- Activity preview boundary tests compare every checkpoint against the actual
  reward calculator; reading previews never creates a claim.
- Interrupted claims retain one accepted reward and unblock new activities
  only after settlement. Repeating the completed claim cannot pay again.
- JavaScript syntax, public-copy guard, anti-drift and diff whitespace checks.

After merge, deploy `moonboys-api` with the provenance script. No new migration
or VPS restart is needed. Pages supplies the frontend, versioned
`20260927-activity-options-v1`. Reopen Telegram after deployment and compare the
four activities in Work. Check that an egg sees the hatching lock and that a
running activity still offers Contracts and Practice.
