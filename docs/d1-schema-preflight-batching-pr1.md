# PR1 — D1 schema-preflight batching (read-only optimisation)

## Scope

Reduce redundant D1 schema-discovery round trips in:
- `workers/moonboys-api/routes/daily-loop-state.js`
- `workers/moonboys-api/routes/daily-digest.js`

Do not alter game balance, MoonPet reward recovery, identity authority,
migration state, daily digest delivery, or persisted user data. Do not deploy
until reviews and tests pass.

## Cloudflare evidence that motivated this PR

During the 27 October – 3 November 2026 audit, the shared `wikicoms`
database's `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`
query pattern appeared roughly 25,253 times and scanned approximately 3.27
million rows. These are sampled query-analytics figures and include callers
outside this PR. They **do not** establish that every invocation of this query
originated in the two affected routes, nor do they establish a billable saving.

The primary high-row-read MoonPet runtime-recovery query is **not** changed in
PR1. Optimising it requires a separate correctness-controlled PR.

## Before/after statement-count contract

The numbers below count **SQL catalog statements at the schema preflight**,
not total Worker requests, total D1 statements, billable rows read, wall time
or CPU time. They are deterministically testable from the implementation.

| Route/guard | Before | After | Queries avoided |
|---|---:|---:|---:|
| One `/daily-loop/state` build, 15 distinct required tables | 15 | 1 | 14 |
| Daily digest player-state guard, 5 tables | 5 | 1 | 4 |
| Daily digest history guard, 3 tables | 3 | 1 | 2 |
| A route needing both digest guards | 8 | 2 | 6 |

The daily-loop previously checked tables independently per subsystem.
Now one batched `sqlite_master` query covers the **same** union of required
tables. Each subsystem still receives its own migration/live status based on
its original required-table list. A returned empty list cannot be interpreted
as success when tables are missing.

## Safety and compatibility

- No global caching. Every independent request probes the current D1 schema.
- Only validated, parameter-bound table names are queried.
- D1 `success:false`, rejected queries, malformed rows and invalid result
  shapes all fail closed.
- Daily-loop reports `query_failed` when the shared schema check cannot be
  trusted; it never marks subsystems live on an invalid result.
- Daily-digest retains HTTP 503 JSON error codes, migration-pending reason,
  `Retry-After: 60` and first missing table in the corresponding guard.
- No migration, SQL mutation, D1 reset, remote deployment or feature-flag
  change is required.

## Validation

Node >= 22.13:

```bat
node --test scripts/d1-schema-preflight-batching.test.mjs
node scripts/daily-loop-state-contract.test.mjs
node scripts/daily-loop-live-smoke.test.mjs
node scripts/telegram-daily-digest-and-missed-perks.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
```

The new tests run the shared schema helper against an actual in-memory SQLite
database (not just string assertions). They cover first missing table,
present tables, simultaneous table groups, two subsequent schema reads,
fail-closed D1 errors, untrusted results and invalid identifiers. The daily-loop
contract test asserts one schema query for all 15 required tables and that a
failed catalog read cannot expose a live subsystem.

## Post-deploy validation (not authorized by this PR)

Only after reviewed merge and controlled deployment, compare `wikicoms`
D1 query analytics for the targeted catalog-query shapes and correlated
`/daily-loop/state` endpoint request counts using a normalized time window.
Compare request distribution, missing-table responses, D1 rows read and
Worker CPU time. The historical ~25k catalog-query count cannot be interpreted
as savings without a post-deployment comparison because other routes still
perform schema checks.

**Do not interpret an optimisation PR as authorization to merge, deploy,
reset, or disable any existing reward or payout safeguards.**
