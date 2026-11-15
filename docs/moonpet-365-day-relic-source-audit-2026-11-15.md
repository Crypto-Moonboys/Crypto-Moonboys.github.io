> **HISTORICAL PRE-FIX AUDIT.** The V2 selector was approved and merged via PR #1795 on 2026-11-15. Its all-ten-relic selection is now imported into the #1783 sandbox Worker. The five-relic algorithm and options below describe the original defect, not the current merged reward behaviour. See `scripts/moonpet-relic-selection-v2.test.mjs` for the corrected selection test. No changes to drop chance or Legendary requirements.

# Moonpet 365-day relic-source bottleneck — 2026-11-15

Status: **SOURCE-VERIFIED AUDIT; NOT A COMPLETE PLAYER ECONOMY SIMULATION**. No production reward/evolution changes.

## Confirmed authority

- Permanent Legendary evolution requires `relics_owned: 10`, 365 days, 240 distinct-day Growth Marks, 44 weekly Crests, Level 50, boss victories and materials (`workers/moonboys-api/pets/content/evolutions.json`).
- `alley_king` defines `relic_chance_bps: 2500` and ten possible IDs (`workers/moonboys-api/pets/content/bosses.json`).
- The currently defined Moon Alley region has `max_rooms: 10` and `boss_pool: ["alley_king"]`; the regions catalog currently contains only Moon Alley (`workers/moonboys-api/pets/content/regions.json`). Alternate boss catalogs do not themselves demonstrate alternate playable regions.
- Current `buildPetBossRewards` derives **both** drop and relic identity from the same `rollKey`, using FNV-1a-style `stableContentRoll(`${rollKey}:chance`)` and `stableContentRoll(`${rollKey}:relic`)` modulo 10.
- The two salted hashes are correlated: for the current Alley King boss key and 10-item pool, the relic hash chooses **only even indexes**. Thus Alley King rewards cannot yield the five odd-index IDs under the current algorithm. This is independent of repeated attempts; simply raising the drop chance does not fix pool coverage.

The source-derived 365-day diagnostic in `scripts/moonpet-relic-selection-audit.test.mjs` uses official Daily Run ID format and *assumes every boss was beaten* to isolate the selection formula; it **does not assert that a human or simulated pet legitimately won those runs, that the boss appears on every attempt, or that those relics were saved to inventory**. For the four test owner IDs it yields exactly five distinct IDs:

**Reachable from Alley King:** `bitcoin_heart`, `hacker_lens`, `golden_sticker`, `moon_battery`, `chain_shield`.

**Never selected by Alley King under this formula:** `infinite_spray_can`, `neon_boots`, `ghost_tag`, `cyber_collar`, `lucky_coin`.

The same source-derived diagnostic suggests `neon_warden` selects odd indexes and `chrome_jackal` selects even ones with the tested run ID format. **This does not establish whether those bosses, shops, trades, crafting, or other relic sources are accessible to the same permanent pet in legitimate gameplay.**

## Why this matters

Codex's earlier *uncommitted and unpushed* 365-day report showed Level 51 and 365 Growth Marks but just five of ten relics. Its corrected week-14+ Crest run was interrupted. Those numbers are reported findings only, **not results verified against this PR**. The source issue above independently explains why farming Alley King alone cannot satisfy a ten-distinct-relic requirement.

The permanent evolution query counts `SELECT COUNT(*) FROM telegram_pet_relics WHERE telegram_id=?`. The table's primary key is `(telegram_id, relic_id)`, so repeated drops of the same relic **cannot increase the owned-ID count**. Relic inventory is account-scoped, although run payouts are source-pet scoped. Confirm alternate acquisition paths before assuming an individual pet can complete Legendary.\n\nThis is a mathematical source constraint, not evidence that Legendary is universally impossible through every allowed acquisition route.

## Decisions for GK approval — neither implemented

**Option A (recommended for investigation):** Preserve 10-relic Legendary gate and 25% Alley King drop chance; revise future relic-selection hash mixing so all ten listed IDs can be selected, with deterministic tests validating coverage and honest long-run rarity. Scope: reward authority only; requires replay/idempotency checks and analysis of historical earned relics. The new selection scheme must not be exploitable by choosing run IDs.

**Option B:** Preserve existing Alley King reward algorithm, but establish a legitimate, controlled path to the other five relics (e.g., accessible boss route or milestone-based relic acquisition), with resource and playtime simulation. Must verify that the alternate route exists and can award the required relics to the correct permanent pet. No free grants.

Do not reduce Legendary from 10 relics to 5 or alter drop chance by assumption. Either balance change requires explicit GK signoff, full Node24 regression evidence and production deployment safeguards.

## Remaining release gates

1. Run `node --test scripts/moonpet-relic-selection-audit.test.mjs` on Node24, plus existing run/reward/evolution suites.
2. Rebuild or recover the lost Worker-backed virtual clock + week-14 migrations as **real hosted commits**. Do not claim they exist until verified in GitHub.
3. Execute the corrected 365-day same-pet progression campaign, distinguishing `relic_count`, `distinct_relic_count`, actually awarded Growth Marks/Crests, boss wins, materials, and actual level.
4. Test at least two deterministic start dates and multiple owner IDs. Disclose source-derived hypothetical assumptions separately from actual server action receipts.
5. No live penalties, migration, merge, deploy, wallet or Telegram operations in this audit branch.
