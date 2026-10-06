# Moonpet refresh and legacy-event fixes — 6 October 2026

Audited base: `2247e99d3106baa847382d8c29a5ce693d17ea53`.
Backup: `codex/backup-moonpet-audit-fixes-20261006`.
Fix branch: `codex/sandbox-moonpet-audit-fixes-20261006`.

## Result

Arena/Kaiju and timed-activity polls now request a small source-validated live projection rather than rebuilding the full game. The client serializes passive polling with care-action, cooldown, season and module refreshes. Slow responses can render instead of being superseded every five seconds. A terminal combat transition still requests the complete ordered recovery and economic checks before publishing rewards, including a match completed and replayed on another device between polls. A changed active pet or ownership season triggers a complete save load instead of merging identities. Interrupted combat settlement and cross-device activity changes also request full recovery before displaying their effects on care, XP or balances.

The warm fixture uses **19 SQL statements for live state versus 166 for full state**, an approximately 89% reduction for ordinary passive polls. This is a database-work measurement, not a promise of a particular production latency or capacity. Full module loading and terminal reward recovery still use the complete projection.

## Changes

| Audit issue | Fixed behavior |
| --- | --- |
| Overlapping multiplayer state polls | One passive request at a time; the minimum interval runs from completion. Other background refreshes yield to it; stale user-action generations and wrong-pet patches remain rejected. |
| Full-state work on every passive poll | Authenticated `/telegram-pets/app/state` accepts `mode: live`; the response includes only active identity, Arena/Kaiju queues/matches/results, card previews, timed activity and server time. No partial wallet, XP, roster, lifecycle, missions or shop values are published. |
| Cooldown outage retries | Exponential backoff plus jitter, honoring Retry-After, followed by a visible pause after three failed reads. A successful/manual snapshot resets the retry state. |
| Action canary false positives | Sends the displayed pet ID; requires HTTP 200, `ok: true` and `accepted: true`; checks that the selected pet did not change. Its idempotency key is stable for the commit, account, pet and action and fits the server length limit. Unexpected rejections fail the run. Read-only health does not imply action coverage. |
| Unverified legacy Street Event has no player ending | Explore exposes **Close Old Event** only for incomplete old outcomes without awarded XP or a recorded claim. Exact player confirmation is mandatory. Saved-event recovery and closure remain visible after switching to an egg. Existing claims and recoverable saved outcomes remain protected. Metadata, ownership, balances, original ordinal and reward history stay intact. No old reward slot is released. |
| Frontend/Worker release gap | New client accepts the older Worker's full response for the previously unknown mode. Cache-busted launch URLs use `20261006-live-refresh-v4`. |

Closing an unverified old event is an explicit forfeiture of that unresolved event, not a guessed payout, refund or historical balance repair. The event record remains with status `cancelled` and reason `legacy_street_event_closed`. Its pending-event deletion blocker is released; any separate active claim or settlement still blocks deletion. A concurrently saved outcome or claim prevents closure.

## Original patch validation

Focused regressions cover 7.5-second responses with five-second timer ticks, no overlapping reads, stale/wrong-pet/incomplete patches, old-Worker compatibility, terminal recovery before reward publication, Retry-After/backoff/manual retry, action-canary rejection, immutable legacy evidence, pet switches, eggs, protected claims, concurrently saved outcomes and retained history after pet replacement.

The live projection is compared against full-state combat/activity fields with an enforced SQL budget. The deployed-entry fixture also exercises the authenticated live mode. The actual Mini App browser fixtures dispatch the live projection rather than silently substituting full state.

| Check | Result |
| --- | --- |
| Worker/API domain | All 124 registered commands passed. The first run passed 119 commands, then stopped at a missing locked `smol-toml` dependency. After installing that exact dependency outside the tracked repository, all five remaining commands passed. |
| Arcade domain | All 24 registered commands passed. |
| Wiki domain | All 34 registered commands passed. |
| WAX domain | All 17 registered commands passed. |
| Visual domain | All 15 registered commands passed. The initial run completed four commands before an unavailable default browser binary stopped the avatar test. The remaining 11 commands passed with the available Chromium; no unrelated test or runtime change was needed. |
| Moonpet mobile browser loop | Passed at 390×844 and 360×640: all six screens, bosses, season finales, clear/failure/retry, saved reload and payout recovery, shops, crafting, contracts, daily/weekly activities and pet deletion/replacement. |
| Public browser surfaces | Passed at 360px, 390px and 1280px: retained state, refresh, retry/outage recovery and XP charts. |
| Final focused changes | All 18 passive-refresh and legacy-event tests passed after the final refinements. Canary tests passed all eight cases. Mini App and player-loop checks passed. |
| Source and publishing checks | JavaScript syntax, `git diff --check` and publishing-surface generation passed. |

All **214 registered repository commands** passed across the completed domains and resumed tails. These are local fixture and browser checks; they do not establish live payment/notification delivery or production load capacity.

## PR 1445 review follow-up

The Codex and Copilot findings against published commit `5543634c802a2cac466d9b38df2ec35f998a92f4` exposed five additional gaps:

| Finding | Resolution |
| --- | --- |
| Repeated Work readiness alerts | Capture activity readiness before the poll; emit the message and success haptic only when that activity becomes ready. |
| Care-action full reads overlap live polls | Care-action, passive, cooldown and season reads yield to one another. A scheduled care read waits without invalidating a live read, and a slow care read retains its full inventory and progression snapshot. |
| Cross-device activity claim leaves stale balances | Disappearance, replacement or status changes request full state before merging the activity. Failed recovery retains the original activity so polling can retry. |
| Closing erases the reservation reason | Prefix the closure marker to the original reason, retaining `repeat_reward_slot:N` and any paid-energy suffix verbatim. Metadata and the high-water counter remain unchanged; duplicate closure remains accepted. A concurrent reason change rejects closure. |
| Committed combat stays locked | The live projection exposes a boolean `recovery_needed` when saved Arena moves or Kaiju cards can settle. The client requests full recovery even when the match ID has not changed. A player still waiting for an opponent does not trigger recovery, and hidden opponent decisions remain private. |

The follow-up uses release version `20261006-live-refresh-v2`. No migration or secret is added, and the ordinary live fixture remains at 19 SQL statements within its existing 20-statement budget.

Follow-up verification: `node --test scripts/moonpet-passive-refresh.test.mjs scripts/moonpet-legacy-event-close.test.mjs scripts/moonpet-combat-sanity.test.mjs scripts/moonpet-progression-sync.test.mjs` passed all 260 tests. `node --test scripts/moonpet-action-sync.test.mjs scripts/moonpet-combat-integrity.test.mjs scripts/moonpet-history-retention.test.mjs scripts/moonpet-production-canary.test.mjs` passed all 89 tests. Mini App, launcher and multi-bot-art checks also passed, as did JavaScript syntax and scoped whitespace checks. The original patch's mobile browser loop passed; this follow-up's local browser loop was not rerun because Chromium is absent after workspace relocation. GitHub Visual CI runs that loop and remains required.

## PR 1445 scheduling follow-up

Copilot confirmed the four findings from its previous review were resolved, then identified two existing refresh gaps:

| Finding | Resolution |
| --- | --- |
| Switching to Missions during recovery installs a partial save | Identity and terminal recovery always request the full projection with an empty payload, independently of the selected tab. Unexpected partial responses are rejected, keeping the previous complete save available for another poll. |
| Aligned live timers indefinitely skip the season read | A due or forced season read remains queued when another read is active. The next eligible live tick services that full read first. Failed or superseded reads retain the queue with a 30-second retry delay; live polling can continue during that delay. Season reads also require the full projection. |

Release version `20261006-live-refresh-v3` includes these changes. Regressions cover switching to Missions and back to Explore/Work during identity recovery, terminal recovery while visiting Missions, partial-response rejection, forced visibility refreshes, failures and 126 aligned five-second ticks with a season tick every 30 seconds. The timer simulation completes two scheduled full reads without overlapping requests.

Scheduling verification: `node --test scripts/moonpet-passive-refresh.test.mjs scripts/moonpet-action-sync.test.mjs scripts/moonpet-production-canary.test.mjs` passed all 87 tests. Mini App, launcher and multi-bot-art checks passed, as did JavaScript syntax and scoped whitespace checks. All GitHub workflows passed at the preceding follow-up commit `d8d0316cad33dcd7379d06664bf56ccc8fd713bd`, including the required browser validation. The scheduling follow-up requires those workflows to pass again; Chromium remains unavailable in the relocated local workspace.

## PR 1445 request and egg-control follow-up

The next review found that a fetch or response body could remain pending indefinitely and retain the shared refresh guard even after a successful manual read. Each API request now has one deadline covering fetch, body parsing, read-only retry delays and all retry attempts: 30 seconds for the live projection and 60 seconds for other reads and actions. Expiry aborts the request and rejects the caller even if the transport ignores cancellation. Existing `finally` blocks release refresh guards; late responses cannot publish state or change authentication status. Successful and failed completed requests clear their timers. Mutations are never retried automatically, and an unconfirmed action still requires an authoritative read before another gameplay click.

The egg action allowlist now includes `event_recover` and `event_close`. The saved-event regression executes the real button and availability renderers with `phase: egg`, verifies both controls are enabled, and confirms new event gameplay remains hatch-gated and the unconfirmed-save guard still disables recovery. Closure still requires exact event confirmation in the game and retains all protections documented above.

Release version `20261006-live-refresh-v4` includes these fixes. Request regressions use the shipped `post()` and background refresh functions with stalled fetches/bodies, manual supersession, late responses, queued season/cooldown/care reads, retry preservation, one deadline across transient state retries and non-replayed mutations.

Request/control verification: `node --test scripts/moonpet-passive-refresh.test.mjs scripts/moonpet-action-sync.test.mjs scripts/moonpet-legacy-event-close.test.mjs scripts/moonpet-production-canary.test.mjs` passed all 105 tests. Mini App, player-loop (36 literal action controls), launcher and multi-bot-art checks passed. JavaScript syntax and scoped whitespace checks passed. All GitHub workflows passed at the preceding commit `44d96e3439d9aa2336cfcbd9cc798f4f1074d657`, including browser validation; they must pass again for this follow-up. The local browser suite was not rerun because Chromium remains absent after workspace relocation.

## Preserved rules

Permanent pets; no automatic retirement/reset; 1,000 lifetime Arcade XP entry; three concurrent pets; purchased spaces; deletion/replacement history; lifetime evolution and approximately one-year completion; daily/weekly/quarterly competition; boss/finale win, loss, retry and once-only rewards.

No schema migration or new secret is required. Existing migration readiness through 089 remains required for the already merged game.

## Still open

- **32 later-stage animation packs:** all eight identities still have pending stages 2–5 in the registry. The approved base/egg/street art remains installed. These missing animation packs require artwork and visual review; this patch does not relabel existing base packs as complete evolved designs.
- **Historical events with a recorded claim or awarded XP:** stay protected and need source-backed recovery/review; closing cannot bypass them.
- **Production speed/capacity:** the lean poll is tested locally, but actual post-release latency, large-account recovery, two-device multiplayer and thousands of concurrent players still need measurement.
- **Production account/schema inventory and real payment/notification delivery:** were not inspected or exercised here.

## Release

Review and merge the PR after validation, then deploy `moonboys-api` using the repository's provenance deployment workflow and verify the new commit. Pages publishes the cache-busted client from main. Deploying the Worker before relying on lean polls gives the intended performance improvement; the old-Worker compatibility path keeps the game playable during the gap.

After release, run read-only health and the explicitly authorized dedicated-account action canary separately. Play Arena/Kaiju with two clients, finish a match, verify reward totals and pet switching, verify timed-activity readiness, refresh after a simulated cooldown outage, and close a test legacy event only after its confirmation.

No merge, production deployment or historical data repair is performed by this fix branch.
