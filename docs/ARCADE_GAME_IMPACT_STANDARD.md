# Arcade Game Impact Standard

**Version:** 1.0
**Applies to:** All active arcade games listed in `js/arcade/arcade-manifest.js`

This document defines the minimum standard every active arcade game must meet to ensure that playing any game feels connected to the faction/XP/progression system.

---

## Core Direction

```
Play Game → Use Faction Perks → Trigger In-Game Upgrades → Submit Score
         → Earn Arcade XP → Feed Missions → Feed Faction Signal → Feed Battle Chamber
```

---

## 1. Pre-Run Context Panel

Every game must show a pre-run panel before the first run begins (or on the start/reset screen). Use `js/arcade/core/run-context-panel.js`.

### Required panel content:

| Field | Notes |
|-------|-------|
| Selected Faction | Player's current faction (or "Unaligned") |
| Active faction perk description | Short one-line perk description from `FACTION_DEFS` |
| Active Cross-Game Modifier | Name and description if one is active |
| Daily Mission target | If the player has a relevant mission today |
| Best score / mastery | From ArcadeSync or mastery state if available |
| "Why this run matters" line | Context line: mission target, faction signal, or XP path |

### XP wording rules:
- ✅ "Submit score to qualify for Arcade XP."
- ✅ "Accepted runs can sync Arcade XP when Telegram is linked."
- ✅ "Faction signal updates after accepted activity."
- ❌ Never: "You earned X XP."
- ❌ Never: "Passive rewards active."

---

## 2. In-Game Faction Feedback

Every game must show in-run faction context. Minimum:

- Current faction label visible somewhere in HUD (badge or short text).
- Active perk name visible or shown on run start.
- When a faction perk fires (e.g. chaos reduction, shield bonus, survival bonus), emit feedback:
  - Visual pulse, banner, or HUD flash.
  - Emit `MOONBOYS_EVENT_BUS.emit('arcade:perk-triggered', { gameId, factionId, perkKey, ts })`.

---

## 3. Upgrade / Perk Layer

Each game needs in-run options/upgrades appropriate to its format.

### Minimum requirements:
Every active game with upgrades must have at least:
- 3 upgrade options when an upgrade moment triggers.
- At least 1 survival-category option.
- At least 1 score/combo-category option.
- At least 1 rare or chaos-category option.
- Faction upgrade bias: if the player's faction is `graffpunks`, chaos/rare options should appear more often; `hodl-warriors` should see survival options more often; `diamond-hands` should see score/endurance options more often.

### Upgrade moments (game-appropriate):
Games should offer upgrades at safe, natural moments:
- Wave cleared
- Level advance
- Score threshold reached
- Rare pickup collected
- Boss defeated
- Interval milestone (e.g. every 60 seconds alive)

### Games without canvas/physics upgrades (e.g. Crystal Quest):
Quiz-format games are exempt from the upgrade layer. Use streak bonuses, rare question events, and faction-biased scoring as the equivalent layer.

### Emit on upgrade selected:
```js
MOONBOYS_EVENT_BUS.emit('arcade:upgrade-selected', {
  gameId, factionId, upgradeId, upgradeLabel, category, ts
});
```

---

## 4. Cross-Game Modifier Integration

Every game must support compatible modifier tags where relevant. Use `getActiveModifiers(gameId, crossGameTags)` at run init. Apply supported effects:

| Effect key | Games that must apply |
|---|---|
| `scoreMult` | All games |
| `shieldedStart` | Games with shield/life system |
| `pressureRate` | Games with chaos/director pressure |
| `riskRewardMult` | Games with risk/reward choices |
| `bossDmgMult` | Games with boss encounters |
| `magnetPickups` | Games with pickups |
| `recoveryPulse` | Games with shield/health |
| `goldenSpawnBoost` | Games with rare spawns |

---

## 5. Mission Hooks

Each game must call `recordMissionProgress(factionId, eventType, value)` at the relevant moments. Minimum events to report:

| Event type | When to fire |
|---|---|
| `runs` | On run complete (any result) |
| `score` | On run complete, value = final score |
| `survive` | On run complete, value = seconds alive |
| `combo` | When combo multiplier milestone reached |
| `chaos` | When a chaos event is triggered |
| `war_contrib` | After contribution is recorded |

Additional events where supported:
- `no_shield` — if player completed run without ever using shield
- `bank_score` — if player banked a score after surviving > 45 s
- `shield_time` — seconds player kept shield intact
- `high_risk` — score earned during high-risk rotation window
- `rare_pickup` — rare or golden pickup collected
- `boss_defeated` — boss cleared

---

## 6. Faction Contribution Hook

After a run with an accepted score (any positive score submitted), call:

```js
recordContribution(factionId, contributionAmount);
recordWarContribution(factionId, contributionAmount);
checkRankUp(factionId);
emitFactionGain(factionId, contributionAmount);
```

Contribution amount = `Math.max(1, Math.floor(score / 100))` — game-appropriate scale.

Emit:
```js
MOONBOYS_EVENT_BUS.emit('arcade:faction-signal', {
  gameId, factionId, amount: contributionAmount, ts
});
```

---

## 7. Post-Run Breakdown

Every game-over screen must show a breakdown. Use `js/arcade/core/run-summary-panel.js` or equivalent built-in game-over modal.

### Required fields:

| Field | Notes |
|-------|-------|
| Score | Final run score |
| Accepted / pending status | "Submitted to leaderboard" or "Link Telegram to sync" |
| Arcade XP path explanation | Use approved wording only (see §1) |
| Mission progress | Which missions advanced this run |
| Faction contribution | Estimated contribution (not confirmed XP) |
| Active modifier impact | If a modifier was active, show its effect |
| Next action buttons | Play Again, View Leaderboard, Battle Chamber, Link Telegram (if unlinked) |

### Wording:
- ✅ "Faction signal updated — run contributed."
- ✅ "Submit score to qualify for Arcade XP."
- ✅ "Link Telegram to sync Arcade XP from accepted runs."
- ❌ Never claim XP was awarded until accepted by the server.

---

## 8. Battle Chamber / Live Activity Integration

When faction perks or upgrades fire, emit events so Battle Chamber and Live Activity Summary can surface them:

```js
MOONBOYS_EVENT_BUS.emit('arcade:perk-triggered', { gameId, factionId, perkKey, ts });
MOONBOYS_EVENT_BUS.emit('arcade:upgrade-selected', { gameId, factionId, upgradeId, upgradeLabel, category, ts });
MOONBOYS_EVENT_BUS.emit('arcade:mission-progress', { gameId, factionId, missionId, progress, target, ts });
MOONBOYS_EVENT_BUS.emit('arcade:faction-signal', { gameId, factionId, amount, ts });
```

If `window.MOONBOYS_LAS_ADD_EVENT` exists (Live Activity Summary local entries), games may add entries like:
- `"GraffPUNKS chaos perk triggered"` (type: `arcade`)
- `"HODL Warriors shield perk saved a run"` (type: `arcade`)
- `"Diamond Hands survival bonus active"` (type: `arcade`)

---

## 9. Faction Perk Design Standard

Faction perks must be implemented using shared helpers from `faction-effect-system.js`. Games must not hardcode faction names or perk values directly.

### Faction identities:

#### Diamond Hands
- Theme: Endurance, patience, survival, late-game scaling.
- Perk behaviour: reduced chaos pressure (−20%), survival score bonus after 30 s (+12%), no shieldBonus.
- Upgrade bias: favour score/endurance upgrade options.
- Best for: players who survive long and play clean.

#### HODL Warriors
- Theme: Defense, shields, protection, recovery.
- Perk behaviour: +1 starting shield where supported (shieldBonus: 1), slight combo bias (+5%), 15% chaos reduction.
- Upgrade bias: favour survival upgrade options.
- Best for: players who want stability.

#### GraffPUNKS
- Theme: Chaos, combos, risk, rare spikes.
- Perk behaviour: +25% chaos pressure, +25% combo multiplier, higher rare spawn chance via goldenSpawnBoost modifier bias.
- Upgrade bias: favour chaos/rare upgrade options.
- Best for: players who want fast, volatile, high-risk runs.

### Game-specific perk mapping:

| Game | Diamond Hands | HODL Warriors | GraffPUNKS |
|------|---------------|----------------|------------|
| Invaders 3008 | Survival bonus after 30s + reduced chaos | +1 bunker shield durability | More chaos invaders + combo window |
| Pac-Chain | Routing streak bonus on long runs | Shield pickup bias + ghost collision buffer | More golden pellets + chain bonus |
| Asteroid Fork | Long-field survival bonus | Stronger starting shield + collision forgiveness | More crystal/chaos asteroids + combo burst |
| Breakout Bullrun | Long rally multiplier + fewer chaos penalties | Floor shield bonus + ball-save assist | Explosive bricks more frequent + combo spikes |
| SnakeRun 3008 | Length/endurance score bonus | One mistake buffer + shield pickup | More golden food + riskier speed boost |
| Tetris Block Topia | Clean-stack endurance bonus | Panic-clear / mistake recovery | More golden/mutation pieces + chaos clear |
| Crystal Quest | Deeper run survival bonus (streak) | Safer skip/recovery bias | Rare question spawn bias + combo burst |

---

## 10. Validation Requirements

Run `scripts/arcade-game-parity-audit.mjs` to verify all active games meet this standard.

The script checks every active game has:
- Manifest entry.
- Bootstrap file.
- Faction effect import or documented exception.
- Cross-game modifier import or documented exception.
- Mission/faction event hook or documented exception.
- No fake XP wording in bootstrap or game HTML.

---

*Maintained by the Crypto Moonboys arcade team.*
