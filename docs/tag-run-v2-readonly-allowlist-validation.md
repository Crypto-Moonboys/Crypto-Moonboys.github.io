# TAG RUN V2 — allowlist-only read-only live preview validation

## Observed production state, 2026-11-05 (read-only D1 API)
- Wallet: `isthatajoint` on WAX Mainnet.
- Pool: `paused`, active policy version `2`, `active_daily_bps=100` (1%).
- Five discovered token identities: `gkniftyheads:BITCOIN:8`,
  `gkniftyheads:HITCOIN:8`, `kingsofgraff:DUMPIT:8`,
  `kingsofgraff:LFGK:4`, `wuffi:WUF:4`.
- **All five quarantined**. No approved tokens.
- No confirmed donations, verified funding snapshots, reward draws,
  payout caps or transfer intents. Capture through 2026-11-04 UTC.
- This D1 inspection does not prove live current token balances or
  irreversible donation/finality evidence.

## Why this patch is needed
The existing admin-only `/pooltest` created UNSAVED hypotheticals from every
observed positive token, including quarantined unknown assets. Even clearly
marked "what-if," such output should not resemble the approved-token reward
pool. This patch makes `/pooltest` use only identities on the exact D1
allowlist **and** in the `observed_only` state. `/poolobserve` remains the
separate unrestricted read-only inventory, and `/poolreview` the review queue.

When no positive allowlisted tokens exist the **expected approved-only preview
is zero tokens and zero hypothetical bundles**. Do not auto-approve the
existing five tokens merely to get a nonzero test.

## Live operator verification (Telegram admin private chat)
1. Confirm the Worker version containing this PR is deployed by its ordinary
   controlled Worker release process. Repository merge alone does not deploy.
2. `/poolstate`: pool PAUSED, funded draws/transfers OFF, capture cursor
   complete through target previous UTC day.
3. `/poolreview`: every unapproved token remains `quarantined`.
4. `/poolobserve`: inventory may show positive token balances, but *observed*
   is not a donation or approval. This command writes only quarantined
   discovery identities and an audit event.
5. `/pooltest`: reports observed positive and quarantined-excluded counts,
   approved observed count `0`, **no approved 1% token pools**, and **0
   hypothetical bundles**. No D1 draw/claim/reservation/payout rows saved.
6. If capture is lagging, `/pooltest` refuses simulation until
   `/poolbackfill` catches up; backfill is a participation write, not a
   wallet transfer.
7. Read D1 to verify `status='paused'`, `active_daily_bps=100`,
   `active_policy_version=2`, all unreviewed assets quarantined and
   `tag_run_v2_draws`, `tag_run_v2_payout_caps`,
   `tag_run_v2_payout_intents` remain empty.

All real reward distribution requires separate independent token contract,
precision, custody/donation provenance, finalized snapshot, allowlist-owner
review, transaction authorization and explicit owner approval. A token's
contract/ticker/precision is its identity; never approve by ticker alone.

## Safety and test
`node --test scripts/tag-run-v2-observation.test.mjs`
`npm run ci:worker-api`

No funded draw, signer, token-transfer flag, wallet permission or
production migration is enabled by this patch.
