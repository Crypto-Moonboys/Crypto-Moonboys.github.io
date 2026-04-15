# Block Topia Multiplayer Architecture

This document locks the multiplayer architecture for Block Topia so the project grows into a real room-based social game instead of collapsing into ad-hoc client logic.

## Core rule
The browser is never the source of truth.

The server owns:
- room membership
- player positions
- NPC positions and faction state
- district control
- quest completion validation
- SAM event state
- anti-cheat checks

The client owns:
- rendering
- local input capture
- interpolation and camera feel
- UI panels, effects, and sound

## Deployment split
- GitHub Pages: static frontend only
- Contabo VPS: multiplayer server, API, room manager, persistence workers
- Cloudflare: DNS, SSL, proxy, caching, WebSocket pass-through

## Room model
Block Topia scales through many parallel rooms instead of one giant room.

### Locked room rules
- one world = max 100 live players
- target world size = 60 to 100 players before opening a fresh room
- auto-join first healthy room under cap
- create new room when all active rooms are full
- reserve special rooms for events, moderation, and testing

## Server stack
### Recommended stack
- Node.js
- Colyseus for room orchestration
- WebSocket transport
- Redis for transient presence and pub/sub
- Postgres for persistent player and world data

### Why this stack
- Colyseus is well-suited for room-based realtime multiplayer
- Redis helps coordinate state across multiple processes later
- Postgres is strong for durable game data, logs, quests, inventory, and analytics

## Server modules
Recommended backend folder layout:

```txt
server/block-topia/
  src/
    index.js
    config/
    rooms/
      CityRoom.js
      EventRoom.js
    state/
      RoomState.js
      PlayerState.js
      NPCState.js
      DistrictState.js
      SAMState.js
    systems/
      player-system.js
      npc-system.js
      district-system.js
      quest-system.js
      signal-rush-system.js
      sam-system.js
    services/
      room-service.js
      matchmaker-service.js
      persistence-service.js
      moderation-service.js
    adapters/
      redis.js
      postgres.js
      sam-webhook.js
```

## Client networking model
The client should send lightweight intent messages, not direct state.

### Allowed client intents
- move_start
- move_stop
- interact
- party_pulse
- chat_send
- emote
- join_room
- reconnect

### Server-authoritative responses
- player_state_snapshot
- delta_state_update
- quest_completed
- district_changed
- signal_rush_started
- signal_rush_progress
- sam_spawned
- sam_phase_changed
- moderation_notice

## Update rates
Do not over-sync everything.

### Suggested cadence
- input send: 10 to 20 per second max
- player state broadcast: 10 per second
- NPC state broadcast: 2 to 5 per second depending on relevance
- district state: event-driven
- quest state: event-driven
- SAM state: event-driven plus low-rate positional updates during live chase

## Interest management
Players should not receive the whole room state at full fidelity all the time.

### Rules
- nearby players = full updates
- mid-range players = reduced update frequency
- far-away players = presence only or hidden entirely
- ambient NPCs = low frequency or local simulation hints
- quest markers = only when relevant to the player or current district

## Persistence model
### Postgres should persist
- player profile
- XP and progression
- cosmetics inventory
- quest history
- room history summaries
- district outcomes
- SAM cycle milestones
- moderation flags

### Redis should persist briefly
- room occupancy
- ephemeral room state backups
- active event timers
- websocket session mappings

## Reconnect model
Players will disconnect. The system must be forgiving.

### Rules
- keep player slot warm for 60 seconds after disconnect
- rejoin last room when possible
- restore last known position if room still exists
- if room closed, place player in nearest healthy replacement room

## Anti-cheat baseline
This game does not need heavyweight anti-cheat first, but it does need sane rules.

### Enforce server-side
- movement speed caps
- room cap and duplicate session checks
- interaction distance checks
- quest completion validation
- event reward winner ordering
- cooldown checks for repeated actions

## SAM webhook integration
SAM should be able to push live world events into the multiplayer layer.

### Webhook responsibilities
- receive wiki update payloads
- map update type to a district, NPC, or rush event
- broadcast Signal Rush notices to live rooms
- optionally start chain events for larger lore drops

### Example flow
1. SAM updates wiki
2. backend webhook receives payload
3. signal-rush-system creates live event
4. eligible rooms receive popup and objective
5. first verified winners are recorded
6. results are persisted and echoed to the event log

## Room state categories
### Hot state
Changes constantly and stays in memory.
- positions
- movement vectors
- current interactions
- live NPC step state
- active SAM event state

### Warm state
Changes regularly but not every frame.
- district ownership
- room feed messages
- temporary modifiers
- active quests

### Cold state
Saved and restored.
- profile progress
- unlocked cosmetics
- completed milestones
- season history

## MVP build order
1. CityRoom with player join/leave
2. server-authoritative movement
3. player snapshots and interpolation
4. NPC state sync
5. district enter detection on server
6. quest validation on server
7. Signal Rush server events
8. SAM spawn/chase event
9. reconnect handling
10. persistence and analytics

## Hard no-go rules
- do not put multiplayer authority in client JS
- do not let quest completion be client-trusted
- do not tie room state to GitHub Pages
- do not rebuild giant HTML files with embedded netcode

## Exit condition for this phase
This architecture phase is complete when:
- a CityRoom exists
- two browser clients can join the same room
- positions sync correctly
- district entry is server-validated
- one Signal Rush event can be triggered and completed
- one SAM event can be broadcast to all players in the room
