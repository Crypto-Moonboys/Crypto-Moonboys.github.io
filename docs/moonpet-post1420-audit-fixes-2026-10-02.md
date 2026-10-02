# Moonpet post-deployment audit fixes — 2 October 2026

The audit of merged commit `c964232356d22699c83089fe9de9d23ee2f04185`
confirmed eleven defects after PR #1420. It traced all 67 visible mutation
actions, 42 Telegram Moonpet aliases and their completion/recovery paths.
Two/three-pet lifetime progression and daily, weekly, quarterly and all-time
Pet rankings passed the additional attribution checks. Community XP and official
Daily Run score remain separate from those Pet XP rankings.

## Defects and resulting behavior

| Defect | Fix |
| --- | --- |
| Daily Run uses expired stored care stats, allowing a losing roll to win. | Preview and outcome use the same source-pet decay rules; outcome persistence verifies the consumed authoritative snapshot. |
| Pet awards select Community seasons at midnight, while the public board selects the full timestamp. | New awards use their authoritative full earning timestamp, including recoverable saved source times. Legacy day-only evidence is retained rather than assigned an invented timestamp. |
| A Community award can save its log but lose account or seasonal XP while `/daily` reports success. | A durable award receipt, XP log, account XP and Community leaderboard write commit atomically. The command announces a new reward only after validated commit. |
| Concurrent `/daily` calls or failed history reads allow repeated daily payouts. | An account/action/day claim key guards the transaction. Failed reads report unavailable; retries return the original claim without another award. |
| Direct Arena moves can revive an expired battle. | Shared mutation authority enforces deadlines on new input while preserving already locked decisions awaiting CPU or reward recovery. |
| Failed Arena forfeit writes are reported as completed duplicates. | Mutation results and saved terminal evidence must prove completion; failed writes remain retryable. |
| Slow notification preparation consumes leases before later sources are processed. | Delivery leases are acquired for the source being processed, with existing token fencing, preferences, source guards and cooldowns retained. |
| Notifications name an original source slot as the current permanent pet space. | The captured pet is labelled with the same permanent-roster ordinal the player sees. Immutable ownership slots remain unchanged. |
| Rooftop Courier shows Level 12 but requires Level 20. | Projected and enforced prerequisites share the existing authoritative Level 20 gate; this does not lower the unlock requirement. |
| A failed activity-expiration write exposes an expired session as claimable. | Expiration writes are validated and readiness independently respects the saved time window; unavailable state cannot offer an impossible claim. |
| The “Defeat 3 enemies” Daily Journey completes through Sneak past/Escape. | New objective evidence requires an authored enemy-defeat outcome. Evasion and trading do not count as defeating an enemy; existing historical evidence remains retained. |

## Ownership and history

Permanent pets, the three-space limit, purchased spaces, the 1,000 lifetime
Arcade XP entry requirement, per-pet lifetime/evolution/specialist progress and
separate account competition scores remain unchanged. Recovery stays bound to
the original owner, pet and source season. This change does not expose Breeding
or another planned system as live gameplay.

No historical ownership or reward data is deleted. Existing paid receipts,
legacy logs, balances, objective evidence and original ownership seasons are
retained. An old Community log alone cannot prove which portion of a non-atomic
payout committed; this release does not fabricate compensation or rewrite those
records. Any historical correction needs a separate evidence-based audit and
approved repair. Legacy Arcade events still marked `processing` remain explicitly
pending for audit rather than receiving a guessed second payout. New Arcade
awards commit their source event, cap, enforcement and wallet bookkeeping in the
same transaction as Community XP.

## Migration and deployment

Migration `089_community_xp_award_receipts.sql` adds durable Community award
identity. A new receipt table is needed because existing XP logs can legitimately
contain retained duplicate historical entries, and changing/deleting those logs
to impose a new uniqueness rule would destroy evidence. Migration 089 is
registered in the production manifest, D1 evidence request, required-migration
verifier, its regression tests and every migration-verification workflow surface.

Apply migration 089 to `wikicoms` before deploying the updated Worker, after
review and explicit production approval. From a clean approved main checkout:

```sh
npm ci
node scripts/worker-deploy-readiness-audit.mjs
npx wrangler d1 migrations apply wikicoms --remote --config workers/moonboys-api/wrangler.toml
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

These are deployment instructions only. **No production deployment, migration,
secret rotation or live-account mutation was performed.** Review the pending
migration list before applying it, and use the existing production D1 evidence
workflow to verify migration 089 before Worker deployment. Do not bypass its
provenance or secret checks.

No new Cloudflare secret is required. The existing `TELEGRAM_WEBHOOK_SECRET`
binding and matching Telegram registration remain mandatory, with the existing
32–256-character runtime requirement and plaintext-configuration prohibition.
Use the [exact secret setup and webhook-registration procedure](telegram-webhook-security.md)
if the binding has not already been configured. Never place the secret in source,
Wrangler variables, logs or responses.

## Validation

Focused regressions passed with Node 24.19.0 and real SQLite-backed D1 fixtures:

| Command | Result |
| --- | --- |
| `node scripts/community-xp-awards.test.mjs` | 32 passed: atomic rollback, concurrent daily/Arcade claims, source recovery, cap/wallet preservation and legacy clocks. |
| `node scripts/moonpet-community-season-boundaries.test.mjs` | 35 passed: intraday boundaries, saved source times, mixed timestamp formats, offsets and fractional boundaries. |
| `node scripts/moonpet-arena-mutation-integrity.test.mjs` | 26 passed: expired inputs, failed mutations, locked decisions, round deadlines and retries. |
| `node scripts/moonpet-daily-outcome-integrity.test.mjs` | 11 passed: decayed source stats, interleaving, rollover, three-pet isolation and genuine combat evidence. |
| `node scripts/moonpet-job-activity-authority.test.mjs` | 25 passed: job prerequisites, failed expiration, retry and saved reward recovery. |
| `node scripts/moonpet-guidance-notification-scope.test.mjs` | 31 passed: slow/overlapping scans, current roster labels, switches, archives and cooldowns. |
| `node scripts/moonpet-progression-sync.test.mjs` | 141 passed. |

All five CI domains passed (189 commands in total):

| Command | Result |
| --- | --- |
| `npm run ci:worker-api` | PASS, all 110 commands. |
| `npm run ci:arcade` | PASS, all 23 commands. |
| `npm run ci:wiki` | PASS, all 24 commands. |
| `npm run ci:wax` | PASS, all 17 commands. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/moonpet-playwright CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run ci:visual` | PASS, all 15 commands. |

The Worker domain includes action synchronization, public rankings, quests,
progression, Daily Journey/Daily Moon Run, Weekly Journey/bosses, combat,
completion/Finale, season rewards, deletion/reward recovery, webhook
authentication and notification settings. The browser domain passes the full
Mini App player loop at 390×844 and 360×640 and public state/ranking/retry flows
at 390, 360 and 1280 pixels. Two/three-pet isolation and daily/weekly/quarterly
competition projections remain covered. Wiki and WAX domains were run
separately because their fixtures temporarily rewrite a shared generated page.

The checks use local fixtures and browser sessions, not production accounts or
the production database. Historical production discrepancies are not repaired by
these tests. No public application assets changed, so no cache-version bump was
needed. `node scripts/generate-publishing-surfaces.mjs` completed without any
generated changes; `node scripts/graph-publishing-integrity.test.mjs` passed.

`node scripts/verify-d1-production-migrations.test.mjs`,
`node scripts/worker-deploy-readiness-audit.mjs`, changed JavaScript syntax checks
and `git diff --check` passed. The readiness audit validates repository
configuration; it does not certify that migration 089 is already applied or read
the deployed secret value.

This local bundle-only command passed and exited without deployment:

```sh
WRANGLER_LOG_PATH=/tmp/moonpet-post1420-wrangler.log XDG_CONFIG_HOME=/tmp/moonpet-post1420-config npx wrangler deploy --dry-run --config workers/moonboys-api/wrangler.toml --outdir /tmp/moonpet-post1420-worker-bundle
```
