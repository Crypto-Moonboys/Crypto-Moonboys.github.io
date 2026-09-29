# Practice progression, equipped styles and relic routes

This addition to PR #1380 replaces the three limitations identified in the
faction-reward audit. It does not change that PR's faction-read fix.

## Practice

Practice now uses authenticated, server-owned runs. The server chooses the seed
and random rolls, persists every turn and rejects stale revisions. Local browser
scores are never imported. After hatching, pick one of three builds and goals;
complete twelve rooms and the checkpoint boss, with three perk drafts on the way.
Rest cannot beat the final boss. Extraction, defeat or missing the goal awards
no rank or XP. There is no pet energy cost or play cooldown.

Each qualifying clear adds training rank to that pet. The first three qualifying
clears per account per UTC day reserve ten Pet XP each. The existing daily 1,200
Pet XP cap still applies; the actual credited amount is shown. Training rank
continues after the allowance is used. It is a separate record from Pet XP;
accepted XP appears in the existing daily, weekly, seasonal and all-time boards
and activity feed. Practice does not bypass Daily Run, Journey or boss objectives.

The finishing turn reserves the bonus atomically. Payout uses a fixed server
reward and idempotent receipt. Interrupted payouts expose a retry button for the
original pet, even after switching pets or a season change. A full daily cap
settles a zero-XP receipt rather than reopening that bonus tomorrow.

## Style Lab

Existing account unlocks now have per-pet equip/remove controls, with no charge.
The Worker checks active-pet and unlock ownership at the write, not just the UI.
Purchases stay in the existing shop path; an owned style needs no repurchase.

| Style | Visible effect |
| --- | --- |
| Rename Badge | Neon callsign/nameplate on the canvas; name editing stays free |
| Profile Frame | Cyan/purple canvas frame |
| Victory Pose | Existing bot victory pose while idle; action and sleep poses take priority |
| Run Trail | Pixel trail behind the bot on Explore; stationary with reduced motion |

Cosmetics grant no stats or XP. Selection persists across refreshes/devices and
is isolated per pet. An unavailable style read disables switching until refresh.

## Relics

All ten owned relics now have explicit route adaptations in **new Practice and
Contract runs**. Their effects do not apply to Standard Moon Run or Daily Run.
Those modes retain their separate rules. Old saved Contracts retain their old
rules; acquiring a new relic affects the next run, not an in-progress snapshot.
Relic reads must succeed before creating a run. IDs use canonical rules; stored
`effects_json` is not trusted as a source of arbitrary bonuses.

| Relic | Route effect |
| --- | --- |
| Bitcoin Heart | +10 starting route HP |
| Moon Battery | +8 starting route HP |
| Infinite Spray Can | +15 percentage points on graffiti-room choices |
| Hacker Lens | Hidden non-boss route: 95% clear, 12 salvage, 8 failure damage |
| Neon Boots | Supply rest heals one extra route HP |
| Golden Sticker | Successful search has a 3% chance of 30 extra route salvage |
| Ghost Tag | Converts the first non-boss failed encounter to a clear per run |
| Cyber Collar | +10 percentage points on bold/combat routes |
| Chain Shield | 10% less failure damage, resulting damage rounded up |
| Lucky Coin | +10 percentage points on non-boss searches |

Normal modified route chances cap at 98%; Ghost Tag's one-use protection is
explained separately. Previews and resolution share the same choice calculation.
Route HP, salvage and supplies never credit pet vital stats, gold or inventory.

## Deployment and validation

Apply **079_moonpet_training_and_style.sql before deploying moonboys-api**. The
migration only creates training/loadout tables and indexes, preserves existing
players and unlocks, and is safe to rerun. The schema snapshot includes it.
GitHub Pages publishes the updated UI; script and Telegram entry URLs are bumped.
An old Worker will show new training/style controls unavailable until deployment.

The new regression suite covers the full training loop, forged/stale/concurrent
turns, shared daily allowance, rollover, source-pet recovery, global XP cap,
leaderboard receipt totals, all four style controls and all ten relic mechanics.
Mobile checks exercise server saves/reload, drafts, extraction, free style
switching and the actual victory renderer. Final suite/CI results are in the PR.

No production data was reset, migrated or deployed during implementation. The
historical weekly/all-time XP discrepancy still needs private ledger evidence.
