# MoonPet: remaining recovery and projection work

Base: `ec4eb9879e89c8728c9b1bba3a51079392c6f632` (merged #1644). Measured runtime: `37ec3810c9e26791b406be3cedb12923146f1396`; the evidence files also record SHA-256 for every changed runtime source. No production requests, data changes, migrations, resets or deployment were performed.

## Result and limits

At 100 ms simulated D1 latency, normal warm, settled, equipped and three-pet complete signed responses are below three seconds. At 150 ms, an equipped account improves **4.934 → 3.518 seconds**: the three-second target is **not met** at that latency. These controlled sandbox results are not production timings or a prediction that production is already below three seconds.

GK's production baseline after #1644 (two requests, uncontrolled averages) remains a separate observation: total 4,968 ms, recovery 1,700 ms, projection 2,864 ms, bootstrap 137 ms, projection 96 calls / 149 SQL. The tables below label complete-request counts separately from projection counts.

## Confirmed unnecessary work removed

1. **Equipment backfill on every equipped refresh.** The old presence probe treated any saved equipment/purchase as pending repair. The probe now uses the same catalog and owned pet/season tuples as recovery, then anti-joins existing equipment rows. Only missing rows can consume `INSERT OR IGNORE`; existing level, XP and mastery remain authoritative. Archived and unscoped historical purchases still repair. The fixed catalog and materialized owner-scoped CTE scans are bounded; application-table reads retain owner/pet indexes.
2. **Four-statement legacy item reconciliation with no consumer.** Full-state inventory reconciliation now proves whether a recognized legacy item delta or a checkpoint exists. When neither exists, its four mutation statements are omitted. Positive, negative and already-checkpointed historical sources retain the original transactional delta bridge. This runs after the economy snapshot and keeps final source/economy validation.
3. **Combat expiry and lookup waterfall.** Full state previously issued expiry writes, lobby reads, solo fallback writes/reads and separate queue-position reads. One guarded transaction now executes five required expiry statements and six reads. The second Arena expiry is redundant because the first lobby/player predicate already includes the solo player's battles. Priority between lobby/player and solo matches is preserved. Kaiju solo expiry remains conditional on actually needing its fallback. Locked decisions are never expired. Queue positions are correlated reads in that same snapshot. Action, matchmaking and live-poll helpers remain unchanged.
4. **Three sequential Journey queue reads on settled accounts.** Source, Daily award and Weekly award candidates now share one read transaction. No thresholds, source proofs, historical period formulas, limits, cursors or settlement functions changed. A source visit discards speculative award candidates and re-reads after repair. A Daily candidate similarly forces a fresh Weekly read. Empty snapshots perform no award or cursor writes; accepted evidence and interrupted settlement remain eligible on later refreshes.
5. **Independent projections waiting on unrelated work.** Economy/profile reads start together; identity-dependent economy/evolution projection starts before the rest of guidance finishes. Daily Run summary and notice projection start once their actual guidance dependencies are ready. Reservation repair still precedes Daily summary repair. Independent Daily/Weekly summary and lifecycle evidence reads overlap. Every branch is awaited before the complete authoritative response, including failed siblings that may have started writes.

Combat owns a separate request-local scope with the same atomic displayed-pet guard. Its expiry transaction cannot put unrelated identity reads behind a mutation barrier. Final source, period, ownership and economic checks remain in place. There is no cross-request cache, durable 'already settled' flag, new Worker or partial-response shortcut.

## Before and after: 100 ms per D1 call

| Account | First signed response, before → after (ms) | Retry, before → after (ms) | Complete D1 calls / SQL, before → after |
| --- | ---: | ---: | --- |
| zero | 1,697 → 1,580 | 1,665 → 1,555 | 16/17 → 16/17 |
| new | 4,239 → 3,570 | 2,894 → 2,224 | 104/158 → 92/152 |
| warm | 2,910 → 2,248 | 2,896 → 2,215 | 92/145 → 80/139 |
| settled | 3,332 → 2,457 | 3,319 → 2,435 | 96/149 → 82/143 |
| equipped | 3,452 → 2,468 | 3,425 → 2,452 | 97/150 → 82/143 |
| three | 3,149 → 2,464 | 3,132 → 2,447 | 100/153 → 88/147 |
| heavy | 13,136 → 12,486 | 3,453 → 2,565 | 184/280 → 172/276 |
| activity | 9,049 → 8,496 | 3,310 → 2,436 | 148/246 → 136/242 |
| completed | 3,456 → 2,566 | 3,419 → 2,538 | 97/150 → 83/144 |
| history | 4,059 → 3,177 | 4,025 → 3,140 | 96/149 → 82/143 |

Counts include authenticated user bootstrap, preparation, recovery and projection. The first column is the first timed authenticated refresh after the scenario setup; `new` includes first initialization and `zero` has no adopted pet. `warm` has no accepted activity, `settled` has repaired activity, `equipped` has six saved gear slots plus repaired activity, `completed` has settled Daily/Weekly/boss evidence, `history` has 1,000 accepted events already fully settled before timing. `heavy` and `activity` genuinely need repair on the first measured request.

| Equipped account at 100 ms/call | Before | After |
| --- | ---: | ---: |
| d1_bootstrap (ms) | 112.23 | 110.41 |
| state_recovery (ms) | 667.77 | 339.73 |
| pet_state_projection (ms) | 2,525.30 | 1,880.10 |
| ownership_verification (ms) | 218.79 | 219.14 |
| projection d1_calls | 88 | 76 |
| projection sql_statements | 141 | 135 |

`ownership_verification` is nested inside projection, not an additional stage to add to the total. Full-response timings include signed request parsing/authentication through `response.json()`, not just Home display or a response header.

## Latency sensitivity: 150 ms per D1 call

| Account | First signed response, before → after (ms) | Retry, before → after (ms) | Complete D1 calls / SQL, before → after |
| --- | ---: | ---: | --- |
| settled | 4,765 → 3,500 | 4,733 → 3,468 | 96/149 → 82/143 |
| equipped | 4,934 → 3,518 | 4,951 → 3,486 | 97/150 → 82/143 |
| three | 4,473 → 3,520 | 4,455 → 3,504 | 100/153 → 88/147 |

Three alternating baseline/changed pairs per scenario, isolated Node processes, identical real SQLite data, pinned Node/SQLite clock, deterministic randomness, and serialized simulated write round trips. Independent reads may overlap network delay; actual SQLite statements still execute synchronously. Each fixture setup settles its designated history with zero injected delay, then restores the requested latency for timed HTTP requests. Every timed pair asserts response and saved-state hashes before and after retry. Raw files retain every repetition and min/median/max; no favourable sample is selected.

## SQL and remaining bottlenecks

The SQL evidence file contains EXPLAIN QUERY PLAN output for presence, inventory, Journey candidates and combat reads. Owner/pet lookups use existing indexes; no migration is introduced. Candidate aggregation retains required grouping/sorting and correlated source proofs. Four inherited combat expiry updates still scan active/waiting partial indexes under the original lobby/player rules; the six presentation SELECTs use chat/player indexes. Their expiry scope and locked-decision exceptions are retained. The Weekly candidate-only microbenchmark uses three pets, twelve ownership weeks, 504 accepted sources and three incomplete periods; its candidate parity digest remains recorded.

For the 1,000-event fixture with zero injected latency, measured SQL execution totals are **735.13 → 744.32 ms** (three repetitions). This is not a SQL CPU speedup. It includes the fixture's JavaScript-backed pinned-date SQL functions and excludes injected latency; it is not Cloudflare's server SQL duration. The measured end-to-end gain comes from omitted no-op mutations and a shorter D1 dependency path.

At higher RTT the remaining identity/lifecycle, guidance/achievement, roster/lifetime and final source/economy authority reads still block a complete response. The large history case also retains eligibility scans. The first recovery-heavy response must execute its genuine saved rewards and original-pet settlement; it remains much slower than a settled retry. Removing these checks without equivalent authority would risk saved progress. No timeout, D1 budget, economic rule or reset boundary has been changed to hide that cost.

## Time and reward audit

| System | Authority retained |
| --- | --- |
| Daily missions, Daily Run, care and cache | UTC day; accepted source and original day receipts |
| Weekly competitions and boss rotation | Monday UTC calendar week; original saved victory date |
| Weekly Journey | Each pet's own seven-day ownership period; historical legacy-quarter formulas unchanged |
| Monthly competition | Existing calendar-month evidence boundaries; no new cache or settlement shortcut |
| Seasonal competitions and raids | Existing quarter/season instance; no rewards reassigned to the refresh quarter |
| Lifetime marks, Crests, evolution, ownership | Permanent source pet and ownership season; no quarter reset or replacement pet transfer |

Historical beta branches with valid unpaid consumers remain: source-bound run endings/records, runtime awards, Weekly boss follow-up, Daily/Weekly award completion and legacy inventory deltas/checkpoints. Unnecessary executions with no possible consumer are skipped; no valid saved beta liability is deleted or reset.

## Reproduction and regression evidence

Use the existing sandbox introduced in #1611 and its `performanceFixture`; no remote D1 binding is used. Install repository dependencies in isolated checkouts. Baseline is the base SHA above. On Windows CMD, from the changed sandbox checkout:

```bat
set MOONPET_PERF_DELAY_MS=100
set MOONPET_PERF_SCENARIOS=zero,new,warm,settled,equipped,three,heavy,activity,completed,history
set MOONPET_PERF_CHANGED_REVISION=37ec3810c9e26791b406be3cedb12923146f1396
node scripts/moonpet-pr8-full-state-benchmark.mjs D:\workspace\moonpet-recovery-projection-base performance.json
```

Repeat with `MOONPET_PERF_DELAY_MS=150` and scenarios `settled,equipped,three`. For SQL/plan evidence, run `node scripts/moonpet-recovery-projection-audit.mjs history BASELINE_ROOT before-sql.json` and again with `CHANGED_ROOT`. Set its delay to `0` to isolate local execution.

Complete parity: **23 scenarios × three pairs** against unchanged latest main, retaining all original fourteen scenarios. Every first/retry response and every application table is hashed; only signed presentation challenge tokens are normalized. Added scenarios cover settled history, equipment, completed progression and exact midnight/Monday/individual-Journey/month/quarter boundaries. Lifetime rollover and concurrent/failed requests remain covered.

Twenty-one new regressions cover combined combat projection, TTL/locked inputs, lobby/fallback priority, claimed queues, thrown/resolved/malformed D1 failures, concurrent pet switch, legacy inventory deltas/checkpoints, missing equipment repair with preserved XP/mastery, settled Journey transactions, independent lifecycle reads and reset boundaries. The original thirteen beta regressions remain. Read-batch support was corrected in two legacy test adapters; fault injectors follow the combined combat queries. Existing reward/fairness/duplicate/concurrency assertions and frozen parity hashes were retained.

Local validation: full Worker/API 168/168 commands, full Visual 38/38 commands, and 21 new regressions passed. The original 13 beta regressions and 23-scenario signed parity passed. The burst and 40-minute-session stress runs each sent 1,000 signed replays and kept progression unchanged. Latest-head hosted CI and Codex review results are recorded in the PR; neither is claimed passed until its result is verified. No new heavyweight workflow or unrelated frontend check was added; one focused regression command joins the existing Worker/API group.

Evidence files:

- `scripts/fixtures/moonpet-recovery-projection-performance.json`
- `scripts/fixtures/moonpet-recovery-projection-latency-150.json`
- `scripts/fixtures/moonpet-recovery-projection-parity.json`
- `scripts/fixtures/moonpet-recovery-projection-sql.json`

## Deployment after GK approval and merge

Run manually from a clean main checkout, using the existing provenance script:

```bat
cd /d D:\GITHUB\Crypto-Moonboys.github.io
git switch main
git pull --ff-only origin main
npm ci
node scripts/deploy-worker-with-provenance.mjs moonboys-api
git rev-parse HEAD
curl.exe -s https://moonboys-api.sercullen.workers.dev/deployment-info
```

The returned service must be `moonboys-api`, its commit must equal the clean main SHA, and its environment must be `production`. The existing script performs read-only migration/secret-presence checks and tags the deployment with that commit. This PR needs no new D1 migration or Cloudflare configuration change. Deploy only `moonboys-api`; the other Workers are unchanged.

Then collect a fresh timing capture using the existing tail workflow while GK opens and consumes complete signed full states for the same established account. Compare `total`, `state_recovery`, `pet_state_projection` and D1/SQL counts over multiple requests; keep those production results separate from this simulation. Check saved XP/currencies, permanent roster, completion ticks, pending recovery and duplicate retry behaviour. Nothing has been deployed automatically.
