# MoonPet OS V1 BETA — PR 3: Offline reset rehearsal

**Private beta. Not public.** Existing MoonPet-only beta pet saves and scores may
be discarded following the separately approved live reset. This PR does NOT
apply a live D1 reset or provide a Worker reset endpoint.

## Scope

- Candidate pet data: pets, ownership slots, care, MoonPet-specific currencies,
  furniture, inventory, missions, runs, rewards, archived beta pet history.
- Strictly excluded: Telegram login/identity, lifetime and spendable Arcade XP,
  website progression, other games, faction and Championship records.
- Do not refund paid-slot purchases from the shared Arcade wallet.
- Keep the approved 1,000 lifetime Arcade XP entry gate, 3 slots (1 free;
  2 at 500 spendable XP; 3 at 1,000), and the six-stage 365-day journey.

## Local-only reset rehearsal

A reviewed, explicit allowlist is stored in
scripts/moonpet-v1-beta-reset-tables.mjs. It contains 81 MoonPet-prefixed
tables from the checked-in Worker schema.sql, plus 12 additional legacy
MoonPet tables identified via read-only production D1 sqlite_master/FK
inspection (28 October 2026): 93 total. The legacy entries include saved
Growth Marks, weekly Crests, boss receipts and beta cutover audit rows.
This is a reviewed CANDIDATE allowlist, not authorisation for live deletion.
Unknown prefixed tables, missing
core pet tables, foreign keys into MoonPet from other systems, pet_id
references in other tables, DELETE triggers, current FK violations and FK
cycles all block rehearsal.

The script requires **Node 22.13.0 or later**, an existing, closed LOCAL
SQLite backup and a **new destination file**. The original backup is NEVER
opened through SQLite: an isolated temporary copy is opened read-only for
preflight and its transient WAL/SHM files are removed with that scratch copy.
Existing source WAL/SHM/journal files and destination main/WAL/SHM/journal
files (including dangling symlinks) block rehearsal. Both input and output
parent directories are canonicalized before comparing database and journal
paths, preventing a symlinked directory from disguising an original backup's
WAL/SHM/journal as the new output. Final-component symlinks remain prohibited.
In-place/overwrite attempts are rejected before SQLite touches the destination.

The inventory command also opens **only a temporary copy** of its source:
SQLite WAL-mode backups can create sidecars even when opened with readOnly.
The original backup is never opened via SQLite, and any existing source
WAL/SHM/journal files, source final-component symlinks or unclosed sources
are refused. It can therefore be run before rehearsal without contaminating
the backup.

Commands:

    node scripts/moonpet-v1-beta-inventory.mjs --db /local/CLOSED-backup.sqlite
    node scripts/moonpet-v1-beta-rehearsal.mjs --source /local/CLOSED-backup.sqlite --output /local/NEW-rehearsal.sqlite --rehearse
    node --test scripts/moonpet-v1-beta-inventory.test.mjs scripts/moonpet-v1-beta-rehearsal.test.mjs

The new SQLite copy has foreign keys enabled. The child-to-parent deletion
order runs in a transaction. The script verifies zero pet rows, zero FK
violations and SHA-256 equality of every NON-MoonPet table before and after.
Any failure rolls back if the transaction is still active, preserves the
original SQLite error, and removes the disposable output and its generated
sidecars; the backup and any pre-existing destination artifacts stay unchanged.
The report is always ready_for_live_reset=false. Mixed-case FK references
are resolved to their canonical table names, including external dependencies.

## Live operation: not authorized or performed

There is **no deployable production reset, no D1 migration, and no automatic
beta wipe**. Before any later production reset, GK must approve the exact
data allowlist against a current REAL D1 export, a backup and restoration drill,
a maintenance window, and a fresh-authenticated-player smoke result. Any
shared table must remain untouched. Do not use SQLite foreign_keys=OFF
to force a migration or erase outside records.

## Version 1 beta acceptance

- Verify actual deployed Worker and Pages SHAs and D1 migration inventory.
  Issue #1648 reported /deployment-info HTTP 503 and remains a release blocker
  until separately resolved or accurately diagnosed.
- Validate fresh adoption, egg/hatch and all year-long stages with accelerated
  clocks; slots 1/2/3 and full paid repurchase; all six game menus; signed
  Telegram Android, iOS and desktop gameplay.
- Validate saves, daily/weekly resets, true completion ticks, currency spends,
  duplicate/replay protection, pet switching, stale auth and offline retries.
- Run targeted manual Worker/API, MoonPet browser and guide CI and latest-head
  Codex review. No automatic broad validation is enabled in this repository.
- Measure first verified interactive Home and complete full-state latency
  with real signed player examples; failed data hydration must be honest.
- Rollout remains **private beta only**. No public release promises.

No merge, production deployment, reset or data mutation without GK approval.

**Unverified:** This review used production schema metadata and row counts,
not a real exported D1 SQLite backup. Complete foreign-key, trigger and
outside-table references must be checked on a current, closed export; if
new tables appear the rehearsal must continue to fail closed. No remote
reset path is added in this PR.
