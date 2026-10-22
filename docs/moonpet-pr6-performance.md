# MoonPet Performance PR6 — guarded read overlap

Base: main 85db93d04 (2026-10-22), not PR #1604. References #1605.

The request-local displayed-pet scope used to wait for the previous guarded transaction's entire network round trip before starting the next one, even for independent SELECTs. Core Home and full projection now opt into concurrent read transactions. Each transaction retains its own in-transaction owner/active-pet assertion. Writes, RETURNING/CTEs, .run(), and explicit batches drain earlier reads and block later reads. Optional modules retain separate transactions so missing optional tables cannot abort mandatory groups. All recovery and final economy/source checks retain their existing order.

Full projection also starts read-only pending street-event and season-finale projections alongside its first dependency group, instead of adding waits after that group. No payload fields, authentication, progression rules, deployment configuration, routing or schema change. Existing core-first frontend staging is retained; its first signed usable Home response is faster too.

## Reproducible signed HTTP evidence

Windows, Node v24.14.0, local SQLite, fixed application/SQL clock, same fixtures, injected **100 ms on every D1 binding call**. Two complete runs per revision. Timer includes Request authentication, bootstrap, recovery (full mode), projection, serialization and consuming response.json(). It excludes real Internet/browser transport and art decoding. This is a controlled high-latency model, not a production canary or a universal sub-three-second promise.

| Signed request | Before samples (ms) | After samples (ms) | Mean saving | D1 calls before/after |
|---|---:|---:|---:|---:|
| Core Home / usable first state | 2520, 2565 | 2103, 2127 | 428 ms / 16.8% | 34 / 34 |
| Full, one pet | 5973, 6006 | 5530, 5557 | 446 ms / 7.4% | 113 / 113 |
| Full, three pets | 5943, 5986 | 5528, 5535 | 433 ms / 7.3% | 121 / 121 |
| Full, recovery-heavy event evidence | 11662, 11806 | 11254, 11347 | 434 ms / 3.7% | 165 / 165 |

Call counts are fixture-specific, not the reported production 100 calls. They are unchanged between revisions: this improvement comes from shortening the critical path. The recovery fixture seeds five accepted historical events using seedRecoveryEvidence; all repair work remains. Full recovery-heavy loads remain slow. This change does not establish sub-three-second full hydration or production performance.

Use the existing harness in two checkouts, with dependencies installed in each. PowerShell:

~~~powershell
$env:MOONPET_PERF_DELAY_MS = '100'
$env:MOONPET_PERF_SOURCE_ROOT = 'D:/workspace/moonpet-pr6-baseline' # checkout of 85db93d04
node scripts/moonpet-state-performance-benchmark.mjs
$env:MOONPET_PERF_SOURCE_ROOT = (Get-Location).Path
node scripts/moonpet-state-performance-benchmark.mjs
~~~

Repeat both commands for a second sample. The harness also reports builder-only timings; the table above uses authenticated_http only. No new profiling framework or production logging is introduced.

## Compatibility and verification

- Existing full-response and persisted-state hash parity: zero/new/warm/three/heavy/archived/day rollover/week rollover, first request and repeat refresh.
- Added frozen core-response and persisted-state parity against this main revision: new/warm/three/heavy/archived/day/week rollover, first request and repeat refresh. Existing parity helper accepts an optional fourth argument selecting core; default remains full.
- Deterministic deferred-binding tests prove concurrent reads start together, mutations and explicit batches drain every prior reader, subsequent reads wait, and sticky stale ownership blocks writes.
- Existing failure tests cover thrown/resolved/malformed mandatory reads, missing optional tables, invalid saved rooms, signed auth/expired sessions, separate accounts, selected-pet switching, simultaneous heavy refresh/settlement, archived attribution and receipt idempotency.
- Mobile browser player loop passed at 360x640, including all six screens, saved three-space roster, historical reward recovery, daily/weekly completion, and source-pet attribution.
- Full Worker/API CI: pending final completion.

No merge, deployment or migration is authorized by this PR. Hold for GK approval.
