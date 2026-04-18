const STORAGE_KEY = 'arcade_meta';
const MAX_HISTORY = 300;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
// Keep aligned with the leaderboard worker season anchor for consistent seasonal windows.
const SEASON_EPOCH_MS = Date.UTC(2024, 0, 1);
let questCounter = 0;

const DEFAULT_CONFIG = {
  difficultyWeights: {
    hexgl: 1.8,
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
      hexgl: 180,
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
};

let config = deepClone(DEFAULT_CONFIG);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
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
    : count;
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
    return run.game === 'snake' && Number(run.duration || 0) >= Number(quest.min_duration_ms || 60000);
  }
  if (quest.type === 'btqm_zone_clear') {
    return run.game === 'btqm' && run.raw_score >= Number(quest.target || 1);
  }
  if (quest.type === 'switch_chain') {
    if (run.game === run.previous_game) return false;
    const switchCount = inQuestWindow.filter((item, index) => {
      if (index === 0) return false;
      return item.game && inQuestWindow[index - 1].game && item.game !== inQuestWindow[index - 1].game;
    }).length;
    return switchCount >= Number(quest.switches || 2);
  }
  return false;
}

function applyQuestBonuses(state, now, run) {
  let questBonus = 0;
  const stillActive = [];
  const historyWithCurrent = state.history.concat(run);
  for (const quest of state.quests.active) {
    const expired = Number(quest.expires_at) <= now;
    if (expired) continue;
    if (evaluateQuest(quest, historyWithCurrent, run)) {
      questBonus += Number(quest.bonus_multiplier) || 0;
      state.quests.completed.push({
        id: quest.id,
        title: quest.title,
        bonus_multiplier: Number(quest.bonus_multiplier) || 0,
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

  if (player) state.player = player;

  const dayKey = toUtcDateKey(timestamp);
  const weekKey = toUtcWeekKey(timestamp);
  const monthKey = toUtcMonthKey(timestamp);
  const seasonKey = toSeasonKey(timestamp);
  updateWindow(state.daily, dayKey);
  updateWindow(state.weekly, weekKey);
  updateWindow(state.monthly, monthKey);
  updateWindow(state.seasonal, seasonKey);

  maintainQuests(state, timestamp);
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
  const eventMultiplier = 1 + (isWeekend(timestamp) ? Number(config.event.weekendMultiplier || 0) : 0);
  const questBonusMultiplier = applyQuestBonuses(state, timestamp, run);
  const questMultiplier = 1 + Math.max(0, Number(questBonusMultiplier || 0));

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

  maintainQuests(state, timestamp);
  writeState(state);

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
    streak: state.streak.session_chain,
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

const ArcadeMeta = {
  trackGameResult,
  configure,
  getState,
  reset,
  getDifficultyWeights() {
    return Object.assign({}, config.difficultyWeights);
  },
};

if (typeof window !== 'undefined') {
  window.ArcadeMeta = ArcadeMeta;
}

export { ArcadeMeta };
