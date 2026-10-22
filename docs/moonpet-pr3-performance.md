# MoonPet PR3 — measured projection and weekly recovery optimisation

Issue #1599. Baseline main: `0ef7b80ec3f07043d02f435527e98943f1764ec6`.
No migration, balance/rule change, timeout increase, merge or production deployment.

## Source changes and safety

- Full projection's five mandatory gear/material/recent-action/combat-result
  SELECTs use the existing displayed-pet scope. The six independent live-system
  presentation reads use that scope through an explicit optional parameter;
  live authority resolution and progression initialization keep their original
  database, writes and ordering. Legacy callers retain the original interface.
- The scope still batches at most 16 plain SELECTs with its atomic ownership
  assertion. Mutations and explicit batches remain barriers. Optional Home
  modules remain on singleReads; the relic vault retains its independent failure
  fallback. Final account, selected-pet, economic and source-period checks remain.
- Journey summary shares one verified weekly objective projection for its count
  and list. There is no cross-request cache or reuse across a settlement write.
- Weekly recovery's source-readiness predicate depends on owner/pet/season/week,
  never on the current objective or source row. It is moved from the inner WHERE
  to the period GROUP BY HAVING, before cursor ordering and LIMIT. The owner is
  carried through the derived objective groups. Accepted source joins, objective
  targets, distinct check-in days, receipts, exact historical source proof,
  ownership week expressions, cursor compare-and-swap and finalization are
  unchanged. Daily recovery uses the same query structure with no weekly predicate.
- Batched malformed-read fault injection now returns the injected result to its
  consumer while executing the original batch/guard, rather than silently
  ignoring overrides. This fixes test fidelity, not runtime error handling.
- Projection catches normalize a stale displayed-pet assertion to the existing
  pet_state_source_changed error. Sticky scope failure and failed reads still reject.

## Measurements (local, not Cloudflare production)

Raw data, stage timings, complete EXPLAIN QUERY PLAN output, per-caller statement
attribution and parity hashes are in [the evidence report](moonpet-pr3-evidence.json).
No raw production account data or credentials were used.

| Fixture / path | SQL before → after | D1 calls before → after | Modelled total ms before → after |
| --- | --- | --- | --- |
| warm / builder | 167 → 167 | 138 → 127 | 836 → 822 |
| three_pets / builder | 175 → 175 | 146 → 135 | 829 → 823 |
| recovery / builder | 264 → 264 | 190 → 179 | 1624 → 1625 |
| core / builder | 42 → 42 | 33 → 33 | 347 → 345 |
| warm / authenticated_http | 168 → 168 | 139 → 128 | 878 → 868 |
| three_pets / authenticated_http | 176 → 176 | 147 → 136 | 839 → 838 |
| recovery / authenticated_http | 265 → 265 | 191 → 180 | 1652 → 1654 |
| core / authenticated_http | 43 → 43 | 34 → 34 | 360 → 358 |

Three-pet projection alone: **155 statements / 126 calls → 155 / 115**.
The production trace supplied by GK had 156 / 126; fixture and production SQL
counts are different and are not presented as the same dataset. One duplicate
objective read disappears and one additional guard preserves batch ownership,
so statement totals stay unchanged. All existing statement budgets are unchanged.
The eleven-call saving is reproducible; the injected independent 10ms/call model
shows no material total-time improvement and is not evidence of live latency.

Weekly award query, identical three-pet / twelve-week dataset: 504 accepted
source events, 3 incomplete reconstruction periods, 33 eligible pet/week scopes.
One warm-up then three timed executions, with all 33 candidate rows compared
(the benchmark expands only the read's test LIMIT; runtime limits are unchanged).
Median execution **2938 ms → 193 ms**;
identical result hash, including cursor values. Both versions remain one D1 call.
The old plan places the expensive correlated history scan before objective
GROUP BY; the new plan places it after the period GROUP BY. Both use the existing
source-event, pet/day, objective-source, receipt-week and ownership-tuple indexes.
No new index is proposed or required. Local SQL execution improvement is about
93%; Cloudflare query CPU/network differences remain unmeasured.

## Parity and regression coverage

Seven separate-process before/after cases pass: first adopted load, warm,
three-pet, qualifying daily+weekly+historical boss recovery, archived original with
another selected pet, UTC-day rollover and ownership-week rollover. Fixed application
and SQLite time and deterministic randomness make business results comparable.
Full response and stored owner/pet/period/reward/material/wallet hashes match
separately at two checkpoints: immediately after the first request, before any
retry, and again after the retry. All business-relevant seed timestamps are
pinned before warm-up, so lifecycle age and ownership calculations cannot depend
on the host date. Only signed presentation challenge strings are normalized;
all timestamps, response keys, earned dates, lifecycle age and attribution remain.
Baseline hashes and expanded pre-PR3 SQL are pinned as test fixtures with provenance.

Candidate-query parity also checks cursor rotation/limits, archived instances,
rejected sources, pending earlier evidence and accepted settlements. Existing
Worker/API suites cover authentication, account/pet switching, concurrency,
legacy quarters, daily/weekly rollover, duplicate/rejected/pending settlements,
reward retries and missing optional tables. No claims are made from an empty
award queue: the heavy/archived HTTP cases actually mint marks/crests and finish
boss progression, then compare saved records after retries.

Validation:
- Complete `npm run ci:worker-api` equivalent `node scripts/ci-domain-runner.mjs worker-api`: passed locally (all commands through moonpet-beta-xp-quarantine).
- `node --test scripts/moonpet-pr3-optimisation.test.mjs`: 11 passed.
- Existing profiling/performance: 19 passed; combat integrity: 33 passed;
  independent Community boundary suite: 35 passed.
- Changed runtime JS syntax and `git diff --check`: passed.
- Latest-head GitHub CI and Codex review are required before merge.

## Reproduction

Use Node 22+ and installed dependencies. Archive baseline main into a separate
checkout and make its node_modules available. From this PR's checkout:

```powershell
$env:MOONPET_PERF_SOURCE_ROOT = 'ABSOLUTE_BASELINE_CHECKOUT'
node scripts/moonpet-state-performance-benchmark.mjs
node scripts/moonpet-pr3-query-benchmark.mjs
node scripts/moonpet-pr3-call-profile.mjs
node scripts/moonpet-pr3-parity-case.mjs heavy
Remove-Item Env:MOONPET_PERF_SOURCE_ROOT
node scripts/moonpet-state-performance-benchmark.mjs
node scripts/moonpet-pr3-query-benchmark.mjs
node scripts/moonpet-pr3-call-profile.mjs
node scripts/moonpet-pr3-parity-case.mjs heavy
node --test scripts/moonpet-pr3-optimisation.test.mjs
npm run ci:worker-api
```

Parity cases: new, warm, three, heavy, archived, day_rollover, week_rollover.
The comparison script emits only synthetic fixtures. Production diagnostics must
remain private. The state benchmark uses a modelled 10ms binding-call delay;
query benchmark timings have no injected delay.

## Release hold and remaining limits

GK approval is required for merge and deployment. Deploy only moonboys-api with
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`. Verify deployed
full commit, then run two authenticated production canaries with action none and
compare private sibling-stage timings (never sum inclusive parent/child spans).
No VPS restart or Pages deployment is needed. Reliable sub-three-second normal
loading is an unverified target, not a claim. The canary account's large history
must be assessed separately from normal accounts after approved deployment.

Current Cloudflare D1 batching semantics were checked against the official
[D1 Database documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Review corrections

The original parity checks covered only the retry and could inherit a wall-clock
lifecycle creation date. Both gaps are fixed: all six seeded authority tables
have fixed creation/update/decay timestamps before warm-up, and snapshots are
captured before retry as well as afterwards. Baseline hashes were regenerated
from commit 0ef7b80ec with the same setup. The combined new optimisation and
existing profiling/performance suite passes 30 tests. Runtime code is unchanged.
