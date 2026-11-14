# TAG RUN delayed / duplicate command replies

Interactive TAG RUN commands now claim a durable D1 receipt before execution.
The unique bot/update and bot/chat/message keys block concurrent requests and
later webhook retries. A failed/unconfirmed claim returns 503 before command
effects; an existing claim acknowledges without executing again.

After the claim, production uses `waitUntil` so the webhook acknowledges without
waiting for database reads, image generation or Telegram delivery. TAG RUN command
replies use text with an eight-second send deadline. Bulletins and rank-up media
retain their existing delivery. `/rank` is now a personal-profile alias;
`/ranks` still displays the ladder. `/profile` intentionally retains its two
established TAG RUN and legacy profile messages, under one command claim.

This is at-most-once execution, not guaranteed delivery. A Worker interruption
after claiming or an uncertain Telegram send can leave a command unanswered.
Claims are never automatically reclaimed: the user sends a new command to retry.
`completed` records handler completion, not proof of Telegram delivery. Claims
contain numeric routing identities only, with no command text or credentials.
No expiry is introduced because deleting a receipt would allow an old replay.
Other bot commands and ordinary-message scoring retain their existing paths.

## Validation

- Focused command/scoring/bulletin/auth suites pass, including ten concurrent
  webhook deliveries, blocked sends, private/group `/top`, `/top all`, `/rank`
  and `/tagprofile`, durable replay suppression, auth rejection, missing schema,
  completion-write failure, lost acknowledgements and no-context fallback.
- `npm run worker:build-check` passes (dry run; no deployment).
- The old media-coverage file has three remaining bulletin assertions that
  expect generated multipart photos instead of the current fixed-artwork JSON
  transport. These fail on original main too (main has five failures in that
  file, including two obsolete command-photo assertions updated by this patch).
  Its command and rank-delivery cases pass with this patch.
- Full Linux suite and live Telegram tests have not run.

## Release order

1. GK reviews/approves the PR and release.
2. Apply additive migration `113_tag_run_command_receipts.sql` to production D1
   and verify the table and both unique keys. It changes no reward balances.
3. Deploy the approved merged main through `scripts/deploy-worker-with-provenance.mjs`.
   Deploying code before migration makes TAG RUN command claims return 503.
4. Send one `/top` and `/rank` in private and group chats, confirming prompt,
   single text replies. Keep `/profile`'s documented two-message behavior distinct.

Rolling back code does not require dropping the receipt table. No production
migration, merge or deployment is part of the PR preparation.
