**AGENT CHECK REQUIRED — Before changing this game or its assets, audit every wired runtime image and loading path. Confirm that master PNG/JPG files are preserved, smaller transparent WebP derivatives are used at runtime without lost dimensions or sharpness, non-critical art is staged or lazy-loaded where safe, duplicate or unused requests are removed, and gameplay and animation speed are not harmed. Report exactly what already passes, what still needs doing, the affected files and size/performance impact, and any test or visual check that could not be completed. Never assume optimization is finished.**

# Lumina’s Waterfront

The entry is `/games/block-topia/waterfront/`. A verified Telegram player with a faction can reserve their faction’s one seat, for up to nine concurrent players. The browser renews the 75-second lease while the game is open. Leaving releases the seat. The signed Worker response supplies the original harbor. The browser extends it east and south into an 84 × 60 map. The nature island uses one quarter of the former extension’s land budget. The original harbor and all three crossings still connect to the compact island.

- [nature-island.mjs](nature-island.mjs) preserves the harbor footprint and adds three crossings to new trails, groves and wildflower meadows. Water blocks walking. Vegetation on the extension leaves land passable.
- [harbor-art.js](harbor-art.js) draws the original harbor scenery and new forest terrain in the visible area. Open water uses the harbor’s original palette and ripple style in one cached static texture across the whole viewport, including the space beyond the map at wide zoom. The harbor keeps its built seawalls and the extension keeps natural banks. Its island patrol visits every reachable 8 × 8 region. Faction leaders and roaming robots start at different points on the route. Harbor residents come out of their buildings, freight robots move cargo and the briefing crew speaks near the original spawn.
- The PNG compact atlases and high-detail WebP sheets remain the preserved masters. Runtime `*-runtime.webp` derivatives keep the same transparent canvas and frame layout. Compact art is lossless; the four largest detailed sheets use the measured high-fidelity derivative only where it saves more than 20%. Detailed characters, roamers, creatures, fish and mining art retain the existing staged/in-view loading path.
- [map.js](map.js) handles walking, camera and terrain edits. The camera renders the visible area at display resolution and lets players zoom from a full-island overview to a bounded close-up. The joined map saves to `block-topia.waterfront.v9`. It restores valid older harbor edits and carries forward island edits on surviving land. Earlier saves remain in their original slots.

## Preserve the restored harbor

The last pre-expansion harbor is commit `f28a360ac3b3d5d8a3ffaf7616b83a629631592e` (#2021). PR #2028 restored it after the nature-only map in #2027. Review production changes against current `main`, which includes the restoration and later camera, NPC inspection and character-art fixes. Use the pre-expansion commit to verify the harbor, and #2028 to locate the restoration. Apply later work on top of the current production map.

| Preserve | Verified against `f28a360ac` on `f65987562` |
| --- | --- |
| Harbor geometry | The signed [Worker district file](../../../workers/moonboys-api/blocktopia/waterfront-district.js) is byte-identical. The 56 × 34 harbor stays at its existing coordinates, with spawn at `(22,14)`. 25 tiles inside that footprint change in the browser for the East Common bridge at `y=19, x=47–55`, the east crossing at `y=24, x=45–55` and the south crossing at `x=36, y=29–33`. Those crossings convert only open ground and water to paths and dock tiles. |
| Built scenery and assets | All 40 original files under `assets/` retain their original Git blobs. Buildings, roads, doors, docks, graffiti, lights, terrain, vegetation and street props keep their original tile and renderer references. |
| Harbor life | Preserve building residents, mural artists, operational cargo bots, and the briefing crew and its dialogue near spawn. Keep the nine faction identities, local street conversations, player-controlled avatar behavior, and signed chat and seat access. Faction walkers and island patrol robots explore reachable regions across the enlarged map. |
| Latest character art | Keep the two detailed WebP atlases for the nine faction characters and eight robot designs. The renderer uses 192 × 192 source frames and the original low-resolution atlases as fallbacks. Keep ground anchors, facing and animation order consistent. |
| Previous player edits | `block-topia.waterfront.v9` is the current browser layout key. Use v9 directly or migrate edits from v8 or v7 by comparing against the former wide layout. Preserve the East Common bridge when upgrading an unedited v7 crossing. Older v1–v6 saves can supply edits on the harbor or surviving island land. Keep all legacy keys available. |

Before changing the production map or preparing a VPS preview, check the candidate base against current `main`. The founder-preview branch `block-topia/integration` is a separate map workflow. At its audited tip `65a411490`, it lacks the nature extension, briefing and faction conversation modules, and the detailed character atlases. Carry only the intended patch from an older branch. For an island extension, add land, trails, trees and flowers around the harbor and preserve existing buildings, roads, NPC roles, and art unless GK has approved a specific change. Explain any deliberate changes inside the old footprint in the PR.

Use these manual checks to review drift:

```sh
git diff --name-status f28a360ac HEAD -- games/block-topia/waterfront/assets workers/moonboys-api/blocktopia/waterfront-district.js
git diff --name-status origin/main HEAD -- games/block-topia/waterfront workers/moonboys-api/blocktopia/waterfront-district.js
node --test --test-name-pattern='Waterfront hides playing' scripts/faction-operations-browser.test.mjs
```

Fetch the baseline commit if the checkout is shallow. The first command should show only the two detailed atlases added in #2033 plus explicitly approved asset or district changes. The browser check covers harbor crossings, a legacy saved edit, island reachability, patrols, cargo, briefing, NPC rendering, inspection and signed chat flow. For visual changes also check the old harbor and the extension at normal and close zoom, where screenshots can reveal placement or depth problems that a file comparison misses.

## Faction leader chat

The Waterfront sends signed player questions to the `moonboys-api` Worker at `POST /clan-operations/leader-lore`. The Worker checks that lore chat is enabled and the selected provider is configured before it handles questions, including local replies.

1. The Worker handles greetings, recognized slowdown questions, and preset gameplay replies locally.
2. The [local canon library](../../../workers/moonboys-api/shared/clan-leader-canon-library.js) answers recognized lore questions from an approved catalog of public wiki sources. PR #2003 shipped 44 answers and 140 aliases. Lookup matches the whole normalized question, with limited greeting and question-prefix handling. Matches skip source fetches and Gemini. They use the shared player chat allowance.
3. Remaining questions use the [lore handler](../../../workers/moonboys-api/shared/clan-leader-lore.js). With `CLAN_LEADER_LORE_PROVIDER=gemini`, it sends the prompt and relevant public excerpts through Cloudflare AI Gateway. Gemini handles conversation, sourced canon, and creative requests in each leader’s voice. Fiction replies are labeled **Non-canon fiction**. A lore question with insufficient evidence should return uncertainty. Recent turns help resolve follow-ups.

Before calling Gemini, the Worker also uses the public site index to match simple lookups to a unique, high-confidence page title. It returns an excerpt and its link without a model call. Gemini handles ambiguous questions, open chat and follow-ups, with Google Search available for current or external facts. Official public sources remain authoritative for fictional canon. Search results are labelled separately. For incident recovery, `CLAN_LEADER_GEMINI_SEARCH=false` disables the search tool while keeping Gemini chat available.

Each signed player gets 10 chat questions per UTC day across all nine leaders. Local replies and Gemini replies use the same allowance. A rejected or failed Gemini response restores the player’s question. Worker logs record acceptance, provider latency, and available token counts without chat text. AI Gateway still receives authenticated requests with payload logging and response caching disabled. Confirm a successful signed, grounded chat on the deployed version before judging production speed and cost.

### Faction identities and street conversations

The [shared profiles](../../../js/waterfront-faction-identities.mjs) define the nine playable Waterfront representatives, their published names, role titles, personal wiki links, and values. The map and chat use the character name as the label and show the role in the character details. Local introductions and personal agendas come from the character biographies. Gemini receives live excerpts from the speaker’s personal wiki, faction wiki and Battle Chamber pages alongside relevant matches from the published site index. The public-site allowlist and the existing search pipeline still govern retrieval.

Nearby representatives open conversations, pass with a brief sign-off or return to their last topic. A completed encounter records the pair’s topic in browser storage. The dialogue library also remembers each voice’s place in the rotation across reloads. Independent pairs can speak at the same time. A nearby leader waits when the other leader is already speaking with someone.

Players enter as a neutral explorer. The avatar picker swaps the selected representative into the player’s place in the local scene and removes that leader’s roaming copy. Other leaders recognize the same faction ID, so the conversation memory follows that identity. After 25 seconds of inactivity the selected avatar can walk and talk nearby. The signed faction seat, access and rewards continue to use the account’s verified faction. Browser-local conversation memory is specific to the installation.

### Roamer profiles and local street dialogue

The [Waterfront Roamers wiki](../../../wiki/waterfront-roamers.html) lists the 26 current roamers. Their cast IDs, atlas slots, artwork and source notes are in [SPRITE-LIBRARY.md](SPRITE-LIBRARY.md). The rounded Nomad Bears mech is retired. The remaining square mech uses its own four directions. Selecting a roamer opens an info card with its name and wiki link. Faction leaders have their separate signed chat and slowdown controls.

[street-encounters.mjs](street-encounters.mjs) gives the three patrol characters a chance to stop a nearby roamer or autonomous leader. The nine street bears can offer fictional drugs or ask about police activity. Other named roamers can start their own exchanges. Police and bear approaches get the first chance when several characters meet. Silent freight, service and harbor worker bots stay outside this dialogue roster. The two speaking build-crew characters have their own exchange at spawn. Info still shows the authored daily briefing and published build transcript.

[npc-voices.mjs](npc-voices.mjs) keeps separate material for all 37 speaking characters. Six sets of observations, personal memories and future actions per voice draw from their wiki biographies and [The Ninth Berth](../../../wiki/the-ninth-berth.html). [npc-dialogue.mjs](npc-dialogue.mjs) ties those to 24 Waterfront and [Crypto Moonboys](../../../wiki/crypto-moonboys.html) topics, including the [First Witness](../../../wiki/the-first-witness.html) and the unresolved Final Fork. It composes 240 distinct openings, 240 middle turns and 240 endings per character, with additional banks for patrol stops, bear offers, lookout questions and resumed conversations. The three phases use different wording and different character details. Responses and farewells stay on the speaker’s subject and rotate independently on that subject.

The browser downloads the dialogue with the game’s static modules. An autonomous conversation reads that bundled material and browser storage. It makes zero network or model calls and spends no player chat allowance. Typed questions to faction leaders use the separate signed Worker chat. To validate both entrances to local dialogue, run the focused Waterfront Chromium check and the Waterfront conversation and crew briefing tests.


### Slowdown and scheduled play

Leaders leave the map for scheduled five-minute game slots. The [presence module](../../../workers/moonboys-api/shared/clan-leader-presence.js) owns the schedule and slowdown rules. It matches the entire slowdown question or an explicit alias and checks eligibility on the server.

| Preset question | Pause |
| --- | --- |
| What is your faction working on today? | 5 minutes |
| Which part of the city would you defend first? | 10 minutes |
| What would make your faction strike a deal with a rival? | 20 minutes |

A faction member can use one separate free slowdown per UTC day across all nine leaders, including their own. A successful free slowdown keeps that leader on the map and starts a one-hour recovery after the pause ends. An active pause or recovery blocks another player from extending it. Only the server-side action can change the schedule.

### Expanding and checking the library

- Check the published wiki and repository canon rules before adding an answer. Add a public source link and distinct aliases for each topic. Keep broad keywords, mixed questions and creative prompts eligible for Gemini.
- Run `node --test scripts/clan-mining-pilot.test.mjs` and `npm run test:canon`. Check that exact aliases return the expected source without an upstream request and that mixed and creative questions still reach the provider.
- For Gemini, production uses `CLAN_LEADER_LORE_ENABLED=true`, the Gemini provider selection and `CLAN_LEADER_GEMINI_GATEWAY`. Keep `CLAN_LEADER_GEMINI_KEY` and `CLAN_LEADER_GATEWAY_TOKEN` in Worker secrets. After a runtime change is approved and merged, deploy `moonboys-api` and verify a signed greeting, a local canon question, and a creative request. Merging the code and deploying the Worker are separate steps.

## Nine faction leaders and the weekly boost loop

The Battle Chamber has one NPC leader for each of its nine factions. The goal is a year-round competition where members complete Daily WTF Signals to support their own leader, and can slow rival leaders to improve their faction’s position.

### What the Worker does today

- **NPC grinding.** The scheduled Worker gives each of the nine leaders one five-minute slot per UTC hour, with up to three leaders playing at once. During the slot a leader leaves the Waterfront to play. The Worker rotates through public game routes, checks that the page is reachable, and simulates a server-side training round. Each eligible completed round adds 12 leader support points.
- **Member support.** Current-week leader power starts with one point per banked task tier and two per completed Daily WTF Signal. It also includes NPC round points and any earned weekly boost. Encourage members to complete Daily Signals throughout the week.
- **Weekly close.** The existing crew competition runs Monday through Sunday UTC. It finalizes eligible crew standings using members’ best five banking days and ranks by the share of available banks completed. Ranks can tie and ineligible or scoreless crews can be unranked. The task-banking standings continue to govern the existing crew awards. The [unified Factions leaderboard](../../../docs/unified-moonboys-leaderboard.md) closes its own weekly chart. That finalized rank sets next week’s Battle Chamber leader boost level as `10 - rank`.
- **Next week’s boost.** There are three options at each level. Supply Dock adds `level` per banked tier, Signal Relay adds `3 × level` per completed signal, and Crew Rally adds `2 × level` per active member-day. The Worker currently selects automatically from the previous week’s finalized activity. The selected boost adds points as members complete the qualifying activity in the new week.
- **Slowing a leader.** A free question or paid pause skips overlapping grinding slots. That reduces the leader’s NPC points on the unified Factions chart and can lower their next weekly boost level. The current paid options are 1 hour for 100 XP or 5 gems, and 24 hours for 1,200 XP or 50 gems. They have 1-hour and 6-hour recoveries respectively. The server owns eligibility, cost, pause and recovery.

### Intended rules still to implement

1. **Grind the actual games.** Give the year-round NPC rotation verified completion rules for each supported Battle Chamber game. Today’s route visit and generic training round do not execute the game on that page.
2. **Add the three-option lottery.** The unified weekly faction chart already awards top-three Grinder Point bonuses for the next week. Define the separate lottery odds, who makes the pick, and the default if nobody picks. Settle the selected outcome once.
3. **Define individual WTF bonus awards.** Define how the weekly NPC result changes members’ boosts, who qualifies, and how much stronger results improve their odds. Current perks add leader support points based on member activity. The requested payout and odds rules need their own settlement and display.

Start in [Clan Operations routes](../../../workers/moonboys-api/routes/clan-operations.js), [leader support and perks](../../../workers/moonboys-api/shared/clan-faction-leaders.js), [crew standings](../../../workers/moonboys-api/shared/clan-crew-standings.js) and [period settlement](../../../workers/moonboys-api/shared/clan-period-rewards.js). Test weekly rollover, ties, missed or retried scheduled ticks, repeat lottery picks, and overlapping pauses before changing the reward flow.

## Map and art handover

Keep the night-time harbor palette, original graffiti, and consistent top-down building fronts. For generated art, use transparent PNGs at a consistent pixel scale, place files under `assets/`, and record their source or generation job in the PR. Keep generation credentials on the runner.

For map changes, check all walkable tiles are reachable from spawn. Check click and tap placement after scrolling, collisions, and existing saved edits. The build runner stages founder previews on `block-topia/integration`. Issues carrying `<!-- waterfront-production -->` open production-map PRs directly against `main`; only the exact tested and current-head Codex-cleared commit can be squash-merged. The [city brief](CITY-BRIEF.md) and [sprite library](SPRITE-LIBRARY.md) define the production work.

The six building sprites are AutoSprite originals. Their transparent game PNGs and source metadata are in `assets/night-harbor/`. The renderer keeps the base of each sprite inside its original tile footprint. Its fallback art is available while assets load or when an image fails.

### Production PR conflicts

Follow the [production conflict-recovery rule](CITY-BRIEF.md) if an open Waterfront PR can no longer merge into `main`. Reapply the scoped change on current `main`, rerun the affected checks, and get Codex clearance on the updated head before an authorised merge.

## Autonomous production guardrails

Waterfront production is driven by issue #1930 and [BUILD-ZONES.json](BUILD-ZONES.json). The zone plan turns the broad city brief into finite targets for West Meadow, Southwest Park, South Point, East Common and East Shore. Existing automated placements are counted before a new proposal is considered.

The queue rejects occupied, crowded, repeated, protected, spawn-adjacent and doorway-adjacent candidates. It enforces per-zone asset mixes and maximum counts, and it stops after the approved targets are complete. Local Ollama only chooses among bounded candidates and allow-listed assets; it cannot write arbitrary repository files. Hermes is not installed or invoked by this workflow.

Before opening a production PR, the worker builds a local candidate renderer using the exact current `main` base. Headless Chromium renders both the baseline and candidate with real runtime atlases at desktop and mobile viewport sizes. An unchanged canvas, failed atlas, browser error or empty screenshot rejects the attempt. The exact result is recorded in `production-validation.json`; screenshots remain in the worker’s private state directory.

To expand the automatic builder beyond existing flowers, furniture and trees, add a named action type with:

1. an allow-listed file and schema;
2. deterministic footprint, route, scale, saved-layout and collision validation;
3. desktop and mobile rendering coverage;
4. focused tests;
5. an updated zone target and explicit GK approval.

Do not give the local model general repository write access.
