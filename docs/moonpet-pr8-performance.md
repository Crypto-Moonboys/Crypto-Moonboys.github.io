# MoonPet PR8: complete full-state response latency

Issue #1609. Baseline: main after #1608, `9a165e6101deb82607696cd824a3d3c18ec6e437`.

## Runtime change and dependency proof

The full-state Worker still completes bootstrap, all bounded recovery passes, the entire projection, and final ownership/economy verification before returning. Its route, response fields, recovery limits, reward values and database schema are unchanged.

Previously the projection waited for the slowest guidance query before starting journey and live systems, then waited for live systems before starting contracts and appearance. PR8 starts read-only style, house, furniture, garden and contract projections alongside guidance. The journey branch starts when its authoritative roster is available. Live systems start when shared identity, runtime, gear and materials are available; their calculations use the same serialized pet XP, wallet, energy and immutable owner/pet/season tuple. Display names do not affect live-system calculations.

Live-system ownership verification still completes before its owned-source queries start. Progression initialization remains awaited and fail-closed, but queries for chains, bosses, cosmetics, faction and events run alongside it: none reads the progression table being initialized. Guarded read transactions still validate the selected pet, and the existing scope barriers still drain reads before scoped mutations. Optional appearance failures stay isolated. No query crosses the authoritative recovery barrier.

Daily reservation/room repair still follows guidance's active-run authority. The reservation is read before Daily summary repair, saved room outcomes are retained, and missing rooms are restored from their original seed. Kaiju category repair, notices and final source/economy assertions remain awaited. Recovery writes remain ordered: run terminals can create weekly evidence, combat creates runtime awards, and weekly boss settlement creates journey evidence. Parallelizing those dependent writes would change what a single full response recovers.

## Reproduce

Use Node 24 with repository dependencies installed. Keep an immutable baseline checkout and invoke the **changed checkout's harness** for both revisions:

```sh
git worktree add --detach ../moonpet-pr8-baseline 9a165e6101deb82607696cd824a3d3c18ec6e437
# Install/link the same node_modules in that checkout.
node scripts/moonpet-pr8-full-state-benchmark.mjs ../moonpet-pr8-baseline scripts/fixtures/moonpet-pr8-full-state-results.json
```

The default model adds 100 ms to every D1 binding call. Writes, including writes executed through first()/all() or a mixed batch, occupy one serialized queue slot for their **whole** injected latency and execution. Read-only binding waits may overlap. Each fixture owns its queue; neither revision receives overlapping serialized writes. This is a controlled latency model over real local SQLite, not Cloudflare production, UK player latency, TCP transit or a production median.

Each request uses valid signed Telegram authentication, invokes the real Worker HTTP route, and times through complete Response JSON body consumption. Concurrent measurements finish both signed responses; their counts cover the pair. Failure measurements require a real 503 response, drain sibling projections, then retry without the fault. Each scenario has three independent fixture pairs, alternates revision order, and measures an initial request plus retry.

A fixed application/SQLite clock and deterministic randomness preserve meaningful timestamps and source periods. Only signed presentation challenge tokens are normalized. Both revisions use the same pinned catalog seed timestamps. Every application table is included in saved-state hashes, including ownership, archives, progression, currencies, Growth Marks, Crests, claims, receipts, completions and recovery cursors. First and retry response/save hashes are compared separately. Failed responses hash the complete error body. Concurrent responses must agree with each other.

The unadopted case exercises the unchanged early return. The new-pet case skips warm-up. Three-pet and archived cases retain all owned slots. Heavy/archived fixtures seed historical Daily qualification, Weekly qualification and an unpaid original-pet boss victory. Day/week cases advance the fixed clock. Concurrent requests share one binding and write queue. The failure case rejects a mandatory contract read, then proves successful retry.

## Validation

New executable regressions hold guidance or progression initialization behind a deterministic gate and prove independent reads start before release. They also cover mandatory D1 errors, a signed care action during a slow full response, duplicate retries, fresh authoritative XP/balances and the serialized-write latency model. Existing Worker/API coverage supplies ownership switches, cross-account isolation, missing optional tables, malformed authority/rooms, pending settlements, archived source attribution, completed activities, failure injection and recovery idempotency. Existing browser checks exercise the unchanged core/live/missions/profile modes and foreground/background state ordering.

Final measured results and completed validation are recorded below and in the PR. No production request, migration or deployment is performed by this benchmark.

## Initial repeated result

At 100 ms per binding call with serialized writes, the warm one-pet initial full response improved from p50 **6282 ms** (6211–6347) to **5234 ms** (5139–5241), a **16.7%** reduction. Retry improved from 6248 ms to 5145 ms. Both revisions execute **113 D1 calls / 169 SQL statements**: this improvement removes serial waits rather than removing authoritative work. The warm response and every application-table hash match across all three pairs.

The three-second objective is **not met** in this conservative 100 ms model. Bootstrap and ordered recovery alone consume about 2.2 seconds; the remaining complete projection and final assertions still cost about 2.8 seconds. Those are model observations, not an explanation of the production 7.6-second measurement. Live validation remains necessary after a separately approved release.

## Complete repeated results

All values below are milliseconds, p50 (min–max), three independent pairs per scenario. Raw reports and full unchanged response/save hashes: [moonpet-pr8-full-state-results.json](../scripts/fixtures/moonpet-pr8-full-state-results.json).

| Scenario | Main initial | PR8 initial | Main retry | PR8 retry |
| --- | ---: | ---: | ---: | ---: |
| zero | 2791 (2786–2795) | 2793 (2793–2794) | 2750 (2749–2768) | 2749 (2746–2757) |
| new | 6783 (6781–6794) | 5632 (5625–5698) | 6327 (6299–6335) | 5194 (5114–5222) |
| warm | 6282 (6211–6347) | 5234 (5139–5241) | 6248 (6209–6274) | 5145 (5139–5179) |
| three | 6517 (6488–6550) | 5412 (5407–5422) | 6504 (6483–6528) | 5389 (5384–5394) |
| heavy | 15963 (15960–16033) | 14900 (14776–14913) | 6336 (6309–6349) | 5212 (5165–5229) |
| archived | 15975 (15942–16013) | 14848 (14840–14937) | 6378 (6373–6383) | 5290 (5253–5310) |
| day_rollover | 6407 (6378–6418) | 5316 (5290–5325) | 6269 (6258–6272) | 5166 (5146–5167) |
| week_rollover | 6367 (6349–6379) | 5252 (5249–5285) | 6242 (6221–6246) | 5147 (5123–5152) |
| concurrent | 8069 (8048–8084) | 7111 (7075–7145) | 6295 (6269–6333) | 5190 (5178–5226) |
| failed | 5642 (5631–5652) | 3110 (3098–3135) | 6276 (6275–6290) | 5189 (5183–5215) |

The concurrent initial entry finishes **two** signed full responses sharing a serialized write queue; its retry is one response. The failed initial entry is a complete **503 error**, not a successful full state and not counted as full-state performance improvement. Its retry is a complete successful full state. The unadopted early return is unchanged within timer jitter. Heavy and archived recovery remain expensive; they improve, but do not approach three seconds under this model.

### D1/SQL counts

Counts are D1 calls / SQL statements. Both original and changed reports are retained for every repetition.

| Scenario | Main initial → PR8 | Main retry → PR8 |
| --- | --- | --- |
| zero | 25/26 → 25/26 | 25/26 → 25/26 |
| new | 117/174 → 117/174 | 113/169 → 113/169 |
| warm | 113/169 → 113/169 | 113/169 → 113/169 |
| three | 121/177 → 121/177 | 121/177 → 121/177 |
| heavy | 200/299 → 200/299 | 113/169 → 113/169 |
| archived | 204/303 → 204/303 | 117/173 → 117/173 |
| day_rollover | 115/171 → 115/171 | 113/169 → 113/169 |
| week_rollover | 115/171 → 115/171 | 113/169 → 113/169 |
| concurrent | 226/338 → 226/338 | 113/169 → 113/169 |
| failed | 102/150 → 56/39 | 113/169 → 113/169 |

### Remaining critical path

| Warm initial stage (p50 ms) | Main | PR8 |
| --- | ---: | ---: |
| d1_bootstrap | 776.88 | 772.96 |
| state_recovery | 1431.01 | 1437.68 |
| pet_state_projection | 3933.66 | 2878.17 |
| ownership_verification | 218.39 | 222.72 |

Ownership verification is included in projection, not added again. Recovery ordering and budgets are unchanged. No dependent settlement was skipped to obtain the projection gain. Recovery-stage results are separate from the complete-response improvements:

| Initial recovery stage, p50 (min–max) ms | Main | PR8 |
| --- | ---: | ---: |
| Heavy | 11091.18 (11053.16–11109.05) | 11110.14 (11004.09–11114.01) |
| Archived | 10996.88 (10987.23–11014.59) | 10986.83 (10962.58–11046.18) |

Heavy recovery p50 increased **18.96 ms**, while its complete response decreased 1063 ms. The recovery code is unchanged and ranges overlap; this PR claims a projection-path improvement, not a recovery-stage speedup. A zero-delay run of the final benchmark also verified three-repeat contract/save reproducibility for all ten scenarios; those local CPU-only timings are not a network-latency claim.

## Completed checks

- `node scripts/ci-domain-runner.mjs worker-api`: **164 commands passed**.
- `node scripts/ci-domain-runner.mjs visual`: **35 commands passed**, including affected MoonPet player-loop, PR7 signed-auth, background hydration and mobile/desktop browser coverage.
- `node --test scripts/moonpet-pr8-full-state.test.mjs`: **6 passed**.
- Existing frozen PR4 full-state and PR6 core hashes passed in Worker/API CI.
- Changed JavaScript syntax checks and whole-branch `git diff --check` passed.
- Final exact-head Codex review status is recorded in the PR conversation so this document does not require a new commit after review.

The first Worker/API attempt identified obsolete source-layout assertions, which were updated to the new dependency scheduling; the complete suite was rerun successfully. No production, database, bot, Wiki, reward amount or frontend changes were made. GK approval is still required before merge or deployment.

## Review correction: failure settlement

Codex identified that an early mandatory read failure could return 503 while runtime, achievement or live progression initialization was still running. Mutation-bearing projection groups now use `settlePetProjectionBranches`: all siblings settle before any error propagates. The full group, guidance's mutation-bearing groups and live initialization group all retain concurrent success execution. Four new gated regressions require production error responses to wait for held writes and permit immediate retry **without** a fixture drain. The benchmark still drains the unmodified baseline after errors solely to compare fully settled saved-state hashes.
