# CITY BLOCK TOPIA: GRAFFPUNK INFILTRATION — FULL DEV BUILD DECK

## 0. Executive Summary

**City Block Topia: GraffPunk Infiltration** is an isometric cyberpunk squad-tactics game built in Three.js. The current package presents a neon city district called **Neon Sprawl**, populated by procedural buildings, NPC factions, a GraffPunk starter squad, tagging/capture mechanics, Rebel Ink, a Rebellion meter, live HUD panels, minimap, and lore-driven zones.

The right Crypto Moonboys positioning is not “another game bolted onto a wiki.” The correct positioning is:

> **The Crypto Moonboys wiki is alive. City Block Topia is the place where the wiki becomes playable.**

The wiki explains the universe. The arcade gets people moving. XP tracks action. Telegram makes identity persistent. Battle Chamber shows proof. City Block Topia becomes the deeper world layer where lore, factions, tagging, battles, missions, and ownership all start connecting.

The game should be built as a **living wiki mission world**:

**Read → Play → Earn XP → Link → Enter City Block Topia → Tag Zones → Build Faction Power → Unlock Lore → Shape the World**

---

## 1. Current Game Identity

### Working Title
**CITY BLOCK TOPIA: GRAFFPUNK INFILTRATION**

### Short Pitch
A neon isometric rebellion game where GraffPunk squads reclaim a corporate-controlled district by tagging zones, hacking Chainlight authority systems, building rebellion pressure, completing missions, and turning Crypto Moonboys lore into playable territory.

### Correct Product Category
- Isometric squad tactics
- Zone-control strategy
- Living Web3 wiki extension
- Crypto Moonboys lore activation layer
- Arcade-to-world progression layer

### What It Should Not Be Framed As
- Not a passive NFT game
- Not a generic cyberpunk sandbox
- Not “just a Three.js demo”
- Not a separate game disconnected from the wiki
- Not an economy-first product

### Core Feeling
A player should feel:

> “I’m inside the Crypto Moonboys wiki now. These pages, factions, and characters are no longer just things to read. I can move through them.”

---

## 2. Current Package Audit

### Source Package Contents
The uploaded package contains:

- `index.html` — single-page Three.js shell, HUD, loading screen, panels, styles
- `main.js` — scene setup, camera, world build, click-to-tag, game loop
- `src/world/NeonSprawlDistrict.js` — zones, bridges, background, platforms
- `src/buildings/*.js` — procedural building classes
- `src/npcs/*.js` — NPC archetypes, base AI, manager, GraffPunk squad archetypes
- `src/systems/*.js` — rebellion, ink, tag, missions, progression, weather, save/load, arena, anomaly, time, audio, zone wars
- `src/ui/UIManager.js` — HUD, squad cards, minimap, notifications, character creator
- `src/vfx/VFXManager.js` — spray bursts, decals, chainlight, ability effects
- `tmp/review_*.md` — audit and bug review documents
- `agent/PROJECT.md`, `agent/STATUS.md`, `PHASE_ROADMAP.md` — project status and roadmap docs

### Important Audit Finding
There is a **documentation mismatch**:

- `STATUS.md` says Phase 6 / publish polish is complete.
- `PHASE_ROADMAP.md` still labels Phases 2–5 as planned.
- `main.js` currently wires the core scene, world, NPCs, UI, Rebellion, Ink, and Tag systems.
- Several advanced systems exist in source but need integration verification before being presented as fully live.

**Dev rule:** Treat the current build as a strong visual/click-to-tag/world foundation with many advanced modules available, but do not claim deeper combat, missions, seasons, cloud save, or Web3 economy as live until they are wired, tested, and documented.

---

## 3. Current Game: What Is Live in the Package

### Live / Directly Evident From Main Wiring
- Three.js isometric scene
- Orthographic camera
- Bloom/post-processing
- Neon Sprawl world build
- 10+ named zones and structures
- Procedural 3D buildings
- NPC manager spawn pass
- Starter GraffPunk squad
- Click-to-tag interaction
- Zone detection by proximity
- Spray VFX / wall decal placement
- Rebel Ink economy object
- Rebellion meter system
- UI manager and minimap updates
- Camera controls and zoom
- Loading screen
- Passive ambience / notification events

### Present as Source Modules / Needs Integration Verification
- Mission system
- Progression system
- Save/load system
- Weather system
- Time/day-night system
- Arena system
- Anomaly system
- Zone Wars system
- Audio system
- Deeper squad combat systems

### Key Technical Point
The package is not empty. It has a serious architecture. But the development plan must separate:

1. **Visible / wired features**
2. **Source-present but not fully integrated features**
3. **Future Crypto Moonboys extensions**

That distinction protects trust and prevents product drift.

---

## 4. Current Map / World Structure

The current district is **Neon Sprawl**. It is built around zones, each with a position, radius, and faction relationship.

### Existing Zones
| Zone ID | Name | Current Role |
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

### Existing Bridges
- Reactor ↔ Queen
- Reactor ↔ Arena
- Reactor ↔ Honeycomb
- Reactor ↔ VertFarm
- Queen ↔ Docks
- Arena ↔ Ruins
- Ruins ↔ Shrine

### Upgrade Direction
These zones should become **wiki-linked living districts**. Every zone should have:

- A lore page link
- A gameplay function
- A faction influence state
- A mission role
- A visual corruption/tagging state
- A future unlock table

---

## 5. Current Core Gameplay Loop

### Current Loop
1. Player loads Neon Sprawl.
2. Player clicks a point in the world.
3. Raycaster finds the clicked surface.
4. Closest zone is calculated.
5. Spray tag is placed.
6. TagSystem increments zone tag count.
7. Rebel Ink is earned.
8. Rebellion meter increases.
9. VFX appear.
10. UI/minimap updates.

### Current Capture Logic
- Each zone tracks tags.
- A zone becomes controlled after enough tags.
- Capturing a zone increases rebellion.
- Captured zones create passive rebellion pressure.

### Current Game Feel
This already supports the right feeling:

> click → tag → territory responds → rebellion grows

That is strong. The next step is to make it more Crypto Moonboys-specific.

---

## 6. Current Player Fantasy

The player is not a generic hero. They are a **GraffPunk operator** entering a live city layer of the Crypto Moonboys wiki.

They command a crew of playable GraffPunks. They move through Neon Sprawl, mark territory, disrupt Chainlight control, recruit allies, unlock lore, and push the world toward rebellion.

### Current Starter Squad
- `ORACLE-7` — Prophet archetype
- `PHASE-X` — Ghost archetype
- `CHAINSAW` — Breaker archetype

### Current GraffPunk Archetypes
| Archetype | Ability | Role |
|---|---|---|
| Prophet | Wall Oracle | Lore/signal reveal |
| Breaker | Chain Surge | Security/hack disruption |
| Ghost | Phase Tag | Stealth tagging |
| Bomber | Ink Nuke | AoE paint/control |
| Watcher | Ink Sight | Enemy reveal |
| Runner | Blur Tag | Speed tagging |
| Hacker | Code Inject | Enemy conversion |
| Tank | Glitch Wall | Defense |
| Trickster | Mirror Tag | Decoy play |
| Architect | Zone Lock | Territory hold |
| Nomad | Ghost Route | Path reveal |
| Oracle | Resonance | Squad boost |

### Extension Direction
Turn each archetype into a Crypto Moonboys-aligned identity path tied to wiki pages, factions, and unlockable tag styles.

---

## 7. Current NPC / Faction Layer

### Existing NPC Factions / Types
The package includes NPC archetypes tied to the Crypto Moonboys / GraffPunk universe:

- Crypto Moongirls / Moongirl elite patrols
- HODL X Warriors / authority guards
- Bitcoin Kids / civilian intel carriers
- Nomad Bears
- AllCity Bulls
- Bally Boys
- Ducky Boys
- Forkborn Defectors
- Null Prophet corruption layer

### Current AI States
NPCBase uses a finite-state logic such as:

- idle
- patrol
- alert
- pursue
- flee

### Extension Direction
Every NPC type should become part of a living wiki ecosystem:

- NPC dialogue pulls from lore pages.
- NPCs unlock wiki fragments.
- NPC factions affect district control.
- NPC interactions feed the Battle Chamber.
- NPC events can become daily/weekly wiki events.

---

## 8. Existing Systems Overview

### TagSystem
Purpose: zone tagging, zone capture, tag count, ownership state.

Crypto Moonboys extension:
- Tags become proof marks.
- Each tag can reflect faction, NFT skin, or wiki mission.
- Zone capture can unlock lore fragments.

### RebellionSystem
Purpose: global rebellion meter with threshold events.

Current thresholds:
- Dormant
- Stirring
- Rising
- Igniting
- Overflow

Crypto Moonboys extension:
- Rebellion becomes the district-wide living wiki pulse.
- High rebellion unlocks temporary lore events.
- Overflow can trigger HODL Wars seasonal events later.

### InkEconomy
Purpose: internal game resource: Rebel Ink.

Important rule:
- Rebel Ink is a game resource.
- Do not confuse it with token rewards.
- It should remain in-game unless intentionally connected to future systems.

### ProgressionSystem
Purpose: rank XP with titles.

Current rank path:
Toy → Writer → All-City → King → Legend → GraffGod → Chainbreaker → Null Slayer → Neon Prophet → GraffPunk Supreme

Crypto Moonboys extension:
- Align ranks to wiki achievements.
- Add title badges to Battle Chamber.
- Let ranks unlock tag styles, not financial promises.

### MissionSystem
Purpose: story missions and Underbelly contracts.

Crypto Moonboys extension:
- Queen Sarah mission chain becomes the first canon campaign.
- Underbelly contracts become daily playable lore tasks.
- Mission completion can unlock wiki pages or page sections.

### SaveSystem
Purpose: local persistence.

Extension direction:
- LocalStorage now.
- Telegram/server sync later.
- Cloud sync only after stable schema.

---

## 9. Required Product Truth: Score, XP, Ink, Tokens

The game must not blur its progression terms.

### Score
How well you performed in a run or action.

### Arcade XP
Site-level progression earned from accepted arcade runs when Telegram is linked.

### City XP / Rank XP
In-game progression inside City Block Topia. This can be separate from Arcade XP unless explicitly synced.

### Faction XP
Faction alignment/progression only.

### Rebel Ink
In-game resource used for upgrades, tags, contracts, crafting, and squad actions.

### Tokens / NFTs
Future optional ownership layer. Do not promise passive income or guaranteed rewards.

### Hard Rule
**XP is not given. It is earned through activity.**

---

## 10. The Real Crypto Moonboys Extension

The current game has GraffPunk flavor. It needs stronger Crypto Moonboys identity.

### Add These Core Crypto Moonboys Elements
1. **Living Wiki Links**
   - Every zone links to a wiki page.
   - Every mission unlocks a lore fragment.
   - Every faction has a wiki-backed identity.

2. **Bitcoin Kid Role**
   - Bitcoin Kid becomes the onboarding guide / street-level oracle.
   - Gives early mission: “Find your first wall.”
   - Explains Score vs XP vs Ink.

3. **Graffiti Kings / GKniftyHEADS Layer**
   - GK appears as the founding force behind the rebellion system.
   - Use “the floor” concept: GK gives the wall, players build on top.

4. **HODL Wars Layer**
   - Future seasonal war mode.
   - Do not mark live until built.
   - Use as long-term faction competition container.

5. **Battle Chamber Sync**
   - Game events feed the community page.
   - “Zone captured”, “rank up”, “mission complete”, “faction joined.”

6. **Telegram Identity**
   - Linked players get persistent progress.
   - Unlinked players can play local/demo mode.
   - Linking should not be forced before first action.

7. **NFT/IP Layer**
   - NFTs unlock cosmetic tag packs, faction banners, squad skins, lore titles.
   - Keep it optional at first.
   - No pay-to-win gate for first play.

---

## 11. Proposed Final Game Name / Positioning

### Option A
**City Block Topia: GraffPunk Infiltration**

Best for current package.

### Option B
**Block Topia: Neon Sprawl**

Better if you want it to sit under the main Block Topia brand.

### Option C
**Crypto Moonboys: The Wiki Is Alive — Neon Sprawl**

Best for marketing and website integration.

### Recommendation
Use a layered title:

**Crypto Moonboys: The Wiki Is Alive**

Subtitle:

**City Block Topia — GraffPunk Infiltration**

This connects game and living wiki positioning in one line.

---

## 12. Player Onboarding Flow

### First 60 Seconds
1. Loading screen: “THE WIKI IS ALIVE.”
2. Bitcoin Kid appears: “You read the page. Now touch the wall.”
3. Player clicks first wall / zone.
4. Tag appears.
5. Rebellion ticks up.
6. UI says: “First tag placed.”
7. Tooltip: “Link Telegram to save your city progress.”

### First 5 Minutes
- Player captures first zone.
- Learns Score vs XP vs Ink.
- Meets Bitcoin Kid / Queen Sarah / Underbelly contact.
- Sees Battle Chamber link.
- Gets first squad member identity.

### First Session Goal
Player should leave knowing:

- This is a playable wiki layer.
- Tagging matters.
- XP requires action.
- Telegram sync saves position.
- The city will grow.

---

## 13. Core Game Modes

### 1. Explore Mode
Read plaques, inspect zones, discover lore fragments.

### 2. Tag Mode
Click zones, place spraycode, build tag count, capture territory.

### 3. Squad Mode
Select GraffPunks, move units, use abilities.

### 4. Mission Mode
Complete story tasks and daily contracts.

### 5. Zone War Mode
Defend captured zones from Authority reclaim attempts.

### 6. Arena Mode
Hard Fork Arena wave battles.

### 7. Future: HODL War Season Mode
Faction-vs-faction seasonal layer.

---

## 14. Crypto Moonboys Mission Expansion

### Mission Chain 1 — “The Wiki Wakes Up”
- Meet Bitcoin Kid.
- Tag Graffiti Ruins.
- Read first lore fragment.
- Capture first wall.
- Link Telegram.

### Mission Chain 2 — “Queen Sarah Signal”
- Reach Queen Tower.
- Intercept Chainlight broadcast.
- Deliver data canister.
- Unlock Queen Sarah faction influence.

### Mission Chain 3 — “The Null Prophet”
- Explore Null Shrine.
- Destroy glitch fragments.
- Protect tagged zones from corruption.
- Unlock Null resistance tag pack.

### Mission Chain 4 — “Hard Fork Trials”
- Enter arena.
- Survive waves.
- Defend captured districts.
- Earn title: Hard Fork Challenger.

### Mission Chain 5 — “The Living Wiki”
- Discover hidden page nodes.
- Connect lore fragments across the map.
- Unlock Battle Chamber proof badge.

---

## 15. Faction Extension Plan

### Immediate Factions
- GraffPUNKS
- HODL Warriors
- Bitcoin Kids
- Crypto Moongirls
- Nomad Bears
- AllCity Bulls
- Bally Boys
- Ducky Boys
- Forkborn Defectors
- Null Prophet Cult / corruption

### Faction Design Rules
Each faction needs:

- Wiki page
- In-game icon/color
- NPC type
- Dialogue bank
- Mission role
- Zone affinity
- Gameplay modifier
- Battle Chamber status

### Example
**Bitcoin Kids**
- Role: intel carriers / onboarding guides
- Zone affinity: Honeycomb, Graffiti Ruins
- Ability: reveals hidden wiki fragments
- Battle Chamber proof: “first reader route completed”

---

## 16. Zone Extension Plan

### Each Zone Gets 7 Layers
1. Visual identity
2. Lore page link
3. Current control owner
4. Tag count
5. Rebellion contribution
6. Mission hooks
7. Future unlocks

### Example: Graffiti Ruins
- Lore: origin wall, first tags, rebel safe zone
- Gameplay: safe respawn, tag tutorial, faction recruitment
- Crypto Moonboys element: “THE WIKI IS ALIVE” mural
- Unlock: first tag badge

### Example: Null Shrine
- Lore: Null Prophet corruption
- Gameplay: anomaly events, glitch waves
- Crypto Moonboys element: anti-memory / erased wiki pages
- Unlock: Null resistance mission chain

---

## 17. UI Extension Plan

### Current UI Strengths
- Left squad panel
- Live feed
- Minimap
- Right status panel
- Ability bar
- Notifications
- Loading screen
- CRT overlay

### Additions Needed
1. **Wiki Pulse Panel**
   - Shows active lore node.
   - “Page unlocked.”
   - “Read this next.”

2. **Telegram Sync Banner**
   - Local mode vs synced mode.
   - `/gklink` prompt after first meaningful action.

3. **Battle Chamber Feed Bridge**
   - “Send this event to Battle Chamber.”
   - Event feed preview.

4. **Zone Codex Drawer**
   - Displays zone lore, control state, connected wiki link.

5. **XP Clarity HUD**
   - Score
   - City XP
   - Arcade XP sync status
   - Rebel Ink

---

## 18. Technical Build Architecture

### Client
- Three.js app
- Vanilla ES modules
- EventBus-based systems
- localStorage for current save
- CDN imports for Three.js unless bundled later

### Website Integration
- Embed under `/games/city-block-topia/` or `/games/block-topia/neon-sprawl/`
- Add manifest JSON to arcade index
- Add link from How to Play and Battle Chamber
- Add wiki link panels in game

### Backend / Sync Layer
Needed for future persistent state:

- Player identity from Telegram
- City progress save/load
- Zone event logging
- XP submission
- Faction alignment
- Battle Chamber activity feed

### Proposed API Endpoints
- `GET /city-block-topia/profile`
- `POST /city-block-topia/save`
- `GET /city-block-topia/save`
- `POST /city-block-topia/event`
- `POST /city-block-topia/mission-complete`
- `POST /city-block-topia/zone-captured`
- `GET /city-block-topia/leaderboard`

---

## 19. Data Model Draft

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

## 20. Build Milestone Plan

### Milestone 0 — Truth Audit
Goal: decide what is live, source-present, and planned.

Tasks:
- Confirm which systems are actually wired in `main.js`.
- Remove overclaiming in metadata and UI copy.
- Create `CURRENT_STATE.md`.

### Milestone 1 — Repo Integration
Goal: run the game inside Crypto Moonboys site.

Tasks:
- Place game under `/games/city-block-topia/`.
- Add manifest entry.
- Add arcade card.
- Add How to Play link.
- Confirm all imports work on GitHub Pages.

### Milestone 2 — Living Wiki Layer
Goal: connect zones to wiki pages.

Tasks:
- Add zone codex drawer.
- Link zones to wiki slugs.
- Add first lore fragment unlocks.
- Add Bitcoin Kid tutorial.

### Milestone 3 — Player Identity Sync
Goal: make progress persistent.

Tasks:
- Detect Telegram sync state.
- Local mode vs synced mode UI.
- Save city profile to backend.
- Submit safe event logs.

### Milestone 4 — Real Mission Loop
Goal: make the game more than tagging.

Tasks:
- Wire MissionSystem into `main.js`.
- Verify Queen Sarah chain.
- Wire Underbelly contracts.
- Add mission rewards as City XP/Rebel Ink only.

### Milestone 5 — Battle Chamber Bridge
Goal: make player action visible on the site.

Tasks:
- Send activity events.
- Add “recent city events” panel.
- Show faction activity.
- Display city rank badges.

### Milestone 6 — Zone Wars / Arena / Anomaly
Goal: add replayable challenge.

Tasks:
- Wire ZoneWarsSystem.
- Wire ArenaSystem.
- Wire AnomalySystem.
- Stress test NPCs and VFX.

### Milestone 7 — NFT / Wallet Optional Layer
Goal: ownership cosmetics and IP flavor.

Tasks:
- Optional wallet connect.
- NFT tag skins.
- Faction banners.
- Holder title badges.
- No pay-to-win.

### Milestone 8 — Season 0
Goal: run a public test season.

Tasks:
- Season ID
- Event logging
- Leaderboards
- Clear rules
- No guaranteed rewards language

---

## 21. Immediate Technical Fixes Before Public Integration

Based on the audit files, prioritize:

1. Confirm renderer screenshot settings only if screenshot mode is needed.
2. Verify save/load schema keys.
3. Prevent unbounded wall decal growth.
4. Remove any per-frame mesh creation.
5. Verify mobile tap flow.
6. Make sure advanced systems do not reference missing methods.
7. Confirm Three.js CDN strategy for GitHub Pages / deployment.
8. Add source-of-truth status file.
9. Add QA smoke test plan.
10. Lock terminology: Score, City XP, Arcade XP, Rebel Ink, Faction XP.

---

## 22. QA Smoke Test Plan

### Core Load
- Page loads without console errors.
- Loading screen hides.
- Camera renders Neon Sprawl.
- Buildings visible.
- NPCs spawn.
- UI panels display.

### Interaction
- Click surface places tag.
- Tag increases zone count.
- Zone captures after threshold.
- Rebellion meter updates.
- Rebel Ink updates.
- Minimap updates.

### Squad
- Starter squad appears.
- Squad selection works.
- Ability hotkeys fire.
- Cooldowns update.

### Stability
- 10 minutes of play without memory spike.
- 100 tags without severe frame drop.
- 50 NPCs active without flood events.
- Mobile tap does not crash.

### Integration
- Game link from arcade works.
- Back link to wiki works.
- Telegram sync prompt appears but does not block first play.
- Battle Chamber link opens.

---

## 23. Launch Copy

### Game Card Title
**City Block Topia: GraffPunk Infiltration**

### Game Card Description
Enter Neon Sprawl, tag the city, grow rebellion pressure, and turn Crypto Moonboys lore into territory. This is where the living wiki becomes playable.

### First Screen Copy
**THE WIKI IS ALIVE.**

Read the lore. Tag the wall. Build rebellion. Link your identity when you are ready to make progress stick.

### Sync Prompt
You placed your first tag. Link Telegram to save your city progress.

### Block Topia Access Copy
Access requires Telegram sync and 50 Arcade XP. City Block Topia is a deeper world layer. Deeper gameplay systems are planned and not live yet.

---

## 24. Non-Negotiable Product Rules

1. Do not sell this as passive rewards.
2. Do not confuse Rebel Ink with tokens.
3. Do not present planned features as live.
4. Do not force wallet before first play.
5. Do not remove the wiki identity.
6. Do not make the game separate from lore.
7. Do not bury the core route.
8. Do not overcomplicate onboarding.
9. Do not call it just a demo if it has a playable loop.
10. Do not call it finished until mission, save, sync, and zone systems are verified.

---

## 25. Final Build Vision

The end-state is not a game beside a wiki.

The end-state is a wiki you can enter.

Every page can become a mission.
Every zone can become a page.
Every tag can become proof.
Every faction can become a community layer.
Every player action can feed the Battle Chamber.
Every linked identity can build history.

That is the real Crypto Moonboys extension.

**The wiki explains the world. City Block Topia lets you fight for it.**
