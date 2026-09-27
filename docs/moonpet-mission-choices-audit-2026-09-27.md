# Moonpet mission choices audit — 27 September 2026

Base: merged PR #1325, `dd33356559ce40e06843d3e551dae1143f28f006`.
The production Worker reported the same commit, deployed at
`2026-09-27T00:17:54.222Z`, when this pass began. No production player records
were modified. This is a new PR after the previous deployment.

## Findings and fixes

| Finding | Result |
| --- | --- |
| Omitting a district approach bypassed the advertised risk | Older clients default to the same balanced risk calculation as the current buttons |
| District/story retries could recompute rewards or resolve a different submitted choice | Persist the complete decision before awarding and reuse it during retries |
| A paid district retry was blocked at zero energy | Resume the saved decision without charging again |
| Expired settlement leases appeared as completed daily attempts | Separate busy, completed and resumable state; show saved-choice controls |
| Retrying a completed story request could reject its previous scene's choice | Acknowledge the existing completion before validating a new scene |
| Seasonal boss weakness was decorative | Add real conserve, steady and weakness-counter attacks with shared preview/resolution rules |
| A defeated raid disabled the only route to an undelivered reward | Separate claim action for verified defeats, including older rotations of the same pet and pet season |
| Raid requests settling across UTC midnight could overwrite progress | Add each paid hit atomically with the event completion, preserving both days' damage |
| Raid state ignored its supplied clock when selecting the boss | Use the same clock for rotation and attempt status |
| Catalog lookup accepted inherited object property names | Reject non-catalog story and reward keys before mutation |

## Meaningful raid choices

Steady damage is `35 + 2 × visible level`. Conserve deals 65% of that value,
rounded down, for 12 energy. Steady costs the original 18 energy and deals the
original damage. Counters cost 18 energy; failure deals half steady damage,
rounded down. Successful counter damage is also rounded down.

| Weakness | Counter | Success chance | Successful damage |
| --- | --- | --- | --- |
| Armor Break | Break Armor | 75% | 1.65 × steady |
| Bleed | Pressure Strike | 85% | 1.45 × steady |
| Blinded | Signal Jam | 70% | 1.80 × steady |
| Barrier | Barrier Counter | 90% | 1.35 × steady |

The server saves its random result and move before energy payment. Changing
the request during a retry cannot reroll, select a cheaper move or add a hit.
These counters affect one attack; no ongoing Arena statuses are implied.
The phase number displays the existing 300-HP segments, not new boss phases.

The existing level gates, one-attack-per-pet/UTC-day rule, rotation HP and
defeat reward remain. There is no new daily currency faucet. Old clients that
omit the move keep Steady Strike. Existing pending attacks without tactic data
retain that original attack. These compatibility paths are required for saved
requests and are not dead build code.

Reward recovery verifies the complete owner/pet/season/rotation/boss tuple
and stored defeat. It reuses the existing reward idempotency key. A claim after
an interrupted response cannot pay twice, and a different pet cannot claim it.
Paid retries can run at zero energy; recommendations suppress unpaid attempts
that cannot afford their saved move. Active leases remain temporarily busy.

## Full player-loop sanity scope

| Surface | Evidence in this pass |
| --- | --- |
| All six Mini App screens and action routes | Literal server-action wiring checks and mobile navigation through real Worker/SQLite fixtures |
| Egg care, Dance, Energy Drink and Cuddles | Existing lifecycle, action-pack and art regression coverage; browser controls remain present |
| Daily missions, Journey and bounties | Existing authority tests; mobile bounty route/claim and Daily Run progress checks |
| Standard Moon Run | Existing energy, choices, banking, ownership and reward tests |
| Official Daily Run | Existing one-attempt-per-account/day, tactic draft, preview, score and reload checks |
| Continuing Contracts | Saved repeatable quests, builds, tiers, room effects, side goals and rank records from PRs #1323–#1325 |
| Practice Roguelite | Unlimited local play; browser verifies no server action or reward and per-pet storage isolation |
| Districts and stories | Default risk, original-choice settlement, zero-energy paid retry, reward-receipt interruption and completed-response replay |
| Seasonal raids | All four counter profiles, original steady behavior, cheaper attack, retry persistence, midnight interleaving and old reward recovery |
| Jobs, timed activities, inventory, gear, crafting, market and cosmetics | Existing Worker/API and arcade regression domains; no unrelated economic redesign |
| Arena, Kaiju, progression and unlocks | Existing capability, lifecycle, source-pet and reward regressions; future systems remain gated |

Contracts are the continuous server-saved progression loop at zero pet energy:
players can choose another quest, build, route and optional objective after
each finish. Contract Rank remains available after daily reward limits, while
20 Pet XP is reserved for only the first three successes per account/UTC day
within the existing cap. Practice provides a separate local, reward-free loop.
Stories, districts and bosses remain limited rewarded activities, with clear
choices and recovery controls. Closing the app is safe; no logout penalty was
added.

## Verification

- `node scripts/ci-domain-runner.mjs worker-api`: all 66 commands passed.
- `node scripts/ci-domain-runner.mjs arcade`: all 23 commands passed.
- Expanded live-systems tests cover all four counter profiles and all 100 roll
  values at unlock level and level 100, district default risk, original-choice
  retries, interrupted reward receipts, zero-energy recovery, completed-story
  replays, expired raid leases, midnight interleaving, invalid choices,
  ownership and repeated claims. These tests use SQLite and the actual reward
  authority.
- Player-loop checks cover 35 literal server-action buttons and 900 practice
  simulations. Contract regression checks cover 1,080 simulated runs and the
  existing capped-reward, authority and concurrency rules.
- `CHROMIUM_EXECUTABLE_PATH=/tmp/moonpet-browser.J3v1S9/chromium MOONPET_BROWSER_SCREENSHOT=/tmp/moonpet-missions.png node scripts/moonpet-player-loop-browser.test.mjs`:
  passed with real Worker/SQLite fixtures at 390×844 and 360×640. Covers all six
  screens, bounty routes/claim, contract room effects/side goals/reload, Daily
  Run tactics/odds/score/reload, practice isolation and the actual raid attack
  and saved-reward claim actions. The 12-energy attack consumes exactly 12;
  an older reward can be claimed at zero energy and its control disappears.
  Mobile screenshots were inspected.
- Changed JavaScript passed `node --check`; `git diff --check`,
  `node scripts/public-copy-trust-guard.test.mjs` and
  `node scripts/anti-drift-check.mjs` passed.

The full `npm test` command was not run locally. GitHub CI remains the merge
gate for all five domains and repository policy checks. Local fixtures and
regression tests do not demonstrate every private production account or every
historical data shape. Interrupted choices are resumed in their current daily
window; the separate raid reward claim also supports previous rotations.

## Deployment

Worker deployment is required after merge, using the provenance script.
This PR adds no D1 migration; previously deployed migration 076 remains a
prerequisite for Continuing Contracts. Pages publishes the frontend through
the normal workflow. No VPS restart, sprite generation or asset download is
needed. The frontend version is `20260927-mission-choices-v1`.

After deployment, compare `/deployment-info` with merged main, reopen Telegram,
and check a raid's three choices and level/energy requirements. Where a saved
defeat exists, claim it and confirm the button disappears. A paid interrupted
mission should expose Resume after its lease expires. Production accounts
were not individually exercised by this local audit.
