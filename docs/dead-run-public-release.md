# Dead Run — Telegram GPS Survival Public Release

## Purpose

Dead Run is a Telegram Mini App where the phone is the player marker. A ranked run starts from an authenticated Telegram account and a fresh GPS fix, gives a 60-second head start, then releases a deterministic zombie horde around the run origin. Physical movement produces server-verified distance and charge. Ammo and slowdown pickups are attached to the generated route, while global horde events aggregate kills across players.

This release deliberately treats the browser as untrusted. The client renders the experience; D1 + the Moonboys API own ranked state, XP, persistent statistics, action idempotency, leaderboard results, and anti-cheat decisions.

## Public surface

- Mini App: `/games/dead-run/`
- Production Telegram Games launcher: `/games/telegram/`
- Production bot/menu Mini App URL: `https://cryptomoonboys.com/games/telegram/?v=20260902-games-shell-v2`
- API base: the existing Moonboys API Worker
- API prefix: `/api/dead-run`
- Storage: production `wikicoms` D1 database
- Telegram identity: signed Telegram Mini App `initData`, verified with the existing `TELEGRAM_BOT_TOKEN`

## Server-authoritative API

| Method | Route | Authority |
| --- | --- | --- |
| POST | `/api/dead-run/profile` | Telegram identity, persistent player stats, daily ranked allowance, active session |
| POST | `/api/dead-run/session/start` | Telegram identity, fresh GPS, ranked quota, seeded route/combat plan |
| POST | `/api/dead-run/session/resume` | Owned active session only |
| POST | `/api/dead-run/session/telemetry` | Sequence/timestamp/accuracy/physics checks; server distance + charge |
| POST | `/api/dead-run/session/action` | Idempotent shoot/pickup/slow/shove settlement |
| POST | `/api/dead-run/session/finish` | Server score, ranked decision, XP, streaks, records, global horde contribution |
| GET | `/api/dead-run/leaderboard` | Public score/survival/distance leaderboard |
| GET | `/api/dead-run/horde/current` | Current six-hour global horde aggregate |

## D1 migration 075

`workers/moonboys-api/migrations/075_dead_run_gps_survival.sql` adds:

- `dead_run_players` — persistent Dead Run progression and records.
- `dead_run_sessions` — authoritative run lifecycle, anti-cheat state and transient active-run coordinates.
- `dead_run_actions` — idempotent accepted/rejected combat and pickup actions.
- `dead_run_horde_events` — six-hour community events.
- `dead_run_horde_contributions` — per-player event contribution.

A partial unique index enforces one active run per Telegram user. Leaderboard indexes are included for score, survival and distance.

### Location privacy

Precise start/last coordinates exist only to validate an active ranked session. On normal finish, rejection, abandonment or expiry the API clears `start_lat`, `start_lng`, `last_lat` and `last_lng`. Persistent records retain aggregate distance, score, kills and timings, not the route trace.

## Anti-GPS-spoofing model

Browser GPS cannot be made cryptographically impossible to spoof. The release therefore uses layered server-side fraud resistance rather than claiming perfect spoof prevention:

- signed Telegram identity;
- fresh initial fix and accuracy threshold;
- monotonic client sequence numbers;
- monotonic sample timestamps;
- server clock-skew limits;
- accuracy rejection/down-weighting;
- segment-distance sanity limits;
- impossible-speed rejection;
- suspicious high-speed and acceleration scoring;
- charge derived only from accepted server distance;
- ranked runs automatically demoted when risk crosses the threshold;
- high-risk settlement rejection;
- pickup proximity checked against the last server-accepted position;
- shooting rate, range, ammo, wave and duplicate-target checks;
- server blocks shooting while the runner is moving faster than a safe interaction threshold.

This makes ordinary client tampering materially harder, but a determined attacker controlling device location inputs can still fabricate plausible traces. Future native attestation can strengthen this if the product moves beyond a WebApp.

## XP + progression

Ranked settlement writes to the existing shared Arcade progression authority instead of creating a parallel currency:

- lifetime Arcade XP (`arcade_progression_state`);
- spendable Arcade XP (`arcade_xp_wallets`);
- immutable per-run progression event (`arcade_progression_events`, game=`dead-run`);
- activity log audit row.

Base run XP is capped at 250. The active global horde currently applies a 1.10 multiplier. Practice/demo/unranked runs do not award shared Arcade XP.

Default ranked allowance: **5 completed ranked runs per UTC day**. Configure with `DEAD_RUN_DAILY_RANKED_LIMIT`.

## Difficulty scaling

Difficulty is frozen at session start from server-owned Dead Run history, so a client cannot select its own tier. Tiers 1–5 scale:

- zombie base speed;
- zombie maximum speed;
- spawn count;
- wave speed growth;
- number of waves.

The inputs are persistent Dead Run XP, best survival and completed-run count.

## Route generation

The server seed deterministically creates a local loop of waypoints and pickup anchors. The current route generator is **geographic/advisory**, not a street-network router. The UI explicitly tells players to remain on legal pedestrian routes and skip unsafe points.

Before marketing the route line as navigation, replace the geometric generator with a pedestrian-routing provider and production map-tile agreement. Do not instruct users to cross roads, enter restricted property or follow a point that conflicts with real-world conditions.

## Global multiplayer horde

The initial multiplayer mode is asynchronous and server authoritative: every six hours one global event opens with a 750-kill target. Ranked run kills contribute to the same event, and the endpoint exposes aggregate progress plus top contributors. This avoids requiring a realtime socket service for launch while still creating shared global pressure.

A later realtime mode can layer live rooms on top without changing ranked run ownership.

## Deployment sequence

1. Merge only after CI and Codex review are clean.
2. Apply `075_dead_run_gps_survival.sql` to the production `wikicoms` D1 database using the repository D1 runbook.
3. Confirm the migration in production evidence tooling.
4. Deploy `moonboys-api` after D1 is ready. Do not deploy the Worker first.
5. Verify `/api/dead-run/horde/current` and an authenticated `/api/dead-run/profile` request.
6. Publish `/games/dead-run/` and `/games/telegram/` via GitHub Pages.
7. Set both Telegram production launch surfaces to the shared Games launcher, not the direct Dead Run page:
   - Bot menu button text: `Games`
   - Bot/menu Mini App URL: `https://cryptomoonboys.com/games/telegram/?v=20260902-games-shell-v2`
   - BotFather main Mini App/Open button URL: `https://cryptomoonboys.com/games/telegram/?v=20260902-games-shell-v2`
8. Run a real-device mobile smoke test: open the Games launcher from Telegram, then launch Dead Run from the launcher with location permission, then verify settlement and leaderboard results.

## Non-secret Worker flags

```toml
DEAD_RUN_ENABLED = "true"
DEAD_RUN_RANKED_ENABLED = "true"
DEAD_RUN_DAILY_RANKED_LIMIT = "5"
```

The existing `TELEGRAM_BOT_TOKEN` secret is reused for signed Mini App authentication. No new bot token should be committed.

## Required review before live ranking

- Apply migration 075 and add it to the repository's production migration evidence/truth gates.
- Keep `schema.sql` synchronized with migration 075.
- Test recovery from a Worker/database failure during `settling` state.
- Confirm rate limiting/WAF policy for the new prefix.
- Review public OSM raster-tile use and move to an appropriate production map provider if traffic is non-trivial.
- Replace advisory geometric routing with a pedestrian network router before claiming “safe routes”.
- Run browser + Telegram Android/iOS GPS permission and background/wake-lock tests.

## Tests

Run:

```bash
node scripts/dead-run-api.test.mjs
node --check workers/moonboys-api/routes/dead-run-core.js
node --check workers/moonboys-api/routes/dead-run.js
node --check games/dead-run/app.js
npm run ci:worker-api
```
