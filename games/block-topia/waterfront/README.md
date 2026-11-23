# Lumina’s Waterfront

The entry is `/games/block-topia/waterfront/`. A verified Telegram player with a faction can reserve their faction’s one seat. The signed Worker response supplies the live map layout. On narrow screens the canvas scrolls horizontally at a readable tile size.

- `workers/moonboys-api/blocktopia/waterfront-district.js` defines the playable rows, spawn and tile properties. Every row must have the same width. Connect new docks and streets to the spawn. Keep tile IDs stable for browser saves.
- `harbor-art.js` draws the terrain first, then objects and the player in row order. Building art is anchored to its ground tile and can extend upward. Collision uses the district data.
- `entry.js` checks the seat and mounts the game. `map.js` handles routing, editor, browser saves and JSON export. Version 1 edits are carried into the central block by comparing them with the old default layout. Version 2 saves take precedence.

## Faction leader chat

The Waterfront sends signed player questions to the `moonboys-api` Worker at `POST /clan-operations/leader-lore`. The Worker checks that lore chat is enabled and the selected provider is configured before it handles questions, including local replies.

1. The Worker handles greetings, recognized slowdown questions, and preset gameplay replies locally.
2. The [local canon library](../../../workers/moonboys-api/shared/clan-leader-canon-library.js) answers recognized lore questions from an approved catalog of public wiki sources. PR #2003 shipped 44 answers and 140 aliases. Lookup matches the whole normalized question, with limited greeting and question-prefix handling. Matches skip source fetches, Gemini, and the model question quota.
3. Remaining questions use the [lore handler](../../../workers/moonboys-api/shared/clan-leader-lore.js). With `CLAN_LEADER_LORE_PROVIDER=gemini`, it sends the prompt and relevant public excerpts through Cloudflare AI Gateway. Gemini handles conversation, sourced canon, and creative requests in each leader’s voice. Fiction replies are labeled **Non-canon fiction**. A lore question with insufficient evidence should return uncertainty. Recent turns help resolve follow-ups.

### Slowdown and scheduled play

Leaders leave the map for scheduled five-minute game slots. The [presence module](../../../workers/moonboys-api/shared/clan-leader-presence.js) owns the schedule and slowdown rules. It matches the entire slowdown question or an explicit alias and checks eligibility on the server.

| Preset question | Pause |
| --- | --- |
| What is your faction working on today? | 5 minutes |
| Which part of the city would you defend first? | 10 minutes |
| What would make your faction strike a deal with a rival? | 20 minutes |

A faction member can use one free slowdown per UTC day on a rival leader. A successful free slowdown keeps that leader on the map and starts a one-hour recovery after the pause ends. An active pause or recovery blocks another player from extending it. Only the server-side action can change the schedule.

### Expanding and checking the library

- Check the published wiki and repository canon rules before adding an answer. Add a public source link and distinct aliases for each topic. Keep broad keywords, mixed questions and creative prompts eligible for Gemini.
- Run `node --test scripts/clan-mining-pilot.test.mjs` and `npm run test:canon`. Check that exact aliases return the expected source without an upstream request and that mixed and creative questions still reach the provider.
- For Gemini, production uses `CLAN_LEADER_LORE_ENABLED=true`, the Gemini provider selection and `CLAN_LEADER_GEMINI_GATEWAY`. Keep `CLAN_LEADER_GEMINI_KEY` and `CLAN_LEADER_GATEWAY_TOKEN` in Worker secrets. After a runtime change is approved and merged, deploy `moonboys-api` and verify a signed greeting, a local canon question, and a creative request. Merging the code and deploying the Worker are separate steps.

## Map and art handover

Keep the night-time harbor palette, original graffiti, and consistent top-down building fronts. For generated art, use transparent PNGs at a consistent pixel scale, place files under `assets/`, and record their source or generation job in the PR. Keep generation credentials on the runner.

For map changes, check all walkable tiles are reachable from spawn. Check click and tap placement after scrolling, collisions, and existing saved edits. The NPC runner currently writes to its separate preview. Update it to target this district before resuming the live build loop.

The six building sprites are AutoSprite originals. Their transparent game PNGs and source metadata are in `assets/night-harbor/`. The renderer keeps the base of each sprite inside its original tile footprint. Its fallback art is available while assets load or when an image fails.
