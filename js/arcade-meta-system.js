const STORAGE_KEY = 'arcade_meta';
const MAX_HISTORY = 300;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const MINUTE_MS = 60 * 1000;
// Keep aligned with the leaderboard worker season anchor for consistent seasonal windows.
const SEASON_EPOCH_MS = Date.UTC(2024, 0, 1);
let questCounter = 0;
let liveEventTimer = null;
let lastLiveEventAt = 0;
const LIVE_EVENT_COOLDOWN_MS = 25 * 1000;

const DEFAULT_CONFIG = {
  difficultyWeights: {
    btqm: 1.5,
    invaders: 1.4,
    breakout: 1.2,
    pacchain: 1.1,
    tetris: 1.0,
    snake: 0.9,
  },
  gameAliases: {
    blocktopia: 'btqm',
    'block-topia-quest-maze': 'btqm',
  },
  quest: {
    minActive: 3,
    maxActive: 5,
    ttlMinMs: 5 * 60 * 1000,
    ttlMaxMs: 18 * 60 * 1000,
    maxQuestMultiplierBonus: 1.2,
    scoreTarget: 800,
  },
  antiFarm: {
    diminishingStart: 3,
    diminishingStep: 0.1,
    diminishingFloor: 0.35,
    repeatWindow: 6,
    repeatPenaltyStart: 3,
    repeatPenaltyStep: 0.08,
    repeatPenaltyFloor: 0.5,
    maxPerRunPoints: 50000,
    dailyCap: 200000,
  },
  timing: {
    defaultTargetSeconds: 120,
    targetSecondsByGame: {
      btqm: 150,
      invaders: 140,
      breakout: 120,
      pacchain: 120,
      tetris: 120,
      snake: 90,
    },
    minWeight: 0.6,
    maxWeight: 1.4,
  },
  streak: {
    sessionGapMs: 45 * 60 * 1000,
    quickReturnMs: 10 * 60 * 1000,
    switchWindowMs: 20 * 60 * 1000,
    sessionStep: 0.05,
    quickStep: 0.03,
    switchStep: 0.04,
    maxMultiplierBonus: 0.45,
  },
  event: {
    weekendMultiplier: 0.1,
  },
  featuredChaos: {
    slotHours: 3,
    gameBoostMultiplier: 0.12,
    questTargetDiscount: 0.15,
    chaosChanceBoost: 0.015,
  },
  comeback: {
    warningAfterMs: 25 * MINUTE_MS,
    criticalAfterMs: 42 * MINUTE_MS,
  },
  rare: {
    baseChance: 0.015,
    durationMs: 10 * MINUTE_MS,
    questTargetDiscount: 0.2,
    switchBonusMultiplier: 2,
    chaosChanceBoost: 0.03,
    featuredGameBoost: 0.18,
  },
  roguelite: {
    dailyQuestCount: 12,
    rabbitMin: 2,
    rabbitMax: 4,
    popupRabbitMin: 1,
    popupRabbitMax: 3,
    maxRabbitHoles: 9,
    rabbitTtlMs: 18 * MINUTE_MS,
    dailyBonusMultiplier: 0.08,
    rabbitBonusMultiplier: 0.12,
    riskBonusMultiplier: 0.2,
    branchCount: 3,
  },
};

let config = deepClone(DEFAULT_CONFIG);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

// Dispatch a DOM CustomEvent for UI listeners. Silently skipped in non-browser contexts.
function dispatchMetaEvent(name, detail) {
  if (typeof document === 'undefined') return;
  try {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  } catch (_) {}
}

function toUtcDateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function toUtcMonthKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toUtcWeekKey(ms) {
  const d = new Date(ms);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || DAYS_PER_WEEK;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / MS_PER_DAY) + 1) / DAYS_PER_WEEK);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function toSeasonKey(ms) {
  const seasonLengthMs = 90 * MS_PER_DAY;
  const seasonIndex = Math.floor((ms - SEASON_EPOCH_MS) / seasonLengthMs);
  return `S${seasonIndex + 1}`;
}

function nowMs() {
  return Date.now();
}

function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Date.parse(value);
    if (Number.isFinite(n)) return n;
  }
  return nowMs();
}

function readState() {
  const empty = createInitialState();
  if (typeof window === 'undefined' || !window.localStorage) return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    return sanitizeState(parsed);
  } catch {
    return empty;
  }
}

function writeState(state) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function createInitialState() {
  const now = nowMs();
  return {
    player: '',
    daily: { key: toUtcDateKey(now), points: 0 },
    weekly: { key: toUtcWeekKey(now), points: 0 },
    monthly: { key: toUtcMonthKey(now), points: 0 },
    seasonal: { key: toSeasonKey(now), points: 0 },
    quests: { active: [], completed: [] },
    streak: {
      count: 0,
      session_chain: 0,
      quick_chain: 0,
      switch_chain: 0,
      last_day: null,
      last_played_at: null,
      last_game: null,
    },
    history: [],
    retention: {
      rare_event: null,
      last_incentive_at: null,
      last_incentive_type: null,
    },
    engagement: createInitialEngagement(now),
  };
}

function createInitialEngagement(now = nowMs()) {
  return {
    day_key: toUtcDateKey(now),
    daily_quests: [],
    rabbit_holes: [],
    next_branches: [],
    completed_tasks: [],
    streak_days: 0,
    last_completed_day: null,
    total_auto_submits: 0,
  };
}

function sanitizeTask(input) {
  if (!input || typeof input !== 'object') return null;
  const taskGame = typeof input.game === 'string'
    ? (input.game === 'asteroid-fork' ? 'asteroids' : input.game)
    : null;
  return {
    id: String(input.id || makeQuestId('engage')),
    type: String(input.type || 'score_target'),
    path: String(input.path || 'easy'),
    title: String(input.title || 'Keep the loop alive'),
    description: String(input.description || 'Complete a valid arcade action.'),
    game: taskGame,
    target: Number.isFinite(Number(input.target)) ? Number(input.target) : null,
    required_runs: Number.isFinite(Number(input.required_runs)) ? Math.max(1, Math.floor(Number(input.required_runs))) : null,
    required_unique_games: Number.isFinite(Number(input.required_unique_games)) ? Math.max(1, Math.floor(Number(input.required_unique_games))) : null,
    min_duration_ms: Number.isFinite(Number(input.min_duration_ms)) ? Math.max(1000, Math.floor(Number(input.min_duration_ms))) : null,
    switches: Number.isFinite(Number(input.switches)) ? Math.max(1, Math.floor(Number(input.switches))) : null,
    window_ms: Number.isFinite(Number(input.window_ms)) ? Math.max(30 * 1000, Math.floor(Number(input.window_ms))) : null,
    created_at: Number(input.created_at) || nowMs(),
    expires_at: Number(input.expires_at) || null,
    bonus_multiplier: Number.isFinite(Number(input.bonus_multiplier)) ? Math.max(0, Number(input.bonus_multiplier)) : 0,
    source: String(input.source || 'daily'),
    chain_depth: Math.max(0, Math.floor(Number(input.chain_depth) || 0)),
    completed: !!input.completed,
    completed_at: Number(input.completed_at) || null,
  };
}

function getRogueliteLimits() {
  const dailyAvailable = DAILY_ROGUELITE_QUESTS.length;
  const configuredDaily = Math.floor(Number(config.roguelite?.dailyQuestCount) || dailyAvailable);
  const configuredRabbitCap = Math.floor(Number(config.roguelite?.maxRabbitHoles) || 9);
  const branchAvailable = Object.keys(BRANCH_PATH_TEMPLATES).length;
  const configuredBranchCount = Math.floor(Number(config.roguelite?.branchCount) || branchAvailable);
  return {
    dailyQuestCount: Math.min(dailyAvailable, Math.max(1, configuredDaily)),
    maxRabbitHoles: Math.max(4, configuredRabbitCap),
    branchCount: Math.min(branchAvailable, Math.max(1, configuredBranchCount)),
  };
}

function sanitizeEngagement(input, fallback) {
  const source = input && typeof input === 'object' ? input : {};
  const limits = getRogueliteLimits();
  return {
    day_key: typeof source.day_key === 'string' ? source.day_key : fallback.day_key,
    daily_quests: Array.isArray(source.daily_quests) ? source.daily_quests.map(sanitizeTask).filter(Boolean).slice(0, limits.dailyQuestCount) : [],
    rabbit_holes: Array.isArray(source.rabbit_holes) ? source.rabbit_holes.map(sanitizeTask).filter(Boolean).slice(-limits.maxRabbitHoles) : [],
    next_branches: Array.isArray(source.next_branches) ? source.next_branches.map(sanitizeTask).filter(Boolean).slice(-limits.branchCount) : [],
    completed_tasks: Array.isArray(source.completed_tasks) ? source.completed_tasks.map(sanitizeTask).filter(Boolean).slice(-240) : [],
    streak_days: Math.max(0, Math.floor(Number(source.streak_days) || 0)),
    last_completed_day: typeof source.last_completed_day === 'string' ? source.last_completed_day : null,
    total_auto_submits: Math.max(0, Math.floor(Number(source.total_auto_submits) || 0)),
  };
}

function sanitizeState(input) {
  const base = createInitialState();
  return {
    player: typeof input.player === 'string' ? input.player : base.player,
    daily: sanitizeWindow(input.daily, base.daily),
    weekly: sanitizeWindow(input.weekly, base.weekly),
    monthly: sanitizeWindow(input.monthly, base.monthly),
    seasonal: sanitizeWindow(input.seasonal, base.seasonal),
    quests: {
      active: Array.isArray(input?.quests?.active) ? input.quests.active.filter(Boolean) : [],
      completed: Array.isArray(input?.quests?.completed) ? input.quests.completed.filter(Boolean).slice(-200) : [],
    },
    streak: sanitizeStreak(input?.streak, base.streak),
    history: Array.isArray(input.history) ? input.history.slice(-MAX_HISTORY) : [],
    retention: {
      rare_event: (input?.retention?.rare_event && typeof input.retention.rare_event === 'object')
        ? input.retention.rare_event
        : null,
      last_incentive_at: Number.isFinite(Number(input?.retention?.last_incentive_at))
        ? Number(input.retention.last_incentive_at)
        : null,
      last_incentive_type: typeof input?.retention?.last_incentive_type === 'string'
        ? input.retention.last_incentive_type
        : null,
    },
    engagement: sanitizeEngagement(input?.engagement, base.engagement),
  };
}

function sanitizeWindow(current, fallback) {
  const key = typeof current?.key === 'string' ? current.key : fallback.key;
  const points = Number.isFinite(Number(current?.points)) ? Math.max(0, Number(current.points)) : 0;
  return { key, points };
}

function sanitizeStreak(current, fallback) {
  const count = Number.isFinite(Number(current?.count)) ? Math.max(0, Math.floor(Number(current.count))) : 0;
  const sessionChain = Number.isFinite(Number(current?.session_chain))
    ? Math.max(0, Math.floor(Number(current.session_chain)))
    : 0;
  return {
    count,
    session_chain: sessionChain,
    quick_chain: Number.isFinite(Number(current?.quick_chain)) ? Math.max(0, Math.floor(Number(current.quick_chain))) : 0,
    switch_chain: Number.isFinite(Number(current?.switch_chain)) ? Math.max(0, Math.floor(Number(current.switch_chain))) : 0,
    last_day: typeof current?.last_day === 'string' ? current.last_day : fallback.last_day,
    last_played_at: Number.isFinite(Number(current?.last_played_at)) ? Number(current.last_played_at) : fallback.last_played_at,
    last_game: typeof current?.last_game === 'string' ? current.last_game : fallback.last_game,
  };
}

function normalizeGame(game) {
  const cleaned = String(game || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return config.gameAliases[cleaned] || cleaned;
}

function normalizeStorageGame(game) {
  if (game === 'asteroid-fork') return 'asteroids';
  return game;
}

function getDifficultyWeight(game) {
  return Number(config.difficultyWeights[game]) || 1;
}

function computeTimeWeight(game, duration) {
  const durationNum = Number(duration);
  if (!Number.isFinite(durationNum) || durationNum <= 0) return 1;
  const targetSec = Number(config.timing.targetSecondsByGame[game]) || Number(config.timing.defaultTargetSeconds) || 120;
  const ratio = (targetSec * 1000) / durationNum;
  return clamp(ratio, Number(config.timing.minWeight), Number(config.timing.maxWeight));
}

function updateWindow(windowState, key) {
  if (windowState.key !== key) {
    windowState.key = key;
    windowState.points = 0;
  }
}

function updateStreakState(state, run) {
  const lastPlayedAt = Number(state.streak.last_played_at);
  const lastGame = state.streak.last_game;
  const hasPrev = Number.isFinite(lastPlayedAt) && lastPlayedAt > 0;
  const gap = hasPrev ? run.timestamp - lastPlayedAt : null;

  const sessionGapMs = Number(config.streak.sessionGapMs);
  if (!hasPrev || !Number.isFinite(gap) || gap > sessionGapMs || gap < 0) {
    state.streak.session_chain = 1;
    state.streak.quick_chain = 0;
    state.streak.switch_chain = 0;
  } else {
    state.streak.session_chain = Math.max(1, Number(state.streak.session_chain || 0) + 1);

    if (gap <= Number(config.streak.quickReturnMs)) {
      state.streak.quick_chain = Math.max(1, Number(state.streak.quick_chain || 0) + 1);
    } else {
      state.streak.quick_chain = 0;
    }

    if (lastGame && run.game !== lastGame && gap <= Number(config.streak.switchWindowMs)) {
      state.streak.switch_chain = Math.max(1, Number(state.streak.switch_chain || 0) + 1);
    } else {
      state.streak.switch_chain = 0;
    }
  }

  state.streak.last_played_at = run.timestamp;
  state.streak.last_game = run.game;
  state.streak.last_day = run.day;
  state.streak.count = state.streak.session_chain;
  return state.streak;
}

function countDailyRuns(history, dayKey, game) {
  return history.filter((h) => h?.day === dayKey && h?.game === game).length;
}

function countRecentSameGame(history, game, limit) {
  const recent = history.slice(-Math.max(0, limit));
  return recent.filter((h) => h?.game === game).length;
}

function diminishingMultiplier(runCountToday) {
  const start = config.antiFarm.diminishingStart;
  if (runCountToday < start) return 1;
  const over = runCountToday - start + 1;
  return clamp(1 - over * config.antiFarm.diminishingStep, config.antiFarm.diminishingFloor, 1);
}

function repeatPenaltyMultiplier(recentSameGameRuns) {
  const start = config.antiFarm.repeatPenaltyStart;
  if (recentSameGameRuns < start) return 1;
  const over = recentSameGameRuns - start + 1;
  return clamp(1 - over * config.antiFarm.repeatPenaltyStep, config.antiFarm.repeatPenaltyFloor, 1);
}

function makeQuestId(prefix) {
  questCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${questCounter.toString(36)}`;
}

function randomInRange(min, max) {
  const lo = Math.floor(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function getChaosGameRotation() {
  return ['snake', 'crystal', 'btqm', 'invaders', 'pacchain', 'breakout', 'tetris', 'asteroids'];
}

function getFeaturedChaosWindow(now = nowMs()) {
  const slotHours = Math.max(1, Number(config.featuredChaos?.slotHours) || 3);
  const slotMs = slotHours * 60 * 60 * 1000;
  const slotStart = Math.floor(now / slotMs) * slotMs;
  const slotEnd = slotStart + slotMs;
  const rotation = getChaosGameRotation();
  const index = Math.floor(slotStart / slotMs) % rotation.length;
  const game = rotation[(index + rotation.length) % rotation.length] || 'snake';
  return {
    id: `featured-chaos-${Math.floor(slotStart / slotMs)}`,
    type: 'featured-chaos-window',
    label: `Featured chaos: ${game.toUpperCase()}`,
    game,
    starts_at: slotStart,
    ends_at: slotEnd,
    boost_multiplier: Number(config.featuredChaos?.gameBoostMultiplier) || 0,
    quest_target_discount: Number(config.featuredChaos?.questTargetDiscount) || 0,
    chaos_chance_boost: Number(config.featuredChaos?.chaosChanceBoost) || 0,
  };
}

function getDefaultRareEventTemplates(now, run) {
  return [
    {
      id: `rare-score-target-drop-${now.toString(36)}`,
      type: 'rare-score-target-drop',
      label: 'WTF: score targets lowered',
      starts_at: now,
      ends_at: now + (Number(config.rare?.durationMs) || (10 * MINUTE_MS)),
      modifiers: { quest_target_discount: Number(config.rare?.questTargetDiscount) || 0 },
    },
    {
      id: `rare-switch-chain-surge-${now.toString(36)}`,
      type: 'rare-switch-chain-surge',
      label: 'WTF: switch-chain bonus doubled',
      starts_at: now,
      ends_at: now + (Number(config.rare?.durationMs) || (10 * MINUTE_MS)),
      modifiers: { switch_bonus_multiplier: Number(config.rare?.switchBonusMultiplier) || 2 },
    },
    {
      id: `rare-chaos-boost-${now.toString(36)}`,
      type: 'rare-chaos-boost',
      label: 'WTF: chaos trigger chance boosted',
      starts_at: now,
      ends_at: now + (Number(config.rare?.durationMs) || (10 * MINUTE_MS)),
      modifiers: { chaos_chance_boost: Number(config.rare?.chaosChanceBoost) || 0 },
    },
    {
      id: `rare-game-surge-${now.toString(36)}`,
      type: 'rare-featured-game-surge',
      label: `WTF: ${String(run?.game || 'ARCADE').toUpperCase()} surge`,
      starts_at: now,
      ends_at: now + (Number(config.rare?.durationMs) || (10 * MINUTE_MS)),
      modifiers: {
        game: String(run?.game || 'snake'),
        game_boost_multiplier: Number(config.rare?.featuredGameBoost) || 0,
      },
    },
  ];
}

function getActiveRareEvent(state, now = nowMs()) {
  const rare = state?.retention?.rare_event;
  if (!rare || Number(rare.ends_at) <= now) return null;
  return rare;
}

function maybeTriggerRareEvent(state, now, run) {
  const active = getActiveRareEvent(state, now);
  if (active) return active;
  const chance = Math.max(0, Number(config.rare?.baseChance) || 0);
  if (Math.random() > chance) return null;
  const templates = getDefaultRareEventTemplates(now, run);
  const selected = templates[Math.floor(Math.random() * templates.length)] || null;
  if (!selected) return null;
  if (!state.retention) state.retention = {};
  state.retention.rare_event = selected;
  dispatchMetaEvent('arcade-meta-live-event', {
    event: selected,
    source: 'rare-global',
    context: { game: run?.game || null, force: true },
  });
  return selected;
}

function clearExpiredRareEvent(state, now) {
  const active = getActiveRareEvent(state, now);
  if (active) return active;
  const ended = state?.retention?.rare_event;
  if (ended) {
    state.retention.rare_event = null;
    dispatchMetaEvent('arcade-meta-live-event-ended', {
      event: ended,
      source: 'rare-global',
      ended_by: 'expired',
    });
  }
  return null;
}


const DAILY_ROGUELITE_QUESTS = [
  { id: 'daily-play-any', type: 'multi_game_burst', path: 'easy', title: 'Play 3 arcade runs', description: 'Safe XP path: complete 3 accepted runs today.', required_runs: 3, required_unique_games: 1, window_ms: MS_PER_DAY },
  { id: 'daily-three-games', type: 'multi_game_burst', path: 'easy', title: 'Play 3 different games', description: 'Auto-submits and opens multiple paths.', required_runs: 3, required_unique_games: 3, window_ms: MS_PER_DAY },
  { id: 'daily-snake-60', type: 'snake_survivor', path: 'easy', title: 'Survive 60s in Snake Run', description: 'Hold the line for a clean streak bump.', game: 'snake', min_duration_ms: 60 * 1000 },
  { id: 'daily-invaders-push', type: 'score_target', path: 'competitive', title: 'Push Invaders 3008 to 900+', description: 'Leaderboard pressure path.', game: 'invaders', target: 900 },
  { id: 'daily-btqm-zone', type: 'btqm_zone_clear', path: 'exploration', title: 'Clear a BTQM zone', description: 'Dungeon path into Block Topia lore.', game: 'btqm', target: 1 },
  { id: 'daily-switch', type: 'switch_chain', path: 'risk', title: 'Switch games twice fast', description: 'Risk path: rapid game swaps for bigger XP tempo.', switches: 2, window_ms: 12 * MINUTE_MS },
  { id: 'daily-pacchain', type: 'score_target', path: 'competitive', title: 'Chain Pac-Chain to 800+', description: 'Combo path toward leaderboard pressure.', game: 'pacchain', target: 800 },
  { id: 'daily-breakout', type: 'score_target', path: 'risk', title: 'Bullrun Breakout 750+', description: 'Risk path with brick-break combo momentum.', game: 'breakout', target: 750 },
  { id: 'daily-tetris', type: 'score_target', path: 'easy', title: 'Stack Tetris to 700+', description: 'Safe score-chase path.', game: 'tetris', target: 700 },
  { id: 'daily-crystal', type: 'score_target', path: 'exploration', title: 'Solve Crystal Quest 600+', description: 'Exploration path through clue-hunt energy.', game: 'crystal', target: 600 },
  { id: 'daily-asteroids', type: 'score_target', path: 'risk', title: 'Survive Asteroid Fork 800+', description: 'High-risk survival branch.', game: 'asteroids', target: 800 },
  { id: 'daily-faction-signal', type: 'multi_game_burst', path: 'faction', title: 'Feed your faction signal', description: 'Complete 2 runs in different games to help faction momentum.', required_runs: 2, required_unique_games: 2, window_ms: MS_PER_DAY },
];

const RABBIT_HOLE_TEMPLATES = [
  { type: 'score_target', path: 'competitive', title: 'Push a personal best in {GAME}', description: 'The board is watching. Beat this score branch.', target: 1100 },
  { type: 'score_target', path: 'risk', title: 'Risk branch: spike {GAME} to {TARGET}+', description: 'Harder, faster, bigger XP tempo.', target: 1400 },
  { type: 'multi_game_burst', path: 'easy', title: 'Clear 2 runs before the window closes', description: 'Safe path: keep XP ticking.', required_runs: 2, required_unique_games: 1, window_ms: 6 * MINUTE_MS },
  { type: 'multi_game_burst', path: 'faction', title: 'Faction surge: 3 runs / 2 games', description: 'Help your faction and keep the run alive.', required_runs: 3, required_unique_games: 2, window_ms: 8 * MINUTE_MS },
  { type: 'switch_chain', path: 'risk', title: 'Roguelite swap: chain 3 game switches', description: 'Branch into a harder route immediately.', switches: 3, window_ms: 10 * MINUTE_MS },
  { type: 'snake_survivor', path: 'easy', title: 'Hold Snake Run for 75 seconds', description: 'Safe survival branch with steady XP.', game: 'snake', min_duration_ms: 75 * 1000 },
  { type: 'btqm_zone_clear', path: 'exploration', title: 'Dive deeper: clear BTQM again', description: 'Dungeon rabbit hole toward Block Topia.', game: 'btqm', target: 1 },
];

const BRANCH_PATH_TEMPLATES = {
  easy: { type: 'multi_game_burst', path: 'easy', title: 'Easy branch: 2 steady runs', description: 'Safe XP path. Keep the ticker moving without gambling the streak.', required_runs: 2, required_unique_games: 1, window_ms: 7 * MINUTE_MS },
  risk: { type: 'score_target', path: 'risk', title: 'Risk branch: spike {GAME} to {TARGET}+', description: 'Harder chase, bigger bonus, faster XP pressure.', target: 1500 },
  faction: { type: 'multi_game_burst', path: 'faction', title: 'Faction branch: 3 runs / 2 games', description: 'Feed faction momentum and open the next war path.', required_runs: 3, required_unique_games: 2, window_ms: 9 * MINUTE_MS },
};

function formatTemplateTitle(template, game, target) {
  return String(template.title || 'New rabbit hole')
    .replace('{GAME}', String(game || 'ARCADE').toUpperCase())
    .replace('{TARGET}', String(target || template.target || Number(config.quest.scoreTarget) || 800));
}

function ensureEngagementDay(state, now) {
  if (!state.engagement) state.engagement = createInitialEngagement(now);
  const dayKey = toUtcDateKey(now);
  if (state.engagement.day_key !== dayKey) {
    const previousStreak = state.engagement.streak_days || 0;
    const keptStreak = state.engagement.last_completed_day
      && (new Date(`${dayKey}T00:00:00Z`) - new Date(`${state.engagement.last_completed_day}T00:00:00Z`)) <= MS_PER_DAY;
    state.engagement = createInitialEngagement(now);
    state.engagement.streak_days = keptStreak ? previousStreak : 0;
  }
  const dailyQuestCount = getRogueliteLimits().dailyQuestCount;
  if (!Array.isArray(state.engagement.daily_quests) || state.engagement.daily_quests.length !== dailyQuestCount) {
    state.engagement.daily_quests = DAILY_ROGUELITE_QUESTS.slice(0, dailyQuestCount).map((template) => sanitizeTask({
      ...template,
      source: 'daily',
      created_at: now,
      expires_at: now + MS_PER_DAY,
      bonus_multiplier: Number(config.roguelite?.dailyBonusMultiplier) || 0.08,
    }));
  }
}

function createRabbitHole(now, seed = {}, preferredTemplate = null) {
  const gamePool = Object.keys(config.difficultyWeights);
  const baseGame = seed.game || gamePool[Math.floor(Math.random() * gamePool.length)] || 'snake';
  const template = preferredTemplate || RABBIT_HOLE_TEMPLATES[Math.floor(Math.random() * RABBIT_HOLE_TEMPLATES.length)] || RABBIT_HOLE_TEMPLATES[0];
  const depth = Math.max(0, Number(seed.chain_depth) || 0) + 1;
  const target = Math.ceil((Number(seed.target) || Number(template.target) || Number(config.quest.scoreTarget) || 800) * (1 + Math.min(0.6, depth * 0.12)));
  const pathBonus = template.path === 'risk' ? Number(config.roguelite?.riskBonusMultiplier || 0.2) : Number(config.roguelite?.rabbitBonusMultiplier || 0.12);
  return sanitizeTask({
    ...template,
    id: makeQuestId('rabbit'),
    game: template.game || baseGame,
    target,
    title: formatTemplateTitle(template, template.game || baseGame, target),
    source: 'rabbit',
    created_at: now,
    expires_at: now + (Number(config.roguelite?.rabbitTtlMs) || (18 * MINUTE_MS)),
    bonus_multiplier: pathBonus,
    chain_depth: depth,
  });
}

function spawnRabbitHoles(state, completedTask, now, minCount, maxCount) {
  if (!state.engagement) state.engagement = createInitialEngagement(now);
  const min = Math.max(1, Math.floor(Number(minCount) || 1));
  const max = Math.max(min, Math.floor(Number(maxCount) || min));
  const count = randomInRange(min, max);
  const spawned = [];
  for (let i = 0; i < count; i += 1) {
    const next = createRabbitHole(now, completedTask);
    state.engagement.rabbit_holes.push(next);
    spawned.push(next);
  }
  const cap = getRogueliteLimits().maxRabbitHoles;
  state.engagement.rabbit_holes = state.engagement.rabbit_holes
    .filter((task) => task && !task.completed && (!task.expires_at || Number(task.expires_at) > now))
    .slice(-cap);
  return spawned;
}

function createBranchOptions(state, completedTask, now) {
  if (!state.engagement) state.engagement = createInitialEngagement(now);
  const branchPaths = ['easy', 'risk', 'faction'].slice(0, getRogueliteLimits().branchCount);
  const spawned = [];
  const branches = branchPaths.map((path) => {
    const existing = state.engagement.rabbit_holes.find((task) => task && task.path === path && Number(task.expires_at) > now);
    if (existing) return existing;
    const created = createRabbitHole(now, completedTask, BRANCH_PATH_TEMPLATES[path]);
    state.engagement.rabbit_holes.push(created);
    spawned.push(created);
    return created;
  }).filter(Boolean);
  state.engagement.next_branches = branches.slice(0, getRogueliteLimits().branchCount);
  const cap = getRogueliteLimits().maxRabbitHoles;
  state.engagement.rabbit_holes = state.engagement.rabbit_holes
    .filter((task) => task && !task.completed && (!task.expires_at || Number(task.expires_at) > now))
    .slice(-cap);
  return { branches: state.engagement.next_branches, spawned };
}

function computeStreakBonusPercent(streak) {
  const sessionChain = Math.max(0, Number(streak?.session_chain) || 0);
  const quickChain = Math.max(0, Number(streak?.quick_chain) || 0);
  const switchChain = Math.max(0, Number(streak?.switch_chain) || 0);
  const bonus = clamp(
    (sessionChain * Number(config.streak.sessionStep || 0))
      + (quickChain * Number(config.streak.quickStep || 0))
      + (switchChain * Number(config.streak.switchStep || 0)),
    0,
    Number(config.streak.maxMultiplierBonus || 0)
  );
  return Math.round(bonus * 100);
}

function evaluateEngagementTask(task, history, run) {
  return evaluateQuest(task, history, run);
}

function completeEngagementLoops(state, run, now) {
  ensureEngagementDay(state, now);
  const historyWithCurrent = state.history.concat(run);
  let bonus = 0;
  const completed = [];
  const spawned = [];
  const rabbitHolesBeforeRun = Array.isArray(state.engagement.rabbit_holes)
    ? state.engagement.rabbit_holes.slice()
    : [];
  const completeOne = (task, source) => {
    const done = sanitizeTask({ ...task, completed: true, completed_at: now, source });
    completed.push(done);
    state.engagement.completed_tasks.push(done);
    state.engagement.total_auto_submits += 1;
    bonus += Number(done.bonus_multiplier) || 0;
    const min = source === 'daily' ? Number(config.roguelite?.rabbitMin) || 2 : Number(config.roguelite?.popupRabbitMin) || 1;
    const max = source === 'daily' ? Number(config.roguelite?.rabbitMax) || 4 : Number(config.roguelite?.popupRabbitMax) || 3;
    spawned.push(...spawnRabbitHoles(state, done, now, min, max));
    const branches = createBranchOptions(state, done, now);
    spawned.push(...branches.spawned);
  };

  state.engagement.daily_quests = state.engagement.daily_quests.map((task) => {
    if (task.completed || !evaluateEngagementTask(task, historyWithCurrent, run)) return task;
    completeOne(task, 'daily');
    return sanitizeTask({ ...task, completed: true, completed_at: now });
  });

  const remainingRabbitHoles = [];
  for (const task of rabbitHolesBeforeRun) {
    if (!task || Number(task.expires_at) <= now) continue;
    if (evaluateEngagementTask(task, historyWithCurrent, run)) {
      completeOne(task, 'rabbit');
    } else {
      remainingRabbitHoles.push(task);
    }
  }
  state.engagement.rabbit_holes = remainingRabbitHoles.concat(spawned).slice(-getRogueliteLimits().maxRabbitHoles);
  state.engagement.next_branches = state.engagement.next_branches
    .filter((task) => task && Number(task.expires_at) > now)
    .slice(0, getRogueliteLimits().branchCount);
  if (completed.length) {
    const dayKey = toUtcDateKey(now);
    if (state.engagement.last_completed_day !== dayKey) {
      state.engagement.streak_days = Math.max(1, Number(state.engagement.streak_days || 0) + 1);
      state.engagement.last_completed_day = dayKey;
    }
  }
  state.engagement.completed_tasks = state.engagement.completed_tasks.slice(-240);
  return { bonus: Math.min(bonus, 1.4), completed, spawned };
}

function createQuest(now, existingActive = []) {
  const games = Object.keys(config.difficultyWeights);
  const game = games[Math.floor(Math.random() * games.length)] || 'snake';
  const templates = [
    {
      type: 'multi_game_burst',
      prefix: 'burst',
      title: 'Play 2 different games in 5 minutes',
      bonus_multiplier: 0.2,
      window_ms: 5 * 60 * 1000,
      required_runs: 2,
      required_unique_games: 2,
    },
    {
      type: 'snake_survivor',
      prefix: 'snake',
      title: 'Survive 60s in Snake',
      bonus_multiplier: 0.18,
      game: 'snake',
      min_duration_ms: 60 * 1000,
    },
    {
      type: 'btqm_zone_clear',
      prefix: 'btqm',
      title: 'Clear 1 BTQM zone',
      bonus_multiplier: 0.14,
      game: 'btqm',
      target: 1,
    },
    {
      type: 'score_target',
      prefix: 'score',
      title: `Push ${game.toUpperCase()} score to ${Number(config.quest.scoreTarget) || 800}+`,
      bonus_multiplier: 0.22,
      game,
      target: Number(config.quest.scoreTarget) || 800,
    },
    {
      type: 'switch_chain',
      prefix: 'switch',
      title: 'Switch games on back-to-back runs',
      bonus_multiplier: 0.15,
      switches: 2,
    },
  ];

  const activeTypes = new Set(existingActive.map((q) => q?.type).filter(Boolean));
  const available = templates.filter((template) => !activeTypes.has(template.type));
  const pool = available.length ? available : templates;
  const selected = pool[Math.floor(Math.random() * pool.length)] || templates[0];
  const ttlMin = Number(config.quest.ttlMinMs) || (5 * 60 * 1000);
  const ttlMax = Number(config.quest.ttlMaxMs) || (18 * 60 * 1000);
  const expiresAt = now + randomInRange(ttlMin, ttlMax);
  return Object.assign({}, selected, {
    id: makeQuestId(selected.prefix || selected.type || 'quest'),
    created_at: now,
    expires_at: expiresAt,
    chain_step: 1,
    chain_window_ms: 2 * MINUTE_MS,
  });
}

function maintainQuests(state, now) {
  const min = Math.max(3, Number(config.quest.minActive) || 3);
  const max = Math.max(min, Number(config.quest.maxActive) || 5);
  state.quests.active = state.quests.active.filter((q) => q && Number(q.expires_at) > now);
  const target = Math.floor(Math.random() * (max - min + 1)) + min;
  while (state.quests.active.length < target) {
    state.quests.active.push(createQuest(now, state.quests.active));
  }
  if (state.quests.active.length > max) {
    state.quests.active = state.quests.active.slice(-max);
  }
}

function evaluateQuest(quest, history, run) {
  const inQuestWindow = history.filter((h) => {
    const ts = Number(h?.timestamp);
    return Number.isFinite(ts) && ts >= Number(quest.created_at) && ts <= Number(quest.expires_at);
  });
  if (quest.type === 'score_target') {
    return run.game === quest.game && run.raw_score >= Number(quest.target || 0);
  }
  if (quest.type === 'multi_game_burst') {
    const windowMs = Number(quest.window_ms) || (5 * 60 * 1000);
    const minTs = Number(run.timestamp) - windowMs;
    const burstRuns = inQuestWindow.filter((h) => Number(h.timestamp) >= minTs);
    const uniqueGames = new Set(burstRuns.map((h) => h.game)).size;
    return burstRuns.length >= Number(quest.required_runs || 2)
      && uniqueGames >= Number(quest.required_unique_games || 2);
  }
  if (quest.type === 'snake_survivor') {
    const fallbackScoreTarget = Math.max(300, Math.floor(Number(quest.min_duration_ms || 60000) / 100));
    return run.game === 'snake'
      && (Number(run.duration || 0) >= Number(quest.min_duration_ms || 60000) || Number(run.raw_score || 0) >= fallbackScoreTarget);
  }
  if (quest.type === 'btqm_zone_clear') {
    return run.game === 'btqm' && run.raw_score >= Number(quest.target || 1);
  }
  if (quest.type === 'switch_chain') {
    const ordered = inQuestWindow.slice().sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    if (ordered.length < 2) return false;
    const switchCount = ordered.filter((item, index) => {
      if (index === 0) return false;
      return item.game && ordered[index - 1].game && item.game !== ordered[index - 1].game;
    }).length;
    const switchedThisRun = ordered[ordered.length - 1].game !== ordered[ordered.length - 2].game;
    return switchedThisRun && switchCount >= Number(quest.switches || 2);
  }
  return false;
}

// Compute a 0-1 progress ratio for a quest against accumulated history.
// Returns 1 only when the quest is fully complete; used for near-miss detection.
function checkNearMissProgress(quest, history, run) {
  const inQuestWindow = history.filter((h) => {
    const ts = Number(h?.timestamp);
    return Number.isFinite(ts) && ts >= Number(quest.created_at) && ts <= Number(quest.expires_at);
  });
  const cap = (v) => clamp(v, 0, 1);
  if (quest.type === 'score_target') {
    const target = Math.max(1, Number(quest.target) || 1);
    const best = inQuestWindow.filter((h) => h.game === quest.game)
      .reduce((max, h) => Math.max(max, Number(h.raw_score) || 0), 0);
    return cap(best / target);
  }
  if (quest.type === 'multi_game_burst') {
    const requiredRuns = Math.max(1, Number(quest.required_runs) || 2);
    const requiredUnique = Math.max(1, Number(quest.required_unique_games) || 2);
    const windowMs = Number(quest.window_ms) || (5 * 60 * 1000);
    const burstRuns = inQuestWindow.filter((h) => Number(h.timestamp) >= Number(run.timestamp) - windowMs);
    return cap(Math.min(burstRuns.length / requiredRuns, new Set(burstRuns.map((h) => h.game)).size / requiredUnique));
  }
  if (quest.type === 'snake_survivor') {
    const target = Math.max(1, Number(quest.min_duration_ms) || 60000);
    const scoreTarget = Math.max(300, Math.floor(target / 100));
    const bestDuration = inQuestWindow.filter((h) => h.game === 'snake')
      .reduce((max, h) => Math.max(max, Number(h.duration) || 0), 0);
    const bestScore = inQuestWindow.filter((h) => h.game === 'snake')
      .reduce((max, h) => Math.max(max, Number(h.raw_score) || 0), 0);
    return cap(Math.max(bestDuration / target, bestScore / scoreTarget));
  }
  if (quest.type === 'btqm_zone_clear') {
    const target = Math.max(1, Number(quest.target) || 1);
    const best = inQuestWindow.filter((h) => h.game === 'btqm')
      .reduce((max, h) => Math.max(max, Number(h.raw_score) || 0), 0);
    return cap(best / target);
  }
  if (quest.type === 'switch_chain') {
    const switches = Math.max(1, Number(quest.switches) || 2);
    const ordered = inQuestWindow.slice().sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    let switchCount = 0;
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i].game && ordered[i - 1].game && ordered[i].game !== ordered[i - 1].game) switchCount += 1;
    }
    return cap(switchCount / switches);
  }
  return 0;
}

function applyQuestBonuses(state, now, run) {
  let questBonus = 0;
  const stillActive = [];
  const historyWithCurrent = state.history.concat(run);
  const activeRare = getActiveRareEvent(state, now);
  const switchBonusMultiplier = Number(activeRare?.modifiers?.switch_bonus_multiplier) || 1;
  for (const quest of state.quests.active) {
    const expired = Number(quest.expires_at) <= now;
    if (expired) continue;
    if (evaluateQuest(quest, historyWithCurrent, run)) {
      const baseBonus = Number(quest.bonus_multiplier) || 0;
      // Rare "switch-chain surge" only buffs switch_chain quests to preserve other quest balance.
      const adjustedBonus = quest.type === 'switch_chain'
        ? (baseBonus * Math.max(1, switchBonusMultiplier))
        : baseBonus;
      questBonus += adjustedBonus;
      state.quests.completed.push({
        id: quest.id,
        title: quest.title,
        type: quest.type,
        game: quest.game || null,
        bonus_multiplier: adjustedBonus,
        base_bonus_multiplier: baseBonus,
        chain_step: Number(quest.chain_step) || 1,
        chain_window_ms: Number(quest.chain_window_ms) || (2 * MINUTE_MS),
        target: Number(quest.target) || null,
        min_duration_ms: Number(quest.min_duration_ms) || null,
        switches: Number(quest.switches) || null,
        completed_at: now,
      });
      continue;
    }
    stillActive.push(quest);
  }
  state.quests.active = stillActive;
  if (state.quests.completed.length > 200) {
    state.quests.completed = state.quests.completed.slice(-200);
  }
  return Math.min(questBonus, Number(config.quest.maxQuestMultiplierBonus) || questBonus);
}

function buildQuestChainQuest(completedQuest, now, existingActive = []) {
  if (!completedQuest || !completedQuest.type) return null;
  const chainStep = Math.max(1, Number(completedQuest.chain_step) || 1) + 1;
  if (chainStep > 3) return null;

  if (completedQuest.type === 'score_target' && completedQuest.game) {
    const previousTarget = Math.max(1, Number(completedQuest.target) || Number(config.quest.scoreTarget) || 800);
    const chainTarget = Math.ceil(previousTarget * 1.2);
    return {
      id: makeQuestId('chain-score'),
      type: 'score_target',
      prefix: 'chain-score',
      title: `Chain ${chainStep}: Push ${String(completedQuest.game).toUpperCase()} to ${chainTarget}+`,
      bonus_multiplier: Math.min(0.45, (Number(completedQuest.base_bonus_multiplier) || 0.2) + 0.08),
      game: completedQuest.game,
      target: chainTarget,
      created_at: now,
      expires_at: now + Math.max(60 * 1000, Number(completedQuest.chain_window_ms) || (2 * MINUTE_MS)),
      chain_step: chainStep,
      chain_window_ms: Math.max(60 * 1000, Number(completedQuest.chain_window_ms) || (2 * MINUTE_MS)),
    };
  }

  if (completedQuest.type === 'switch_chain') {
    const prevSwitches = Math.max(2, Number(completedQuest.switches) || 2);
    const switches = Math.min(5, prevSwitches + 1);
    return {
      id: makeQuestId('chain-switch'),
      type: 'switch_chain',
      prefix: 'chain-switch',
      title: `Chain ${chainStep}: ${switches} rapid switches`,
      bonus_multiplier: Math.min(0.4, (Number(completedQuest.base_bonus_multiplier) || 0.15) + 0.06),
      switches,
      created_at: now,
      expires_at: now + Math.max(75 * 1000, Number(completedQuest.chain_window_ms) || (2 * MINUTE_MS)),
      chain_step: chainStep,
      chain_window_ms: Math.max(75 * 1000, Number(completedQuest.chain_window_ms) || (2 * MINUTE_MS)),
    };
  }

  const activeTypes = new Set(existingActive.map((q) => q?.type).filter(Boolean));
  if (!activeTypes.has('multi_game_burst')) {
    return {
      id: makeQuestId('chain-burst'),
      type: 'multi_game_burst',
      prefix: 'chain-burst',
      title: `Chain ${chainStep}: 3 runs / 2 games in 4m`,
      bonus_multiplier: 0.24,
      window_ms: 4 * MINUTE_MS,
      required_runs: 3,
      required_unique_games: 2,
      created_at: now,
      expires_at: now + (3 * MINUTE_MS),
      chain_step: chainStep,
      chain_window_ms: 3 * MINUTE_MS,
    };
  }
  return null;
}

function unlockQuestChains(state, completedQuests, now) {
  if (!Array.isArray(completedQuests) || !completedQuests.length) return [];
  const unlocked = [];
  for (const completed of completedQuests) {
    const chained = buildQuestChainQuest(completed, now, state.quests.active);
    if (!chained) continue;
    state.quests.active.push(chained);
    unlocked.push(chained);
  }
  return unlocked;
}

function resolveMetaLiveModifiers(state, run, now) {
  const featured = getFeaturedChaosWindow(now);
  const activeRare = getActiveRareEvent(state, now);
  const game = normalizeStorageGame(run.game);
  const featuredGame = normalizeStorageGame(featured.game);

  let eventBonus = 0;
  let questTargetDiscount = 0;

  if (game === featuredGame) {
    eventBonus += Number(featured.boost_multiplier) || 0;
    questTargetDiscount += Number(featured.quest_target_discount) || 0;
  }

  if (activeRare?.modifiers) {
    if (activeRare.modifiers.game_boost_multiplier) {
      const rareEventGame = normalizeStorageGame(activeRare.modifiers.game || '');
      if (!rareEventGame || rareEventGame === game) eventBonus += Number(activeRare.modifiers.game_boost_multiplier) || 0;
    }
    questTargetDiscount += Number(activeRare.modifiers.quest_target_discount) || 0;
  }

  return {
    featured,
    activeRare,
    eventBonus: Math.max(0, eventBonus),
    questTargetDiscount: clamp(questTargetDiscount, 0, 0.45),
  };
}

function applyQuestTargetDiscount(state, questTargetDiscount) {
  if (!Number.isFinite(questTargetDiscount) || questTargetDiscount <= 0) return;
  state.quests.active = state.quests.active.map((quest) => {
    if (!quest || quest.type !== 'score_target') return quest;
    const baseTarget = Math.max(1, Number(quest.target) || Number(config.quest.scoreTarget) || 800);
    const discounted = Math.max(1, Math.floor(baseTarget * (1 - questTargetDiscount)));
    return Object.assign({}, quest, { target: discounted });
  });
}

function isWeekend(timestamp) {
  const day = new Date(timestamp).getUTCDay();
  return day === 0 || day === 6;
}

function trackGameResult(payload = {}) {
  const player = String(payload.player || '').trim();
  const game = normalizeGame(payload.game);
  const rawScore = Math.max(0, Math.floor(Number(payload.raw_score) || 0));
  if (!rawScore) {
    return { tracked: false, reason: 'invalid_raw_score' };
  }

  const timestamp = parseTimestamp(payload.timestamp);
  const duration = Number(payload.duration);
  const state = readState();
  clearExpiredRareEvent(state, timestamp);

  if (player) state.player = player;

  // Capture pre-state so we can detect what changed after the full computation.
  const beforeStreakChain = state.streak.session_chain;
  const beforeActiveIds = new Set(state.quests.active.map((q) => q.id));
  const beforeCompletedIds = new Set(state.quests.completed.map((q) => q.id));

  const dayKey = toUtcDateKey(timestamp);
  const weekKey = toUtcWeekKey(timestamp);
  const monthKey = toUtcMonthKey(timestamp);
  const seasonKey = toSeasonKey(timestamp);
  updateWindow(state.daily, dayKey);
  updateWindow(state.weekly, weekKey);
  updateWindow(state.monthly, monthKey);
  updateWindow(state.seasonal, seasonKey);
  ensureEngagementDay(state, timestamp);

  maintainQuests(state, timestamp);
  const triggeredRareEvent = maybeTriggerRareEvent(state, timestamp, { game, timestamp, raw_score: rawScore });
  const run = {
    timestamp,
    day: dayKey,
    game,
    raw_score: rawScore,
    duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : null,
    previous_game: state.streak.last_game || null,
  };
  updateStreakState(state, run);

  const difficultyWeight = getDifficultyWeight(game);
  const timeWeight = computeTimeWeight(game, duration);
  const basePoints = rawScore * difficultyWeight * timeWeight;

  const runsTodayForGame = countDailyRuns(state.history, dayKey, game) + 1;
  const recentSameGameRuns = countRecentSameGame(state.history, game, config.antiFarm.repeatWindow);
  const diminishing = diminishingMultiplier(runsTodayForGame);
  const repeatPenalty = repeatPenaltyMultiplier(recentSameGameRuns);
  const antiFarmBase = basePoints * diminishing * repeatPenalty;

  const streakBonusMultiplier = clamp(
    (state.streak.session_chain * Number(config.streak.sessionStep || 0))
      + (state.streak.quick_chain * Number(config.streak.quickStep || 0))
      + (state.streak.switch_chain * Number(config.streak.switchStep || 0)),
    0,
    Number(config.streak.maxMultiplierBonus || 0)
  );
  const streakMultiplier = 1 + streakBonusMultiplier;
  const metaLive = resolveMetaLiveModifiers(state, run, timestamp);
  applyQuestTargetDiscount(state, metaLive.questTargetDiscount);
  const eventMultiplier = 1 + (isWeekend(timestamp) ? Number(config.event.weekendMultiplier || 0) : 0) + metaLive.eventBonus;
  const questBonusMultiplier = applyQuestBonuses(state, timestamp, run);
  const engagementLoop = completeEngagementLoops(state, run, timestamp);
  const questMultiplier = 1 + Math.max(0, Number(questBonusMultiplier || 0) + Number(engagementLoop.bonus || 0));

  const streakAdjusted = antiFarmBase * streakMultiplier;
  const eventAdjusted = streakAdjusted * eventMultiplier;
  let metaPoints = eventAdjusted * questMultiplier;
  metaPoints = Math.min(metaPoints, Number(config.antiFarm.maxPerRunPoints));

  const dailyRemaining = Math.max(0, Number(config.antiFarm.dailyCap) - state.daily.points);
  metaPoints = Math.min(metaPoints, dailyRemaining);
  metaPoints = Math.max(0, Math.floor(metaPoints));

  state.daily.points += metaPoints;
  state.weekly.points += metaPoints;
  state.monthly.points += metaPoints;
  state.seasonal.points += metaPoints;

  state.history.push({
    timestamp,
    day: dayKey,
    game,
    raw_score: rawScore,
    duration: run.duration,
    meta_points: metaPoints,
    difficulty_weight: Number(difficultyWeight.toFixed(4)),
    time_weight: Number(timeWeight.toFixed(4)),
    quest_bonus: Math.floor(eventAdjusted * Math.max(0, questMultiplier - 1)),
    streak_bonus: Math.floor(antiFarmBase * Math.max(0, streakMultiplier - 1)),
    event_bonus: Math.floor(streakAdjusted * Math.max(0, eventMultiplier - 1)),
    diminishing_multiplier: Number(diminishing.toFixed(4)),
    repeat_penalty_multiplier: Number(repeatPenalty.toFixed(4)),
  });
  if (state.history.length > MAX_HISTORY) {
    state.history = state.history.slice(-MAX_HISTORY);
  }

  const newlyCompletedQuests = state.quests.completed.filter((q) => q && !beforeCompletedIds.has(q.id));
  unlockQuestChains(state, newlyCompletedQuests, timestamp);
  maintainQuests(state, timestamp);
  writeState(state);

  // Dispatch DOM events so UI listeners (arcade-meta-ui.js) can react without polling.
  const resolvedPlayer = state.player || player || 'Guest';

  for (const quest of state.quests.completed) {
    if (!beforeCompletedIds.has(quest.id)) {
      dispatchMetaEvent('arcade-meta-quest-completed', { quest, game, player: resolvedPlayer });
    }
  }
  for (const quest of state.quests.active) {
    if (!beforeActiveIds.has(quest.id)) {
      dispatchMetaEvent('arcade-meta-quest-created', { quest, game });
    }
  }
  for (const task of engagementLoop.completed) {
    dispatchMetaEvent('arcade-meta-roguelite-completed', { task, game, player: resolvedPlayer, auto_submitted: true });
  }
  if (engagementLoop.spawned.length) {
    dispatchMetaEvent('arcade-meta-rabbit-holes-spawned', { tasks: engagementLoop.spawned, game, player: resolvedPlayer });
  }
  let bestNearMiss = null;
  for (const quest of state.quests.active) {
    const progress = checkNearMissProgress(quest, state.history, run);
    if (progress >= 0.8 && progress < 1) {
      if (!bestNearMiss || progress > bestNearMiss.progress) bestNearMiss = { quest, progress };
    }
  }
  if (bestNearMiss) {
    dispatchMetaEvent('arcade-meta-near-miss', {
      quest: bestNearMiss.quest,
      progress: bestNearMiss.progress,
      game,
      player: resolvedPlayer,
    });
  }
  if (state.streak.session_chain > beforeStreakChain) {
    dispatchMetaEvent('arcade-meta-streak-updated', {
      streak: state.streak.session_chain,
      before: beforeStreakChain,
      game,
      player: resolvedPlayer,
    });
  }
  dispatchMetaEvent('arcade-meta-tracked', {
    game,
    player: resolvedPlayer,
    meta_points: metaPoints,
    streak: state.streak.session_chain,
    daily: state.daily.points,
    featured_chaos: metaLive.featured,
    // Prefer currently-active rare event context; fall back to newly-triggered event this run.
    rare_event: metaLive.activeRare || triggeredRareEvent || null,
  });

  const comeback = getComebackPressure(timestamp);
  if (comeback) {
    if (!state.retention) state.retention = {};
    state.retention.last_incentive_at = timestamp;
    state.retention.last_incentive_type = comeback.kind;
    writeState(state);
  }

  return {
    tracked: true,
    player: state.player || player || 'Guest',
    game,
    raw_score: rawScore,
    meta_points: metaPoints,
    timestamp,
    difficulty_weight: difficultyWeight,
    time_weight: timeWeight,
    quest_bonus: Math.floor(eventAdjusted * Math.max(0, questMultiplier - 1)),
    streak_bonus: Math.floor(antiFarmBase * Math.max(0, streakMultiplier - 1)),
    event_bonus: Math.floor(streakAdjusted * Math.max(0, eventMultiplier - 1)),
    anti_farm: {
      diminishing_multiplier: diminishing,
      repeat_penalty_multiplier: repeatPenalty,
      run_cap: Number(config.antiFarm.maxPerRunPoints),
      daily_cap: Number(config.antiFarm.dailyCap),
    },
    windows: {
      daily: state.daily.points,
      weekly: state.weekly.points,
      monthly: state.monthly.points,
      seasonal: state.seasonal.points,
    },
    quests: {
      active: state.quests.active,
      completed_recent: state.quests.completed.slice(-10),
    },
    roguelite: state.engagement,
    streak: state.streak.session_chain,
    streak_bonus_percent: computeStreakBonusPercent(state.streak),
    retention: {
      featured_chaos: metaLive.featured,
      rare_event: metaLive.activeRare || triggeredRareEvent || null,
      comeback,
    },
  };
}

function configure(nextConfig = {}) {
  const merged = deepClone(DEFAULT_CONFIG);
  if (nextConfig && typeof nextConfig === 'object') {
    if (nextConfig.difficultyWeights && typeof nextConfig.difficultyWeights === 'object') {
      merged.difficultyWeights = Object.assign({}, merged.difficultyWeights, nextConfig.difficultyWeights);
    }
    if (nextConfig.gameAliases && typeof nextConfig.gameAliases === 'object') {
      merged.gameAliases = Object.assign({}, merged.gameAliases, nextConfig.gameAliases);
    }
    if (nextConfig.quest && typeof nextConfig.quest === 'object') {
      merged.quest = Object.assign({}, merged.quest, nextConfig.quest);
    }
    if (nextConfig.antiFarm && typeof nextConfig.antiFarm === 'object') {
      merged.antiFarm = Object.assign({}, merged.antiFarm, nextConfig.antiFarm);
    }
    if (nextConfig.timing && typeof nextConfig.timing === 'object') {
      merged.timing = Object.assign({}, merged.timing, nextConfig.timing);
      if (nextConfig.timing.targetSecondsByGame && typeof nextConfig.timing.targetSecondsByGame === 'object') {
        merged.timing.targetSecondsByGame = Object.assign(
          {},
          DEFAULT_CONFIG.timing.targetSecondsByGame,
          nextConfig.timing.targetSecondsByGame
        );
      }
    }
    if (nextConfig.streak && typeof nextConfig.streak === 'object') {
      merged.streak = Object.assign({}, merged.streak, nextConfig.streak);
    }
    if (nextConfig.event && typeof nextConfig.event === 'object') {
      merged.event = Object.assign({}, merged.event, nextConfig.event);
    }
    if (nextConfig.featuredChaos && typeof nextConfig.featuredChaos === 'object') {
      merged.featuredChaos = Object.assign({}, merged.featuredChaos, nextConfig.featuredChaos);
    }
    if (nextConfig.comeback && typeof nextConfig.comeback === 'object') {
      merged.comeback = Object.assign({}, merged.comeback, nextConfig.comeback);
    }
    if (nextConfig.rare && typeof nextConfig.rare === 'object') {
      merged.rare = Object.assign({}, merged.rare, nextConfig.rare);
    }
    if (nextConfig.roguelite && typeof nextConfig.roguelite === 'object') {
      merged.roguelite = Object.assign({}, merged.roguelite, nextConfig.roguelite);
    }
  }
  config = merged;
}

function getState() {
  return readState();
}

function reset() {
  const state = createInitialState();
  writeState(state);
  return state;
}

function getComebackPressure(now = nowMs()) {
  const state = readState();
  const lastPlayedAt = Number(state?.streak?.last_played_at) || 0;
  if (!lastPlayedAt) return null;
  const gap = Math.max(0, now - lastPlayedAt);
  const warningAfterMs = Number(config.comeback?.warningAfterMs) || (25 * MINUTE_MS);
  const criticalAfterMs = Number(config.comeback?.criticalAfterMs) || (42 * MINUTE_MS);
  if (gap < warningAfterMs) return null;
  if (gap >= criticalAfterMs) {
    return {
      kind: 'streak-save-critical',
      label: '1 run to save streak',
      urgency: 'critical',
      inactive_ms: gap,
    };
  }
  return {
    kind: 'chaos-return-window',
    label: 'Limited chaos bonus live now',
    urgency: 'high',
    inactive_ms: gap,
  };
}

function getLiveContext(now = nowMs()) {
  const state = readState();
  ensureEngagementDay(state, now);
  const rare = clearExpiredRareEvent(state, now) || null;
  const activeQuests = Array.isArray(state?.quests?.active) ? state.quests.active : [];
  const activeChain = activeQuests
    .filter((quest) => Number(quest?.chain_step) > 1)
    .sort((a, b) => Number(b.chain_step || 0) - Number(a.chain_step || 0))[0] || null;
  writeState(state);
  return {
    featured_chaos: getFeaturedChaosWindow(now),
    rare_event: rare,
    comeback: getComebackPressure(now),
    quest_chain: activeChain ? {
      id: activeChain.id,
      title: activeChain.title || 'Quest chain',
      chain_step: Number(activeChain.chain_step) || 1,
      expires_at: Number(activeChain.expires_at) || null,
      expires_in_ms: Math.max(0, Number(activeChain.expires_at || now) - now),
    } : null,
    quests_active: activeQuests.length,
    roguelite: {
      daily_quests: state.engagement.daily_quests,
      rabbit_holes: state.engagement.rabbit_holes,
      next_branches: state.engagement.next_branches,
      completed_recent: state.engagement.completed_tasks.slice(-10),
      streak_days: state.engagement.streak_days,
      total_auto_submits: state.engagement.total_auto_submits,
      streak_bonus_percent: computeStreakBonusPercent(state.streak),
    },
  };
}

function endLiveEvent(reason = 'timeout') {
  const active = (typeof window !== 'undefined' && window.__arcadeMetaLiveEvent) || null;
  if (!active) return { ended: false, reason: 'no_active_event' };
  if (liveEventTimer) {
    clearTimeout(liveEventTimer);
    liveEventTimer = null;
  }
  if (typeof window !== 'undefined') {
    window.__arcadeMetaLiveEvent = null;
  }
  dispatchMetaEvent('arcade-meta-live-event-ended', {
    event: active,
    source: 'meta-system',
    ended_by: reason,
  });
  return { ended: true, event: active };
}

function chooseLiveEvent() {
  const pool = [
    { id: 'invert_controls', label: 'INVERT CONTROLS', rarity: 'epic', durationMs: 6000, uiMultiplier: 1.2 },
    { id: 'slow_time', label: 'SLOW TIME', rarity: 'rare', durationMs: 5000, uiMultiplier: 1.1 },
    { id: 'chaos_mode', label: 'CHAOS MODE', rarity: 'wtf', durationMs: 4500, uiMultiplier: 1.25 },
  ];
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function triggerLiveEvent(context = {}) {
  if (typeof window === 'undefined') return { triggered: false, reason: 'no_window' };
  const now = nowMs();
  const activeEvent = window.__arcadeMetaLiveEvent;
  if (activeEvent) return { triggered: false, reason: 'already_active', active: activeEvent };

  const state = readState();
  const featured = getFeaturedChaosWindow(now);
  const activeRare = getActiveRareEvent(state, now);
  const source = String(context.source || 'manual');
  let chance = 0.02;
  if (source === 'survival') chance = 0.012;
  if (source === 'combo') chance = 0.03;
  chance += Number(featured.chaos_chance_boost) || 0;
  chance += Number(activeRare?.modifiers?.chaos_chance_boost) || 0;

  if (!context.force && (now - lastLiveEventAt) < LIVE_EVENT_COOLDOWN_MS) {
    return { triggered: false, reason: 'cooldown' };
  }
  if (!context.force && Math.random() > chance) {
    return { triggered: false, reason: 'rng_miss' };
  }

  const picked = chooseLiveEvent();
  if (!picked) return { triggered: false, reason: 'no_event' };
  const durationMs = Math.max(2000, Number(picked.durationMs) || 4000);
  const liveEvent = {
    ...picked,
    context,
    source: 'meta-system',
    starts_at: now,
    ends_at: now + durationMs,
  };

  window.__arcadeMetaLiveEvent = liveEvent;
  lastLiveEventAt = now;
  dispatchMetaEvent('arcade-meta-live-event', { event: liveEvent, context });
  if (liveEventTimer) clearTimeout(liveEventTimer);
  liveEventTimer = setTimeout(() => endLiveEvent('timer'), durationMs);
  return { triggered: true, event: liveEvent };
}

const ArcadeMeta = {
  trackGameResult,
  triggerLiveEvent,
  endLiveEvent,
  configure,
  getState,
  getLiveContext,
  getComebackPressure,
  reset,
  getDifficultyWeights() {
    return Object.assign({}, config.difficultyWeights);
  },
};

if (typeof window !== 'undefined') {
  window.ArcadeMeta = ArcadeMeta;
}

export { ArcadeMeta };
