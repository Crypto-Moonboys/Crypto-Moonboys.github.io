# Crypto Moonboys — AAA → AAAA Upgrade Roadmap
## Based on the OG Build Identity

> **Last updated:** 2026-04-30
> **Status:** Planning document — not a live-feature list.
> **Rule:** Never describe FUTURE or COMING NEXT items as live.
> **Rule:** This document travels with the codebase. Update it when a phase ships.

---

## Executive Summary

Crypto Moonboys is a living Web3 wiki system.
It is not an arcade portal, not a generic game hub, and not a fake corporate Web3 product.

The core identity is a culture engine built on the logic of street knowledge:
read, act, prove, belong, unlock, build.

The AAA target is a polished, connected living system where every action — reading a wiki page, playing a game, linking Telegram, earning XP, joining a faction — feels like one coherent journey.

The AAAA target is an ecosystem-scale culture engine where the wiki explains canon, arcade games generate action, XP proves participation, factions create belonging, Block Topia becomes a world layer, and creator tools let players become builders.

**This document is the authoritative upgrade roadmap.**
It grounds all future agent work, design decisions, and implementation phases in the OG identity.

---

## OG Identity Statement

> Before Web3, there was the wall.
> Before NFTs, there were names.
> Before tokens, there were crews.
> Before dashboards, there was proof of work.

Crypto Moonboys is culture moving from the streets up into a digital system.

| Street Layer | Digital Layer |
|---|---|
| The wall | The wiki |
| The tag | The identity |
| The arcade | The action layer |
| The crew | The faction |
| The proof wall | The Battle Chamber |
| The mythology | The lore |
| The artefact | The NFT |
| The new street | The system |

Every design decision, every new game, every new page must be grounded in this logic.
If a feature does not belong to this street-to-digital mapping — it does not belong in Crypto Moonboys.

---

## Core Route (Player Journey)

```
Read → Play → Earn XP → Link → Battle Chamber → Block Topia → Build
```

Every major page in the system should make this route visible, legible, and actionable for every player who arrives.

---

## Part 1 — Current Live System

> **LIVE NOW** means it has working code on main, a server route where required, and produces real output for real users.
> If it is local-only scaffolding, it is listed as PARTIAL.
> If it does not exist in main, it is listed as FUTURE.

### 1.1 — Live: Wiki / Knowledge System

| System | Status | Notes |
|---|---|---|
| Public wiki / knowledge base | ✅ Live | Articles, lore, category pages, archive structure |
| Lore pages | ✅ Live | Published across wiki categories |
| Article category / archive structure | ✅ Live | `/categories/`, `/wiki/`, search index |
| `/search.html` canonical article hub | ✅ Live | Query-first + deterministic rank_score ordering |
| Site graph | ✅ Live | `/graph.html` — entity map visualisation |
| Timeline | ✅ Live | `/timeline.html` |

### 1.2 — Live: Arcade Games

All active games accept score submissions, queue Arcade XP sync, and are linked from the arcade index.

| Game | Faction Effects | Cross-Game Modifier Tags | Daily Mission |
|---|---|---|---|
| Invaders 3008 | ✅ | ✅ | ⚠️ Local only |
| Pac-Chain | ✅ | ✅ | ⚠️ Local only |
| Asteroid Fork | ✅ | ✅ | ⚠️ Local only |
| Breakout Bullrun | ✅ | ✅ | ⚠️ Local only |
| Tetris Block Topia | ✅ | ✅ | ⚠️ Local only |
| SnakeRun 3008 | ✅ | ✅ | ⚠️ Local only |
| Crystal Quest | ❌ | ✅ | ⚠️ Local only |
| Block Topia Quest Maze | ❌ | ✅ | ⚠️ Local only |

> **Deprecated (not in arcade nav):** HexGL Monster Max, HexGL Local — score submission disabled.

### 1.3 — Live: Progression System

| System | Status | Notes |
|---|---|---|
| Score submission (leaderboard) | ✅ Live | Score-only rank; XP does not affect leaderboard position |
| Arcade XP sync (server) | ✅ Live | POST /arcade/progression/sync; requires Telegram link to persist |
| Telegram identity link (/gklink) | ✅ Live | Via @WIKICOMSBOT |
| Pending run queue (pre-link) | ✅ Live | Runs queued locally; flushed on Telegram link |
| Anti-farm controls | ✅ Live | Per-game ceiling, repeat-window, daily XP cap |
| Faction join / status / earn | ✅ Live | Server-backed via /faction/* routes |
| Faction gameplay effects | ✅ Live | Invaders, Pac-Chain, Tetris, Breakout, Asteroid Fork, SnakeRun |
| Leaderboard display | ✅ Live | Score ranking — all-time; no season windows yet |

### 1.4 — Live: Block Topia

| System | Status | Notes |
|---|---|---|
| Block Topia entry gate | ✅ Live | Telegram linked + ≥50 Arcade XP required |
| Block Topia multiplayer map | ✅ Live | 2-player isometric grid (20×20), P1 and P2 movement, no NPC |
| Colyseus server (MinimalCityRoom) | ✅ Live | maxClients=2, server-authoritative positions, autoDispose=false |

### 1.5 — Partial / Scaffolded (local-only, not server-backed)

| System | Status | Notes |
|---|---|---|
| Cross-Game Modifiers | ⚠️ Partial | Modifier defs active in games; state is localStorage-only, not server-synced |
| Daily Missions | ⚠️ Partial | Mission pool defined; progress in localStorage; no server sync |
| Faction war standings | ⚠️ Partial | faction-war-system.js is localStorage-only; cross-player results not server-backed |
| Faction streaks | ⚠️ Partial | faction-streaks.js is localStorage-based |

### 1.6 — Battle Chamber

The Battle Chamber (`/battle-chamber.html`) exists as an activity layer showing live leaderboard and faction movement data.

| System | Status | Notes |
|---|---|---|
| Battle Chamber page | ✅ Live | Activity feed, faction standings, leaderboard display |
| Live activity feed | ✅ Live | Pulls from live leaderboard and faction data |
| Faction movement display | ✅ Live | Shows faction standings from server-backed faction data |
| Season competition windows | ❌ Not built | Leaderboard is all-time; no season resets yet |

---

## Part 2 — OG Philosophy

Crypto Moonboys was not designed from a product roadmap.
It was designed from culture.

The original logic:

**The wall became the wiki.**
Before a wiki existed, the wall was the place where names were recorded. Knowledge was written on surfaces. The community made its own record. The Crypto Moonboys wiki carries this logic: it is a public record of names, lore, and meaning built by people who know what it means to mark something.

**The tag became identity.**
A tag is not a username. A tag is a proof of presence. On the streets, you leave your mark or you were never there. On Crypto Moonboys, Telegram identity is the tag. Linking is not optional. It is how you prove you were here.

**The arcade became action.**
The arcade is not decoration. It is the action layer. Games are the streets where you prove yourself. Arcade XP is not a number — it is a record of what you did. You cannot fake it. You have to earn it.

**The faction became the crew.**
Diamond Hands, HODL Warriors, GraffPUNKS are not just filters. They are the crew system. You do not choose a faction because of a bonus. You choose a faction because of who you are. The faction is your flag.

**The Battle Chamber became the proof wall.**
The proof wall shows who moved and who didn't. It shows the faction standings, the active runs, the season pressure. It is the place where work is witnessed. Not claimed — witnessed.

**The lore became mythology.**
The lore pages are not flavour text. They are the mythology of the system. The characters, the events, the factions — these are the canon that makes the system feel like a world, not a product.

**The NFT became the artefact.**
NFTs in Crypto Moonboys are not investment vehicles. They are artefacts — identity markers, ownership signals, access points. They carry meaning because the system carries meaning.

**The system became the new street.**
The whole platform — wiki, arcade, factions, XP, Block Topia — is the new street. It is the place where culture lives and proof gets made.

**This philosophy is not negotiable.**
Every future design decision must pass through this logic.
If it does not belong to the street-to-digital mapping — it does not belong here.

---

## Part 3 — AAA Target

> AAA does NOT mean only graphics.

For Crypto Moonboys, AAA means:

- The living wiki feels clear and purposeful — every article knows its role in the system
- The arcade feels polished — games have weight, feedback, and consequence
- The XP loop is visible — players understand what they earned and why it matters
- Every action has feedback — game over means something; a faction earn means something
- Every player understands why they should act — the route is clear from every entry point
- Factions feel like crews — joining a faction changes something real about how you play
- The Battle Chamber feels like proof — it shows what happened, not just what could happen
- Block Topia feels like the next door — earning access feels earned, not just a gate

**The AAA target is:**

> A polished living Web3 wiki where reading, playing, linking, earning XP, joining factions, and entering gated layers feel like one connected system.

Not separate features. Not separate pages. One journey.

---

## Part 4 — AAA System Requirements

These are the systems that must be designed and built to reach AAA.

### 4.1 — Unified Player Journey Overlay

Every major page (wiki home, arcade index, faction pages, Battle Chamber, Block Topia) should surface the route:

```
Read → Play → Earn XP → Link → Battle Chamber → Block Topia → Build
```

The overlay should:
- Show the player's current position in the journey
- Show the next step with a clear CTA
- Not interrupt reading or playing — it supplements, it does not block

**Pages to receive the overlay:**
- `/index.html` — site home
- `/games/index.html` — arcade index
- `/battle-chamber.html` — Battle Chamber
- `/block-topia.html` — Block Topia landing
- `/wiki/` lore and article pages (contextual CTA only)
- `/categories/` hub pages

### 4.2 — Game Pre-Run Panel

Before each game run begins, show a panel that contextualises the run:

| Element | Source |
|---|---|
| Selected Faction | MOONBOYS_STATE.faction |
| Active Cross-Game Modifier | cross-game-modifier-system.js → getActiveModifiers() |
| Daily Mission target | faction-missions.js mission pool |
| Personal best score | localStorage / server leaderboard |
| Arcade XP status | MOONBOYS_STATE.xp + sync status |
| Why this run matters | Dynamic text based on XP gate progress, Daily Mission, faction standing |

This panel must not block play. It should be dismissible and respect the existing fullscreen overlay system (data-overlay-* attributes on #startBtn).

### 4.3 — Game Post-Run Reward Breakdown

After game over, before the overlay resets, show a reward breakdown:

| Element | Source |
|---|---|
| Score achieved | Game over score |
| Arcade XP gained this run | ArcadeSync result (accepted XP delta) |
| Daily Mission progress | faction-missions.js current state |
| Faction contribution | Faction XP earned |
| Leaderboard position movement | Before / after rank comparison |
| Next unlock / next step | Dynamic: Block Topia gate progress, next mission, next rank |

This breakdown should display on the existing game-over screen or as an overlay above it.
It must wait for ArcadeSync to return before showing XP values — never show speculative XP.

### 4.4 — Player Profile

A player profile view showing:

| Field | Source |
|---|---|
| Arcade XP total | Server: /arcade/progression/sync response |
| Season level | Future: not yet implemented |
| Faction | MOONBOYS_STATE.faction |
| Faction rank | Server: /faction/status |
| Game mastery levels (per-game best) | localStorage personal bests |
| Daily Mission streak | faction-missions.js streak tracking |
| Telegram link status | MOONBOYS_IDENTITY / connection-status-panel |
| Block Topia access status | Server: /blocktopia/progression can_enter_multiplayer |

The profile is accessible from the connection-status panel and/or a dedicated `/profile.html` page.

### 4.5 — Faction Crew Dashboard

A per-faction view for Diamond Hands, HODL Warriors, and GraffPUNKS:

| Element | Contents |
|---|---|
| Identity | Who this faction is — origin, style, philosophy |
| Playstyle | How this faction plays differently |
| Active bonus | Current Cross-Game Modifier or stat bonus active for this faction |
| Mission progress | Current Daily Mission completion rate (local until server-backed) |
| War contribution | Faction XP contributed this period |
| Weekly / season standing | Faction rank against other factions |

Each faction dashboard links directly to the games where faction effects are active.

### 4.6 — Battle Chamber Upgrade

The Battle Chamber must become the public proof wall.

Current state: activity feed and faction standings display.

AAA target additions:

| Addition | Purpose |
|---|---|
| Live activity feed — real-time pulse | Show runs happening now (or recently) |
| Leaderboard with faction badges | Make faction identity visible in rank data |
| Faction movement delta | Show which faction moved up/down since yesterday |
| Daily Mission pulse | Show community-level mission progress |
| Season pressure indicator | Show how much time remains in the current period |
| Recent unlocks feed | Show players who just unlocked Block Topia access |
| Block Topia access progress bar | Community-level: how many players have reached the gate |

### 4.7 — Wiki-to-Action Links

Every lore and wiki article page should contain at least one contextual action link:

| Link type | When to use |
|---|---|
| Play related game | Article is about an in-game event, faction, or mechanic |
| Join related faction | Article covers faction lore |
| Complete related mission | Article covers a mission-relevant topic |
| Unlock related layer | Article is about Block Topia, lore gates, or progression |
| Read next page | Always — connect the knowledge graph to the player journey |

These links should be added as a consistent "Enter the System" CTA block at the bottom of eligible articles. They must not be intrusive or replace the article body.

---

## Part 5 — AAA Polish Layer

> Polish without breaking the OG identity.
> Street-born. Wiki-alive. Arcade-proof.
> Not generic casino. Not generic cyberpunk. Not fake corporate Web3.

### 5.1 — Visual / Animation Polish

| Polish element | Description |
|---|---|
| Faction splash screens | On faction join — brief branded screen for Diamond Hands / HODL Warriors / GraffPUNKS |
| Rank-up animation | Triggered on faction rank promotion |
| XP gain animation | Triggered after ArcadeSync confirms accepted XP — never speculative |
| Mission complete animation | Triggered on Daily Mission completion |
| Battle Chamber live pulse | Visual indicator that the Battle Chamber is active and receiving data |
| Game-over reward breakdown | Styled breakdown screen (see 4.3) |
| Modifier activation effect | Visual flash on Cross-Game Modifier activation |
| Lore page "Enter the System" CTA | Styled block at foot of eligible articles |

### 5.2 — Sound

| Sound element | Description |
|---|---|
| XP gain SFX | Short confirm sound — not intrusive |
| Mission complete SFX | Distinct from XP gain |
| Faction join SFX | Branded per faction if possible |
| Rank-up SFX | Escalation sound |
| Game-over breakdown SFX | Reward reveal sequence |

Sound must be opt-in or respect system mute settings. Never autoplay sound on page load.

### 5.3 — Mobile-First Layout

- All player journey overlay elements must render cleanly on mobile
- Game pre-run and post-run panels must be scrollable on small screens
- Battle Chamber activity feed must be readable on mobile
- Profile and faction dashboards must not require horizontal scroll

### 5.4 — Style Rules

The Crypto Moonboys visual identity must remain:
- Street-born — rough edges are features, not bugs
- Wiki-alive — information-dense pages are correct for this system
- Arcade-proof — game screens feel like you are about to do something real
- Anti-generic — no casino light effects, no fake neon cyberpunk, no stock Web3 imagery

---

## Part 6 — AAAA Target

> AAAA means ecosystem-scale, not just better visuals.
> ALL items in this section are FUTURE unless explicitly marked otherwise.

**The AAAA target:**

> Crypto Moonboys becomes a living culture engine where the wiki explains canon, arcade games generate action, XP proves participation, Telegram persists identity, Battle Chamber proves movement, factions create belonging, NFTs act as artefacts and access points, Block Topia becomes a world layer, and creator tools let players become builders.

### 6.1 — AAAA Systems (ALL FUTURE)

| System | Description |
|---|---|
| Persistent world hub | Block Topia evolves beyond the 2-player skeleton into a persistent world with more players, districts, and ambient life |
| Deeper Block Topia gameplay | NPC lite → events → district control → economy scaffolding (follow Block Topia safe-phase order in docs/block-topia/CURRENT_RUNTIME_TRUTH.md) |
| Faction-controlled zones | Factions compete to hold districts in Block Topia — outcomes affect modifiers and standings |
| Player inventory | Carry cosmetics, titles, badges, artefacts across sessions |
| Cosmetics / titles / badges | Earnable through XP milestones, mission streaks, faction rank, Block Topia access |
| NFT-aware profile layers | NFT holdings surface as artefacts in player profile — identity markers, not financial instruments |
| AI-assisted live quests | Dynamically generated quests tied to current lore, faction standing, or world events |
| Creator mission tools | Players / contributors can author missions and submit them for faction pools |
| Lore-to-game quest links | Wiki articles directly spawn in-game quest lines |
| Seasonal HODL Wars | Full faction war season with defined start/end, standings, rewards, and public proof record |
| Phygital / real-world activation hooks | Real-world events that trigger in-game consequences (Telegram bot events, IRL meetup rewards) |
| Community-built extensions | Open tooling for community contributors to add games, lore, or systems |

> **Reminder:** None of the above are live. Do not describe them as live. Do not imply they are coming soon unless a phase decision has been documented.

---

## Part 7 — Live vs Future Rule

This is the authoritative status table. It must be updated when a system ships.

### LIVE NOW

| System | Evidence |
|---|---|
| Public wiki / knowledge base | Running at root domain; articles.html, search.html, wiki/ |
| Lore and article pages | Live across wiki categories |
| Category / archive structure | /categories/, /wiki/ |
| 8 playable arcade games | games/ directories, active in arcade nav |
| Score submission (all active games) | submitScore() wired, leaderboard updates |
| Arcade XP sync (server-backed) | POST /arcade/progression/sync, requires Telegram |
| Pending run queue (pre-link) | ArcadeSync.queuePendingProgress() wired |
| Telegram identity link | @WIKICOMSBOT /gklink flow |
| Leaderboard systems (score rank) | Live, all-time |
| Battle Chamber activity layer | Live at /battle-chamber.html |
| Faction join / status / earn (server) | /faction/* routes live |
| Faction gameplay effects (6 games) | Wired into Invaders, Pac-Chain, Tetris, Breakout, Asteroid Fork, SnakeRun |
| Block Topia entry gate | 50 Arcade XP + Telegram — server-enforced |
| Block Topia 2-player isometric base | MinimalCityRoom, maxClients=2, clean map |

### PARTIAL (local scaffolding only — not server-backed)

| System | Notes |
|---|---|
| Cross-Game Modifiers | Modifier defs active; state is localStorage-only |
| Daily Missions | Pool defined; progress localStorage-only |
| Faction war standings | faction-war-system.js is localStorage simulation |
| Faction streaks | localStorage-based |

### COMING NEXT (near-term upgrade targets)

| System | Phase |
|---|---|
| Unified player journey overlay | Phase 1 |
| Consistent wiki-to-action CTAs | Phase 1 |
| Game pre-run panel | Phase 2 |
| Game post-run reward breakdown | Phase 2 |
| XP gain animation | Phase 2 |
| Mission progress UI | Phase 2 |
| Player profile page | Phase 3 |
| Faction crew dashboard | Phase 3 |
| Battle Chamber proof wall upgrade | Phase 4 |
| Wiki-to-action link blocks | Phase 5 |
| Mobile-first layout polish | Phase 1–3 |

### FUTURE / AAAA (long-term — not live, not imminent)

| System | Notes |
|---|---|
| Season competition windows | Not yet active; leaderboard is all-time |
| Persistent world hub | AAAA phase |
| Deeper Block Topia gameplay | Follow safe-phase order in CURRENT_RUNTIME_TRUTH.md |
| Faction-controlled zones | AAAA phase |
| Player inventory | AAAA phase |
| NFT-aware profile layers | AAAA phase |
| AI-assisted live quests | AAAA phase |
| Creator mission tools | AAAA phase |
| Seasonal HODL Wars | AAAA phase |
| Phygital hooks | AAAA phase |

---

## Part 8 — Implementation Phases

### Phase 1 — Clarity Layer

**Goal:** Every player who arrives on any major page understands the route.

- Add unified player journey overlay to: site home, arcade index, Battle Chamber, Block Topia landing
- Update faction pages to explain crew identity and active bonuses clearly
- Add "what is Arcade XP / what is the gate / how does Telegram linking work" explainer blocks to relevant pages
- Ensure consistent CTAs across all major pages using the route:
  `Read → Play → Earn XP → Link → Battle Chamber → Block Topia → Build`
- Mobile-first layout pass on overlay elements
- Add "Enter the System" CTA block template to wiki/lore article footer

### Phase 2 — Reward Feedback Layer

**Goal:** Every action produces visible, meaningful feedback.

- Game pre-run panel (see 4.2) — shows faction, modifier, mission, XP status
- Game post-run reward breakdown (see 4.3) — shows XP earned, mission progress, faction contribution, next step
- XP gain animation after ArcadeSync confirms accepted XP
- Mission progress UI update on mission completion
- Faction contribution UI after faction XP earn

All feedback must wait for server confirmation. Never show speculative XP.

### Phase 3 — Player Identity Layer

**Goal:** Every player has a visible identity they can own and build on.

- Player profile page or panel (see 4.4):
  - Arcade XP, Block Topia access state, faction, faction rank, game mastery
  - Telegram link status, Daily Mission streak
- Faction crew dashboard (see 4.5):
  - Per-faction identity, playstyle, active bonus, mission progress, war contribution
- Faction splash screen on join
- Rank-up animation on faction rank promotion

### Phase 4 — Battle Chamber Proof Wall

**Goal:** The Battle Chamber becomes the place where work is witnessed.

- Live activity feed with real-time run pulse
- Leaderboard with faction badges visible
- Faction movement delta display
- Daily Mission community pulse
- Season pressure indicator (even if season = all-time for now)
- Recent unlocks feed (Block Topia access earned)
- Block Topia access progress

### Phase 5 — Wiki-to-Action Layer

**Goal:** The wiki is not passive. Every article can pull a player into action.

- Add "Enter the System" CTA block to eligible lore and wiki articles
- CTA block contains: play related game / join faction / complete mission / unlock layer / read next
- Gate CTA content behind page category and faction relevance
- Update article template (`_article-template.html`) to include CTA block placeholder

### Phase 6 — Block Topia Expansion

**Goal:** Build from the clean 2-player isometric base following the safe-phase order.

Follow the phased order documented in `docs/block-topia/CURRENT_RUNTIME_TRUTH.md`:

1. Persistence lite — player names, last-known positions, 60-second warm-slot reconnect
2. Map expansion — more players, basic district boundaries server-side
3. NPC lite — single deterministic ambient NPC type, server-ticked
4. Events / Signal Rush lite — single server-broadcast timed event
5. Economy scaffolding — XP grant on event completion, cosmetic unlock table

Each sub-phase requires its own documented design decision before merging to main.
Do not skip phases. Do not reintroduce removed systems without a deliberate ADR.

### Phase 7 — AAAA World Layer

**Goal:** Ecosystem-scale culture engine.

All AAAA systems listed in Part 6.
Each system requires its own documented phase decision before implementation begins.
No AAAA system may be described as live until it ships and this document is updated.

---

## Part 9 — Anti-Drift Rules

**These rules apply to all future agents, contributors, and PRs.**

### 9.1 — Identity Rules

1. Never describe Crypto Moonboys as only an arcade.
2. Never remove or downgrade the wiki identity.
3. Never add systems that conflict with the street-to-digital OG philosophy.

### 9.2 — Accuracy Rules

4. Never describe FUTURE or COMING NEXT systems as live.
5. Never write XP as money, passive income, or a reward promise.
6. Never write NFTs as guaranteed profit or fake passive yield — frame them as artefacts, identity markers, access points, ownership signals.
7. Never write future Block Topia gameplay as live — live now means the 2-player clean isometric map base only.

### 9.3 — Game Integration Rules

8. Every new game must connect to:
   - Score submission → leaderboard
   - Arcade XP sync via ArcadeSync
   - Leaderboard display
   - Faction gameplay effects (where the game design supports it)
   - Daily Mission compatibility tags (where the game design supports it)
   - Cross-Game Modifier compatibility tags (where the game design supports it)
   - Battle Chamber activity (where relevant)

9. No game may be added to the arcade nav without: submitScore() wired, ArcadeSync wired, and faction effects documented (supported or explicitly marked N/A).

### 9.4 — Page Rules

10. Every new page must reinforce or connect to the core route:
    `Read → Play → Earn XP → Link → Battle Chamber → Block Topia → Build`

11. Every new page must have a clear role in the system. Ask: what does this page ask the player to do next?

### 9.5 — Block Topia Rules

12. Block Topia must be described accurately at all times:
    - LIVE NOW = Block Topia Live City — gated 2-player Colyseus survival/mission prototype with NPCs, attacks, HP, respawns, timed world phases (FREE_ROAM/WARNING/EVENT_ACTIVE/RECOVERY/MISSION_COMPLETE), extraction, and upgrade windows.
    - GATE = Telegram linked + 50 Arcade XP (server-enforced)
    - /games/block-topia-quest-maze/ = separate Quest Maze arcade/RPG score game
    - City Block Topia / Neon Sprawl = planned separate deeper living-wiki layer, not the current live runtime

13. Do not reintroduce systems listed as removed in `docs/block-topia/CURRENT_RUNTIME_TRUTH.md` without a new deliberate ADR.

14. Do not raise maxClients without a design decision and server load plan.

### 9.6 — XP Rules

15. XP must be framed only as proof of action — not money, not passive income, not a reward promise.
16. Arcade XP = server-backed, Telegram-gated, anti-farm-controlled.
17. Faction XP = server-backed alignment tracking, separate from Arcade XP.
18. Block Topia XP = in-game progression within Block Topia only, separate from all others.
19. Score = leaderboard rank only, does not affect any XP type.

---

## Part 10 — Player Journey Map

```
                    ┌──────────────────────────────────────┐
                    │         CRYPTO MOONBOYS WIKI          │
                    │   Knowledge / Memory / Lore Layer     │
                    └───────────────┬──────────────────────┘
                                    │
                                    ▼ Read
                    ┌──────────────────────────────────────┐
                    │            ARCADE LAYER               │
                    │     Action / Entry / Proof Layer      │
                    │  8 active games → score submission    │
                    └───────────────┬──────────────────────┘
                                    │
                                    ▼ Play
                    ┌──────────────────────────────────────┐
                    │           ARCADE XP LOOP              │
                    │  Run → ArcadeSync → Server XP grant   │
                    │  Requires Telegram link to persist    │
                    └───────────┬──────────┬───────────────┘
                                │          │
                    ┌───────────▼──┐   ┌───▼─────────────┐
                    │  LEADERBOARD │   │   FACTION LAYER  │
                    │  Score rank  │   │ Diamond Hands    │
                    │  (no XP)     │   │ HODL Warriors    │
                    └──────────────┘   │ GraffPUNKS       │
                                       │ Gameplay effects │
                                       └───────┬──────────┘
                                               │
                                               ▼ Belong
                    ┌──────────────────────────────────────┐
                    │          BATTLE CHAMBER               │
                    │    Public Proof / Activity Wall       │
                    │  Live runs · faction movement · rank  │
                    └───────────────┬──────────────────────┘
                                    │
                                    ▼ Prove
                    ┌──────────────────────────────────────┐
                    │           BLOCK TOPIA GATE            │
                    │  Telegram linked + 50 Arcade XP       │
                    └───────────────┬──────────────────────┘
                                    │
                                    ▼ Unlock
                    ┌──────────────────────────────────────┐
                    │            BLOCK TOPIA                │
                    │    2-player isometric map (LIVE)      │
                    │    Deeper world layers (FUTURE)       │
                    └───────────────┬──────────────────────┘
                                    │
                                    ▼ Build (FUTURE)
                    ┌──────────────────────────────────────┐
                    │          CREATOR LAYER (FUTURE)       │
                    │  Mission tools · community extensions │
                    │  NFT-aware identity · HODL Wars       │
                    └──────────────────────────────────────┘
```

---

## Part 11 — Faction Role Table

| Faction | Identity | Playstyle | Active Bonus Signal | Crew Logic |
|---|---|---|---|---|
| Diamond Hands | Survivors. Hold no matter what. | Defensive, endurance-based | Resistance / damage reduction effects | The crew that never folds |
| HODL Warriors | Believers. In it for the long game. | Accumulation, milestone-driven | XP multiplier / accumulation effects | The crew that stacks proof |
| GraffPUNKS | Disruptors. Make noise. Leave marks. | Aggressive, speed / chaos-driven | Speed / aggression / score spike effects | The crew that marks the wall |

Each faction's active bonus is determined by the Cross-Game Modifier system and faction-effect-system.js.
The faction table above is identity framing, not a live bonus specification — check faction-effect-system.js for current wired effects per game.

---

## Part 12 — Page-by-Page Upgrade Plan

| Page | Current State | Phase 1 Target | Phase 2+ Target |
|---|---|---|---|
| `/index.html` | Site home / wiki entry | Add player journey overlay, prominent CTA to arcade and Telegram link | Full journey status panel |
| `/games/index.html` | Arcade game grid | Add faction badge, XP status, pre-run context per game | Pre-run panel per game tile |
| `/battle-chamber.html` | Activity feed + faction data | Faction movement delta, recent unlocks, clearer live pulse | Full proof wall (Phase 4) |
| `/block-topia.html` | Block Topia landing / gate page | Clearer gate explainer: Telegram + 50 XP, what you get on entry | Journey from wiki to Block Topia |
| `/categories/*.html` | Category hub pages | Add "Enter the System" CTA blocks | Faction-tagged article discovery |
| `/wiki/*.html` | Article pages | Add footer "Enter the System" CTA block | Lore-to-quest links (Phase 5) |
| `/search.html` | Wiki search hub | Add "Start your journey" onboarding state for new visitors | Faction-aware search surface |
| `/community.html` | Community page | Link to Battle Chamber and faction dashboards | Faction crew dashboard integration |
| Faction pages (if separate) | Faction info | Full faction crew dashboard (see 4.5) | War contribution, season standing |

---

## Part 13 — Game-by-Game Upgrade Template

Use this template when upgrading each arcade game to AAA standard.

```
Game: [name]
Folder: games/[folder]/

LIVE NOW:
- submitScore(): [yes/no]
- ArcadeSync: [yes/no]
- Faction effects: [yes/no — which effects]
- Cross-Game Modifier tags: [list]
- Daily Mission compatibility: [yes/no]

PHASE 2 TARGETS:
- Pre-run panel: [planned/not started]
- Post-run reward breakdown: [planned/not started]
- Modifier activation effect: [planned/not started]

PHASE 3 TARGETS:
- Mastery level tracking: [planned/not started]
- Faction crew contribution display: [planned/not started]

NOTES:
[Any game-specific identity notes — how this game fits the OG philosophy]
```

### Applied: Invaders 3008

```
Game: Invaders 3008
Folder: games/invaders-3008/

LIVE NOW:
- submitScore(): yes
- ArcadeSync: yes
- Faction effects: yes (wired)
- Cross-Game Modifier tags: yes
- Daily Mission compatibility: yes (local only)
- Meta-layer: run summary, intensity feedback, roguelite upgrades

PHASE 2 TARGETS:
- Pre-run panel: planned
- Post-run reward breakdown: planned (extends existing run-summary screen)
- Modifier activation effect: planned

NOTES:
Invaders 3008 is the flagship action game. It has the deepest current meta-layer.
The post-run breakdown should extend the existing run-summary screen, not replace it.
```

---

## Part 14 — Next PR Recommendations

The following PRs should be opened in order, each grounded in this roadmap.

| PR # | Title | Phase | Scope |
|---|---|---|---|
| 1 | Phase 1: Player Journey Overlay — Site Home + Arcade Index | Phase 1 | Add route overlay to index.html and games/index.html |
| 2 | Phase 1: Wiki Article CTA Block Template | Phase 1 | Add "Enter the System" CTA block to _article-template.html and eligible articles |
| 3 | Phase 1: Block Topia Landing Clarity | Phase 1 | Update block-topia.html — clear gate explainer, route from wiki to entry |
| 4 | Phase 2: Game Post-Run Reward Breakdown | Phase 2 | Post-run overlay showing XP, mission, faction contribution, next step |
| 5 | Phase 2: Game Pre-Run Panel | Phase 2 | Pre-run overlay showing faction, modifier, mission, best score |
| 6 | Phase 3: Player Profile Panel | Phase 3 | Profile page or panel: XP, faction rank, mastery, mission streak, BT access |
| 7 | Phase 3: Faction Crew Dashboard | Phase 3 | Per-faction identity and standing view |
| 8 | Phase 4: Battle Chamber Proof Wall Upgrade | Phase 4 | Live pulse, faction delta, recent unlocks, mission pulse, season pressure |
| 9 | Phase 5: Wiki-to-Action CTA Rollout | Phase 5 | Add CTA blocks to all eligible wiki/lore articles |
| 10 | Phase 6 ADR: Block Topia Persistence Lite | Phase 6 | Design decision doc before any Block Topia gameplay expansion |

Each PR must:
1. Reference this roadmap document in its description
2. Update the Live vs Future table in Part 7 if a system ships
3. Not describe future systems as live
4. Pass the anti-drift-check.mjs CI check

---

## Appendix — Key Files Reference

| Purpose | File |
|---|---|
| Current live system truth | `docs/current-live-system-truth.md` |
| Block Topia runtime truth | `docs/block-topia/CURRENT_RUNTIME_TRUTH.md` |
| Arcade XP sync path | `docs/arcade-xp-sync-path.md` |
| Block Topia XP gate (server config) | `workers/moonboys-api/blocktopia/config.js` |
| Block Topia XP gate (shared default) | `shared/block-topia/constants.js` |
| Faction effect system | `js/arcade/systems/faction-effect-system.js` |
| Cross-game modifier system | `js/arcade/systems/cross-game-modifier-system.js` |
| Daily missions (local) | `js/arcade/systems/faction-missions.js` |
| Faction war (local) | `js/arcade/systems/faction-war-system.js` |
| Score submission | `js/leaderboard-client.js` |
| Arcade XP sync client | `js/arcade-sync.js` |
| Faction API client | `js/faction-alignment.js` |
| MOONBOYS_STATE singleton | `js/core/moonboys-state.js` |
| Global event bus | `js/arcade/core/global-event-bus.js` |
| Agent enforcement rules | `AGENT_ENFORCEMENT.md` |
| Anti-drift check script | `scripts/anti-drift-check.mjs` |
| Article template | `_article-template.html` |

---

*This document is the authoritative AAA → AAAA upgrade roadmap for Crypto Moonboys.*
*It must travel with the codebase. Update it when phases ship. Never let it drift from the OG build identity.*
