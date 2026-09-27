# Moonpet player options and crafting audit — 27 September 2026

Base: merged PR #1333, `bcb129e07f0f9cd97fd454428944f28f19e1a452`.
The public Worker reported this commit deployed at `2026-09-27T04:31:45.838Z`.
No production player records were read or changed. This is a new branch and PR.

## Confirmed findings

| Finding | Change |
| --- | --- |
| Crafting checked the active profile's level before reservation but not when spending | Recheck the current XP-derived level in the same transaction as material debit and output credit |
| Gear upgrades had the same stale level window | Recheck Level 15 in their transactional reservation |
| Equipment and cosmetic spending did not recheck a wallet that became blocked after preflight | Enforce the existing recovery predicate before the transaction can spend or grant anything |
| Cosmetic keys could resolve inherited object properties | Require a string and an own catalog entry; invalid input gets a normal rejection |
| Crafting was absent from quick navigation and the server deep-link focus allowlist | Add the Craft shortcut and route/focus support |
| Disabled recipes supplied no personal target or next route | Add a per-pet/device goal with ingredient deficits, output count and matching live route choices |
| Districts did not tell players which material their current mastery position offered | Project the exact material through the same selector used by settlement |
| A full output stack could still look craftable | Disable the recipe and show OUTPUT STACK FULL using the current bag snapshot; keep server capacity guards |
| Bag controls hid the item's description; some descriptions promised unrelated effects | Show actual use effects/caps and distinguish consuming a charm/map from keeping its existing standard Moon Run benefit |
| Style Lab names implied applied visual cosmetics and a paid rename requirement | State that these are collection records only; link to the existing callsign editor without a badge purchase |

The crafting regression was reproduced against the base by lowering the active
profile's XP after reservation. It still spent materials and granted a Battery
Pack. Independent equipment and cosmetic tests made wallet recovery pending
after reservation; both still spent on the base. The fixed tests verify zero
debit/grant, recovery, same-key retries and no duplicate payment. These are
controlled race fixtures, not claims about observed production incidents.

## More choices using existing gameplay

The player can track any of the five current recipes, change it, or stop
tracking. The selected key is stored per pet in browser storage; if storage is
blocked it remains in memory for that session. This is a personal planning
preference, not a new server quest or account balance. It is not synced between
devices. Switching pets does not copy the goal to another pet.

The goal compares the real material balances and bag contents with the current
recipe. Play Now returns to the goal and announces when crafting is ready.
Routes come only from the current state:

- Available districts whose current material matches a deficit, with affordable
  entry or an already-paid saved retry. The destination still asks for an approach.
- Available expeditions with a matching possible find. Finds are not guaranteed.
- Unbought, unlocked and affordable market offers supplying ingredients or the
  finished item. Prices remain visible and purchases remain explicit.

Exhausted, locked, unrelated and unaffordable options are excluded from those
recommendations. The panel also links to material information and Contracts.
Contracts still have no pet energy cost or cooldown and grant no crafting
materials. Daily/weekly gates, reward amounts, recipe costs, pet stats, rank,
official quest credit and existing saved run versions are unchanged.

District material previews use the existing mastery-based rotation: one on a
successful clear, three on a defeated boss checkpoint, none on a setback,
subject to the existing reward cap. No outcome or future random roll is exposed.

## Sanity coverage and limits

The existing player-loop tests exercise all six screens, care/egg controls,
daily and weekly objectives, bounties, timed activities, jobs, Trade, districts,
stories, standard/official runs, Contracts, Practice, expeditions, raids, weekly
boss recovery, Daily Cache, season rewards, equipment and inventory. The action
wiring check covers literal buttons; dynamic payloads also rely on their
dedicated Worker/API suites and real-handler mobile fixtures.

New mobile checks cover choosing a goal, navigating without a mutation, reload,
material refresh, actual craft and item use, switching players and clearing the
goal at 390×844 and 360×640. The pure planner tests check eligibility, deficits,
market alternatives, full stacks, stale/malformed preferences and egg locks.
The live-system suite verifies district preview/settlement agreement, level and
wallet races, recovery and invalid cosmetic keys.

Style Lab remains an account collection ledger, not implemented visual effects.
No existing purchased records were deleted or refunded, and no new cosmetic art
or animation was generated. Relic passives and other previously locked roadmap
systems remain unchanged. Compatibility paths, migration history and saved run
versions are required data support, not dead builds to delete.

The local aggregate `npm test` passed all five domains, including both mobile
flows and Avatar Builder. A screenshot-only scroll was changed to a single DOM
scroll operation after its locator detached during a timer rerender; no gameplay
assertion was removed. The live-system suite was rerun after sharing the district
material selector. Exact final GitHub CI results are recorded on the PR.
Tests do not demonstrate every historical production account or Telegram device.

## Rollout

After merge, deploy `moonboys-api` from clean current main with
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`. Pages publishes
`20260927-crafting-goals-v1`. No D1 migration or VPS restart is added.

Reopen the game, choose Economy → Craft, track a recipe and follow a matching
route. Reload to verify the preference. Craft when ready and check the Bag's use
description. Verify all three purchase categories still reject unavailable
resources. Compare `/deployment-info` with merged main.
