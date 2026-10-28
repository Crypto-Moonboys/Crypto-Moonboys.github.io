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
The offline rehearsal explicitly **preserves five migration/audit ledgers**
even when they exist in the 93-name candidate list:

- `moonpet_identity_authority_cutovers` — migration 070's destructive-rerun sentinel;
- `telegram_pet_runtime_cutovers` — completed runtime cutover authority;
- `moonpet_beta_xp_rebaseline` and `moonpet_beta_xp_rebaseline_v2` — historical
  correction records;
- `moonpet_beta_xp_quarantine` — forensic record of invalid old beta receipts.

Thus 93 are **reviewed MoonPet table names**, but **88 are eligible for clearing**
in this offline rehearsal. Preserved ledgers are included in the before/after
byte-level digest comparison and cannot have a foreign key to cleared pet data.
The saved cutover markers must not be wiped merely because scores can reset.

Unknown prefixed tables, missing core pet tables, foreign keys into the
tables being cleared from other systems, unknown external `pet_id`
references, DELETE triggers on cleared tables, current FK violations and
FK cycles all block rehearsal. The known shared
`championship_clout_sources` table has no pet FK; any
`source_system='moonpet'` row (a verified source receipt for Championship
Clout) **blocks** the rehearsal until that cross-game reward-provenance
dependency is resolved separately. Clout is never cleared by this tool.

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
order runs in a transaction for the **88 clearable candidate tables** (or
the subset present in an older backup). The script verifies zero rows in
clearable tables, zero FK violations and SHA-256 equality for all shared
tables **and all protected MoonPet audit ledgers**. A report shows
`protected_moonpet_tables_preserved`, protected row totals and separate
clear/preserve counts. The remaining audit rows do **not** represent restored
MoonPet gameplay, and `ready_for_live_reset` remains false.
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


## Explicit remaining live reset blockers

- There has been **no rehearsal on an exported current production D1 backup**.
  The existing synthetic suites and read-only schema metadata are not equivalent.
- Verify that 070/064 cutover ledgers, XP correction/quarantine history and
  any other migration or identity sentinel remain intact and do not trigger
  destructive replay after reset.
- Cross-game Championship Clout may be backed by MoonPet Growth Marks or
  weekly Crests. If any saved shared `source_system='moonpet'` Clout sources
  exist, the rehearsal now aborts; do not delete those Clout rows or bypass
  the guard to get an empty result.
- Shared Community XP, Arcade XP, account activity and other game rewards
  can lack explicit foreign keys into MoonPet. Reconcile these external
  authorities before a live reset. Identical shared table digests alone
  cannot prove semantic consistency.
- Continue to require a current D1 backup, rollback/restore proof, signed
  fresh-player smoke and **separate GK approval** before any live wipe.

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
