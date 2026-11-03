# TAG RUN V2 — PR8: on-demand read-only /pool status

**Source of scope:** [Master issue #1697](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1697), section 5, explicitly requests a read-only member-facing `/pool` command.

The previous public `/pool` code was gated on
`TAG_RUN_V2_POOL_ENABLED=true`, which remains intentionally **false**
during the approved observation pilot. The existing fallback merely said
the Community Pot was inactive, even though real observation commands,
quarantined token identities, and unfunded Street Cred were working.

This PR opens **only the on-demand /pool display** under the previously
reviewed `observationEnabled(env)` condition: V1 scoring and observation ON,
weekly V1 rewards and V2 funded pool/draw/payout OFF.

### What it shows
- Pool **PAUSED**, draws **OFF**, transfers **OFF**.
- A bounded count of `quarantined` and `suspended` observed token identities
  read from the existing D1 asset table. It does **not** publish the treasury
  address, current observed token quantities, unverified head balances,
  private Telegram identities, WAX recipients or anyone's individual weight.
- A warning that **no asset is rewardable** and **no tokens should be sent**:
  custody, contract review and donation policy have NOT been authorized.
- Existing Street Cred and 29 ranks continue; users may DM `/myrewards`
  for their own non-token participation credit.

### Fail-closed rules
- Existing pool config must be the one known paused
  `isthatajoint` config with `daily_bps=500` and
  `historical_ticket_bps=5000`. This is a safety check, not a prompt
  to advertise that account.
- Required D1 asset query must return `success=true`, an array,
  valid known eligibility and bounded integer counts; invalid responses fail
  closed rather than telling members that assets do not exist.
- Unexpected `approved` token identities while the read-only pilot is
  deliberately paused reject the public status request. No public message
  may imply that any token balance is spendable, available, finalized,
  approved or owed.
- The old funded-mode `/pool` handler is unchanged when observation
  is OFF and funded mode is separately enabled.
- This command performs **no D1 writes** or blockchain calls, and it is
  invoked only when a member requests `/pool`. No scheduled group spam.

Four additional regression tests in the existing observation suite cover
quarantined assets, an empty table, malformed/failed D1 reads, unexpected
approved assets, both observation/funded OFF gates, no broadcasts,
no prize writes and no disclosure of the treasury account.

### Validation before merge

```bat
node --test scripts/tag-run-v2-observation.test.mjs
node --test scripts/tag-run-v2-community-pot.test.mjs
node --test scripts/tag-run-community-rewards.test.mjs
npm run ci:worker-api
echo Exit code: %ERRORLEVEL%
```

**No production migration, no new Telegram group, no accounts or wallet
verification change, no signing, no WAX transfers, no public token donation
campaign and no funded draw release.** No deployment is performed by
merging this PR. Deploy only after full review and green tests.
