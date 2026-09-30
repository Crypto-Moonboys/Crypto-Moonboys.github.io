# Moonpet production canary and state performance — 2026-09-30

This operational batch adds post-deploy proof for the authenticated Moonpet
state path and reduces duplicate D1 work. It does not change schema, gameplay
balance, rewards, cooldown policy, XP, leaderboard formulas or historical data.

## State-refresh work removed

The Mini App state builder previously read the same runtime progression twice,
read lifecycle identity twice through guidance and season rewards, and queried
special-action usage twice for guidance and the cooldown timeline. The state
builder now shares those authoritative reads. The cooldown timeline is derived
from the already-read special-action guidance object, so the displayed timers
and action availability cannot drift between two queries in one response.

The regression fixture records these budgets from one central module:

- warm adopted state: maximum 180 D1 statements; observed 164 in this batch;
- recovery refresh: maximum 600 D1 statements; observed peak 560 while draining
  50 saved sources, including one interrupted recovery.

The limits are regression ceilings, not production latency claims. The canary
records real request timings after deployment.

## Production canary

`.github/workflows/moonpet-production-canary.yml` is manual-only. It checks the
deployed commit before sending authentication, then verifies:

1. authenticated Mini App state and core authority shape;
2. authenticated seasonal leaderboard shape;
3. public seasonal leaderboard shape;
4. optionally, one allowlisted care action with a commit-stable request ID.

The state endpoint is not read-only: it can initialize current-season rows and
recover interrupted awards. Therefore the canary refuses to run unless
`MOONPET_CANARY_ALLOW_WRITES=1` is explicit. It must use a dedicated adopted
test pet, never a player account.

Configure these GitHub `production` environment secrets:

- `MOONPET_CANARY_BOT_TOKEN`: the production Telegram bot token used to sign
  fresh Mini App `init_data` in memory;
- `MOONPET_CANARY_TELEGRAM_ID`: the numeric ID of the dedicated canary account.

The token and signed `init_data` are sent only in POST bodies and are never
printed. Optional actions additionally require both a selected allowlisted
action and the workflow's `allow_action` confirmation.

## After merge

No migration is required. Deploy `moonboys-api` with the provenance wrapper,
wait for `/deployment-info` to report the merged commit, then manually run
**Moonpet Production Canary** with that full commit. Leave `action` as `none`
for the state-and-leaderboard check; action mode is an explicit deeper probe.

Historical XP remains evidence-gated. This batch does not reset players or
invent missing ledger history.
