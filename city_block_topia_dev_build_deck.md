# City Block Topia: GraffPunk Infiltration — Integration Deck v2

**Document status:** integration planning deck, not runtime truth  
**Target repo:** `Crypto-Moonboys/Crypto-Moonboys.github.io`  
**Updated:** 2026-05-04  
**Primary rule:** Neon Sprawl is a separate deeper layer. It is not the current live `/games/block-topia/` runtime until imported, wired, smoke-tested, and documented.

---

## 0. Read This First

This deck replaces the earlier `city_block_topia_dev_build_deck.md` framing with a cleaner integration plan.

The previous deck had strong product vision, but it risked making the Neon Sprawl / City Block Topia package sound like it already existed as a live integrated route in this repo. That is not a safe claim.

Use this deck as the working v2 boundary:

> **City Block Topia: GraffPunk Infiltration is the planned deeper Neon Sprawl living-wiki game layer. It must not be confused with the current live Block Topia multiplayer city or Block Topia Quest Maze.**

Until the Neon Sprawl package is present in this repo, routed, loaded, tested, and documented, all Neon Sprawl systems are treated as **external-package, planned, or integration-pending**.

---

## 1. Product Split

The repo contains or references several similarly named game layers. They must stay separated.

| Product / Layer | Route | Current role | Status language |
|---|---|---|---|
| **Block Topia Live City** | `/games/block-topia/` | Gated Colyseus multiplayer city runtime. Current active code includes two-player room behavior plus NPC survival/mission systems that must be documented honestly. | Live runtime. Do not describe from stale docs. Verify against active code. |
| **City Block Topia: GraffPunk Infiltration / Neon Sprawl** | Preferred: `/games/city-block-topia/` | Deeper Three.js living-wiki world layer: tagging, zones, Rebel Ink, Rebellion, GraffPunk squad, wiki-linked territory. | Planned integration / external package until imported and tested. |
| **Block Topia Quest Maze** | `/games/block-topia-quest-maze/` | Arcade/RPG score game and Arcade XP path. | Live arcade game. Not the same as the multiplayer city. |
| **Tetris Block Topia** | `/games/tetris-block-topia/` | Arcade puzzle game. | Live arcade game. Not the city runtime. |
| **Block Topia Intelligence page** | `/block-topia.html` | SAM/intelligence dashboard page, not the playable game. | Consider future rename to reduce confusion. |

### Non-negotiable routing rule

Do **not** replace `/games/block-topia/` with City Block Topia blindly.

Preferred integration route:

```txt
/games/city-block-topia/
```

Acceptable nested route if product branding demands it:

```txt
/games/block-topia/neon-sprawl/
```

The current live multiplayer city and the Neon Sprawl deeper world can share identity/progression later, but they should not be merged before both sides are stable.

---

## 2. Correct Positioning

### One-line pitch

**City Block Topia is the deeper playable layer where the Crypto Moonboys wiki becomes explorable territory.**

### Product title

**Crypto Moonboys: The Wiki Is Alive**  
Subtitle: **City Block Topia — GraffPunk Infiltration**

### Short pitch

A neon isometric rebellion game where GraffPunk squads reclaim a corporate-controlled district by tagging zones, disrupting Chainlight authority systems, building rebellion pressure, completing missions, and turning Crypto Moonboys lore into playable territory.

### Core product line

**The wiki explains the world. City Block Topia lets you fight for it.**

### Current integration truth

City Block Topia is **not** the current `/games/block-topia/` runtime. It is the deeper Neon Sprawl layer to integrate separately.

---

## 3. What City Block Topia Is Not

City Block Topia is not:

- a replacement for the current `/games/block-topia/` page before an explicit route decision
- a passive NFT game
- a generic cyberpunk sandbox
- a token reward product
- a claim-to-earn loop
- a separate game disconnected from the wiki
- a live feature set until the code is imported, wired, tested, and documented

### Product trust rule

Do not present planned systems as live. A feature is live only when:

1. the code exists in this repo,
2. it is imported by a public route,
3. users can reach it,
4. it passes smoke tests, and
5. the runtime truth docs describe it accurately.

---

## 4. Current Repo Boundary

This deck assumes the repo currently has three relevant truths:

1. `/games/block-topia/` is the active live multiplayer city route.
2. `city_block_topia_dev_build_deck.md` describes a deeper Neon Sprawl package/vision.
3. Neon Sprawl package files should not be claimed as live repo runtime until they are visible in the repo and wired to a route.

### Current Block Topia runtime boundary

The current live city must be audited against active source code, not stale docs.

At minimum, current runtime documentation should distinguish:

- Telegram + Arcade XP gate
- Colyseus room/server layer
- two-player room cap unless changed
- NPC survival prototype behavior if active
- attacks / HP / respawns if active
- world phases / warning / event / recovery if active
- extraction / mission complete logic if active
- upgrade choices if active
- reconnect gaps and known instability

### City Block Topia boundary

For this document, Neon Sprawl features are classified as:

- **External package / source-present elsewhere** if included in a separate uploaded package
- **Integration-pending** until copied into this repo
- **Live** only after a public route loads the code and tests pass

---

## 5. Intended Player Fantasy

The player is not a generic hero. They are a **GraffPunk operator** entering a playable city layer of the Crypto Moonboys wiki.

They move through Neon Sprawl, tag territory, disrupt authority systems, recruit allies, unlock lore fragments, and push the world toward rebellion.

The feeling should be:

> “I’m inside the Crypto Moonboys wiki now. These pages, factions, characters, zones, and conflicts are no longer just things to read. I can move through them.”

---

## 6. Core Gameplay Loop

The target City Block Topia loop is:

```txt
Explore -> Tag -> Zone reacts -> Ink changes -> Rebellion rises -> Lore unlocks -> Battle Chamber records proof
```

### First playable loop

1. Player loads Neon Sprawl.
2. Bitcoin Kid introduces the first wall.
3. Player clicks a valid surface or zone.
4. A spray tag appears.
5. Zone tag count increases.
6. Rebel Ink updates.
7. Rebellion meter moves.
8. UI shows the active zone and wiki link.
9. A lore fragment unlocks.
10. Telegram sync prompt appears after meaningful action, not before first play.

### Why this loop fits Crypto Moonboys

The wiki is a wall. A tag is proof. A page becomes a zone. A zone becomes a mission. A faction becomes a community path.

---

## 7. Product Terms and Currency Boundaries

These definitions must remain separate.

| Term | Meaning | Source | Rule |
|---|---|---|---|
| **Score** | How well a player performs in an arcade run | Arcade games | Leaderboard rank only. Not XP. |
| **Arcade XP** | Site-level access/progression signal | Accepted synced arcade runs after Telegram link | Gates Block Topia access. |
| **Block Topia XP / City XP** | In-game progression inside Block Topia or City Block Topia | In-game actions only after implementation | Separate from Arcade XP unless deliberately bridged. |
| **Faction XP** | Faction alignment/progression | Faction systems | Separate from Arcade XP and City XP. |
| **Rebel Ink** | City Block Topia in-game resource | Tagging, missions, city actions | Not a token. Not a financial reward. |
| **Tokens / NFTs** | Optional future identity/cosmetic/IP layer | Future ownership systems | No passive income or guaranteed reward language. |

### Hard wording rule

**XP is not given. It is earned through activity.**

### Economy rule

Rebel Ink is an in-game resource. Do not blur it with tokens, cash value, guaranteed rewards, or passive claims.

---

## 8. Feature Classification Matrix

### A. Block Topia Live City

| Feature | Status | Notes |
|---|---|---|
| Public route `/games/block-topia/` | Live | Gated multiplayer city route. |
| Telegram + Arcade XP entry gate | Live | Must stay aligned with server config. |
| Colyseus multiplayer server | Live | VPS/server route, not GitHub Pages static only. |
| Two-player room model | Live unless changed | Verify `maxClients` in active room code. |
| NPC survival behavior | Active if current code wires it | Must be documented honestly. |
| Attacks / HP / respawns | Active if current code wires it | Must be tested with two clients. |
| Mission/extraction phases | Active if current code wires it | Must be server-confirmed where possible. |
| Reconnect warm-slot | Needed | Treat as stability gap until implemented and tested. |
| Dual-map transfer | Not live | Do not claim. Requires ADR. |

### B. City Block Topia / Neon Sprawl

| Feature | Status | Integration rule |
|---|---|---|
| Three.js isometric Neon Sprawl scene | Integration-pending | Live only after route loads it. |
| Procedural buildings | Integration-pending | Verify asset/performance behavior. |
| Zones and bridges | Integration-pending | Must be mapped to wiki slugs. |
| Click-to-tag | Integration-pending | First smoke-test target. |
| Rebel Ink | Integration-pending | Must remain in-game resource. |
| Rebellion meter | Integration-pending | Must drive UI feedback and lore unlocks. |
| Starter GraffPunk squad | Integration-pending | Verify squad UI and state. |
| NPC manager | Integration-pending | Verify spawn/performance. |
| Mission system | Source-present/planned unless verified | Do not call live until wired. |
| Save/load | Source-present/planned unless verified | Do not call cloud save until backend exists. |
| Weather/day-night | Source-present/planned unless verified | Optional polish, not core launch gate. |
| Arena/Zone Wars/Anomaly | Source-present/planned unless verified | Future challenge layer. |
| Battle Chamber bridge | Planned | Needs backend/event route. |
| Telegram city profile save | Planned | Needs schema and auth. |

### C. Block Topia Quest Maze

| Feature | Status | Notes |
|---|---|---|
| Public arcade route | Live | Separate from multiplayer city. |
| Score submission | Live if current arcade system wires it | Verify with arcade manifest and leaderboard path. |
| Arcade XP path | Live if accepted synced runs are wired | This can help unlock Block Topia gate. |
| City Block Topia progression | Not the same | Do not merge terminology. |

---

## 9. World Structure: Neon Sprawl

Neon Sprawl is the proposed first City Block Topia district.

### Target zones

| Zone ID | Name | Role |
|---|---|---|
| `reactor` | Chainlight Reactor Dome | Central authority power node |
| `queen` | Queen Sarah P-fly’s Tower | Elite/story/political node |
| `arena` | Hard Fork Arena | Combat/event node |
| `honeycomb` | Honeycomb Residential Spires | Civilian/social node |
| `docks` | Zero-G Blade Cruiser Docks | Transport/authority node |
| `vertfarm` | Vertical Farm Canopies | Nomad/sustainability node |
| `underbelly` | Black Market Underbelly | Contracts/trade/crime node |
| `ruins` | Graffiti Ruins | Rebel safe-zone / lore wall |
| `shrine` | Null Prophet Shrine | Corruption/anomaly node |
| `crane_*` | Construction Cranes | Expansion/build sites |

### Zone requirements

Every zone should eventually have:

1. visual identity
2. wiki page slug
3. current control owner
4. tag count
5. rebellion contribution
6. mission hooks
7. faction affinity
8. future unlocks
9. Battle Chamber event mapping

### Example: Graffiti Ruins

- Lore: origin wall, first tags, rebel safe zone
- Gameplay: tutorial, safe respawn, first capture
- Crypto Moonboys layer: “THE WIKI IS ALIVE” mural
- Unlock: first tag badge / first lore fragment

### Example: Null Shrine

- Lore: Null Prophet corruption
- Gameplay: anomaly events and corrupted zones
- Crypto Moonboys layer: erased pages, anti-memory, system corruption
- Unlock: Null resistance mission chain

---

## 10. Factions and NPC Direction

The faction layer is identity, belonging, and eventually competition. It is not only visual flavor.

### Immediate faction set

- GraffPUNKS
- HODL Warriors
- Diamond Hands
- Bitcoin Kids
- Crypto Moongirls
- Nomad Bears
- AllCity Bulls
- Bally Boys
- Ducky Boys
- Forkborn Defectors
- Null Prophet corruption layer

### Faction requirements

Each faction needs:

- wiki page
- in-game icon/color
- NPC type or squad archetype
- dialogue bank
- mission role
- zone affinity
- gameplay modifier, if live
- Battle Chamber status/event mapping

### Bitcoin Kids role

Bitcoin Kid should become the onboarding guide / street-level oracle.

First mission:

> “Find your first wall.”

Bitcoin Kid explains:

- Score vs XP
- Arcade XP gate
- Rebel Ink
- Telegram sync
- the living wiki idea

---

## 11. Squad Archetypes

Existing or target GraffPunk squad archetypes should map to lore and gameplay roles.

| Archetype | Target ability | Role |
|---|---|---|
| Prophet | Wall Oracle | Lore/signal reveal |
| Breaker | Chain Surge | Authority disruption |
| Ghost | Phase Tag | Stealth tagging |
| Bomber | Ink Nuke | Area control |
| Watcher | Ink Sight | Enemy reveal |
| Runner | Blur Tag | Speed tagging |
| Hacker | Code Inject | System conversion |
| Tank | Glitch Wall | Defense |
| Trickster | Mirror Tag | Decoy play |
| Architect | Zone Lock | Territory hold |
| Nomad | Ghost Route | Path reveal |
| Oracle | Resonance | Squad boost |

### Integration rule

Do not claim full squad combat until:

- squad selection works,
- abilities fire,
- cooldowns update,
- damage/effects are readable,
- state survives route changes or saves where required.

---

## 12. UI / UX Direction

### Required panels for v1 integration

1. **Zone Codex Drawer**
   - zone name
   - lore summary
   - linked wiki page
   - tag count
   - control state
   - unlock status

2. **Wiki Pulse Panel**
   - active lore node
   - “Page unlocked” state
   - “Read this next” link
   - Battle Chamber event preview

3. **Telegram Sync Banner**
   - local mode vs synced mode
   - prompt after first meaningful action
   - no wallet-first flow

4. **Progression Clarity HUD**
   - Score, if relevant
   - City XP / Block Topia XP
   - Arcade XP gate status
   - Rebel Ink
   - Faction XP, if relevant

5. **Battle Chamber Bridge**
   - recent city event preview
   - “zone captured” proof
   - “mission complete” proof
   - no spam during rapid tagging

---

## 13. Technical Architecture Target

### Client

- Three.js app for City Block Topia / Neon Sprawl
- Vanilla ES modules unless a bundler decision is made
- EventBus-style system boundaries if already present
- localStorage allowed for pre-sync prototype
- server sync only after schema is locked
- no per-frame object creation that causes memory growth
- no unbounded decal growth

### Website integration

Preferred public route:

```txt
/games/city-block-topia/
```

Required site links after route passes smoke tests:

- `/games/`
- `/how-to-play.html`
- `/community.html`
- optional link from `/games/block-topia/` explaining separate deeper world layer

### Backend / sync layer

Planned API endpoints, not live until implemented:

```txt
GET  /city-block-topia/profile
POST /city-block-topia/save
GET  /city-block-topia/save
POST /city-block-topia/event
POST /city-block-topia/mission-complete
POST /city-block-topia/zone-captured
GET  /city-block-topia/leaderboard
```

### Server validation requirements

- Telegram signed identity validation
- duplicate event prevention
- cooldowns for repeated rewardable events
- server-side XP/Ink award validation
- no client-trusted reward grants
- replay-safe event IDs

---

## 14. Data Model Draft

These are planned schema concepts. They are not live until implemented in backend code and migration docs.

### `player_city_profile`

- `id`
- `telegram_id`
- `wax_wallet` optional
- `city_xp`
- `rank`
- `rebel_ink`
- `selected_faction`
- `created_at`
- `updated_at`

### `city_save_state`

- `telegram_id`
- `squad_json`
- `zone_state_json`
- `mission_state_json`
- `inventory_json`
- `rebellion_value`
- `updated_at`

### `city_events`

- `event_id`
- `telegram_id`
- `event_type`
- `zone_id`
- `faction_id`
- `xp_delta`
- `ink_delta`
- `created_at`

### `zone_control_state`

- `season_id`
- `zone_id`
- `owner_faction`
- `tag_count`
- `corruption_level`
- `updated_at`

### `wiki_unlocks`

- `telegram_id`
- `page_slug`
- `unlock_reason`
- `source_event_id`
- `created_at`

---

## 15. Integration Roadmap

### Phase 0 — Truth Lock

Goal: stop drift before adding more systems.

Tasks:

- Rewrite Block Topia runtime truth docs so they match active code.
- Mark this deck as an integration plan, not runtime truth.
- Confirm the product split between Live City, City Block Topia, and Quest Maze.
- Lock terminology: Score, Arcade XP, City XP, Faction XP, Rebel Ink.
- Mark stale or archived files clearly.

Exit condition:

- No source-of-truth document says Neon Sprawl is live before the route exists.

---

### Phase 1 — Live City Stability

Goal: stabilize the current `/games/block-topia/` runtime before deeper expansion.

Tasks:

- Finalize start/reconnect/restart state machine.
- Add warm-slot reconnect.
- Add hard-refresh regression tests.
- Test two-client join, room-full, disconnect, reconnect, recovery, and mission-complete states.
- Protect server monitor/admin routes.
- Harden movement and input validation.

Exit condition:

- No “stuck waiting” class bugs remain in the live multiplayer city.

---

### Phase 2 — City Block Topia Route Scaffold

Goal: add Neon Sprawl as a separate route without touching the live city route.

Tasks:

- Create `/games/city-block-topia/`.
- Copy/import the Neon Sprawl package into the route.
- Verify module paths work on GitHub Pages.
- Add minimal route styling and fallback UI.
- Add honest launch placeholder if package fails to load.
- Add route card to `/games/` only after smoke passes.

Exit condition:

- The route loads without console-breaking errors.

---

### Phase 3 — Core Tagging Smoke

Goal: prove the City Block Topia core loop.

Tasks:

- Scene loads.
- Camera renders Neon Sprawl.
- Buildings render.
- Click-to-tag works.
- Tag count updates.
- Rebel Ink updates.
- Rebellion meter updates.
- UI/minimap does not crash.
- Mobile tap flow works.
- 100 tags do not cause a severe frame drop.

Exit condition:

- The first playable loop is stable: click -> tag -> zone reacts -> Ink/Rebellion update.

---

### Phase 4 — Living Wiki Layer v1

Goal: connect the playable city to the wiki.

Tasks:

- Add zone codex drawer.
- Map zones to wiki slugs.
- Add first lore fragment unlocks.
- Add Bitcoin Kid tutorial.
- Add “read this page next” logic.
- Add local-only unlock state first.

Exit condition:

- A player can tag a zone and unlock a linked lore fragment.

---

### Phase 5 — Identity and Save Boundary

Goal: allow persistence without confusing the current economy.

Tasks:

- Detect Telegram sync state.
- Show local mode vs synced mode.
- Add save-state schema.
- Add profile endpoint only after backend route is ready.
- Save zone state, squad state, mission state, and unlocked lore.
- Keep Rebel Ink in-game only.

Exit condition:

- A linked user can persist a small verified save state.

---

### Phase 6 — Mission Loop v1

Goal: make City Block Topia more than tagging.

Tasks:

- Wire the MissionSystem only after core tagging and save flow are stable.
- Add mission chain 1: “The Wiki Wakes Up.”
- Add Queen Sarah Signal chain as first story expansion.
- Add Underbelly contracts as repeatable tasks.
- Add City XP / Rebel Ink rewards with anti-exploit checks.

Exit condition:

- One mission chain can be completed, saved, and resumed.

---

### Phase 7 — Battle Chamber Bridge

Goal: make player action visible on the site.

Tasks:

- Send event logs for meaningful actions:
  - first tag
  - zone captured
  - mission completed
  - rank up
  - lore fragment unlocked
- Add recent city events panel.
- Add throttle/dedupe rules.
- Add moderation/admin review for public feed output.

Exit condition:

- A City Block Topia action can appear as a controlled Battle Chamber proof event.

---

### Phase 8 — Challenge Systems

Goal: add repeatable challenge only after the core world works.

Tasks:

- Verify NPC spawn/performance.
- Wire Zone Wars if present.
- Wire Arena if present.
- Wire Anomaly if present.
- Add corruption/reclaim events.
- Add readable combat feedback.

Exit condition:

- Replayable challenge exists without corrupting zone/progression state.

---

### Phase 9 — Optional Ownership Layer

Goal: add cosmetics/IP flavor without pay-to-win or passive reward claims.

Tasks:

- Optional wallet connect.
- NFT tag skins.
- Faction banners.
- Holder title badges.
- No combat advantage until explicitly approved.
- No guaranteed reward wording.

Exit condition:

- Ownership adds identity/cosmetic value only.

---

### Phase 10 — Dual-Map Architecture ADR

Goal: decide if and how City Block Topia connects to the live multiplayer city.

Do not implement transfer routing before this ADR.

Options:

1. **Separate products with shared profile**
   - safest first model
   - `/games/block-topia/` and `/games/city-block-topia/` stay separate
   - shared Telegram identity/profile only

2. **Separate room types**
   - `city_survival`
   - `neon_sprawl`
   - shared identity/progression service

3. **One room with mode channels**
   - higher complexity
   - not recommended until both sides are stable

Exit condition:

- Architecture is written, reviewed, and accepted before code changes.

---

## 16. Immediate PR Plan

### PR492 — Truth Lock

- Replace stale Block Topia current-state claims.
- Update Master Source where needed.
- Mark this deck as v2 integration planning.
- Lock product split and route language.

### PR493 — Live City Stability

- Start/reconnect regression suite.
- Warm-slot reconnect plan or implementation.
- Two-client room tests.
- Server admin route hardening.

### PR494 — Movement Authority + Control Feel

- Server-side movement validation.
- Client interpolation/correction.
- Destination marker and blocked-tile feedback.
- Camera polish.

### PR495 — City Block Topia Route Scaffold

- Add `/games/city-block-topia/`.
- Import Neon Sprawl package.
- Smoke-test load/render/tag loop.
- Add honest route copy.

### PR496 — Living Wiki Layer v1

- Zone codex.
- Wiki slug map.
- Bitcoin Kid tutorial.
- First lore fragment unlock.

### PR497 — Dual-Map ADR

- Decide whether the deeper layer stays separate, shares profile only, or eventually uses transfer routing.

---

## 17. QA Smoke Test Plan

### Route load

- Page loads without console-breaking errors.
- Loading screen hides or shows a clear failure message.
- Three.js scene initializes.
- Camera renders the district.
- Resize does not break render.

### Visual world

- Buildings visible.
- Zones visible or detectable.
- NPCs spawn only if the system is wired safely.
- VFX render without memory spikes.
- UI panels fit desktop and mobile.

### Interaction

- Click/tap valid surface places tag.
- Invalid click gives feedback.
- Tag count updates.
- Zone capture threshold works.
- Rebel Ink updates.
- Rebellion meter updates.
- Minimap updates.

### Stability

- 10 minutes of play without memory growth spike.
- 100 tags without severe frame drop.
- 50 NPCs, if enabled, without event flood.
- Mobile tap does not crash.
- Route back to wiki works.

### Integration

- `/games/` card route works.
- How to Play route link works.
- Telegram sync prompt appears after first meaningful action.
- No false claim that City Block Topia is the live multiplayer city.

---

## 18. Launch Copy

### Game card title

**City Block Topia: GraffPunk Infiltration**

### Game card description

Enter Neon Sprawl, tag the city, grow rebellion pressure, and turn Crypto Moonboys lore into territory. This is the deeper living-wiki world layer. Current build focuses on tagging, zones, Rebel Ink, and Rebellion. Missions, sync, seasons, and economy expand only when verified live.

### First screen copy

**THE WIKI IS ALIVE.**

Read the lore. Tag the wall. Build rebellion. Link your identity when you are ready to make progress stick.

### Sync prompt

You placed your first tag. Link Telegram to save your city progress.

### Honest access copy

City Block Topia is separate from the current Block Topia multiplayer city. Block Topia access still requires Telegram sync and the current Arcade XP gate. City Block Topia progression is its own deeper world layer unless explicitly bridged later.

---

## 19. Non-Negotiable Product Rules

1. Do not sell this as passive rewards.
2. Do not confuse Rebel Ink with tokens.
3. Do not present planned features as live.
4. Do not force wallet before first play.
5. Do not replace `/games/block-topia/` without an explicit route decision.
6. Do not remove the wiki identity.
7. Do not bury the core route.
8. Do not overcomplicate onboarding.
9. Do not call it finished until route, mission, save, sync, and zone systems are verified.
10. Do not implement dual-map transfer without an ADR.

---

## 20. Final Build Vision

The end-state is not a game beside a wiki.

The end-state is a wiki you can enter.

Every page can become a mission.  
Every zone can become a page.  
Every tag can become proof.  
Every faction can become a community layer.  
Every player action can feed the Battle Chamber.  
Every linked identity can build history.

**The wiki explains the world. City Block Topia lets you fight for it.**

