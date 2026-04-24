# Block Topia — Player Experience

This document is the authoritative spec for how new and returning players experience Block Topia.
All UX decisions, overlay copy, feed language, and empty-state text are derived from this document.

---

## 1. First-time player flow

A new player arrives after completing Telegram sync (`/gklink`). The goal is that they understand the
system and take their first action within 30 seconds, without any external documentation.

### First-time overlay

Shown automatically on first visit using localStorage key: `blocktopia_player_experience_seen`.

**Title:** Welcome to Block Topia

**Intro text:**
Block Topia is a live city. The world keeps moving whether you act or not.

**Steps shown:**
1. Move around the map.
2. Select glowing nodes.
3. Deploy Signal Runner to shift node control.
4. Watch your Heat.
5. High Heat means SAM is watching.
6. Duels, NPCs, and events can change the city.

**Buttons:**
- "Start Playing" → closes overlay and saves localStorage key (overlay never auto-shows again).
- A persistent "?" button elsewhere in the UI reopens the overlay at any time without modifying localStorage.

---

## 2. Core gameplay loop

```
MOVE → SELECT NODE → DEPLOY → WAIT → READ RESULT
  ↑                                       |
  └───────────────────────────────────────┘
                 repeat
```

1. **Move** — WASD / arrow keys, or double-click a tile to path there.
2. **Select a node** — click any glowing control node on the canvas.
3. **Deploy Signal Runner** — press "Deploy Signal Runner → [NODE]" in the bottom-right panel.
4. **Wait ~30 seconds** — a countdown shows in the panel. The server resolves the mission.
5. **Read the result** — success shifts node control; failure raises heat.
6. **Respond to events** — 🚨 alerts trigger when pressure thresholds are crossed. Address them.

---

## 3. Node interaction meaning

Control nodes are contested signal relay points in the city grid. Each belongs to a district.

**Clicking a node:**
- Selects it. Node ID is captured for the Signal Runner panel (bottom-right).
- If a mini-game is active (Outbreak, Firewall, Router, Circuit), targets that mini-game.
- If no mini-game is active, sends a node interference pulse to the server.

**Node states visible to players:**

| State | Meaning |
|---|---|
| Glowing (cyan) | Normal, interactable |
| Cooldown warning | Interference on cooldown — shows seconds remaining |
| Hot (Covert Grid) | Node has elevated risk score |
| Hunter scan (Covert Grid) | SAM hunter sweeping this node's zone |

**Node tooltip (shown on selection):**
- Node ID
- District
- Control %
- Node Heat
- Status
- Available action
- Fixed line: "High heat means SAM is watching this node."

**When no node is selected:** "Select a glowing node to deploy Signal Runner."

---

## 4. Covert Ops / Signal Runner

The Signal Runner is a covert operative deployed to a single node at a time.

- One mission runs at a time.
- Server-authoritative: the server computes success.
- Base success chance: 65%. District posture and SAM pressure reduce this.
- Explanation line shown in panel: "Deploy Signal Runner to shift node control. More Heat means higher risk."

**Feed messages:**
- Deploy: "Signal Runner deployed to [NODE]. Mission resolving."
- Success: "Signal Runner succeeded at [NODE]. Node control shifted. Heat +X."
- Failure: "Signal Runner failed at [NODE]. Heat +X."
- Operative lost: "Signal Runner lost."

---

## 5. Heat and SAM pressure

**Heat** is a per-player server counter representing SAM exposure.

| Tier | Range | Effect |
|---|---|---|
| Cold | 0–24 | Safe. Best time to deploy. |
| Warm | 25–49 | SAM awareness rising. |
| Hot | 50–74 | Detection risk elevated. Visual vignette activates. |
| Critical | 75–100 | Operations heavily penalised. |

Heat gains: +8 on success, +16 on failure. Decays at 1/s server-side.

**SAM** (Systemic Adversarial Machine) is the hostile AI driving city pressure.
- Advances through phases 1–7+. Higher phase = more aggression.
- Spawns hunter patrols that sweep nodes and raise detection risk.
- Triggers world events (Firewall, Outbreak, Signal Router, Circuit Breach) at pressure thresholds.
- District posture escalates: normal → watched → pressured → pre-lockdown.

**Managing pressure:**
- Keep heat low. High-heat players attract more SAM scrutiny.
- Respond to 🚨 alerts — unaddressed events escalate SAM phase.
- Watch the Covert Grid strip for SAM watch-line and district mood.

---

## 6. What the player should do next

At any moment, follow this priority order:

1. **Respond to an alert** — If 🚨 appears (mini-game), address it. Ignoring it costs XP and escalates SAM phase.
2. **Check heat** — If heat is above 50, wait. Heat decays 1/s. A 30s wait can bring Hot → Warm.
3. **Check district posture** — If District Mood shows PRESSURED or PRE LOCKDOWN, move to a calmer district or wait.
4. **Deploy Signal Runner** — Click a glowing node. Press "Deploy Signal Runner → [NODE]". Wait for resolution.
5. **Explore** — Move between districts. Talk to NPCs (press E). Monitor XP and drain.

---

## 7. Non-drift UX rules

These rules prevent scope creep and keep the player-understanding layer clean:

- No server files may be changed to implement UX from this spec.
- No mechanics may be added or changed. All changes are display-only.
- The FTUE overlay is controlled solely by `localStorage.getItem('blocktopia_player_experience_seen')`.
- Feed messages must be deduplicated using `pushFeedDeduped`.
- Node tooltip must update on selection; it must not fire a feed message on every click.
- Connection state guidance ("Connecting to live city…" / "Live city unavailable. Try again later.") appears in feed and as empty-state text only — no new panels.
- "?" help button opens the overlay without modifying localStorage.
