# MoonPet production projection timing

The ORD/IAD observations (1,844 versus 2,913 ms, both 84 D1 calls / 143 statements) do **not** establish a root cause. Equal counts can hide different per-call latency, SQL cost, scheduling and dependency waits. This change adds measurement, not gameplay or query optimisation.

## What is measured

One `moonpet_projection_trace` JSON console event per sampled, authenticated **full** projection (including `profile`, which returns complete state). Partial `core`, `live` and `missions` responses are not sampled. The existing `moonpet_state_timing` stage logs remain unchanged and share its random request ID. No account identifier, request body, SQL text, SQL parameters, rows, errors or tokens enter the new trace. `colo` is the request's Cloudflare colo, validated as three uppercase letters; otherwise `unknown`.

The trace contains bounded arrays (192 actual D1 submissions, 80 operation spans). Overflow is explicit; comparison keeps truncated requests in a separate cohort. It adds no SQL or database writes. Sampling is off by default, server controlled, at most 10%, and requires an expiry within the next hour. Expired, malformed or out-of-range settings disable it. Request parameters cannot enable it. There is no global mutable request state.

Operations cover initial economy/profile, identity/lifecycle, runtime, combat batch, roster, inventory reconciliation/inventory, equipment/materials, guidance, missions, season rewards, achievements, boss evidence, evolution, currency/economy, Journey, leaderboard, houses/furniture/garden, contracts, Daily Run context, notices, and final ownership/economy checks. Remaining inline work is labelled `projection`; shared batches retain statement counts for their contributing operation labels. Guards remain included in SQL counts.

Operation spans run from invocation to completion. Named dependency lists describe the awaited completion graph, not a proposed change in execution order. `presentation_join` identifies the last awaited presentation branches. Intervals show actual sequential versus overlapping execution. Calls are measured at the native binding boundary **after** ownership/read coalescing, not once per logical `.first()` call. Calls submitted inside a shared batch count once; per-operation `participating_calls` can overlap and must not be summed. `d1_calls` assigns a mixed batch to `shared_reads`; its SQL contributions remain separately attributed.

`guidance_join` measures the inner guidance barrier before its source verification. Ownership checks receive only an operation-labelled view of their original guarded database; their sticky scope, queries, results and failure checks remain intact. UUID-based sampling consumes no gameplay randomness.

`await_ms` measures binding invocation through promise resolution, including binding/network/backend/queue/retry and deserialization time. It cannot identify network transit alone. `sql_reported_ms` is recorded only when every statement in that call returns numeric D1 `meta.timings.sql_duration_ms` or `meta.duration`. It is **null/missing**, never zero, for unavailable metadata (notably `.first()` / `.raw()`). Batch SQL duration is a sum of returned statement durations, not another wall-clock interval. Local SQLite's fixture does not fabricate SQL timings.

`outside_any_d1_await_ms` is span wall time outside *all* observed D1 waits; it is **not Worker CPU**. It can include dependency, ownership-queue and scheduling waits. Workers clocks and concurrent tasks do not provide reliable per-operation CPU accounting here. Use Cloudflare's existing per-invocation CPU/wall metrics for CPU. Do not subtract SQL sums from overlapping wall intervals and call the remainder network time.

## Enable only after GK approves deployment

No configuration, secrets or production data were changed by this PR. No migration is required. First deploy the approved merged code using the existing provenance workflow:

```cmd
cd /d D:\GITHUB\Crypto-Moonboys.github.io
git switch main
git pull --ff-only origin main
npm ci
node scripts/deploy-worker-with-provenance.mjs moonboys-api
curl.exe -s https://moonboys-api.sercullen.workers.dev/deployment-info
git rev-parse HEAD
```

Verify the returned commit matches clean main, service `moonboys-api`, environment `production`. Do not deploy another Worker or apply migrations.

The following are **Windows CMD** commands. `secret put` updates the deployed Worker's settings/version: these commands are operational actions for GK to run after approval, not part of local validation. The two diagnostic values are not authentication secrets; storing them as Worker secrets preserves them across normal config-based deploys without editing Wrangler configuration. Set the expiry first, then enable the rate last.

```cmd
node -p "new Date(Date.now()+30*60*1000).toISOString()"
npx wrangler secret put MOONPET_PROJECTION_SAMPLE_UNTIL --config workers/moonboys-api/wrangler.toml
```

At the prompt, paste the UTC timestamp just printed. Then:

```cmd
npx wrangler secret put MOONPET_PROJECTION_SAMPLE_RATE --config workers/moonboys-api/wrangler.toml
```

At the prompt, enter `0.1` (10% maximum; use `0.01` for 1%). Sampling automatically stops at the timestamp. A timestamp more than one hour away also disables sampling.

## Collect and compare

In CMD, start the tail before loading MoonPet:

```cmd
cd /d D:\GITHUB\Crypto-Moonboys.github.io
npx wrangler tail moonboys-api --config workers/moonboys-api/wrangler.toml --format json --search moonpet_projection_trace > D:\moonpet-projection.jsonl
```

Use the authenticated game normally and capture multiple first/warm loads, not rapid refresh bursts that trigger rate limits. At 10% sampling, many requests legitimately produce no trace. Press **Ctrl+C** after collection. The search limits returned invocations; Wrangler envelopes can still contain their other existing stage/error logs and request metadata. Treat raw tail files as private operational files, do not commit/share them publicly. The comparison output contains only request-random IDs and diagnostic metrics.

```cmd
node scripts/moonpet-projection-compare.mjs D:\moonpet-projection.jsonl > D:\moonpet-projection-comparison.json
```

Multiple captures from the same deployed revision can be supplied as additional arguments. Pretty-printed Wrangler JSON, JSONL, and direct trace events are supported. Duplicate request IDs are counted once. Empty captures fail explicitly.

Disable immediately at any time:

```cmd
npx wrangler secret put MOONPET_PROJECTION_SAMPLE_RATE --config workers/moonboys-api/wrangler.toml
```

Enter `0`. Optionally remove both diagnostic settings later with `wrangler secret delete` after approval; expiry alone is sufficient to stop sampling. No browser/PC settings or player actions are needed to disable it.

## Read the results

Groups separate colo, outcome, actual D1 count, SQL count and truncation. Equal counts still do not prove identical state or SQL inputs. Compare like gameplay situations on the same deployment, and collect substantially more than two samples. p50/p95 use nearest rank; p95 of three samples is only the maximum, not a reliable production percentile.

`observed_critical_path_ms` is measured complete **projection wall time**, never the sum of overlapping spans. `observed_dependency_paths` walks the last finishing operation and last completed declared dependency backwards. `critical_path_tail_ms` attributes the observed post-dependency tails; uninstrumented gaps are reported as `unattributed_ms`. This is an observed completion chain, not a proof of the scheduler's theoretical critical path or causality within a module. The raw intervals remain the source for inspecting finer ordering.

For each operation, compare p50/p95 span duration, actual/participating calls, SQL counts, binding-await union, SQL-reported duration and timing coverage. Check `presentation_join_last_blockers` and `join_blocking_tail_ms`: a slow parallel branch that finishes well before the join is not holding up the response. The join-blocking tail is the latest dependency's completion minus the next latest; it is an observed exclusive tail, not the entire operation's removable cost. Final ownership/economy spans are mandatory sequential checks after the join.

Operation rows sort by p95 observed critical-path tail, then span duration. Each row states its sample count: operation percentiles are conditional on that operation being present. `sql_statements` attributes contributing statements; `submitted_sql_statements` counts statements in batches assigned to that row (including `shared_reads`). Do not sum both columns together. Shared batches can participate in several modules but the request totals count them once.

* Higher binding-await time at equal SQL-reported time and equal work suggests time outside reported SQL execution. It does not distinguish routing/network, D1 service queue/retries, serialization or binding overhead. Check Cloudflare metrics before attributing it to colo.
* Higher complete SQL-reported time for a repeatable batch justifies isolated reproduction and `EXPLAIN QUERY PLAN` for its existing query definitions. Never run profiling writes or EXPLAIN against production as part of these scripts.
* A later operation start with stable binding-await intervals points toward a dependency or scheduling delay. Follow the logged dependencies and first/last call intervals.
* A large `projection` or unattributed tail is evidence to add a targeted span next, not evidence to remove ownership/reward checks.

## Local reproduction and limits

Use the existing #1611 SQLite sandbox and an unchanged checkout at base `627ad040c8789faf0872ede2d687db048442dd30`:

```cmd
git clone --no-hardlinks D:\GITHUB\Crypto-Moonboys.github.io D:\workspace\moonpet-diagnostics-baseline
git -C D:\workspace\moonpet-diagnostics-baseline switch --detach 627ad040c8789faf0872ede2d687db048442dd30
node --test scripts/moonpet-projection-diagnostics.test.mjs
node scripts/moonpet-projection-validation.mjs D:\workspace\moonpet-diagnostics-baseline scripts/fixtures/moonpet-projection-diagnostics-latency.json
set MOONPET_PERF_PROJECTION_DIAGNOSTICS=1
set MOONPET_PERF_DELAY_MS=0
set MOONPET_PERF_SCENARIOS=zero,new,warm,three,heavy,archived,day_rollover,week_rollover,concurrent,failed,settled,history,equipped,activity,completed,month_rollover,quarter_rollover,lifetime_rollover,midnight_boundary,monday_boundary,journey_boundary,month_boundary,quarter_boundary
node scripts/moonpet-pr8-full-state-benchmark.mjs D:\workspace\moonpet-diagnostics-baseline scripts/fixtures/moonpet-projection-diagnostics-parity.json
set MOONPET_PERF_PROJECTION_DIAGNOSTICS=
set MOONPET_PERF_DELAY_MS=
set MOONPET_PERF_SCENARIOS=
node scripts/ci-domain-runner.mjs worker-api
```

The diagnostic fixture flag supplies the same bounded production settings and deterministic sampling, solely in the isolated signed HTTP fixture. It cannot enable production sampling. Validation alternates revision execution order, checks complete response and every application table hashes before/after retry, and checks identical D1/SQL counts across multiple uniform latency profiles with sampling enabled and disabled. Only expiring presentation challenge signatures are normalized, as in the existing parity harness. Reproduction JSON records source hashes and actual repetitions.

Sandbox evidence can prove correct grouping, batch counts, overlap, privacy, failure propagation, unchanged responses/persisted state and bounded overhead in the tested model. It cannot reproduce ORD/IAD routing, D1 server SQL timings/retries, real regional queueing or production CPU scheduling. No unexpectedly expensive **production** SQL has yet been identified, so there is no justified new query-plan optimisation in this PR. Existing isolated combat-plan/index regressions remain required. The production root cause remains **unestablished** until newly sampled traffic supports it.
