# Moonpet progression and public synchronization audit — 28 September 2026

Base: merged PR #1348, `8fb4e7bb72088773e26041cf07f9df7e53bf1cbe`.
This pass uses source inspection, isolated SQLite databases and local browser
checks. It does not certify the deployed version or inspect production accounts.

## Reproduced failures and fixes

1. A Mini App job retry after switching pets awarded another 14 Job XP to the
   newly selected pet. Job responses now retain the accepted receipt's original
   pet and earning day, including a competing request that wins the same key.
   Daily Cache retries also retain the source day for specialist recovery.
2. Recovering an older specialist reward rewound the daily counter and reopened
   both days' allowances. Each new runtime receipt now records its day, actual
   track awards and capped daily totals inside the same transaction. Recovery
   checks historical receipts and the existing day's counter; the summary day
   only moves forward. Previously recorded daily baselines survive in receipts.
3. Two rollover readers could reset a daily counter after another request had
   already credited it. The reset now checks the stored day in SQL, so a stale
   reader cannot erase current progress.
4. The actual deployment wrapper awarded account-wide runtime progression after
   the base Worker had already awarded pet-scoped progression. Its retry repair
   now verifies the accepted action or Standard Run step, original pet ownership,
   season and day, then uses the same pet-scoped award service and key. It cannot
   redirect an unscoped legacy event or change its reward type. Client-provided
   material rolls are no longer passed to this secondary repair path. Progression
   API event keys are limited to the primary ledger's 120-character limit so
   suffixes cannot manufacture new specialist claims for one truncated key.
5. A timed activity marked its claim settled before specialist progression saved.
   If that write failed, subsequent claims found nothing to recover. Specialist
   settlement now precedes the settled marker. Retry finishes that saved claim
   once, using its original date, without paying Pet XP or currency again.
6. Energy Drink, Dance and Cuddles saved primary actions through the bot API but
   omitted the Care/Bond progression already awarded by the Mini App. Both API
   dispatch layers now include these actions with the existing amounts and caps.

The first five regression scenarios failed before the fixes. A separate API
parity test reproduced the missing special-care awards before adding the mapping.

## PR #1349 review follow-up

Both review findings on `b52bc78261` reproduced in the deployed entrypoint.
Standard extraction persisted a canonical event key but repair searched for the
client request key. Final-step settlement recovery skipped the only successful
opportunity to credit the saved step.

- New Standard extraction receipts save one canonical runtime identity with the
  primary reward. API, Mini App and Telegram extraction awards use that identity;
  changing the retry key or surface cannot create another 24 Adventure XP award.
  API repair looks up the canonical extraction receipt and its original pet/day.
- Standard final-step settlement repair finds the saved successful API step and
  uses its original event key and day, including a retry with a different request
  key. An already-credited step stays idempotent. Daily boss completion remains
  excluded from extraction progress.
- Older API extraction receipts can recover when no unlinked legacy API
  extraction award exists for that pet/season. If such an award exists, its old
  receipt cannot be identified reliably: repair declines to guess or pay again.
  This leaves ambiguous historical cases for an evidence-backed repair.

The eight new checks cover transient/persistent specialist failure, original/new
retry keys, pet switching, midnight recovery, API/Mini App duplicate prevention,
already-paid steps and legacy paid/unpaid receipts. The initial four fault cases
failed before the change and pass after it.

Review backup: `codex/backup-moonpet-run-repair-20260928-012120`.
Local review sandbox: `codex/sandbox-moonpet-run-repair-20260928-012120`.
Changes are published to the existing PR #1349 sandbox branch.

## Gameplay and display coverage

| Area | Checked behavior |
| --- | --- |
| Care, jobs and Daily Cache | Original-pet retries, special-care API parity, cooldowns and existing caps |
| Timed activities | Claim failure, retry, midnight recovery and existing Growth Mark settlement |
| Daily / weekly journeys | Existing qualification and recovery suites; replays do not add objective rows |
| Official Daily Run | Ten-room Alley King ending, ordinary step/extract rewards and saved boss completion; API tests now use the deployed entrypoint and inspect both specialist and legacy event tables |
| Standard Moon Run | Existing 100-room ending, failure/extraction recovery and original-pet step retry |
| Contracts / Practice | Existing saved choices, ten-room boss ending, claim/replay and separate official/practice records |
| Weekly boss / seasonal raid | Existing choices, defeat/claim and reward-recovery suites |
| Season completion | Existing qualified Mark/Crest requirements, tier rewards and completion simulations |
| Shop / markets / crafting / equipment | Existing Worker and browser suites; no price, loot-table or unlock changes |
| Public Pet leaderboards | Daily, weekly, seasonal and all-time values remain equal to accepted Pet XP; the Mini App agrees with the public seasonal projection |
| Community leaderboard / activity | Replays preserve the XP log, Community totals and one public source-pet action |
| Website graphs | `graph.html` uses canonical wiki entity data; `games/leaderboard.html` passes its selected Arcade row to `arcade-graph.js`. Moonpet XP is not an input to either graph |

The daily checklist still has no additional all-seven bonus. Season completion
still has no separate final boss. Existing Daily, Contract, weekly and seasonal
boss encounters and their rewards are covered above; this patch does not add a
new payout or change progression thresholds.

## Validation

Twenty-three SQLite regressions in `scripts/moonpet-progression-sync.test.mjs` cover
source ownership, old-day caps, concurrent rollover, duplicate claims, transaction
rollback, legacy receipts, deployed API repair, timed recovery, public projections
and API special-care parity. Eight follow-up regressions cover extraction and
terminal-step repair through the deployed entrypoint. The suite is registered in `ci:worker-api`.

The full Worker/API domain passes. The Mini App browser loop passes at 390×844
and 360×640 through all six screens, including quests, tactics, Contracts, bosses,
saved rewards, timed recovery, crafting, markets and season claims. Syntax and
diff checks pass. GitHub CI results and its exact tested commit are recorded in
the PR handoff.

## Deployment and remaining limits

Worker deployment required; no new D1 migration, Pages release or VPS restart.
Existing production migrations, including per-pet specialist progression, must
already be installed. After GK merges, deploy clean merged main:

```sh
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Check `/deployment-info` for the merged SHA. In `moonpet-game.html`, test a job,
a pet switch and a retry, then a timed claim. Compare XP and activity with
`crypto-moonboy-pets-leaderboard.html` and Community ranks in `community.html`.

This does not rewrite old account-wide awards or reconstruct already-closed
historical activity claims. Legacy runtime receipts lack exact credited amounts
and source dates; recovery conservatively counts their requested tracks against
the stored creation date. It does not fabricate an older earning date. Missing
historical evidence cannot safely be inferred from the currently selected pet.

Backup: `codex/backup-moonpet-progression-sync-20260928-005543`.
Sandbox: `codex/sandbox-moonpet-progression-sync-20260928-005543`.
GK approval is required before merge or production deployment.
