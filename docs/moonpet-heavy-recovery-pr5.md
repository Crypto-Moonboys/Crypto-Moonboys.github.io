# MoonPet PR5 — heavy recovery performance measurement gate

## Why this PR is profiling-only

The existing 100ms-per-D1-call model measured heavy recovery at **13.091s** after optimisations (previously 14.785s), and accepted activity history at **9.131s** (previously 10.999s). Ordinary warm first response improved to 2.884s. Those figures are local models, **not current production percentiles**. The request-local probe already avoids source-less recovery paths. Removing historical settlement reads or ownership checks without new evidence risks losing saved/archived rewards or changing once-only receipts.

This PR does **not** modify runtime, Worker/D1 routes, payout rules, rate limits, schema or request timing. It adds an offline, privacy-preserving aggregation tool and tests so that follow-up optimisation can target measured stages.

## Usage

Collect existing allowlisted `moonpet_state_timing` JSON console events through approved Cloudflare logs into a **local private JSONL file**. Do not upload private raw logs or identifiers to the repository.

```powershell
node scripts/moonpet-recovery-profile.mjs .\private-worker-events.jsonl > .\moonpet-recovery-summary.json
node --test scripts/moonpet-recovery-profile.test.mjs
```

Output contains **only** allowlisted mode, stage and outcome, sample count, median/p95/max wall time, and median SQL statement and D1 binding-call counts when available. Individual request IDs, pet/account IDs, tokens, SQL text, errors and input logs are never echoed. Invalid rows are counted but not returned. Stage timings are correlated in memory by request ID with the single final `total` event. A stage marked completed in a subsequently failed/rejected request belongs to that **failed/rejected request cohort**, not the completed-request distribution. Missing final events, duplicate terminals, duplicated stage events (including identical copies), and conflicting modes are excluded and counted as incomplete/ambiguous; no request IDs leave the process. The supplied JSONL must contain complete request event sequences. Failed/rejected requests are **not** mixed into completed latency distributions. Counts may be null for stages without instrumented D1 submissions. `state_recovery` includes nested settlement spans; **never sum nested span times**.

## Acceptance for next runtime optimisation

1. Obtain a representative production cohort with warm, three-pet, activity, heavy pending reward and archived-pet signed accounts. Keep identifying metadata private.
2. Compare completed request p50/p95 by mode, stage and region where available; do **not** pretend this script supplies colo labels.
3. Choose a specific dominant recovery substage or D1 call path, not just a total latency figure. Use controlled baseline-vs-changed benchmarks.
4. Verify identical signed JSON response and *every* saved application table (XP, Moon Gold, receipts, pending claims, archived sources, growth marks and ownership) over first/retry, concurrent and failure scenarios.
5. Require Worker API and browser CI and two authenticated production canary runs before declaring a runtime performance gain.

## Limits

Events can be sampled or incomplete; resulting percentiles describe **the supplied logs only**. The aggregator cannot infer SQL duration, geography, concurrent load or Cloudflare CPU from a stage's wall time. It is diagnostic proof infrastructure, **not a gameplay-speed fix**.
