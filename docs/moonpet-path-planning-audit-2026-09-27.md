# Moonpet care and checkpoint path audit — 27 September 2026

Base: merged PR #1336, `988f13ba1cccd234dafa2817fd5ee2d120258ac3`.
The public Worker reported that commit deployed at `2026-09-27T07:05:14.371Z`.
Gameplay tests use isolated SQLite accounts and real Worker handlers; no live
player state was changed.

## Confirmed defects and fixes

| Defect | Fix | Evidence |
| --- | --- | --- |
| Sleep and Train buttons stay enabled while the server rejects them as `pet_busy` | Mirror the active-session gate and link Care to the Work activity panel | The baseline button assertion failed; fixed unit, real dispatcher and mobile checks pass |
| Train offers an action below its 18-energy requirement | Show a disabled resource gate and readable rejection | Unit boundary checks at 17/18 energy; mobile zero-energy fixture |
| The care-set mission title matches Feed even after Feed is complete | Project accepted Feed/Play/Clean substeps and recommend the first missing step | Real accepted actions advance only their own step; request-supplied completion flags are ignored |
| Bank mission guidance falls back to the same Missions view | Open Pet Jobs for earning Moon Gold | Guidance callback test |

Only sessions with active status block Sleep/Train. A completed session with an
interrupted reward receipt does not block them. Feed/Play/Clean retain their
normal cooldowns and remain usable while activities run. The care-set summary
uses the existing account/day accepted-event counts; no completion or reward
authority moved to the browser.

## New Contract decisions

New runs save version 7. After each upgrade or supply draft, players may choose
one path for the next two rooms, or take a route immediately to skip it.

| Path | Clear chance | Salvage per success | Failure damage |
| --- | --- | --- | --- |
| Quiet Streets | +8 percentage points | -5 | -4 HP |
| Salvage Hotspot | -8 percentage points | +10 | +4 HP |
| Stay on Course / skip | Normal | Normal | Normal |

The displayed route odds, salvage and damage include the selected path, room,
build, perks and preparation. Final chances remain clamped to 30–98%. Rest
consumes one room of duration but keeps its existing healing, supply cost and
zero-salvage rules. Preparations consume no duration. After two room advances,
the modifier expires. The next checkpoint offers a fresh choice after its draft.

Selecting a path advances no room, changes no resources and pays no reward.
It persists through reload and cannot be changed at the same checkpoint. The
existing owner/pet/season/revision guard rejects duplicate and racing choices;
client-supplied duration, modifiers and rewards are ignored. Existing v1–v6
saves have no path offers and retain their mechanics. V6 Long records still
count as Long; v7 uses the same separate-format collection records.

Contracts remain available with zero pet energy and no gameplay cooldown. The
108 goal/build/tier/length records, repeatable rank, five/fifteen tier unlocks,
three account/day bonus reservations and up-to-20-Pet-XP per success are unchanged.
Normal XP caps still apply. Paths give no currency, items, Growth Marks, Weekly
Crests, official Daily Run credit or extra collection completion rewards.

## Audit scope and suitable extensions

The full domain suites cover lifecycle and egg gates; care and incubation;
authenticated action dispatch; Daily/Weekly Journey evidence; daily missions;
standard and official runs; Contracts and Practice; bounties; districts and
stories; Adventures; timed activities and jobs; Weekly Boss and Seasonal Raid;
expeditions; shops, crafting, equipment and inventory; Arena/Kaiju; season slots,
collections, reward recovery and account/pet isolation. Existing action-wiring
tests compare literal Mini App gameplay actions with their dispatch routes.

Real mobile fixtures exercise all six screens and the main solo loops. They do
not establish that every historical player account, Telegram client, live
human-opponent session or network failure has been tested. Simulations prove
mechanics and reachable goals, not measured retention or live win rates.

Multi-room Contracts are the appropriate place for more roguelite decisions:
paths affect later choices without adding a draft to each care click. Good
future extensions are authored Contract miniboss endings and room-specific
encounters with distinct resource trades. These are proposals, not shipped
features. Daily and weekly limits stay visible; saved quests and Practice
provide continued play without making capped missions appear endless.

## Verification

- Focused Mini App, Coach, activity and Contract tests pass.
- Contract tests simulate 4,320 mixed-outcome runs with optional paths, check
  completion for all 108 setups, verify path preview/outcome equality, expiration,
  Rest/preparation behavior, legacy parity, owner isolation, duplicate/racing
  requests, daily caps and interrupted reward recovery.
- Real-handler mobile tests pass at 390×844 and 360×640, including four saved
  path decisions in a ten-room Contract, all three path buttons, reloads,
  zero-energy play, one final XP bonus and separate Long records. They also
  verify care busy/energy gates and unlock after an activity becomes recoverable.
- `git diff --check` and syntax checks pass.
- Local `npm test` passed Arcade, Worker/API, Wiki, WAX and both Moonpet mobile
  sizes, then failed the unchanged Avatar Builder browser test at line 470:
  “Renderer load failure must be announced accessibly.” The provisioned Chromium
  returned an empty live-region string. This is not a local full-suite pass.
  GitHub's standard CI must pass before merge readiness; outcomes are on the PR.

## Rollout

GK approval is required for merge and production deployment. After merge, deploy
`moonboys-api` with the provenance script from clean main. Pages publishes the
`20260927-contract-paths-v1` assets and launch URL. No new D1 migration or VPS
restart is required; migration 076 remains the existing Contracts prerequisite.
Start a new Contract to see paths; old saves intentionally keep their rules.
Verify the Worker commit matches merged main, the care activity gate, the daily
care substeps and a selected path surviving reload with accurate route previews.
