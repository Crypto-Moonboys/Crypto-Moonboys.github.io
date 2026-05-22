# Roguelite XP Loop Contract

**Version:** 2026-05
**Scope:** Frontend arcade post-run sequence only. No Worker/API/D1/VPS scope.

This document defines the canonical contract for the Roguelite XP Loop across
all live Moonboys Arcade games. Every active game must comply with this contract.
Where a game cannot comply, the reason must be documented in its bootstrap file.

---

## Canonical 8-Game Roster

| Public title | URL path | Manifest ID | Bootstrap |
|---|---|---|---|
| Invaders 3008 | `/games/invaders-3008/` | `invaders` | `js/arcade/games/invaders/bootstrap.js` |
| Pac-Chain | `/games/pac-chain/` | `pacchain` | `js/arcade/games/pac-chain/bootstrap.js` |
| Asteroid Fork | `/games/asteroid-fork/` | `asteroids` | `js/arcade/games/asteroid-fork/bootstrap.js` |
| Breakout Bullrun | `/games/breakout-bullrun/` | `breakout` | `js/arcade/games/breakout-bullrun/bootstrap.js` |
| Tetris Block Topia | `/games/tetris-block-topia/` | `tetris` | `js/arcade/games/tetris/bootstrap.js` |
| Crystal Quest | `/games/crystal-quest/` | `crystal` | `js/arcade/games/crystal-quest/bootstrap.js` |
| Block Topia Quest Maze | `/games/block-topia-quest-maze/` | `blocktopia` | `js/arcade/games/block-topia-quest-maze/bootstrap.js` |
| Snake Run | `/games/snake-run/` | `snake` | `js/arcade/games/snake-run/bootstrap.js` |

**HexGL is permanently retired.** No HexGL game ID, bootstrap path, or manifest
entry must appear in any active arcade file. The `repo-consistency-audit.mjs`
checks that retired HexGL directories do not exist on disk, and
`arcade-roguelite-protection.test.mjs` checks that no active bootstrap references
HexGL.

---

## Post-Run Sequence

Every game's post-run path calls `submitScore(player, score, gameId)` from
`js/leaderboard-client.js`.  The shared function handles the full sequence:

```
1. score = Math.floor(score)          — normalize to safe integer
2. GET player identity / linked state  — from MOONBOYS_IDENTITY
3. Attempt Telegram auth restore       — ArcadeSync.getTelegramAuth()
4. POST public leaderboard score       — leaderboard worker
   ├─ accepted === true                → mark sync health good
   ├─ accepted === false               → state "rejected_no_xp"
   └─ HTTP error / network fail        → state "sync_error" or "auth_expired"
5. If linked + signed auth + accepted:
   ├─ callFactionEarn("score_accept")  — server faction XP
   └─ (blocktopia only)
      syncBlockTopiaProgressionOnAcceptedScore()
6. ArcadeMeta.trackGameResult(...)     — local roguelite meta (always runs)
   ├─ updates daily/weekly/monthly/seasonal clout windows
   ├─ updates streak state
   ├─ refreshes loop-cycle state and next-action hints
   └─ rolls rabbit-hole branch choices
7. ArcadeSync.queuePendingProgress()   — write to local pending queue
   ├─ always writes for unlinked users
   └─ writes for linked users only when accepted === true
8. If linked + signed auth + meta tracked:
   └─ submitMetaScore()               — server meta sync attempt
9. ArcadeSync.syncPendingArcadeProgress() — flush pending queue
   └─ only runs when linked + signed auth is present
```

The sequence is complete regardless of whether the user is Telegram-linked.
Games that call `submitScore` without `await` (fire-and-forget, e.g. in a
synchronous render-loop tick) still participate fully: the async path completes
on the browser event loop after the synchronous tick frame returns.

---

## Public Score Submission vs Competitive XP Sync

These are **distinct outcomes**. A caller must never conflate them.

| State label | Meaning |
|---|---|
| `"pending_submit"` | Initial state; submission not yet attempted |
| `"local_cached_only"` | Unlinked user; no remote submission possible |
| `"public_submit_unsigned"` | Linked user but signed auth missing; public POST skipped; XP pending |
| `"auto_submitting"` | API POST in flight |
| `"score_accepted"` | Leaderboard accepted the score; linked + signed auth present |
| `"public_score_submitted"` | Leaderboard accepted score but linked user lacks signed auth; no XP sync |
| `"rejected_no_xp"` | Leaderboard did not accept; no XP conversion |
| `"sync_error"` | Network or server error |
| `"auth_expired"` | Telegram auth expired; re-link required |
| `"sync_pending"` | Linked user but API unavailable; run queued for retry |
| `"xp_awarded"` | (Block Topia only) Accepted score converted to BT XP |
| `"accepted_no_xp"` | (Block Topia only) Score accepted but XP sync did not complete |

**Never use `xp_synced`, `xp_confirmed`, or similar labels for unlinked users.**
Only `"score_accepted"` + a successful `syncPendingArcadeProgress` response
with `accepted` entries constitutes a confirmed competitive XP sync.

---

## Telegram-Linked vs Unlinked Behavior

### Linked user with signed auth present

1. Leaderboard POST includes `telegram_auth` and `telegram_id`.
2. If accepted: faction earn runs, meta syncs, pending queue flushes to server.
3. XP sync state reflects actual server response (`accepted`, `duplicate`, `rejected`).
4. Block Topia additionally converts accepted score to character XP.

### Linked user with signed auth missing (expired)

1. Leaderboard POST is attempted **without** `telegram_auth` (public-only).
2. State is set to `"public_submit_unsigned"`.
3. Run is not queued in the pending XP queue (no auth = no XP conversion pending).
4. User is shown a prompt to refresh their Telegram link.

### Unlinked user

1. No `telegram_auth` is attached to any request.
2. Public leaderboard POST proceeds with display name only.
3. State is set to `"local_cached_only"` when the API is available.
4. Run is always queued via `ArcadeSync.queuePendingProgress` for future sync.
5. **No XP sync, faction earn, or meta server sync is attempted.**
6. After `/gklink` completes, `ArcadeSync.syncPendingArcadeProgress` is called
   immediately to flush all queued runs.

---

## Retry Queue Behavior

- **Storage key:** `moonboys_arcade_pending_progress_v1` (localStorage)
- **Max entries:** 250 (older entries are dropped; recent runs are preserved)
- **Write trigger:** `ArcadeSync.queuePendingProgress({game, raw_score, meta_points, ...})`
- **Flush trigger:** `ArcadeSync.syncPendingArcadeProgress()`
  — runs when: (a) linked user submits an accepted run, (b) `/gklink` completes,
    (c) connection-status-panel detects auth recovery.
- **Batch size:** 25 entries per server request.
- **Idempotency:** Server dedupes by `(telegram_id, client_run_id)`.
- **On network failure:** Entire batch is kept in the queue; no data is dropped.
- **On server accept/duplicate/reject:** Entry is removed from the queue.
- **On unrecognized server status:** Entry is kept for retry.

---

## Local Meta / Rabbit-Hole Preview Behavior

`ArcadeMeta.trackGameResult(...)` (in `js/arcade-meta-system.js`) runs on every
run, regardless of Telegram link state. It is frontend-only and does not write
to the server directly.

Updates applied locally on every run:

| Update | Description |
|---|---|
| Daily clout window | Points accumulated today (UTC-reset) |
| Weekly clout window | Points accumulated this week |
| Monthly clout window | Points accumulated this month |
| Seasonal clout window | Points accumulated this season |
| Streak state | Consecutive-day win streak |
| Faction clout | Per-faction contribution weight |
| Game mastery clout | Per-game familiarity score |
| Loop-cycle state | Shared daily/weekly/monthly/seasonal preview cycle |
| Next-action hint | Suggested next roguelite step |
| Rabbit-hole branches | Six local choice branches rolled each run |
|  | (easy, risk, faction, competitive, exploration, comeback) |
| Daily roguelite tasks | Engagement loops completed/pending |

These are **browser-authoritative preview values** — they are not server-confirmed.
The server remains authoritative for accepted XP, dedupe, and caps.

---

## What Must Be True Before Claiming "XP Synced"

The following conditions must all be met before any UI element claims that
Arcade XP has been synced to the server:

1. User is Telegram-linked (`isTelegramLinked() === true`).
2. Signed Telegram auth is present (`hasSignedAuth === true`).
3. Leaderboard accepted the score (`data.accepted === true`).
4. `ArcadeSync.syncPendingArcadeProgress()` completed without error.
5. The sync response contains at least one entry with `status === "accepted"`.

If any condition is false, the correct state is one of:
`"local_cached_only"`, `"sync_pending"`, `"public_submit_unsigned"`,
`"public_score_submitted"`, `"auth_expired"`, or `"sync_error"`.

---

## BTQM Special Rules

Block Topia Quest Maze participates in the standard post-run sequence with these
additions:

- When `gameKey === "blocktopia"` and linked + signed auth present,
  `ArcadeSync.syncBlockTopiaProgressionOnAcceptedScore()` additionally calls
  `POST /blocktopia/progression/mini-game` for character XP conversion.
- BTQM generated assets, runtime tilesets, combat assets, and progression sync
  paths must not be modified by any arcade-loop wiring change.
- BTQM fallback behavior (score accepted without BT XP sync completing) is
  handled with state `"accepted_no_xp"` rather than a false XP claim.

---

## Anti-Drift Checks

The following CI tests enforce this contract:

| Test file | What it enforces |
|---|---|
| `scripts/arcade-roguelite-protection.test.mjs` | All 8 games import and call `submitScore`; no HexGL; no bypass of shared path; sync-state separation; audit comment presence; pending queue key consistency |
| `scripts/leaderboard-client-regression.test.mjs` | `submitScore` behavior: signed auth, unsigned fallback, API-unavailable queuing, unlinked local-only, state separation |
| `scripts/arcade-architecture-audit.mjs` | Manifest integrity; no orphaned game directories |
| `scripts/arcade-game-parity-audit.mjs` | Faction + mission hooks present in all active bootstraps |
| `scripts/repo-consistency-audit.mjs` | Retired HexGL directories absent from disk |

Run `npm test` to execute all checks.

---

## Related Documents

- `docs/arcade-xp-sync-path.md` — Production client/server flow detail
- `ARCADE_RUNTIME_TRUTH.md` — Active roster and single-path truths
- `js/arcade-sync.js` — Pending queue and sync transport
- `js/leaderboard-client.js` — Shared `submitScore()` gateway
- `js/arcade-meta-system.js` — Local roguelite meta engine
