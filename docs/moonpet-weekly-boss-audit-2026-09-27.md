# Moonpet Weekly Boss and sanity audit — 27 September 2026

Base: merged PR #1331, `b3c5d81639a4b51ecd8c23cd4d6f17168e04ef5f`.
The public Worker reported that exact commit, deployed at
`2026-09-27T03:04:35.978Z`; `/health` returned `{"ok":true}`.
This pass continues the player-loop audits against that current build.

## Confirmed findings and changes

| Finding | Change |
| --- | --- |
| Weekly Boss energy was deducted from the mutable account profile and then mirrored to whichever pet was active | Capture the attacking pet/season; recheck its lifecycle, level, energy and calculated stats in the transaction; debit that instance |
| The defeating pet was recorded after reward delivery | Store the source pet and exact defeating event in the same transaction as the attack and damage |
| A defeated boss disabled every attack button but exposed no separate reward recovery, particularly after weekly rotation | Add an authenticated, duplicate-safe claim action for proven old/current victories and show pending receipts from the owner's pets |
| A switched low-level pet could block a duplicate attack receipt | Read the stored account attempt before current attack eligibility; recovery has no new attack, level or energy requirement |
| Three move names concealed the actual damage comparison | Return and display ranges from the existing damage formula, with cost and included bonuses |
| Used/defeated states gave no saved attack, rotation timer or clear continuation | Show today's action/damage, Monday reset and Contracts/Practice links |
| Replaying an old reward timestamp could rewind `last_decay_at` | Keep the unified reward writer's decay timestamp monotonic; retain original reward day/week and protect the newer streak |

The source-pet regression was run against the base and failed: pet A began with
80 energy, pet B became active before settlement, and A still had 80 instead
of 68. The fixed handler leaves A at 68 and B at its original 30. Tests invoke
the real Worker handler and SQLite transaction rather than a substitute reward
writer. Stale stats, depleted energy, lost level, egg and archived status all
reject before recording or charging an attack.

## Player choices and authority

All three existing moves still cost 12 energy. Their random roll remains 0–12;
weakness contributes 12 damage, and the matching personality contributes 5.
The preview uses the same formula as resolution, including valid starter-pet
evolution compatibility. No new damage multiplier, currency or boss reward is
introduced. Endure is a damage move, not a heal or persistent Arena buff.

Weekly Boss remains a hatched level-5 feature with one account attempt per UTC
day. Switching pets does not grant another attempt. The boss changes at Monday
00:00 UTC; the daily attempt reset and weekly rotation are separate timers.

Reward recovery verifies the stored defeat, original pet/owner/season and boss.
It retains the original reward key and credits that pet even when the player
has selected a different pet or an egg. Old victories keep their original
day/week, so recovery cannot fabricate current-week Journey progress. No new
attack or energy charge is created. Missing historical ownership evidence is
not guessed or reassigned to the current pet. Existing immutable victory and
legacy receipt paths remain compatibility inputs.

Pending rewards are first on the boss board and appear in Play Now and Coach.
Opening a board or a continuation link never submits a gameplay action.
Contracts remain the server-saved continuing quest loop with bounded daily
bonuses; Practice remains local, unlimited and reward-free. Official daily
missions, journeys and boss attempts retain their actual cadence.

## Sanity coverage

| Surface | Checks used in this pass |
| --- | --- |
| Care, egg reveal, Energy Drink, Dance and Cuddles | Existing lifecycle, ownership, cooldown and art suites; mobile egg controls |
| Daily missions and Daily/Weekly Journey | Existing event-evidence and receipt tests; mobile objective navigation; Weekly Boss source-pet and historical evidence cases |
| Standard and Official Daily Moon Runs | Existing source-pet, room choice, cost, tactics, extraction, concurrency and reset suites |
| Continuing Contracts | Existing saved versions, route/build choices, preparations, side objectives, rank records, bonus caps and mobile continuation |
| Practice | Existing 900 seeded simulations plus mobile save/reload, pet isolation and no gameplay POSTs |
| Jobs, Trade, timed activities and Adventures | Existing cost/cooldown/receipt regressions; mobile activity recovery and Trade availability |
| Districts, stories and seasonal raids | Existing persisted choice, energy, ownership and interrupted settlement tests; mobile raid recovery |
| Expeditions and bounties | All existing destination/receipt/cap/race tests and mobile destination/navigation coverage |
| Equipment, crafting, items, progression and economy | Existing authoritative balance, material, ownership and duplicate settlement suites |
| Arena and Kaiju | Existing capability gates, routing, terminal cleanup and rewards tests |
| Weekly Boss | New real-action tests for each move, previews, owner/pet switches, concurrent attempts, eligibility races, interrupted victory delivery, wrong-owner claims and old-week recovery |

The current roguelite choices are already present in Daily Runs, Contracts,
Practice and the existing district/story/raid decisions. This change makes the
Weekly Boss comparison accurate; it does not claim to add a new branching boss
engine. Relic passive effects and future roadmap systems retain their existing
inactive/locked classifications. No old save formats, sprite assets or migration
history were removed as supposed dead build files.

## Validation and deployment

The focused Weekly Boss authority, per-pet state and Coach tests pass. The mobile
browser flow passes at 390×844 and 360×640 using the actual Mini App JavaScript
with SQLite-backed Worker fixtures: compare moves, attack once, interrupt reward
delivery, reload, recover the reward and navigate to Contracts. Screenshots were
inspected, including the prominent recovery control. These are fixture checks,
not an assertion that every historical production account has been exercised.
The local `npm test` passed the arcade, Worker/API (70 commands), wiki and WAX
domains and the Moonpet browser flow. It then failed the unchanged Avatar
Builder export live-region assertion at
`scripts/avatar-builder-browser.test.mjs:545` under the provisioned Chromium.
No assertion was removed or relaxed to bypass that failure. All five domains
must pass in GitHub CI with its installed Playwright browser before the PR is
marked ready; the PR lists those final results.

This change adds no schema migration. It uses the existing weekly attempt,
progress, victory and unified reward tables. After merge, deploy `moonboys-api`
from clean current main with
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`. Pages publishes
cache version `20260927-weekly-boss-recovery-v1`. No VPS restart is needed.

Reopen the Telegram Mini App after deployment. A hatched level-5+ pet with
12+ energy should see all three damage ranges. One accepted attack should deduct
12 energy once and display its saved action/damage. At the daily limit, the
Contracts and Practice links should still open. Any already-pending reward with
valid victory evidence should recover without an attack, including after a pet
switch. Production player data was not altered during this audit.
