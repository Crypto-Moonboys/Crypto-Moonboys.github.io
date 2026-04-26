import { ArcadeMeta } from '/js/arcade-meta-system.js';
import { playSound } from '/js/arcade/core/audio.js';

const STORAGE_KEY = 'arcade_retention_v1';
const FEATURED_SLOT_MS = 60 * 60 * 1000;
const RETURN_WARNING_MS = 30 * 60 * 1000;
const RETURN_CRITICAL_MS = 50 * 60 * 1000;
const COMEBACK_THRESHOLD_MS = 40 * 60 * 1000;
const SESSION_IDLE_MS = 25 * 60 * 1000;
const MAX_SESSION_HISTORY = 80;
const MAX_PROMPTS_PER_SESSION = 6;
const PROMPT_GAP_MS = 28 * 1000;
const PROMPT_KEY_COOLDOWN_MS = 6 * 60 * 1000;
const STREAK_WARNING_COOLDOWN_MS = 90 * 1000;
const MAX_TOAST_KEY_LENGTH = 90;
const DEFAULT_MISSION_DURATION_MS = 10 * 60 * 1000;
const STREAK_MISSION_DURATION_MS = 8 * 60 * 1000;
const LONG_ABSENCE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const QUEST_EXPIRY_WARNING_MS = 2 * 60 * 1000;
const QUEST_EXPIRY_PROMPT_MS = 3 * 60 * 1000;
const FEATURED_RETURN_WINDOW_MS = 20 * 60 * 1000;
const FEATURED_PROMPT_WINDOW_MS = 12 * 60 * 1000;
const MISSION_URGENT_WINDOW_MS = 2 * 60 * 1000;

const GAME_ID_MAP = {
  snakeCanvas: 'snake',
  invCanvas: 'invaders',
  brkCanvas: 'breakout',
  pacCanvas: 'pacchain',
  tetCanvas: 'tetris',
  astCanvas: 'asteroid-fork',
  btqmCanvas: 'btqm',
};

let state = readState();
let initialized = false;
let runActive = false;
let root = null;
let toastRoot = null;
let banner = null;
let missionChip = null;
let featuredCacheSlot = null;
let featuredCacheGame = 'snake';

function nowMs() {
  return Date.now();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatCountdown(ms) {
  if (ms < 0) return 'EXPIRED';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInitialState() {
  return {
    version: 1,
    last_played_at: null,
    last_game: null,
    last_prompt_at: 0,
    recent_prompt_keys: {},
    session: {
      id: null,
      started_at: null,
      first_run_at: null,
      last_activity_at: null,
      runs: 0,
      game_switches: 0,
      games: [],
      prompt_count: 0,
      prompt_keys: {},
    },
    metrics: {
      sessions: [],
      comeback_success: 0,
      streak_saves: 0,
    },
    comeback_mission: null,
  };
}

function sanitizeMission(input) {
  if (!input || typeof input !== 'object') return null;
  const now = nowMs();
  const createdAt = Number(input.created_at) || now;
  const expiresAt = Number(input.expires_at) || (createdAt + DEFAULT_MISSION_DURATION_MS);
  return {
    id: String(input.id || `mission-${nowMs().toString(36)}`),
    type: String(input.type || 'return-runs'),
    label: String(input.label || 'Return mission active'),
    created_at: createdAt,
    expires_at: Math.max(createdAt, expiresAt),
    target_runs: Math.max(1, Math.floor(Number(input.target_runs) || 1)),
    target_unique_games: Math.max(0, Math.floor(Number(input.target_unique_games) || 0)),
    progress_runs: Math.max(0, Math.floor(Number(input.progress_runs) || 0)),
    progress_games: Array.isArray(input.progress_games) ? input.progress_games.filter(Boolean).slice(-12) : [],
    completed: !!input.completed,
    completed_at: Number(input.completed_at) || null,
    origin_gap_ms: Math.max(0, Number(input.origin_gap_ms) || 0),
  };
}

function sanitizeState(input) {
  const base = createInitialState();
  const session = input?.session && typeof input.session === 'object' ? input.session : {};
  const metrics = input?.metrics && typeof input.metrics === 'object' ? input.metrics : {};
  return {
    version: 1,
    last_played_at: Number(input?.last_played_at) || null,
    last_game: typeof input?.last_game === 'string' ? input.last_game : null,
    last_prompt_at: Number(input?.last_prompt_at) || 0,
    recent_prompt_keys: (input?.recent_prompt_keys && typeof input.recent_prompt_keys === 'object') ? input.recent_prompt_keys : {},
    session: {
      id: typeof session.id === 'string' ? session.id : null,
      started_at: Number(session.started_at) || null,
      first_run_at: Number(session.first_run_at) || null,
      last_activity_at: Number(session.last_activity_at) || null,
      runs: Math.max(0, Math.floor(Number(session.runs) || 0)),
      game_switches: Math.max(0, Math.floor(Number(session.game_switches) || 0)),
      games: Array.isArray(session.games) ? session.games.filter(Boolean).slice(-30) : [],
      prompt_count: Math.max(0, Math.floor(Number(session.prompt_count) || 0)),
      prompt_keys: (session.prompt_keys && typeof session.prompt_keys === 'object') ? session.prompt_keys : {},
    },
    metrics: {
      sessions: Array.isArray(metrics.sessions) ? metrics.sessions.slice(-MAX_SESSION_HISTORY) : base.metrics.sessions,
      comeback_success: Math.max(0, Math.floor(Number(metrics.comeback_success) || 0)),
      streak_saves: Math.max(0, Math.floor(Number(metrics.streak_saves) || 0)),
    },
    comeback_mission: sanitizeMission(input?.comeback_mission),
  };
}

function readState() {
  if (typeof window === 'undefined' || !window.localStorage) return createInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    return sanitizeState(JSON.parse(raw));
  } catch (_) {
    return createInitialState();
  }
}

function writeState(nextState = state) {
  state = sanitizeState(nextState);
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function dispatch(name, detail = {}) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

function detectGameId() {
  for (const id of Object.keys(GAME_ID_MAP)) {
    if (document.getElementById(id)) return GAME_ID_MAP[id];
  }
  const path = (location.pathname || '').toLowerCase();
  if (path.includes('invaders')) return 'invaders';
  if (path.includes('breakout')) return 'breakout';
  if (path.includes('pac-chain')) return 'pacchain';
  if (path.includes('tetris')) return 'tetris';
  if (path.includes('asteroid')) return 'asteroid-fork';
  if (path.includes('block-topia-quest-maze')) return 'btqm';
  if (path.includes('crystal-quest')) return 'crystal';
  // HexGL is deprecated and disabled as XP source. Invaders 3008 is current arcade leaderboard/XP source.
  return 'global';
}

function getRotationGames() {
  // HexGL is deprecated and disabled as XP source. Invaders 3008 is current arcade leaderboard/XP source.
  return ['snake', 'crystal', 'btqm', 'invaders', 'pacchain', 'breakout', 'tetris', 'asteroid-fork'];
}

function getFeaturedWindow(now = nowMs()) {
  const slotStart = Math.floor(now / FEATURED_SLOT_MS) * FEATURED_SLOT_MS;
  const slotEnd = slotStart + FEATURED_SLOT_MS;
  if (featuredCacheSlot !== slotStart) {
    const games = getRotationGames();
    const index = Math.floor(slotStart / FEATURED_SLOT_MS) % games.length;
    featuredCacheSlot = slotStart;
    featuredCacheGame = games[(index + games.length) % games.length] || 'snake';
  }
  return {
    id: `featured-${Math.floor(slotStart / FEATURED_SLOT_MS)}`,
    game: featuredCacheGame,
    label: `Featured ${String(featuredCacheGame).toUpperCase()} bonus active`,
    starts_at: slotStart,
    ends_at: slotEnd,
    countdown_ms: Math.max(0, slotEnd - now),
  };
}

function getQuestChainContext(now = nowMs()) {
  try {
    const meta = ArcadeMeta.getState();
    const active = Array.isArray(meta?.quests?.active) ? meta.quests.active : [];
    const chain = active
      .filter((quest) => Number(quest?.chain_step) > 1)
      .sort((a, b) => Number(b.chain_step || 0) - Number(a.chain_step || 0))[0] || null;
    if (!chain) return null;
    return {
      id: String(chain.id || 'chain'),
      step: Math.max(1, Number(chain.chain_step) || 1),
      total_steps: 3,
      title: String(chain.title || 'Quest chain'),
      expires_at: Number(chain.expires_at) || (now + QUEST_EXPIRY_WARNING_MS),
      expires_in_ms: Math.max(0, (Number(chain.expires_at) || now) - now),
    };
  } catch (_) {
    return null;
  }
}

function getReturnHook(now = nowMs()) {
  const gap = Math.max(0, now - (Number(state.last_played_at) || 0));
  if (!state.last_played_at) return null;
  if (gap >= RETURN_CRITICAL_MS) {
    return { key: 'streak-save', label: '1 run to save streak', urgency: 'critical', inactive_ms: gap };
  }
  if (gap >= RETURN_WARNING_MS) {
    return { key: 'chaos-window', label: 'Chaos window live now', urgency: 'high', inactive_ms: gap };
  }
  const chain = getQuestChainContext(now);
  if (chain && chain.expires_in_ms <= QUEST_EXPIRY_WARNING_MS) {
    return { key: 'quest-expiry', label: 'Quest chain expires soon', urgency: 'high', inactive_ms: gap };
  }
  const featured = getFeaturedWindow(now);
  if (featured.countdown_ms <= FEATURED_RETURN_WINDOW_MS) {
    return { key: 'featured-window', label: 'Featured game bonus active', urgency: 'medium', inactive_ms: gap };
  }
  return null;
}

function buildMission(now = nowMs()) {
  const gap = Math.max(0, now - (Number(state.last_played_at) || 0));
  const streakPressure = safeGetComebackPressure(now);
  if (streakPressure?.urgency === 'critical') {
    return {
      id: `mission-streak-${now.toString(36)}`,
      type: 'streak-save',
      label: 'Save your streak right now',
      created_at: now,
      expires_at: now + STREAK_MISSION_DURATION_MS,
      target_runs: 1,
      target_unique_games: 0,
      progress_runs: 0,
      progress_games: [],
      completed: false,
      completed_at: null,
      origin_gap_ms: gap,
    };
  }
  if (gap >= LONG_ABSENCE_THRESHOLD_MS) {
    return {
      id: `mission-switch-${now.toString(36)}`,
      type: 'switch-return',
      label: 'Play 2 different games in 10 mins',
      created_at: now,
      expires_at: now + DEFAULT_MISSION_DURATION_MS,
      target_runs: 2,
      target_unique_games: 2,
      progress_runs: 0,
      progress_games: [],
      completed: false,
      completed_at: null,
      origin_gap_ms: gap,
    };
  }
  return {
    id: `mission-runs-${now.toString(36)}`,
    type: 'run-return',
    label: 'Return and clear 2 runs in 10 mins',
    created_at: now,
    expires_at: now + DEFAULT_MISSION_DURATION_MS,
    target_runs: 2,
    target_unique_games: 0,
    progress_runs: 0,
    progress_games: [],
    completed: false,
    completed_at: null,
    origin_gap_ms: gap,
  };
}

function maybeExpireMission(now = nowMs()) {
  const mission = state.comeback_mission;
  if (!mission) return;
  if (mission.completed) return;
  if (Number(mission.expires_at) > now) return;
  state.comeback_mission = null;
  writeState();
  pushUpdate();
}

function maybeGenerateComebackMission(now = nowMs()) {
  maybeExpireMission(now);
  const mission = state.comeback_mission;
  if (mission && !mission.completed && Number(mission.expires_at) > now) return mission;
  const gap = Math.max(0, now - (Number(state.last_played_at) || 0));
  if (!state.last_played_at || gap < COMEBACK_THRESHOLD_MS) return null;
  const created = buildMission(now);
  state.comeback_mission = created;
  writeState();
  emitPrompt('comeback-mission', created.label, {
    urgency: 'high',
    countdown_ms: Math.max(0, Number(created.expires_at) - now),
    sound: 'meta-comeback-prompt',
  });
  pushUpdate();
  return created;
}

function shouldPrompt(key, now = nowMs(), cooldownMs = PROMPT_KEY_COOLDOWN_MS) {
  const session = state.session;
  if (runActive) return false;
  if (!session.id) ensureSession(now);
  if ((session.prompt_count || 0) >= MAX_PROMPTS_PER_SESSION) return false;
  if (now - Number(state.last_prompt_at || 0) < PROMPT_GAP_MS) return false;
  const lastGlobal = Number(state.recent_prompt_keys?.[key] || 0);
  if (now - lastGlobal < cooldownMs) return false;
  const lastSession = Number(session.prompt_keys?.[key] || 0);
  if (now - lastSession < cooldownMs) return false;
  return true;
}

function markPrompt(key, now = nowMs()) {
  if (!state.recent_prompt_keys || typeof state.recent_prompt_keys !== 'object') state.recent_prompt_keys = {};
  state.recent_prompt_keys[key] = now;
  state.last_prompt_at = now;
  if (!state.session.prompt_keys || typeof state.session.prompt_keys !== 'object') state.session.prompt_keys = {};
  state.session.prompt_keys[key] = now;
  state.session.prompt_count = Math.max(0, Number(state.session.prompt_count) || 0) + 1;
}

function ensureUi() {
  if (root || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'arcade-retention-style';
  style.textContent = `
    #arcade-retention-root{position:fixed;inset:0;pointer-events:none;z-index:10001}
    #arcade-retention-toasts{position:fixed;top:16px;right:16px;display:grid;gap:8px;max-width:300px}
    .arcade-retention-toast{pointer-events:none;background:rgba(8,12,22,.92);border:1px solid rgba(255,255,255,.16);color:#fff;border-radius:10px;padding:10px 12px;font-size:.76rem;font-weight:700;line-height:1.3;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    .arcade-retention-toast.critical{border-color:rgba(255,84,84,.75)}
    .arcade-retention-toast.high{border-color:rgba(247,171,26,.8)}
    .arcade-retention-toast.medium{border-color:rgba(46,197,255,.75)}
    #arcade-retention-banner{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(11,16,28,.92);border:1px solid rgba(247,201,72,.45);border-radius:999px;padding:8px 14px;color:#f5f8ff;font-size:.73rem;font-weight:700;opacity:0;transition:opacity .18s ease,transform .18s ease}
    #arcade-retention-banner.active{opacity:1;transform:translateX(-50%) scale(1.03)}
    #arcade-retention-mission-chip{position:fixed;right:16px;bottom:80px;background:rgba(247,201,72,.14);border:1px solid rgba(247,201,72,.62);color:#fff;border-radius:999px;padding:7px 12px;font-size:.68rem;font-weight:800;letter-spacing:.02em;max-width:280px;line-height:1.2}
    #arcade-retention-mission-chip.pulse{animation:retentionPulse .6s ease-in-out infinite alternate}
    body.overlay-open #arcade-retention-mission-chip{display:none!important}
    @keyframes retentionPulse{0%{transform:scale(1)}100%{transform:scale(1.03)}}
  `;
  document.head.appendChild(style);
  root = document.createElement('div');
  root.id = 'arcade-retention-root';
  root.innerHTML = '<div id="arcade-retention-toasts"></div><div id="arcade-retention-banner"></div><div id="arcade-retention-mission-chip" style="display:none"></div>';
  document.body.appendChild(root);
  toastRoot = root.querySelector('#arcade-retention-toasts');
  banner = root.querySelector('#arcade-retention-banner');
  missionChip = root.querySelector('#arcade-retention-mission-chip');
}

function playCue(sound) {
  if (!sound) return;
  try { playSound(sound); } catch (_) {}
}

function showToast(message, opts = {}) {
  ensureUi();
  if (!toastRoot || !message) return;
  const key = String(opts.key || message).slice(0, MAX_TOAST_KEY_LENGTH);
  const duplicate = Array.from(toastRoot.children).some((node) => node?.dataset?.key === key);
  if (duplicate) return;
  const toast = document.createElement('div');
  toast.className = `arcade-retention-toast ${opts.urgency || 'medium'}`;
  toast.dataset.key = key;
  const countdown = Number(opts.countdown_ms) > 0 ? ` • ${formatCountdown(Number(opts.countdown_ms))}` : '';
  toast.textContent = `${message}${countdown}`;
  toastRoot.appendChild(toast);
  setTimeout(() => { toast.remove(); }, clamp(Number(opts.duration_ms) || 2400, 1200, 4200));
}

function showBanner(message, durationMs = 2200) {
  ensureUi();
  if (!banner || !message || runActive) return;
  banner.textContent = String(message);
  banner.classList.add('active');
  setTimeout(() => banner.classList.remove('active'), clamp(durationMs, 1200, 4200));
}

function updateMissionChip(context = getLiveContext()) {
  ensureUi();
  if (!missionChip) return;
  const mission = context.comeback_mission;
  if (!mission || mission.completed) {
    missionChip.style.display = 'none';
    missionChip.classList.remove('pulse');
    return;
  }
  const remain = Math.max(0, Number(mission.expires_at) - nowMs());
  missionChip.style.display = 'block';
  missionChip.textContent = `MISSION • ${mission.label} • ${formatCountdown(remain)}`;
  missionChip.classList.toggle('pulse', remain <= MISSION_URGENT_WINDOW_MS);
}

function safeGetComebackPressure(now = nowMs()) {
  try {
    return ArcadeMeta.getComebackPressure(now);
  } catch (_) {
    return null;
  }
}

function ensureSession(now = nowMs()) {
  const session = state.session;
  const idle = now - Number(session.last_activity_at || 0);
  if (!session.id || !session.started_at || idle > SESSION_IDLE_MS) {
    closeSession(now);
    state.session = {
      id: `sess-${now.toString(36)}`,
      started_at: now,
      first_run_at: null,
      last_activity_at: now,
      runs: 0,
      game_switches: 0,
      games: [],
      prompt_count: 0,
      prompt_keys: {},
    };
  }
  state.session.last_activity_at = now;
}

function closeSession(now = nowMs()) {
  const current = state.session;
  if (!current?.id || !current?.started_at) return;
  const record = {
    id: current.id,
    started_at: Number(current.started_at),
    ended_at: now,
    length_ms: Math.max(0, now - Number(current.started_at)),
    first_run_at: Number(current.first_run_at) || null,
    runs: Math.max(0, Number(current.runs) || 0),
    game_switches: Math.max(0, Number(current.game_switches) || 0),
    comeback_success: !!(state.comeback_mission && state.comeback_mission.completed),
    streak_saved: false,
  };
  state.metrics.sessions.push(record);
  if (state.metrics.sessions.length > MAX_SESSION_HISTORY) {
    state.metrics.sessions = state.metrics.sessions.slice(-MAX_SESSION_HISTORY);
  }
  state.session = {
    id: null,
    started_at: null,
    first_run_at: null,
    last_activity_at: null,
    runs: 0,
    game_switches: 0,
    games: [],
    prompt_count: 0,
    prompt_keys: {},
  };
}

function markStreakSave(now = nowMs()) {
  state.metrics.streak_saves = Math.max(0, Number(state.metrics.streak_saves) || 0) + 1;
  emitPrompt('streak-save', '1 run to save streak', {
    urgency: 'critical',
    cooldownMs: STREAK_WARNING_COOLDOWN_MS,
    sound: 'meta-streak-save-warning',
  });
}

function updateMissionProgress(game, now = nowMs()) {
  const mission = state.comeback_mission;
  if (!mission || mission.completed || Number(mission.expires_at) <= now) return;
  mission.progress_runs = Math.max(0, Number(mission.progress_runs) || 0) + 1;
  if (!Array.isArray(mission.progress_games)) mission.progress_games = [];
  mission.progress_games.push(String(game || 'global'));
  mission.progress_games = mission.progress_games.slice(-10);

  const uniqueGames = new Set(mission.progress_games).size;
  const runGoalMet = mission.progress_runs >= Number(mission.target_runs || 1);
  const gameGoalMet = uniqueGames >= Number(mission.target_unique_games || 0);
  if (runGoalMet && gameGoalMet) {
    mission.completed = true;
    mission.completed_at = now;
    state.metrics.comeback_success = Math.max(0, Number(state.metrics.comeback_success) || 0) + 1;
    emitPrompt('mission-complete', 'Comeback mission complete', {
      urgency: 'medium',
      sound: 'meta-comeback-prompt',
      duration_ms: 2600,
    });
  }
}

function registerRun(game, now = nowMs()) {
  ensureSession(now);
  const session = state.session;
  if (!session.first_run_at) session.first_run_at = now;
  session.runs = Math.max(0, Number(session.runs) || 0) + 1;
  if (state.last_game && game && state.last_game !== game) {
    session.game_switches = Math.max(0, Number(session.game_switches) || 0) + 1;
  }
  if (!Array.isArray(session.games)) session.games = [];
  session.games.push(String(game || 'global'));
  session.games = session.games.slice(-30);

  const hadPressure = !!safeGetComebackPressure(now);
  state.last_played_at = now;
  state.last_game = String(game || 'global');

  updateMissionProgress(game, now);
  if (hadPressure) markStreakSave(now);
  writeState();
  pushUpdate();
}

function getSessionMetrics() {
  const session = state.session || {};
  const now = nowMs();
  const startedAt = Number(session.started_at) || null;
  const firstRunAt = Number(session.first_run_at) || null;
  return {
    session_id: session.id || null,
    started_at: startedAt,
    first_run_at: firstRunAt,
    length_ms: startedAt ? Math.max(0, now - startedAt) : 0,
    runs: Math.max(0, Number(session.runs) || 0),
    game_switches: Math.max(0, Number(session.game_switches) || 0),
    comeback_success_total: Math.max(0, Number(state.metrics?.comeback_success) || 0),
    streak_saves_total: Math.max(0, Number(state.metrics?.streak_saves) || 0),
  };
}

function getLiveContext(now = nowMs()) {
  maybeExpireMission(now);
  const featured = getFeaturedWindow(now);
  const returnHook = getReturnHook(now);
  const chain = getQuestChainContext(now);
  const mission = state.comeback_mission && Number(state.comeback_mission.expires_at) > now
    ? deepClone(state.comeback_mission)
    : null;
  return {
    featured_window: featured,
    return_hook: returnHook,
    quest_chain: chain,
    comeback_mission: mission,
    session_metrics: getSessionMetrics(),
  };
}

function emitPrompt(key, message, opts = {}) {
  const now = nowMs();
  const cooldownMs = Number(opts.cooldownMs) || PROMPT_KEY_COOLDOWN_MS;
  if (!shouldPrompt(key, now, cooldownMs)) return false;
  markPrompt(key, now);
  writeState();
  const payload = {
    key,
    message,
    urgency: opts.urgency || 'medium',
    countdown_ms: Number(opts.countdown_ms) || 0,
    timestamp: now,
  };
  dispatch('arcade-retention-prompt', payload);
  showToast(message, { ...opts, key, countdown_ms: payload.countdown_ms });
  if (opts.banner !== false) showBanner(message, Number(opts.duration_ms) || 2200);
  playCue(opts.sound || null);
  return true;
}

function maybeEmitHooks(now = nowMs()) {
  const context = getLiveContext(now);
  if (context.return_hook) {
    let sound = null;
    if (context.return_hook.key === 'streak-save') sound = 'meta-streak-save-warning';
    else if (context.return_hook.key === 'featured-window') sound = 'meta-featured-window';
    emitPrompt(context.return_hook.key, context.return_hook.label, {
      urgency: context.return_hook.urgency,
      countdown_ms: 0,
      sound,
      banner: true,
    });
  }

  const chain = context.quest_chain;
  if (chain && chain.step > 1 && chain.expires_in_ms <= QUEST_EXPIRY_PROMPT_MS) {
    emitPrompt('quest-chain-live', `Quest chain expires in ${formatCountdown(chain.expires_in_ms)}`, {
      urgency: 'high',
      countdown_ms: chain.expires_in_ms,
      sound: 'meta-chain-unlock',
    });
  }

  if (context.featured_window && context.featured_window.countdown_ms <= FEATURED_PROMPT_WINDOW_MS) {
    emitPrompt('featured-window', context.featured_window.label, {
      urgency: 'medium',
      countdown_ms: context.featured_window.countdown_ms,
      sound: 'meta-featured-window',
    });
  }
}

function pushUpdate() {
  const context = getLiveContext();
  updateMissionChip(context);
  dispatch('arcade-retention-update', context);
}

function wireLifecycle() {
  document.addEventListener('arcade-run-start', () => {
    runActive = true;
    ensureSession(nowMs());
    writeState();
    pushUpdate();
  });

  const onRunEnd = () => {
    if (!runActive) return;
    runActive = false;
    registerRun(detectGameId(), nowMs());
    maybeEmitHooks(nowMs());
  };

  document.addEventListener('arcade-run-game-over', onRunEnd);
  document.addEventListener('arcade-run-reset', onRunEnd);

  document.addEventListener('arcade-overlay-exit', () => {
    runActive = false;
    closeSession(nowMs());
    writeState();
    pushUpdate();
  });

  document.addEventListener('arcade-meta-quest-created', (ev) => {
    const quest = ev?.detail?.quest;
    if (!quest || Number(quest.chain_step) <= 1) return;
    emitPrompt('chain-unlock', `Chain ${quest.chain_step} unlocked`, {
      urgency: 'medium',
      sound: 'meta-chain-unlock',
      banner: false,
      duration_ms: 1900,
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      ensureSession(nowMs());
      maybeGenerateComebackMission(nowMs());
      maybeEmitHooks(nowMs());
      pushUpdate();
      writeState();
    }
  });
}

function isGamePage() {
  return !!document.getElementById('startBtn') && !!document.querySelector('.game-card');
}

function init() {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;
  ensureUi();
  ensureSession(nowMs());
  maybeGenerateComebackMission(nowMs());
  maybeEmitHooks(nowMs());
  pushUpdate();
  wireLifecycle();
  setInterval(() => {
    maybeExpireMission(nowMs());
    maybeGenerateComebackMission(nowMs());
    pushUpdate();
    if (!runActive) maybeEmitHooks(nowMs());
    writeState();
  }, 15000);
}

const ArcadeRetentionEngine = {
  init,
  getState() {
    return sanitizeState(state);
  },
  getLiveContext,
  emitPrompt,
};

if (typeof window !== 'undefined') {
  window.ArcadeRetentionEngine = ArcadeRetentionEngine;
  if (isGamePage() || (location.pathname || '').toLowerCase().includes('/games/leaderboard')) {
    init();
  }
}

export { ArcadeRetentionEngine };
