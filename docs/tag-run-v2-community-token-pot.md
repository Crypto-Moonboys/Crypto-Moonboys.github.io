# TAG RUN V2 — Community Token Pot / `isthatajoint`

**GitHub master issue:** [#1697](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1697).
**Live V1 acceptance:** [#1696](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1696).

## Locked owner decisions

- **WAX public tip account:** `isthatajoint`. This string was supplied by the project owner. **Its on-chain existence and project spending authority/custody are not established simply by naming it. Do not request donations until independently verified.**
- **Main product:** permanent Street Cred / 29 ranks; token bonuses are optional, unpredictable and not price-indexed. Chat donations do not influence points or draw odds.
- **Accepted tips:** any fungible WAX token may reach the wallet; do not automatically classify every deposit as a donation or every contract as payout-eligible. Quarantine unknown, scam, nontransferable, spoofed and unreviewed tokens.
- **Daily budget:** `floor(5% × (verified on-chain units − existing unpaid reservations − excluded units))`, **per token identity**, at an agreed UTC snapshot. Never combine tokens by fiat price or substitute `WAXP` value.
- **Weight:** eligible chat receipts generate up to 510 raw Street Cred per member daily. During funded periods with both current and historical participants, **historical participants receive 50% of draw-ticket probability** and current participants 50% whenever both groups exist; if only one group exists, it receives all. Actual tokens awarded to either group can vary randomly day to day (including single-unit pools). Weighted selection is based on actual qualifying Street Cred.
- **Rollover:** when token balances cannot fund bundles, the member's unfunded participation weight remains recorded (not a debt denominated in WAX tokens). Unused donations carry forward; any token actually reserved to a recipient in a later, separately approved allocation remains their unpaid obligation until resolved.
- **Random bundles:** independently calculate each token's 5% allotment and divide into integer-unit bundles. Winner selection is Street Cred-weighted, with a seed commitment, record of inputs and replay verification. Distribution is not necessarily the same combination of tokens for every member.
- **No WAX transaction signing, custody secret, transfers, withdrawal, or automatic payouts in this development phase.**

## What the initial V2 foundation PR implements

1. New additive migration **104** and matching canonical schema for public wallet metadata, approved/quarantined token identities, reviewed deposit-event slots, exact-string balances, participation weights, review-only draw records/bundles and audit receipts.
2. `v2-core.js`: BigInt smallest-unit parsing and formatting, spendable token 5% budgets with floor rounding, chain-aware token identities, deterministic weight-based random bundles and a replayable SHA-256 seed commitment. The current draw API is **preview-only** and does not persist a pre-snapshot seed commitment; it is not yet a publicly verifiable live draw.
3. `v2-chain.js`: read-only WAX mainnet chain ID and named-account check; Hyperion token discovery; chain RPC recheck of **approved assets only**. Provider balances remain `observed_only` because the RPC does not attest historical finality at the daily cutoff. Contract-unknown tokens stay quarantined.
4. `v2-deposits.js`: bounded Hyperion WAX inbound transfer scan, rejects non-irreversible/malformed actions and stores unique on-chain action receipts as **quarantined only**; repeating a scan cannot turn receipts into donations. The admin-only `/poolscan` command records candidate evidence, never funding credits. Pagination/full-history reconciliation remains a separate launch gate.
5. `v2-service.js`: read-only `/pool`, `/myrewards`, admin `/poolstatus`, `/poolscan`, `/drawpreview`, `/drawaudit`, `/poolpause`; and idempotent capture of the previous UTC day's verified V1 chat receipts into a separate participation ledger.
6. Dedicated **00:10 UTC** participation cron, independent of the existing five-minute/9am/4-hour triggers. No daily draw executes with the new flags off.
7. Old V1 reward draft tables are retained and legacy `TAG_RUN_WEEKLY_REWARDS_ENABLED=false` remains. `/rewards` switches to the V2 community pot description **only if V2 is explicitly enabled later**.

### Fail-closed defaults

```toml
TAG_RUN_ENABLED = "true"                   # V1 Street Cred stays live.
TAG_RUN_WEEKLY_REWARDS_ENABLED = "false"    # V1 fixed LFGK drafts off.
TAG_RUN_V2_POOL_ENABLED = "false"           # V2 read-only view/ledger off.
TAG_RUN_V2_DRAWS_ENABLED = "false"          # No daily funded draw.
TAG_RUN_V2_PAYOUTS_ENABLED = "false"        # No payout implementation.
TAG_RUN_V2_TIP_ACCOUNT = "isthatajoint"
```

**A flag must not be turned on just to try it.** Additive D1 migration 104, backup, strict on-chain wallet/custody proof, read-only live inventory verification and a signed Telegram acceptance plan are required first.

## Important unfinished work before funded draws can be enabled

- **Custody verification:** prove `isthatajoint` exists on the expected WAX chain and is controlled for the community pot, with a published donate/not-donate policy and safe account separation. Never request or expose private keys.
- **Read-only deposit event ingestion:** implement finality-aware chain history backfill, sender/memo review, action sequence deduplication and balances-vs-transfers reconciliation; only confirmed eligible donations may affect token allocation. Do not equate any incoming transfer with a confirmed donation.
- **End-of-day finality:** chain account balances at head height are **not** immutable snapshots at last irreversible block; design and verify a point-in-time snapshot source before marking `tag_run_v2_snapshots.status='verified'`.
- **Seed commitment before known snapshot:** require independent/public randomness, publish the commitment before finalizing inputs, and prevent curator rerolls by withholding a seed. The current preview creates a seed in the same call and **is not sufficient for real awards**.
- **Exactly-once funded reservations:** add controlled transactional token liability journal, rollover weight consumption only when a funded win settles, per-token reserved funds, concurrency arbitration and cross-day reconciliation. The current V2 bundle table accepts only `status='preview_only'`, intentionally making payouts impossible.
- **Production eligibility/fraud control:** define supported token allowlist, user identity and wallet proof, daily ticket cap/abuse controls, anti-bot enforcement, no purchase-to-play or donation odds boosts, and a public opt-in policy.
- **UK/local promotional lottery/gambling/consumer-law review** and a deterministic nonrandom fallback before a public-prize pilot.
- Future separate payout project: externally reviewed treasury signer/permissions, 2-person approval, transfer idempotency, monitoring, receiver verification and incident response. **Not included or authorized here.**

## Required testing and migration order

1. Run `node --test scripts/tag-run-v2-community-pot.test.mjs` and the existing V1 `node --test scripts/tag-run-community-rewards.test.mjs`, then `npm run ci:worker-api` on the feature branch. Validate migration 104 on a disposable SQLite/D1 copy.
2. Review all updated migration-contract/CI files. Apply only missing reviewed migrations after a current off-site production D1 backup. Never run `d1 migrations apply --remote` blindly if extra migrations are queued.
3. Verify 104 exists in the remote `d1_migrations` table and `PRAGMA foreign_key_check` reports no violations. Retain separate production evidence.
4. Use the approved provenance wrapper to deploy only `moonboys-api` on clean up-to-date `main`. No real V2 feature flags are enabled in this release.
5. Run signed Telegram regression tests for V1 Street Cred, the rank celebrations, private commands, 4-hour bulletin topic routing, shared XP and MoonPet; check `/health` and `/deployment-info`.
6. Obtain explicit owner acceptance for further V2 funding/draw release and legal/custody approval. **Never enable payouts as part of this PR.**

## Design limitation: rollover weights vs winnings

Until token funds are irrevocably verified and auditable random selection is committed, carry-forward activity is **participation credit, not a fixed promise of tokens**. A losing member's past weight must not be silently burned by a preview. The production-funded draw contract must specify an exact debiting rule only for actual rewarded historical tickets and preserve unspent weight for later days.

## Rollback

Leave `TAG_RUN_V2_POOL_ENABLED=false`, `TAG_RUN_V2_DRAWS_ENABLED=false` and `TAG_RUN_V2_PAYOUTS_ENABLED=false`. V1 Street Cred remains independent. Never reset V1 scores, the D1 migration ledger, MoonPet, Arcade XP, Championship Clout or user wallets to troubleshoot V2.
