# TAG RUN engagement release

/mytagrun in the private bot chat shows today's credited points, the 30-message cap, lifetime rank, streak, daily mission, saved WAX destination, reward block state and recorded unused participation. Group use returns a private-chat instruction.

Each member receives one stable daily mission: three credited messages spanning ten minutes, or credited replies to two distinct members. Completion is a cosmetic daily badge computed from accepted receipts. Weekly titles are also cosmetic. This release does not add another ticket boost or change the approved 1% draw budget.

The existing 30-minute Community Pot tick publishes:
- yesterday's recap once;
- the last fully tracked closed week's awards once;
- up to one newly confirmed payout per tick, with exact amount, token issuer, recipient rank and WAX transaction link;
- up to three eligible non-winners from a reviewed draw whose unused weight is still recorded.

The near-miss list uses the frozen draw's eligibility, excludes every bundle winner and currently reward-blocked member, and checks live unused participation. It does not promise future tokens. Winner posts require confirmed ledger status and a valid transaction hash. Unknown broadcasts are never called paid.

Top Tagger uses weekly points. Biggest Climber uses positive point gain over the previous week among returning members. Best Streak uses consecutive active days within the closed week. Community Helper counts distinct reply targets in credited messages. Newcomer uses first-ever credited message date. Numeric Telegram ID resolves ties. Award titles do not exclude reward-blocked members from community recognition.

## Farming controls

Existing spam, command, duplicate, cooldown, day and daily-cap checks stay in place. With engagement enabled, an exact normalized message copied by another account within 24 hours earns no points. Reply bonuses to the same target stop after two accepted replies per UTC day. Distinct-target mission progress counts accepted receipts only. This does not claim semantic detection of every coordinated conversation.

## Delivery

Each event is claimed in D1 before Telegram is contacted. Concurrent ticks cannot send the same event twice. A failed or ambiguous delivery is retained as needs_review and is not automatically retried. Posts use the configured group topic and existing optional Moonboy image delivery, with its existing uncertain-send rules. An image failure before Telegram can fall back to text. Notification failures are isolated from token operations.

Migration start day prevents retroactive payout highlights and partial historical weekly awards. The first weekly award is for the first complete Monday-Sunday week after tracking began.

## Deploy order

1. Back up production D1 and rehearse migration 112 against a local restored backup.
2. Apply 112_tag_run_engagement.sql to wikicoms.
3. Deploy moonboys-api with TAG_RUN_ENGAGEMENT_ENABLED=true.
4. Test /mytagrun privately and in the group, then inspect scheduled recap and confirmed payout evidence.

No signing secrets, new cron or token permission changes are needed. Existing ledger records are not modified. Mission evidence begins with the new reply metadata; historical reply targets cannot be reconstructed.

## Verification

The pure mission, award, exact-quantity and notification-claim checks were executed in an isolated JavaScript harness (six checks passed). The SQLite migration/scoring/dashboard tests and SQLite notification integration test are included for Node 24. Local Node execution was blocked by the Windows sandbox lock, so these tests and Worker dry-run still require the focused checks below before release:

node --test scripts/tag-run-engagement.test.mjs scripts/tag-run-community-rewards.test.mjs scripts/tag-run-v2-full-automation.test.mjs
npx wrangler deploy --dry-run --config workers/moonboys-api/wrangler.toml
