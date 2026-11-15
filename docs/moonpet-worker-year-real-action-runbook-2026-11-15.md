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

## Outstanding verification

1. Establish clean Node 24 2-day Worker smoke and week-14 genuine source-evidence PASS.
2. Establish actual Worker three-day Weekly Journey 5/5, authentic Crest and replay protection on this extracted fixture.
3. Run 7/30/90/365 checkpoints and determine whether any legal daily/weekly/boss strategy reaches all gates.
4. Review evolution action readiness, legacy migrations and XP caps across the full 365-day result.
5. Resolve any GitHub CI and PR review failures before release. **Do not merge or deploy the annual simulator as proof until these pass.**
