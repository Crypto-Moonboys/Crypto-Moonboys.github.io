# TAG RUN V2 Telegram funding controls

The Community Pot is controlled by the token allowlist, not by approving each inbound tip.

## Admin commands

- `/poolapprove contract SYMBOL precision review-reference` approves the exact WAX token identity. Once approved, every unit of that token in the independently verified irreversible `isthatajoint` balance is eligible for the Community Pot.
- `/poolquarantine contract SYMBOL precision reason` immediately excludes that token from future snapshots, draws and sends.
- `/pooldonation` is retained only to explain that individual tip approval is no longer required.
- `/poolsnapshot YYYY-MM-DD review-reference` persists the 1% snapshot for approved tokens only.

Unknown tokens remain quarantined. Snapshot creation still requires two agreeing WAX history providers at a common irreversible block.

Draws, signing, broadcasting and payouts remain separate gates and remain OFF until explicitly enabled.
