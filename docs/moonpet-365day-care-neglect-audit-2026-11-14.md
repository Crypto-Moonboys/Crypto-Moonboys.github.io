# Moonpet 365-day care and neglect audit — 2026-11-14

Status: SANDBOX / proposal only. No economy mutation, deployment, or production player changes.

## Authority

The current permanent Moonpet target is a **365-day minimum lifetime**. Evolution age gates are 7 / 28 / 84 / 182 / 365 days; final progression additionally requires 240 distinct-day Growth Marks and 44 distinct-week Crests, plus applicable level, boss, relic and material gates. Verify each number against current runtime sources before implementation.

Older Season 1 90-day completion targets, 60 Marks, 10 Crests, and 78–90-day Legendary estimates are **superseded for permanent pet completion**. They must not be used as the authority for care penalties. Do not erase archived season records, existing earned XP, historical leaderboard snapshots or migration history. Quarterly/seasonal competitions may still operate independently.

Historical sources requiring an explicit superseded banner or rewrite after runtime parity review:
- docs/moonpet-season-economy-calibration.md
- docs/pet-game-seasonal-model.md
- docs/pet-game-catch-up-rules.md
- any current public How to Play / About copy or UI repeating old completion targets.

## Findings supported by source review

- `workers/moonboys-api/migrations/032_telegram_pets_notifications.sql` stores enabled, last_notified_at and last_reason, but is not itself proof of daily send count.
- `notification_set` currently manages optional Telegram reminders, not pet progress.
- `POST /player/action-plan` is authenticated, no-store, read-only guidance; recommendations and preview are **not** accepted attendance.
- Daily checklist, Daily Journey and Weekly Journey have separate saved receipt semantics; claims must not be interpreted as care failures.
- Historical documentation cites a 1,200 account/UTC-day Pet XP cap, which must be checked against runtime. A cap is not the median earned XP/day.
- Current actual reminder dispatch count, delivery logs, and typical XP earned/day remain unverified. Do not claim a production audit of those.

## Proposed care authority

1. Derive eligible care windows from a versioned server policy; do not equate number of Telegram sends with mandatory sessions.
2. Determine care attendance from authenticated, accepted, pet-owned action receipts (feed/play/clean/sleep and applicable incubation care), not opening the app or reading a notification.
3. Use existing Next Best Action, mission indicators and action-plan projection to recommend care, never as the penalty ledger.
4. Optional notifications OFF means no optional messages; care attendance still tracked. Do not punish actions impossible because of cooldown, outages, adoption/hatch timing, or unavailable pet state.
5. Settle the prior complete UTC day after midnight with a durable unique (pet_id, day_key, policy_version) receipt and safe retry/backfill. No backdated penalties before activation.
6. Separate permanent lifetime XP, evolution, Marks, Crests, achievements and already-paid rewards from any reversible penalty balance. Prefer a new Care Standing or capped future-care-bonus debt until economy proof authorizes another mechanism.
7. Prevent multi-pet penalty multiplication and farmable duplicate care credits. A complete day clears neglect streak; partial care attenuates but does not automatically clear it.

## Simulator assumptions (NOT current game values)

The standalone simulator in `scripts/moonpet-neglect-simulator.mjs` models a base daily care reward budget D, percentage missed, and consecutive-day multiplier min(8, day+1). At 100% missed: day 1 2D, day 2 3D, day 7 8D, day 8+ 8D. At 50% missed the penalty is halved. These are **proposals**, not live XP rules. Run scenarios for 7/30/90/365 days and compare against measured casual/regular/dedicated player reward rates, calendar eligibility, recovery feasibility and seasonal ranking effects.

Do not ship any proposed penalty until the full live action/XP/reminder audit, shadow-mode rehearsal, tests, and explicit approval.

## Next PRs

1. Audit all current sender paths, exact notification schedules and sent/failed delivery counts; map accepted care evidence and permanent progression authority. Mark obsolete 90-day documentation as historical without deleting data.
2. Implement server care-window ledger and player-facing read-only care report.
3. Add idempotent UTC daily shadow settlement and replay/edge-case tests.
4. Add UI and opt-in Telegram summaries; activate reversible care scoring only after sign-off.

## Required tests

365-day/240-Mark/44-Crest authority; incubation and multiple pets; timezone boundaries; opt-out; no notification delivery; missed cooldown; partial/full care; duplicate receipts; consecutive-day escalation; missed cron/backfill; D1 errors; negative-balance prevention; source-pet attribution; no mutation of lifetime XP/marks/crests/season standings; existing pet game and Worker performance regression.
