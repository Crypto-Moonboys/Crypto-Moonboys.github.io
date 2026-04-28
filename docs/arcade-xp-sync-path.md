# Arcade XP Sync Path (Current Production Flow)

## Summary
- Players can always play arcade games before linking Telegram.
- Unsynced runs are stored locally in browser pending state.
- After `/gklink` succeeds on `gkniftyheads-incubator.html`, pending runs are submitted to the server sync route.
- Server verifies Telegram auth, applies anti-farm checks, and decides accepted XP.
- Accepted XP is written to shared community XP (`telegram_users.xp`) and appears on Community stats/leaderboard.

## Client flow
1. `submitScore()` runs in `js/leaderboard-client.js`.
2. If user is not linked:
   - score submission to remote leaderboard is skipped.
   - run is queued locally via `ArcadeSync.queuePendingProgress(...)`.
3. If linked and score is accepted:
   - existing leaderboard flow remains active.
   - run is queued and `ArcadeSync.syncPendingArcadeProgress()` is called.
4. On `/gklink` completion (`js/incubator-link.js`):
   - pending queue sync is triggered immediately (no need to play another run first).

## Server route
- Endpoint: `POST /arcade/progression/sync`
- File: `workers/moonboys-api/worker.js`
- Auth: signed `telegram_auth` payload validation (same trust model as other protected routes).
- Idempotency: dedupe by `(telegram_id, client_run_id)` in `arcade_progression_events`.
- Authority:
  - server computes normalized points from score/meta inputs.
  - server applies caps, weight, cooldown/lockout checks.
  - server awards XP with `awardXp(...)` into `telegram_users` + `telegram_xp_log`.

## Anti-farm scaffolding included
- Per-game ceiling hit detection.
- Repeat-window detection.
- Game-only cooldown ladder levels.
- Per-game XP weight reduction / recovery.
- Per-game lockout escalation.
- Daily XP cap clamp at shared arcade layer.
- Whole-arcade restriction field exists in state table for future escalation policy.

## Data tables
- `arcade_progression_state`
- `arcade_progression_events`
- `arcade_game_enforcement_state`

Defined in:
- `workers/moonboys-api/schema.sql`
- `workers/moonboys-api/migrations/014_shared_arcade_progression_sync.sql`

## Notes
- Leaderboard ranking remains score-based.
- Existing Block Topia progression route remains intact.
- Existing Invaders accepted-score path remains intact and now also participates in shared progression sync.
