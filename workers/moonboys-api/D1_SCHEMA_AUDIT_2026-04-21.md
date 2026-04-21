# wikicoms D1 schema audit (2026-04-21)

Remote database audited with:

```powershell
npx wrangler d1 migrations list wikicoms --remote
npx wrangler d1 execute wikicoms --remote --command "PRAGMA table_info(blocktopia_progression);"
npx wrangler d1 execute wikicoms --remote --command "PRAGMA table_info(blocktopia_progression_events);"
npx wrangler d1 execute wikicoms --remote --command "PRAGMA table_info(telegram_activity_log);"
npx wrangler d1 execute wikicoms --remote --command "PRAGMA table_info(telegram_xp_log);"
```

## Exact live drift

`blocktopia_progression`

- Live has: `telegram_id`, `xp`, `gems`, `tier`, `win_streak`, `upgrade_efficiency`, `upgrade_signal`, `upgrade_defense`, `upgrade_gem`, `upgrade_npc`, `rpg_mode_active`, `last_active`, `updated_at`, `network_heat`, `network_heat_updated_at`
- Live is missing: `faction`, `faction_xp`, `faction_last_switch`

`blocktopia_progression_events`

- Live has: `id`, `telegram_id`, `action`, `action_type`, `score`, `xp_change`, `gems_change`, `created_at`
- Live is missing: `admin_telegram_id`, `reason`

`telegram_activity_log`

- Live `id` type: `INTEGER PRIMARY KEY AUTOINCREMENT`
- Worker bug before this fix: code inserted UUID text into `id`

`telegram_xp_log`

- Live `id` type: `INTEGER PRIMARY KEY AUTOINCREMENT`
- Worker bug before this fix: code inserted UUID text into `id`

## Production-safe repair command

Run the schema repair directly instead of `wrangler d1 migrations apply wikicoms --remote`.

Reason:
- Wrangler currently reports `002_gk_commands.sql` through `010_blocktopia_progression_repair.sql` as unapplied remotely.
- The live database is only partially behind, so replaying the full backlog risks duplicate-table and duplicate-column failures.

Exact command:

```powershell
npx wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/011_wikicoms_live_schema_compat.sql --remote
```

Then deploy the worker with the runtime compatibility fixes:

```powershell
npx wrangler deploy
```
