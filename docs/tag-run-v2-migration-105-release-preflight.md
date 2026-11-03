# TAG RUN V2 — Migration 105 release preflight (3 November 2026)

**Scope: read-only diagnosis and offline verification. No production migration,
Worker deployment, signer installation, funded draw or WAX transfer is authorized
by this document.** Source: merged PR #1716 / master issue #1697.

## MoonPet `foreign key mismatch` is a dump-order issue, not a missing live key

The original local restore of `tag-run-pre-migration-105.sql` with foreign-key
enforcement **ON** stopped on `telegram_pet_instances` →
`telegram_pet_season_slots`. A dump can create the tables and INSERT child rows
before recreating the unique indexes needed for composite-key validation.

Migration `056_telegram_pet_instance_state.sql` already creates, **before**
`telegram_pet_instances`, the required *full unique* index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_pet_owner_tuple
  ON telegram_pet_season_slots(pet_id, telegram_id, season_key, slot_number);
```

**Live Cloudflare D1 read-only verification on 3 November 2026:** the index
exists with the four exact columns; migration 056 is recorded; and
`PRAGMA foreign_key_check` returned **zero violations**. Rebuilding MoonPet
ownership tables, modifying migration 056, or adding an artificial repair
migration is therefore unjustified. The owner successfully restored a local
copy with foreign keys OFF and then checked integrity and foreign keys on the
completed database. Foreign keys should remain enforced for normal app writes;
OFF is only for isolated SQL dump restoration.

## Remote production migration inventory (read-only)

Target confirmed: the Cloudflare D1 database `wikicoms` matching the database
ID in `workers/moonboys-api/wrangler.toml`. Checks used **SELECT**, `PRAGMA
foreign_key_check` and catalog reads only.

| Check | Observed result |
|---|---|
| All 66 release-required migrations 038–104 | Recorded (none missing) |
| `104_tag_run_v2_community_token_pot.sql` | Recorded |
| `105_tag_run_v2_payout_execution.sql` | **Not recorded; remains pending** |
| Migration 105 payout tables | Absent as expected |
| `idx_telegram_pet_season_slots_pet_owner_tuple` | Present, unique, correct four-column definition |
| `PRAGMA foreign_key_check` | Zero violations |
| Application tables (exclude `sqlite_sequence` / `_cf_KV`) | 195 |

The current repository `migrations/` contains 107 SQL files; the remote
`d1_migrations` ledger has 107 entries. The **only local file absent remotely
is 105**. The only remote ledger entry without a current repository file is
the already-recorded legacy `038_remove_waxonedge_tables.sql`. Preserve that
historical ledger entry. Do not recreate, apply, delete or renumber old
migrations because of it. The reserved Cloudflare `_cf_KV` internal table is
not included in the exported SQL dump; its presence explains the one-table
catalog count difference between live D1 (197 total, including `_cf_KV` and
`sqlite_sequence`) and the 196-table local restore.

## Owner's completed offline evidence

- SQL dump restored successfully with FK enforcement OFF (copy only).
- Full SQLite integrity: `ok`. Final foreign-key check: zero violations.
- Migration 105 applied transactionally to a separate local copy.
- Original **195 application tables / 2,737 rows** compared; no original
  table rows changed, according to the owner-run comparison.
- Two new payout tables; both empty. Seven payout SQL triggers present.
- Focused payout regressions: **38/38 pass**. D1 migration verifier passes.
- Full Worker API suite previously completed with exit code 0.

The earlier row-comparison command lacked guaranteed SQL ordering. The
reproducible read-only script introduced alongside this note compares
**order-independent row multisets** and schema objects and fails if the
required MoonPet unique index, any original data or one of the seven payout
triggers is missing. Run from the repository root, using the two existing
local copies; it never contacts production:

```powershell
node scripts/tag-run-105-offline-preflight.mjs
node --test scripts/tag-run-105-offline-preflight.test.mjs
```

For renamed local files, add `--before <path>` and `--after <path>`.
**Never commit, upload or paste the private SQL dump or restored DB content.**
The `.gitignore` patterns added with this preflight cover the known local
backup, rehearsal and scratch names; they are not a substitute for private
backup storage.

## Release decision and remaining gates

The suspected MoonPet defect and missing remote **read-only preflight** are
resolved. This is **not** permission to apply 105. Immediately before any
approved remote application, take/verify a fresh private backup and repeat the
remote migration inventory to ensure 105 alone is pending. Confirm Worker
feature flags are still fail-closed and obtain explicit owner approval for
applying 105 as an additive schema-only migration. **Do not** run a blanket
`wrangler d1 migrations apply --remote` without independently checking its
pending list. Afterwards, verify both new empty tables, seven triggers,
foreign keys, unchanged protected game state and the `d1_migrations` row.

The separate **token payout release** remains blocked on treasury custody,
qualified legal/security review, token/donation approval, independent protected
signer, finality monitoring and an individually authorized small transfer.
No flag flip, migration or code merge grants transfer authority by itself.