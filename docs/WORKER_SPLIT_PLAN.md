# Worker Split Plan

This is a pressure report for PR #854. It does not split Workers. The current `moonboys-api` Worker can still handle the Phase 1 daily-loop authority, but route ownership is getting broad enough that the next phases should add stricter frontend sharing, caching, and eventually service boundaries.

## Current Worker Responsibilities

- Auth/profile: Telegram auth verification, user profile upsert/read paths, profile-linked identity helpers.
- Telegram webhook: bot webhook handling and Telegram command/event ingress.
- Telegram daily digest/group announcements: scheduled personal digest, group summary, timed Daily WTF announcements, announcement logs, and manual/admin run/status routes.
- Arcade/Block Topia progression: arcade score/progression authority, roguelite daily state, missed history, Block Topia auth/progression hooks.
- Wiki engagement: wiki mission completions, comments/engagement, publishing and engagement APIs.
- Factions/Battle Chamber/Daily WTF: faction membership/signal state, Battle Chamber activity/standings, Daily WTF schedules and player event state.
- Daily-loop state: `GET /daily-loop/state` and `POST /daily-loop/state` aggregation over the UTC-day state contract.
- WaxOnEdge API: WAX token analytics, indexer/bootstrap, WAXCASH analytics, token-page and valuation routes.

## Current Risk

- This is not a Cloudflare capacity overload yet. The immediate risk is ownership and pressure drift, not a proven platform ceiling.
- The Worker is becoming too broad: public API routes, linked player state, Telegram bot/webhook handling, scheduled digest jobs, faction/battle systems, wiki engagement, and WaxOnEdge analytics now share the same deployment unit.
- Scheduled/bot jobs should not permanently live beside public API routes. Digest and announcement work can grow in duration and failure modes that do not belong on the same critical path as page-facing endpoints.
- The daily-loop aggregator must not be called repeatedly by every widget. It should be the canonical page/session fetch, then shared to consumers through one frontend state layer.
- Heavy or slow cron/digest work should use non-blocking patterns such as `ctx.waitUntil()`, queues, or a dedicated Worker in a later phase. Public request handlers should stay short and predictable.

## Query Pressure

These are current Phase 1 estimates for `/daily-loop/state`. They include D1 table-check probes and successful data queries in the current builder. They do not include Telegram auth verification, user upsert helper calls outside `buildDailyLoopState`, or future caching.

| Request shape | Table checks | Data queries | Estimated total D1 operations | Notes |
| --- | ---: | ---: | ---: | --- |
| Anonymous `GET`, no migrations present | 9 | 0 | 9 | Each subsystem checks its first required table, then reports `migration_pending`. |
| Anonymous `GET`, all required tables present | 15 | 4 | 19 | Table checks for all required tables, plus Battle Chamber standings/activity, Daily WTF events, and group announcements. |
| Linked `POST`, all tables present, persisted Daily WTF events absent | 15 | 17 | 32 | Adds identity, faction, arcade daily state insert/select, missions, wiki completions, missed perks, digest, and a second group announcement read after auth. Daily WTF remains preview. |
| Linked `POST`, all systems live | 15 | 18 | 33 | Same as above, plus `daily_wtf_player_events` overlay when persisted Daily WTF rows are live. |

Pressure takeaways:

- The table-check phase is a fixed cost in Phase 1. It is useful for truthful `source_status`, but it should be cached/debounced in Phase 2.
- Linked state is materially heavier than anonymous state. It should only run when fresh/restored signed Telegram auth exists.
- The frontend should treat this endpoint as a shared authority fetch, not as a per-widget polling target.

## Guardrails

- Frontend code must call `/daily-loop/state` once per page load/session through a shared frontend singleton or state layer, then distribute that state to widgets.
- Phase 2 should add cache/debounce around daily-loop state fetches so repeated page widgets, remounts, and countdown ticks do not cause repeated D1 aggregation.
- No widget may independently spam `/daily-loop/state`.
- No cron/digest route should block public API requests. Long-running Telegram digest/group announcement work should move toward `ctx.waitUntil()`, queues, or a dedicated Worker.
- `source_status` must expose `query_failed`, `live_empty`, `preview`, `migration_pending`, and `unavailable` truthfully. No swallowed query error should be reported as `live`.

## Future Split Proposal

- `moonboys-api-core`: auth/profile, CORS/helpers, small public identity reads, shared Worker API utilities.
- `moonboys-engagement-api`: wiki engagement, comments, wiki mission completions, non-battle page engagement APIs.
- `moonboys-battle-api`: factions, Battle Chamber, Daily WTF, roguelite daily state, missed opportunities, daily-loop state or its successor aggregator.
- `moonboys-telegram-worker`: Telegram webhook, personal digest, group announcements, bot scheduled jobs, Telegram-specific logs and retries.
- `waxonedge-api`: WaxOnEdge analytics, indexer/bootstrap, token-page, WAXCASH analytics, valuation routes.

## Do Not Split In This PR

PR #854 should remain Phase 1: build the shared daily-loop contract and keep labels truthful. Do not create new Workers, move bindings, rewrite routes, or migrate homepage UI in this PR. This document is the handoff for the split discussion after Phase 1 lands.
