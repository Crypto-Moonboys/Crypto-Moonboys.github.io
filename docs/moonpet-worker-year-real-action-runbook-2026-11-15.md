# VERIFIED LEGENDARY 365-DAY RESULT — 2026-11-18 (CURRENT AUTHORITATIVE VERDICT)

**Source:** user-executed Windows Node 24 run on branch `sandbox/moonpet-365day-care-audit-20261114`, command `node scripts\\run-moonpet-worker-year-simulation.mjs --days=365 --strategy=hybrid3 --xp=timed_explore_best_job`. The process completed normally and returned to the Windows prompt. This supersedes the earlier 2026-11-16 Level-38 baseline as the current optimized-strategy verdict; that earlier result remains below as historical evidence.

**FINAL RESULT: `legendaryVerified:true`; `blockers:[]`.**

| Legendary gate | Persisted Day 365 | Required | Verdict |
| --- | ---: | ---: | --- |
| Elapsed age | **365 days** | 365 | PASS |
| Growth Marks | **365** distinct days | 240 | PASS |
| Weekly Crests | **52** qualification weeks | 44 | PASS |
| Pet XP | **121,454** | 96,040 Level-50 threshold | PASS |
| Visible level | **56** | 50 | PASS |
| Alley King victories | **122** | 15 | PASS |
| Distinct owned relic IDs | **10** | 10 | PASS |
| Scrap Metal before final evolution | **520** | 60 | PASS |
| Evolution Fragments before final evolution | **91** | 40 | PASS |
| Final evolution | **Stage 5 Legendary Moon Guardian** | Stage 5 | PASS |

**Final evolution settlement is directly visible in the two Day-365 checkpoints:** immediately before Stage 5, the pet was Stage 4 Moon Guardian with 520 Scrap / 91 Fragments; after the legitimate final evolution action it was Stage 5 `legendary_moon_guardian` with 460 Scrap / 51 Fragments. The exact **60 Scrap + 40 Fragment** debit therefore persisted rather than being fabricated.

**Worker/action evidence:** 11,316 accepted actions, **0 rejected**; 365 timed Explore sessions started and 365 claimed, **0 rejected**, awarding **48,180 Pet XP**; 365 server-eligible jobs accepted, **0 rejected**, awarding **18,994 Pet XP**. Job mix: Vault Guard 46, Signal Hacker 9, Drone Mechanic 28, Vault Security 208, Guardian Patrol 74. Daily Runs: 365 started; **122 boss completions + 192 extractions + 51 failures = 365**. No fully qualified but unsettled Weekly Journey weeks.

**Evolution chain persisted in order:** Moon Egg (0) → Street Moonpet (1) → Cyber Moonpet (2) → Elite Moonpet (3) → Moon Guardian (4) → **Legendary Moon Guardian (5)**.

**Conclusion:** under the tested existing Worker rules, the same permanent pet can satisfy every declared Legendary gate within exactly 365 elapsed days using the `hybrid3 + timed_explore_best_job` legal schedule. No XP injection, direct stat edits, reward-rate changes, lowered thresholds, fabricated relics or bypassed evolution costs were required.

**Release boundary remains unchanged:** this is isolated Worker/SQLite proof, not a production deployment. Before merge/deploy, run current branch tests/CI, review PR drift against main and review comments, and separately approve any production migration/deployment. Do not rewrite the already-passing Legendary requirements simply because this simulation succeeded.

---

# VERIFIED 365-DAY RESULT — 2026-11-16 (LATEST, READ FIRST)

> **LATEST VALIDATION — 2026-11-16 08:43 UK:** All active Worker-backed XP regression tests **PASS (11 passed, 0 failed, 1 optional 365-day test skipped)**. The 30-day `hybrid3 + timed_explore_best_job` campaign now produces **9,650 Pet XP / Level 16, 30 Growth Marks, 4 Crests, 8 boss victories, 2 unique relics, 914 accepted actions, 0 rejected**. All 30 Explore claims and 30 eligible jobs settled legitimately. The four historical `pet_tired` rejections are resolved. See [legal XP source audit](moonpet-365-day-legal-xp-source-audit-2026-11-16.md). **NEXT: actual 365-day test using `--xp=timed_explore_best_job`; its Legendary outcome is still unverified.** The old 365-day 57,438-XP baseline below is retained as historical evidence, not current policy performance.



> **XP strategy update 2026-11-16:** New test-only `xpPolicy` options now include genuine 2-hour Train (source max 86 Pet XP), genuine 8-hour Explore (source max 132 Pet XP), and the highest *Worker-advertised eligible* job. This is not yet a passing full-year outcome. Read [legal XP source audit](moonpet-365-day-legal-xp-source-audit-2026-11-16.md) and run the new local Node tests before longer campaigns. The verified 365-day baseline below remains **57,438 XP, Level 38, `legendaryVerified:false`**. CLI output is now concise with weekly progress; add `--verbose` for full JSON.



**Source:** User-uploaded Windows CMD log `Pasted text(20261116-053910).txt`, last lines `MOONPET_WORKER_CHECKPOINT`, `MOONPET_WORKER_YEAR_FINAL`, `MOONPET_LEGENDARY_NOT_VERIFIED`. The actual 365-day process completed and returned to `D:\GITHUB\Crypto-Moonboys.github.io>`. Earlier 2/7/30/90-day runs in that log are historical and are not the annual verdict.

**Command executed:** `node scripts\run-moonpet-worker-year-simulation.mjs --days=365 --strategy=hybrid3`.

| Legendary gate | Persisted Day 365 | Required | Verdict |
| --- | ---: | ---: | --- |
| Elapsed pet age | 365 days | 365 | PASS |
| Distinct-day Growth Marks | **305** | 240 | PASS |
| Distinct-week Weekly Crests | **52** | 44 | PASS |
| Pet XP | **57,438** | 96,040 for level 50 | INSUFFICIENT |
| Visible level | **38** | 50 | **FAIL** |
| Alley King victories | **113** | 15 | PASS |
| Unique account-owned relic IDs | **10** | 10 | PASS |
| Scrap Metal (remaining) | **528** | 60 | PASS |
| Evolution Fragments (remaining) | **102** | 40 | PASS |
| Persisted evolution | **Stage 3, Elite Moonpet** | Final Legendary | **FAIL** |

**Final authoritative simulator output:** `legendaryVerified:false`; `blockers:["level","evolution"]`. XP deficit to the declared level-50 threshold is **38,602 XP**. This is the actual tested hybrid3 same-pet trajectory, not proof that all legally possible XP strategies must fail.

**Other 365-day receipts:** 9,857 accepted Worker actions, 0 rejected; 365 official Daily Runs started, 113 boss completions, 191 extracts, 61 failed runs, 53 accepted Weekly Boss actions, 52 fully qualified weekly Crest settlements, 0 qualified-but-unsettled weeks, 3 actual paid evolution actions leading to Stage 3. Inventory and progress counts come from the isolated test database, not production D1. The 53rd partial week is not a failed completed week.

**What is conclusively solved:** 365-day ownership clock, migration 085 past week 13, 305 distinct-day Marks, 52 unique-week Crests, all ten distinct relic IDs after merged #1795 relic-selection fix, boss victories and material sufficiency in this strategy. **Do not revisit or weaken those mechanisms simply to make Legendary pass.**

**Next engineering priority:** Inspect legitimate Pet XP sources with full cooldown/daily cap constraints and add alternative fully Worker-authorized XP-efficient action schedules, keeping a hard 365-day boundary. Identify exactly why Level 50 was not reached and whether any realistic schedule earns the extra 38,602 XP. Audit progression/evolution sequencing after XP gain. Do NOT directly grant XP, invent rewards, edit accepted rows, lower the Level 50 threshold, or change production XP rates without express approval. Run tests, report reproducible receipt-based outcome. Add low-noise progress logging before another expensive year run.

**Project state:** Existing **draft PR #1783**, branch `sandbox/moonpet-365day-care-audit-20261114`. NO merge, deploy, migration, Telegram or live neglect penalties. No Codex recovery or new PR.

---

# Moonpet permanent-pet 365-day real Worker audit — direct GitHub continuation

This work replaces unrecoverable Codex-only files with **hosted commits** on PR #1783. It is a sandbox test harness, **not** permission to deploy or merge.

## Files

- `scripts/moonpet-worker-virtual-player.mjs`: reusable in-memory SQLite fixture and authenticated Worker gameplay dispatcher, including the real migration `085_permanent_pet_weekly_evidence.sql`.
- `scripts/moonpet-worker-year-simulator.mjs`: one permanent pet over 1–365 virtual days with actual Sleep, Feed, Play, Clean, Train, Cache, Work, Daily Moon Runs, weekly boss attempts, and evolution requests when `buildPetLifecycleProgress` says ready. The run's choices are read from the Worker and selected using the existing conservative policy; room failures are retained.
- `scripts/moonpet-worker-year-simulator.test.mjs`: separate genuine week-14 evidence regression, short Worker campaign smoke test and opt-in full-year test.
- `scripts/run-moonpet-worker-year-simulation.mjs`: explicit standalone audit runner with persisted checkpoint summaries.
- `scripts/moonpet-relic-selection-v2.test.mjs` plus `workers/moonboys-api/pets/relic-selection.js`: files from **merged PR #1795**, integrated into the sandbox so the year uses the corrected ten-ID selection while preserving original drop chances.

## Exact Windows commands

```bat
cd /d D:\GITHUB\Crypto-Moonboys.github.io
git fetch origin
git switch sandbox/moonpet-365day-care-audit-20261114
git pull --ff-only origin sandbox/moonpet-365day-care-audit-20261114

node --test scripts\moonpet-relic-selection-v2.test.mjs
node --test scripts\moonpet-worker-year-simulator.test.mjs
node --test scripts\moonpet-virtual-player-engine.test.mjs
node --test scripts\moonpet-permanent-progression-contract.test.mjs

node scripts\run-moonpet-worker-year-simulation.mjs --days=7
node scripts\run-moonpet-worker-year-simulation.mjs --days=30
node scripts\run-moonpet-worker-year-simulation.mjs --days=90
node scripts\run-moonpet-worker-year-simulation.mjs --days=365
```

Start with the test suite and 7-day run, **not** the 365-day execution. Stop and report the first failed stack trace; don't report the audit complete when a test is skipped or fails. Node 24 is required.

### What the year result means

`MOONPET_WORKER_CHECKPOINT` reports days 7, 30, 90 and 365. `MOONPET_WORKER_YEAR_FINAL` prints actual persisted XP, level, Growth Marks with distinct earned days, Weekly Crests with distinct qualification weeks, unique account-owned relic IDs, authoritative per-pet Alley King victories, materials, authorized evolution stages and run results.

`legendaryVerified` is only true if all genuine requirements are supported by persisted evidence **and** the Worker has settled `legendary_moon_guardian`. If the 365-day run completes without that evolution, report `blockers` and actual values. Do not infer that the economy is balanced from a 365-day clock or any hypothetical drop simulation.

At 365 elapsed days, the runner performs a final authorized evolution eligibility check. Age 365 means the anniversary after day-364 activities, not the start of calendar day 365.

### Fixture and realism boundaries

- The fixture starts with an already-owned/hatched stage-zero pet (`moon_egg`) as its **initial condition**. This is the only pre-seeded evolution. It grants **no** XP, Growth Marks, Crests, relics, boss victories, materials or later evolution stages.
- Future progression must come through authenticated Worker actions and source-linked persistence.
- Failed or rejected actions remain failed; there is no fabricated payout, forced room success, direct event insertion or timestamp rewriting to manufacture attendance.
- A fixed deterministic action policy is **one candidate player**, not proof of global achievability or impossibility. If it fails, inspect sources and improve legal strategy rather than weaken 365-day requirements.
- The new CLI/test files have been committed to GitHub but **the Node suite and year run are not yet verified locally**. Do not claim PASS on their behalf.
- PR #1783 is behind main and should undergo an ordinary merge-base/conflict review after tests; merging PR #1795 did not automatically rebase #1783.
- All changes remain on the PR branch. No production D1 migration, site deploy, Telegram call, wallet transaction, live care penalty or merge.

## 30-day baseline and revised legal strategy (2026-11-15)

Original locally executed 30-day candidate earned five completed official Moon Runs, five distinct-day Growth Marks and **zero** Weekly Crests. Its action breakdown had **no weekly_boss dispatches**. This is a simulator strategy deficit, not evidence that Weekly Crests cannot be earned under the game rules.

The revised Worker-backed strategy now:
1. Checks the actual Weekly Boss preview **before** the Daily Run consumes energy, and dispatches only an advertised legal move when available.
2. If no attempt was dispatched, checks again after the day's run to detect newly unlocked eligibility; it never retries an already dispatched attack.
3. Uses the existing production V2 **Guardian** tactic only when the persisted Daily Run tactical board offers it at checkpoints three or six, preserving genuine random outcomes.
4. Exposes source-linked `weeklyByWeek` progress for all five Weekly Journey objectives, distinct-day check-ins, `weeklyBoss` preview/attempt/rejection evidence and `dailyRuns.tactics` at checkpoints.
5. Exposes `qualifyingWeeks` and `fullyQualifiedButUnsettledWeeks` to distinguish legitimate missed qualification from a genuine Worker settlement defect.

Run the focused **14-day** boss-evidence regression first:
```bat
git pull --ff-only origin sandbox/moonpet-365day-care-audit-20261114
node --test scripts\moonpet-worker-year-simulator.test.mjs
node scripts\run-moonpet-worker-year-simulation.mjs --days=7
```
If the regression fails, its message includes Worker preview snapshots and weekly source rows; do not report a pass or fabricate a Crest. In a qualified week, all five real objectives must have actual accepted source receipts and a persisted Crest. If 14 days passes, run 30 and 90 days and compare all five objectives week-by-week before claiming the strategy is viable.

## Alternative extraction strategy (experimental, no production changes)

The 30-day full-boss strategy yielded 16 authentic Growth Marks and 3 Crests, with 15 full-run wins, two distinct relic IDs, and zero rejected actions. Daily Journey needs **three** completed source-backed objectives. Care and Explorer have qualifying receipts, but Boss is tied to finishing the 10-room Daily Run; Combat requires three genuine enemy defeats in one run. An official **run_extract** after seven cleared rooms may provide a third Daily Journey objective earlier, but gives up the final boss, materials and relic-drop opportunity.

The simulator now supports two strategies, each calling the real Worker and preserving genuine failures:

```bat
node scripts\run-moonpet-worker-year-simulation.mjs --days=30 --strategy=boss
node scripts\run-moonpet-worker-year-simulation.mjs --days=30 --strategy=extract
```

The default is `boss`, unchanged. `extract` is an alternate test-only strategy and calls `run_extract` *only* if the persisted official run has cleared room seven and is still active. It records attempts, accepted/rejected extraction results and genuine `daily_extraction` objective receipts. It does not award a mark from a simulated guess or inject rewards into SQLite. The opt-in extraction regression is in `moonpet-worker-year-simulator.test.mjs`.

Compare genuine **Growth Marks**, **Weekly Crests**, **boss victories**, **distinct relics**, **materials**, and official run statuses. Higher Daily Mark accrual alone is not a Legendary win if relic acquisition or boss victories fail. Do not merge or deploy this annual simulator without complete tests.

## Hybrid 30-day comparison (2026-11-15)

Locally observed 30-day results from the same real-Worker candidate:

| Strategy | Growth Marks | Weekly Crests | Alley King wins | Distinct relic IDs | Official exits/wins |
| --- | ---: | ---: | ---: | ---: | --- |
| Boss every day | 16 | 3 | 15 | 2 | 15 completed |
| Extract after seven rooms | 25 | 4 | 0 | 0 | 25 extracted |

The extraction player completes more Daily Journey marks but cannot farm boss wins or relics. The full-boss player earns boss inventory but not enough Marks under the measured 30-day pace.

Two new **test-only deterministic policies**, both preserving the actual Worker rules:

- `--strategy=hybrid3`: 3 official full-boss attempts then 4 depth-seven extraction attempts in each successive seven-day *ownership-relative* block. Targets Daily Growth Mark frequency while retaining some boss drops.
- `--strategy=hybrid4`: 4 full-boss attempts then 3 extraction attempts per block. Prioritises more boss and relic opportunities, potentially at the expense of daily Marks.

These policies do not change probabilities, force successes, grant missing resources or preselect hidden roll outcomes. Actual winning/extracting depends on server run resolution. A scheduling decision only chooses a legal player goal; if the run fails before room seven it does not count as an extraction.

To test, run all newly committed regressions first:
```bat
git pull --ff-only
node --test scripts\moonpet-worker-year-simulator.test.mjs
```

Then compare **the same 30-day window**:
```bat
node scripts\run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid3
node scripts\run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid4
```

Compare `growthMarks`, `weeklyCrests`, `alleyKingWins`, `distinctRelics`, `officialRunsByWeek` and `dailyRuns.exitPoliciesByWeek`. No hybrid 365-day result has been run or proven yet.

## Outstanding verification

1. Establish clean Node 24 2-day Worker smoke and week-14 genuine source-evidence PASS.
2. Establish actual Worker three-day Weekly Journey 5/5, authentic Crest and replay protection on this extracted fixture.
3. Run 7/30/90/365 checkpoints and determine whether any legal daily/weekly/boss strategy reaches all gates.
4. Review evolution action readiness, legacy migrations and XP caps across the full 365-day result.
5. Resolve any GitHub CI and PR review failures before release. **Do not merge or deploy the annual simulator as proof until these pass.**


---

## VERIFIED HANDOVER CHECKPOINT — 2026-11-15, 15:17 UK (before 365-day run)

**READ THIS FIRST IN A NEW CHAT OR SESSION.** This checkpoint is based on the user's actual Windows CMD output from running the current PR branch, not on a hypothetical, an interrupted Codex workspace, or an extrapolated win. All observed results below use real Moonpet Worker action routes backed by isolated SQLite. These measurements are NOT production gameplay results. Keep the existing PR #1783 branch `sandbox/moonpet-365day-care-audit-20261114`; do not create another PR or restart the project.

### Immutable task and release constraints

- Purpose: establish whether the SAME permanent Moonpet can actually reach Legendary after 365 elapsed days without fabricated rewards, edited event rows, overridden rolls, XP injections, or bypassing cooldowns. Source-pet ownership must remain authoritative.
- Legendary gates: **365 elapsed age days, 240 distinct-day Growth Marks, 44 distinct-week Weekly Crests, level 50 (96,040 Pet XP), at least 15 Alley King victories, 10 distinct account-owned relic IDs, 60 Scrap Metal, 40 Evolution Fragments**, and server-authorized sequential evolutions through stage five.
- PR #1795 was **merged separately** to `main` and corrected the deterministic relic selection parity problem; 25% Alley King drop frequency unchanged. The fix was explicitly integrated into #1783's Worker implementation. Historical five-relic bug audit remains labelled pre-fix.
- Fixture has migration `085_permanent_pet_weekly_evidence.sql`, new-pet `journey_clock='created_at'`, real stage-zero initial pet, real Worker action dispatch, and true current-date/SQLite simulation. The genuine post-week-13 regression passed for both creation-clock and legacy-quarter pets. Weekly objective requirements remain 5 care, 3 training, 3 completed/extracted official runs, 1 weekly boss attempt, and 2 distinct-day check-ins.
- **No merge, production deploy, live D1 migration, Telegram/wallet action, XP rate change, penalty activation or evolution threshold alteration is authorized by this audit.** Keep PR in DRAFT until verified.

### Working files already ON GitHub

`scripts/moonpet-worker-virtual-player.mjs` (shared Worker/SQLite fixture); `scripts/moonpet-worker-year-simulator.mjs` (same-pet simulation, 7/30/90/365 checkpoint evidence); `scripts/moonpet-worker-year-simulator.test.mjs` (Week 14, two-day and 14-day Weeklies, hybrid and extraction regressions); `scripts/run-moonpet-worker-year-simulation.mjs` (standalone command); `scripts/moonpet-virtual-player-engine.test.mjs` (earlier tests); `scripts/moonpet-relic-selection-v2.test.mjs` and `workers/moonboys-api/pets/relic-selection.js` (merged fix mirrored into sandbox); this runbook.

### Passed real-Worker regression command

`node --test scripts\moonpet-worker-year-simulator.test.mjs`: **8 tests total, 7 passed, 0 failed, 1 skipped** (the expensive opt-in full-year test was deliberately skipped). Verified after hybrid schedule was added. The 14-day `hybrid3` Worker test showed 10 distinct-day Growth Marks, 2 genuine Weekly Crests, two Alley King boss victories, 0 fabricated relics, and seven legal extractions; no rejected extraction. The two real-Worker Week 14 proof tests passed. A skipped test is NOT a tested 365-day outcome.

### Executed 30-day strategy comparison (actual persisted outcomes)

| Policy | Growth Marks | Weekly Crests | Alley King victories | Distinct relics | Successful official exits | Failed runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `boss` every day | 16 | 3 | 15 | 2 | 15 boss completions | 15 |
| `extract` after depth 7 | 25 | 4 | 0 | 0 | 25 extractions | 5 |
| `hybrid3` (3 boss days, 4 extraction days/week) | 21 | 4 | 7 | 2 | 20 (7 boss + 13 extracted) | 10 |
| `hybrid4` (4 boss days, 3 extraction days/week) | 19 | 4 | 7 | 2 | 18 (7 boss + 11 extracted) | 12 |

All figures derive from CMD log output. The two hybrid policies retained all 4 qualification-week Crests and 0 fully qualified but unsettled weeks. `hybrid3` is the leading measured balanced policy; `extract` improves Marks but earns no boss victories/relics. No claim of optimality.

### EXECUTED 90-day `hybrid3` campaign — PRIMARY LATEST RESULT

Command:
```bat
node scripts\run-moonpet-worker-year-simulation.mjs --days=90 --strategy=hybrid3
```

**The command returned to the Windows prompt normally**, after reaching Day 7, 30 and 90 checkpoints. The Day 90 `MOONPET_WORKER_CHECKPOINT` / `MOONPET_WORKER_YEAR_FINAL` reported:

| Metric | Day 90 |
| --- | ---: |
| Real Worker actions accepted | **2,408** |
| Rejected actions | **0** |
| Pet XP | **14,290** |
| Visible pet level | **19** |
| Growth Marks, distinct accepted UTC days | **69** |
| Weekly Crests, distinct qualification weeks | **13** |
| Fully qualified but unsettled weeks | **0** |
| Alley King victories (authority table) | **24** |
| Distinct owned relic IDs | **4** |
| Official Daily Moon Runs completed through boss | **24** |
| Official Daily Moon Runs extracted | **44** |
| Failed official runs | **22** |
| Scrap Metal remaining | **120** |
| Evolution Fragments remaining | **24** |
| Highest persisted evolution | **Stage 1 — street_moonpet** |
| Final Legendary settlement | **FALSE (correct for Day 90)** |

All thirteen ownership weeks earned a genuine Crest; weeks one through thirteen showed five-of-five objectives and no unsettled qualification. The Age/Marks/Crests/XP/relic/evolution gates remain outstanding because the pet was only 90 days old.

**Do not substitute 90-day linear projections for authentic 365-day receipts.** Indicative `69/90*365 ≈ 280` Marks and `13/90*365 ≈ 52.7` Crests show favorable pace, but **Level 19 with 14,290 XP is the major risk**. The visible Level 50 threshold is **96,040 XP**: simple `14,290/90*365 ≈ 57,951` XP at the same pace, substantially below the required threshold. Also, four unique relics at Day 90 do not prove ten unique IDs will be obtained despite the parity fix. Do not confuse accumulated drops with distinct relic IDs. Sequential evolution may require additional attention to stage unlocks and material spending; currently only Stage 1 has been persisted.

### 90-day runtime/performance fact

The Windows CMD output appeared to stop at Day 30 because checkpoint logs exist only at Days 7, 30, 90 and 365. Task Manager showed **Node.js still consuming ~4% CPU and ~168 MB memory**, so it was active, not demonstrably hung. The actual 90-day run subsequently completed. No stable runtime duration was captured. **Do NOT promise that a 365-day run will finish quickly**; SQL/Worker recovery work may become slower with accumulated rows. Improvement before the year run: add concise progress logging every ~7 virtual days (day, elapsed monotonic wall duration, active/in-flight phase, marks/crests/XP/relics, accepted/rejected counts) while keeping detailed checkpoint summaries at 7/30/90/365. Avoid printing massive full snapshots on every day; do not change results to achieve faster runtime.

### NEXT ACTIONS, in priority order

1. **Preserve this PR checkpoint and do not lose it.** This handover is committed to the branch and a PR comment should link to it.
2. Add low-volume weekly progress/performance diagnostics to the standalone runner or simulator without modifying Worker payout or the deterministic gameplay policy.
3. Audit **legitimate XP sources** and their actual time/cooldown/caps. Add an opt-in XP-efficient but legal action strategy that improves beyond the demonstrated 14,290/90-day pace. Do not inflate XP or change production reward formulas just to pass Legendary.
4. Examine relic collection and stage progression at longer horizons (unique IDs, legitimate 25% boss drops, stage 2–5 unlock and material debits). Never pre-grant inventory.
5. Execute **365-day `hybrid3`** only after the progress output and budget strategy are prepared:
   ```bat
   cd /d D:\GITHUB\Crypto-Moonboys.github.io
   git fetch origin
   git switch sandbox/moonpet-365day-care-audit-20261114
   git pull --ff-only origin sandbox/moonpet-365day-care-audit-20261114
   node --test scripts\moonpet-worker-year-simulator.test.mjs
   node scripts\run-moonpet-worker-year-simulation.mjs --days=365 --strategy=hybrid3
   ```
6. Report actual 365-day persisted results for **every** Legendary gate; if any gate fails, return exact blocker and observed source evidence, NOT a fabricated victory or optimistic projection.
7. Before any merge, check current GitHub CI, remote branch mergeability, base drift and all repo review comments. **Do not merge/deploy** without separate user approval.

### New-session handoff sentence

> Continue Moonpet 365-day audit **PR #1783** on `sandbox/moonpet-365day-care-audit-20261114`, using the **2026-11-15 verified handover section** of `docs/moonpet-worker-year-real-action-runbook-2026-11-15.md`. The 90-day real Worker `hybrid3` run PASSED (69 Marks, 13 Crests, 14,290 XP/Level 19, 24 Alley King wins, 4 distinct relics, Stage 1, 0 rejected actions). Add weekly performance checkpoints, audit legal XP optimization and relic/evolution blockers, then execute 365 days. No Codex recovery, no new PR, no production changes.
