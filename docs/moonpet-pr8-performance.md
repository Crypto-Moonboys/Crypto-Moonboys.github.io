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

## Repeated results on corrected runtime

Runtime commit: `491a3ce77ab5d884a75024afbaca435edcbb70f8`. At 100 ms per binding call with serialized writes, warm initial full response improved from p50 **6306 ms** to **5208 ms** (**17.4% faster**). Both revisions execute **113 D1 calls / 169 SQL statements**: the gain removes serial waits rather than removing authoritative work. Complete response and every-application-table saved-state hashes match for every initial/retry pair and across all three repetitions.

All values below are milliseconds, p50 (min–max), three independent pairs per scenario. Raw reports and full unchanged hashes: [moonpet-pr8-full-state-results.json](../scripts/fixtures/moonpet-pr8-full-state-results.json). The per-scenario measurement processes ran independently on the same host; each revision used the same injected binding latency and its fixture's serialized write queue.

| Scenario | Main initial | PR8 initial | Main retry | PR8 retry |
| --- | ---: | ---: | ---: | ---: |
| zero | 2791 (2787–2798) | 2787 (2782–2799) | 2756 (2750–2763) | 2763 (2749–2767) |
| new | 6752 (6747–6764) | 5662 (5648–5667) | 6278 (6268–6298) | 5192 (5181–5202) |
| warm | 6306 (6304–6308) | 5208 (5205–5216) | 6295 (6279–6299) | 5192 (5181–5196) |
| three | 6527 (6521–6528) | 5430 (5426–5450) | 6497 (6491–6517) | 5411 (5405–5417) |
| heavy | 15916 (15902–15923) | 14804 (14799–14817) | 6305 (6284–6306) | 5182 (5175–5197) |
| archived | 16027 (16012–16037) | 14910 (14907–14912) | 6405 (6391–6415) | 5291 (5289–5305) |
| day_rollover | 6417 (6407–6419) | 5317 (5313–5325) | 6285 (6272–6298) | 5186 (5186–5192) |
| week_rollover | 6417 (6415–6421) | 5326 (5312–5334) | 6286 (6273–6299) | 5187 (5180–5187) |
| concurrent | 8062 (8050–8065) | 7086 (7069–7087) | 6288 (6281–6302) | 5189 (5183–5196) |
| failed | 5632 (5631–5654) | 4749 (4744–4780) | 6285 (6279–6295) | 5184 (5165–5195) |

The concurrent initial entry finishes **two** signed full responses sharing a serialized write queue; its retry is one response. The failed initial entry is a complete **503 error**, not a successful full state and not counted as full-state performance improvement. Its retry is a complete successful full state. The unadopted early return is unchanged within timer jitter. Heavy and archived recovery remain expensive and do not approach three seconds under this model.

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
| failed | 102/150 → 103/158 | 113/169 → 113/169 |

### Remaining critical path

| Warm initial stage (p50 ms) | Main | PR8 |
| --- | ---: | ---: |
| d1_bootstrap | 771.87 | 771.44 |
| state_recovery | 1437.26 | 1432.49 |
| pet_state_projection | 3965.51 | 2861 |
| ownership_verification | 221.93 | 220.16 |

Ownership verification is included in projection, not added again. The three-second objective is **not met** in this conservative model. Bootstrap and ordered recovery alone cost about 2.2 seconds, and the complete projection still costs about 2.9 seconds. These are model observations, not an explanation of the production 7.6-second capture. Production validation requires a separately approved release.

Recovery is reported separately; no dependent settlement was skipped.

| Initial recovery stage, p50 (min–max) ms | Main | PR8 |
| --- | ---: | ---: |
| heavy | 11025.47 (11023.36–11040.21) | 11024.46 (11020.89–11024.89) |
| archived | 11023.37 (11017.52–11032.88) | 11024.39 (11019.69–11027.15) |

Recovery code and budgets are unchanged; overlapping ranges should not be interpreted as a recovery-stage optimization. This PR claims a shorter complete projection path. The final benchmark also verifies repeated response/save reproducibility for every scenario.

## Verification

- `node scripts/ci-domain-runner.mjs worker-api`: the complete **164-command** Worker/API domain, including existing frozen PR4 full-state and PR6 core hashes.
- `node scripts/ci-domain-runner.mjs visual`: the complete **35-command** visual/browser domain, including affected MoonPet player-loop, PR7 signed-auth, hydration and mobile/desktop coverage.
- `node --test scripts/moonpet-pr8-full-state.test.mjs`: **10 passed**, including four failure-settlement gates.
- `node scripts/moonpet-pr8-full-state-benchmark.mjs BASELINE_ROOT OUTPUT_JSON`: **10 scenarios × 3 repeated revision pairs passed** on the corrected runtime.
- Changed JavaScript syntax checks and whole-branch `git diff --check` passed.

Both full CI domains passed on the initial implementation. The review-correction reruns and final exact-head CI/review results are recorded in the PR conversation so this document does not require another commit after review. The first Worker/API attempt caught obsolete source-layout assertions; those were updated and the entire suite rerun.

No production, database, bot, Wiki, reward amount or frontend changes were made. GK approval is required before merge or deployment.

## Review correction: failure settlement

Codex identified that an early mandatory read failure could return 503 while runtime, achievement or live progression initialization was still running. Mutation-bearing projection groups now use `settlePetProjectionBranches`: all siblings settle before any error propagates. The full group, guidance's mutation-bearing groups and live initialization group all retain concurrent success execution. Four new gated regressions require production error responses to wait for held writes and permit immediate retry **without** a fixture drain. The benchmark still drains the unmodified baseline after errors solely to compare fully settled saved-state hashes.
