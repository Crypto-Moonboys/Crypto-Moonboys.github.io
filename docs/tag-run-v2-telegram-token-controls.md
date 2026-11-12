# TAG RUN V2 Telegram token controls

These commands are deliberately short operational controls for the authorised TAG RUN
administrator. Send them only in a private chat with the bot.

## Approve a token identity

```text
/poolapprove kingsofgraff LFGK 4 review-reference
```

The bot requires an exact observed contract, uppercase symbol and precision. It then
rechecks the WAX mainnet chain, `isthatajoint` account and exact live token identity
before atomically setting `tag_run_v2_assets.eligibility` to `approved` and writing an
append-only audit event. Approval is refused unless the Community Pot is paused.

This approves token eligibility only. It does not:

- confirm that any inbound transfer was a donation;
- approve a contract code or ABI hash;
- verify an immutable balance snapshot;
- enable draws, signing or payouts.

After a token is approved, use the separately reviewed private-admin funding
controls in `docs/tag-run-v2-telegram-funding-controls.md` to approve an exact
quarantined donation receipt and capture a completed day's irreversible 1%
snapshot set. Token approval never performs either step automatically.

Run `/poolobserve` first if the identity has not yet been recorded.

## Quarantine immediately

```text
/poolquarantine kingsofgraff LFGK 4 reason
```

Quarantine has no chain API dependency. The bot atomically changes the asset back to
`quarantined`, clears its verification timestamp and writes an audit event. Future
snapshot, draw and payout eligibility rechecks reject the asset. Existing audit history
is retained.

Repeated commands are safe: an already-approved or already-quarantined identity returns
its current status without another write.
