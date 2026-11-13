# TAG RUN V2 Telegram funding controls

The Community Pot is controlled by the token allowlist, not by approving each
inbound tip.

## Admin commands

- `/poolapprove contract SYMBOL precision review-reference` approves the exact
  WAX token identity, rechecks it through two providers and pins its code and
  ABI hashes. Every independently verified irreversible unit of that token in
  `isthatajoint` then becomes eligible automatically.
- `/poolquarantine contract SYMBOL precision reason` immediately excludes that
  token from future snapshots, draws, reservations and signing.
- `/poolpause` is the global emergency stop. It pauses the durable policy and
  all open payout caps.
- `/pooldonation` is retained only to explain that individual tip approval is
  no longer required.
- `/poolsnapshot YYYY-MM-DD review-reference` remains available for audit and
  recovery, but the normal daily snapshot is automatic.

Unknown tokens remain quarantined. Snapshot creation requires corroborated WAX
state at irreversibility. Normal operation needs no per-tip approval, daily
command, draw command or Anchor prompt.

See `docs/tag-run-v2-full-automation-release.md` for the one-time migration,
secret and deployment procedure.
