# D1 Migration Runbook — wikicoms

_Last updated: 2026-04-30_

---

## 1. Normal production migration command

Use this as the **default** command for every new migration deployment:

```sh
npx wrangler d1 migrations apply wikicoms \
  --remote \
  --config workers/moonboys-api/wrangler.toml
```

Wrangler will apply every migration file in `workers/moonboys-api/migrations/` that has not
yet been recorded in the D1 internal migration-tracking table, in filename order.

---

## 2. Emergency single-file apply

**Only use this when the normal migration chain is blocked** (e.g. an earlier migration fails
and you need to apply a specific file to unblock production).

```sh
npx wrangler d1 execute wikicoms \
  --remote \
  --config workers/moonboys-api/wrangler.toml \
  --file workers/moonboys-api/migrations/015_player_server_state.sql
```

Replace the filename with the migration you need to apply.

> ⚠️ **WARNING:** `wrangler d1 execute` applies the SQL to the database **but does NOT record
> the migration in Wrangler's migration-tracking table (`d1_migrations`)**.  If you use this
> command, you must manually mark the migration as applied (see step 3 below) or future runs
> of `wrangler d1 migrations apply` will attempt to re-apply the file.

---

## 3. Marking a migration as applied after a manual `d1 execute`

After using the emergency single-file apply, record the migration in the tracking table:

```sh
npx wrangler d1 execute wikicoms \
  --remote \
  --config workers/moonboys-api/wrangler.toml \
  --command "INSERT OR IGNORE INTO d1_migrations (name, applied_at) VALUES ('015_player_server_state.sql', datetime('now'));"
```

Verify it was recorded:

```sh
npx wrangler d1 execute wikicoms \
  --remote \
  --config workers/moonboys-api/wrangler.toml \
  --command "SELECT name, applied_at FROM d1_migrations ORDER BY applied_at;"
```

---

## 4. Required verification after any production migration

### Deploy the worker

```sh
npx wrangler deploy \
  --config workers/moonboys-api/wrangler.toml
```

### Health check

```sh
curl -s https://moonboys-api.sercullen.workers.dev/health | jq .
```

Expected: `{ "ok": true }` or equivalent.

### Player state endpoint check (requires a valid Telegram auth token)

```sh
curl -s -H "Authorization: TelegramAuth <signed_auth>" \
  https://moonboys-api.sercullen.workers.dev/player/state | jq .
```

Expected: a JSON object with `modifier`, `missions`, `streaks`, `mastery` keys.

### D1 table existence checks

Verify the new migration tables exist in production:

```sh
# Migration 015 tables
npx wrangler d1 execute wikicoms --remote \
  --config workers/moonboys-api/wrangler.toml \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN (
    'player_modifier_state',
    'player_daily_mission_state',
    'player_faction_signal_state',
    'player_streak_state',
    'player_game_mastery_state'
  ) ORDER BY name;"
```

Expected: all 5 table names returned.

```sh
# Migration 014 tables
npx wrangler d1 execute wikicoms --remote \
  --config workers/moonboys-api/wrangler.toml \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN (
    'arcade_progression_state',
    'arcade_progression_events',
    'arcade_game_enforcement_state'
  ) ORDER BY name;"
```

---

## 5. Recovery from a blocked migration chain

If `wrangler d1 migrations apply` fails partway through:

1. **Identify the failing migration** from the error message.
2. **Read the migration file** — check the comments at the top for production safety notes.
3. **If the failure is "duplicate column name"** — a column from this migration already
   exists in production.  **Do not immediately mark the migration as applied.**

   > ⚠️ **IMPORTANT:** A "duplicate column name" error fires on the *first* conflicting
   > `ALTER TABLE` statement and stops processing immediately.  Any *later* `ALTER TABLE`
   > statements in the same migration file may **not** have run yet.  If you mark the
   > migration applied without verifying every change, you can silently leave columns or
   > indexes missing from production.

   **Required verification before marking applied:**

   a. Open the migration file and list every `ALTER TABLE … ADD COLUMN`, `CREATE TABLE`,
      and `CREATE INDEX` statement it contains.

   b. For each table that is altered or created, run PRAGMA inspection:

      ```sh
      npx wrangler d1 execute wikicoms --remote \
        --config workers/moonboys-api/wrangler.toml \
        --command "PRAGMA table_info('<table_name>');"
      ```

      Confirm that **every expected column** from the migration is present in the returned
      `name` column.

   c. For each index the migration creates, verify it exists:

      ```sh
      npx wrangler d1 execute wikicoms --remote \
        --config workers/moonboys-api/wrangler.toml \
        --command "SELECT name FROM sqlite_master WHERE type='index' AND name='<index_name>';"
      ```

   d. **Only if every column and index from the migration is confirmed present** in
      production, mark the migration applied:

      ```sh
      npx wrangler d1 execute wikicoms --remote \
        --config workers/moonboys-api/wrangler.toml \
        --command "INSERT OR IGNORE INTO d1_migrations (name, applied_at) \
                   VALUES ('005_blocktopia_faction_alignment.sql', datetime('now'));"
      ```

      Repeat for each migration that is fully present in production.

   e. **If any column or index from the migration is missing** — do NOT mark the migration
      applied.  Instead, create a new repair migration that adds only the missing items.
      See §6 for the rule on never deleting or skipping partially-applied migrations.

4. **If the failure is "no such table"** — a CREATE TABLE is missing.  Check
   `docs/D1_MIGRATION_HISTORY_AUDIT.md` for the root cause and correct fix before proceeding.

5. **Re-run** `wrangler d1 migrations apply` after skipping/fixing the blocked migration.

---

## 6. Critical rule — do not delete migration files

> **Never delete a migration file that production has seen.**

Wrangler uses migration filenames as stable identifiers in the `d1_migrations` tracking table.
Removing a file confuses Wrangler's state and makes future migrations unpredictable.

If a migration is broken and must be replaced, create a **new numbered migration** that repairs
the state — do not modify or delete the broken one without first auditing the full chain.

---

## 7. Known production quirks

| Issue | Details |
|---|---|
| No `001_initial.sql` | The initial schema was applied via `schema.sql`, not Wrangler migrations.  Wrangler has no record of the initial tables. |
| `002` blocked on `telegram_profiles` | Fixed in this PR by adding `CREATE TABLE IF NOT EXISTS telegram_profiles`. |
| Duplicate-column failures in 005, 006, 009, 011, 013 | Production columns already exist from a manual 011 repair.  Use step 5 above — verify every column and index from each migration exists in production before marking it applied. |
| `012` drops `blocktopia_progression` | This is a destructive rebuild migration.  Only run when directed.  Faction XP is preserved only if rows were inserted with faction defaults. |
