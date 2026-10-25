# MoonPet beta full-state implementation

## Scope and baseline

No deployment, migration, reset, reward-value change or timeout change. Synthetic
signed Telegram requests use the existing isolated in-memory SQLite sandbox and
the real Worker fetch handler, timed through complete JSON body consumption.

GitHub main at the start of this work: `cc9446322728a4561f0b4c81925377ca05aadd7e`.
The supplied local checkout was `666b22d972fdd0268cf37f67f658b3984c718c2b`.
GitHub's complete comparison confirms no intervening MoonPet runtime, schema,
fixture or benchmark changes. The PR is based on GitHub main; local experiments
compare its identical MoonPet implementation. Current main rules and homepage
were separately read/copied for validation, not included as PR changes.

## Confirmed bottlenecks and runtime removal

1. Every full refresh paid for ten queue-probe/cleanup operations even when the
   authenticated account had no possible source rows. A single indexed presence
   query now removes source-less standard/Daily/live/combat/runtime/weekly-boss/
   Journey and equipment work. Positive results still execute the original
   eligibility, attribution, ordering, limits and atomic settlement code.
   Source producers conservatively enable their downstream consumers in the
   same response. Negative evidence lasts for this request only. Malformed,
   missing or unsuccessful presence results fail closed with 503.
2. Intact, wallet-reconciled selected pets repeatedly traversed the beta
   profile/instance reconciliation path. A joined snapshot verifies selected
   ownership, every mirrored pet-state column and the successful wallet cutover
   receipt, and reads account currency from its authoritative profile. Bootstrap
   overlaps this read with paid-onboarding repair and awaits both. Missing or
   divergent tuples still run the original guarded compatibility repairs.
3. Full projection invoked the four-statement legacy inventory bridge once for
   inventory and again for economy guidance. Both consumers now await one
   request-local reconciliation promise. Mutations, standalone economy reads,
   legacy Telegram routes and later requests still run their own reconciliation.

These unnecessary executions are removed, not queued after the response. Full
projection, required recovery and final ownership/economy checks remain awaited.
The query plan uses existing owner/pet indexes, including per-player Arena and
Kaiju indexes and owner-slot to pet-period Journey joins. No new index/migration.

## Reward and compatibility audit

| Area | What full refresh does | Authority retained |
| --- | --- | --- |
| Daily missions/cache/bounties | Reads accepted events, cached completion bits, daily totals and receipts; repairs eligible Daily terminals and Journey marks when sources exist | Original UTC day, source pet, paid receipts, caps and atomic claim guards |
| Daily Run | Restores interrupted reservation/rooms and accepted terminal evidence; recovery precedes projection | Original run seed/outcomes, run ID, owner/pet/day and claim IDs |
| Weekly Journey/bounties/boss | Reconstructs missing accepted source objectives; settles eligible crests and saved boss victories with bounded rotating cursors | Original ownership week, earning date, accepted source proof and archived pet attribution |
| Monthly | There is no separate MoonPet monthly reward-settlement queue; monthly aggregation belongs to Battle Chamber/daily-loop routes | Those systems remain unchanged; full MoonPet parity also crosses a UTC month boundary |
| Seasonal competition | Projects current/historical XP tiers and accepted tier receipts; claims settle through their explicit action path | Competition quarter, original tier entitlement, account currency authority and duplicate guard |
| Seasonal raids/live endings | Recovers saved decisions and expired uncharged reservations when pending/rejected/settling records exist | Original charged decision, earning day, source pet, idempotency key and failure retry |
| Lifetime/evolution | Reads retained marks, crests, memories, unlocks and completion; Journey/weekly recovery can finish pending progression | 365-day lifecycle and permanent ownership, original legacy-quarter clocks, final evolution and completion evidence |
| Specialist/runtime | Reconstructs awards from committed run steps, rooms, analytics, accepted actions/combat and seasonal boss evidence | Existing source keys, equipment snapshots, permanent receipts and per-request budgets |
| Legacy inventory | Replays pre-authority inventory deltas once per full response | Existing inventory, consumed items, checkpoint and transactional delta application |
| Legacy wallet/profile/onboarding | Skips replay only when the intact snapshot and existing successful cutover prove it unnecessary | Historical ordered wallet replay, pending recovery freeze, old profile-only writes and paid egg repairs remain available |

Historical weekly-boss, legacy-quarter Journey, archived ownership and wallet
replay branches are **not proven obsolete**. The existing historical fixture
contains unpaid rewards and recovery still changes durable state correctly.
Deleting those branches would violate the instruction to preserve pending beta
activity. The removable debt is unconditional/duplicate execution, not those
saved entitlements. No reset is proposed or implicitly approved.

## Measurement and validation

Initial warm baseline: 113 D1 calls / 169 SQL statements, about 5.2 seconds at
100 ms modeled D1 latency with fully serialized writes. The changed warm path:
92 calls / 145 statements, about 2.9 seconds. Recovery falls from about 1.43 s to
0.11 s; bootstrap from about 0.77 s to 0.11 s. These are sandbox measurements,
not production or browser wall-clock promises. Recovery-heavy accounts and
first-time initialization remain above three seconds; valid saved work is kept.

The repeated benchmark compares both revisions three times per scenario, in
alternating order. It checks initial/retry response hashes and every application
table independently. Scenarios include zero/new/warm/three pets, unpaid heavy
and archived history, day/week/month/quarter/lifetime transitions, accepted
pending activity, concurrent signed full requests and mandatory failure/retry.

```powershell
$env:MOONPET_PERF_SCENARIOS='zero,new,warm,three,heavy,archived,day_rollover,week_rollover,month_rollover,quarter_rollover,lifetime_rollover,activity,concurrent,failed'
$env:MOONPET_PERF_DELAY_MS='100'
node scripts/moonpet-pr8-full-state-benchmark.mjs BASELINE_ROOT scripts/fixtures/moonpet-beta-streamline-performance.json
node --test scripts/moonpet-beta-streamline.test.mjs
node scripts/ci-domain-runner.mjs worker-api
node scripts/ci-domain-runner.mjs visual
```

Zero-delay parity has passed all 14 scenarios x three revision pairs. Frozen
historical response/save hashes remain unchanged; old exact SQL-call assertions
become ceilings so eliminating calls is permitted. New regressions enforce the
reduced warm budget, one inventory bridge, indexed probes, malformed-read
failure, divergent-profile and missing-wallet-receipt fallback, pending care,
archived reward settlement, duplicate refresh and database-failure retry.

Repeated 100 ms results, complete CI outcomes and Codex review will be appended
after execution. Local visual verification uses installed Chrome because the
Playwright browser download is absent; GitHub CI uses its normal browser setup.
