# TAG RUN V2 — PR7: private /myrewards in observation-only pilot

**Master issue:** #1697. **Scope:** existing ONE Telegram community.
**Not:** a new funded-reward release, public-prize launch, transfer route,
approval flow, migration, scheduler, signer or new treasury accounting system.

## Gap fixed

`/myrewards` was already defined in `v2-service.js` but unreachable in
the live read-only pilot because `TAG_RUN_V2_POOL_ENABLED=false`. Members
could earn Street Cred and the admin could inspect V2 participation, while
individual members could not see **their own unfunded participation weight**.

This PR allows only **private** `/myrewards` when the existing
`observationEnabled(env)` gate passes. It retains the audited `paused`
pool configuration and 5% daily/50% historical parameters. It reads only
the authenticated Telegram member's rows scoped to the existing configured
group. Public invocations receive an instruction to DM the bot and do
not read or disclose a member's weight. Non-admin members can inspect
their own records; other members' participation is never returned.

The output is explicit about the count being **historical unfunded
Street Cred weight, not a token balance, entitlement or financial debt**.
Current-day V1 participation does not appear until the completed-day
V2 capture, preserving the original UTC scoring authority.

## Safety and tests

The existing query fails closed if D1 returns an unsuccessful response,
malformed rows, non-integer values, negative credit, spent weight above
earned weight or too many result rows. The existing capped 29-rank
Street Cred authority and V1 scoring are unchanged.

Four additional observation regression tests cover:
- Real completed-day participation from two members and an uncaptured
  current-day message, with no D1 changes from a summary read.
- Public invocation rejected without a DB read; a different private
  member receives only their own count; a matching member sees their own.
- Failed D1 read, corrupt participation data, and invalid review-state
  configuration fail closed.
- Observation feature OFF and funded pool OFF leave the command disabled.

The tests already run under the existing `scripts/tag-run-v2-observation.test.mjs`
CI domain; **no new production migration, reward gates or cron**.

### Required before merge

```bat
node --test scripts/tag-run-v2-observation.test.mjs
node --test scripts/tag-run-v2-community-pot.test.mjs
node --test scripts/tag-run-community-rewards.test.mjs
npm run ci:worker-api
echo Exit code: %ERRORLEVEL%
```

Do not deploy until code review and tests pass. This change does not need
a D1 schema migration. After a controlled provenance Worker deploy,
test `/myrewards` in the user's bot DM and once in a group to confirm no
private weight is disclosed in public; verify all payout switches OFF.
