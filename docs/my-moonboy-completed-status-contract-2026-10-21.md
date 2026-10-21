# My Moonboy — consistent completed activity indicators

## Product rule

After the canonical source confirms that a mission, claim, quest, task or other tracked activity has finished, My Moonboy displays **✅ Completed** in the mission ledger, per-MoonPet task list and comprehensive source checklist. The completion indicator is read-only and is derived solely from signed `/player/action-plan` state; it never marks a task complete or awards anything itself.

## Evidence and status requirements

A completed tick is allowed only when all three are true:

1. The task status is `complete` or `claimed`.
2. Its `source_health` is `live`.
3. Its evidence is `server_receipt` or `server_projection` with an explicit `verified_completion: true`.

`claim_ready` is **not completed**. `in_progress`, `ready`, `waiting`, `blocked`, `preview`, `expired`, local `client_mirror` flags, progress counters and missing/malformed source evidence are **not completed**. Unavailable source results do not establish completion. No claimant can self-tick.

The Mission Guide exports the pure `verifiedDone(task)` rule so its checklist, the client mission ledger and the individual MoonPet task list share exactly the same completion decision. The Completed status filter likewise restricts to server-confirmed completion. The Worker uses an equivalent `isVerifiedCompletion(task)` predicate for the **Completed today** and **completed count** summary metrics, so the displayed counts no longer include unverified client status strings. Contract tests exhaustively check guide/Worker predicate parity. Rows remain attributed to the original earning MoonPet and preserve their original period: a prior-day task can remain complete for its historical period while a newly reset daily period has its own distinct task.

## Refresh, privacy, consistency

- On accepted activity events, My Moonboy already invalidates and refreshes its signed plan; completed ticks become visible after that authoritative refresh, **not** immediately from an untrusted browser event.
- When stale/offline, the client shows the last-confirmed status as historical, without current **✅ Completed** indicators. A fresh signed read can restore the completion indicator.
- Logout, account switching and session expiration clear private task DOM synchronously.
- Missing integration is never represented as completed. An activity not returned by `/player/action-plan` remains unknown until an adapter is implemented.

## Verification

- Unit tests cover claimed and completed server receipts, explicitly verified server projections, claim-ready exclusion, client mirror/preview exclusion and invalid source-health exclusion.
- Worker summary tests prove that unverified `complete` task statuses never inflate Completed today, while current-day accepted server completions are counted.
- Canonical persisted MoonPet daily completion flag rows explicitly expose their accepted source-projection proof. Without saved per-owner UTC-day flags, they do not earn a completion tick.
- 390px browser regression covers consistent labels across checklist, ledger and MoonPet card, Completed filtering, offline invalidation and account logout.
- Before merge: latest-head Worker/API, Visual and static tests, and GitHub review.
- Before acceptance: signed-player examples of MoonPet, faction, Telegram Community and Wiki completion, confirming that only actual accepted records render ticks and activity resets retain period-specific correctness.

## Deploy

Frontend and Worker summary-source change: GitHub Pages publishes automatically on merge. **Deploy `moonboys-api` from clean updated `main` using `node scripts/deploy-worker-with-provenance.mjs moonboys-api`** so summary counts and accepted source-flag proof match the UI. No D1 migration, Telegram bot change or VPS restart.

**HOLD merge until current-head CI and explicit GK approval.**
