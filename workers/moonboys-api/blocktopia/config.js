export const TELEGRAM_AUTH_MAX_AGE = 86400;

export const XP_MIN = 0;
export const XP_MAX = 100000;
export const GEMS_MIN = 0;
export const GEMS_MAX = 10000;
export const TIER_MIN = 1;
export const TIER_MAX = 50;

export const BLOCKTOPIA_RATE_LIMIT_PER_MIN = 20;
export const BLOCKTOPIA_DRAIN_BASE_PER_MINUTE = 5;
export const BLOCKTOPIA_DRAIN_TIER_STEP = 0.5;
export const BLOCKTOPIA_DRAIN_MAX_PER_MINUTE = 30;
export const BLOCKTOPIA_ARCADE_MAX_XP_PER_MINUTE = 200;
export const BLOCKTOPIA_ARCADE_MAX_REWARDS_PER_GAME_PER_HOUR = 5;
export const BLOCKTOPIA_MAX_SCORE_SANITY = 1_000_000_000;
export const TELEGRAM_SYNC_XP_MULTIPLIER = 1.1;
export const XP_SOFT_CAP_PER_HOUR = 650;
export const XP_HARD_CAP_PER_DAY = 4000;
export const GEM_SOFT_CAP = 250;

export const PPS_MAX = 200;
export const PPS_DECAY_PER_MINUTE = 2;
export const PPS_IDLE_DECAY_PER_MINUTE = 4;
export const PPS_IDLE_THRESHOLD_MS = 5 * 60 * 1000;
export const PPS_SKIP_WINDOW_MINUTES = 12;
export const PPS_REPEAT_TARGET_WINDOW_MINUTES = 20;
export const PPS_ACTION_WINDOW_MINUTES = 1;
export const PPS_ACTIONS_PER_MINUTE_THRESHOLD = 8;
export const PPS_COOLDOWN_THRESHOLD = 100;

export const BLOCKTOPIA_COVERT_CREATE_COST = 4;
export const BLOCKTOPIA_COVERT_DEPLOY_COST = 2;
export const BLOCKTOPIA_COVERT_EXTRACT_COST = 1;
export const BLOCKTOPIA_COVERT_REVIVE_COST = 7;
export const BLOCKTOPIA_COVERT_STEALTH_BOOST_COST = 3;
export const BLOCKTOPIA_COVERT_RETASK_COST = 2;
export const BLOCKTOPIA_COVERT_HEAT_RELIEF_COST = 5;
export const BLOCKTOPIA_COVERT_RECOVERY_ACCELERATION_COST = 4;
export const BLOCKTOPIA_COVERT_EMERGENCY_EXTRACT_COST = 3;
export const BLOCKTOPIA_COVERT_OPERATION_MS = 15 * 60 * 1000;
export const BLOCKTOPIA_COVERT_SUCCESS_XP = 18;
export const BLOCKTOPIA_COVERT_GEM_REWARD_CHANCE = 0.25;
export const BLOCKTOPIA_COVERT_MAX_ACTIVE_OPERATIONS = 2;

export const UPGRADE_MAX_LEVEL = 10;
export const UPGRADE_EFFECT_CAP = 0.5;
export const BLOCKTOPIA_ENTRY_BASE_COST = 10;
export const BLOCKTOPIA_ENTRY_TIER_STEP = 2;
export const BLOCKTOPIA_MINI_GAME_COST_BASE = 10;
export const BLOCKTOPIA_MINI_GAME_COST_TIER_STEP = 1.5;
export const BLOCKTOPIA_MINI_GAME_REWARD_BASE = 20;
export const BLOCKTOPIA_MINI_GAME_REWARD_TIER_STEP = 2;
export const BLOCKTOPIA_MINI_GAME_LOSS_BASE = 10;
export const BLOCKTOPIA_MINI_GAME_LOSS_TIER_STEP = 1;
export const BLOCKTOPIA_MINI_GAME_GEM_CHANCE_BASE = 0.2;
export const BLOCKTOPIA_MINI_GAME_GEM_CHANCE_TIER_STEP = 0.01;
export const BLOCKTOPIA_MINI_GAME_GEM_CHANCE_CAP = 0.5;
export const BLOCKTOPIA_SURVIVAL_XP_FLOOR = 5;
export const BLOCKTOPIA_SKIP_COST_MULTIPLIER = 1.6;
export const BLOCKTOPIA_SKIP_STREAK_STEP = 0.35;

export const BLOCKTOPIA_UPGRADES = {
  efficiency: { column: 'upgrade_efficiency', baseCost: 8 },
  signal: { column: 'upgrade_signal', baseCost: 10 },
  defense: { column: 'upgrade_defense', baseCost: 12 },
  gem: { column: 'upgrade_gem', baseCost: 9 },
  npc: { column: 'upgrade_npc', baseCost: 11 },
};
