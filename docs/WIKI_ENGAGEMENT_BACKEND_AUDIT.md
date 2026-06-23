# Wiki Engagement Backend Audit

Date: 2026-06-23

## Scope

This audit covers the article engagement layer used by wiki Battle Heat and Daily Missions:

- comments read/post
- page likes read/post
- citation votes read/post
- mission completion/reward persistence
- Telegram-linked identity validation

## Current Route Status

The frontend feature flags in `js/api-config.js` remain disabled until the Worker deploy and migration 029 are live:

- `COMMENTS`
- `LIKES`
- `CITATION_VOTES`

Leaderboard, live feed, and activity panel remain disabled because those routes are not part of this change.

`workers/moonboys-api/worker.js` currently includes player and faction mission persistence routes, including:

- `GET/POST /player/daily-missions`
- `POST /player/daily-missions/progress`

This PR adds article engagement routes for:

- `GET /comments`
- `POST /comments`
- `POST /comments/:id/vote`
- `GET /likes`
- `POST /likes`
- `GET /citation-votes`
- `POST /citation-votes`
- `GET/POST /wiki-missions/status`
- `POST /wiki-missions/complete`

The article routes require migration 029 before they can run against remote D1.

## Frontend Behaviour

Because the flags remain disabled before deploy, the UI renders unavailable states and does not call the article engagement routes or fake counts.

When the routes return successful responses:

- `comments.js` dispatches `moonboys:comment-posted` with backend mission status
- `engagement.js` dispatches `moonboys:page-liked` with backend mission status
- `engagement.js` dispatches `moonboys:citation-voted` with backend mission status
- `battle-layer.js` marks the relevant mission complete only when `mission.completed === true`

Server-side reward persistence enforces once-per-window/page/user before XP is granted.

## Reward Authority

Mission completions are stored in `wiki_mission_completions` keyed by:

- `page_id`
- `mission_id`
- `mission_window`
- `telegram_id`

The Worker awards XP through `telegram_xp_log` only after:

- signed Telegram auth verifies successfully
- server-side linked evidence exists (`telegram_activity_log.action = 'link_confirmed'` or `blocktopia_progression`)
- the accepted action maps to the mission
- the mission completion insert wins

Signed Telegram auth alone is not enough to earn XP. Duplicate actions return already-completed state and do not award duplicate XP.

`POST /wiki-missions/complete` is not a blind claim endpoint. It verifies that the matching source action row exists for the same Telegram user before calling the mission completion helper.

## Deploy Notes

- Worker deploy required: Yes
- D1 migration required: Yes, apply `workers/moonboys-api/migrations/029_wiki_engagement.sql`
- VPS restart required: No
- GitHub Pages only: No
