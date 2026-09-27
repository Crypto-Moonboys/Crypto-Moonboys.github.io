# Moonpet route preparation audit — 27 September 2026

Base: merged PR #1327, `700f7aff6a9b2e8709fce04ea588cf538c857896`.
Production `/deployment-info` reported the same commit, deployed at
`2026-09-27T01:00:42.068Z`. This audit uses source, regression tests and local
Worker/SQLite browser fixtures. No private production account was modified.

## Findings addressed

| Finding | Change |
| --- | --- |
| Street Event and Adventure choices displayed labels without their outcome odds or costs | Return catalog-derived normal/setback previews and show both on the buttons |
| Adventure controls appeared usable during the existing 30-minute cooldown or below entry energy | Project the same accepted-event timestamp and energy requirement used by the handler; disable controls and display the timer |
| Job buttons likewise ignored the shared job cooldown | Project cooldowns on unlocked jobs, disable buttons during the wait and refresh at expiry |
| Available event/adventure/job routes were absent from Play Now except through indirect bounty links | Add direct routes using the current snapshot; hide Adventure/job recommendations when unavailable |
| Contract resources offered limited tactical spending choices | Add optional Scout Ahead and Field Patch decisions to new contracts, with explicit costs and persisted effects |
| Practice rest was described as a 100% clear and perk odds used ambiguous percent wording | Label rest as recovery and describe odds changes in percentage points |

The suspected selector-refresh bug was ruled out: contract build, tier and
side-goal inputs already retain their values across refresh. Existing tests
continue to exercise that behavior. Saved v1/v2 contract paths are required
compatibility code, not obsolete builds to remove.

## Resource decisions in new contracts

| Preparation | Cost | Effect | Trade-off |
| --- | --- | --- | --- |
| Scout Ahead | 2 contract supplies | +10 percentage points to route clear chances this room, capped at 98% | Fewer supplies for rest or the Well Supplied side objective |
| Field Patch | 20 contract salvage | Restore up to 25 route HP without advancing the room | Less salvage for the main salvage goal and final rank |
| Skip preparation | None | Take a route immediately | Keep resources and accept the original risk |

At most one preparation is allowed before each room's route. Preparation does
not advance depth, count as a successful route, earn rank or reserve a daily
XP bonus. Drafts must be resolved first. Preparation and debit are committed
in the same revision-checked update as every other contract choice. Duplicate,
stale or cross-pet requests cannot spend twice or fabricate resources.

New runs store version 3 in the existing state JSON; no migration is needed.
Saved v1 and v2 runs retain their mechanics and have no preparation controls.
Room, build, difficulty, upgrade and scouting effects share the same preview
and resolution calculation. Spending salvage can cause a salvage contract to
miss its goal; the UI describes that cost and tests exercise it.

## Player-loop coverage and boundaries

| Surface | Checked behavior |
| --- | --- |
| HOME and egg care | Existing care/pose/lifecycle tests; egg Practice remains available |
| MISSIONS, bounties, Daily/Weekly Journey | Existing official evidence and reward authority; mobile bounty navigation and actual claim |
| Standard Moon Run | Existing banking, energy, source-pet, choices and reward regressions |
| Official Daily Run | Existing account/day limit; mobile draft, odds, score and reload checks |
| Continuing Contracts | Three goals/builds/tiers, optional side goals, room effects, new preparations, saved progress and protected bonus slots |
| Practice | 900 simulations, local storage isolation, no backend rewards; clearer recovery and odds text |
| Districts and stories | Existing choice, retry, partial mastery, daily limit and interrupted-reward tests |
| Street Events and Adventures | Catalog preview agreement; actual mobile Adventure action, entry gate, cooldown and expiry |
| Jobs and timed activities | Existing unlock/claim/cancel tests; actual mobile job action and shared cooldown/expiry |
| Seasonal and weekly bosses | Existing raid choices, damage, ownership, reward recovery and duplicate specialist-credit tests |
| Gear, crafting, inventory, market and cosmetics | Existing cost, settlement and ownership regressions |
| Arena, Kaiju, progression and future systems | Existing capability and lifecycle gates remain enforced; no roadmap feature is presented as newly live |

Contracts remain available at zero pet energy and after care/daily cooldowns.
Another saved quest follows any finish. Rank and goal records continue after
the first three successful contracts per account/UTC day use their up-to-20-XP
bonuses. Existing XP caps remain; preparations add no XP or currencies.
Practice remains reward-free. Official missions retain their real cadence.
Players can leave and resume: no logout penalty, expiring streak or forced
extra preparation click was added.

Preview amounts are base catalog ranges, not a promise of the final award.
Street Event repeat scaling, XP/currency caps and pet stat boundaries remain.
Hunger costs increase hunger. Adventure's minimum entry energy is displayed
separately from the random energy cost. The two state-only cooldown projections
are read from accepted history; request handlers remain authoritative.

## Validation

- `node scripts/ci-domain-runner.mjs worker-api`: all 66 commands passed.
- `node scripts/ci-domain-runner.mjs arcade`: all 23 commands passed.
- Contract tests retain 1,080 complete simulations and add preparation cost,
  chance-boundary, draft/affordability, legacy v1/v2, duplicate/concurrent move,
  wrong-pet and salvage-goal trade-off cases. An actual SQLite run at zero pet
  energy preserves pet balances and reserves no XP bonus for preparation.
- Player-loop tests retain 900 practice simulations, 35 literal action-handler
  checks and navigation tests. Catalog tests cover previews for three Adventure
  and three Street Event definitions, including the normal and setback paths.
- `CHROMIUM_EXECUTABLE_PATH=/tmp/moonpet-browser.J3v1S9/chromium MOONPET_BROWSER_SCREENSHOT=/tmp/moonpet-preparations.png node scripts/moonpet-player-loop-browser.test.mjs`:
  passed at 390×844 and 360×640 with real Worker/SQLite fixtures. Covers all six
  screens, prior bounty/contract/daily-run/raid paths, actual Scout Ahead debit,
  reload persistence, encounter preview text, Adventure action/cooldown/reset,
  and job action/shared cooldown/reset. Screenshots were inspected.
- Changed JS/MJS files passed `node --check`. `git diff --check`,
  `node scripts/public-copy-trust-guard.test.mjs` and
  `node scripts/anti-drift-check.mjs` passed.

The full `npm test` command was not run locally; all five GitHub CI domains and
repository guards remain the merge gate. These fixtures do not prove every
private production account or historical record has been tested.

## Deployment

Deploy `moonboys-api` after merge with the repository provenance script.
No new D1 migration or VPS restart is required. Previously applied migration
076 remains necessary for Contracts. The normal Pages workflow publishes the
frontend; its cache version is `20260927-route-preparation-v1`.

After deployment, verify the merged commit through `/deployment-info`, reopen
Telegram, start a new contract and check preparation cost/effect/reload. Existing
contracts should continue unchanged. Check an Adventure and a job: after an
accepted action, the corresponding controls should show their cooldown rather
than accepting another click immediately.
