# TAG RUN V2 PR6 — current Telegram community only

## Scope correction

This project has ONE existing TAG RUN Telegram community. There is no
second community to fund, no cross-chat prize sharing, and no need to build
a treasury-wide multi-community allocation system.

This PR uses the existing server-side `TELEGRAM_GROUP_CHAT_ID` as the
single authoritative group. The actual Telegram group identifier is a
runtime secret/configuration value and is NOT copied into source, PR text
or tests. Tests use synthetic group IDs only.

PR6 is a **Node/SQLite disposable rehearsal** and never connects to
the Telegram bot, production Worker or D1 production migrations.

## What PR6 proves

- `scripts/fixtures/tag-run-v2-current-community-pr6.sql` creates one
  immutable `scope_id=1` mapping to the existing Telegram group. Triggers
  prevent `INSERT OR REPLACE`, `UPDATE` and `DELETE` of the scope.
- BEFORE INSERT guards reject any PR2 payout intent, PR5 synthetic budget
  or PR5 synthetic hold whose `chat_id` is not that same configured group,
  including direct SQL writes bypassing the normal helper.
- `bindCurrentTelegramCommunity()` validates an authoritative
  `-100...` Telegram group ID using the existing
  `authenticatedGroupId()` helper, locks it once and allows only an
  idempotent re-read for that exact group. A different group ID fails.
- `previewOneCommunityDailyCaps()` constructs **paused, simulation-only**
  budgets for the one group and for selected, distinct token identities.
  It takes immutable **unverified PR2 snapshot evidence**, checks
  `available=onchain-reserved-excluded`, and checks that the hypothetical
  daily 5% budget equals `floor(available*500/10000)` in exact `BigInt`
  base units. Each token retains its own precision/contract identity.
- A cap with zero available units, a missing/rejected snapshot, invalid
  amount, duplicate token identity or more than the allowed asset count
  fails closed. All selected token budgets are inserted in ONE SQLite
  transaction; an invalid second asset rolls back the first.
- `holdCurrentCommunitySimulation()` checks the frozen PR2 source is
  in that configured Telegram group and delegates to PR5's atomic,
  immutable, simulation-only hold model. It does not alter the
  chosen WAX receiving account or introduce a wallet login/signature.
- The report forces `funded=false`, `treasuryApproved=false`,
  `transferAttempted=false` and `executable=false`. A positive wallet
  balance and unverified evidence **never constitute approved donated funds**.

## Explicit exclusions

There is **NO multi-community feature** or shared budget. Do not add a
multi-chat route, cross-group queue, tenant budget, or multi-community
scheduler. There is also no actual approved prize pool, donor consent
attestation, treasury custody authority, signer, transaction broadcaster,
live reservation, paid state, production D1 schema migration, Worker
deployment, bot command or enabled token transfer.

All existing TAG RUN V2 pool/draw/payout switches remain OFF.
Issue #1705 is a separate production performance validation issue and
remains open until approved for closure.

## Local validation (Node >=22.13)

```bat
node --test scripts/tag-run-v2-current-community-pr6.test.mjs
node --test scripts/tag-run-v2-atomic-budget-pr5.test.mjs
npm run ci:worker-api
echo Exit code: %ERRORLEVEL%
```

Review scope binding, direct SQL bypasses, 5% base-unit arithmetic, atomic
rollback, recipient immutability and absence of live transfer endpoints.
No merge until full tests and review are complete.
