/**
 * event-system.js — Wave modifiers, surprise events, and scaling director
 * for Invaders 3008.
 *
 * Pure game logic — no DOM or canvas access.
 */

// ── Wave modifier IDs ─────────────────────────────────────────────────────────

export const MODIFIER_NONE             = 'none';
export const MODIFIER_LOW_GRAVITY      = 'lowGravityBullets';
export const MODIFIER_FAST_INVADERS    = 'fastInvaders';
export const MODIFIER_BLACKOUT         = 'blackout';
export const MODIFIER_SHIELDED_WAVE    = 'shieldedWave';
export const MODIFIER_BOMBER_SWARM     = 'bomberSwarm';
export const MODIFIER_HUNTER_PATROL    = 'hunterPatrol';
export const MODIFIER_REVERSE_DRIFT    = 'reverseDrift';
export const MODIFIER_ASTEROID_DEBRIS  = 'asteroidDebris';
export const MODIFIER_UNSTABLE_BUNKERS = 'unstableBunkers';
export const MODIFIER_POWERUP_RAIN     = 'powerupRain';
export const MODIFIER_FAKE_SAFE_WAVE   = 'fakeSafeWave';

// ── Wave modifier definitions ─────────────────────────────────────────────────
// Each modifier: { id, label, color, rarity, apply(state), tick(state,dt), remove(state) }
// state = { invaders, invBullets, bullets, player, wave, elapsed, W, H,
//           modifierData, rand, spawnExplosion, addScore, playSfx, screenShake,
//           addFloatingText, asteroids, miniEnemies, laserWarning,
//           empActive, empTimer, panicMode, panicTimer, spawnPowerupRain,
//           droneHijacked, droneHijackTimer, invSpeed, invDir, bunkers }

export const WAVE_MODIFIER_DEFS = [
  {
    id: MODIFIER_LOW_GRAVITY,
    label: 'LOW GRAVITY',
    color: '#bc8cff',
    rarity: 'common',
    apply(state) {},
    tick(state, dt) {
      for (const b of state.invBullets) {
        if (b.vx === undefined) b.vx = (Math.random() - 0.5) * 30;
        b.vx += (Math.random() - 0.5) * 20 * dt;
        b.vy = Math.max(30, b.vy - 70 * dt);
      }
    },
    remove(state) {},
  },

  {
    id: MODIFIER_FAST_INVADERS,
    label: 'SPEED SURGE',
    color: '#f7c948',
    rarity: 'common',
    apply(state) {
      state.modifierData.origSpeed = state.invSpeed;
      state.invSpeed *= 1.8;
    },
    tick(state, dt) {},
    remove(state) {
      if (state.modifierData.origSpeed !== undefined) {
        state.invSpeed = state.modifierData.origSpeed;
      }
    },
  },

  {
    id: MODIFIER_BLACKOUT,
    label: 'BLACKOUT',
    color: '#444466',
    rarity: 'rare',
    apply(state) {
      state.modifierData.blackoutTimer = 0;
      state.modifierData.blackoutAlpha = 0;
    },
    tick(state, dt) {
      state.modifierData.blackoutTimer = (state.modifierData.blackoutTimer || 0) + dt;
      const cycle = state.modifierData.blackoutTimer % 4;
      // 0-1: fade in, 1-2: solid, 2-3: fade out, 3-4: clear
      if (cycle < 1)      state.modifierData.blackoutAlpha = cycle;
      else if (cycle < 2) state.modifierData.blackoutAlpha = 1;
      else if (cycle < 3) state.modifierData.blackoutAlpha = 3 - cycle;
      else                state.modifierData.blackoutAlpha = 0;
    },
    remove(state) {
      state.modifierData.blackoutAlpha = 0;
    },
  },

  {
    id: MODIFIER_SHIELDED_WAVE,
    label: 'SHIELDED WAVE',
    color: '#2ec5ff',
    rarity: 'rare',
    apply(state) {
      for (const inv of state.invaders) {
        if (inv.alive && inv.shieldHp === 0) {
          inv.shieldHp    = 1;
          inv.maxShieldHp = Math.max(inv.maxShieldHp || 0, 1);
        }
      }
    },
    tick(state, dt) {},
    remove(state) {},
  },

  {
    id: MODIFIER_BOMBER_SWARM,
    label: 'BOMBER SWARM',
    color: '#ff8c00',
    rarity: 'common',
    apply(state) {
      // Flag checked in buildGrid via modifierData — or retroactively convert some invaders
      for (const inv of state.invaders) {
        if (inv.alive && inv.type !== 'tank' && Math.random() < 0.35) {
          inv.type  = 'bomber';
          inv.hp    = 1;
          inv.maxHp = 1;
        }
      }
    },
    tick(state, dt) {},
    remove(state) {},
  },

  {
    id: MODIFIER_HUNTER_PATROL,
    label: 'HUNTER PATROL',
    color: '#cc1111',
    rarity: 'common',
    apply(state) {
      for (const inv of state.invaders) {
        if (inv.alive && inv.type !== 'tank' && Math.random() < 0.30) {
          inv.type  = 'hunter';
          inv.hp    = 1;
          inv.maxHp = 1;
        }
      }
    },
    tick(state, dt) {},
    remove(state) {},
  },

  {
    id: MODIFIER_REVERSE_DRIFT,
    label: 'REVERSE DRIFT',
    color: '#3fb950',
    rarity: 'common',
    apply(state) { state.invDir = -1; },
    tick(state, dt) {},
    remove(state) {},
  },

  {
    id: MODIFIER_ASTEROID_DEBRIS,
    label: 'ASTEROID FIELD',
    color: '#888888',
    rarity: 'rare',
    apply(state) {
      state.modifierData.asteroidTimer = 4;
    },
    tick(state, dt) {
      state.modifierData.asteroidTimer = (state.modifierData.asteroidTimer || 4) - dt;
      if (state.modifierData.asteroidTimer <= 0) {
        state.modifierData.asteroidTimer = 4;
        state.asteroids.push({
          x:  Math.random() * (state.W - 40) + 20,
          y:  -20,
          r:  14 + Math.random() * 10,
          vy: 160 + Math.random() * 70,
        });
      }
    },
    remove(state) {
      if (state.asteroids) state.asteroids.length = 0;
    },
  },

  {
    id: MODIFIER_UNSTABLE_BUNKERS,
    label: 'FRAGILE BUNKERS',
    color: '#ff4fd1',
    rarity: 'common',
    apply(state) {
      for (const bunker of state.bunkers) {
        for (const blk of bunker) { blk.hp = 1; blk.maxHp = 1; }
      }
    },
    tick(state, dt) {},
    remove(state) {},
  },

  {
    id: MODIFIER_POWERUP_RAIN,
    label: 'POWERUP RAIN',
    color: '#ff4fd1',
    rarity: 'rare',
    apply(state) { state.modifierData.powerupRainTimer = 3; },
    tick(state, dt) {
      state.modifierData.powerupRainTimer = (state.modifierData.powerupRainTimer || 3) - dt;
      if (state.modifierData.powerupRainTimer <= 0) {
        state.modifierData.powerupRainTimer = 3;
        if (typeof state.spawnPowerupRain === 'function') state.spawnPowerupRain();
      }
    },
    remove(state) {},
  },

  {
    id: MODIFIER_FAKE_SAFE_WAVE,
    label: 'DECOY WAVE',
    color: '#3fb950',
    rarity: 'epic',
    apply(state) {
      state.modifierData.fakeSafeTriggered  = false;
      state.modifierData.fakeSafeInitAlive  = state.invaders.filter(i => i.alive).length;
    },
    tick(state, dt) {
      if (state.modifierData.fakeSafeTriggered) return;
      const alive = state.invaders.filter(i => i.alive).length;
      const init  = state.modifierData.fakeSafeInitAlive || 1;
      if (alive > 0 && alive <= init * 0.5) {
        state.modifierData.fakeSafeTriggered = true;
        for (const inv of state.invaders) {
          if (!inv.alive) continue;
          inv.type  = 'fast';
        }
        // Double global invader speed signal via modifierData flag
        state.modifierData.fakeMutated = true;
        if (typeof state.addFloatingText === 'function') state.addFloatingText('AMBUSH!', '#ff4444');
        if (typeof state.playSfx === 'function') state.playSfx('player_damage');
      }
    },
    remove(state) {},
  },
];

// ── Surprise event definitions ────────────────────────────────────────────────
// Each event: { id, label, color, minWave, trigger(state), execute(state),
//               tickActive(state,dt), duration }

// ── Event tiers ───────────────────────────────────────────────────────────────
// tier1 = minor (low intensity)
// tier2 = pressure (mid intensity)
// tier3 = spike (high intensity)

export const SURPRISE_EVENT_DEFS = [
  {
    id: 'ambushDrop',
    label: 'AMBUSH!',
    color: '#ff4444',
    tier: 'tier1',
    minWave: 2,
    duration: 0,
    trigger(state) { return Math.random() < 0.15; },
    execute(state) {
      for (let i = 0; i < 5; i++) {
        state.invaders.push({
          x: Math.random() * (state.W - 36),
          y: -28 - i * 10,
          w: 36, h: 28, row: 0, type: 'fast',
          hp: 1, maxHp: 1, shieldHp: 0, maxShieldHp: 0,
          alive: true, seed: Math.random() * Math.PI * 2,
          hitTimer: 0, shieldHitTimer: 0, mutations: [],
        });
      }
    },
    tickActive(state, dt) {},
  },

  {
    id: 'rogueMini',
    label: 'ROGUE MINI BOSS',
    color: '#ff8c00',
    tier: 'tier2',
    minWave: 3,
    duration: 30,
    trigger(state) { return Math.random() < 0.12; },
    execute(state) {
      state.miniEnemies.push({
        x: Math.random() * (state.W - 50),
        y: 20,
        w: 48, h: 36,
        hp: 8, maxHp: 8,
        speed: 80 + state.wave * 5,
        dir: 1,
        type: 'mini_boss',
        hitTimer: 0,
        shootTimer: 1.5,
      });
    },
    tickActive(state, dt) {},
  },

  {
    id: 'laserSweep',
    label: 'LASER SWEEP',
    color: '#ff2222',
    tier: 'tier3',
    minWave: 4,
    duration: 3,
    trigger(state) { return !!state.boss && Math.random() < 0.20; },
    execute(state) {
      const bx = state.boss ? state.boss.x + state.boss.w / 2 : state.W / 2;
      state.laserWarning = { x: bx, chargeTimer: 1.5, fired: false };
    },
    tickActive(state, dt) {},
  },

  {
    id: 'meteorShower',
    label: 'METEOR SHOWER',
    color: '#888888',
    tier: 'tier2',
    minWave: 3,
    duration: 0,
    trigger(state) { return Math.random() < 0.12; },
    execute(state) {
      for (let i = 0; i < 8; i++) {
        state.asteroids.push({
          x:  Math.random() * (state.W - 30) + 15,
          y:  -20 - i * 40,
          r:  10 + Math.random() * 8,
          vy: 200 + Math.random() * 80,
        });
      }
    },
    tickActive(state, dt) {},
  },

  {
    id: 'empBlast',
    label: 'EMP BLAST',
    color: '#2ec5ff',
    tier: 'tier3',
    minWave: 5,
    duration: 5,
    trigger(state) { return Math.random() < 0.10; },
    execute(state) {
      state.empActive = true;
      state.empTimer  = 5;
      if (typeof state.addFloatingText === 'function') state.addFloatingText('EMP! UPGRADES DISABLED', '#2ec5ff');
    },
    tickActive(state, dt) {},
  },

  {
    id: 'droneHijack',
    label: 'DRONE HIJACKED',
    color: '#cc00ff',
    tier: 'tier2',
    minWave: 4,
    duration: 5,
    trigger(state) { return Math.random() < 0.10; },
    execute(state) {
      state.droneHijacked      = true;
      state.droneHijackTimer   = 5;
    },
    tickActive(state, dt) {},
  },

  {
    id: 'goldenInvader',
    label: 'GOLDEN INVADER',
    color: '#f7c948',
    tier: 'tier1',
    minWave: 2,
    duration: 20,
    trigger(state) { return Math.random() < 0.18; },
    execute(state) {
      state.invaders.push({
        x: 20 + Math.random() * (state.W - 60),
        y: 50 + Math.random() * 40,
        w: 36, h: 28, row: 0, type: 'golden',
        hp: 1, maxHp: 1, shieldHp: 0, maxShieldHp: 0,
        alive: true, seed: Math.random() * Math.PI * 2,
        hitTimer: 0, shieldHitTimer: 0, mutations: [],
      });
      if (typeof state.playSfx === 'function') state.playSfx('rare_enemy');
    },
    tickActive(state, dt) {},
  },

  {
    id: 'cursedInvader',
    label: 'CURSED INVADER',
    color: '#ff00ff',
    tier: 'tier2',
    minWave: 4,
    duration: 0,
    trigger(state) { return Math.random() < 0.12; },
    execute(state) {
      state.invaders.push({
        x: state.W / 2 - 18,
        y: 40,
        w: 36, h: 28, row: 0, type: 'cursed',
        hp: 2, maxHp: 2, shieldHp: 0, maxShieldHp: 0,
        alive: true, seed: Math.random() * Math.PI * 2,
        hitTimer: 0, shieldHitTimer: 0,
        isCursed: true, mutations: [],
      });
    },
    tickActive(state, dt) {},
  },

  {
    id: 'supplyCrate',
    label: 'SUPPLY DROP',
    color: '#3fb950',
    tier: 'tier1',
    minWave: 1,
    duration: 0,
    trigger(state) { return Math.random() < 0.20; },
    execute(state) {
      if (typeof state.spawnPowerupRain === 'function') state.spawnPowerupRain();
    },
    tickActive(state, dt) {},
  },

  {
    id: 'panicMode',
    label: 'PANIC MODE',
    color: '#ff4444',
    tier: 'tier3',
    minWave: 5,
    duration: 10,
    trigger(state) { return Math.random() < 0.08; },
    execute(state) {
      state.panicMode  = true;
      state.panicTimer = 10;
      if (typeof state.addFloatingText === 'function') state.addFloatingText('PANIC MODE!', '#ff4444');
    },
    tickActive(state, dt) {},
  },
];

// ── Scaling director ──────────────────────────────────────────────────────────

/** Create a fresh scaling director. */
export function createScalingDirector() {
  return {
    wave:               0,
    lives:              3,
    recentDamageTaken:  0,
    scorePace:          0,
    bossHistory:        [],
    eventHistory:       [],
    modifierHistory:    [],
    upgradeCount:       0,
    consecutiveDeaths:  0,
    _eventCooldown:     0,

    // ── Intensity control ──────────────────────────────────────────────────
    /** Tension meter clamped 0–100. Drives event frequency, modifier weight,
     *  boss aggression, and forced-chaos triggers. */
    intensity:              0,
    /** Total game-time elapsed (seconds). Used to timestamp events. */
    _elapsedTotal:          0,
    /** Seconds since the player last took damage. */
    _timeSinceLastDamage:   0,
    /** _elapsedTotal value when the player last took damage. */
    lastDamageTime:         0,
    /** _elapsedTotal value at the last "safe" moment (wave clear / long calm). */
    lastSafeTime:           0,

    // ── Pressure-based event triggering ───────────────────────────────────
    /** Deterministic accumulator (0–100) that triggers events when full.
     *  Accumulates while no event is active; resets to 0 after each fire. */
    pressure:           0,
  };
}

/**
 * Tick the scaling director. Call every update frame.
 *
 * @param {object}  director
 * @param {number}  dt
 * @param {number}  score
 * @param {number}  wave
 * @param {number}  lives
 * @param {object}  upgrades
 * @param {boolean} [eventActive=false]  Whether a surprise event is currently running.
 * @param {number}  [pressureRateMult=1] Daily-variation multiplier for pressure accumulation rate.
 */
export function tickDirector(director, dt, score, wave, lives, upgrades, eventActive, pressureRateMult) {
  director.wave  = wave;
  director.lives = lives;
  director.scorePace = wave > 0 ? score / wave : 0;
  director.upgradeCount = upgrades
    ? Object.values(upgrades).reduce((a, b) => a + (Number(b) || 0), 0)
    : 0;
  if (director._eventCooldown > 0) director._eventCooldown -= dt;
  if (director.recentDamageTaken > 0) {
    director.recentDamageTaken = Math.max(0, director.recentDamageTaken - dt * 0.5);
  }

  // ── Intensity timers ────────────────────────────────────────────────────
  director._elapsedTotal        += dt;
  director._timeSinceLastDamage += dt;

  // Passive intensity decay: no damage for more than 8 s → calm down
  if (director._timeSinceLastDamage > 8) {
    director.intensity = Math.max(0, director.intensity - 5 * dt);
  }

  // ── Pressure accumulation ────────────────────────────────────────────────
  // Pressure only builds while no event is running and wave >= 2.
  // Rate = base + intensity bonus, scaled by optional dailyVariation multiplier.
  if (!eventActive && wave >= 2) {
    const intensity    = director.intensity || 0;
    const baseRate     = 5;                             // units/sec — fills in 20 s at base
    const intensityAdd = intensity * 0.08;              // up to +8/s at full chaos
    const rate         = (baseRate + intensityAdd) * (pressureRateMult || 1);
    director.pressure  = Math.min(100, (director.pressure || 0) + rate * dt);
  }
}

// ── INTENSITY_SAFE seconds of calm before forced-chaos kicks in ───────────────
const INTENSITY_SAFE_THRESHOLD = 20; // seconds

/**
 * Update the intensity meter each frame based on in-game conditions.
 *
 * Call this from the game loop with a snapshot of the current danger state.
 *
 * @param {object} director       Scaling director from createScalingDirector()
 * @param {number} dt             Delta-time in seconds
 * @param {object} [ctx]          Context snapshot
 * @param {boolean} [ctx.damageTaken=false]       Player took damage this frame
 * @param {number}  [ctx.enemiesNearPlayer=0]     Invaders within striking range
 * @param {boolean} [ctx.bossActive=false]        A boss is currently alive
 * @param {number}  [ctx.lives=3]                 Current player lives
 * @param {boolean} [ctx.waveClear=false]         Wave just cleared this frame
 */
export function updateIntensity(director, dt, {
  damageTaken        = false,
  enemiesNearPlayer  = 0,
  bossActive         = false,
  lives              = 3,
  waveClear          = false,
} = {}) {
  let delta = 0;

  // Increases ────────────────────────────────────────────────────────────
  if (damageTaken) {
    delta += 25;
    director._timeSinceLastDamage = 0;
    director.lastDamageTime       = director._elapsedTotal;
  }

  if (bossActive) {
    delta += 8 * dt;
  }

  if (enemiesNearPlayer > 0) {
    delta += Math.min(enemiesNearPlayer, 5) * 2 * dt;
  }

  if (lives <= 1) {
    delta += 4 * dt;
  } else if (lives === 2) {
    delta += 2 * dt;
  }

  // Decreases ───────────────────────────────────────────────────────────
  if (waveClear) {
    delta -= 30;
    director.lastSafeTime = director._elapsedTotal;
  }

  director.intensity = Math.min(100, Math.max(0, director.intensity + delta));
}

/**
 * Return true when the player has been safe long enough that a forced surprise
 * event should be injected to break the calm.
 *
 * Resets the event cooldown so pickSurpriseEvent() fires immediately.
 *
 * @param {object} director  Scaling director
 * @returns {boolean}
 */
export function checkForcedChaos(director) {
  if (director.wave < 2) return false;
  if (director._eventCooldown > 0) return false;
  if (director.intensity >= 25) return false;
  if (director._timeSinceLastDamage < INTENSITY_SAFE_THRESHOLD) return false;

  // Reset timers so the chaos event fires and cooldown engages
  director._timeSinceLastDamage = 0;
  director.lastSafeTime         = director._elapsedTotal;
  director._eventCooldown       = 0; // let pickSurpriseEvent set it
  return true;
}

/**
 * Return a boss aggression multiplier driven by intensity.
 *
 * At intensity 0   → 1.0× (baseline)
 * At intensity 100 → 2.0× (double fire rate / bullet spread)
 *
 * @param {object} director
 * @returns {number}  1.0 – 2.0
 */
export function getBossAggressionMult(director) {
  return 1.0 + (director.intensity || 0) / 100;
}

/**
 * Pick a wave modifier based on wave, director state, and current intensity.
 *
 * At low intensity (< 30) only common modifiers are eligible and the trigger
 * probability drops to ~30 %.  At high intensity (≥ 70) rare/epic modifiers are
 * unlocked one wave earlier and the trigger probability climbs to ~70 %.
 *
 * Returns a modifier def or null.
 */
export function pickWaveModifier(wave, director) {
  if (wave < 2) return null;
  const intensity = director.intensity || 0;

  // Trigger probability scales with intensity: calm→30 %, neutral→48 %, chaos→70 %
  const triggerChance = 0.30 + intensity / 100 * 0.40;

  const available = WAVE_MODIFIER_DEFS.filter((m) => {
    if (m.id === MODIFIER_SHIELDED_WAVE    && wave < 3)  return false;
    if (m.id === MODIFIER_BLACKOUT         && wave < 4)  return false;
    if (m.id === MODIFIER_ASTEROID_DEBRIS  && wave < 4)  return false;
    if (m.id === MODIFIER_FAKE_SAFE_WAVE   && wave < 5)  return false;
    // At low intensity only common modifiers are eligible
    if (intensity < 30 && m.rarity !== 'common')         return false;
    // Rarity gates (relaxed by 1 wave at high intensity)
    const bonusWave = intensity >= 70 ? 1 : 0;
    if (m.rarity === 'epic'  && wave < 8  - bonusWave)   return false;
    if (m.rarity === 'rare'  && wave < 4  - bonusWave)   return false;
    const recent = director.modifierHistory.slice(-3);
    if (recent.includes(m.id)) return false;
    return true;
  });
  if (!available.length) return null;
  if (Math.random() > triggerChance) return null;

  // At high intensity weight towards higher-rarity modifiers
  const weights = available.map((m) => {
    if (intensity >= 70) {
      return m.rarity === 'epic' ? 3 : m.rarity === 'rare' ? 2 : 1;
    }
    return 1;
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * totalWeight;
  let def;
  for (let i = 0; i < available.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { def = available[i]; break; }
  }
  def = def || available[available.length - 1];

  director.modifierHistory.push(def.id);
  if (director.modifierHistory.length > 8) director.modifierHistory.shift();
  return def;
}

/**
 * Map intensity to an event tier.
 *
 * low  (0–39)  → 'tier1'  (minor — supply drop, golden invader, ambush)
 * mid  (40–69) → 'tier2'  (pressure — rogue mini, meteor, hijack, cursed)
 * high (70–100)→ 'tier3'  (spike — laser, EMP, panic)
 *
 * @param {number} intensity  0–100
 * @returns {'tier1'|'tier2'|'tier3'}
 */
export function getEventTier(intensity) {
  if (intensity >= 70) return 'tier3';
  if (intensity >= 40) return 'tier2';
  return 'tier1';
}

/**
 * Returns true when accumulated pressure has reached the trigger threshold
 * and the event cooldown has expired.
 *
 * This replaces the old RNG-only check: events are now guaranteed once
 * enough time / danger has accumulated, while still being unpredictable
 * in *which* event fires and *exactly* when within the pressure cycle.
 *
 * @param {object} director  Scaling director
 * @returns {boolean}
 */
export function shouldFirePressureEvent(director) {
  if (director._eventCooldown > 0) return false;
  if (director.wave < 2) return false;
  return (director.pressure || 0) >= 100;
}

/** Pick which surprise event to fire (avoids recent repeats).
 *
 * Prefers events matching the current intensity tier; falls back to any
 * available event when the preferred tier has no eligible entries.
 *
 * @param {number} wave
 * @param {object} director
 * @param {string} [tier]  'tier1'|'tier2'|'tier3' — defaults to derived from intensity
 */
export function pickSurpriseEvent(wave, director, tier) {
  const activeTier = tier || getEventTier(director.intensity || 0);
  const recent     = director.eventHistory.slice(-4);

  // Build pool: prefer matching tier, fall back to any available event
  const eligible = SURPRISE_EVENT_DEFS.filter((e) => e.minWave <= wave && !recent.includes(e.id));
  const tiered   = eligible.filter((e) => e.tier === activeTier);
  const pool     = tiered.length ? tiered : (eligible.length ? eligible : SURPRISE_EVENT_DEFS.filter(e => e.minWave <= wave));

  if (!pool.length) return null;

  // Small jitter: pick randomly within the tier pool so runs feel different
  const def = pool[Math.floor(Math.random() * pool.length)];
  director.eventHistory.push(def.id);
  if (director.eventHistory.length > 8) director.eventHistory.shift();
  director._eventCooldown = 15;
  return def;
}
