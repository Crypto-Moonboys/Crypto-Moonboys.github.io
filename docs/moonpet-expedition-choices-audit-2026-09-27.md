# Moonpet expedition choices and sanity audit — 27 September 2026

Base: merged PR #1330, `5c5a6815426844ed615264ca99618be54d839dfc`.
The production Worker reported that exact commit, deployed at
`2026-09-27T02:22:46.793Z`. This audit uses current source, local SQLite/Worker
fixtures and mobile browser automation. Production player data was not changed.

## Findings and changes

| Finding | Change |
| --- | --- |
| Expedition reward events had `pet_id = NULL` and used the mutable account profile for pet XP and energy | Capture the source pet and season before settlement; check and mutate that instance in the reward transaction |
| Retrying the third accepted attempt returned `expedition_daily_limit` | Read the original awarded receipt before current eligibility and daily-limit checks |
| Concurrent requests could calculate the same next attempt number | Compare the expected ordinal inside settlement, alongside the existing three-attempt cap |
| Higher-level pets were forced into the highest unlocked destination, even when they could afford an earlier route | Expose all three existing destinations with level, energy, possible finds and individual availability |
| Expeditions were absent from the Play Now choice list | Add available expedition navigation and make Coach consider affordable earlier destinations |
| The expedition board ended after its daily attempts were used | Add reset timing, today's saved receipts, and direct Contracts/Practice continuation links |
| A new frontend could otherwise send a destination that an older Worker silently ignored | Require the new destination projection before rendering those action buttons |

The ownership regression fails on the base: an accepted expedition event has no
source pet. The third-attempt reproduction also fails on the base: a successful
request replay is rejected by the daily-limit preflight. Tests now exercise the
real handler and unified transaction, including concurrent distinct and duplicate
requests, rather than substituting a simplified reward writer.

## Player choices and limits

| Destination | Unlock | Energy | Existing possible finds |
| --- | --- | --- | --- |
| Dust Tunnels | Level 1 | 12 | Gold with scrap, style or a crystal |
| Crystal Caves | Level 10 | 18 | Gold with a shard, a crystal or battery cells |
| Guardian Rift | Level 25 | 24 | Gold with crystals, or style and a spray core |

Destination selection changes the existing reward pool and energy cost. It does
not add a fourth attempt, another reward currency, higher per-attempt XP or a new
random reward table. The three attempts are shared across pets and destinations.
The exact original reward amounts remain in `PET_EXPEDITION_TIERS` and are shown
before selection. Legacy requests without a destination retain the original default.

Continuous play remains in server-saved Contracts and reward-free local Practice.
The existing 27 contract routes, build choices, side objectives, preparations and
upgrade drafts remain available after daily bonuses. Official Daily Runs, Journey
objectives, bounties, stories and boss attempts keep their actual daily/weekly
cadence; the new navigation does not fabricate credit or restart those limits.

## Sanity coverage

| Surface | Coverage |
| --- | --- |
| Care, incubation, hatch and action poses | Existing lifecycle, availability, cooldown, pet ownership and art suites; mobile egg controls |
| Daily missions and Daily/Weekly Journey | Existing objective evidence, source authority and reward regressions; mobile objective destinations |
| Standard and Daily Moon Runs | Existing room resolution, costs, previews, tactics, source pet, bank/extract and reset tests |
| Continuing Contracts | Saved versions, six-room decisions, side objectives, preparations, rank records, capped bonuses and mobile continuation |
| Practice | 900 simulations, browser isolation, save/reload and reward-free navigation |
| Jobs, Trade and Adventures | Previously merged transactional cooldown guards, affordability, energy and duplicate checks |
| Timed activities | Duration previews, claim/recovery and play-during-timer mobile flows |
| Stories, districts and raids | Existing choice persistence, retry, energy, reward and ownership tests; mobile raid recovery |
| Expedition destinations | New actual-action tests for each destination, levels, energy, pet switch, caps, receipt replay, concurrency, legacy receipts and UTC reset |
| Economy, equipment, crafting and inventory | Existing cost, quantity, ownership, material and reward settlement tests |
| Arena and Kaiju | Existing capability, action routing, cleanup, match state and reward regressions |

The live roadmap boundaries remain unchanged. Old saved runs, receipts and art
remain compatibility inputs; they are not deleted merely because a newer build
exists. This is not a claim that every historical production account was exercised.

## Validation and deployment

Focused expedition and player-loop tests, and the Worker/API, arcade, wiki and
WAX domains pass. The mobile browser loop passes at 390×844 and 360×640, including
all three actual destination actions, visible costs, receipts after reload,
disabled exhausted attempts, Contracts continuation and an older Worker response.
The destination screen was visually inspected. Syntax and whitespace checks pass.

The full local `npm test` reached an unrelated Avatar Builder browser assertion:
the export live-region text was empty when checked for “download ready”. Those
files are unchanged by this PR. All five GitHub CI domains must pass before
marking the PR ready; inspect the PR checks for final results.

After merge, deploy `moonboys-api` using
`node scripts/deploy-worker-with-provenance.mjs moonboys-api` from clean current
main. No new D1 migration or VPS restart is required. Existing tables store
the chosen destination and receipt. Pages publishes cache version
`20260927-expedition-choices-v1`.

Reopen Telegram after deployment. A Level 10+ pet should still be able to choose
Dust Tunnels; the displayed energy cost must match the deduction. Receipts
must survive reload. At zero attempts, Contracts and Practice remain reachable.
