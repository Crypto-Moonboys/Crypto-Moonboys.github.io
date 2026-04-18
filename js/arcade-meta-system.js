const STORAGE_KEY = 'arcade_meta';
const MAX_HISTORY = 300;

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
    ttlMs: 6 * 60 * 60 * 1000,
    maxQuestBonusPerRun: 2000,
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
    step: 0.05,
    maxMultiplier: 0.25,
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
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function toSeasonKey(ms) {
  const seasonLengthMs = 90 * 24 * 60 * 60 * 1000;
  const seasonEpochMs = 1704067200000; // 2024-01-01 UTC
  const seasonIndex = Math.floor((ms - seasonEpochMs) / seasonLengthMs);
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
    streak: { count: 0, last_day: null },
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
    streak: {
      count: Number.isFinite(Number(input?.streak?.count)) ? Math.max(0, Math.floor(Number(input.streak.count))) : 0,
      last_day: typeof input?.streak?.last_day === 'string' ? input.streak.last_day : null,
    },
    history: Array.isArray(input.history) ? input.history.slice(-MAX_HISTORY) : [],
  };
}

function sanitizeWindow(current, fallback) {
  const key = typeof current?.key === 'string' ? current.key : fallback.key;
  const points = Number.isFinite(Number(current?.points)) ? Math.max(0, Number(current.points)) : 0;
  return { key, points };
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

function updateStreak(state, dayKey) {
  const last = state.streak.last_day;
  if (!last) {
    state.streak.count = 1;
  } else if (last === dayKey) {
    return state.streak.count;
  } else {
    const diffDays = Math.round((Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86400000);
    state.streak.count = diffDays === 1 ? state.streak.count + 1 : 1;
  }
  state.streak.last_day = dayKey;
  return state.streak.count;
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
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function createQuest(now) {
  const games = Object.keys(config.difficultyWeights);
  const game = games[Math.floor(Math.random() * games.length)] || 'snake';
  const typeRoll = Math.random();
  const expiresAt = now + config.quest.ttlMs;
  if (typeRoll < 0.33) {
    return {
      id: makeQuestId('score'),
      type: 'score_target',
      game,
      target: 800,
      title: `Push ${game.toUpperCase()} score to 800+`,
      bonus: 300,
      created_at: now,
      expires_at: expiresAt,
    };
  }
  if (typeRoll < 0.66) {
    return {
      id: makeQuestId('variety'),
      type: 'variety',
      unique_games: 3,
      title: 'Play 3 different games in this quest window',
      bonus: 500,
      created_at: now,
      expires_at: expiresAt,
    };
  }
  return {
    id: makeQuestId('runs'),
    type: 'runs',
    runs: 4,
    title: 'Complete 4 runs before quest expiry',
    bonus: 400,
    created_at: now,
    expires_at: expiresAt,
  };
}

function maintainQuests(state, now) {
  const min = Math.max(3, Number(config.quest.minActive) || 3);
  const max = Math.max(min, Number(config.quest.maxActive) || 5);
  state.quests.active = state.quests.active.filter((q) => q && Number(q.expires_at) > now);
  const target = Math.floor(Math.random() * (max - min + 1)) + min;
  while (state.quests.active.length < target) {
    state.quests.active.push(createQuest(now));
  }
  if (state.quests.active.length > max) {
    state.quests.active = state.quests.active.slice(-max);
  }
}

function evaluateQuest(quest, history, run) {
  const inWindow = history.filter((h) => Number(h.timestamp) >= Number(quest.created_at));
  if (quest.type === 'score_target') {
    return run.game === quest.game && run.raw_score >= Number(quest.target || 0);
  }
  if (quest.type === 'variety') {
    const set = new Set(inWindow.map((h) => h.game));
    return set.size >= Number(quest.unique_games || 0);
  }
  if (quest.type === 'runs') {
    return inWindow.length >= Number(quest.runs || 0);
  }
  return false;
}

function applyQuestBonuses(state, now, run) {
  let questBonus = 0;
  const stillActive = [];
  for (const quest of state.quests.active) {
    const expired = Number(quest.expires_at) <= now;
    if (expired) continue;
    if (evaluateQuest(quest, state.history, run)) {
      questBonus += Number(quest.bonus) || 0;
      state.quests.completed.push({
        id: quest.id,
        title: quest.title,
        bonus: Number(quest.bonus) || 0,
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
  return Math.min(questBonus, Number(config.quest.maxQuestBonusPerRun) || questBonus);
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
  updateStreak(state, dayKey);

  const difficultyWeight = getDifficultyWeight(game);
  const timeWeight = computeTimeWeight(game, duration);
  const basePoints = rawScore * difficultyWeight * timeWeight;

  const runsTodayForGame = countDailyRuns(state.history, dayKey, game) + 1;
  const recentSameGameRuns = countRecentSameGame(state.history, game, config.antiFarm.repeatWindow);
  const diminishing = diminishingMultiplier(runsTodayForGame);
  const repeatPenalty = repeatPenaltyMultiplier(recentSameGameRuns);
  const antiFarmBase = basePoints * diminishing * repeatPenalty;

  const streakBonus = antiFarmBase * clamp(state.streak.count * config.streak.step, 0, config.streak.maxMultiplier);
  const eventBonus = isWeekend(timestamp) ? antiFarmBase * config.event.weekendMultiplier : 0;
  const questBonus = applyQuestBonuses(state, timestamp, { game, raw_score: rawScore });

  let metaPoints = antiFarmBase + streakBonus + eventBonus + questBonus;
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
    duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : null,
    meta_points: metaPoints,
    difficulty_weight: Number(difficultyWeight.toFixed(4)),
    time_weight: Number(timeWeight.toFixed(4)),
    quest_bonus: Math.floor(questBonus),
    streak_bonus: Math.floor(streakBonus),
    event_bonus: Math.floor(eventBonus),
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
    quest_bonus: Math.floor(questBonus),
    streak_bonus: Math.floor(streakBonus),
    event_bonus: Math.floor(eventBonus),
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
    streak: state.streak.count,
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

