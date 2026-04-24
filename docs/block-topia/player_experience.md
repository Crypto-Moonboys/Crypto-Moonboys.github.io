# Block Topia — Player Experience Reference

This document describes the complete player-facing experience for Block Topia: Street Signal 3008. It covers controls, HUD panels, game systems, and survival strategy. It is the definitive reference for new and experienced players.

---

## Controls

| Input | Action |
|---|---|
| `W` / `A` / `S` / `D` or arrow keys | Move character |
| Left-click | Select tile, select remote player, or interact with node/NPC in range |
| Double left-click | Move toward clicked valid tile |
| `E` | Interact with nearby NPC |
| `F` | Challenge selected remote player to a duel |
| `[` | Zoom out (preset step) |
| `]` | Zoom in (preset step) |
| Mouse wheel | Smooth zoom in/out |
| Left mouse button hold + drag | Camera pan |
| `` ` `` (backtick) | Toggle debug panel (developer use only) |

---

## HUD Layout

Block Topia uses an overlay HUD split across several persistent elements.

### Operator HUD (top bar)

Displays the player's core runtime state:

- **Player name** — your synced Telegram identity or session alias
- **XP** — current XP balance; this is your survival fuel, not a static score
- **Gems** — current gem balance; used for upgrades and deeper RPG paths
- **Drain** — how fast XP is being consumed per minute while active in the world
- **Level / title** — current level and operative title (e.g. `L1 · Signal Runner`)
- **District** — which of the five districts you are currently in

### World HUD (secondary bar)

Displays live world and connection state:

- **World status** — city initialization and runtime messages
- **AI status** — SAM AI configuration state
- **Phase** — current world time phase (Day / Night / Crisis)
- **SAM** — current SAM phase number
- **Watch** — covert surveillance level (`LOW` / `MEDIUM` / `HIGH` / `CRITICAL`)
- **Factions** — which factions are currently contesting the city
- **Multiplayer status** — connection state (Connecting / Connected / Disconnected)
- **Room** — room identifier (e.g. `city`)
- **Population** — current players in this room (max 100)

### Covert Grid (strip panel)

A persistent strip showing your live covert network state with four cells:

| Cell | What It Shows |
|---|---|
| **Network Heat** | World-level covert heat percentage. Higher = greater detection risk for all operatives. |
| **Local Node** | Pressure state of your currently selected or nearest hot node. |
| **District Mood** | Current pressure posture of your district (`Calm` / `Watched` / `Pressured` / `Pre-lockdown`). |
| **Agent Pressure** | Number of your operatives currently under active SAM scrutiny. |

A recovery line beneath the cells shows if any captured agents are available for rescue.

### Feed Streams (three panels)

Three scroll-feed panels receive live game events:

- **Left stream (Engagement)** — duel outcomes, player interactions, node interference results
- **Right stream (Signal Operations)** — covert ops results, SAM events, quest completions, district capture notices
- **Bottom stream (City Relay)** — system messages, connection events, world transitions

---

## Covert Ops — Signal Runner

The Covert Ops panel enables you to deploy a **Signal Runner** operative to interfere with a control node from the shadows. This is a server-authoritative mission: the server resolves success or failure; the client shows the result.

### How to deploy

1. **Select a node** — click a control node on the map. The node ID appears in the covert panel header as `Target: [NODEID]`.
2. **Click "Deploy Signal Runner → [NODEID]"** — the button is only active when a node is selected and no mission is already running.
3. **Wait for resolution** — the countdown timer shows remaining mission time (~30 seconds). The button is disabled until the mission resolves.
4. **Read the result** — the panel updates with `✅ Last op: Success` or `❌ Last op: Failure`. Feed messages in the right stream give full detail.

### Mission resolution

The server computes the result using:

- **Base success chance: 65%**
- **Penalty: SAM pressure** — higher SAM pressure reduces your success chance
- **Penalty: district posture** — a `pre_lockdown` district further reduces odds
- **Operative loss: 25% chance on failure** — if the operative is lost, a `🚨 Signal Runner lost.` feed message appears in addition to the failure notice

### Player heat

Heat is a per-player counter tracked exclusively by the server. You cannot reduce heat from the client.

| Heat level | Threshold | Effect |
|---|---|---|
| Cold | 0 – 24 | Normal operations |
| Warm | 25 – 49 | SAM awareness begins rising |
| Hot | 50 – 74 | Detection risk elevated; visual warning applied |
| Critical | 75 – 100 | Maximum risk; operations are heavily penalised |

Heat gains:
- `+8` on a **successful** mission
- `+16` on a **failed** mission

Heat decays at **1 unit per second** server-side. You must wait it out; there is no shortcut.

### Visual feedback

The viewport background and vignette shift in response to heat. At high heat levels, a red edge glow and scan-line overlay appear. These are read-only feedback; they do not affect mission mechanics.

Body CSS classes applied by heat level:
- `.covert-heat-warm` — heat ≥ 25
- `.covert-heat-hot` — heat ≥ 50
- `.covert-heat-critical` — heat ≥ 75
- `.covert-under-watch` — SAM sensitivity ≥ 40 or heat ≥ 45
- `.covert-counter-actions-live` — one or more counter-actions are currently active world-wide

---

## District System

The city is divided into five districts. District state is server-authoritative.

| Posture | Description |
|---|---|
| `calm` | Low pressure. Standard operation costs and risks. |
| `watched` | SAM has elevated awareness here. Covert success rates are slightly reduced. |
| `pressured` | Active NPC and SAM pressure on this district. Higher failure penalties. |
| `pre_lockdown` | Near-capture state. Operations are significantly harder. Leave or commit fully. |

District control shifts based on node interference outcomes, NPC faction momentum, and SAM pressure events. Capturing a district boosts your operational efficiency; losing one to hostile control increases world drain.

---

## SAM Threat System

SAM is the hostile systemic AI. It cycles through phases that progressively tighten pressure on the whole city.

- Phase 1–3: Surveillance increasing; minor effect on covert outcomes
- Phase 4–6: Active interference; district posture worsens; counter-actions deploy
- Phase 7+: Maximum threat; multiple districts under lockdown posture

SAM events (phase changes, spawns, and chase sequences) are broadcast via the right stream and as full-screen pop-up overlays. These are world events, not personal events.

---

## Duels

Any visible remote player can be challenged to a duel.

1. **Click on a remote player** to select them
2. Press `F` to send a challenge
3. The other player can accept; the duel resolves server-side with rock/paper/scissors style actions
4. XP and outcome effects are applied by the server on resolution

---

## Survival Tips

- **Enter with XP buffer.** The world drains XP continuously. Arrive with a cushion, not the minimum floor.
- **Respond to pressure events early.** Compounding chain events cost far more than addressing them at first appearance.
- **Keep heat low before deploying.** A critical heat state means your Signal Runner will likely fail. Wait for it to decay below 25 before launching high-value operations.
- **District posture matters.** If your district is `pre_lockdown`, avoid deploying until posture improves or move to a calmer district first.
- **Watch the Network Heat cell** in the Covert Grid strip. High world-level heat means other players are generating risk across the network — adjust your cadence accordingly.
- **Stay linked.** A red sync state means progression is local-only. Relink via `/gklink` before long sessions.
- **One Signal Runner at a time.** You can only have one active operative mission running at once. Resolve or lose it before the next deploy.
