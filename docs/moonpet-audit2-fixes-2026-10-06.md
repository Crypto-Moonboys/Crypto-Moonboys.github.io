# Moonpet second hard-audit fixes — 6 October 2026

Audited base: merged main `d7c86667393e1a7867d3147a3fd35685081a51e9` (PR #1445).
The repeat audit confirmed three medium-severity defects in the existing game.
This follow-up fixes those defects. Breeding, Lineage, Fusion, Sanctuary and
Prestige upgrades remain outside this change.

## Fixes and regression evidence

| Finding | Resulting behavior | Regression evidence |
| --- | --- | --- |
| A Missions response can replace a full snapshot after the player changes tabs, leaving the destination without hydration. | Every accepted partial snapshot checks the currently open tab and queues the appropriate authoritative read. It waits for the installing action/read to finish, coalesces pending work and retains generation protection and bounded module retries. | Actual manual, care, cooldown and action handlers; switching to Explore, Work and Profile; unchanged Missions; stale responses; all background guards; newly selected pet; retry cap and manual recovery. |
| Deferred care reads retry indefinitely every two seconds and ignore Retry-After. | Care reads respect the server's minimum delay, back off exponentially with jitter and pause after three consecutive failures. A successful authoritative snapshot resets the budget; the Refresh control allows recovery. Late failures from superseded requests cannot restart retries. | Fake-clock outages, 60-second Retry-After, navigation rescheduling, three-failure pause, successful manual recovery and a late failed old read. |
| Stalled art loading can leave an accepted hatch held on its egg visual indefinitely. | JSON fetches, response-body reads and PNG loads settle within 15 seconds per request. Fetch deadlines abort the request; image deadlines detach handlers and remove the source. Failed packs remain retryable. The hatch transition waits at most 10 additional seconds after its animation callback, then releases its visual lock and selects art for the current saved pet. A generation guard protects a newer transition. | Real public art loader with stalled registry/manifest/atlas fetches and bodies, idle/action PNGs, background preload, cache retry and late completion; real hatch transition with stalled/ready/failed preload, overlapping transitions and a pet switch. |

The hatch deadline bounds the visual hold independently of individual art requests.
It does not guarantee that art is available during a network outage. These paths
read or render accepted state; they do not replay mutations or award XP/rewards.

## Validation and release

The dedicated suites are `scripts/moonpet-refresh-audit-fixes.test.mjs` and
`scripts/moonpet-art-loading.test.mjs`; both run in the Worker/API CI domain.
Existing passive-refresh, art architecture, player-loop and Mini App tests also
exercise the changed paths. The PR records the complete commands and final results.
GitHub Visual CI provides browser validation; production smoke checks remain a
post-deploy step.

Cache version: `20261006-live-refresh-v5` for both the Mini App and its changed
art loader. The Telegram launcher and Worker's Mini App URL use the same version.
No API behavior, schema, D1 migration, reward history or VPS runtime changes.
After an approved merge, publish the static frontend and deploy `moonboys-api`
to update its launch URL. Worker deployment is only needed for that URL constant.
No deployment or production data repair is performed by this fix PR.

After deployment, switch away from Missions while a Refresh, care read, cooldown
read or action response is pending: the destination must recover its controls.
Check that repeated failed care reads pause with a Refresh message and can recover.
Under a simulated asset outage, a hatch reveal must release without changing the
saved pet's XP or replaying Hatch; a healthy subsequent art load must work.
