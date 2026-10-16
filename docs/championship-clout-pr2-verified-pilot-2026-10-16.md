# #1530 PR2 — verified Telegram /daily + Moonpet Journey Clout pilot

**Status: CODE-ONLY DRAFT. Not authorized for merge, deploy, flag activation or public leaderboard.**
This is a source-receipt adapter for the additive PR1 ledger, not an XP migration or new game rule.

## Preconditions and release truth

- Base: merged PR #1533, main SHA d7d050cec3a01d74edf5de0e334d302a25c7c487.
- GK supplied Wrangler remote output on 16 October 2026 showing:
  - pre-migration D1 backup export succeeded locally;
  - migration 100 applied; no pending migrations;
  - championship_clout_sources/effects/daily/archives present;
  - PRAGMA foreign_key_check completed without violation rows;
  - d1_migrations ledger includes 100_championship_clout_foundation.sql.
- This is **user-provided CLI evidence**, not an independently authenticated live D1 read by this PR/agent. No backup file, signed export URL, user ID or credential is committed.
- PR2 adds **no D1 migration** and does **not** modify existing reward, pet, wallet, arcade or faction tables.
- Existing Worker deployment and real signed-user canary **not verified for this branch**.

## Selected pilot and source authority

| Source | Required authoritative evidence | Pilot contribution |
|---|---|---|
| Telegram /daily | telegram_community_xp_awards: daily_claim, positive award, saved day and settlement token; corresponding telegram_xp_log with exact owner/reference/time/xp | 5 non-spendable **community** points per verified daily claim |
| Moonpet Daily Journey | telegram_pet_growth_marks, milestone daily_moon_run_milestone, exact daily-run 3-of-5 evidence, accepted telegram_pet_daily_journey_receipts qualified for same pet/owner/season/day, matching live ownership tuple | 5 **mission** points + Moonpet **variety** evidence |
| Moonpet Weekly Journey | telegram_pet_weekly_crests, exact weekly-journey 5-of-5 evidence, accepted telegram_pet_weekly_journey_receipts qualified for same pet/owner/season/week/crest, matching live ownership tuple | 10 **mission** points + Moonpet **variety** evidence |

- Same saved source receipt can support only its declared kinds. Existing D1 composite foreign key forces **one owner, day, timestamp and verification class** across all effects.
- Variety is counted **once per distinct title**, not once per pet or once per retry.
- Policy version remains championship-v1, overall daily ceilings remain 40/25/15/10/10 = 100.
- No client raw score, faction influence, local mission, site view, fake wiki page/citation, GPS or wallet balance may enter.
- No historic score/event automatically becomes Clout. The pilot is **current UTC day only**, after the approved midnight launch boundary.
- Moonpet Daily/Weekly Journey currently stores the *source's* qualification day as UTC midnight; the adapter uses that persisted source time. Do not replace it with the later HTTP retry timestamp or reinterpret the pet's own weekly journey as an ISO Championship week.
- The 365-day pet life, 240 Growth Marks, 44 Crests, first-pet entry, slots, XP balances and existing boards remain untouched.
- Existing Pet Contract/boss receipts are **not yet authorized for this pilot** without per-outcome terminal victory/settlement proof. Wiki engagement is deferred until canonical published-page and citation-ID validation ships. Separate source-specific follow-up is required.
- The first pilot is reachable via **authenticated Telegram webhook /daily and pet bot commands/callbacks**, plus the existing **signed Moonpet Mini App /telegram-pets/app/action** path. The Mini App actor is independently reverified using Telegram's HMAC init_data; raw body.telegram_id is never used for Clout. Website wiki participation remains excluded pending canonical verification. A newcomer without a pet can qualify with /daily through the bot.

## Runtime safety and activation

- Wrapper verifies the Telegram webhook secret **before** processing a bot payload, and revalidates the signed actor for Moonpet Mini App action callbacks.
- Only /daily, pet-prefixed bot commands, pet:* callbacks and valid signed Mini App actions invoke the pilot after the existing base handler reports HTTP success. User identity is taken from the verified Telegram update or signed Mini App init_data, never a browser body.telegram_id parameter.
- The source adapter independently reloads saved source rows and ban/account authority from D1. Unknown owners, rejected proofs, unmatched XP log, wrong pet, wrong UTC day and unavailable reads do not award points.
- All parent-source/effect writes and the SQL rebuild of the daily snapshot run in **one D1 batch**. A retry cannot increment the score, and SQL recomputes the original monotonic Skill formula if future score effects already exist.
- Pilot projection is scheduled using the Cloudflare execution context's `ctx.waitUntil(...)` **after** the existing source handler commits and responds. Telegram bot and Moonpet Mini App replies must not wait for Clout-specific verification, D1 reads, or daily recalculation. When execution context is unavailable, the optional Clout write is skipped rather than blocking gameplay.
- Pilot projection failure only logs a Clout-specific error. It cannot undo or repeat an already accepted /daily or Moonpet reward. A later accepted bot/Mini App update can retry. An asynchronous projection is eventual, not guaranteed to be visible in the source action's immediate reply.
- In wrangler.toml: CHAMPIONSHIP_CLOUT_PILOT_ENABLED="false". The gate additionally requires CHAMPIONSHIP_CLOUT_PILOT_START_AT to be an explicit UTC-midnight ISO timestamp (YYYY-MM-DDT00:00:00.000Z). Both are release-only; no automatic activation, no public write route and no rewards scheduler.
- **STOP:** no PR merge, Worker deployment, feature-flag flip, bot change or retroactive backfill until independent GK approval, current-head CI, and controlled real Telegram/newcomer + returning pet smoke.
- Do not try to apply migration 100 again; user CLI evidence indicates it is already applied.

## Targeted tests

node --test scripts/championship-clout-pilot.test.mjs

Also run node --test scripts/championship-clout-foundation.test.mjs and npm run ci:worker-api. Confirm workflow provenance and no unrelated Worker route regressions.

## Live acceptance still required

- Signed /daily at or after a deliberately approved UTC-midnight canary start saves one 5-point community effect and repeats stay one.
- Signed returning Moonpet Daily 3/5 and Weekly 5/5 source completions via bot or Mini App save mission and variety, but never alter source XP/Marks/Crests.
- Concurrent duplicate submissions; wrong owner/pet; old-day retry; ban; D1 unavailable; source repair replay; quarter rollover; non-Moonpet newcomer; no currency leakage.
- Monitor actual Worker deployed SHA and database before/after counts; run existing Telegram UX and 360/390px canary checks at PR5.
- Document the canary rollback/flag-off process before anyone enables pilot writes.
