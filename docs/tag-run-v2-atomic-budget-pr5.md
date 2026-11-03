# TAG RUN V2 PR5 — atomic budget and uncertain-transfer rehearsal

## Status and limits

**Offline-only, never funded.** This PR makes a disposable SQLite model of
budget accounting and deliberately does not install a production migration,
Worker route, Telegram command, WAX signer, chain client or token transfer.

Requires previous PRs #1708–#1711; #1711 is merged into `main`.
The new files are `scripts/tag-run-v2-atomic-budget-rehearsal.mjs`,
`scripts/fixtures/tag-run-v2-atomic-budget-rehearsal.sql` and
`scripts/tag-run-v2-atomic-budget-pr5.test.mjs`. The test is registered
in the Worker API CI domain, but the module is **Node-only** and must not
be imported into Cloudflare Workers or from the bot.

## Simulated budget accounting

The pure SQL fixture defines a per-(chat, UTC day, token asset) synthetic
budget, whose daily and per-transfer ceilings and exact allocated/outstanding
base units are stored as canonical decimal strings. JavaScript uses `BigInt`
for all arithmetic; SQLite never computes token amounts using REAL values.
`BEGIN IMMEDIATE` encloses budget check, conditional revision-checked budget
update, frozen-intent insert and transaction commit in one disposable SQLite
transaction. Any failure rolls back both accounting and intent.

A first hold is unique per original PR2 `simulation_only` intent key,
validates the source row, and freezes asset, destination, chat/day, and amount.
A second request for the same key returns the existing simulated result,
never another allocation. The SQL table uses `WITHOUT ROWID` and BEFORE
INSERT/UPDATE/DELETE guards to prevent replacing or redirecting a hold.
The account is the player-selected WAX payout account; choice is not a proof
of wallet ownership. A scoped budget has a BEFORE INSERT duplicate guard:
`INSERT OR REPLACE` cannot delete and recreate the budget to zero its
allocation, outstanding amount, revision or emergency pause while a simulated
unknown hold remains linked to it (even with recursive triggers disabled).

Pausing stops new simulated holds. Previously held allocations can move
to a `simulation_transfer_unknown` incident state while paused. Unknown
allocations must never be released, cancelled or blindly resubmitted.
The transition atomically increments an `unknown_floor_units` balance using
`BigInt`, and SQL enforces that this irreversible floor cannot decrease
or exceed outstanding allocations. A simulated cancellation of a still-known
hold reduces *outstanding* but cannot reduce the unknown floor and
**does not refill the cumulative daily allocated cap**.

Database-level BEFORE UPDATE and DELETE guards freeze budget scope, limits,
and simulation mode; require monotone cumulative allocation, unknown floor
and revision; enforce the allocated/outstanding/floor ordering using exact
decimal-string length and lexical comparisons rather than floating point;
and prevent reallocating during a pause. Even `UPDATE OR REPLACE` cannot
move a fresh budget onto an existing spent, paused scope. No SQL mutation can
reset a spent cap, clear unresolved incident funds, or erase an emergency
pause by rewriting another field. These invariants complement the existing
BEFORE INSERT guard against `INSERT OR REPLACE`.

## Important future-production blockers

This is NOT an executable funded reservation ledger. The model operates
inside Node SQLite `BEGIN IMMEDIATE` and **cannot be copied as-is to D1**:
D1 has different transaction APIs and Worker/request concurrency semantics.
A future D1/DO proposal needs separately reviewed atomic multi-request proof,
consistent global treasury/token limits across all chats, verified funding
and custody, donation consent, immutable recipient registration version,
separate spend authorization, signer scope, uncertain-chain reconciliation,
observability, independent tests and production rollback.

In particular, this PR's synthetic budget is keyed **per chat**, not a
treasury-wide token balance. Multiple chat budgets could exceed treasury funds,
so it must never be treated as authority to spend. There is no approved
donation balance, real reservation, chain payment, funded entitlement, or
operator release approval in this PR.

TAG RUN V2 pool/draw/payout feature flags and real transfers stay OFF.
Issue #1705 remains open pending real production performance validation.

## Acceptance (Node >=22.13)

```bat
node --test scripts/tag-run-v2-atomic-budget-pr5.test.mjs
node --test scripts/tag-run-v2-ledger-lifecycle-pr4.test.mjs
node --test scripts/tag-run-v2-ledger-journal-pr4.test.mjs
npm run ci:worker-api
echo Exit code: %ERRORLEVEL%
```

Review for duplicate source allocations, exact integer caps, rollback,
non-refill after cancellation, pause preservation, unknown-state
non-release, frozen destination, SQL replacement bypasses, and runtime
isolation. Tests deliberately separate the duplicate-hold guard from the
source-account guard, preserve an unknown hold during forbidden budget
`INSERT OR REPLACE`, direct `UPDATE` and `UPDATE OR REPLACE` scope
mutations, and inject a hold INSERT trigger failure *after* the budget
UPDATE to prove the entire SQLite transaction rolls back.

An additional regression opens two independent SQLite connections from
two Node worker threads to the same disposable temporary database. A
synchronisation barrier makes both compete for the final available hold;
the test verifies exactly one succeeds, the losing contender cannot
overspend, the winning intent is idempotent on retry, and no accounting
is partially committed. This demonstrates offline SQLite lock serialization
only, not Cloudflare D1 transactional guarantees. Do not merge until CI and review are clear; no deployment required.
