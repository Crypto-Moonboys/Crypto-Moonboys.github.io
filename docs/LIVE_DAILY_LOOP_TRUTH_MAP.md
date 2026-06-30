# Live Daily Loop Truth Map

Phase 1 creates one Worker-owned UTC Daily Loop authority:

- `GET /daily-loop/state` returns public anonymous state.
- `POST /daily-loop/state` returns Telegram-linked state and requires a fresh/restored signed `telegram_auth` payload.
- All dates use the UTC day key from the Worker, not browser local time.
- The daily-loop endpoint is an aggregator and should be fetched once per page/session by a shared frontend state layer.

The response always includes `source_status` for every subsystem. `live` is reserved for non-empty data read from Worker/D1 or confirmed Worker API state. Empty successful D1 reads use `live_empty`. Server-generated schedules, local fallback, absent migrations, and failed queries must not be called live.

## Response Contract

- `utc_day`
- `next_utc_reset_at`
- `identity`
- `sam_status`
- `faction_state`
- `daily_missions`
- `wiki_missions`
- `arcade_daily_state`
- `battle_chamber_activity`
- `daily_wtf_status`
- `missed_opportunities`
- `telegram_digest_group_status`
- `source_status`

## Source Status Rules

| Subsystem | Live authority | Anonymous behavior | Linked behavior | Non-live labels |
| --- | --- | --- | --- | --- |
| `identity` | `telegram_users` plus verified `telegram_auth` for linked requests | Returns `linked: false` | Returns verified Telegram identity and stored profile when present | `unavailable` when D1 table is missing |
| `sam_status` | Worker-confirmed `/sam/status` equivalent | Returns current Worker SAM status | Same | N/A |
| `faction_state` | `telegram_faction_members`, `telegram_factions`, `player_faction_signal_state` | Aggregate shell only, no personal faction | Current faction plus UTC-day/week contribution state | `unavailable` for missing tables |
| `daily_missions` | `player_daily_mission_state` | Empty anonymous list | Player mission progress for `utc_day` | `unavailable` for missing table |
| `wiki_missions` | `wiki_mission_completions` | Empty anonymous list | Player completions for `mission_window = utc_day` | `unavailable` for missing table |
| `arcade_daily_state` | `daily_opportunity_state` | No linked seed or chain depth | Reuses the same D1 daily opportunity row used by `/roguelite/daily-state` | `unavailable` for missing table |
| `battle_chamber_activity` | `battle_chamber_faction_clout`, `battle_chamber_activity_log` | Weekly standings and recent public activity | Same public authority for now | `unavailable` for missing tables |
| `daily_wtf_status` | `daily_wtf_events`, `daily_wtf_player_events`, `daily_wtf_chain_options` | Persisted D1 event rows when present | Persisted event rows plus player status when present | `preview` when only the server schedule exists; `unavailable` for missing tables |
| `missed_opportunities` | `daily_missed_perks` | Empty anonymous history | Player missed opportunity totals and recent rows | `unavailable` for missing table |
| `telegram_digest_group_status` | `telegram_daily_digest_log`, `telegram_group_announcement_log` | No personal digest status; public group rows only when linked contract asks later | Player digest row and group announcement rows for `utc_day` | `unavailable` for missing tables |

## UI Label Guidance

Use `source_status[section].state` as the display truth:

- `live`: Worker/D1 or confirmed API state.
- `live_empty`: Worker/D1 query succeeded, but there are no rows for the current scope.
- `preview`: server-generated schedule or planning data, not proof of live user activity.
- `migration_pending`: a required D1 table is not present yet.
- `query_failed`: a required D1 read failed; do not render that subsystem as live.
- `offline`: client-only cached UI state.
- `unavailable`: migration, binding, or upstream data is absent.

Homepage UI should not be replaced in this PR. Any existing label that implies fake client fallback is live should be changed to preview/offline/unavailable before later UI migration.
