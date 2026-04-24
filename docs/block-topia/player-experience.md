# Block Topia — Player Experience Spec

This document defines the intended player experience for Block Topia: Street Signal 3008.
It is the authoritative reference for all UX, onboarding, and guidance decisions.

---

## 1. First-Time Player Flow

A new player arrives having completed Telegram sync (`/gklink`).
They must be able to understand and start playing within 30 seconds without external help.

### Required understanding at entry

| In under... | Player should know |
|---|---|
| 5 seconds | The world is a city map. They control a character. |
| 15 seconds | Click a glowing node to select it. A panel appears (bottom-right). |
| 30 seconds | Press "Deploy Signal Runner" to send a covert operative. Wait ~30s for the result. |

### Entry gate (already implemented)

- Telegram auth is required before the page loads; unauthenticated players are redirected.
- The entry identity banner (`#entry-identity`) appears on load and auto-dismisses after 7 seconds.

### First-time guide overlay (FTUE)

A one-time overlay is shown on first visit (localStorage key: `bt_ftue_v1`).
It is dismissed by a single button click and never shown again.

The overlay must cover:

1. **Move** — WASD or arrow keys move the player.
2. **Select a node** — click any glowing node on the map.
3. **Deploy Signal Runner** — press the button in the bottom-right panel to send a covert operative.
4. **Read the result** — the server resolves in ~30 seconds; success shifts node control, failure raises heat.

Plus two short warnings:
- High heat lowers success odds. Heat decays automatically over time.
- Respond to 🚨 alerts — these are world pressure events that cost XP if ignored.

---

## 2. Core Gameplay Loop

```
MOVE → SELECT NODE → DEPLOY → WAIT → READ RESULT
  ↑                                        |
  └────────────────────────────────────────┘
                 repeat
```

Each cycle:

1. **Move** — navigate the isometric city with WASD / arrow keys, or double-click a tile to path there.
2. **Select a node** — click a glowing control node. Its ID appears in the Covert Ops panel (bottom-right). The node's current pressure state is shown in the Covert Grid strip (top-left).
3. **Deploy Signal Runner** — click "Deploy Signal Runner → [NODE]". Only available when a node is selected and no mission is in progress. The button is disabled during an active mission.
4. **Wait ~30 seconds** — a countdown shows in the Covert Ops panel. The server resolves the mission.
5. **Read the result** — the panel updates:
   - `✅ Last op: Success` — node control shifted in your favour; heat gained +8.
   - `❌ Last op: Failure` — node not shifted; heat gained +16. If "Signal Runner lost" appears, the operative was captured (25% chance on failure).
6. **Respond to events** — 🚨 alerts appear when pressure thresholds trigger mini-games (Firewall, Outbreak, Signal Router, Circuit Breach). Respond before XP drain escalates.

---

## 3. Covert Ops Explanation (Signal Runner + Heat)

### Signal Runner

The Signal Runner is a covert operative. It is the primary tool for shifting node control from the shadows.

- Only **one mission can run at a time**.
- The mission is **server-authoritative** — the server computes success, not the client.
- Base success chance is **65%**. District posture and SAM pressure reduce this.

### Heat

Heat is a per-player counter on the server. It represents how exposed you are to SAM detection.

| Tier | Range | Meaning |
|---|---|---|
| Cold | 0–24 | Safe. Best time to deploy. |
| Warm | 25–49 | SAM awareness rising. Consider waiting. |
| Hot | 50–74 | Detection risk elevated. Visual vignette activates. |
| Critical | 75–100 | Maximum exposure. Operations heavily penalised. |

Heat gains:
- **+8** on a successful mission
- **+16** on a failed mission

Heat decays at **1 unit per second** server-side. You cannot speed this up. Wait before deploying when heat is high.

### Visual heat feedback

The viewport background shifts in colour and intensity as heat rises. At Critical, a red vignette and scan-line overlay cover the screen. These are display-only — they do not affect any server mechanic.

---

## 4. Node Interaction Meaning

Control nodes are the primary contested objects in the city. Each node belongs to a district.

### What a node represents

- A node is a signal relay point in the city grid.
- Nodes under faction or SAM control push district pressure higher.
- When enough nodes in a district are shifted, the district's control state changes.

### What clicking a node does

1. Selects the node — its ID is captured for the Covert Ops panel.
2. If a mini-game (Outbreak, Firewall, Router, Circuit) is active, the node is targeted for that event.
3. If no mini-game is active, a node interference action is sent to the server (visual pulse only; server authoritative).
4. The Covert Ops panel appears at bottom-right, ready to deploy a Signal Runner to that node.

### Node states visible to players

| State | Meaning |
|---|---|
| Glowing (cyan) | Normal, interactable node |
| Cooldown warning | Node interference cooldown active; shows remaining seconds |
| Hot (shown in Covert Grid) | Node has elevated risk score in the covert system |
| Hunter scan (shown in Covert Grid) | SAM hunter is sweeping this node's zone |

---

## 5. SAM Pressure Explanation

SAM (the Systemic Adversarial Machine) is the hostile AI that drives pressure across the city.

### What SAM does

- Advances through **phases** (1–7+). Higher phases = more aggression.
- Spawns **hunter patrols** that sweep nodes and raise detection risk.
- Drives **district posture** shifts (normal → watched → pressured → pre-lockdown).
- Triggers **world events** (Outbreak, Firewall, Signal Router, Circuit Breach) when pressure thresholds are crossed.

### How SAM affects the player

| SAM state | Effect on player |
|---|---|
| Phase 1–3 | Minor interference; standard play |
| Phase 4–6 | Hunter patrols deploy; Covert Ops success reduced |
| Phase 7+ | Multiple districts under pressure; world events frequent |
| Hunter patrol nearby | Covert Grid "Local Node" shows HUNTER indicator |
| District pre-lockdown | Covert ops success heavily penalised; leave or commit fully |

### How to manage SAM pressure

- Keep heat low — high-heat players attract more SAM scrutiny.
- Respond to 🚨 alerts quickly — unaddressed events escalate SAM phase.
- Watch the Covert Grid strip — the "Watch" line summarises current SAM state.
- If "pre_lockdown" appears in District Mood, relocate or wait for posture to ease.

---

## 6. Player Decision Loop (What to Do Next)

At any given moment, a player's next action should follow this priority order:

### Priority 1 — Respond to an active alert
If a 🚨 banner appears (Firewall, Outbreak, Signal Router, Circuit Breach), address it.
- These mini-games cost XP if skipped and reward XP/gems if completed.
- Ignoring them increases SAM phase and node pressure.

### Priority 2 — Check heat before deploying
If `Heat` in the Covert Ops panel is above 50, wait.
- Deploying at Hot or Critical heat heavily reduces success chance.
- Heat decays 1/s on the server. A 30-second wait can bring Hot → Warm.

### Priority 3 — Check district posture
If District Mood shows "PRESSURED" or "PRE LOCKDOWN", success odds are reduced.
- Option A: move to a calmer district and deploy there.
- Option B: wait for posture to ease (patrol pressure eventually decays).

### Priority 4 — Deploy Signal Runner
When heat is Cold or Warm and posture is calm:
1. Click a glowing node.
2. Press "Deploy Signal Runner → [NODE]" in the bottom-right panel.
3. Wait for the ~30-second resolution.

### Priority 5 — Explore and manage resources
- Move between districts to find lower-pressure zones.
- Talk to NPCs (press `E` when nearby) for lore context and minor progression hints.
- Monitor XP — if drain is high and XP is dropping, reduce active time or resolve pending events.
- Use gems for upgrades on the upgrade screen (not in this client session; linked via progression).

---

## Implementation notes (for agent use)

- **No server logic must be changed** when implementing any UX from this spec.
- **No mechanics must change** — all changes are display-only, feed message additions, or one-time overlays.
- The FTUE overlay is controlled exclusively by `localStorage.getItem('bt_ftue_v1')`.
- Feed guidance messages must be deduplicated using the existing `pushFeedDeduped` function.
- Node click guidance must not fire on every click — use a session-scoped boolean flag.
