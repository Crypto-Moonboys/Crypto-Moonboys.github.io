# MoonPet authenticated state performance — 2026-10-21

## Findings and scope

The reported production timeout and subsequent 9.5–10 second response have not
been reproduced against production here. This PR establishes private stage
timings and removes two confirmed sources of unnecessary D1 work. It does not
establish that production responses are below three seconds.

The complete POST `/telegram-pets/app/state` path is:

1. Parse the POST body, enforce the existing IP rate limit, authenticate the
   Mini App signature or website credential, then enforce the actor rate limit.
2. Upsert the authenticated Telegram user using the existing error handling.
3. Bootstrap D1 state: current season, selected pet and account-wallet authority.
4. For full, Profile and Missions state, run the existing ordered recovery:
   standard runs; daily endings and their weekly evidence; equipment; live
   endings; combat; runtime awards; weekly bosses; journey awards. Core and live
   modes retain their existing narrower work and do not acquire full recovery.
5. Project the selected pet, roster, lifetime progression and requested modules.
   Verify the selected-pet authority, projection periods and economic snapshot
   before publishing state.
6. Serialize the same response contract.

Bootstrap and recovery remain sequential where they depend on prior writes.
Warm recovery is not skipped: an apparently idle account can still have saved
reward evidence. No cache, polling loop, client timeout change, schema change or
new index is introduced.

## Confirmed avoidable work

`createDisplayedPetScope` previously queued every read with its own atomic
ownership assertion, including independent reads started together. The state
projection scopes now opt in to grouping adjacent plain SELECT reads, up to 16
per D1 batch. One assertion guards the whole transaction. Explicit batches,
mutations, RETURNING statements, CTEs and legacy callers retain their original
boundaries. A failed D1 result rejects every consumer in its group. Ownership
failure remains sticky and prevents later mutations even if the pointer switches
back. Optional Home modules keep separate read transactions on the same scope
queue, so a missing optional table cannot abort mandatory grouped reads.

`evaluatePetSeasonCompletion` previously made six separate evidence reads per
pet: growth marks, crests, current crest, completion, final evolution and current
evolution. One owner/pet/quarter-scoped query now projects these together and
reuses that snapshot for lifecycle progress. Completion existence is checked
separately from its timestamp, preserving rows with a null timestamp. The
award criteria, recovery limits, writes and idempotency checks are unchanged.

## Timing events

Each request emits `moonpet_state_timing` JSON events with exactly:

- `event`, a fresh random `request_id`, and an allowlisted `mode`;
- an allowlisted `stage`, `outcome` and `duration_ms`.

Stages cover request parsing, rate limiting, authentication, user bootstrap,
D1 bootstrap, recovery, daily settlement, weekly settlement, projection,
ownership verification, serialization and total. Settlement spans are inside
recovery; ownership verification is inside projection. These are inclusive spans
and must not be added together. Only stages the selected mode executes appear.
`failed` means the measured function threw; existing swallowed recovery errors
retain their original behavior and are not reclassified as a failed response.

Events contain no Telegram IDs, pet IDs, credentials, account details, SQL or raw
errors. The request ID is unrelated to saved player data. Failure to emit a
log cannot fail a successful state load. Existing unrelated diagnostic events
are outside this timing schema. The state route's previous raw account/error
log is replaced by the fixed `state_unavailable` category.

## Reproducible comparison

Baseline commit `3edeccdad` contains instrumentation and the original D1 work.
Both source revisions run through the same SQLite fixture at fixed application
and SQLite time, 2026-10-21 12:00 UTC. Each scenario is warmed first. Recovery
seeds five accepted care receipts, then measures the recovery refresh. Three-pet
fixtures retain three independently owned slots. Each D1 call or batch has an
injected 10 ms delay. This is an optimistic round-trip model, not a Cloudflare
latency measurement; SQL CPU, timers and local scheduling affect the result.

Representative single-run results (milliseconds are rounded):

| Path/scenario | Statements before → after | D1 calls before → after | Elapsed ms before → after |
| --- | --- | --- | --- |
| Builder / warm | 177 → 167 | 148 → 138 | 629 → 568 |
| Builder / three pets | 195 → 175 | 166 → 146 | 622 → 565 |
| Builder / recovery | 274 → 264 | 200 → 190 | 1175 → 1113 |
| Builder / core | 42 → 42 | 33 → 33 | 231 → 229 |
| Authenticated HTTP / warm | 178 → 168 | 149 → 139 | 670 → 612 |
| Authenticated HTTP / three pets | 196 → 176 | 167 → 147 | 629 → 586 |
| Authenticated HTTP / recovery | 275 → 265 | 201 → 191 | 1176 → 1132 |
| Authenticated HTTP / core | 43 → 43 | 34 → 34 | 238 → 240 |

HTTP includes signed Mini App authentication, rate limits, user upsert and JSON
serialization. Its outer elapsed time includes Request setup; the structured
`total` starts inside the Worker route. Builder counts match the existing
statement-budget fixture boundary. The HTTP path adds the existing user upsert.
The unchanged budgets are core 45, live 20, Missions 88, warm 180, recovery 600;
the production timeout remains 15,000 ms.

Selected builder stages show where the reduction occurs:

| Scenario/stage | Statements before → after | Calls before → after | Stage ms before → after |
| --- | --- | --- | --- |
| Warm / D1 bootstrap | 7 → 7 | 7 → 7 | 71 → 72 |
| Warm / recovery | 13 → 13 | 13 → 13 | 147 → 143 |
| Warm / daily settlement | 2 → 2 | 2 → 2 | 22 → 22 |
| Warm / weekly settlement | 4 → 4 | 4 → 4 | 47 → 45 |
| Warm / projection | 157 → 147 | 128 → 118 | 411 → 353 |
| Three pets / projection | 175 → 155 | 146 → 126 | 408 → 350 |
| Recovery / recovery | 110 → 110 | 65 → 65 | 693 → 691 |
| Recovery / projection | 157 → 147 | 128 → 118 | 411 → 350 |

To reproduce from the PR checkout (Node 22+):

```sh
npm ci
mkdir -p /tmp/moonpet-performance-baseline
git archive 3edeccdad workers/moonboys-api scripts/moonpet-audit-regression-fixture.mjs scripts/moonpet-mini-app-action-fixture.mjs package.json | tar -x -C /tmp/moonpet-performance-baseline
ln -s "$PWD/node_modules" /tmp/moonpet-performance-baseline/node_modules
MOONPET_PERF_SOURCE_ROOT=/tmp/moonpet-performance-baseline node scripts/moonpet-state-performance-benchmark.mjs > /tmp/moonpet-before.json
node scripts/moonpet-state-performance-benchmark.mjs > /tmp/moonpet-after.json
node --test scripts/moonpet-state-performance.test.mjs
npm run ci:worker-api
```

`MOONPET_PERF_DELAY_MS=0` removes the latency model (or choose 0–100 ms).
The JSON reports stage timings, statements, calls and ownership assertions;
it never exports saved state or signed request bodies. The baseline commit must
remain reachable for this exact comparison; if squash merged, archive it before
pruning the PR branch, or use the equivalent commit from the PR history.

## Release and production verification

Worker deploy required: **Yes**. D1 migration required: **No**. VPS restart
required: **No**. This PR must not merge or deploy automatically.

After GK approves merge and deployment, deploy only `moonboys-api` from the
approved revision using the existing provenance wrapper:

```sh
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Do not rerun migrations. In the existing manual **Moonpet Production Canary**
workflow, supply the full deployed commit, leave action `none`, and run twice
using the configured dedicated test account and existing secured credentials.
State reads can perform normal recovery, so this requires release approval.
Confirm the deployed provenance and both canary results. Collect only the
allowlisted timing events for fresh authenticated loads and compare warm and
recovery stage durations. Verify normal loads on a three-pet account and
account/pet switching without publishing their identifiers.

The two production canaries and the sub-three-second target remain unverified
until that approved deployment. If bootstrap/recovery or D1 execution dominates
production despite these read savings, retain its dependency order and use the
new stage evidence to scope a separate fix. Fixture gains alone do not explain
or resolve the reported production latency.
