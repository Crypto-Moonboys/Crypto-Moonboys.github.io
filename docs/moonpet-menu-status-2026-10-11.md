# MoonPet all-menu saved status — 11 October 2026

Roadmap: Issue #1478, H24 and the existing-system portion of H33 (also H20,
H28/H40). Baseline: merged PR #1481, main
`13985010841d96d717f1ef626521c96a936a093f`.

## Player-visible change

All six dock buttons can show real saved status. Red badges say claims, ready
or review; amber active badges show saved sessions when no red badge takes
priority. Accessible labels name the meaning and also mention active sessions
when a red badge is present. Counts over 99 display 99+.

Each loaded menu has a collapsible Saved Status inbox when there is relevant
state. Ordinary entries start collapsed to preserve phone space. Recovery and
review open it automatically until the player chooses to close it; expansion
is retained per pet/menu during the session. Recovery/claims come first, then
active sessions and progress. Two entries are shown inside the expanded inbox;
additional entries sit under More Saved Status. Every shortcut navigates to
the existing panel, expands it and moves focus there. It submits no gameplay
request. Existing action buttons still perform every claim, choice and upgrade.

| Menu | Existing authority and shown state |
| --- | --- |
| Home | Daily Cache claim; incubation readiness for hatch. |
| Missions | Saved 7/7 bonuses, Contract XP and Finale rewards; active Contracts/Finales; Contract endings and separate Daily/Weekly Journey settlement. |
| Explore | Weekly Boss/Raid claims; source-pet run progress and saved ending recovery; Arena/Kaiju match/queue waiting; saved street events and district/story/raid choices; used Daily Run attempt, story steps/cycles and boss victory status. |
| Work | One timed activity: running, server-confirmed claim ready, unavailable or saved claim recovery. |
| Economy | Current account bounty progress and completed unclaimed targets; claimed state remains explicit. |
| Profile | Unlocked unclaimed account season tiers; ready evolution/morph paths labelled as upgrades/review, not payouts. Season rows explicitly say Locked, Claim Ready or Claimed. |

The existing persistent daily checklist remains, including current-goal emphasis.
Its saved claim links move into the shared inbox to avoid duplicate lists.
Achievements unlock automatically; the player guide corrects the old suggestion
that achievements need a claim button.

## Count and recovery guarantees

- An unloaded/deferred module shows no count, even if a partial snapshot carries
  older module fields. Core Home may show its authoritative Cache/hatch state.
- An unconfirmed action or expired authentication hides dock badges. The saved
  status warning requires a successful authoritative refresh; writes are never
  replayed automatically.
- Contract, daily bonus and Finale deduplication/egg recovery rules are retained.
  A full ten-entry Contract inbox remains a lower bound.
- Weekly Boss is one account reward per boss/week, even with several source-pet
  victory records. The deployed Worker limits rows before filtering stale boss
  IDs; therefore any shown Weekly count uses `+`, including a shorter page.
- Raid claims deduplicate original pet/boss/rotation. The SQL filters eligible
  bosses before its ten-row limit, so a full page uses `+`; shorter lists are exact.
- Season claims deduplicate account quarter/tier. Bounties count current-board
  keys only when complete and unpaid. Cache requires a hatched pet and explicit
  server availability.
- A local zero countdown does not promote a timer to claim ready. Recovery,
  unknown event history, active matches, queues and automatic Journey awards
  cannot be presented as extra saved reward claims.
- Run and saved-choice links retain original source controls and costs. A saved
  daily ending never promises another fight or attempt. Repeatable Contracts
  and limited daily/weekly goals remain separate.

This is frontend presentation and shared guidance only: no Worker route,
migration, fee, reward, authentication, ownership, timer or settlement change,
and no additional polling. Assets use `20261011-menu-status-v1`.

## Verification

- `node scripts/moonpet-mission-status.test.mjs`: 17 tests, including the real
  inbox/nav renderer, capped backlog transitions, account deduplication, partial
  hydration, egg/source-pet recovery, timer readiness and terminal states.
- `node scripts/moonpet-option-guidance.test.mjs`: existing 84 action/Kaiju tests.
- `node scripts/telegram-pets-mini-app.test.mjs`,
  `node scripts/moonpet-player-loop.test.mjs`,
  `node scripts/moonpet-refresh-audit-fixes.test.mjs` and
  `node scripts/moonpet-pet-spaces.test.mjs`: client actions, hydration/retry and
  retained ownership/roster regressions. Isolated render fixtures now provide
  the additional read-only inbox dependency.
- `node scripts/moonpet-guide.test.mjs`,
  `node scripts/moonpet-multi-bot-art.test.mjs`,
  `node scripts/moonpet-public-sync.test.mjs` and
  `node scripts/ci-domain-groups.test.mjs`: guide/source, versions and CI scope.
- `CHROMIUM_EXECUTABLE_PATH=/tmp/moonpet-browser-runtime/browser/chromium node scripts/moonpet-player-loop-browser.test.mjs`:
  actual SQLite-backed Worker projections, all six badges/free review routes
  and real claim clearing at 360×640, 390×844 and 1280×900; existing full gameplay,
  interruption/recovery and retained-pet flows at both phone sizes.
- `CHROMIUM_EXECUTABLE_PATH=/tmp/moonpet-browser-runtime/browser/chromium node scripts/moonpet-guide-browser.test.mjs`:
  public and in-game help at phone/desktop sizes.
- `node scripts/sync-moonpet-guide.mjs --check`, JS syntax,
  `git diff --check`, `npm run test:canon`,
  `node scripts/graph-publishing-integrity.test.mjs` and `npm run ci:wiki`.

Screenshots are generated under ignored `output/moonpet-browser/`, including
`menu-status-{menu}-{width}.png`; they contain fixture accounts only. The existing
browser suite is already registered in visual scope and the domain runner.
No new unscoped browser test is added.

## Release and remaining evidence

GitHub Pages only. No Worker deploy, D1 migration or VPS restart. Hold merge for
GK review. Rollback restores the previous frontend assets and guide; saved data
is untouched.

Local fixtures are not signed-in production sign-off. After release, verify all
six menus, claims, partial loading, low-energy/source-pet runs, phone keyboard
focus and recovery on genuine Telegram clients. P0 live Radio/jobs/Moon Alley,
load/concurrency and deployment-provenance work remains open. This batch expands
existing status coverage; it does not close the entire roadmap or introduce its
new systems.
