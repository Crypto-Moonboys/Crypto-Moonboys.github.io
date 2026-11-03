# TAG RUN V2 — user-selected WAX payout destination (no signature)

## Registration policy (approved product direction)

A Telegram member chooses a receiving WAX account by private message:
`/rain gkniftyheads`. The bot verifies that the account **exists on WAX
mainnet** and stores that name as the member's selected payout destination.
It does not ask the member to log into a wallet, sign a challenge, reveal a
private key, or prove that the selected account belongs to them. Any existing
account can be chosen, including a third party's. Account existence is not
account ownership.

On success, the bot replies **REGISTERED** and explains that payouts are
disabled. `/rainstatus` privately shows the chosen destination and attempts
a fresh account-existence check. In the group it must never expose the account
name. A failed RPC or invalid account must not replace an existing destination.

The legacy `tag_run_wallets.verification_status='pending'` field is retained
for compatibility. Its meaning was historically *ownership proof pending*;
it does **not** represent whether the user elected a receiving destination.
Do **not** rewrite this field to `verified` simply because the account exists.
User-facing messages now say `REGISTERED` rather than `PENDING verification`
for a valid receiving account.

## Future direct payments

The planned recipient route remains
`telegram_registered_wax_account`: an approved award would be sent by the
bot/treasury to the member's chosen existing WAX account, without a per-award
wallet login or claim.

**Risk:** a user may choose an account they do not control, enter a typo, or
select someone else's account. A successful blockchain transfer to that
destination normally cannot be reversed. Members must be clearly warned,
and destination changes must invalidate any unexecuted payment approval
bound to the previous account.

The future payout preflight requires an independently checked **account
existence on WAX mainnet** and an auditable record that the relevant Telegram
user selected the current destination. It does NOT require a wallet ownership
signature. The account/name must be rechecked and locked to the approved
allocation before any eventual transfer.

**Payout execution is NOT implemented.** `PAYOUTS_IMPLEMENTED=false`, the
preflight always returns `allowed=false`, and there is no signer or
transaction broadcaster.

## Independent launch prerequisites

- Obtain verifiable custody/spending authority for the treasury account
  `isthatajoint` out of band; never place signing keys in code or chat.
- Document donor intent and approve specific inbound donations; an observed
  positive balance is not prize-funding authorization.
- Produce complete irreversible WAX token snapshots, precise base-unit
  accounting, asset approvals, unique payout intent IDs, funded reservations,
  spend caps, deduplication, chain confirmation and failure reconciliation.
- Independently review the jurisdiction-specific promotional prize, tax,
  sanctions, privacy and operating requirements.
- Publish payout terms, including the risk of user-entered incorrect accounts,
  any restrictions, pending/unfunded rewards, and treatment of failed payouts.
- Get separate explicit authorization for any future release with a reviewed
  limited signing service. It must not be launched by switching flags alone.

## Current production safety (unchanged)

```toml
TAG_RUN_ENABLED = "true"
TAG_RUN_WEEKLY_REWARDS_ENABLED = "false"
TAG_RUN_V2_OBSERVATION_ENABLED = "true"
TAG_RUN_V2_POOL_ENABLED = "false"
TAG_RUN_V2_DRAWS_ENABLED = "false"
TAG_RUN_V2_PAYOUTS_ENABLED = "false"
```

Pool configuration remains `status='paused'`. No migration, payment,
token approval, funded draw or wallet-signature endpoint is added here.

## Test and deployment

```bat
node --test scripts/tag-run-community-rewards.test.mjs
node --test scripts/tag-run-v2-payout-policy.test.mjs
node --test scripts/tag-run-v2-observation.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
```

After review and passing tests, merge, deploy only `moonboys-api` through
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`, check
`/health` and `/deployment-info`, then test `/rain gkniftyheads` and
`/rainstatus` in a private Telegram DM. Check account-invalid, RPC-outage
and group-privacy cases. Observe that all funded flags stay OFF.
