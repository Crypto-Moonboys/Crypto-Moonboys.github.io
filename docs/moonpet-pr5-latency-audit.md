# MoonPet Performance PR5 — diagnostic only

## Decision

No runtime optimisation is proposed. PR5 identifies measurement gaps and delivers a reproducible, complete local projection call ledger. **It does not fix production loading speed, reduce calls, or claim a speedup.** The current evidence rules out Worker CPU as the dominant cause but cannot separate production D1 SQL work from binding/network/queue wait. Blind batching, a placement change, or a query rewrite would not satisfy issue #1603's evidence requirement.

Baseline main and deployed commit: 82748b8755e8177c146bda5bacba6aa76e923e2a. No workers/, migrations, frontend, bot, Wiki, timeout or budget files change. Runtime source is byte-identical before/after.

## Verified production observations

The supplied post-PR4 capture contains one successful authenticated full-state invocation. Its private source file is retained outside the repository; only an allowlisted aggregate and its SHA-256 are committed in [production-summary.json](moonpet-pr5-production-summary.json).

| Measurement | Value |
| --- | ---: |
| Invocation wall time | 9,246 ms |
| Entire invocation Worker CPU | 110 ms |
| Application total stage | 9,215 ms |
| Full projection | 5,654 ms |
| Projection D1 calls / SQL statements | 100 / 157 |
| Recovery | 2,079 ms |
| D1 bootstrap | 1,242 ms |
| User bootstrap | 240 ms |
| Final ownership verification, nested in projection | 290 ms |
| Weekly Journey award recovery, nested in recovery | 165 ms |

The capture's request ingress is US / PDX. This is a remote canary population, not normal UK gameplay and not a verified Worker execution colo. Read-only Cloudflare settings confirm no configured placement override, traces disabled and D1 read replication disabled. Database metadata reports WEUR; a separate read-only schema catalog query was served by the WEUR primary in LHR. No settings or data were modified. The catalog query took 0.2846 ms SQL time and wrote zero rows; it is **not** a measurement of an application query or Worker binding network time.

Even if all 110 ms of invocation CPU belonged to projection, at least approximately 5,544 ms of that stage remains non-Worker-CPU time. CPU is therefore rejected as the dominant explanation for this sample. Non-CPU time can include SQL execution, D1 queuing, connection/routing, result transfer and waiting for other work. The 110 ms value is not a per-module CPU measurement. Do not divide 5,654 ms by 100 and call the result network latency: calls overlap and guards serialize only selected paths.

There are no per-call binding timings, per-query D1 SQL metadata or diagnostic-channel events in the supplied capture. Production SQL vs network attribution is **unresolved**. Regional amplification is a plausible hypothesis, strengthened by US ingress and a WEUR primary, but remains unconfirmed. There is no comparable UK request sample, controlled placement experiment or post-change production measurement.

## Complete local call ledger

[scripts/moonpet-pr5-latency-audit.mjs](../scripts/moonpet-pr5-latency-audit.mjs) records every native binding call in the projection span: index, query-family fingerprints, named module/preparer, statement count, start/end, elapsed time and outcome. It records actual synchronous SQLite execution intervals separately, then takes a read-only SQLite backup for EXPLAIN QUERY PLAN and seven repeated SELECT executions per family. The backup copies database pages but no connection-level JavaScript functions: all date functions on the benchmark connection are native built-ins. Explicit date-function 'now' arguments and CURRENT_TIMESTAMP keywords are replaced with frozen fixture-time literals. Quoted ordinary text and identifiers are preserved. Every native result set must deep-equal the original clock-shimmed result before it is timed. Parameters and SQL text stay inside the fixture process. Output contains no IDs, request data, results, credentials or raw queries. Plan details contain only static schema/index names. The ledger is bounded at 512 binding calls. It is not installed in the Worker and adds no production telemetry.

Query-family fingerprints hash whitespace-normalized SQL text only, never bound values. They identify SQL families, not duplicate logical reads: the same family may target three different pets or two different lobbies. Module attribution is taken from each prepared statement's source frame with a fixed classifier; all measured statements map to named modules. A family's plan row retains its first preparer; individual call rows retain every actual module/preparer.

| Module | SQL statements | Calls containing module |
| --- | ---: | ---: |
| verification | 3 | 3 |
| identity_lifecycle | 18 | 14 |
| gameplay | 33 | 32 |
| guidance | 19 | 12 |
| rewards | 5 | 3 |
| inventory_economy | 20 | 6 |
| leaderboard | 1 | 1 |
| notifications | 1 | 1 |
| roster | 18 | 18 |
| missions | 4 | 3 |
| cooldown_history | 1 | 1 |
| atomic_guard | 16 | 16 |
| journey_projection | 3 | 3 |
| live_systems | 9 | 4 |
| home | 5 | 5 |

SQL column sums to 156; the overlapping participation column must **not** be summed. Individual call records count each shared batch once and reconcile to exactly 100 calls. The fixture has one fewer SQL statement than production; the production capture does not identify the extra statement. This discrepancy is retained, not silently adjusted. The archived/history fixture has 96 calls / 152 statements due to its different lifecycle/progression path; it is not a competing before/after speed result.

### Sequential structure and repeated work

The source requires economy capture → selected profile/decay → first parallel module group → pending street events → Journey/hydrated match/Finale group → challenge signing and canonical identity → live systems → saved Home/contracts group → saved notices/run state → final source/period and economy verification. Some promises are started earlier and awaited later. Several helpers initialize or settle saved data, so they cannot be treated as pure reads without additional proof.

The local ledger records 16 guarded batches, sharing the sticky displayed-pet queue with isolated optional reads and ordered mutations. Its observed non-overlapping call depth is 36 in both fixtures. This is an interval-scheduling observation, **not a causal dependency DAG or a measured production critical path**. The ledger exposes the timings needed to inspect overlapping groups, and the source audit identifies required barriers; production chain latency remains unmeasured.

Repeated families include final economy capture (2), active-slot reads (3), active identity scope (2), four inventory reconciliation reads (2 each), arena expiry/player lookup (2 each), ownedPet/progression reads (3 per roster), and 16 atomic guards. Final snapshots are consistency barriers, roster calls bind different pets, arena lookups bind different lobbies, and reconciliation sits around mutation-capable work. None is proved to be redundant at the same authoritative point in this request. These remain unchanged.

## Query plans and representative history

The warm three-pet fixture uses the existing pinned state fixture. The history fixture adds archived-original pending rewards and 10,000 dated event rows (2,000 accepted, 8,000 rejected), using existing indexes and source-period rules. Recovery remains real and unchanged, outside the measured projection span. It uses three owned pets; it is not an empty/new-account-only benchmark.

All 106 read-family plans in each fixture are committed in [local-evidence.json](moonpet-pr5-local-evidence.json), alongside baseline and diagnostic-checkout runs, full call ledgers, module budgets, SQLite execution intervals and runtime hashes. Read-only production catalog inspection confirms the relevant event indexes exist, including user_day, user_week and user_type_status_created. No index was added and no migration is proposed.

The history fixture's slowest family is 216bdcdbc72900c4 (recent accepted cooldown history in projectPetMiniAppState): roughly 3.70 ms median using native date functions in the regenerated diagnostic run. The previous ~17.6 ms figure was contaminated by fixture JavaScript date callbacks and is withdrawn. Its plan uses idx_telegram_pet_events_user_type_status_created with only telegram_id constrained, co-routines and a temporary B-tree for the remaining ORDER BY terms. Mission/event and daily/weekly economy totals take roughly 1.22–1.25 ms each in this run. Their plans also select the owner/type/status index using only the owner prefix. These are credible local query-plan candidates, **not confirmed production hotspots**.

A future cooldown rewrite must preserve julianday timestamp ordering, string tie-breaks, invalid/legacy timestamp behavior, meal aliases and latest accepted evidence for every action. A forced day/week index must be compared on production-representative distributions and preserve historical periods. No rewrite or INDEXED BY hint is included solely because this fixture favors it.

| Local instrumented fixture | Baseline calls / SQL | Diagnostic calls / SQL | Baseline / diagnostic projection wall ms |
| --- | --- | --- | --- |
| three | 100 / 156 | 100 / 156 | 30.50 / 35.32 |
| history | 96 / 152 | 96 / 152 | 65.60 / 63.80 |

The projection wall/CPU, binding ledger and sqlite_execution_union_ms measurements above retain the deterministic fixture clock shim and include its JavaScript callback/nested SQLite overhead. They are labelled fixture_js_date_callbacks / includes_clock_shim_overhead in the evidence and must not be interpreted as native SQLite cost. They are single instrumented local runs, not production or simulated D1 network timings; no improvement is claimed. Only the separate query_benchmark/plans samples use the native_sqlite_frozen_literals connection. Seven samples per SELECT characterize warm native SQLite execution/materialization cost, excluding statement preparation. The local process CPU counter includes Node, SQLite, profiler hashing and GC and may include other native threads; it is not Worker CPU. Profiling overhead is included. Binding interval union avoids double-counting overlapping calls; summing call durations, nested stages or module participation is invalid. Local query-plan/runtime versions may differ from managed D1, and fixture cardinality/statistics do not establish production query cost.

## Reproduction and correctness

Check out baseline 82748b8755e8177c146bda5bacba6aa76e923e2a separately. Run from the PR checkout:

~~~sh
node scripts/moonpet-pr5-latency-audit.mjs /path/to/baseline three
node scripts/moonpet-pr5-latency-audit.mjs . three
node scripts/moonpet-pr5-latency-audit.mjs /path/to/baseline history
node scripts/moonpet-pr5-latency-audit.mjs . history
node --test scripts/moonpet-pr5-diagnostics.test.mjs
node scripts/ci-domain-runner.mjs worker-api
~~~

The current audit/seed harness drives both source roots. [parity-evidence.json](moonpet-pr5-parity-evidence.json) pins fixture SHA-256 values, the baseline commit and every first-response/before-retry and retry response/persisted-state hash. Eight identical-fixture comparisons cover zero pets, first load, returning one pet, three pets, archived original, historical pending rewards, UTC day and ownership-week changes. Every field and saved reward/ownership checkpoint matches; SQL/call counts are unchanged. Fixed application/SQLite time and deterministic randomness follow the existing fixture. Only signed challenge_token strings are normalized; all timestamps and derived age values are retained.

A regression overrides the source connection's julianday function with a throwing callback and verifies the backup still uses native julianday, preserves saved rows, exposes no custom date-function overrides, and rejects writes. A second regression checks frozen-time substitution leaves ordinary 'now' strings, comments, quoted keywords and column-based julianday inputs untouched. All 106 native SELECT result sets per fixture are compared with the deterministic original before benchmarking.

The diagnostic tests also reconcile all calls, statement families, module budgets and plans, enforce privacy exclusions and verify non-overlapping timing unions. Complete Worker/API CI includes existing fail-closed D1, missing/malformed optional data, cross-owner/account switching, in-flight pet switching, sticky stale scope, historical/pending/duplicate awards, concurrency and final economy verification tests. This PR does not replace or weaken any test or runtime protection.

## Next action and release hold

1. Collect matched UK gameplay and remote action-none canary samples on the same deployed commit, preserving request-local timing correlation. Use separate medians/ranges only after obtaining genuinely comparable samples.
2. Prepare a separately approved, bounded private diagnostic rollout recording all 100 native binding start/end intervals with static module/family IDs and available D1 meta.timings.sql_duration_ms, served_by_region/colo and metadata coverage. Preserve original methods and error semantics; do not replace .first() merely to obtain metadata. Explicitly mark metadata unavailable for methods that do not expose it. Never log SQL, parameters, credentials, headers, body or owner/pet IDs. Keep account/period/final economic barriers intact.
3. Compare the union of binding spans with whole-invocation CPU and per-query SQL coverage. Binding elapsed minus SQL execution is a wait/residual estimate, not pure network latency; account for queuing, transfer, retries and overlap. If regional wait dominates, evaluate a controlled placement experiment only after GK approval. If a query family dominates, benchmark a semantically equivalent rewrite with parity before proposing it.

This diagnostic PR requires no Worker deployment, migration, Pages deploy or VPS restart. It cannot produce new live measurements without a separately approved diagnostic/configuration change. For any later approved Worker release, deploy only moonboys-api through node scripts/deploy-worker-with-provenance.mjs moonboys-api, verify full deployed SHA and health, then run two signed action=none canaries and separate UK requests. No merge, deploy, migration, configuration change or production canary was performed here.

Primary documentation checked during audit: [D1 execution timing metadata](https://developers.cloudflare.com/api/resources/d1/), [Worker CPU vs wall time](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/), [Worker placement](https://developers.cloudflare.com/workers/configuration/placement/). SQL timing excludes network communication; default placement favors the incoming request region. These definitions support the measurement plan, not a claim that placement is the proved root cause.
