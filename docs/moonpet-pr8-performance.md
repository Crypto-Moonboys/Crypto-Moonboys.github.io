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
