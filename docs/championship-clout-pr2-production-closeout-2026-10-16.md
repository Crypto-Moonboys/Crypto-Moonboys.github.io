# #1530 — PR2 final production deployment evidence (16 October 2026)

> **Scope lock:** This is the final **PR2 release-evidence closeout**, **NOT final Championship v1 acceptance**. Issue [#1530](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1530) stays **OPEN**. Code for PR2 already merged via [#1534](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/1534). This documentation-only PR does **not** deploy, migrate, activate, score, add games, or change any currency.

## 1. What is actually verified

Evidence supplied directly by GK from Windows Command Prompt:

| Surface / step | Observed result | Evidence class |
|---|---|---|
| `git pull --ff-only origin main` | Updated local `main` through PR2 merge `ed03324dcfef0311a62ff3c31a36d8665a2d8421` | Owner CLI |
| `npm ci` | Installed successfully; 0 vulnerabilities reported | Owner CLI |
| `node scripts/worker-deploy-readiness-audit.mjs` | PASS; `moonboys-api` deployable; unrelated Block Topia workers remain blocked or need setup | Owner CLI |
| `node scripts/deploy-worker-with-provenance.mjs moonboys-api` | Uploaded and deployed `moonboys-api` tagged with `ed03324dcfef0311a62ff3c31a36d8665a2d8421` | Owner CLI |
| Wrangler deployed Version ID | `aa97f39c-95bd-4add-a8f1-20772a1305be` | Owner CLI; not a Git commit |
| `GET https://api.cryptomoonboys.com/health` | `{"ok":true}` | Owner screenshot of read-only HTTP result |
| `GET https://api.cryptomoonboys.com/deployment-info` | `{"service":"moonboys-api","commit":"ed03324dcfef0311a62ff3c31a36d8665a2d8421","deployed_at":"2026-10-16T13:08:04.162Z","environment":"production"}` | Owner screenshot of public provenance endpoint |
| Wrangler deployment bindings | `CHAMPIONSHIP_CLOUT_PILOT_ENABLED="false"` | Owner CLI |
| PR2 merge | GitHub PR [#1534](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/1534) merged as `ed03324dcfef0311a62ff3c31a36d8665a2d8421` | GitHub commit |

**Interpretation:** Code is deployed, **not active Championship scoring**. The HTTP endpoint indicates health and source commit, not authenticated Telegram gameplay, Clout writes, or balance reconciliation. The deploy output did not list a pilot launch-time binding.

Retained snapshot: [Worker provenance evidence](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/blob/main/deployments/evidence/worker-provenance-clout-pr2-2026-10-16.json). Workflow `Worker Live Evidence Capture` MUST independently re-fetch **all three** Workers and compare the retained JSON before this evidence PR can be merged. Other Workers' entries are historical carry-forward, not newly owner-tested.

## 2. D1 migration / backup (already performed, do not repeat)

Owner reported live Wrangler confirmation that `100_championship_clout_foundation.sql` was the sole pending migration, then applied successfully (10 statements). Subsequent `migrations list` returned **no pending migrations**; `d1_migrations` contained migration 100; the four `championship_clout_*` tables existed; `PRAGMA foreign_key_check` returned no listed violations. Sanitized record: [D1 evidence](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/blob/main/deployments/evidence/clout-pr2-d1-migration-2026-10-16.json).

The owner exported production D1 before the migration and moved both SQL backup files outside the repository. Neither SQL contents, secret-bearing export URLs, account IDs nor personal Telegram identifiers are committed. Backup restore tests and **complete read-only production D1 migration inventory** have not been independently verified. Therefore `wikicoms` in `deployments/production.json` remains `verification-pending`; only migration **100** is newly recorded as individually observed. **Do not reapply migration 100.**

## 3. Existing invariants and feature gate

- PR2 accepted sources: Telegram `/daily` award+XP log receipt, Moonpet Daily Journey qualified 3/5 Growth Mark, Moonpet Weekly Journey qualified 5/5 Crest. Server-owned original events only.
- The Clout projection is non-spendable and replay/dedupe protected, and uses `ctx.waitUntil` to avoid blocking completed game actions. These are implemented/tested code properties **not yet signed-live validated**.
- Pilot remains disabled in deployed Worker: `CHAMPIONSHIP_CLOUT_PILOT_ENABLED=false`. An explicit separately approved `CHAMPIONSHIP_CLOUT_PILOT_START_AT` UTC-midnight gate is also required. No automatic activation from migration or merge.
- Never mix Arcade lifetime/spendable XP, Community XP, Pet XP, Faction Clout, Moon Gold or in-game balances with Championship Clout. Preserve 365-day Moonpet / 240 Growth Marks / 44 Crests, original pet ownership/quarter rollover and specialist boards.
- No Worker, VPS, Pages, Telegram bot menu, cron, GPS permission, prize flag or SQL schema change in **this** evidence PR.

## 4. Remaining work — **do not close #1530**

| Stage | Status | Next owner action |
|---|---|---|
| PR0 [#1531](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/1531) | Merged | Keep source audit authoritative |
| PR1 [#1533](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/1533) | Merged; D1 migration 100 owner-observed applied | Do not reapply |
| PR2 [#1534](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/1534) | Merged; Worker deployed; pilot OFF | This evidence closeout; signed canary **not done** |
| PR3 verified scored games | NOT IMPLEMENTED | NBG replay parity, Dead Run settled results, trustworthy Arcade receipt verification; coordinate with #1513 and #1478 |
| PR4 scoreboard/UX | NOT IMPLEMENTED | Daily/weekly/quarterly/annual My Clout, badges, Hall of Fame, archived ranks, cooldown guidance; coordinate with #903 |
| PR5 signed production canary / activation | NOT AUTHORIZED | GK approval, full D1 ledger evidence, real newcomer/returning signed Telegram smoke, abuse/replay and rollover checks, rollback plan and award/balance reconciliation |

### Minimum future activation checkpoint

1. Obtain separate GK approval for a bounded pilot launch and chosen UTC-midnight start, with `CHAMPIONSHIP_CLOUT_PILOT_ENABLED` still false until that release.
2. Independently verify deployed SHA, Cloudflare bindings, complete migration ledger, private backup recoverability, and baseline **existing** XP/pet receipts. Keep NBG prize switches and Dead Run ranked flags unchanged.
3. Test genuine signed newcomer `/daily` + returning pet Journey `3/5` and `5/5` end-to-end; observe actual **Clout ledger/effect/daily rows**, duplicate replays, wrong owner, source timestamps, concurrency and 0 wallet/Community XP side effects.
4. Verify daily/weekly/quarterly/annual read correctness and period finalization before opening player-facing badges/Hall of Fame. Feature-flag OFF is the immediate safe rollback for **future writes**; correcting previously written Clout rows needs a separately reviewed reconciliation procedure. Never restore the entire production DB casually.
5. Document actual signed-account outcomes (without publishing identifiers) and seek explicit approval before saying `VERIFIED IN PROD` for Clout gameplay.

**STOP:** the present public `/health` and `/deployment-info` results prove Worker provenance only, not a complete Championship. The master issue and remaining PR phases stay open.

## 5. Required release checks before merging this documentation PR

- `node scripts/worker-deployment-provenance.test.mjs`
- `node scripts/worker-live-evidence-compare.test.mjs`
- `node scripts/production-deployment-truth-audit.test.mjs`
- `node scripts/production-deployment-truth-audit.mjs`
- `node scripts/verify-d1-production-migrations.test.mjs`
- CI `Worker Live Evidence Capture` must show `Worker provenance evidence matches live production for 3 services` for the **new** request, with no drift in other two Workers.
- No merge until required CI green and explicit GK release-evidence approval; **merging this PR is not an authorization to redeploy or activate Clout**.
