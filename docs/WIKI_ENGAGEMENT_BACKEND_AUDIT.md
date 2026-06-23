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

The frontend feature flags in `js/api-config.js` remain disabled for article comments, likes, citation votes, leaderboard, live feed, and activity panel. The WUF/Daily Missions quick fix does not turn those flags on.

`workers/moonboys-api/worker.js` currently includes player and faction mission persistence routes, including:

- `GET/POST /player/daily-missions`
- `POST /player/daily-missions/progress`

Those routes support arcade/faction daily mission state. They are not article-page comment, like, or citation-vote routes.

The worker does not currently expose live article routes for:

- `GET /comments`
- `POST /comments`
- `POST /comments/:id/vote`
- `GET /likes`
- `POST /likes`
- `GET /citation-votes`
- `POST /citation-votes`

## Frontend Behaviour

While the article engagement routes are disabled or absent, the UI renders honest unavailable states and does not fake counts.

When those routes are later enabled and return successful responses:

- `comments.js` dispatches `moonboys:comment-posted`
- `engagement.js` dispatches `moonboys:page-liked`
- `engagement.js` dispatches `moonboys:citation-voted`
- `battle-layer.js` marks the relevant mission complete once per page/session/day window and emits `moonboys:wiki-mission-complete`

That completion event is the frontend hook for Telegram-linked reward plumbing. Server-side reward persistence should still enforce once-per-window/page/user before any XP or reward is granted.

## Required Before Enabling Flags

Before flipping `COMMENTS`, `LIKES`, or `CITATION_VOTES` to `true`, add and test real worker routes with:

- server-side Telegram-linked identity validation for rewarded/competitive actions
- idempotent mission completion keyed by page, mission, window, and user
- moderation-safe comment posting
- public read endpoints that return real counts only
- duplicate vote/like protection
- tests for disabled routes and live-route success paths
