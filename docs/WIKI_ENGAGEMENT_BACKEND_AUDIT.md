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

The frontend feature flags in `js/api-config.js` are enabled only for the article routes implemented in this PR:

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

If the API base is unavailable or migration 029 is not applied, the UI renders unavailable/error states and does not fake counts.

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

The Worker awards XP through `telegram_xp_log` only after the mission completion insert wins. Duplicate actions return already-completed state and do not award duplicate XP.

## Deploy Notes

- Worker deploy required: Yes
- D1 migration required: Yes, apply `workers/moonboys-api/migrations/029_wiki_engagement.sql`
- VPS restart required: No
- GitHub Pages only: No
