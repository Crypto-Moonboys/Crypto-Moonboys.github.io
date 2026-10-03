# Consolidated Moonpet audit fixes — 3 October 2026

This change addresses all twelve confirmed families in the [four-pass audit](moonpet-post1423-audit-2026-10-03.md), including its Weekly Boss Crest and duplicate-progression extensions. The fix branch started from `main` at `4d4160f8d`, after the audit baseline `cae48482af09f535ffddc0b1881d62f4a6b00e03`. The intervening changes concern wiki content, not Moonpet runtime.

## Fix matrix

| ID | Defect | Resulting behavior |
| --- | --- | --- |
| A1 | Delayed raid rewards credit the payout quarter. | The server derives competition earning time from the saved victory and binds that timestamp to reward authorization. Lifetime XP goes to the original victor; daily/weekly settlement caps keep their existing behavior. |
| A2 | Wallet/header, shop and rankings can mix account snapshots. | Full/Profile, Missions, core and independent guidance compare economic fingerprints before and after projection. Changes during construction produce the existing unavailable/refresh response. A supplied stale guidance header is also rejected. |
| A3 | Contract payout acknowledgement can silently change no rows. | A successful acknowledgement must change one row or read back the exact settled contract and credited amount. A committed payout stays accepted but pending/refresh until acknowledged. |
| A4 | Raid payout acknowledgement can silently change no rows. | Mutation success and one affected source row are required. Retrying the original receipt acknowledges without paying again. |
| A5 | Failed Daily room reads become empty rooms. | Initial and repair reads validate D1 results and room shape. Failed reads cannot publish fictitious choices or replace saved rooms. |
| A6 | Pending Street Events become inaccessible when the challenge expires. | The initial reservation stores the original choice, outcome and random range draws. Explore lists owner-scoped saved events. `event_recover` settles their saved source without a fresh-action token, including after switching pets. Proven unpaid unaffordable outcomes cancel and release their slot atomically. Unassigned or incomplete legacy evidence stays visible for audit. |
| A7 | Craft, upgrade or cosmetic receipts complete despite missing delivery. | Required debits, output and terminal writes assert affected rows inside the D1 transaction. A no-op rolls back the whole purchase; a healthy retry delivers once. |
| A8 | Missing Growth Marks/Crests masquerade as duplicates. | Zero-row inserts require an existing exact or legitimate capped Mark/Crest. Otherwise activity and Weekly Boss completion remain recoverable, with payment preserved and no duplicate payout. |
| A9 | District/story/raid progress and ending markers can diverge or replay. | Progress and completion assertions run in one transaction. Recovery cannot add mastery or damage twice. A proved later story completion may legitimately prevent an older absolute-step write without rewinding progress. Required energy debits also commit with their source marker. |
| A10 | A resolved Daily boss room is treated as a victory without proof. | Action recovery, automatic recovery, reward authorization and deletion checks require JSON boolean `true`. Missing, malformed, string and numeric success values grant no boss rewards. |
| A11 | Rejected Weekly Journey counts inflate completion. | Live readiness uses validated objectives. Accepted historical receipts remain preserved and authoritative; rejected counts cannot announce an unearned Crest. |
| A12 | Care/item/trade acceptance can outlive omitted economic writes. | Required lifetime XP, quarterly competition XP, Community XP, wallet and inventory writes assert inside the receipt transaction. Failure rolls back acceptance and effects together. Zero Community XP and pet-only items during wallet recovery retain their legitimate no-op exceptions. |

## Transaction and recovery boundaries

D1 `batch` provides transaction rollback on an error, but a resolved successful mutation may affect zero rows. `atomicPetBatch` inserts SQLite `changes()` assertions immediately after required writes. An invalid JSON path aborts the transaction when a required write is missing. The guard is conditional on the new source reservation, so concurrent duplicate losers remain no-ops. Original result indexes stay stable for callers.

Recovery retains immutable owner/pet/source-season tuples. The account wallet, daily caps and competition scores are shared; lifetime Pet XP, identity and progression stay with each pet. Two- and three-pet regressions include real Mini App switches, retained ownership seasons, daily/weekly/seasonal/all-time ranking checks, interrupted ending acknowledgements and duplicate retries.

No historical ownership, receipt, reward or evidence data is deleted. No blanket historical balance repair is attempted: production D1 was not inspected, and a receipt that cannot prove original delivery or attribution must not authorize invented rewards. In particular, legacy Street Events without their original outcome remain an explicit audit state. Existing recoverable paid sources continue using their saved proof and idempotency keys.

Pets and purchased spaces remain permanent. Lifetime XP/evolution remains separate from daily, weekly and quarterly competition progress. The 1,000 lifetime Arcade XP entry requirement, three active spaces, existing ownership, reward history and inactive Breeding classification remain intact.

## Deployment and configuration

- No D1 migration or canonical schema change is required. Existing receipt metadata stores Street Event decisions; transactional assertions add no schema objects.
- No new Cloudflare secret or Wrangler variable is introduced. Keep the existing production `TELEGRAM_WEBHOOK_SECRET` configured as a Worker secret, with the existing minimum length and allowed-character rules. Telegram registration must send the matching `secret_token`; follow the existing [webhook setup](telegram-webhook-security.md) if configuring a new environment. Do not put secret values in source, logs, responses or `[vars]`.
- After owner approval and merge, publish the Worker and the Mini App frontend together. The frontend asset version is `20261003-consolidated-recovery-v1`. Existing production migration verification, deployment readiness and webhook checks remain required.
- `node scripts/generate-publishing-surfaces.mjs` regenerated required public indexes. It produced no content differences from the committed outputs.
- Check a retained raid claim across a quarter boundary, a saved Street Event after token expiry, two/three-pet switches, shop debit/delivery, all ranking periods, Daily boss outcomes and Weekly Journey/Crest recovery after release.

**No production deployment or merge was performed.**

## Validation

The four new regression suites are registered in the Worker API CI domain. Historical audit diagnostics deliberately describe the old baseline and are not fixed-behavior CI tests.

All **201 registered CI commands passed locally**:

| Exact command | Result |
| --- | --- |
| `npm run ci:worker-api` | PASS — 121 commands |
| `npm run ci:arcade` | PASS — 24 commands |
| `npm run ci:wiki` | PASS — 24 commands |
| `npm run ci:wax` | PASS — 17 commands |
| `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium PLAYWRIGHT_BROWSERS_PATH=/tmp/moonpet-playwright npm run ci:visual` | PASS — 15 commands |

Focused regressions passed **219 cases**:

```sh
node scripts/moonpet-consolidated-atomicity.test.mjs    # 69
node scripts/moonpet-consolidated-endings.test.mjs      # 88
node scripts/moonpet-consolidated-proofs.test.mjs       # 52
node scripts/moonpet-consolidated-projections.test.mjs  # 10
```

The Worker domain includes action synchronization, rankings, quests, progression,
Daily/Weekly Journey and Runs, bosses, combat, completion/Finale, season rewards,
delete/recovery, webhook authentication, notifications and deployment/migration
verification. The browser domain includes the full player loop and three-space
ownership/deletion flow. `git diff --check` and `node --check <file>` for all 27
changed/new JavaScript files passed. Publishing-surface regeneration passed.

These are source, real SQLite, authenticated local Worker and browser checks.
Production account data and bindings were not inspected; no live deployment is
claimed.
