# Issue #1530 — PR3A: trusted Dead Run ranked-score Clout source

**Status: implementation for review, not activated or signed-live verified.** This is the first narrow PR3 part. It does NOT complete NBG, standard Arcade games, Block Topia, public leaderboards or Championship activation.

Base: merged main d4ec7a74fed6b95c94a7f06b1ca8eb69a736af83 (PR2 evidence #1535). Reuses existing Dead Run schema migration 075 and Championship ledger migration 100; **no new migration**. No Dead Run physics/gameplay rewrite, XP award adjustment, UI/Pages change, prize activation, cron or new HTTP award route.

## 1. Exact trusted source contract

Source: workers/moonboys-api/routes/dead-run.js and its existing dead_run_sessions table. An eligible source must satisfy ALL:

- Session ID is a genuine server-allocated version-4 UUID, with one saved Telegram owner. Caller authentication is independently checked against the signed Telegram Mini App init_data.
- Session status finished, ranked=1; suspicious_points below 6; server-filtered verified_distance_m at least 40; survival_seconds at least 20; score > 0 and game XP > 0.
- All three source settlement checkpoints are complete: player_stats_applied=1, arcade_xp_applied=1 and horde_applied=1. A live/settling/abandoned/rejected run is ineligible.
- The completed source has scrubbed precise location columns; **no GPS coordinates enter the Clout ledger**.
- The **saved finished Dead Run session itself** is the canonical scored receipt. A matching `arcade_progression_events` row is *not* a prerequisite: its UNIQUE(telegram_id, client_run_id) constraint can be consumed by an earlier signed generic Arcade request using that same UUID. Such a collision must neither grant Clout from the generic request nor deny Clout for a separate, fully settled Dead Run session. This PR **does not** repair or credit Arcade XP and cannot use an Arcade-only score as authority.
- Recompute scoreRun using original saved distance, survival, kills, crates, shoves, and original difficulty XP/best/runs basis passed to difficultyForPlayer. The source's final row does not retain a unique horde-active multiplier flag, so the accepted saved game XP must match **either** min(275, floor(serverXp)) or min(275, floor(serverXp × 1.1)); a mismatched score or XP fails closed. This is a safety assertion about the source's own server-computed outcome, not a reward recalculation.
- Use the saved terminal ended_at UTC date, NOT the start-day day_key. **A signed, already-finished Dead Run can cross midnight in Cloudflare waitUntil:** an internally persisted finish timestamp selects the preceding earned-day **only within 15 minutes of the actual finish** and only for that original Dead Run source; recorded/verified timestamps remain real execution time. No arbitrary previous-day Community/Moonpet credit, prelaunch replay, or historical backfill.

A settled run is only a *server-filtered* GPS outcome, not cryptographic proof of real location; abuse review remains a release canary requirement.

## 2. Versioned score normalization and caps

An independently recomputed saved server score s between 0 and 1,000,000 maps to:

**normalized_skill = floor(100 * s / (s + 5000))**

| Verified run score | Rating | Skill points if only scored title |
|---|---|---|
| 0 (ineligible) | 0 | 0 |
| 1,000 | 16 | 6 |
| 5,000 | 50 | 20 |
| 20,000 | 80 | 32 |
| 1,000,000 | 99 | 39 |

The adapter selects **one best eligible ranked Dead Run per owner/current UTC day** using ordered SQL (`score DESC, ended_at ASC, session_id ASC LIMIT 1`). This supports the full configured 1–20 ranked-runs/day source window without a fixed 10-result overflow. A later, better run may create another immutable receipt and reproject today's best, but retries and lower-scoring runs cannot farm the score. The highest independently verified rating per game contributes to the existing Clout Skill formula (max 40, up to 3 titles); distinct-title variety credits dead-run just once (5 of max 15), regardless of run count.

Every parent/effect uses verification_kind=server_settlement and the PR1 composite FK. Recalculation remains in the same D1 batch as all new effects; concurrent retries do not mint additional points. **This never credits Pet XP, Arcade spendable/lifetime XP, Community XP, Gold, faction clout or prizes.**

## 3. Strict double opt-in and signed HTTP integration

The production Worker already invokes the Dead Run handler before its other routes. PR3A only schedules optional Clout projection after an accepted ranked response from POST /api/dead-run/session/finish. Both settings must be separately true:

- CHAMPIONSHIP_CLOUT_PILOT_ENABLED
- CHAMPIONSHIP_CLOUT_DEAD_RUN_ENABLED

They remain explicitly **false** in wrangler.toml. Original DEAD_RUN_ENABLED and DEAD_RUN_RANKED_ENABLED also remain false; no GPS participation is required to enter the broader Championship through Telegram /daily or Moonpet.

The wrapper clones the request before its source handler consumes it. Background processing uses Cloudflare ctx.waitUntil so the finished-game response cannot be delayed by Clout queries. It normalizes session_id using **the exact same `.trim()` behavior as the Dead Run finish handler**, rechecks signed Telegram init_data (or existing telegram_init_data alias) against the existing 2-hour session limit plus 15-minute grace, and verifies the exact session belongs to that signed owner and is ranked/finished. It reads the **actual server-persisted ended_at** from D1 to preserve earned-day attribution across a midnight background-task delay. The Clout projector rejects a future/noncanonical timestamp and allows at most a 15-minute late-finish carryover, without copying prior-day Telegram/Moonpet rewards. It retains the actual verification/recording timestamp (rather than pretending the async task ran yesterday). A collision in the separate Arcade receipt table is not a blocker. Neither body.telegram_id nor client score/coordinates are used for a Clout award.

Other signed /daily and Moonpet source requests may repair today's missing Dead Run Clout only when the same separate Dead Run flag is explicitly enabled. Any Clout read/write failure is fail-closed, logged, and does not undo/replay completed gameplay.

## 4. Explicitly excluded sources

**NBG London — PR3B, not eligible here.** The current game has a Worker-side physical replay verifier, but the replay uses a common deterministic spawn/reward seed across sessions; cheap reuse of one input sequence in newly minted sessions needs per-run challenge binding. Source migration 098 stores a unique finish token but not a permanent per-run *independently verified rating/XP* receipt. Period migration 099 distinguishes total_xp/run_count practice counters from trusted_xp/verified_run_count for prize basis; the existing finish path does not populate the trusted pair. Do NOT promote practice totals to official Clout, nor unlock any spendable prize payout. #1513 owns the narrowly scoped replay/competition work.

**Eight original Arcade titles + independent Block Topia:** server verifies identity but not necessarily player input/score. No Clout until genuine settled game outcomes are independently authorized. Preserve all their original specialist boards and UX.

Dead Run's GPS requirement is specific to that existing game's ranked mode. Telegram /daily and Moonpet remain non-GPS entry paths to the overall non-spendable Championship.

## 5. Tests and release hold

- Existing scripts/championship-clout-pilot.test.mjs now includes the *real* migration 075 schema and additional test cases for original Dead Run settlement ownership and recomputation, **returning-player saved difficulty distinct from present player stats**, rookie-score spoof rejection, risk/unfinished/rejected filters, Arcade run-ID collision with a real UNIQUE constraint, twenty ranked runs selecting the best, no fake Arcade-only Clout, original XP invariance, **two directions of UTC midnight: signed finish-day carryover retaining real next-day verification stamps and denial beyond 15 minutes**, the same session ID with whitespace, better-run projection, dedupe, cross-owner tampering, separate hard-off source flag and injected D1 batch rollback.
- Existing scripts/dead-run-api.test.mjs must keep passing without game-engine rewrites.
- Existing scripts/championship-clout-foundation.test.mjs must preserve composite foreign keys and the deterministic score policy.
- Worker/API CI plus other required domain CI must pass on the latest PR commit, and Codex/Copilot findings must be repaired before any merge.
- **No D1 migration, Worker deployment, feature-flag activation, signed player smoke or gameplay balance change is authorized by this PR.**
- Separate GK approval is required for PR3A merge and any later provenance-controlled Worker release.
- PR5 still requires real signed fresh/new and returning accounts, source receipt readback, 0 unintended wallet/XP delta, UTC rollover, anti-cheat/bans, and clear flag-off rollback. Do not call Clout VERIFIED IN PROD yet.

## 6. Roadmap remains open

PR3A is only the first scored source adapter. Master #1530 stays open for PR3B NBG replay authority, later eligible game sources, PR4 actual daily/weekly/quarterly/annual standings and badges in shared HUD (#903), and PR5 controlled production canary/activation. #1513 remains owner of Arcade game scoring and #1478 of the permanent 365-day Moonpet economy.
