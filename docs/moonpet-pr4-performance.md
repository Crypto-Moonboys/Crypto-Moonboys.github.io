# MoonPet Performance PR4 — guarded projection read consolidation

Baseline: main 07c7d6cdf534ed606cf6118448ffc2114a4f3387 (merged PR #1600).

## Result and scope

Three-pet full projection: **115 → 100 D1 calls (13.0% fewer)**, **155 → 156 SQL statements**. One-pet projection: 107 → 92 calls, 147 → 148 statements. Every existing statement budget and the 15-second timeout are unchanged. Only worker.js runtime projection helpers change. No recovery query, economics, frontend, bot, Wiki, schema or migration changes.

The production baseline in issue #1601 is one 8,726 ms authenticated request, including a 5,389 ms projection and 115 binding calls. There are no post-PR4 production measurements. The sub-three-second target remains unverified.

## Audit and implementation

The request-local profiler records binding calls, submitted SQL statement counts, caller modules, binding elapsed time and separate builder/stage durations. It emits only allowlisted module labels and numeric counts/times, never SQL, arguments, results, Telegram IDs or pet IDs. Shared batches have a single call-group entry listing participating modules; do not credit that call separately to each module. Module statement counts and call-group totals reconcile exactly. Overlapping binding elapsed times are not additive wall-clock stages.

The baseline three-pet module statement budget is:

| Module | SQL statements |
| --- | ---: |
| Atomic ownership guards | 15 |
| Gameplay / saved activities / contracts / Journey projection | 29 |
| Identity / lifecycle / selected pet / equipment | 18 |
| Inventory and economy | 17 |
| Roster and permanent progression | 15 |
| Guidance / achievements / shop eligibility | 15 |
| Live systems | 6 |
| Home | 5 |
| Season and saved rewards | 5 |
| Missions / daily completion | 4 |
| Leaderboard | 1 |
| Economy snapshot and verification | 2 |
| Remaining projection reads and mutations | 23 |
| Total | 155 |

The redundant work demonstrated here is separate binding round trips for 16 independent presentation SELECTs: two mission evidence reads, three season reward reads, three weekly guidance reads and eight economy reads. Their SQL text, owner filters, accepted receipt/source predicates and result validators are unchanged. They now use the full projection's existing createDisplayedPetScope read queue. The initial eight join existing guarded reads; the eight economy reads share one additional batch and one atomic ownership assertion. Net reduction: 15 calls, plus one guard statement.

Helpers default to their original database outside full projection. Reconciliation, initialization, completion mutation, dependent reads/writes and final account/pet/period/economy verification keep their original handles and ordering. No cached data or snapshots are substituted. Optional Home modules retain singleReads and the same sticky changed flag; a switched-away-and-back scope remains invalid. Missing optional data cannot poison the mandatory group. The existing group cap of 16 SELECTs is unchanged.

## Reproducible parity and timing

Run from the PR checkout, with BASE pointing at a separate checkout of the exact baseline commit:

~~~sh
node scripts/moonpet-pr4-parity-case.mjs three "$BASE"
node scripts/moonpet-pr4-parity-case.mjs three .
node scripts/moonpet-pr4-module-profile.mjs "$BASE" three 10
node scripts/moonpet-pr4-module-profile.mjs . three 10
node --test scripts/moonpet-pr4-optimisation.test.mjs
node scripts/ci-domain-runner.mjs worker-api
~~~

Both runtimes load the identical PR fixture/runner version. The source-root argument selects runtime/schema fixture sources from the pinned revision; the shared performance and recovery seed harness lives in this PR. Exact SHA-256 hashes, Node version, raw per-stage samples and module budgets are in [moonpet-pr4-evidence.json](moonpet-pr4-evidence.json). Application and SQLite time is fixed to 2026-10-21T12:00:00.000Z before the first state warm-up. Randomness is deterministic for parity only. Only signed challenge_token strings are normalized; all timestamps and derived lifecycle values remain compared.

Eight cases (zero pets, first load, returning one-pet, three pets, historical pending recovery, archived original, UTC-day and ownership-week rollover) compare full first-response and persisted-state hashes **before retry**, then repeat both checkpoints after retry. Every checkpoint matches. Persistence includes original pet/roster, wallet, XP, Growth Marks, Crests, material balances, primary award ledgers, system events and daily/weekly receipts.

Five alternating baseline/optimized samples per fixture, real local SQLite plus an injected 10 ms per binding call:

| Fixture | Projection calls | Projection SQL | Projection median ms before/after | Builder median ms before/after |
| --- | --- | --- | --- | --- |
| Warm one pet | 107 / 92 | 147 / 148 | 511 / 514 | 826 / 831 |
| Warm three pets | 115 / 100 | 155 / 156 | 514 / 512 | 837 / 834 |
| Historical recovery-heavy | 107 / 92 | 147 / 148 | 514 / 517 | 2180 / 2180 |

**This parallel delay model shows no meaningful elapsed-time improvement.** The proven result is fewer binding round trips, not faster production loading. The model permits independent native calls to overlap and does not simulate D1's queue, routing or regional latency. Recovery-heavy total time includes real recovery SQL, with recovery unchanged. Do not add inclusive recovery/projection parent and child timing values together. Signed HTTP response timings are also recorded for every parity case; they include endpoint authentication and serialization, while the repeated table above measures the internal full builder.

## Regression and release

New tests cover all eight parity fixtures, all 16 newly grouped SELECTs under thrown, success:false and malformed D1 results, switching pets during the economy batch, and concurrently initiated historical recovery. A competing refresh may correctly fail final economic verification; retry must return canonical state, with no duplicate or reassigned awards. Existing performance/security suites cover optional table failure, malformed saved state, cross-owner/account switching, sticky switched-away-and-back scope, write barriers, bounded grouping and all current budgets. PR3 historical hashes remain pinned; only their expected counts are updated for the new reduction.

Validation status is reported in the PR conversation/checks. No merge, migration, deployment or production canary was performed.

After GK approval and merge only: check out latest main, install dependencies, run node scripts/deploy-worker-with-provenance.mjs moonboys-api. No D1 migration, Pages deployment or VPS restart. Verify /deployment-info reports the full merged SHA and /health succeeds. Run two signed action-none production canaries and compare private stage counts/durations; keep UK gameplay and remote canary populations separate. HOLD merge/deploy/canaries pending GK approval.
