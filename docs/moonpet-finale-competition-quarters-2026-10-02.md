# Finale competition quarters — 2 October 2026

Signal Sovereign now follows the published rule: one victory reward per pet per
competition quarter. A qualified permanent pet gets a fresh Finale each quarter.
Its original ownership `season_key`, identity, lifetime Pet XP, evolution,
Growth Marks, Weekly Crests, completion markers and purchased space stay intact.
The qualification gate remains final evolution plus 240 distinct-day Growth Marks
and 44 distinct-week Weekly Crests, or a retained completion marker.

## Saved battles and rewards

The Finale table retains `season_key` as immutable ownership provenance and adds
`competition_season_key` as the battle/reward period. Its primary key becomes
`(pet_id, competition_season_key)`. Requests carry both keys from the server
projection. Starting requires the current calendar quarter; every later turn,
retry and claim uses the exact saved pet, owner, source and competition tuple.
A failed previous-quarter battle can be retried, an unfinished battle resumed,
and a saved victory claimed alongside a separate current-quarter Finale.
None blocks starting the current quarter. Active battles and unclaimed victories
from every quarter still block pet deletion until recovery finishes.

The reward transaction rechecks the saved victory and intact ownership. Each row
has an immutable `reward_key`. Current rows use
`season-finale-quarter:<pet_id>:<competition_season_key>`; historical rows keep
`season-finale:<pet_id>:<ownership_season_key>` exactly. Interrupted payouts and
acknowledgments reuse that key, including rewards already present in the ledger.
There is no second reward for replaying a victory within one quarter.

Lifetime Pet XP remains assigned to the original pet. Account competition XP
stays in the Finale's saved competition quarter. Daily/weekly ranks use settlement
time and the existing account-wide daily Pet XP cap remains unchanged. A saved
Finale Victor achievement remains visible in Missions/Profile after rollover;
new quarters cannot relock an earned lifetime achievement.

## Migration and deployment

Migration `088_moonpet_finale_competition_quarters.sql` is required because the old
primary key and ownership foreign key permit only one Finale per pet lifetime.
It atomically rebuilds this leaf table, copying every historical field and row.
No pet ownership, receipt, reward history or balance is deleted or rewritten.
The original ownership foreign key remains enforced.

Existing victories derive their competition quarter from `defeated_at`, never
from a later claim/update timestamp. Existing unfinished/failed battles use their
last saved battle update, because the legacy table recorded no start timestamp.
If a legacy timestamp cannot be parsed, its source key stays as an explicit saved
recovery key. Legacy reward keys remain exact regardless of the derived quarter.

After approval and merge, apply the tracked pending migrations through Wrangler
from `workers/moonboys-api`:

```sh
npx wrangler d1 migrations list wikicoms --remote
npx wrangler d1 migrations apply wikicoms --remote
```

Review the pending list first; production should already have prerequisites
through 087. Do not rerun historical reset migrations or execute migration 088
outside the tracked migration process. The D1 production verification workflow,
verifier contract, evidence request and production manifest all require 088.
Then deploy the matching Worker and Mini App release using the normal provenance
runbook. Until migration 088 exists the new Finale projection explicitly reports
unavailable; stale clients missing the competition key must refresh.

No production migration or deployment was performed for this change.

## Validation

`node scripts/moonpet-completion-features.test.mjs` covers quarter-boundary
victory/payout interruption, next-quarter start, old claim after switching pets,
concurrent/duplicate claims, ownership and quarter tampering, old unfinished
battle retry, deletion blockers and migration retention of already-paid keys.
It also retains the prior build, combat, qualification and daily-completion tests.
`node scripts/moonpet-deletion.test.mjs` verifies archived ownership behavior;
`node scripts/verify-d1-production-migrations.test.mjs` checks every migration
registration surface. The PR records full Moonpet CI and browser-loop results.
