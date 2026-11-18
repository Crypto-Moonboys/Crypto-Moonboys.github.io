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

## November 16 morning local test result and correction

User's Windows Node 24 run after commit `2fe6848e` returned **11 tests: 9 passed, 1 failed, 1 opt-in 365-day test skipped**. The new three-day genuine `timed_explore_best_job` Worker test **PASSED**: 3 accepted eight-hour Explore claims yielded **396 total persisted Pet XP (132 each)**, three legal Vault Guard jobs yielded **108 additional XP (36 each)**, with 0 rejected actions. The seven-day `best_job` test also passed (7 accepted Vault Guard jobs yielded 252 Pet XP). The two-hour `timed_train` test verified 7 genuine activity claims but failed an all-actions-accepted assertion because **one ordinary Train action returned `pet_tired`** after prior timed-training energy expenditure; the activity payouts themselves were not rejected.

Follow-up commits `cbfa6695` and `cbdb2ff7` add a genuine Worker Sleep recovery before the ordinary Train action, *only when the actual source pet has less than 18 Energy*, for the timed Training policies. The normal `baseline` and `timed_explore_best_job` play sequences remain untouched. **The corrective targeted test is NOT YET RE-RUN.** Do not claim full-suite pass without evidence.

Fastest focused recheck:
```bat
node --test --test-name-pattern="real Worker two-hour training sessions" scripts\moonpet-worker-year-simulator.test.mjs
```
Then run the full year-simulator regression suite. Only if it passes, start the separate 30-day `--xp=timed_explore_best_job` comparison; never run another costly 365-day campaign on an untested patch.


## Confirmed Windows regression and 30-day XP result — 2026-11-16 08:17 UTC

**Source:** user's Windows CMD `Pasted text(20261116-081719).txt`, last test block and lines beginning `MOONPET_WEEKLY_PROGRESS` / `MOONPET_WORKER_YEAR_FINAL`. Earlier error blocks in that same pasted log belong to older commits, not the current run.

- Targeted two-hour Training test **PASS**: genuine source-pet 7-day baseline 1,281 XP versus timed-training candidate 1,906 XP, including 602 real timed-training XP. Corrected Worker Sleep energy recovery removed prior `pet_tired` rejection in that test.
- Entire `scripts/moonpet-worker-year-simulator.test.mjs`: **11 tests, 10 passed, 0 failed, 1 opt-in full-year skipped**.
- Actual `--days=30 --strategy=hybrid3 --xp=timed_explore_best_job` completed normally, with **9,600 XP, Level 16, 30 distinct-day Growth Marks, 4 Weekly Crests, 8 Alley King wins, 2 unique relic IDs, Stage 1, 40 Scrap Metal, 8 Evolution Fragments**; **913 accepted actions, 4 rejected**. Real Worker timed activities: 30 started / 30 claimed / 0 timed claim rejected, 3,960 XP credited. Real eligible Vault Guard jobs: 30 accepted / 0 rejected, 1,080 XP credited. 8 full boss completions, 13 legal extracts, 9 failed runs. No fully qualified but unsettled weeks.
- Matched existing 30-day `hybrid3` baseline was 4,880 XP, Level 12, 21 Growth Marks, 4 Crests, 7 boss wins, 2 relics. Improved candidate **+4,720 XP in 30 days**, without weakening the authority gates. A linear 365-day extrapolation is NOT a verified Level 50 finish.
- **Open diagnostic:** four rejected actions were present outside the separately counted activity claims/jobs. The compact runner previously hid their actual source reasons, so guessing `pet_tired` would be unsupported. Follow-up commits added bounded `actions.rejectedSamples` with `day,minute,action,reason,retryAfterSeconds`, and concise runner fields `rejectedByReason` and `rejectedSamples`. These are *diagnostic only*, do not change Worker gameplay or payouts. Re-run 30 days to obtain exact failure identities before deciding whether further energy/cooldown fixes are needed.

**Next command after pulling new PR branch:**
```bat
git pull --ff-only
node scripts\run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid3 --xp=timed_explore_best_job
```

Do NOT rewrite live cooldowns, lower XP gates, hide action rejections, or assume the four failed actions are harmless. Evaluate the new `rejectedSamples` before a new year campaign. PR stays draft; no deploy or production migrations.


## November 16 — exact 30-day rejection diagnosis and new correction

The user re-ran `--days=30 --strategy=hybrid3 --xp=timed_explore_best_job` with diagnostics. The final 30-day result remained **9,600 XP / Level 16, 30 Marks, 4 Crests, 8 boss victories, 2 distinct relics**. All **30/30 timed Explore claims** awarded 3,960 source Pet XP; all **30/30 available Vault Guard jobs** awarded 1,080 source Pet XP. The 913 accepted actions remained unchanged.

All **four rejected actions** were conclusively identified as ordinary care `train` returning `pet_tired` at **day 8, 15, 22 and 29**, minute 8; none was an Explore claim or Work rejection. Their seven-day cadence followed energy loss from the genuine timed activity after the previous day's gameplay. This is a player-energy scheduling issue, not a reason to weaken rewards or remove the 18-Energy Worker gate.

New simulator-only patch expands conditional genuine Worker Sleep recovery at minute 7 to `timed_explore` and `timed_explore_best_job`, as well as the previously verified `timed_train` policies. It checks the persisted source pet's Energy immediately before the ordinary minute-8 Train action and uses real `sleep` only if Energy <19, preserving baseline policy and all production rules. A new 16-day **real Worker regression** covers both historically failing days 8 and 15, asserting 0 rejected actions, 16 accepted ordinary Train actions, 16 accepted Explore claims and jobs, and authentic journey records. **Patch not yet runtime-tested.**

Next Windows CMD commands after pulling the PR branch:
```bat
git pull --ff-only
node --test --test-name-pattern="Explore XP strategy recovers ordinary Train Energy" scripts\moonpet-worker-year-simulator.test.mjs
node --test scripts\moonpet-worker-year-simulator.test.mjs
node scripts\run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid3 --xp=timed_explore_best_job
```
The 30-day final `rejectedActions` must be **0**, and Marks/Crests, boss victories, distinct relics and actual Pet XP must be compared rather than assumed. Only then consider another 365-day campaign. No production XP/cooldown/level/migration/deploy changes.


## VERIFIED: 2026-11-16 08:43 UK — zero-rejection XP campaign

**Source:** User-supplied Windows CMD log `Pasted text(20261116-084349).txt` (last completed runs; do not confuse with earlier 30-day log). Pulled GitHub branch commit `9583b8055`. Node 24 Worker-backed simulator tests:

- Focused 16-day Explore + highest eligible job regression: **PASS**. 487 accepted actions, 0 rejected, 16/16 ordinary Train actions accepted, 16/16 timed Explore claims, 16/16 eligible jobs, genuine 5,222 Pet XP, 16 distinct-day Marks and 2 Crests.
- Complete suite: **12 tests total, 11 passed, 0 failed, 1 optional 365-day test skipped**.
- Completed `node scripts\run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid3 --xp=timed_explore_best_job` returned to CMD with:
  - **9,650 XP / Level 16**, 30/30 Growth Marks, 4 distinct-week Crests, 8 Alley King wins, 2 unique relic IDs, stage 1 Street Moonpet.
  - 914 Worker actions accepted, **0 rejected**; `rejectedByReason:{}`, `rejectedSamples:[]`.
  - 30 genuine eight-hour Explore claims earned 3,960 XP; 30 legitimate Vault Guard jobs earned 1,080 XP; neither had blocked or duplicate claims.
  - 30 official Daily Runs started, 21 successful exits (8 boss wins and 13 extractions), 9 failed; no qualified-but-unsettled weeks.
  - 39 Scrap Metal and 8 Evolution Fragments (current remaining balance; randomized quantities may vary across runs).
- Directly measured old `hybrid3` 30-day baseline: 4,880 Pet XP / Level 12 / 21 Marks / 4 Crests / 7 Alley King wins / 2 unique relics. Optimised strategy has **+4,770 Pet XP** while retaining genuine progression evidence and eliminating all four `pet_tired` rejections on days 8/15/22/29.

**Verdict:** the formerly failed energy-recovery action schedule is now **runtime-verified**, not just syntax checked. All short real-Worker test gates have passed. The source-proven eight-hour Explore + unlocked-job XP policy is now ready for an opt-in **full 365-day simulation**, with compact seven-day progress logs. This is NOT proof that Level 50 or Stage 5 will be reached; the long simulation must verify all gates using actual stored Worker receipts. Avoid extrapolating 9,650/30 linearly as a guarantee.

**Next command (Windows CMD, Node 24):**
```bat
git pull --ff-only
node scripts\run-moonpet-worker-year-simulation.mjs --days=365 --strategy=hybrid3 --xp=timed_explore_best_job
```
Leave the simulation running through 7/30/90/365 checkpoints; weekly progress lines confirm activity. Preserve all printed final output and verify `legendaryVerified` and `blockers`. The full results will determine whether the 365-day Level 50 and sequential evolution requirements are achievable with this legal activity schedule. **No merge, production deploy, D1 migration, XP cap/level/rate change, wallet or Telegram operations.**


## VERIFIED FINAL — 2026-11-18: optimized 365-day strategy reaches Legendary

The user executed the full Windows Node 24 campaign on the current PR branch:
```bat
node scripts\run-moonpet-worker-year-simulation.mjs --days=365 --strategy=hybrid3 --xp=timed_explore_best_job
```
The command completed normally. Final persisted output: **`legendaryVerified:true`, `blockers:[]`**.

- 365 elapsed days; **121,454 Pet XP / Level 56**.
- **365 distinct-day Growth Marks**, 52 Weekly Crests, 10 distinct relic IDs, 122 Alley King victories.
- 11,316 accepted Worker actions, **0 rejected**; no rejection reasons/samples.
- 365/365 timed Explore claims, **48,180 Pet XP**, zero rejected.
- 365/365 server-eligible jobs, **18,994 Pet XP**, zero rejected. Job progression: Vault Guard 46; Signal Hacker 9; Drone Mechanic 28; Vault Security 208; Guardian Patrol 74.
- Daily Runs: 122 full boss completions + 192 extractions + 51 failures = all 365 attempts.
- All 52 completed qualification weeks settled; no fully-qualified-but-unsettled week.
- Sequential evolutions persisted through Moon Egg → Street → Cyber → Elite → Moon Guardian → **Legendary Moon Guardian**.
- Immediately before final evolution the Day-365 checkpoint held **520 Scrap Metal / 91 Evolution Fragments** at Stage 4; immediately after Stage 5 it held **460 / 51**, proving the expected **60 Scrap + 40 Fragment** final evolution cost was actually debited.
- The earlier 365-day `hybrid3` baseline without optimized legal XP finished at 57,438 XP / Level 38 / Stage 3. That remains useful historical comparison, but it is no longer the current verdict.

**Audit conclusion:** the declared Legendary path is achievable in the isolated real-Worker simulator at the 365-day boundary without changing production XP rates, Level-50 threshold, relic requirements, Growth/Crest requirements or evolution material costs. This result proves the tested strategy and fixtures; it is not itself evidence of a production deployment or live-player completion.

**Next release work is verification, not more progression tuning:** run the complete current branch test suites and CI against current `main`, resolve any PR review/base drift, inspect migration/deployment requirements, and only then consider merge/deploy under separate approval.
