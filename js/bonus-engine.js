/* ============================================================
   bonus-engine.js — Moonboys Arcade WTF Bonus Engine
   Loads the shared bonus pool from hidden_bonus_pool.json
   and exposes rollHiddenBonus() + showBonusPopup() to all games.
   ============================================================ */

const POOL_PATH = '/games/data/hidden_bonus_pool.json';

// ── Module-level cache so the pool is only fetched once per page load ──────
let _poolCache = null;

async function loadPool() {
  if (_poolCache) return _poolCache;
  try {
    const res = await fetch(POOL_PATH, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _poolCache = await res.json();
  } catch (err) {
    console.warn('[bonus-engine] Could not load bonus pool, using built-in fallback:', err);
    _poolCache = {
      rarity_weights: { common: 50, uncommon: 25, rare: 12, epic: 8, legendary: 4, wtf: 1 },
      bonuses: [
        { id: 'quick_hands',    name: 'Quick Hands',    rarity: 'common',    rewards: { arcade_points: 50 } },
        { id: 'hodl_streak',    name: 'HODL Streak',    rarity: 'uncommon',  rewards: { arcade_points: 80 } },
        { id: 'diamond_reflex', name: 'Diamond Reflex', rarity: 'rare',      rewards: { arcade_points: 150, multiplier: 1.5 } },
        { id: 'hidden_vault',   name: 'Hidden Vault',   rarity: 'epic',      rewards: { arcade_points: 300 } },
        { id: 'sigma_protocol', name: 'SIGMA Protocol', rarity: 'legendary', rewards: { arcade_points: 800 } },
        { id: 'moonshot',       name: 'MOONSHOT',       rarity: 'wtf',       rewards: { arcade_points: 1500 } },
      ]
    };
  }
  return _poolCache;
}

// ── Trigger evaluation ─────────────────────────────────────────────────────
function evaluateTrigger(bonus, context) {
  const t = bonus.trigger;
  if (!t) return false;
  const score  = Number(context.score  ?? 0);
  const streak = Number(context.streak ?? 0);

  switch (t.type) {
    case 'score_within_time': return score >= Number(t.score ?? 0);
    case 'streak':            return streak >= Number(t.count ?? 1);
    case 'score_threshold':   return score >= Number(t.score ?? 0);
    case 'near_miss':         return (context.nearMisses ?? 0) >= Number(t.count ?? 1);
    case 'first_score':       return score > 0 && !context.firstScoreFired;
    case 'secret_event':      return Math.random() < 0.005;
    case 'random_event':      return Math.random() < 0.002;
    default:                  return false;
  }
}

// ── Weighted random selector ───────────────────────────────────────────────
function selectByWeight(bonuses, weights) {
  const eligible = bonuses.filter(b => b.rarity in weights);
  if (!eligible.length) return null;
  const totalWeight = eligible.reduce((s, b) => s + (weights[b.rarity] ?? 0), 0);
  if (totalWeight <= 0) return null;
  let rand = Math.random() * totalWeight;
  for (const b of eligible) {
    rand -= weights[b.rarity] ?? 0;
    if (rand <= 0) return b;
  }
  return eligible[eligible.length - 1];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Roll for a hidden bonus.
 *
 * Checks all bonus triggers against the current game context.
 * Each bonus fires at most once per session (tracked in sessionStorage).
 *
 * @param {Object} context - { score, streak, game, nearMisses, firstScoreFired }
 * @returns {Promise<Object|null>} Resolved bonus object, or null if no bonus fires.
 */
export async function rollHiddenBonus(context = {}) {
  const pool = await loadPool();
  const weights = pool.rarity_weights || {};
  const bonuses = Array.isArray(pool.bonuses) ? pool.bonuses : [];

  const firedKey = `bonus_fired_${context.game || 'global'}`;
  let firedSet;
  try { firedSet = new Set(JSON.parse(sessionStorage.getItem(firedKey) || '[]')); }
  catch { firedSet = new Set(); }

  const eligible = bonuses.filter(
    b => !firedSet.has(b.id) && evaluateTrigger(b, context)
  );
  if (!eligible.length) return null;

  const winner = selectByWeight(eligible, weights);
  if (!winner) return null;

  firedSet.add(winner.id);
  try { sessionStorage.setItem(firedKey, JSON.stringify([...firedSet])); } catch {}

  return winner;
}

// ── Visual popup ────────────────────────────────────────────────────────────

const RARITY_COLOURS = {
  common:    '#8b949e',
  uncommon:  '#3fb950',
  rare:      '#2ec5ff',
  epic:      '#bc8cff',
  legendary: '#f7c948',
  wtf:       '#ff4fd1',
};

/**
 * Display an animated bonus popup overlay.
 * @param {Object} bonus - bonus object from rollHiddenBonus()
 */
export function showBonusPopup(bonus) {
  if (!bonus) return;
  const colour = RARITY_COLOURS[bonus.rarity] || '#fff';
  const pts = bonus.rewards?.arcade_points ?? 0;

  const popup = document.createElement('div');
  popup.className = 'bpe-overlay';
  popup.setAttribute('role', 'alert');
  popup.setAttribute('aria-live', 'assertive');
  popup.innerHTML = `
    <div class="bpe-card" style="--bc:${colour}">
      <div class="bpe-rarity">${escHtml((bonus.rarity || '').toUpperCase())}</div>
      <div class="bpe-name">${escHtml(bonus.name || 'Bonus')}</div>
      ${bonus.description ? `<p class="bpe-desc">${escHtml(bonus.description)}</p>` : ''}
      <div class="bpe-rewards">
        ${pts ? `<span>+${pts} pts</span>` : ''}
      </div>
      <p class="bpe-dismiss">tap to dismiss</p>
    </div>
  `;

  injectPopupStyles();
  document.body.appendChild(popup);

  // AUDIO_HOOK: play('bonus_' + bonus.rarity)

  setTimeout(() => {
    popup.classList.add('bpe-fade');
    setTimeout(() => popup.remove(), 600);
  }, 3400);
  popup.addEventListener('click', () => popup.remove());
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _stylesInjected = false;
function injectPopupStyles() {
  if (_stylesInjected || document.getElementById('bpe-styles')) return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'bpe-styles';
  s.textContent = `
    .bpe-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;
      justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);
      animation:bpe-in .25s ease;cursor:pointer}
    .bpe-overlay.bpe-fade{animation:bpe-out .6s ease forwards}
    @keyframes bpe-in{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
    @keyframes bpe-out{from{opacity:1}to{opacity:0}}
    .bpe-card{background:#0d1117;border:2px solid var(--bc,#f7c948);border-radius:18px;
      padding:28px 36px;text-align:center;max-width:340px;
      box-shadow:0 0 40px color-mix(in srgb,var(--bc,#f7c948) 33%,transparent)}
    .bpe-rarity{font-size:.72rem;letter-spacing:.12em;font-weight:700;
      color:var(--bc,#f7c948);margin-bottom:6px}
    .bpe-name{font-size:1.6rem;font-weight:900;color:#e6edf3;margin-bottom:8px}
    .bpe-desc{font-size:.85rem;color:#8b949e;margin-bottom:10px}
    .bpe-rewards{display:flex;gap:12px;justify-content:center;
      font-size:1rem;font-weight:700;color:var(--bc,#f7c948);margin-top:8px}
    .bpe-dismiss{font-size:.7rem;color:#8b949e;margin-top:14px}
  `;
  document.head.appendChild(s);
}
