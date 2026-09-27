# Moonpet market settlement and continuing choices audit — 27 September 2026

Base: merged PR #1334, `27220bb2b7201b36d017649c2c5873049556a905`.
The public Worker reported the same commit, deployed at
`2026-09-27T06:05:23.791Z`. This audit uses source, isolated SQLite players and
browser fixtures. No private production player records were inspected or changed.

## Confirmed fixes

The prior crafting-planner fix hid overflowing finished-item recommendations,
but did not guard direct Market purchases. A controlled regression purchased a
three-snack crate with room for only two. The base accepted and charged the
purchase; the capped inventory discarded part of the paid bundle.

Market settlement now reserves stock only when every included asset fits:

- Item stacks: 999,999 each.
- Materials: 9,999 each.
- Currencies: 999,999 each, including the exchange's simultaneous debit.

These predicates execute in the same transaction as payment and delivery. They
protect against another action filling storage after preflight. One overflowing
component blocks the entire bundle. Rejection leaves no market claim, no spent
currency and no sold stock. Exact-fit purchases work, paid retries are harmless,
and a delivery failure rolls back stock, debit and credit together.

The market previously checked the level only on the earlier snapshot. Settlement
now also requires the captured pet to remain active, selected, hatched and at the
required XP-derived level. Controlled late level, lifecycle and active-slot
changes reject spending. Account inventory and currency remain account-owned.

The Market board displays Storage Full and the affected balances, with links to
Bag and Crafting. Coach and crafting-goal recommendations respect the whole
bundle's capacity. The capacity predicate does not change free earned-loot caps
or other reward sources. Existing paid receipts and balances are preserved; no
historical refund or production data repair is attempted.

## Additional roguelite decision

New contracts pin version 5. At both upgrade checkpoints the player may spend
15 contract salvage to redraw once. Replacement perks exclude the current
offers and owned perks. The first redraw offers three replacements; the second
offers two if a perk was taken earlier, or three if supplies were taken instead.
The button previews that count. Supplies remain an alternative after redrawing.

The revision guard saves the new offers, cost and used flag together. Reloads
retain them, concurrent clicks spend once, and old offered perks cannot be chosen
using a stale request. Choosing a perk or supplies is still required; redrawing
does not advance a room or grant progression by itself. The next checkpoint
resets the redraw allowance. Runs saved as versions 1–4 keep their original rules.

This competes with Field Patch, salvage-goal progress and final rank. It does not
spend pet energy, wallet currency or inventory. The six-room structure, route
odds, completion score formula, difficulty gates, daily XP budget and reward
authority remain unchanged. Contracts remain replayable after daily bonuses.

## Gameplay wiring and replay assessment

| Surface | What remains playable / meaningful choices | Verification in this pass |
| --- | --- | --- |
| Adoption, eggs, care, incubation | Lifecycle and care gates; Practice after adoption | Existing API/lifecycle regressions and both mobile egg/control flows |
| Standard Moon Run | Longer energy-funded routes, risk choices and extraction | Existing run/ownership/settlement suites and action-dispatch wiring |
| Official Daily Run | One account/day attempt; risk/score approaches and saved checkpoint tactics | Existing daily suite and real-handler mobile choice/reload flow |
| Continuing Contracts | Unlimited saved rank loop; goals, builds, tiers, side goals, preparation, drafts, supply alternative and now redraw | 1,080 simulations; authority, races, legacy rules, reward recovery; both mobile layouts |
| Practice | Repeatable local builds, goals, drafts and extraction; no authoritative rewards | 900 simulations and both mobile layouts |
| Districts, stories, events, Adventures | Authored choices with existing daily/energy/cooldown limits | Existing focused Worker/API regressions; route and preview wiring |
| Background activities / Jobs | Timed reward trade-offs and job selection; Contracts remains available during waits | Existing timer, cooldown and interrupted-claim regressions plus mobile flows |
| Daily/Weekly Journey, missions, bounties | Verified targets and claim routes; bounded rewards | Existing evidence/claim tests, action routes and mobile navigation |
| Expedition, Weekly Boss, Seasonal Raid | Destination/attack choices; bounded attempts; saved reward recovery | Existing ownership, retries, damage/cost and mobile recovery tests |
| Market / crafting / inventory / equipment | Explicit spend choices, ingredient targets and consumable use | New market capacity/race/rollback tests; existing spend/craft/use suites; mobile purchase/craft/use |
| Arena / Kaiju | Existing eligibility and combat options | Dedicated backend suites and capability/action-dispatch checks; no live PvP session exercised |
| Profile, evolution, seasons | Existing requirements, claims and ownership | Existing lifecycle/season/reward suites and mobile season-recovery flow |

Every literal Mini App gameplay action is checked against its dispatch path by
the player-loop suite. Dedicated integration tests cover dynamic contract,
market and other payloads. This establishes tested wiring, not proof that every
historical account, live opponent, Telegram client or network failure was seen.

Care and one-shot market/job actions do not need an upgrade draft added to every
click. The sustained quest loop is Contracts; official dailies provide bounded
targets alongside it. Good next expansions are additional authored Contract
goals and encounters, followed by longer optional run formats with clear banking
choices. Those are proposals, not features shipped here. Relic passive powers,
visible Style Lab cosmetics and previously locked roadmap systems remain
inactive; existing copy states their limits. Closing the app preserves a saved
contract and carries no new penalty.

## Validation and rollout

The market overflow test failed against the base before the fix. Focused economy,
contract, Mini App and player-loop tests pass. Browser checks use real local
handlers at 390×844 and 360×640 and cover disabled capacity states, exact-fit
delivery, navigation without spending, draft redraw, one salvage charge and
reload. Full repository and GitHub CI outcomes are recorded on the PR.

The local aggregate `npm test` passed Arcade, Worker/API, Wiki and WAX, then both
Moonpet browser sizes. It stopped at the unchanged Avatar Builder browser test,
line 470: “Renderer load failure must be announced accessibly.” The provisioned
browser returned an empty live-region string. Avatar Builder files are unchanged;
the standard GitHub visual suite must pass before this PR is ready to merge.
This local failure is not counted as a full-suite pass.

After merge, deploy `moonboys-api` using
`node scripts/deploy-worker-with-provenance.mjs moonboys-api` from clean main.
Pages publishes `20260927-market-draft-v1`. No new D1 migration or VPS restart.
Migration 076 remains the existing Contracts prerequisite.

Reopen Telegram after deployment. Check Market quantities and blocked states;
buy an affordable fitting bundle and confirm its complete receipt. Start a new
Contract, reach a draft with at least 15 salvage, redraw, reload and confirm the
same replacement choices and balance. Finish and start another contract after
daily bonuses are exhausted. Compare deployment-info with merged main. Old
in-progress contracts correctly do not acquire the new redraw option.
