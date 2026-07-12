/**
 * boss-archetypes.js — Boss archetype definitions and helpers for Invaders 3008.
 *
 * Pure game logic — no DOM or canvas access.
 */

// ── Archetype definitions ─────────────────────────────────────────────────────

export const BOSS_ARCHETYPE_DEFS = [
  {
    id: 'theWall',
    label: 'CYBER TROLL',
    warningText: 'CORRUPTED TROLL FIREWALL BREACH',
    color: '#56f0ff',
    phase2Text: 'FIREWALL CRACKING',
    phase3Text: 'TROLL RAGE MODE',
    deathColor: '#56f0ff',
    hpMult: 2.2,
    speedMult: 0.5,
    bulletPattern: 'wall',
  },
  {
    id: 'theSplitter',
    label: 'CORRUPT APE',
    warningText: 'BANANA CHAIN MUTATION',
    color: '#ff9b2f',
    phase2Text: 'APE CLONES ONLINE',
    phase3Text: 'PRIMATE MELTDOWN',
    deathColor: '#ffb347',
    hpMult: 1.4,
    speedMult: 1.1,
    bulletPattern: 'splitter',
  },
  {
    id: 'theSniper',
    label: 'LASER CAT',
    warningText: 'MEAN CAT TARGET LOCKED',
    color: '#ff3fd4',
    phase2Text: 'CLAWS CHARGED',
    phase3Text: 'NINE-LIFE SNIPE',
    deathColor: '#ff78e7',
    hpMult: 0.9,
    speedMult: 1.6,
    bulletPattern: 'sniper',
  },
  {
    id: 'theSwarmKing',
    label: 'SHIBA WARLORD',
    warningText: 'DOGE PACK ASCENDS',
    color: '#f7c948',
    phase2Text: 'PACK CALLED',
    phase3Text: 'KENNEL STAMPEDE',
    deathColor: '#ffd95a',
    hpMult: 1.2,
    speedMult: 1.0,
    bulletPattern: 'swarmking',
  },
  {
    id: 'theGlitchCore',
    label: 'GLITCH UNICORN',
    warningText: 'RAINBOW CHAIN CORRUPTED',
    color: '#ad5cff',
    phase2Text: 'HORN DESYNC',
    phase3Text: 'FULL RAINBOW VIRUS',
    deathColor: '#2ee8ff',
    hpMult: 1.0,
    speedMult: 0,   // uses teleport, not normal movement
    bulletPattern: 'glitch',
  },
  {
    id: 'theBomber',
    label: 'SHIBA DOOM RIDER',
    warningText: 'MEME BOMBS INCOMING',
    color: '#ff3158',
    phase2Text: 'POOP DROP RUN',
    phase3Text: 'TOTAL MEME DETONATION',
    deathColor: '#ff4fd1',
    hpMult: 1.1,
    speedMult: 1.2,
    bulletPattern: 'bomber',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pick a boss archetype for the given wave, cycling and avoiding recent repeats.
 * @param {number} wave
 * @param {{ bossHistory: string[] }} director
 * @returns {object} archetype def
 */
export function pickBossArchetype(wave, director) {
  const recent = (director.bossHistory || []).slice(-2);
  const available = BOSS_ARCHETYPE_DEFS.filter(a => !recent.includes(a.id));
  const pool = available.length ? available : BOSS_ARCHETYPE_DEFS;
  // Use wave as a seed for variety but with some randomness
  const baseIdx = wave % pool.length;
  const offset  = Math.random() < 0.4 ? 0 : Math.floor(Math.random() * pool.length);
  const archetype = pool[(baseIdx + offset) % pool.length];
  if (!director.bossHistory) director.bossHistory = [];
  director.bossHistory.push(archetype.id);
  if (director.bossHistory.length > 6) director.bossHistory.shift();
  return archetype;
}

/**
 * Create a boss object from an archetype.
 * @param {object} archetype  from BOSS_ARCHETYPE_DEFS
 * @param {number} wave
 * @param {number} W          canvas width
 * @returns {object}
 */
export function spawnBossArchetype(archetype, wave, W) {
  const w  = archetype.id === 'theWall' ? 120 : 80;
  const h  = archetype.id === 'theWall' ? 54  : 44;
  const hp = Math.round((8 + wave) * archetype.hpMult);
  return {
    x: W / 2 - w / 2,
    y: -(h + 10),
    w, h,
    hp,
    maxHp:      hp,
    hpDisplay:  hp,
    dir:        1,
    speed:      (92 + wave * 10) * (archetype.speedMult || 1),
    flashTimer: 0,
    hitTimer:   0,
    archetypeId:      archetype.id,
    phase:            1,
    // Archetype-specific state
    teleportTimer:    archetype.id === 'theGlitchCore' ? 2 : 0,
    summonTimer:      archetype.id === 'theSwarmKing'  ? 8 : 0,
    sniperCharging:   false,
    sniperChargeTimer:0,
    sniperTarget:     null,
    fakeDeath:        false,
    fakeDeathDone:    false,
    droneSpawns:      [],
    shootCooldown:    0,
    phaseTransitioned2: false,
    phaseTransitioned3: false,
  };
}
