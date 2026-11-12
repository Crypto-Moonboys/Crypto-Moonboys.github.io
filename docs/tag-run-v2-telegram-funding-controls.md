# TAG RUN V2 Telegram funding controls

This follow-up to the token allowlist adds the two deliberately small funding
steps needed by the existing persisted owner-draw workflow. Both commands are
restricted to an authorised administrator in a private bot chat. The Community
Pot must still be paused and both draw and payout flags must be off.

No command in this change signs, broadcasts, reserves or pays tokens.

## Approve one quarantined donation receipt

First run `/poolscan` in the private admin chat. In the paused observation
configuration it still performs only the existing bounded, irreversible inbound
scan and saves new receipts as quarantined evidence. Then use the reviewed
receipt's WAX global action sequence:

```text
/pooldonation 123456789 donation-review-reference
```

The exact asset must already be approved with `/poolapprove`. The command
rechecks the saved transaction, global sequence, block, sender, recipient,
contract, symbol, precision, amount and memo digest against two distinct
Hyperion history providers and an authoritative irreversible WAX block. Only
then does one D1 transaction change the receipt to `confirmed_donation` and
append its admin review audit event.

The review reference records the administrator's separate donation-intent
decision. Chain history proves that the transfer occurred; it does not infer
donor consent on its own. Quarantined, rejected or refund-review receipts are
never promoted implicitly.

## Capture one completed UTC day's 1% snapshots

```text
/poolsnapshot 2026-11-11 snapshot-review-reference
```

The command takes one common cutoff equal to the lower last irreversible block
reported by the two fixed WAX chain providers. For every currently approved
asset, two independent Hyperion state-history providers must agree on the
latest exact `accounts` table row at or before that cutoff. The row's own block
ID and the common cutoff block ID are checked against both WAX chain providers.

All approved assets are written together; quarantined and suspended assets are
excluded. For each approved asset:

- confirmed donation units through the cutoff back the eligible balance;
- previously confirmed irreversible payout units are deducted from that
  donation backing before any current balance can be considered eligible;
- any balance not backed by an approved donation is excluded;
- every outstanding reviewed-but-unpaid bundle is reserved;
- spendable units are `balance - unpaid reservations - exclusions`;
- `daily_reward_units` is exact integer `floor(spendable / 100)`;
- the policy is fixed to 100 basis points and the row is `verified`.

The snapshots and one structured audit event are a single D1 batch. A changed
allowlist, duplicate day, provider mismatch, partial write or audit failure
rolls the whole set back. A saved UTC day is never replaced by this command.
The persisted draw workflow later rechecks and freezes the exact snapshot,
donation and outstanding-obligation records before it can commit a draw.

## Boundaries

- The historical state check is corroborated provider evidence, not a Merkle
  inclusion proof and not a proof of treasury-key custody.
- Only standard Antelope token `accounts` rows keyed by the approved symbol are
  accepted. Missing or inconsistent history fails closed.
- Asset approval and donation approval remain separate decisions.
- Draws stay off during these commands. Payouts, signing and transfers stay off
  throughout this change and still require their independent release process.
