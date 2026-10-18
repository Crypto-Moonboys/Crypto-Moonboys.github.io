# PR 5 / issue #1552 — accepted-action sync, claim badges and reconnect reconciliation

**Scope:** completion/notification polish only. This PR does not change rewards, task completion rules, XP, clout, pet ownership, faction scoring, gameplay costs, Worker SQL, D1 schema or settlement endpoints.

## What this PR adds

- A tiny global `player-action-sync.js` invalidation bus loaded from the shared site shell and directly by standalone MoonPet OS.
- It listens only to existing **server-accepted** source events: accepted MoonPet actions, confirmed progression writes, accepted Arcade score updates, accepted Wiki mission completion and accepted WTF check-in/completion.
- Cross-tab messages use `BroadcastChannel` and carry only `{source,event,utc_day,remote}`. They never carry Telegram IDs, pet IDs, auth hashes, request IDs, rewards, receipts, score values, mission IDs or task payloads.
- Duplicate bursts inside 900 ms are collapsed. Rejected/unconfirmed writes are not subscribed.
- My Moonboy treats an accepted event as **stale-read invalidation only**. It immediately hides Top 3 and current claim badges, then re-reads `/player/action-plan`; it never flips a task to complete/claimed locally.
- Offline My Moonboy keeps the last snapshot visibly stale, suppresses current ready/claim badges and performs no read. `online`, focus and visibility restore through a fresh signed read.
- Faction/Community private contribution consumes the same accepted signal and reconciles only through the existing authenticated Daily Loop singleton.
- Verified Action Plan claim count appears on the Claims tab; per-pet claim badges appear only for loaded `claim_ready` + `source_health=live` rows. Stale/offline snapshots cannot show a current claim badge.
- Existing MoonPet Saved Status remains authoritative for claim classes not represented by `/player/action-plan`. The machine parity map explicitly marks those gaps; the dashboard does **not** invent cache/season-tier claims.

## Accepted write sources

`player-progress-sync.js` emits `moonboys:server-action-accepted` only after an HTTP response with `ok: true`. The event includes safe route/source classification only. Existing onSuccess handlers still perform their own UI refreshes. Failed auth, rejected HTTP, lost responses and unconfirmed mutations emit no accepted signal.

MoonPet OS emits `moonpet:action-accepted` only after `/telegram-pets/app/action` returns `result.accepted === true`. The event includes action name/source only; original pet/request/reward/receipt data never leaves the game response scope.

Telegram `/daily` runs outside the website and therefore cannot emit a browser event. Reconciliation uses the existing focus/visibility refresh plus the new online reconnect handling. This PR does not pretend a bot action can directly push into a closed browser tab.

## MoonPet Saved Status parity

`data/player-action-sync-claim-parity.v1.json` compares current Saved Status claim classes to the action-plan registry.

Direct/partial overlap includes 7/7 daily completion bonus → `moonpet.seven-of-seven-claim`; Contract saved reward → `moonpet.contracts`; timed activity/recovery → `moonpet.jobs`; daily bounty claims → `moonpet.claimable-rewards`; weekly boss/saved raid reward → `moonpet.bosses-combat`.

Explicit current gaps: Daily Cache has no dedicated action-plan claim adapter; account season-tier claims have no dedicated action-plan claim adapter. Those gaps are intentionally **not** counted in My Moonboy’s Action Plan claim badge. Saved Status remains canonical for them until an authoritative adapter exists. Automatic Journey awards and evolution readiness are not manual claim badges.

## Tests

- `scripts/player-action-sync-browser.test.mjs`: two-tab sanitized BroadcastChannel behavior, dedupe, non-bubbling Wiki accepted event, offline/online reconciliation and rejection/error non-events.
- `scripts/player-action-sync-parity.test.mjs`: machine parity map, real registry keys, known gaps cannot claim badge, MoonPet accepted event has no pet/auth/reward payload, shell/standalone loader contract.
- `scripts/telegram-progression-auth.test.mjs`: confirmed progression response emits one sanitized accepted event; rejected response emits none.
- `scripts/my-moonboy-browser.test.mjs`: Action Plan claim badge, per-pet claim badge, accepted invalidation hiding stale readiness, offline suppression and online verified recovery.

## Runtime / release

- Static frontend and tests only.
- Worker redeploy: **No**
- D1 migration: **No**
- VPS restart: **No**
- GitHub Pages publish after approved merge: **Yes**
- No push-notification infrastructure is added. Reminder preference remains optional and intentionally unimplemented rather than pretending browser/Telegram push exists.
- Hold merge until all CI/review checks pass, live signed-account cross-tab/privacy/reconnect QA is recorded, and GK explicitly approves.
