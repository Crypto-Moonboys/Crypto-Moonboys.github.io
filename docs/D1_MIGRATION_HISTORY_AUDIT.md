# D1 Migration History Audit — wikicoms

_Last updated: 2026-04-30_

## Background

The `wikicoms` D1 database was bootstrapped from `workers/moonboys-api/schema.sql` rather than
through the Wrangler migration chain.  As a result, Wrangler's internal migration-tracking table
(`d1_migrations`) showed migrations **002–010 (and beyond) as unapplied** even though several
of those columns/tables already existed in the live database.

Running the normal migration apply command:

```
npx wrangler d1 migrations apply wikicoms --remote --config workers/moonboys-api/wrangler.toml
```

**failed on the first unapplied migration** with:

```
Error: no such table: telegram_profiles
```

This happened because `002_gk_commands.sql` unconditionally runs:

```sql
ALTER TABLE telegram_profiles ADD COLUMN link_confirmed INTEGER NOT NULL DEFAULT 0;
```

`telegram_profiles` was an early design artefact that was **never included** in the live
production schema.  `schema.sql` explicitly documents it as an abandoned table:

```sql
-- It does NOT invent the abandoned/new model tables:
-- - telegram_profiles
```

---

## Migration file inventory

> **Note:** There is no `001_initial.sql`.  The initial schema was applied directly via
> `schema.sql`, not through Wrangler migrations.

### `002_gk_commands.sql`

| Property | Value |
|---|---|
| Tables created | `telegram_link_tokens` (with `CREATE TABLE IF NOT EXISTS`) |
| Tables created (compat stub) | `telegram_profiles` — **added by this fix** |
| Columns added | `telegram_profiles.link_confirmed` |
| Dependencies | `telegram_profiles` must exist before `ALTER TABLE` |
| Uses `CREATE TABLE IF NOT EXISTS` | ✅ for `telegram_link_tokens`; ✅ now for `telegram_profiles` |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Safe on existing production D1 | ✅ after fix |
| Unsafe / order-dependent | ⚠️ `ALTER TABLE` will fail with "duplicate column name" on repeat runs (expected, safe to ignore) |

**Root cause of production failure:**
`telegram_profiles` did not exist in production.  The `ALTER TABLE` tried to modify a
non-existent table and failed with `no such table: telegram_profiles`.

**Fix applied:** Added `CREATE TABLE IF NOT EXISTS telegram_profiles` with the minimal columns
required (`telegram_id`, `username`, `first_name`, `last_name`, `linked_at`, `updated_at`) before
the `ALTER TABLE` statement.  The current worker does not read from `telegram_profiles`; the stub
is a compatibility shim only.

---

### `003_anticheat.sql`

| Property | Value |
|---|---|
| Tables created | `telegram_anticheat_state`, `telegram_anticheat_events` |
| Uses `CREATE TABLE IF NOT EXISTS` | ✅ |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Safe on existing production D1 | ✅ |
| Unsafe / order-dependent | ❌ none |

Both tables have a `FOREIGN KEY … REFERENCES telegram_users`.  `telegram_users` is created by
`schema.sql` / the initial bootstrap and is safe to assume exists before migration 003 runs.

---

### `004_blocktopia_progression.sql`

| Property | Value |
|---|---|
| Tables created | `blocktopia_progression`, `blocktopia_progression_events` |
| Uses `CREATE TABLE IF NOT EXISTS` | ✅ |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Safe on existing production D1 | ✅ (no-op if tables already exist) |
| Unsafe / order-dependent | ❌ none |

---

### `005_blocktopia_faction_alignment.sql`

| Property | Value |
|---|---|
| Tables altered | `blocktopia_progression` — adds `faction`, `faction_xp`, `faction_last_switch` |
| Uses `CREATE TABLE IF NOT EXISTS` | N/A |
| Uses `ALTER TABLE` guard | ⚠️ none (SQLite/D1 does not support `ALTER TABLE … ADD COLUMN IF NOT EXISTS`) |
| Safe on existing production D1 | ⚠️ will fail with "duplicate column name" if columns already exist (see note below) |
| Unsafe / order-dependent | ⚠️ depends on `blocktopia_progression` existing (created by 004) |

**Note:** If migration `011_wikicoms_live_schema_compat.sql` was manually applied before the
Wrangler chain is run, these columns already exist and this `ALTER TABLE` will fail with
"duplicate column name".  That failure is **expected and safe to skip** — the columns are
already present with the correct types.

A comment was added to the file documenting this expected behaviour.

---

### `006_blocktopia_admin_grants.sql`

| Property | Value |
|---|---|
| Tables altered | `blocktopia_progression_events` — adds `admin_telegram_id`, `reason` |
| Uses `ALTER TABLE` guard | ⚠️ none |
| Safe on existing production D1 | ⚠️ same duplicate-column caveat as 005 |
| Unsafe / order-dependent | ⚠️ depends on `blocktopia_progression_events` (created by 004) |

A comment was added documenting the expected failure mode.

---

### `007_blocktopia_covert_agents.sql`

| Property | Value |
|---|---|
| Tables created | `blocktopia_covert_agents`, `blocktopia_covert_operations` |
| Uses `CREATE TABLE IF NOT EXISTS` | ✅ |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Safe on existing production D1 | ✅ |
| Unsafe / order-dependent | ❌ none |

---

### `008_blocktopia_covert_phase_2.sql`

| Property | Value |
|---|---|
| Tables altered | `blocktopia_covert_agents` (2 cols), `blocktopia_covert_operations` (8 cols) |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Uses `ALTER TABLE` guard | ⚠️ none |
| Safe on existing production D1 | ⚠️ duplicate-column caveat if tables were bootstrapped from full `schema.sql` |
| Unsafe / order-dependent | ⚠️ depends on 007 tables |

A comment was added documenting expected failure modes.

---

### `009_blocktopia_covert_phase_3_pressure.sql`

| Property | Value |
|---|---|
| Tables altered | `blocktopia_progression` (2 cols), `blocktopia_covert_agents` (2 cols) |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Uses `ALTER TABLE` guard | ⚠️ none |
| Safe on existing production D1 | ⚠️ `network_heat` / `network_heat_updated_at` already exist in live production — will fail with "duplicate column name" |
| Unsafe / order-dependent | ⚠️ depends on 004 and 007 |

A comment was added documenting expected failure modes.

---

### `010_blocktopia_progression_repair.sql`

| Property | Value |
|---|---|
| Tables created | `blocktopia_progression`, `blocktopia_progression_events` (full schema snapshot) |
| Uses `CREATE TABLE IF NOT EXISTS` | ✅ |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Safe on existing production D1 | ✅ (no-op if tables exist) |
| Unsafe / order-dependent | ❌ none |

This is a full-schema repair no-op migration that recreates both tables with all columns
known at the time of writing.  Safe to re-run.

---

### `011_wikicoms_live_schema_compat.sql`

| Property | Value |
|---|---|
| Tables altered | `blocktopia_progression` (3 cols), `blocktopia_progression_events` (2 cols) |
| Uses `ALTER TABLE` guard | ⚠️ none |
| Safe on existing production D1 | ⚠️ will fail if 005 + 006 were already applied |
| Purpose | One-time compatibility repair for DBs bootstrapped from schema.sql without running 005/006 |

This migration was manually applied to production on 2026-04-21 via:

```
npx wrangler d1 execute wikicoms \
  --file=workers/moonboys-api/migrations/011_wikicoms_live_schema_compat.sql \
  --remote
```

If Wrangler tries to apply this as part of the normal chain (i.e. migrations 002-010 run
first), both `005` and `006` will already have added the columns and this migration will
fail with "duplicate column name".  That is **expected and safe to ignore**.

An expanded comment was added documenting this behaviour.

---

### `012_wikicoms_schema_fix.sql`

| Property | Value |
|---|---|
| Tables dropped & rebuilt | `blocktopia_progression` (DROP + full rebuild with rename) |
| Uses `DROP TABLE IF EXISTS` | ✅ for temp tables; ⚠️ bare `DROP TABLE blocktopia_progression` |
| Safe on existing production D1 | ⚠️ destructive — drops and recreates `blocktopia_progression`; copies data forward without `faction` columns via INSERT SELECT |
| Unsafe / order-dependent | ⚠️ requires `blocktopia_progression` to exist |

**Risk note:** The `DROP TABLE blocktopia_progression` and INSERT SELECT in this migration
preserves core progression data but drops `faction`/`faction_xp`/`faction_last_switch` if
they were added by 005 or 011 and not yet included in the rebuild's INSERT SELECT column
list.  The rebuild _does_ include `faction`/`faction_xp`/`faction_last_switch` in the target
schema, so those columns will exist in the final table with default values — but any live
faction data from rows inserted before this migration may need backfill.

This migration was added as part of a known repair cycle and should only be applied when
directed in the runbook.

---

### `013_blocktopia_phase_4_enforcement.sql`

| Property | Value |
|---|---|
| Tables altered | `blocktopia_progression` — adds 7 PPS / cooldown / mini-game columns |
| Uses `ALTER TABLE` guard | ⚠️ none |
| Safe on existing production D1 | ⚠️ will fail with "duplicate column name" if columns exist from schema.sql bootstrap |
| Unsafe / order-dependent | ⚠️ depends on `blocktopia_progression` (004) |

A comment was added documenting expected failure modes.

---

### `014_shared_arcade_progression_sync.sql`

| Property | Value |
|---|---|
| Tables created | `arcade_progression_state`, `arcade_progression_events`, `arcade_game_enforcement_state` |
| Uses `CREATE TABLE IF NOT EXISTS` | ✅ |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Safe on existing production D1 | ✅ |
| Unsafe / order-dependent | ❌ none |

---

### `015_player_server_state.sql`

| Property | Value |
|---|---|
| Tables created | `player_modifier_state`, `player_daily_mission_state`, `player_faction_signal_state`, `player_streak_state`, `player_game_mastery_state` |
| Uses `CREATE TABLE IF NOT EXISTS` | ✅ |
| Uses `CREATE INDEX IF NOT EXISTS` | ✅ |
| Safe on existing production D1 | ✅ |
| Unsafe / order-dependent | ❌ none |

---

## Summary of unsafe patterns

| Migration | Pattern | Risk | Fixed |
|---|---|---|---|
| `002` | `ALTER TABLE telegram_profiles` — table never existed | **HARD FAILURE** (`no such table`) | ✅ Added `CREATE TABLE IF NOT EXISTS telegram_profiles` |
| `005` | Bare `ALTER TABLE` — no guard | Fails on re-run / after 011 | ✅ Comment added |
| `006` | Bare `ALTER TABLE` — no guard | Fails on re-run / after 011 | ✅ Comment added |
| `008` | Bare `ALTER TABLE` — no guard | Fails if bootstrapped from full schema.sql | ✅ Comment added |
| `009` | Bare `ALTER TABLE` — no guard | `network_heat` already in production | ✅ Comment added |
| `011` | Bare `ALTER TABLE` — duplicates 005+006 | Fails if 005+006 applied first | ✅ Comment added |
| `012` | `DROP TABLE blocktopia_progression` | Destructive; data loss risk for faction data | ⚠️ No change; addressed in runbook |
| `013` | Bare `ALTER TABLE` — no guard | Fails if schema.sql was used to bootstrap | ✅ Comment added |

---

## Will normal `wrangler d1 migrations apply` work after this fix?

**The primary blocker (002 hard-failing with "no such table") is resolved.**

However, the migration chain still contains bare `ALTER TABLE` statements (005, 006, 008, 009,
011, 013) that **will fail with "duplicate column name"** if those columns already exist in
production (which they do, given that 011 was manually applied).

These failures are **safe to ignore** — they indicate the column is already present — but
Wrangler's default behaviour is to halt on any SQL error.

**Recommended production path:** use the emergency single-file apply for any remaining
unapplied migration that doesn't overlap with existing production schema, then use
`wrangler d1 execute` to mark the migration table as up-to-date.  See
`docs/D1_MIGRATION_RUNBOOK.md` for the exact procedure.
