# Moonpet 365-day XP authority and legal strategy — 2026-11-16

**Status:** Source-verified XP audit + newly committed candidate simulator strategies. No new XP strategy is yet verified as a 365-day success. Keep draft PR #1783; do not modify production reward tables or level requirements.

## Verified preceding result

The actual Windows CMD `hybrid3` 365-day Worker-backed campaign finished with **57,438 XP, Level 38, 305 Growth Marks, 52 Weekly Crests, 113 Alley King victories, 10 unique relics, 528 Scrap Metal, 102 Evolution Fragments, Stage 3**, and **9,857 accepted actions / 0 rejected**. `legendaryVerified:false`; blockers `level`, `evolution`. The declared Level 50 threshold is 96,040 XP, making a **38,602 XP deficit**. These persisted results were from one strategy and do not rule out other legal play.

## Production reward authority (source audit)

Source: `workers/moonboys-api/worker.js`, `workers/moonboys-api/pets/progression-phase-2.js`, existing activity/job/claim/receipt tests. **Source rewards are not a promise of actual paid XP; the Worker enforces per-day caps, eligibility, cooldowns, and source-pet ownership.**

| Source | Existing XP | Existing restriction |
| --- | ---: | --- |
| Feed | 6 XP | 45-second ordinary action cooldown; care condition and daily XP cap |
| Play | 10 XP | Energy and other stat costs, 45-second ordinary cooldown |
| Clean | 6 XP | 45-second ordinary cooldown |
| Sleep care action | 5 XP | 45-second ordinary cooldown |
| Train care action | 20 XP | 18-Energy requirement, 45-second ordinary cooldown |
| Street Artist job | 18 XP | Worker's legitimate job gate / action limits |
| Courier job | 24 XP | Worker's legitimate job gate / action limits |
| Crystal Miner job | 30 XP | Worker's legitimate job gate / action limits |
| Vault Guard job | 36 XP | Worker level/stage/XP eligibility |
| Later jobs | Up to 52+ XP before Level 50 | Higher level, evolution stage and specialist-track gates; server guidance decides true availability |
| Timed Training activity | **86 XP at two hours** (formula `ceil(6+20*elapsed/1800)`) | One active session at a time; minimum 5 minutes, **2-hour reward cap**, explicit claim required |
| Timed Explore activity | **132 XP at eight hours** (formula `ceil(4+8*elapsed/1800)`) | One active session at a time; minimum 5 minutes, **8-hour reward cap**, explicit claim; energy/hunger/cleanliness impacts |
| Account Pet XP | **1,200 daily cap** | Original reward authority unchanged |

The 8-hour Explore result is a **source-formula maximum**. It incurs Energy and care stat effects and consumes 8 hours of simulated calendar time; it does not assert an actual reward until saved Worker claim receipt verifies it. Training and Sleep care actions are blocked during an active timed session. For that reason, the sandbox only starts a timed activity **after** daily care, runs, weekly boss and evolution actions, then claims before the next UTC day.

## Scoped test-only implementations

`simulateWorkerCampaign` now accepts `xpPolicy`:

- `baseline`: previous proven 365-day strategy; stays default and should retain its 57,438-XP evidence when re-run unmodified.
- `timed_train`: one real 2-hour Training Session per day in addition to the original schedule.
- `timed_explore`: one real 8-hour Explore Session per day, claimed after eight elapsed hours.
- `best_job`: one daily Work action, choosing **only jobs advertised as available** in `hooks.buildPetGuidanceState`, sorted by published Pet XP reward; never override locked jobs.
- `timed_train_best_job`: combined legal Training and eligible-job strategy.
- `timed_explore_best_job`: combined legal Explore and eligible-job strategy; strongest current source-model candidate, not yet a proven result.

The Worker sets and checks XP, source ownership, timed-session start/claim receipts, caps, job eligibility and player-state debits. The sandbox additionally checks `pet_xp_awarded` against the actual persisted source pet's XP before and after claims. **No SQLite XP injection, artificial clock shortening or outcome override.**

Projected extra XP if every 8-hour Explore claim paid its source maximum: `132 * 365 = 48,180`, enough in simple arithmetic to exceed the old 38,602 XP gap; this is NOT a guaranteed outcome because XP caps/other actions may compete for the same award pool, and activity needs/rules may affect gameplay.

## Exact next validation (Windows CMD, Node 24)

```bat
cd /d D:\GITHUB\Crypto-Moonboys.github.io
git switch sandbox/moonpet-365day-care-audit-20261114
git pull --ff-only origin sandbox/moonpet-365day-care-audit-20261114
node --test scripts\moonpet-worker-year-simulator.test.mjs
node scripts\run-moonpet-worker-year-simulation.mjs --days=7 --strategy=hybrid3 --xp=timed_explore_best_job
node scripts\run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid3 --xp=timed_explore_best_job
```

Only if the tests pass and the 30-day result stays source-authentic should a full 365-day combined policy be attempted. If a new test fails, inspect the exact failed reason; do not weaken assertions or mask blocked claims. Compare Marks, Crests, real XP/level, saved boss victories, distinct relics and final evolution.

The standalone CLI now emits **compact weekly progress** (`MOONPET_WEEKLY_PROGRESS`), concise 7/30/90/365 checkpoints, and a concise final result. Add `--verbose` if complete historical JSON detail is needed. This logging does not mutate gameplay.

## Safety

PR #1783 stays draft. No deployed Worker changes, no production D1 migrations, no Telegram/wallet work, no XP multiplier/rate/cap/level-threshold changes, no live care/neglect penalties. The existing relic selection fix was independently merged in PR #1795. No additional Codex task or new PR.
