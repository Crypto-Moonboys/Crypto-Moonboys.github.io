# TAG RUN V2 — PR2 accounting and payout-ledger rehearsal

## Scope and release boundary

This is an **offline-only rehearsal**, not a launch of funded reward accounting.
PR1 (#1708) generated hypothetical direct-to-registered-WAX-account payout plans.
PR2 adds a **rehearsal-only SQL fixture** at
`scripts/fixtures/tag-run-v2-accounting-rehearsal.sql`, an independent
exact-units reconciliation check, and immutable draft rows for a disposable
local D1-compatible SQLite rehearsal.

**This SQL is deliberately outside the production migrations directory.**
`wrangler d1 migrations apply` must not discover it, and PR2 does not
authorize its application to any production D1 database. Only an isolated
fixture loads the SQL. No live Worker route, scheduled task, bot command,
signer, transaction broadcaster, token approval, custody claim, real
entitlement, or ledger reservation is created.

## Immutable rehearsal data

1. `tag_run_v2_funding_evidence_rehearsal` — unverified WAX transaction
   evidence and donor-intent/custody-document digests. Does not assert
   donation approval; supports only `unverified` or `rejected`.
2. `tag_run_v2_snapshot_evidence_rehearsal` — candidate irreversible
   block identification and integer-string token accounting. Evidence
   is still unverified, even when arithmetic is internally consistent.
3. `tag_run_v2_payout_intents_rehearsal` — frozen Telegram ID and user-
   selected WAX account with an immutable SHA-256-based rehearsal slot key,
   source receipt and snapshot digests. Only `simulation_only` status
   exists; no `payable`, `authorized`, `reserved` or `paid` state.

All three TEXT digest primary keys are explicitly NOT NULL. The tables
reject UPDATE and DELETE by database trigger, and reject
conflicting INSERT requests **before** they can replace an existing primary
or alternate-unique-key row. This includes `INSERT OR REPLACE` when SQLite
`recursive_triggers=OFF`, which otherwise bypasses DELETE triggers.
Identical replays must be handled by a separate read/compare, never by
replacing an immutable row. Duplicate asset/day/bundle slots are rejected.
The existing migration 104 V1/V2 data is untouched. There is no automatic insertion of observed wallet holdings:
an asset balance by itself is **not donated** and a block height by itself
does not establish irreversible cutoff proof.

## Exact arithmetic and destination safety

`prepareV2PayoutRehearsal` verifies:

- `onchain_units = reserved_units + excluded_units + available_units`
  using `BigInt` with no decimal floating-point arithmetic.
- 5% daily upper bound is exactly
  `floor(available_units * 500 / 10000)`.
- Planned totals equal that 5% amount, every bundle is positive and
  unique per asset/bundle index, and planned amounts reconcile exactly.
- A frozen, **primitive string**, syntactically valid, non-treasury WAX
  destination is provided for every member. Arrays, objects and boxed
  strings are rejected, including values that coerce to a valid account name;
  no wallet signature or login is needed for registration.
  The `chainAccountChecked` flag in earlier simulation inputs is not
  durable proof for a future payout. Before release, re-check on-chain
  account existence and compare the latest /rain registration version.
- The output has `funded:false`, `reservable:false`, `reviewed:false`,
  `executable:false`, `transferAttempted:false` unconditionally.

**No funds can be moved even if someone changes Worker feature flags.**

## What must precede any funded launch

1. Independent non-spending proof that the project controls treasury
   `isthatajoint`, and an explicitly authorized protected signer.
2. Documented donation consent and verification of eligible incoming
   asset transfers. An arbitrary preexisting wallet balance is excluded
   unless separately approved.
3. Reconciliation at a proven irreversible WAX block, including asset
   contract/precision, outgoing transfers, outstanding obligations,
   revocations and any refund obligations.
4. Final, per-asset reservation ledger and token-level spending ceilings,
   a uniquely identified durable payout intent with transaction and
   chain-confirmation lifecycle, atomic/concurrent spend protection.
5. Recipient existence checks, immutable account selection fingerprint,
   stale wallet-change handling, identity and replay protection.
6. Explicit legal/tax/promotion review, owner signoff and emergency pause.
7. Independent review of any signer, separate security tests, and
   controlled rollout. No private keys in ChatGPT, Telegram, GitHub or logs.

The next release must **not** simply rename a simulation status to
`approved`. It requires an audited funding authority, settlement,
cancellation and reconciliation design with separate explicit approval.

## Validation — local only

```bat
node --test scripts/tag-run-v2-payout-rehearsal-pr2.test.mjs
node --test scripts/tag-run-v2-direct-wallet-plan.test.mjs
node --test scripts/tag-run-v2-community-pot.test.mjs
node --test scripts/tag-run-v2-observation.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
```

Tests use an in-memory SQLite database with production schema migration 104
and the **rehearsal-only SQL fixture**. They verify that no
`105_tag_run_v2_accounting_rehearsal.sql` exists in Wrangler's migrations
directory, and that all three immutable digest IDs reject omitted and
explicit NULL values. They also verify foreign keys, record immutability,
distinct slots, frozen destinations, exact BigInt accounting, and no
live execution.

**No production deploy required to activate this PR.** Keep all current
funded V2 pool, draw and payout flags OFF and the pool paused. No reset.
