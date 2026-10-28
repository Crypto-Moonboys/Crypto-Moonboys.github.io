# MoonPet OS V1 private BETA — backup acceptance audit

This is the follow-up to merged PR #1657. It adds a **read-only, local
pre-rehearsal gate**, not a database reset, migration, restore or deployment.

## Workflow

1. Export a current, **closed** D1 SQLite backup using the approved Cloudflare
   procedure. Do not point either script at live production or an open WAL DB.
2. Run the source-clean inventory from PR #1656:
   `node scripts/moonpet-v1-beta-inventory.mjs --db /local/closed.sqlite`
3. Run the new audit:
   `node scripts/moonpet-v1-beta-backup-audit.mjs --db /local/closed.sqlite`
   Save its JSON stdout and verify `backup_sha256` and the blockers.
4. Only if its status is `READY_FOR_OFFLINE_REHEARSAL`, run the existing
   rehearsal to a new disposable output file:
   `node scripts/moonpet-v1-beta-rehearsal.mjs --source /local/closed.sqlite --output /local/NEW-rehearsal.sqlite --rehearse`
5. Validate the report, preserved migration cutovers and shared-table hashes.
   Prove restore/rollback separately before any real reset decision.

The audit uses a private temporary SQLite copy and never opens the original
through SQLite. It hashes the original before and after, refuses active
SQLite journal sidecars and produces **no player IDs or transaction data**.

## What it verifies

- Exactly 93 known MoonPet-prefixed tables, 88 clearable candidates and five
  preserved audit/migration ledger tables, with no unexpected/missing names
- D1 migration ledger and essential MoonPet migrations 064/070/078/080/082/097
- Identity cutover marker created by migration 070, runtime cutover marker 064
- SQLite integrity, foreign-key, trigger and other cross-table preflight from
  the existing offline rehearsal planning function
- Shared Championship Clout table shape and zero retained MoonPet-origin
  proofs; otherwise the result is BLOCKED
- Backup SHA-256, file size and unmodified original data bytes

All outputs have `ready_for_live_reset:false`, including an otherwise clean
backup. The audit's status means eligibility to *rehearse offline*, not
authorization to wipe production D1.

## Known remaining blockers / limits

Production D1 source records may be referenced in shared tables without FKs.
The audit explicitly checks known Championship Clout sources but is not a
complete semantic audit of Community XP, independent rankings or global
rewards. A current production export, restoration drill, manual reconciliation
and signed Telegram gameplay verification are still mandatory. Missing or
unexpected tables and guard markers fail closed.

Targeted tests (Node 22.13+):

```sh
node --test scripts/moonpet-v1-beta-backup-audit.test.mjs scripts/moonpet-v1-beta-inventory.test.mjs scripts/moonpet-v1-beta-rehearsal.test.mjs
node --check scripts/moonpet-v1-beta-backup-audit.mjs
git diff --check
```

No direct changes to the Worker, D1, Telegram authentication, Arcade XP,
MoonPet gameplay, or public release controls.
