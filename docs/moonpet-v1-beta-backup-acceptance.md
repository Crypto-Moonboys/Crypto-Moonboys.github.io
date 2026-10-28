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
through SQLite. It hashes the original before and after, and checks the source
WAL/SHM/journal sidecars and file identity **at entry, after asynchronous
hashing, before cloning, during inspection and immediately before reporting**.
A source that becomes active during a hash fails closed instead of returning
`READY_FOR_OFFLINE_REHEARSAL`. It produces **no player IDs or transaction data**.

**Operational requirement:** the backup must be a closed, immutable export,
kept isolated from all SQLite writers. These consistency checks detect known
races but are not a filesystem lock: another process could modify the file
after the final check. Do not audit a live database path or treat a transient
`READY` result as a verified backup if another process can still write it.

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

## 28 October 2026 — cross-game Clout projection audit

Championship Clout is a **shared game** and is never wiped by MoonPet beta
reset tooling. Its saved proof can survive beyond its original MoonPet receipt
in three separate tables, none of which needs a declared FK to the pet:

- `championship_clout_sources` — verified MoonPet source-event receipt
- `championship_clout_effects` — an award already credited from that source,
  including pet-specific `source_pet_id` or `game_key='moonpet'`
- `championship_clout_daily` — saved daily aggregate with `moonpet` in
  `game_keys_json`, even if the original source/effect row is missing

The offline planner and backup acceptance audit **block** when any of these
indicate MoonPet-linked shared reward proof. Invalid daily game-keys JSON is
unverifiable and blocks too; the current-backup audit also refuses missing
Clout effects/daily tables. Scan results expose only counts and blocker codes,
not player identifiers. The optional `championship_clout_archives` row count
is informational; archive contents and other non-FK account reward sources
still require manual provenance review on a genuine export.

Run the focused test suite before any merge:

```sh
node --test scripts/moonpet-v1-beta-shared-clout-proof.test.mjs scripts/moonpet-v1-beta-backup-audit.test.mjs scripts/moonpet-v1-beta-rehearsal.test.mjs
node --check scripts/moonpet-v1-beta-shared-clout-proof.mjs
```

This is **not approval to clear Clout or MoonPet D1**, and not a substitute
for proving restoration and running signed Telegram gameplay checks.


### Daily Clout game-key validation

A valid `championship_clout_daily.game_keys_json` value must be an array
of **at most 200 distinct canonical game-key strings** matching
`^[a-z0-9][a-z0-9_-]{0,63}$`, consistent with Championship Clout's
`validSnapshot` policy. Malformed JSON, non-array roots, nested arrays,
objects, numeric/null/boolean members, duplicate keys or invalid casing
**all block offline rehearsal**. A direct `MoonPet` string is also counted
as MoonPet evidence even if its casing or surrounding whitespace is invalid.

The read-only scan streams only the saved game-keys column and reports
aggregate blocker counts; it does not rewrite shared reward records.
