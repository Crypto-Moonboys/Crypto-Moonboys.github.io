# TAG RUN V2 — Admin-only observation pilot (Issue #1699)

> Historical pilot scope: this document describes the original observation
> commands approved on 3 November 2026. The later private-admin token and
> funding controls are documented in
> `docs/tag-run-v2-telegram-token-controls.md` and
> `docs/tag-run-v2-telegram-funding-controls.md`. Those later controls may
> approve exact receipts and verified 1% snapshots while draw and payout flags
> remain off; they do not change `/poolobserve` or `/pooltest` into funding
> commands.

**Scope:** Read live WAX blockchain inventory and test real Telegram Street Cred participation without creating claimable tokens, approved donations, commitments, wallet signatures or payouts.

## Deployment state

The user approved observation-only testing on **3 November 2026**. Migration **104** was already applied to the production `wikicoms` D1 database; no new schema migration is needed for this PR.

```toml
TAG_RUN_ENABLED = "true"
TAG_RUN_WEEKLY_REWARDS_ENABLED = "false"
TAG_RUN_V2_OBSERVATION_ENABLED = "true"  # NEW read-only pilot gate
TAG_RUN_V2_POOL_ENABLED = "false"         # funded pool remains OFF
TAG_RUN_V2_DRAWS_ENABLED = "false"        # funded draws remain OFF
TAG_RUN_V2_PAYOUTS_ENABLED = "false"      # transfers remain OFF
TAG_RUN_V2_TIP_ACCOUNT = "isthatajoint"
```

The `tag_run_v2_pool_config` record must still contain wallet `isthatajoint`, `status='paused'`, `daily_bps=500`, `historical_ticket_bps=5000`. Changing it to `read_only` or `review_only` is **not required** for these private commands and blocks the observation pilot. This independent gate fails closed if any funded/weekly reward flag becomes true.

**Custody caveat:** WAX account existence has been checked on-chain, but the product owner's custody/spending control, each token's donor intent and legally permissible prize rules are not independently established by this deployment. **Do not solicit public tips or describe observed balances as rewardable funds.**

## Admin-only commands — direct message to @WIKICOMSBOT

Only Telegram IDs in the existing `ADMIN_TELEGRAM_IDS` secret may use these commands, and only in private DM with the bot. Nothing is broadcast to the group.

| Command | Action |
|---|---|
| `/poolstate` | Show the independent pilot gate, real recorded V2 member-days, V1 activity for the completed day and historical capture cursor |
| `/poolobserve` | Fetch all paginated Hyperion token identities, confirm WAX mainnet/account, verify positive token quantities with the independent chain balance endpoint; persist **only quarantined identity rows**, never balances as verified D1 snapshots. Creates an idempotent audit receipt |
| `/poolreview` | Review registered symbol, contract, precision and **quarantined** status; **does not promote assets**. Independent chain-contract, safety, donor policy and operator approval are prerequisites for a future allowlisting change |
| `/poolbackfill` | Reconcile up to seven completed UTC days of genuine V1 group receipt records into V2 non-token participation weight. Repeat if backlog remains. Idempotent; zero chat activity is recorded as an empty completed day |
| `/pooltest` | After backfill is complete, read live **unfinalized head balances** and real V1/V2 member points, then compute an **UNSAVED, UNVERIFIED hypothetical** 5%-per-token pot-luck allocation. Includes at most 12 positive token contracts and does not write token entitlements or reserves |

### What the commands cannot do

- No minting, approvals, payouts, token transfers or contract signing.
- No `tag_run_v2_snapshots.status='verified'`, no funded `tag_run_v2_draws`, no `tag_run_v2_bundles` writes and no wallet secret access.
- The 5% calculation from currently observed wallet head balances is a **what-if only**. It ignores actual token reservation because none has been authorized or established. Do **not** treat simulation output as a future claim or transferable token debt.
- `/poolreview` is an inspection queue, not an approval mechanism. Promoting tokens to `eligibility='approved'` requires a separate reviewed authorization and verification process.
- A failed/incomplete token inventory, incorrect chain, unknown precision or incomplete historical backfill blocks preview rather than fabricating zeroes.

## Quiet-group test

1. Use an existing verified Telegram admin account. Send a **unique message of at least 10 characters** in the configured community group to generate genuine V1 Street Cred; wait at least 45 seconds between creditable messages.
2. Use `/tagprofile` in the bot (or `/top` in the group) to confirm V1 has actually scored. This scoring is independent of the V2 pilot.
3. DM `/poolstate` and `/poolobserve`, then `/poolreview`. Confirm new asset identities remain quarantined, and observed quantities (such as LFGK/WUF) appear only as unfinalized observations.
4. After UTC midnight, DM `/poolbackfill` until it says no days remain; check `/poolstate` confirms the cursor through the completed day. Old activity is never fabricated; members earn Street Cred even if the tip wallet is empty.
5. DM `/pooltest` for an unsaved hypothetical 5% calculation. If participation is incomplete, it MUST say BLOCKED; if no group activity exists, it MUST say no eligible member/draw bundles.
6. Check production D1 has **no** confirmed token donations, verified balance snapshots, funded allocations or transfers. Verify public group Top 10 and original MoonPet systems remain unaffected.

### Suggested read-only production verification

```bat
npx wrangler d1 execute wikicoms --remote --config workers/moonboys-api/wrangler.toml --command "SELECT eligibility,COUNT(*) AS n FROM tag_run_v2_assets GROUP BY eligibility"
npx wrangler d1 execute wikicoms --remote --config workers/moonboys-api/wrangler.toml --command "SELECT * FROM tag_run_v2_capture_cursors"
npx wrangler d1 execute wikicoms --remote --config workers/moonboys-api/wrangler.toml --command "SELECT COUNT(*) AS n FROM tag_run_v2_participation"
npx wrangler d1 execute wikicoms --remote --config workers/moonboys-api/wrangler.toml --command "SELECT COUNT(*) AS n FROM tag_run_v2_bundles"
npx wrangler d1 execute wikicoms --remote --config workers/moonboys-api/wrangler.toml --command "SELECT COUNT(*) AS n FROM tag_run_v2_snapshots WHERE status='verified'"
```

All scheduled participation and admin commands are scoped to the existing configured Telegram group. Captured V2 member-day rows preserve the original V1 scoring authority.

## Review / deployment / rollback

1. On feature branch run `node --test scripts/tag-run-v2-observation.test.mjs`, `node --test scripts/tag-run-v2-community-pot.test.mjs`, `node --test scripts/tag-run-community-rewards.test.mjs`, `npm run ci:worker-api`, and `node scripts/verify-d1-production-migrations.test.mjs`.
2. Review PR comments and confirm no other migrations are pending. **No migration should be applied for this pilot.**
3. Merge the reviewed PR, update clean local `main`, and deploy **only** `moonboys-api` via `node scripts/deploy-worker-with-provenance.mjs moonboys-api`.
4. Verify `/health` and `/deployment-info` and check all six relevant feature flags against deployed Wrangler output.
5. If any unexpected behaviour occurs, revert only `TAG_RUN_V2_OBSERVATION_ENABLED` to `false` through a reviewed deployment; **never reset D1, V1 Street Cred, MoonPet, shared Arcade XP, member history or wallets**.
6. When the pilot ends, leave payout/draw flags disabled. Future funded draws need independent legal/custody review, accurate finalized donation ledger, immutable token reservations and a separately authorized signing system.

**Security limitation:** Read-only Hyperion inventory observation uses current head-state queries rather than historical irreversible balance snapshots. That is intentional for visual inspection only, not evidence of a 5% awardable supply.
