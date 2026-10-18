# Public leaderboard and private player-state consolidation — 18 October 2026

**Baseline:** `main` at `61960127cd9fa19a9628ff080f9b313fd65eb52c`, after #1559 merged.

## Source audit and new page ownership

- **Public Leaderboard (/games/leaderboard.html):** the shared board supports eight standard Arcade score titles, global + per-game tabs. It never merged MoonPet, Dead Run, NBG London or Block Topia RPG scores; explicit direct launch/source links now make that limitation visible. Missing games are not assigned invented scores. The Kaiju legend is included. Keep public player/faction ranking columns, score graph and the relevant presence option; remove duplicated onboarding explanation cards.
- **Games Hub (/games/):** remains the canonical launch index, with its specific Telegram launchers and Arcade status. The old global `inline-live-stats` quartet injected below the game catalog duplicated private XP/faction/WTF/missed cards.
- **Community (/community.html):** remains the canonical faction chamber, public standings, join controls, `Crew Operations Today` and `My Contribution Today`. Those faction-specific widgets are not the former global rail. Remove only the extra old `inline-live-stats` quartet.
- **Home/search/wiki/articles:** shared header still shows verified identity and compact Arcade XP as global navigation context; no extra full-panel injection. Wiki article likes/comments/citations are independent public action surfaces, not a second personal account headquarters.
- **My Moonboy (/my-moonboy.html):** canonical private tasks, rewards, personal account/XP and now `Missed opportunities XP (all-time)`. All linked account reads remain signed and identity/day-checked.
- **MoonPet Saved Status:** retains canonical per-pet and Saved Status-only claim authorities not yet projected in My Moonboy; do not replace it with fabricated readiness. `dashboard.html` remains wiki/editorial tooling only.

The shared site shell no longer inserts four full private account panels into Community, Games or the Leaderboard. If stale injected legacy DOM remains, it is removed. Existing site-wide Telegram badge and dedicated public page modules remain intact.

## Why "MISSED XP" said syncing while missed counts appeared

The authenticated `/daily-loop/state` Worker returned `missed_opportunities.total_today`, `total_all_time` and items but **omitted the D1 `missed_xp_value` sum**. The shared front-end treated the daily-loop missed source as complete and bypassed its legacy XP source, leaving `shared.missedXp === null` indefinitely.

The Worker now probes `PRAGMA table_info(daily_missed_perks)` for the migration 021 `missed_xp_value` column, and for linked owners returns:
- `missed_opportunities.xp_total_all_time` as an account-scoped, nonnegative D1 sum, **including confirmed zero**;
- `xp_source_status: verified` only when that authoritative sum succeeded; or
- `xp_total_all_time: null` and `xp_source_status: migration_pending` if an older DB lacks the column.

SQL probe/sum errors fail closed with source query failure; missing/failed proof must not become zero. My Moonboy reads the *shared signed daily-loop singleton* and only displays XP when `identity.telegram_id` matches the active linked owner, `fetch_status=ok`, source live and `xp_source_status=verified`. Offline, stale, account switch or missing Worker proof never display a current verified count. A missed XP value means a recorded *missed opportunity*, not lost wallet XP or an actual debit.

**Deployment:** Worker deployment is required for the new aggregate field after GK approves merging; migration 021's applied state must be verified, but **no new D1 migration is added by this PR**. Until the Worker is deployed, My Moonboy correctly states that the source doesn't provide the value.

## Jumping "MISSION" timer

The gold bar came from `arcade-retention-engine.js`, a **browser-local comeback prompt**, not a Worker-saved/verified mission. On expiry, the engine cleared the prompt and its 15-second tick immediately generated a new 10-minute one for the same stale `last_played_at`.

The fix keeps the expired mission as a persistent inactive tombstone for that inactivity spell. Another prompt can only occur after a real subsequent recorded run and a new inactivity window. Public Leaderboard no longer starts this local retention chip at all. On actual gameplay pages it is labeled **LOCAL ARCADE CHALLENGE (not verified XP)** to prevent confusing it with verified My Moonboy tasks.

## Tests and release acceptance

- `scripts/daily-loop-state-contract.test.mjs`: signed owner-scoped XP total across UTC days; prevents other owner leakage, rejects fake zero if migration column absent.
- `scripts/leaderboard-source-consolidation.test.mjs`: eight-source public ranking, separate-game links, no injected duplicate personal panels, local countdown expiry tombstone, and owner/private missed-XP code contract.
- Updated `scripts/right-rail-live-panels.test.mjs`, `scripts/live-site-verify.mjs`, `scripts/arcade-leaderboard-layout.test.mjs` and site-shell audit to prevent reintroducing old cards.
- Registered the new audit test across CI Arcade, Visual and Worker/API domains.

**Hold merge:** fresh CI green, review, signed owner test on production and explicit GK approval. After merge, deploy `moonboys-api` with provenance wrapper from approved main, verify D1 migration 021 and compare authenticated live missed-XP values to the stored source rows. Then confirm Pages serves final reviewed SHA. Do not treat counts or the user screenshot as live verification of the new Worker. No current Worker deployment, migration or gameplay/reward modification is claimed.
