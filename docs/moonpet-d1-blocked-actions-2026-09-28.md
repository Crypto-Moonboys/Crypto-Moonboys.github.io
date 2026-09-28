# Moonpet blocked actions: D1 compound SELECT hotfix

Production screenshots on 28 September showed `D1_ERROR: too many terms in compound SELECT` in `pet_runtime_recovery_failed` and `equipment_ownership_recovery_pending`. The deployed version was `eec1f86cb66a487101f52602133c04cafd367eb0`. No production account was accessed or modified during diagnosis.

## Cause and fix

Runtime reward recovery combined eight SELECT terms; equipment ownership recovery combined seven. D1's compound SELECT limit is five, while the Node SQLite test fixture used a higher default. Accepted care/job actions invoke runtime recovery before returning their result, so a recovery query exception can produce `mini_app_action_failed` after the primary action has already committed. The client then displays its blocked animation.

- Runtime recovery now uses two materialized groups of four source queries and a two-term union. The final authority checks, receipt exclusion, grouping, ordering and global 20-award limit are retained.
- Equipment recovery checks all six equipped slots with one join, then unions accepted purchases. It retains owner/season/slot authority checks and idempotent insertion.
- A full HTTP Mini App regression exercises state, Feed, pet switching and Play with two equipped pets. It compiles the actual recovery statements using SQLite's compound SELECT limit set to five. This test requires Python 3.11+ (`python3`) in addition to Node; GitHub's Ubuntu CI provides it.

Each original query was restored independently during validation: the new test failed with the production error for both, and passed after restoration of the fix. All 94 progression tests pass.

## Release and verification

Worker deployment required after GK merges. No D1 migration, frontend change, account reset or VPS restart is required. Existing accepted primary receipts remain available for normal recovery; duplicate rewards remain excluded.

After deployment, confirm `/deployment-info` matches merged main. Reopen Moonpet, try an available care action on each pet, and confirm a successful result and ordinary animation. Check the logs for the absence of the compound SELECT error. Existing cooldowns may still apply to actions whose primary receipt already committed.

Backup: `codex/backup-moonpet-blocked-actions-20260928-044500`.
Sandbox: `codex/sandbox-moonpet-blocked-actions-20260928-044500`.
GK approval is required before merge or production deployment.
