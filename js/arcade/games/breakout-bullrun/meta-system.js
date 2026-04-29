/**
 * meta-system.js — local meta-layer for Breakout Bullrun.
 *
 * Provides (all localStorage — no backend, no XP, no leaderboard changes):
 *  - Personal bests: best score, highest wave, longest survival time
 *  - Milestone system: 6 simple achievements tracked locally
 *  - Daily variation: date-seeded modifier bias, event rate, boss shift
 *  - Run summary builder for the game-over screen
 *
 * Keyed to 'breakout_bullrun_meta_v1' — no cross-game contamination.
 * No DOM access — pure data helpers.
 */

const STORAGE_KEY = 'breakout_bullrun_meta_v1';

// ── Persisted state ───────────────────────────────────────────────────────────

function defaultMeta() {
  return {
    bestScore:    0,
    bestWave:     0,
    bestSurvival: 0,   // seconds
    milestones:   {},  // { [id]: true }
    totalRuns:    0,
  };
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Object.assign(defaultMeta(), JSON.parse(raw)) : defaultMeta();
  } catch { return defaultMeta(); }
}

function saveMeta(meta) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch {}
}

// ── Milestone definitions ─────────────────────────────────────────────────────

export const MILESTONE_DEFS = [
  { id: 'wave10',      text: '🌊 Wave 10 Reached!',         check: (r) => r.wave >= 10            },
  { id: 'firstBoss',   text: '💀 First Boss Defeated!',      check: (r) => r.bossesDefeated >= 1   },
  { id: 'chaos',       text: '🔥 Max Intensity Survived!',   check: (r) => r.highestIntensity >= 95 },
  { id: 'wave20',      text: '🚀 Wave 20 Reached!',          check: (r) => r.wave >= 20            },
  { id: 'score100k',   text: '💰 100,000 Points!',           check: (r) => r.score >= 100000        },
  { id: 'survive300',  text: '⏱ Survived 300 Seconds!',     check: (r) => r.survival >= 300        },
];

/**
 * Check newly-earned milestones for a completed run.
 * @param {{ wave, bossesDefeated, highestIntensity, score, survival }} run
 * @returns {string[]} text strings for newly-unlocked milestones
 */
export function checkMilestones(run) {
  const meta  = loadMeta();
  const texts = [];
  for (const m of MILESTONE_DEFS) {
    if (!meta.milestones[m.id] && m.check(run)) {
      meta.milestones[m.id] = true;
      texts.push(m.text);
    }
  }
  if (texts.length) saveMeta(meta);
  return texts;
}

// ── Personal bests ────────────────────────────────────────────────────────────

/**
 * Record run stats and persist any new personal bests.
 * @param {{ score, wave, survival }} run
 * @returns {{ bestScore, bestWave, bestSurvival, totalRuns, improved: string[] }}
 */
export function recordRunStats(run) {
  const meta     = loadMeta();
  const improved = [];
  meta.totalRuns++;
  if ((run.score    || 0) > meta.bestScore)    { meta.bestScore    = run.score;    improved.push('score');    }
  if ((run.wave     || 0) > meta.bestWave)     { meta.bestWave     = run.wave;     improved.push('wave');     }
  if ((run.survival || 0) > meta.bestSurvival) { meta.bestSurvival = run.survival; improved.push('survival'); }
  saveMeta(meta);
  return { ...meta, improved };
}

/** Return current stored personal bests. */
export function getPersonalBests() { return loadMeta(); }

// ── Daily variation ───────────────────────────────────────────────────────────

/** Deterministic 0–1 value seeded from today's UTC date + a per-slot offset. */
function dailyRand(offset) {
  const d    = new Date();
  let   seed = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate() + (offset | 0);
  seed = (seed ^ (seed >>> 16)) >>> 0;
  seed = (Math.imul(seed, 0x45d9f3b)) >>> 0;
  seed = (seed ^ (seed >>> 16)) >>> 0;
  return (seed >>> 0) / 0xffffffff;
}

/**
 * Return today's variation object.
 *
 * Rotates several director parameters daily so each day feels distinct
 * without any backend call.
 *
 * @returns {{
 *   eventRateMult:   number,   // 0.7 – 1.4× surprise-event trigger rate
 *   modifierBias:    number,   // 0–1 (0 = favour common, 1 = favour rare/epic)
 *   bossIndexOffset: number,   // 0–5 boss archetype rotation shift
 * }}
 */
export function getDailyVariation() {
  return {
    eventRateMult:   0.7 + dailyRand(0) * 0.7,
    modifierBias:    dailyRand(1),
    bossIndexOffset: Math.floor(dailyRand(2) * 6),
  };
}

// ── Run summary ───────────────────────────────────────────────────────────────

const RATING_TIERS = [
  { min: 0,       label: 'F',   color: '#666666' },
  { min: 1000,    label: 'D',   color: '#88aacc' },
  { min: 5000,    label: 'C',   color: '#3fb950' },
  { min: 15000,   label: 'B',   color: '#f7c948' },
  { min: 40000,   label: 'A',   color: '#ff8c00' },
  { min: 100000,  label: 'S',   color: '#ff4fd1' },
  { min: 300000,  label: 'S+',  color: '#bc8cff' },
];

/**
 * Build a run-summary data object for the game-over screen.
 * @param {{ score, wave, bossesDefeated, upgradeCount, highestIntensity, survival }} run
 * @returns {object}
 */
export function buildRunSummary(run) {
  const tier = [...RATING_TIERS].reverse().find((t) => (run.score || 0) >= t.min) || RATING_TIERS[0];
  const pb   = loadMeta();
  return {
    score:            run.score            || 0,
    wave:             run.wave             || 0,
    bossesDefeated:   run.bossesDefeated   || 0,
    upgradeCount:     run.upgradeCount     || 0,
    highestIntensity: Math.round(run.highestIntensity || 0),
    survival:         Math.round(run.survival || 0),
    rating:           tier.label,
    ratingColor:      tier.color,
    bestScore:        pb.bestScore,
    bestWave:         pb.bestWave,
    bestSurvival:     pb.bestSurvival,
    totalRuns:        pb.totalRuns,
  };
}
