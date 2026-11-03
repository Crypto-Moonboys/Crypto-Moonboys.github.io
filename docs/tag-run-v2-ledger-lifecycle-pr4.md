# TAG RUN V2 — PR4 offline payout-ledger lifecycle and reconciliation rehearsal

Dependency #1710 has merged into `main`. PR #1711 has been rebuilt as
one clean commit directly on the merged `main` tree, preserving only its
intended ledger lifecycle, offline fixtures, tests, CI and documentation
changes. The historical dependency branch is no longer the PR base.

## Purpose

Rehearse the ledger controls required before any eventual automatic bot-to-WAX
transfer. Players select a receiving account with private `/rain accountname`.
A wallet ownership signature is not required for choosing a destination, but
the bot must confirm the account exists and preserve the exact receiving account
in an immutable award record.

No actual funded entitlement exists. Current observed treasury balances do NOT
establish donor consent, custody control, permission to spend, or historical
cutoff amounts.

## Added — pure lifecycle simulator

`workers/moonboys-api/tag-run/v2-ledger-lifecycle-rehearsal.js` accepts
the prior PR2 `simulation_only` payout intents, explicit per-asset/day
synthetic spending caps, an emergency pause and a bounded sequence of
simulated events. It checks:

- Every immutable intent preserves its original PR2 ticket class and
  recomputes the complete SHA-256 commitment over chat, UTC day, asset,
  bundle index, Telegram ID, ticket class, amount, destination, destination
  digest, snapshot digest and receipt digest. A digest of the correct shape
  alone is NOT sufficient; any changed source field is rejected.
- The destination digest still matches the frozen receiving account. Changing
  `/rain` later must never silently change an existing intent.
- Caps are enforced **per asset/day and per allocation** with `BigInt`.
  Attempts to exceed a cap reject the entire simulation.
- `paused=true` blocks new simulated holds. Previously accepted
  `historicalEvents` are replayed separately from new `events`; that
  rebuilds older holds/unknown outcomes so they can be examined or passed
  through reconciliation review while paused. Each historical event must have
  a strictly increasing, safe-integer `appendSeq` read from the journal;
  unordered, missing, duplicate or backdated sequences are rejected.
  The caller must load genuine immutable prior journal evidence via
  `ORDER BY append_seq ASC` rather than trusting client-provided history
  or sorting by timestamps/event IDs. Pausing never authorizes retrying an
  uncertain transfer.
- An exact repeated event ID is idempotent. Conflicting reuse is rejected.
- A simulated hold can be cancelled and released only before any simulated
  transfer uncertainty. After `simulate_unknown`, the hypothetical hold
  remains allocated; no blind retry or cancellation is permitted.
- `simulate_reconcile` requires a matching transaction ID, chain action
  sequence, block reference, token asset, destination and exact amount.
  The same chain action may not be assigned to two intents. This **only**
  attaches unverified diagnostic evidence: it does not confirm on-chain payment
  or free the allocation.
- The result is always `simulation_only`, `funded=false`,
  `executable=false`, `transferAttempted=false`,
  `realReservationsCreated=false`, `chainTransfersConfirmed=false`.
  Funded reserves and actual transferred amounts are always zero.

## Added — append-only offline journal

`scripts/fixtures/tag-run-v2-ledger-lifecycle-rehearsal.sql` is deliberately
**outside** Wrangler's configured production D1 migration directory.

It creates a disposable SQLite table with `simulation_only` statuses only.
Rows refer to existing offline PR2 intents and are immutable. A BEFORE INSERT
guard checks the frozen destination and amount against the original intent.
Uniqueness constraints cover event IDs, intent/action combinations and synthetic
chain transaction/action sequence references.

The journal is declared `WITHOUT ROWID` so a hidden rowid cannot be used
to overwrite a record through `INSERT OR REPLACE`. It also stores a
`NOT NULL UNIQUE append_seq` integer allocated by `MAX(append_seq)+1`
**inside the same SQLite INSERT statement**. A BEFORE INSERT trigger rejects
gaps, backdating and replacements, including append-sequence collisions,
regardless of `PRAGMA recursive_triggers=OFF`. The journal must be replayed
using `SELECT ... ORDER BY append_seq ASC`: its second-resolution
`created_at` and random event IDs do not establish chronological order.
The other BEFORE INSERT conflict guards reject primary, alternative unique
and chain-action collisions. UPDATE and DELETE are prohibited. The offline PR2 intent schema now retains the `ticket_class`
required to reconstruct its original hash. No production migration changes. The fixture cannot
create real balances, approved donations, reservations, payouts or an
on-chain transfer.

The pure simulator and SQL fixture are two independent rehearsals. The journal
does not claim to implement an atomic aggregate-cap reservation. The future
funded system MUST use reviewed transactional/CAS accounting with serializable
budget checks: **read-then-write JavaScript arithmetic alone is not safe for
concurrent financial reservations**.

## Future funded release lifecycle — design, not implementation

1. Independently establish Treasury custody and donation consent for every
   allowed token contract; an observed balance is not prize funding.
2. Reconstruct an irreversible per-asset token balance at an exact common
   cutoff, subtract exclusions/outgoing obligations, and approve funds through
   separately reviewed treasury authorities.
3. Atomically reserve exactly enough base units per token, with budget caps,
   unique intent keys, independent admin authorization and emergency pause.
4. Freeze recipient account plus registration version. Never redirect an
   already-submitted transfer after a player's `/rain` change.
5. Submit using an independently audited signer with limited transfer
   permissions, spending limits and protected key custody.
6. After an uncertain network result, mark the intent AMBIGUOUS, hold
   funds and reconcile chain history instead of sending a duplicate transfer.
7. Recognize an irreversible chain action using independently verified
   source/destination/token/amount/transaction identifiers. Only then settle.
8. Obtain appropriate legal/tax/promotion review and signed operator release
   authorization. A feature flag by itself must never enable transfers.

## Acceptance tests

Run on PR4 branch with Node >=22.13:

```bat
node --test scripts/tag-run-v2-ledger-lifecycle-pr4.test.mjs
node --test scripts/tag-run-v2-ledger-journal-pr4.test.mjs
node --test scripts/tag-run-v2-payout-rehearsal-pr2.test.mjs
node --test scripts/tag-run-v2-funding-proof-pr3.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
```

Additional tests exercise same-second `hold A → cancel A → hold B`
with intentionally nonchronological event IDs and verify that journal order
replays correctly while a timestamp/event-ID sort is rejected. They also
test sequence uniqueness, gap/backdating rejection, and overwrite guards.

All tests use mocked crypto/chain inputs or disposable SQLite. No production
D1 migration, bot command, Worker route or deployment is required.
Funded V2 pool/draw/payout switches must stay OFF and asset eligibility remains
quarantined. Preserve issue #1705 OPEN until its separate performance checks
are complete.

## Release gate

PR4 is **not approved for merge or production deployment** until the latest
branch passes tests and review. No token transfer execution is delivered by
this PR. Funded payout implementation requires its own explicit authorization.
