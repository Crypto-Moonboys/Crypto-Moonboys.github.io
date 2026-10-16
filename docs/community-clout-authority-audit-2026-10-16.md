# Championship Clout v1 — source authority and reward boundary audit

> **Issue:** #1530, PR 0 (evidence/contract only). **Audited code:** main at
> \`2777337b6d7a0124483aec5a1843068b323a166c\`, 2026-10-16.
> **Deployment, signed-user QA, live data, D1 production migrations and balances: NOT VERIFIED.**
> No game, Worker, wallet, competition or pet rules are changed by this document.
>
> **Scope:** One *new*, non-transferable, non-spendable **Championship Clout**
> ranking for a small private/community beta. It is not Community XP, Arcade XP,
> Pet XP, Block Topia XP, faction XP or Battle Chamber faction clout.

## 1. Evidence classification

- **EXISTS (CODE):** an endpoint/module and relevant receipt rules were read in current source.
- **PARTIAL:** accepted records exist, but provenance, scoring eligibility, replay resistance,
  source catalog, or cross-system conversion is not sufficient for official Clout.
- **MISSING:** no suitable server-owned accepted result is currently established by this audit.
- **NEEDS DESIGN:** requires explicit product policy; not grounds to change shipped rules.
- **LIVE BUG:** must be reproduced using deployed code and real signed credentials, not inferred.
- **VERIFIED IN PROD:** requires deployed Worker/Pages SHA, applied D1 ledger and a signed-player
  event/receipt readback. **None of the rows below qualifies for this status yet.**

No event will be allowed into the proposed Clout award ledger merely because the
frontend labels it "saved", Telegram authentication succeeds, or a current leaderboard
shows a score. The source event must be independently authenticated and settled.

## 2. Source ownership matrix (CURRENT code, not assumed production)

| Gameplay/source | Durable authority | Current finding | Initial official Clout policy |
|---|---|---|---|
| Telegram \`/daily\` | \`community-xp-awards.js\`, \`telegram_community_xp_awards\` and \`telegram_xp_log\`; once per owner/action/UTC-day | **EXISTS (CODE)**: D1 receipt + atomic Community XP credit | **Pilot candidate**. Accept only completed \`daily_claim\` receipt for verified linked user, one engagement effect per date; do not pay Community XP again |
| Moonpet care | \`telegram_pet_events\` with status \`accepted\`, pet_id, owner and saved day/week | **EXISTS (CODE)**: source-validated outcomes, independent daily Community XP and Pet XP caps | **Pilot candidate**, eligible activity/mission evidence only; no raw Pet XP-to-Clout conversion |
| Moonpet Daily Journey / Growth Mark | \`pets/daily-moon-run.js\`; \`telegram_pet_growth_marks\`, same pet+owner+day | **EXISTS (CODE)**: 3/5 validated goals, unique daily Mark evidence | **Pilot candidate**, one receipt per recognized daily achievement; preserve pet's saved source date |
| Moonpet Weekly Journey / Crest | \`pets/weekly-journey.js\`; \`telegram_pet_weekly_crests\` and source events | **EXISTS (CODE)**: 5/5 targets and unique pet-specific qualification week | **Pilot candidate**, project into Clout's UTC day/week *by earned timestamp* without rewriting pet-week numbering |
| Moonpet completed Contracts, bosses, Finale | Existing accepted result/reward receipts and permanent pet/source identity; docs/moonpet-source-of-truth.md | **PARTIAL** until exact terminal result tables/status and settled timestamp audited per variant | Later source adapters; unlimited Contract **play** remains legitimate, but no unbounded daily Clout |
| Moonpet lifetime Legendary | \`pets/content/evolutions.json\`, \`pets/season-completion.js\`, completion receipt | **EXISTS (CODE)**: stage 5 requires 365 ownership days, 240 distinct Growth-Mark days, 44 distinct Crest weeks, plus boss/relic/material/level proof | One permanent honor/Hall-of-Fame milestone; never reset or re-award at quarter rollover |
| Dead Run | \`routes/dead-run.js\` \`dead_run_sessions\` settled \`status='finished' AND ranked=1\`, server-derived score/distance | **PARTIAL**: stronger source checks, but GPS itself is not cryptographic and current source awards Arcade XP, not necessarily Community XP | Later best-verified-run skill adapter; never make GPS compulsory |
| NBG London | \`nbg_london_runs.finish_token\`, \`nbg_london_records\`, \`nbg_london_period_scores\`; replay verifier | **PARTIAL**: replay-verification code exists, but old input replay reuse needs challenge binding; finish updates \`total_xp/run_count\` while prize selector expects \`trusted_xp/verified_run_count\` | Later skill adapter after independent full-run verification; keep existing prize cron CODE-LOCKED |
| Eight standard Arcade titles | \`workers/leaderboard-worker.js\` KV per-game ranked boards | **PARTIAL**: Telegram identity checked; browser submits unverified raw score and meta points | **Not official** until per-game server evidence exists; legacy specialist boards remain visible |
| Block Topia Street Signal separate Worker | \`workers/blocktopia-leaderboard/worker.js\` KV seasonal/all-time | **PARTIAL**: signed caller supplies raw score/level; not independently replayed | **Not official**, no duplicate credit from alternate board |
| Wiki Engage/Signal/Cite | \`worker.js\` \`wiki_comments\`, \`wiki_page_likes\`, \`wiki_citation_votes\`, \`wiki_mission_completions\` | **PARTIAL**: signed linked account and daily/page dedupe, but arbitrary *valid-looking* page/citation ID isn't tied to authoritative published catalog in the inspected award path | Withhold Championship points pending genuine published page/citation validation; preserve current 10 Community XP mission behavior |
| Browser faction daily/seasonal missions | \`js/arcade/systems/faction-missions.js\` + \`worker.js\` \`/player/daily-missions/progress\` | **PARTIAL**: server stores increments and browser supplies amount/target, without required source receipt | Do not accept mission-completed flags as trusted; build from accepted source events |
| Faction influence/XP | \`/faction/earn\`, \`/faction/signal/contribute\`, \`/battle-chamber/event\` | **PARTIAL**: client may supply base XP/contribution; proof-feed event itself pays zero clout | Do not consume arbitrary client influence amounts; this issue does not rewrite Battle Chamber rankings |
| Game mastery and Arcade progression sync | \`/player/mastery/update\`, \`/arcade/progression/sync\`, \`arcade_progression_events\` | **PARTIAL**: API validates signed owner, caps and dedupe; inputs still include browser raw score, meta points and a client-generated run ID | Do not equate an "accepted" progression event with verified gameplay; no backfilled official Clout |

**Verified source eligibility is a separate Boolean and versioned policy**, not an
alias for \`status='accepted'\`. Every child adapter must prove which immutable
source receipt, owner, event type, timestamp and independent verifier justify it.

## 3. The existing reward ledgers must stay separate

| Stored domain | What it means | Invariant |
|---|---|---|
| \`telegram_users.xp\`, \`telegram_leaderboard\` | Community XP, potentially season-scoped | Do not rewrite for Clout |
| \`arcade_progression_state.arcade_xp_total\` | Lifetime Arcade XP; required for first-pet eligibility | First pet remains **1,000 lifetime Arcade XP**; entry does **not** spend it |
| \`arcade_xp_wallets.arcade_xp_spendable\` | Spendable Arcade XP | Existing extra spaces cost **500 / 1,000** spendable XP; Clout cannot buy spaces |
| \`telegram_pet_events.pet_xp_awarded\`, \`telegram_pet_season_state\` | Original pet XP and quarterly competition score | One pet/owner/source receipt, 1,200 daily account Pet XP cap remains |
| \`blocktopia_progression.xp\`, \`.faction_xp\` | RPG and faction progression | Cannot be inferred from Championship rank |
| \`battle_chamber_faction_clout\` | Faction standings | Distinct from new personal Championship Clout |
| \`nbg_london_period_scores.total_xp\` | Replay-scored *game* XP | Does not implicitly mint spendable or Community XP |
| **Proposed Championship Clout** | Non-spendable competitive reputation, score 0–100 per qualifying UTC day | Pure additional ledger, **no** wallet or token conversion |

Source code: \`workers/moonboys-api/pets/entry-requirement.js\`,
\`workers/moonboys-api/community-xp-awards.js\`,
\`workers/moonboys-api/pets/leaderboard.js\`,
\`workers/leaderboard/nbg-london-prizes.js\` and \`worker.js\`.

## 4. Calendar and Moonpet no-drift rule

- **Moonpet personal lifetime:** saved creation UTC day; permanent pet_id/season_key,
  earned XP, evolution, Marks and Crests. Earliest stage age days **7/28/84/182/365**.
  Stage 5 **365/240/44** remains; no completion reset or pet retirement.
- **Moonpet existing competition:** **calendar quarter** \`pet-sYYYY-00Q\`.
- **New Championship:** UTC day, ISO Monday UTC week, **calendar quarter** and
  UTC Jan–Dec year; archive past winners and policy version.
- **Legacy Arcade:** 90-day windows anchored at 2024-01-01, *not* identical
  to Gregorian quarters; preserve boards and archived records.
- **Community XP:** configured active \`telegram_seasons\`; preserve existing
  semantics and season attribution.
- **Moonpet Weekly Journey:** per-pet creation-week clock, not necessarily
  a Monday ISO week; preserve pet-specific Crest evidence.

**Documentation drift:** \`docs/pet-game-seasonal-model.md\` and
\`docs/moonpet-season-economy-calibration.md\` still contain older
**90-day / 60 Growth Marks / 10 Weekly Crests** statements. Current runtime
(\`pets/content/evolutions.json\`, \`pets/season-completion.js\`) and the
newer \`docs/moonpet-source-of-truth.md\` establish the persistent 365/240/44
design. An authorized narrow doc-reconciliation PR may update historical copy,
but **do not change runtime to match obsolete documentation**.

## 5. Versioned Championship Clout policy proposed for v1

**Daily total: at most 100 non-spendable Clout points; unlimited gameplay.**

- **Skill ≤40:** highest verified *per-title* normalized performance (0–100)
  for up to three **different** games in the UTC day; mean of available best
  ratings × 0.4, no penalty for only one eligible game. No raw cross-game score
  addition and no live population percentile with 2–5 players.
- **Mission ≤25:** qualifying official server-defined objectives completed
  by matching immutable source receipts. Browser-specified targets never count.
- **Variety ≤15:** at most three eligible distinct-game/activity proofs at 5
  points each, not 5 per repeat run.
- **Community ≤10:** genuine linked contribution/daily-login actions, daily
  dedupe per category, never arbitrary per-page fake source IDs.
- **Streak/event ≤10:** server-evidenced distinct UTC days or scheduled verified
  event participation, not seconds online.

Weekly/quarter/year totals are sums of their **stored earned-day scores**, not
a recomputation from a current pet profile or client clock. Tie break on
Clout total, distinct game titles, verified active days, earliest qualifying
server timestamp, then stable Telegram ID. Frozen prior periods must not be
silently recalculated under a newer policy. A rule revision takes effect
at a documented boundary (no stealth retroactive winners).

Source standard for PR 1/2: \`source_system\`, immutable \`source_event_id\`,
verified \`telegram_id\`, accepted event type, earned UTC time, optional pet_id,
game title, verification version, \`policy_version\`, and one declared effect
type. **The browser may request reconciliation of an existing receipt, not
choose Clout numbers or claim completion.**

## 6. No-drama 24/7 retention, measured cost discipline

- Games remain playable after bonus/cap/cooldown where their *own* gameplay
  allows it. Do not disable games to protect a social leaderboard.
- Moonpet's server-owned care/energy/adventure locks remain authoritative.
  Recommend other **available** games, Daily Journey, wiki contribution,
  scheduled event or repeatable Moonpet Contract when an action is cooling down.
- Preserve Moonpet **7/7 Daily Checklist**, **3/5 Daily Journey** and
  **5/5 Weekly Journey** as separate owned systems. Do not create fake fourth
  "Daily Mission" completion or re-pay a receipt.
- Light D1 ledger + indexed read-side totals on existing Workers. No new
  paid services, constant cron, per-frame telemetry, device fingerprints or
  mandatory GPS.
- User labels must distinguish **practice**, **saved game result**,
  **verified Championship Clout**, **already counted**, **daily XP cap**,
  **unavailable**, **next reset**.

## 7. Dependency-safe implementation and STOP gates

1. **PR 0:** this evidence doc; no schema, gameplay or production writes.
2. **PR 1:** additive D1 receipt/effect schema and pure deterministic
   policy + projection tests; **no user-facing award writer**.
3. **PR 2:** explicit opted-in receipt adapters (start with \`/daily\` and
   accepted Moonpet evidence). No Moonpet progression rewrite.
4. **PR 3:** NBG, Dead Run and later independently attested Arcade sources,
   separately scoped and after game-specific replay/authority tests.
5. **PR 4/5:** shared HUD/leaderboard, signed smoke/controlled deployment.
   #1513 owns new accuracy/host competitions, #1478 owns Moonpet expansion,
   #903 owns the shared shell, #1458 governs canon.

**STOP** if: source owner/evidence missing; game score still client-authoritative;
D1 migration head/manifest unknown; duplicate writer or competing branch;
currency conversion implied; saved source timestamp ambiguous; existing
account/pet/Wallet credit unexpectedly changes; migration unreadable; signed
production verification unavailable for a claimed live feature.

### Required PR handoff format

For each child PR, record: current main SHA; files and routes changed; sources
admitted; D1 migration number and production status; Worker/Pages/VPS impact;
negative forged-score and duplicate/concurrent tests; old-pet/day/week/quarter
boundary tests; project-wide domain CI; actual live signed-account evidence
or **NOT VERIFIED**; rollback; explicit unresolved decisions.

**No edits to \`main\`, merge, D1 remote execution, or deployment authorized by
this documentation PR.** Follow \`AGENTS.md\`, \`AGENT_EDITING_RULES.md\`,
#1530 and the parent roadmaps #1513, #1478, #903.
