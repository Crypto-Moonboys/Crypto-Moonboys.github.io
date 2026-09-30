Warning: truncated output (original token count: 91027)
Total output lines: 5012

import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import moonboysApiWorker, { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const liveSystemsSource = fs.readFileSync(new URL('../workers/moonboys-api/pets/live-systems.js', import.meta.url), 'utf8');
const petRecoverySqlSources = [
  worker,
  'daily-moon-run.js',
  'journey-recovery.js',
  'recovery-limits.js',
  'runtime-recovery.js',
  'weekly-boss-recovery.js',
].map((source) => source === worker ? source : fs.readFileSync(new URL(`../workers/moonboys-api/pets/${source}`, import.meta.url), 'utf8')).join('\n');
const walletReconciliation = fs.readFileSync(new URL('../workers/moonboys-api/pets/wallet-reconciliation.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/030_telegram_pets.sql', import.meta.url), 'utf8');
const economyMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/031_telegram_pets_economy.sql', import.meta.url), 'utf8');
const notificationsMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/032_telegram_pets_notifications.sql', import.meta.url), 'utf8');
const runMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/033_telegram_pet_run_engine.sql', import.meta.url), 'utf8');
const kaijuMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/034_telegram_pet_kaiju.sql', import.meta.url), 'utf8');
const repeatRewardMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/041_telegram_pet_repeat_reward_slots.sql', import.meta.url), 'utf8');
const inventoryReconciliationMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/045_telegram_pet_inventory_cutover_reconciliation.sql', import.meta.url), 'utf8');
const activityMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/035_telegram_pet_activity_sessions.sql', import.meta.url), 'utf8');
const arenaMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/036_telegram_pet_arena.sql', import.meta.url), 'utf8');
const arenaTurnsMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/037_telegram_pet_arena_turns.sql', import.meta.url), 'utf8');
const workerSchema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');

const {
  PET_ACTIONS,
  PET_SPECIAL_ACTION_POLICIES,
  PET_MEDIA_MANIFEST,
  PET_RUN_CHOICE_LIBRARY,
  PET_RUN_MAX_DEPTH,
  PET_RUN_STEP_CHOICES,
  PET_KAIJU_CARDS,
  PET_KAIJU_CATEGORIES,
  PET_ARENA_MOVE_GUIDE,
  PET_RANDOM_EVENTS,
  PET_REPEAT_REWARD_RULES,
  ensurePetStarterSeasonSlot,
  awardPetReward,
  applyPetItemActionBonuses,
  awardPetKaijuPlayerResult,
  finishPetKaijuMatch,
  getPetHighLevelGearXpMultiplier,
  getPetRepeatRewardMultiplier,
  processPetRandomEvent,
  processPetAction,
  processPetDailyChest,
  processPetShopPurchase,
  processPetGoldTrade,
  processPetAdventure,
  claimPetActivitySession,
  cancelPetActivitySession,
  expireOldPetActivitySessions,
  getPetInventory,
  processPetUseItem,
  startOrResumePetRun,
  processPetRunExtract,
  recordPetRunBankedEvent,
  processPetRunStep,
  serializePetRun,
  evolveMoonpet,
  reservePetRepeatRewardEvent,
  scalePetRewards,
  buildPetKaijuCardReplyMarkup,
  buildPetKaijuLobbyReplyMarkup,
  buildPetKaijuMatchId,
  resolvePetKaijuBattle,
  getPetArenaRankBucket,
  calculatePetArenaPower,
  buildPetArenaMenuReplyMarkup,
  buildPetArenaMatchReplyMarkup,
  buildPetArenaMoveReplyMarkup,
  parsePetArenaCallbackPayload,
  resolvePetArenaRoundState,
  serializePetMiniAppArenaBattle,
  serializePetMiniAppActionResult,
  serializePetMiniAppKaijuMatch,
  buildMoonpetIdentityAuthorityAudit,
  PET_SEASON_EXTRA_SLOT_COSTS,
  buildPetSeasonSlotSummary,
  processPetMiniAppAction,
  buildPetMiniAppState,
  normalizePetCooldownWindow,
  buildPetCooldownFromSeconds,
  buildPetMiniAppCooldownSummary,
  getPetSpecialActionCooldownEntries,
  getPetSpecialActionCooldownEntriesFromState,
  sumPetArenaGearPower,
  scalePetArenaRewardsForPlayer,
  getPetArenaBucketDistance,
  serializePet,
  serializePetLeaderboardEntry,
  buildPetMiniAppLeaderboard,
  formatPetStatus,
  formatPetDetails,
  petReplyMarkup,
  buildPetAdventureMenuReplyMarkup,
  buildPetManagementMenuReplyMarkup,
  buildPetProgressMenuReplyMarkup,
  normalizePetActivityType,
  computePetActivityRewards,
  getPetEconomyState,
  getPetEvolutionGuidance,
  buildPetGuidanceState,
  syncPetAchievements,
  readTelegramPetPresentation,
  runPetCrystalExpedition,
  formatPetActivityLine,
  buildPetMediaUrl,
  buildPetRunChoiceReplyMarkup,
  buildPetRunExtractEventKey,
  buildPetRunStepEventKey,
  applyPetRunStatRewards,
  getUnaffordablePetRunCosts,
  buildPetRandomEventReplyMarkup,
  formatPetRandomEventSummary,
  formatTelegramPetHeroCaption,
  formatTelegramPetMediaCaption,
  shouldUsePhotoCaptionOnly,
  resolvePetRandomEncounter,
  resolvePetMediaKey,
  sendTelegramPetReply,
} = __petMediaTestHooks;

function asyncBlock(name) {
  const marker = `async function ${name}(`;
  const start = worker.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = worker.indexOf(') {', start);
  let depth = 0;
  let opened = false;
  for (let i = bodyStart + 2; i < worker.length; i += 1) {
    const char = worker[i];
    if (char === '{') {
      depth += 1;
      opened = true;
    } else if (char === '}') {
      depth -= 1;
      if (opened && depth === 0) return worker.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function routeBlock(route) {
  const marker = `path === '${route}'`;
  const start = worker.indexOf(marker);
  assert.notEqual(start, -1, `${route} route must exist`);
  const nextRoute = worker.indexOf("\n    if (path === '", start + marker.length);
  return worker.slice(start, nextRoute === -1 ? worker.length : nextRoute);
}

function assertOrder(block, earlier, later, message) {
  assert.ok(block.includes(earlier), `${message} (earlier snippet missing)`);
  assert.ok(block.includes(later), `${message} (later snippet missing)`);
  assert.ok(block.indexOf(earlier) < block.indexOf(later), message);
}

const cooldownNow = new Date('2026-08-22T12:00:00.000Z');
assert.deepEqual(
  normalizePetCooldownWindow('2026-08-22T12:05:00.000Z', cooldownNow),
  { expires_at: '2026-08-22T12:05:00.000Z', remaining_seconds: 300, server_time: '2026-08-22T12:00:00.000Z' },
  'authoritative cooldown windows must expose expires_at, remaining_seconds, and server_time',
);
assert.equal(
  normalizePetCooldownWindow('2026-08-22T11:59:59.000Z', cooldownNow).remaining_seconds,
  0,
  'expired cooldown windows must clamp remaining_seconds to zero',
);
assert.deepEqual(
  buildPetCooldownFromSeconds(90, cooldownNow),
  { expires_at: '2026-08-22T12:01:30.000Z', remaining_seconds: 90, server_time: '2026-08-22T12:00:00.000Z' },
  'relative action cooldowns must resolve to a server-authoritative expiry timestamp',
);
const serializedCooldownAction = serializePetMiniAppActionResult({
  accepted: false,
  reason: 'cooldown',
  cooldown: normalizePetCooldownWindow('2026-08-22T12:02:00.000Z', cooldownNow),
  expires_at: '2026-08-22T12:02:00.000Z',
  remaining_seconds: 120,
  server_time: '2026-08-22T12:00:00.000Z',
});
assert.deepEqual(serializedCooldownAction.cooldown, {
  expires_at: '2026-08-22T12:02:00.000Z',
  remaining_seconds: 120,
  server_time: '2026-08-22T12:00:00.000Z',
}, 'rejected action cooldown metadata must reach the Mini App result payload');
assert.equal(serializedCooldownAction.expires_at, '2026-08-22T12:02:00.000Z',
  'rejected action expires_at must not be dropped from the Mini App result payload');
assert.equal(serializedCooldownAction.server_time, '2026-08-22T12:00:00.000Z',
  'rejected action server_time must not be dropped from the Mini App result payload');
const simultaneousCooldowns = buildPetMiniAppCooldownSummary({
  now: cooldownNow,
  journeySummary: {
    daily: { cooldown: normalizePetCooldownWindow('2026-08-23T00:00:00.000Z', cooldownNow) },
    weekly: { cooldown: normalizePetCooldownWindow('2026-08-24T00:00:00.000Z', cooldownNow) },
  },
  guidance: {
    activity: { cooldown: normalizePetCooldownWindow('2026-08-22T12:03:00.000Z', cooldownNow) },
    weekly_boss: { cooldown: normalizePetCooldownWindow('2026-08-22T23:59:59.000Z', cooldownNow) },
  },
  liveSystems: {
    regions: [{ key: 'alley', title: 'Moon Alley', cooldown: normalizePetCooldownWindow('2026-08-22T12:02:00.000Z', cooldownNow) }],
    chains: [{ key: 'signal', title: 'Signal Chain', cooldown: normalizePetCooldownWindow('2026-08-22T12:04:00.000Z', cooldownNow) }],
    seasonal_boss: { cooldown: normalizePetCooldownWindow('2026-08-22T12:01:00.000Z', cooldownNow) },
  },
  seasonSlots: { season: { end_at: '2026-10-01T00:00:00.000Z' } },
});
assert.equal(simultaneousCooldowns.next_expires_at, '2026-08-22T12:01:00.000Z',
  'multiple simultaneous cooldowns must advertise the earliest expiry for auto-refresh');
assert.deepEqual(
  simultaneousCooldowns.entries.slice(0, 4).map((entry) => entry.key),
  ['seasonal_boss_attempt', 'district:alley', 'timed_activity_claim', 'story:signal'],
  'cooldown summary must preserve independent action timers in expiry order',
);
const defeatedBossCooldowns = buildPetMiniAppCooldownSummary({
  now: cooldownNow,
  guidance: {
    weekly_boss: { defeated: true, attempt_used: true, cooldown: normalizePetCooldownWindow('2026-08-23T00:00:00.000Z', cooldownNow) },
  },
  liveSystems: {
    seasonal_boss: { defeated_at: '2026-08-22T12:00:00.000Z', attempted_today: true, cooldown: normalizePetCooldownWindow('2026-08-23T00:00:00.000Z', cooldownNow) },
  },
});
assert.equal(defeatedBossCooldowns.entries.some((entry) => entry.key === 'weekly_boss_attempt'), false,
  'weekly boss defeated state must not emit a daily-attempt cooldown even when stale cooldown metadata exists');
assert.equal(defeatedBossCooldowns.entries.some((entry) => entry.key === 'seasonal_boss_attempt'), false,
  'seasonal boss defeated state must not emit a daily-attempt cooldown even when stale cooldown metadata exists');
for (const entry of simultaneousCooldowns.entries) {
  assert.equal(entry.server_time, '2026-08-22T12:00:00.000Z',
    `${entry.key} cooldown entry must carry server_time for clock-drift-safe ticking`);
  assert.match(entry.expires_at, /^\d{4}-\d{2}-\d{2}T/,
    `${entry.key} cooldown entry must carry expires_at`);
  assert.equal(typeof entry.remaining_seconds, 'number',
    `${entry.key} cooldown entry must carry remaining_seconds`);
}
const specialActionCooldownSummary = buildPetMiniAppCooldownSummary({
  now: cooldownNow,
  actionCooldowns: [{
    action: 'energy_drink',
    used_today: 1,
    daily_limit: 3,
    cooldown: normalizePetCooldownWindow('2026-08-22T12:10:00.000Z', cooldownNow),
  }],
});
assert.equal(specialActionCooldownSummary.entries[0].key, 'action:energy_drink',
  'special action cooldowns must be exposed to the Mini App as independent action timers');
assert.deepEqual(getPetSpecialActionCooldownEntriesFromState({
  energy_drink: {
    used_today: 1,
    daily_limit: 3,
    cooldown: normalizePetCooldownWindow('2026-08-22T12:10:00.000Z', cooldownNow),
  },
  dance: { used_today: 0, daily_limit: 5, cooldown: null },
}), [{
  action: 'energy_drink',
  used_today: 1,
  daily_limit: 3,
  cooldown: normalizePetCooldownWindow('2026-08-22T12:10:00.000Z', cooldownNow),
}], 'state refresh must reuse the authoritative special-action guidance without another D1 read');
assert.deepEqual(PET_SPECIAL_ACTION_POLICIES, {
  energy_drink: { cooldown_seconds: 600, daily_limit: 3 },
  dance: { cooldown_seconds: 300, daily_limit: 5 },
  cuddles: { cooldown_seconds: 300, daily_limit: 5 },
});
assert.deepEqual(
  Object.fromEntries(['energy_drink', 'dance', 'cuddles'].map((action) => [action, PET_ACTIONS[action]])),
  {
    energy_drink: { pet_xp: 0, community_xp: 0, hunger: 0, happiness: 0, cleanliness: 0, energy: 28, gold: 0, crystals: 0, style_tokens: 0 },
    dance: { pet_xp: 0, community_xp: 0, hunger: 0, happiness: 18, cleanliness: 0, energy: 0, gold: 0, crystals: 0, style_tokens: 0 },
    cuddles: { pet_xp: 0, community_xp: 0, hunger: 0, happiness: 8, cleanliness: 0, energy: 0, gold: 0, crystals: 0, style_tokens: 0 },
  },
  'special actions must remain bounded stat-only care actions without currency or XP rewards',
);
assert.match(worker, /daily: \{ utc_day: dayKey, day_reset_at, cooldown: dailyCooldown, expires_at: dailyCooldown\?\.expires_at[^}]*remaining_seconds: dailyCooldown\?\.remaining_seconds[^}]*server_time: dailyCooldown\?\.server_time/s,
  'daily journey summary must expose the complete cooldown contract at top level');
assert.match(worker, /weekly: \{ qualification_week: week, week_reset_at, cooldown: weeklyCooldown, expires_at: weeklyCooldown\?\.expires_at[^}]*remaining_seconds: weeklyCooldown\?\.remaining_seconds[^}]*server_time: weeklyCooldown\?\.server_time/s,
  'weekly journey summary must expose the complete cooldown contract at top level');
assert.match(worker, /const weeklyBossDefeated = Boolean\(weeklyProgress\?\.defeated_at\);[\s\S]*const weeklyAttemptCooldown = weeklyAttempt && !weeklyBossDefeated \? normalizePetCooldownWindow/,
  'weekly boss daily cooldown must only attach when the daily attempt is consumed and the boss is not defeated');
assert.match(worker, /const unlockAt = new Date\(startedAtMs \+ PET_ACTIVITY_MIN_SECONDS \* 1000\)\.toISOString\(\);[\s\S]*const cooldown = normalizePetCooldownWindow\(unlockAt, now\)/,
  'pet activity cooldown expiry must be built from started_at plus PET_ACTIVITY_MIN_SECONDS');
for (const snippet of [
  'server_time: dailyUsed ? dailyCooldown?.server_time : null',
  'server_time: chain.used_today ? dailyCooldown?.server_time : null',
  'const bossCooldown = bossUsedToday && !bossDefeated ? dailyCooldown : null',
  'server_time: bossCooldown?.server_time || null',
]) {
  assert.ok(liveSystemsSource.includes(snippet),
    'region, story, and seasonal locks must expose server_time and defeated boss cooldown precedence');
}

assert.ok(worker.includes('TELEGRAM_PETS_BOT_SECRET'), 'pet-only bot secret must be used');
assert.ok(worker.includes('X-Pets-Bot-Secret'), 'pet-only header must be used');
assert.ok(worker.includes("path === '/telegram-pets/action'"), '/telegram-pets/action route must exist');
assert.ok(worker.includes("path === '/telegram-pets/leaderboard'"), '/telegram-pets/leaderboard route must exist');
assert.ok(worker.includes("path === '/telegram-pets/state'"), '/telegram-pets/state route must exist');
assert.ok(worker.includes("path === '/api/telegram/pets/identity/audit'"), 'production identity authority audit endpoint must exist');
const identityAuditRouteSource = routeBlock('/api/telegram/pets/identity/audit');
assert.ok(identityAuditRouteSource.includes('verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth)'),
  'identity authority audit endpoint must require valid Telegram authentication');
assert.ok(identityAuditRouteSource.includes("readTelegramAuthEvidenceFromAuthorization(request)"),
  'identity authority audit endpoint must read Telegram auth from the Authorization header');
assert.ok(identityAuditRouteSource.includes("url.searchParams.has('telegram_auth')") && identityAuditRouteSource.includes("url.searchParams.has('auth_evidence')"),
  'identity authority audit endpoint must reject URL credentials');
assert.ok(identityAuditRouteSource.indexOf("'/api/telegram/pets/identity/audit:preauth'") < identityAuditRouteSource.indexOf('verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth)'),
  'identity authority audit endpoint must apply an IP rate limit before Telegram auth verification');
assert.ok(identityAuditRouteSource.includes('buildMoonpetIdentityAuthorityAudit(env.DB, verified.telegramId'),
  'identity authority audit endpoint must read through pet-authorized audit helper');
assert.ok(identityAuditRouteSource.includes('identity_authority_audit_failed'),
  'identity authority audit endpoint must return an explicit failure when diagnostics cannot be read');
assert.ok(identityAuditRouteSource.includes("'Cache-Control': 'no-store'"),
  'identity authority audit endpoint must mark all responses no-store');
assert.doesNotMatch(identityAuditRouteSource, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/i,
  'identity authority audit endpoint must remain read only');
assert.ok(!worker.includes("path === '/telegram-pets/season/slots'"), '/telegram-pets/season/slots must not expose owner-specific slot data without auth');
assert.ok(worker.includes("path === '/telegram-pets/missions'"), '/telegram-pets/missions route must exist');
assert.ok(worker.includes("path === '/telegram-pets/activity'"), '/telegram-pets/activity route must exist');
const activityRouteSource = fs.readFileSync(new URL('../workers/moonboys-api/pets/leaderboard.js', import.meta.url), 'utf8');
assert.ok(!activityRouteSource.includes('e.event_type <> ?') && activityRouteSource.includes('e.event_key<>?') && activityRouteSource.includes('PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY'),
  '/telegram-pets/activity must filter wallet reconciliation markers by the shared event-key constant only');
assert.ok(worker.includes("path === '/telegram-pets/shop'"), '/telegram-pets/shop route must exist');
assert.ok(worker.includes("path === '/telegram-pets/inventory'"), '/telegram-pets/inventory route must exist');
assert.ok(worker.includes("body.action === 'trade'"), 'telegram pets action route must dispatch trade actions');
assert.ok(worker.includes("body.action === 'adventure'"), 'telegram pets action route must dispatch adventure actions');
assert.ok(worker.includes("body.action === 'use_item'"), 'telegram pets action route must dispatch use_item actions');
assert.ok(worker.includes("body.action === 'work'"), 'telegram pets action route must dispatch work actions');
assert.ok(worker.includes("body.action === 'daily_chest'"), 'telegram pets action route must dispatch daily_chest actions');
assert.ok(worker.includes("body.action === 'random_event'"), 'telegram pets action route must dispatch random_event actions');
assert.ok(worker.includes("body.action === 'season_slots'"), 'telegram pets action route must dispatch season slot summary reads');
assert.ok(worker.includes("body.action === 'buy_pet_slot'"), 'season slot purchases must be exposed through the authenticated action route');
assert.ok(worker.includes("body.action === 'switch_pet_slot'"), 'active slot switching must be exposed through the authenticated action route');
assert.ok(worker.includes("body.action === 'run'"), 'telegram pets action route must dispatch run start/resume actions');
assert.ok(worker.includes("body.action === 'run_step'"), 'telegram pets action route must dispatch run step actions');
assert.ok(worker.includes("body.action === 'run_extract'"), 'telegram pets action route must dispatch run extract actions');
assert.ok(worker.includes('export const __petMediaTestHooks'), 'pet media test hooks must be exported');

const rareLeaderboardEntry = serializePetLeaderboardEntry({
  pet_name: 'Cipher',
  stage: 'cyber',
  lifecycle_phase: 'rare',
  lifecycle_species_id: 'neon_raccoon',
  evolution_stage: 5,
  rare_morph_id: 'graffiti_guardian',
  level: 19,
  pet_xp: 4242,
  moon_gold: 777,
  moon_crystals: 23,
  style_tokens: 41,
  streak_days: 9,
}, 2);
assert.deepEqual(rareLeaderboardEntry, {
  rank: 3,
  name: 'F1 EDDY',
  pet_name: 'F1 EDDY',
  stage: 'graffiti_guardian',
  phase: 'rare',
  evolution_stage: 5,
  identity_revealed: true,
  display_name: 'F1 EDDY',
  art_identity_id: 'neon_raccoon',
  species_id: 'neon_raccoon',
  species_name: 'F1 EDDY',
  rare_morph_id: 'graffiti_guardian',
  rare_morph_name: 'Graffiti Guardian',
  level: 19,
  pet_xp: 4242,
  moon_gold: 777,
  moon_crystals: 23,
  style_tokens: 41,
  streak_days: 9,
}, 'leaderboard serializer must carry lifecycle identity and all persisted Moonpet currencies');
const speciesLabelMap = {
  neon_raccoon: 'F1 EDDY',
  bubble_ram: 'JAKE THE SNAKE',
  comet_gecko: 'TUBBY',
  vinyl_crab: 'BOTTY',
  lantern_fox: 'RED ALERT',
  sneaker_snail: 'THE TING',
  alley_drake: 'TATTOO JOHN',
  moon_ferret: 'TIN BOB',
};
for (const [speciesId, speciesName] of Object.entries(speciesLabelMap)) {
  const serialized = serializePetLeaderboardEntry({
    lifecycle_phase: 'adult',
    lifecycle_species_id: speciesId,
    evolution_stage: 3,
  }, 0);
  assert.equal(serialized.species_id, speciesId);
  assert.equal(serialized.species_name, speciesName, `leaderboard serializer must map ${speciesId} to ${speciesName}`);
}
const eggLeaderboardEntry = serializePetLeaderboardEntry({
  pet_name: 'Unhatched',
  lifecycle_phase: 'egg',
  lifecycle_species_id: 'alley_drake',
  moon_gold: 10,
  moon_crystals: 2,
  style_tokens: 1,
}, 0);
assert.equal(eggLeaderboardEntry.art_identity_id, null, 'leaderboard must not expose an unrevealed art identity');
assert.equal(eggLeaderboardEntry.species_id, null, 'leaderboard must not reveal an egg species');
assert.equal(eggLeaderboardEntry.species_name, 'UNKNOWN', 'leaderboard species name must use the exact locked placeholder');
assert.equal(eggLeaderboardEntry.display_name, 'UNKNOWN', 'leaderboard identity must use the exact locked placeholder');
assert.equal(eggLeaderboardEntry.pet_name, 'UNKNOWN', 'stored nicknames must not occupy the hidden identity surface');
assert.equal(eggLeaderboardEntry.name, 'UNKNOWN', 'generic name fields must not leak a stored nickname');
assert.match(worker, /player_display_name: \[row\.first_name, row\.last_name\][\s\S]*'Anonymous'/, 'public pet leaderboard must never fall back to a Telegram ID');
assert.match(worker, /MOONPET_SPECIES, createMoonEggLifecycle, ensureMoonpetLifecycle,/, 'legacy lifecycle materialization dependency must be imported');
assert.match(worker, /import \{ readPetLeaderboard, readPetActivity \}/, 'public read surfaces must use shared read-only projections');
assert.match(worker, /pet_mini_app_state_failed/, 'Mini App state failures must return a controlled JSON error instead of an uncaught fetch failure');
assert.doesNotMatch(petRecoverySqlSources, /\btelegram_settings\b/, 'Moonpet recovery must not depend on the legacy production telegram_settings schema');
assert.match(schema, /CREATE TABLE IF NOT EXISTS telegram_pet_recovery_cursors[\s\S]*PRIMARY KEY \(telegram_id, setting_key\)/, 'schema must define the dedicated per-player Moonpet cursor table');
const miniAppStateBuilder = asyncBlock('buildPetMiniAppState');
assert.match(miniAppStateBuilder, /readPetLeaderboard\(db, \{ period: 'seasonal', limit: 10, now \}\)/, 'initial Mini App ranks must use the shared current-season query');
assert.match(miniAppStateBuilder, /pet_mini_app_initial_leaderboard_failed[\s\S]*throw error/, 'Mini App state must propagate ranking query errors');
assert.match(miniAppStateBuilder, /season_slots: seasonSlots/, 'Mini App state must expose current-season pet slots');
const miniAppActionProcessor = asyncBlock('processPetMiniAppAction');
assert.match(miniAppActionProcessor, /action === 'season_slots'/, 'Mini App action handler must expose season slot summary reads');
assert.match(miniAppActionProcessor, /buyPetSeasonSlot\(db, telegramId/, 'Mini App action handler must sell slots through the authenticated action flow');
assert.match(miniAppActionProcessor, /switchActivePetSeasonSlot\(db, telegramId/, 'Mini App action handler must switch owned slots through the authenticated action flow');
assert.doesNotMatch(String(serializePetLeaderboardEntry({ telegram_id: 'private-id' })), /private-id/, 'serialized leaderboard entries must not expose internal Telegram owner IDs');
assert.match(worker, /if \(!lifecycleRow\)[\s\S]*createMoonEggLifecycle/, 'adoption retries must repair a missing lifecycle as an egg');
assert.match(worker, /const callbackLifecycle = await getMoonpetLifecycle/, 'legacy pet callbacks must enforce the egg-stage gate');
assert.match(worker, /await syncMoonpetLifecycleStage\(db, telegramId, next\.stage\)/, 'legacy evolve command must synchronize lifecycle adulthood');
assert.match(worker, /async function getMoonpetIdentityWithLifecycle/, 'Telegram reactions must receive lifecycle temperament and traits');
assert.match(worker, /getExistingMoonpetLifecycle\(db, telegramId\)/, 'reaction reads must not materialize lifecycle rows or mutate state');
const petLeaderboardRoute = routeBlock('/telegram-pets/leaderboard');
assert.ok(petLeaderboardRoute.includes('readPetLeaderboard(env.DB'), 'public and Mini App ranks must use the same projection');
for (const field of ['moon_gold', 'moon_crystals', 'style_tokens', 'lifecycle_phase', 'lifecycle_species_id', 'rare_morph_id']) {
  assert.ok(activityRouteSource.includes(field), `shared leaderboard projection must return ${field}`);
}

assert.ok(worker.includes("case 'petarena'"), '/petarena command must exist');
assert.ok(worker.includes("callback_data: 'pet:arena'"), 'pet menu must include Arena button');
assert.ok(worker.includes('Pet Arena unlocks at level 10. Keep growing your Moonpet.'), 'level <10 blocked copy must be exact');
assert.ok(worker.includes("PET_ARENA_MIN_LEVEL as COMBAT_ARENA_MIN_LEVEL"), 'level 10+ can enter Pet Arena through the shared combat contract');
assert.ok(worker.includes("reason: combat.arena_reason"), 'direct Arena actions must return the canonical Arena lock reason');
assert.ok(!worker.includes("eligible.reason === 'level_locked' ? 'Pet Arena unlocks"), 'Telegram Arena guidance must not retain the legacy level-lock reason');
assert.ok(worker.includes("createPetArenaBattle(db, chatId, pet, appPet, 'app')"), 'private app battle works');
assert.ok(!worker.includes('const done = await completePetArenaBattle(db, battle); await sendTelegramMessage(tok, chatId, formatPetArenaResult(done.battle || battle)); return;'), 'App battle does not instantly complete on create.');
assert.ok(worker.includes('selectPetArenaAppMove(battle)'), 'App battle advances after player move and app AI move.');
assert.ok(worker.includes("Move locked. Waiting for opponent."), 'Group battle waits for both move locks.');
assert.ok(worker.includes("Stale Pet Arena move. Choose from the latest round prompt."), 'Stale round move callbacks are rejected.');
assert.ok(worker.includes("reason:'stale_arena_round'"), 'stale app callbacks reject by callback round mismatch.');
assert.ok(worker.includes('Number(expectedRound || 0) !== roundNumber'), 'stale group callbacks reject by active battle round mismatch.');
// Duplicate damage and interrupted retries are exercised against SQLite in moonpet-combat-sanity.test.mjs.
assert.ok(worker.includes("'move_already_locked'"), 'A locked move still waiting for the opponent remains explicit.');
assert.ok(worker.includes('forfeitPetArenaBattle'), 'Forfeit resolves safely.');
assert.ok(worker.includes("!['readying','active'].includes(String(battle.status))"), 'stale forfeit after completed battle is rejected before mutation.');
assert.ok(worker.includes("WHERE battle_id=? AND status IN ('readying','active')"), 'forfeit update only claims live battles and cannot rewrite completed winner/result/HP.');
assert.ok(worker.includes("Number(claim?.meta?.changes || 0) <= 0) return { accepted:true, duplicate:true, reason:'already_completed'"), 'stale forfeit with zero changed rows is treated as duplicate and does not award again.');
assert.ok(worker.indexOf("Number(claim?.meta?.changes || 0) <= 0") < worker.indexOf('return completePetArenaBattle(db, await getPetArenaBattle(db, battle.battle_id), true);', worker.indexOf('async function forfeitPetArenaBattle')), 'forfeit calls completePetArenaBattle only after claiming a live battle.');
assert.ok(worker.includes('telegram_pet_arena_queue'), 'group queue works');
assert.ok(worker.includes('ORDER BY CASE WHEN rank_bucket=? THEN 0'), 'same-rank match preferred');
assert.ok(worker.includes('Accept Any Rank'), 'mismatch fallback works');
assert.ok(worker.includes('telegram_id<>?'), 'user cannot battle themselves');
assert.ok(worker.includes('Finish your current Pet Arena battle first.'), 'active arena battle guard must use exact blocked copy');
assert.ok(worker.includes('player1_telegram_id = ? OR player2_telegram_id = ?'), 'active battle guard must check both player roles');
assert.ok(worker.includes("reason:'already_completed'"), 'duplicate callbacks do not double-award');
assert.ok(worker.includes("UPDATE telegram_pet_arena_battles SET status='completed'"), 'completion claim-before-award');
assert.ok(worker.includes('const claimRows = await db.prepare'), 'queue claim must capture update result before battle creation');
assert.ok(worker.includes('Number(claimRows?.meta?.changes || 0) !== 2'), 'queue claim race must require exactly two claimed rows');
assert.ok(worker.includes('Pet Arena queue changed before the match was claimed'), 'queue claim race must avoid duplicate battle creation and ask user to retry');
assert.ok(worker.includes("UPDATE telegram_pet_arena_queue SET status='waiting'"), 'partial queue claim changes === 1 must restore current user queue row to waiting');
assert.ok(worker.includes('player1_ready_at') && worker.includes('player2_ready_at'), 'group ready flow must track both player ready states');
assert.ok(worker.includes("reason:'waiting_for_opponent'"), 'one Ready must wait for opponent instead of completing');
assert.ok(worker.includes('updated?.player1_ready_at && updated?.player2_ready_at'), 'second Ready must complete group battle');
assert.ok(worker.includes('accept_any_rank=MAX'), 'Accept Any Rank must persist on the queue row');
assert.ok(worker.includes('PET_ARENA_ANY_RANK_TIMEOUT_MINUTES'), 'arena must widen far-rank matchmaking after a shorter timeout');
assert.ok(worker.includes('PET_ARENA_QUEUE_TTL_MINUTES'), 'arena queue expiry must use a longer TTL than matchmaking widening');
assert.ok(worker.includes('COALESCE(expires_at, created_at) < ?'), 'active turn battle expiry must use expires_at before created_at fallback.');
assert.ok(worker.includes('refreshPetArenaExpiry(db, battle.battle_id)'), 'valid arena moves must refresh battle expiry.');
assert.ok(worker.includes("status='active', expires_at=?"), 'readying an arena battle must refresh expires_at.');
assert.ok(worker.includes('OR ?=1 OR updated_at < datetime'), 'far-rank matching must require Accept Any Rank or queue timeout');
assert.ok(worker.indexOf('PET_ARENA_QUEUE_TTL_MINUTES') < worker.indexOf('PET_ARENA_ANY_RANK_TIMEOUT_MINUTES', worker.indexOf('SELECT * FROM telegram_pet_arena_queue')), 'far-rank users can become eligible after waiting without being expired first');
assert.equal(parsePetArenaCallbackPayload('arena:find'), 'find');
assert.equal(parsePetArenaCallbackPayload('arena:any'), 'any');
assert.equal(parsePetArenaCallbackPayload('arena:cancel'), 'cancel');
assert.equal(parsePetArenaCallbackPayload('arena:ready:a-abcdef1234'), 'ready:a-abcdef1234');
assert.equal(parsePetArenaCallbackPayload('arena:stop:a-abcdef1234'), 'stop:a-abcdef1234');
assert.equal(parsePetArenaCallbackPayload('arena:mv:a-abcdef1234:1:ah'), 'mv:a-abcdef1234:1:ah');
assert.equal(parsePetArenaCallbackPayload('arena:ff:a-abcdef1234'), 'ff:a-abcdef1234');
assert.equal(getPetArenaRankBucket(10), 'rookie');
assert.equal(getPetArenaRankBucket(15), 'scrapper');
assert.equal(getPetArenaRankBucket(25), 'enforcer');
assert.equal(getPetArenaRankBucket(40), 'cyber_beast');
assert.equal(getPetArenaRankBucket(70), 'moon_warlord');
assert.equal(getPetArenaBucketDistance(10, 70), 4, 'bucket distance must measure rank mismatch');
const sameRankBattle = { player1_telegram_id: '1', player2_telegram_id: '2', player1_pet_snapshot_json: JSON.stringify({ level: 15 }), player2_pet_snapshot_json: JSON.stringify({ level: 16 }) };
const underdogBattle = { player1_telegram_id: '1', player2_telegram_id: '2', player1_pet_snapshot_json: JSON.stringify({ level: 15 }), player2_pet_snapshot_json: JSON.stringify({ level: 40 }) };
const highLevelBattle = { player1_telegram_id: '1', player2_telegram_id: '2', player1_pet_snapshot_json: JSON.stringify({ level: 70 }), player2_pet_snapshot_json: JSON.stringify({ level: 15 }) };
const normalArenaRewards = scalePetArenaRewardsForPlayer(sameRankBattle, 'player1_win', '1', { pet_xp: 34, community_xp: 7, moon_gold: 20 });
const underdogArenaRewards = scalePetArenaRewardsForPlayer(underdogBattle, 'player1_win', '1', { pet_xp: 34, community_xp: 7, moon_gold: 20 });
const reducedArenaRewards = scalePetArenaRewardsForPlayer(highLevelBattle, 'player1_win', '1', { pet_xp: 34, community_xp: 7, moon_gold: 20 });
assert.equal(normalArenaRewards.modifier, 'normal', 'same-rank normal reward stays unscaled');
assert.ok(underdogArenaRewards.rewards.pet_xp > normalArenaRewards.rewards.pet_xp && underdogArenaRewards.modifier === 'underdog_bonus', 'underdog win bonus rewards must scale up');
assert.ok(reducedArenaRewards.rewards.pet_xp < normalArenaRewards.rewards.pet_xp && reducedArenaRewards.modifier === 'high_level_reduced', 'high-level win reduced rewards must scale down');
for (const button of buildPetArenaMenuReplyMarkup().inline_keyboard.flat().filter((entry) => entry.callback_data)) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64, `Arena menu callback too long: ${button.callback_data}`);
for (const button of buildPetArenaMatchReplyMarkup('a-abcdef1234').inline_keyboard.flat().filter((entry) => entry.callback_data)) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64, `Arena match callback too long: ${button.callback_data}`);
for (const button of buildPetArenaMoveReplyMarkup('a-abcdef1234', 12).inline_keyboard.flat().filter((entry) => entry.callback_data)) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64, `Arena move callback too long: ${button.callback_data}`);
const baseArenaPet = { telegram_id: '1', pet_name: 'Moonpet', pet_xp: 2500, health: 90, energy: 90, happiness: 90, cleanliness: 90 };
assert.ok(calculatePetArenaPower({ ...baseArenaPet, equipped_weapon: 'laser_claws' }, 'gear') > calculatePetArenaPower(baseArenaPet, 'gear'), 'gear affects battle power');
assert.ok(sumPetArenaGearPower({ attack: 0, defense: 0, crit: 2, dodge: 0, luck: 0 }) > 0, 'secondary crit stats affect power');
assert.ok(sumPetArenaGearPower({ attack: 0, defense: 0, crit: 0, dodge: 2, luck: 0 }) > 0, 'secondary dodge stats affect power');
assert.ok(sumPetArenaGearPower({ attack: 0, defense: 0, crit: 0, dodge: 0, luck: 2 }) > 0, 'secondary luck stats affect power');
assert.ok(calculatePetArenaPower({ ...baseArenaPet, health: 10, energy: 10 }, 'low') < calculatePetArenaPower(baseArenaPet, 'low'), 'low energy/health affects battle power');
const serializedArenaPet = serializePet({ ...baseArenaPet, equipped_armor: 'moon_helmet', equipped_weapon: 'laser_claws', equipped_charm: 'shield_charm' });
assert.equal(serializedArenaPet.equipped_armor, 'moon_helmet', 'serialized pet state must include equipped arena armor');
assert.equal(serializedArenaPet.equipped_weapon, 'laser_claws', 'serialized pet state must include equipped arena weapon');
assert.equal(serializedArenaPet.equipped_charm, 'shield_charm', 'serialized pet state must include equipped arena charm');
const hiddenIdentityPet = serializePet({ ...baseArenaPet, species: 'neon_raccoon' }, { current_stage: { stage: 2, name: 'Cyber Moonpet' } });
assert.equal(hiddenIdentityPet.display_name, 'UNKNOWN', 'serialized pets must keep the Stage 0-2 identity placeholder');
assert.equal(hiddenIdentityPet.pet_name, 'UNKNOWN', 'serialized pets must mask stored pet_name before Stage 3');
assert.equal(hiddenIdentityPet.name, 'UNKNOWN', 'serialized pets must mask generic name before Stage 3');
assert.equal(hiddenIdentityPet.species, null, 'serialized pets must not expose species before Stage 3');
assert.equal(hiddenIdentityPet.art_identity_id, null, 'serialized pets must not expose art identity before Stage 3');
const stageOneInternalArtPet = serializePet({ ...baseArenaPet, species: 'neon_raccoon' }, { current_stage: { stage: 1, name: 'Street Moonpet' } }, { include_art_identity: true });
assert.equal(stageOneInternalArtPet.art_identity_id, null, 'authenticated Stage-1 pets must not expose the future art identity');
const stageTwoInternalArtPet = serializePet({ ...baseArenaPet, species: 'neon_raccoon' }, { current_stage: { stage: 2, name: 'Cyber Moonpet' } }, { include_art_identity: true });
assert.equal(stageTwoInternalArtPet.art_identity_id, 'neon_raccoon', 'authenticated Stage-2 pets may expose the internal art identity needed for sprite selection');
const hiddenCallsignPet = serializePet({ ...baseArenaPet, pet_name: 'Cipher', species: 'neon_raccoon' }, { current_stage: { stage: 2, name: 'Cyber Moonpet' } }, { include_callsign: true });
assert.equal(hiddenCallsignPet.pet_name, 'UNKNOWN', 'authenticated Stage-2 state must still keep player-facing pet_name masked');
assert.equal(hiddenCallsignPet.callsign, null, 'authenticated Stage-2 state must keep the stored callsign internal');
const revealedIdentityPet = serializePet({ ...baseArenaPet, pet_name: 'Cipher', species: 'neon_raccoon' }, { current_stage: { stage: 3, name: 'Elite Moonpet' } }, { include_callsign: true });
assert.equal(revealedIdentityPet.display_name, 'F1 EDDY', 'serialized pets must reveal the canonical identity at Stage 3');
assert.equal(revealedIdentityPet.pet_name, 'F1 EDDY', 'Stage 3 pet_name must agree with canonical display_name');
assert.equal(revealedIdentityPet.name, 'F1 EDDY', 'Stage 3 generic name must agree with canonical display_name');
assert.equal(revealedIdentityPet.callsign, 'Cipher', 'authenticated Stage-3 state may expose the stored callsign separately from canonical identity');
assert.equal(revealedIdentityPet.species, 'neon_raccoon', 'serialized pets must expose species at Stage 3');
assert.equal(revealedIdentityPet.art_identity_id, 'neon_raccoon', 'serialized pets may expose the art identity once revealed');
const serializedAuthorityPet = serializePet({ ...baseArenaPet, telegram_id: 'serialize-owner', pet_id: 'pet:serialize-owner:pet-s2026-003:1', season_key: 'pet-s2026-003' });
assert.equal(serializedAuthorityPet.telegram_id, 'serialize-owner', 'serialized pet authority must include telegram_id');
assert.equal(serializedAuthorityPet.pet_id, 'pet:serialize-owner:pet-s2026-003:1', 'serialized pet authority must include pet_id');
assert.equal(serializedAuthorityPet.season_key, 'pet-s2026-003', 'serialized pet authority must include season_key');
const arenaStatusCopy = formatPetStatus({ ...baseArenaPet, pet_name: 'Arena Pet', species: 'neon_raccoon', stage: 'teen', hunger: 20, moon_gold: 0, moon_crystals: 0, style_tokens: 0, streak_days: 1, equipped_armor: 'moon_helmet', equipped_weapon: 'laser_claws', equipped_charm: 'shield_charm' });
assert.ok(!arenaStatusCopy.includes('Armor:') && !arenaStatusCopy.includes('Wallet'), '/pet status copy must keep gear and wallet details out of the default viewport');
const arenaDetailsCopy = formatPetDetails({ ...baseArenaPet, pet_name: 'Arena Pet', species: 'neon_raccoon', stage: 'teen', hunger: 20, moon_gold: 0, moon_crystals: 0, style_tokens: 0, streak_days: 1, equipped_armor: 'moon_helmet', equipped_weapon: 'laser_claws', equipped_charm: 'shield_charm' });
assert.ok(arenaDetailsCopy.includes('🛡️ <b>Armor</b> — Moon Helmet') && arenaDetailsCopy.includes('🥊 <b>Weapon</b> — Laser Claws') && arenaDetailsCopy.includes('🧿 <b>Charm</b> — Shield Charm'), '/pet details copy must present equipped battle gear with icons and player-facing names');
const maxLevelDetailsCopy = formatPetDetails({ ...baseArenaPet, pet_name: 'Max Pet', pet_xp: 392040, level: 100 });
assert.ok(maxLevelDetailsCopy.includes('📈 Level 100 cap reached'), '/pet details must show max-level copy at the visible level cap');
assert.ok(!maxLevelDetailsCopy.includes('Level 101'), '/pet details must not imply Level 101 exists at the visible level cap');

const polishedDetailsCopy = formatPetDetails({
  ...baseArenaPet,
  pet_name: 'Moonpet',
  stage: 'egg',
  pet_xp: 4206,
  level: 43,
  health: 90,
  hunger: 20,
  happiness: 90,
  cleanliness: 92,
  energy: 0,
  moon_gold: 925,
  moon_crystals: 6,
  style_tokens: 23,
  streak_days: 15,
  equipped_food: 'nebula_snack',
  equipped_toy: 'laser_ball',
  equipped_outfit: 'moon_armor',
  equipped_armor: 'moon_helmet',
  equipped_weapon: 'foam_claws',
  equipped_charm: 'shield_charm',
}, {
  daily: [
    { key: 'pet-daily-feed', title: 'Feed your Moonpet', completed: true },
    { key: 'pet-daily-train', title: 'Train once', completed: true },
    { key: 'pet-daily-care-set', title: 'Complete feed, play and clean', completed: true },
    { key: 'pet-daily-trade', title: 'Run one Moon Gold trade', completed: false },
    { key: 'pet-daily-adventure', title: 'Run one pet adventure', completed: false },
  ],
}, null, { current_stage: { name: 'Secret Bot' } });
for (const copy of [
  '🧬 <b>Secret Bot</b>',
  '⭐ Level 11 · ✨ 4,206 XP',
  '🪙 925 Moon Gold',
  '💎 6 Moon Crystals',
  '🎨 23 Style',
  '🍖 <b>Food</b> — Nebula Snack',
  '🎾 <b>Toy</b> — Laser Ball',
  '👕 <b>Outfit</b> — Moon Armor',
  '🛡️ <b>Armor</b> — Moon Helmet',
  '🥊 <b>Weapon</b> — Foam Claws',
  '🧿 <b>Charm</b> — Shield Charm',
  '✅ 🍖 Feed your Moonpet',
  '✅ 🏋️ Train once',
  '✅ ❤️ Complete feed, play and clean',
  '⬜️ 💱 Run one Moon Gold trade',
  '⬜️ ⚔️ Run one pet adventure',
  '🔥 15-day streak',
]) assert.ok(polishedDetailsCopy.includes(copy), `polished /pet details must include: ${copy}`);
for (const rawKey of ['nebula_snack', 'laser_ball', 'moon_armor', 'moon_helmet', 'foam_claws', 'shield_charm']) {
  assert.ok(!polishedDetailsCopy.includes(rawKey), `polished /pet details must hide raw item key: ${rawKey}`);
}
assert.ok(arenaMigration.includes('telegram_pet_arena_battles'), 'arena battle migration must create battle table');
assert.ok(arenaMigration.includes('telegram_pet_arena_queue'), 'arena battle migration must create queue table');
assert.ok(arenaMigration.includes('player1_ready_at') && arenaMigration.includes('player2_ready_at'), 'arena migration must store both ready timestamps');
assert.ok(arenaTurnsMigration.includes('telegram_pet_arena_rounds'), 'turn migration must create arena rounds table');
for (const column of ['current_round','max_rounds','player1_hp','player2_hp','player1_special','player2_special','last_round_log_json','expires_at']) assert.ok(arenaTurnsMigration.includes(column), `turn migration must include ${column}`);
for (const column of ['equipped_armor', 'equipped_weapon', 'equipped_charm']) assert.ok(workerSchema.includes(column), `schema.sql must include arena profile column: ${column}`);
for (const table of ['telegram_pet_arena_queue', 'telegram_pet_arena_battles', 'telegram_pet_arena_rounds']) assert.ok(workerSchema.includes(table), `schema.sql must include arena table: ${table}`);
for (const column of ['current_round','max_rounds','player1_hp','player2_hp','player1_special','player2_special']) assert.ok(workerSchema.includes(column), `schema.sql includes the new arena round/turn state: ${column}`);
for (const indexName of ['idx_pet_arena_queue_match', 'idx_pet_arena_queue_one_waiting', 'idx_pet_arena_battles_p1_active', 'idx_pet_arena_battles_p2_active']) assert.ok(workerSchema.includes(indexName), `schema.sql must include arena index: ${indexName}`);


assert.equal(PET_RUN_MAX_DEPTH, 100, 'Pet Run Engine must use repeatable 100-room expedition cycles');
assert.equal(PET_RUN_STEP_CHOICES.length, 5, 'Pet Run Engine retains five legacy choice templates for compatibility');
for (const stepChoices of PET_RUN_STEP_CHOICES) {
  assert.equal(stepChoices.length, 3, 'each Pet Run Engine step must expose exactly 3 choices');
}
for (const choiceType of ['fight', 'sneak', 'loot', 'rest', 'trade', 'gamble', 'hidden_route', 'elite', 'boss']) {
  assert.ok(PET_RUN_CHOICE_LIBRARY[choiceType], `Pet Run Engine must support ${choiceType}`);
}
const stableStepKeyA = buildPetRunStepEventKey('123', 'run-abc', 2, 'sneak');
const stableStepKeyB = buildPetRunStepEventKey('123', 'run-abc', 2, 'sneak');
assert.equal(stableStepKeyA, stableStepKeyB, 'run step event keys must be stable for retry-safe callbacks');
assert.equal(buildPetRunExtractEventKey('123', 'run-abc'), 'pet_run_extract:123:run-abc', 'run extract event keys must not depend on callback query ids');
const runMarkup = buildPetRunChoiceReplyMarkup({ run_id: 'run-abc', seed: 42, depth: 0, max_depth: 100, risk_level: 1, unbanked_items: '{}' });
assert.equal(runMarkup.inline_keyboard[0].length, 3, 'run keyboard must expose exactly 3 choices');
assert.ok(runMarkup.inline_keyboard[0][0].callback_data.startsWith('pet:run:run-abc:step:1:'), 'run choice callbacks must carry run id and step');
assert.ok(runMarkup.inline_keyboard.flat().some((button) => button.callback_data === 'pet:run:run-abc:extract'), 'run keyboard must include Extract');


assert.equal(PET_KAIJU_CATEGORIES.length, 6, 'Kaiju Telegram battle must use the six web card stat categories');
assert.ok(PET_KAIJU_CARDS.length >= 7, 'Kaiju Telegram battle must expose the web card deck');
for (const card of PET_KAIJU_CARDS) {
  assert.ok(card.id && card.name, 'each Kaiju card must include id and name');
  for (const category of PET_KAIJU_CATEGORIES) {
    assert.ok(Number(card.stats[category.key]) > 0, `Kaiju card ${card.id} must include ${category.key}`);
  }
}
const generatedKaijuMatchId = buildPetKaijuMatchId();
assert.ok(/^k-[a-f0-9]{12}$/.test(generatedKaijuMatchId), 'Kaiju match ids must be short enough for Telegram callback_data');
const generatedKaijuLobby = buildPetKaijuLobbyReplyMarkup({ match_id: generatedKaijuMatchId });
for (const button of generatedKaijuLobby.inline_keyboard.flat().filter((entry) => entry.callback_data)) {
  assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64, `Kaiju lobby callback too long: ${button.callback_data}`);
}
const generatedKaijuCards = buildPetKaijuCardReplyMarkup({ match_id: generatedKaijuMatchId });
for (const button of generatedKaijuCards.inline_keyboard.flat().filter((entry) => entry.callback_data)) {
  assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64, `Kaiju card callback too long: ${button.callback_data}`);
}
const kaijuLobby = buildPetKaijuLobbyReplyMarkup({ match_id: 'kaiju-abc' });
assert.ok(kaijuLobby.inline_keyboard.flat().some((button) => button.callback_data === 'pet:kaiju:join:kaiju-abc'), 'Kaiju lobby must include a group join button');
assert.ok(kaijuLobby.inline_keyboard.flat().some((button) => button.callback_data === 'pet:kaiju:cpu:kaiju-abc'), 'Kaiju lobby must support player vs app');
const kaijuCards = buildPetKaijuCardReplyMarkup({ match_id: 'kaiju-abc', category_key: 'lgcy' });
assert.ok(kaijuCards.inline_keyboard.flat().some((button) => button.callback_data === 'pet:kaiju:card:kaiju-abc:god-dzilla'), 'Kaiju card picker must include stable card callbacks');
assert.ok(kaijuCards.inline_keyboard.flat().some((button) => button.text.includes('LGCY 10')), 'legacy Kaiju picker must show the active score');
assert.equal(resolvePetKaijuBattle('god-dzilla', 'big-daddy-kong', 'lgcy').result, 'player1_win', 'Kaiju resolver must compare the rolled stat category');

const arenaFixture = {
  battle_id: 'a-1234567890',
  status: 'active',
  current_round: 2,
  max_rounds: 8,
  player1_telegram_id: 'player',
  player2_telegram_id: 'app',
  player1_hp: 88,
  player2_hp: 76,
  player1_special: 2,
  player2_special: 3,
  player1_pet_snapshot_json: JSON.stringify({ telegram_id: 'player', pet_name: 'Player Pet' }),
  player2_pet_snapshot_json: JSON.stringify({ telegram_id: 'app', pet_name: 'CRT Pet' }),
  last_round_log_json: JSON.stringify({ round: 1, moves: ['ah', 'bh'], log: ['Attack Head hit.', 'Block Head guarded.'] }),
};
const soloArenaPreview = serializePetMiniAppArenaBattle(arenaFixture, 'player');
assert.ok(soloArenaPreview.opponent_intent, 'solo Arena must reveal the deterministic CRT intent');
assert.equal(soloArenaPreview.last_round.player_move, 'ah', 'Arena recap must preserve player perspective');
assert.equal(soloArenaPreview.moves.find((move) => move.key === 'sp').available, false, 'Special must stay locked below its charge cost');
const pvpArenaPreview = serializePetMiniAppArenaBattle({ ...arenaFixture, player2_telegram_id: 'rival' }, 'player');
assert.equal(pvpArenaPreview.opponent_intent, null, 'PvP Arena must never reveal the rival intent');
assert.equal(PET_ARENA_MOVE_GUIDE.ah.base_damage, 18, 'Arena preview balance must match authoritative head-attack damage');
const prelockKaijuPreview = serializePetMiniAppKaijuMatch({
  match_id: 'k-123456789abc',
  mode: 'solo',
  status: 'selecting',
  player1_telegram_id: 'player',
  category_key: 'lgcy',
  roll: 6,
}, 'player');
assert.equal(prelockKaijuPreview.category_key, 'lgcy', 'Kaiju category must be visible before card lock');
assert.equal(prelockKaijuPreview.category.name, 'Legacy', 'Kaiju pre-lock state must include readable category metadata');

assert.ok(PET_RANDOM_EVENTS, 'PET_RANDOM_EVENTS must be exported');
assert.ok(Object.keys(PET_RANDOM_EVENTS).length >= 5, 'PET_RANDOM_EVENTS must include at least 5 event types');
for (const [eventKey, event] of Object.entries(PET_RANDOM_EVENTS)) {
  assert.equal(event.key, eventKey, `PET_RANDOM_EVENTS entry must keep its key: ${eventKey}`);
  assert.ok(event.title, `PET_RANDOM_EVENTS entry must include a title: ${eventKey}`);
  assert.ok(event.intro, `PET_RANDOM_EVENTS entry must include intro copy: ${eventKey}`);
  assert.equal(event.choices.length, 3, `PET_RANDOM_EVENTS entry must have exactly 3 choices: ${eventKey}`);
  for (const choice of event.choices) {
    assert.ok(choice.key, `PET_RANDOM_EVENTS choice must include a key: ${eventKey}`);
    assert.ok(choice.label, `PET_RANDOM_EVENTS choice must include a label: ${choice.key}`);
    assert.ok(choice.copy, `PET_RANDOM_EVENTS choice must include result copy: ${choice.key}`);
    assert.ok(choice.rewards, `PET_RANDOM_EVENTS choice must include rewards: ${choice.key}`);
    assert.ok(choice.costs, `PET_RANDOM_EVENTS choice must include costs: ${choice.key}`);
  }
}

const resolvedEncounter = resolvePetRandomEncounter('moon_crate_found-test');
assert.ok(resolvedEncounter, 'PET_RANDOM_EVENTS must resolve moon_crate_found');
const fixedEncounter = {
  ...resolvedEncounter,
  event_key: 'moon_crate_found-test',
};
const fixedMarkup = buildPetRandomEventReplyMarkup(fixedEncounter);
assert.equal(fixedMarkup.inline_keyboard[0].length, 3, 'event keyboard must expose exactly 3 choices');
for (let index = 0; index < 3; index += 1) {
  const button = fixedMarkup.inline_keyboard[0][index];
  const choice = fixedEncounter.choices[index];
  assert.ok(button.callback_data.startsWith(`pet:event:${fixedEncounter.event_key}:`), 'event callback must carry the encounter key');
  assert.ok(button.callback_data.endsWith(choice.key), 'event callback must carry the choice key');
}
const sampleSummary = formatPetRandomEventSummary(
  fixedEncounter,
  fixedEncounter.choices[0],
  { copy: 'You cracked the crate open.' },
  {
    rewardsApplied: { pet_xp: 14, moon_gold: 8, moon_crystals: 1 },
    costsApplied: { energy: 2 },
    deltas: { pet_xp: 14, moon_gold: 8, moon_crystals: 1, style_tokens: 0, energy: -2, happiness: 0, cleanliness: 0, hunger: 0 },
  },
);
assert.ok(sampleSummary.includes('Rewards:'), 'event summary must include rewards copy');
assert.ok(sampleSummary.includes('Costs:'), 'event summary must include costs copy');
assert.ok(sampleSummary.includes('You cracked the crate open.'), 'event summary must include the event result copy');

for (const [mediaKey, filename] of Object.entries(PET_MEDIA_MANIFEST)) {
  assert.ok(fs.existsSync(new URL(`../img/pets/${filename}`, import.meta.url)), `pet media file must exist: ${filename}`);
  const url = buildPetMediaUrl(mediaKey);
  assert.ok(url.startsWith('https://cryptomoonboys.com/img/pets/'), `pet media URL must be absolute for ${mediaKey}`);
  assert.equal(new URL(url).protocol, 'https:', `pet media URL must use HTTPS for ${mediaKey}`);
  assert.equal(decodeURIComponent(new URL(url).pathname.split('/').pop()), filename, `pet media URL must point at ${filename}`);
}

assert.equal(resolvePetMediaKey('feed'), 'feed');
assert.equal(resolvePetMediaKey('play'), 'play');
assert.equal(resolvePetMediaKey('clean'), 'clean');
assert.equal(resolvePetMediaKey('sleep'), 'sleep');
assert.equal(resolvePetMediaKey('train'), 'train');
assert.equal(resolvePetMediaKey('bag'), 'bag');
assert.equal(resolvePetMediaKey('work'), 'work');
assert.equal(resolvePetMediaKey('event'), 'event');
assert.equal(resolvePetMediaKey('daily'), 'daily');
assert.equal(resolvePetMediaKey('adventure'), 'adventure_win');
assert.equal(resolvePetMediaKey('shop'), 'shop');
assert.equal(resolvePetMediaKey('trade', { won: true }), 'trade_win');
assert.equal(resolvePetMediaKey('trade', { won: false }), 'trade_loss');
assert.equal(resolvePetMediaKey('how to play'), 'how_to_play');
assert.equal(resolvePetMediaKey('leaderboard'), 'leaderboard');
assert.equal(resolvePetMediaKey('purchase'), 'purchase_complete');
assert.equal(resolvePetMediaKey('adopt'), 'level_up');
assert.equal(resolvePetMediaKey('pettrade', { won: true }), 'trade_win');
assert.equal(resolvePetMediaKey('petadventure', { accepted: false }), 'adventure_fail');

const mediaCaption = formatTelegramPetMediaCaption([
  'Action accepted: /feed (+7 pet XP, +1 Community XP).',
  '',
  'Moonpet | Stage: teen | Level 15 | XP 640',
  'Health [=========.] 92/100',
  'Hunger [==========] 0/100',
  'Energy [==========] 100/100',
].join('\n'), 'feed');
assert.ok(mediaCaption.includes('<b>Feed Complete</b>'), 'media caption must use a compact action title');
assert.ok(mediaCaption.includes('+7 Pet XP, +1 Community XP'), 'media caption must keep the action rewards');
assert.ok(mediaCaption.includes('Moonpet: Level 15 | Energy 100/100 | Health 92/100'), 'media caption must summarize key pet stats');
assert.ok(formatTelegramPetHeroCaption('Action accepted: /feed (+7 pet XP).', 'feed').length <= 1024, 'hero captions must fit Telegram photo captions');
assert.equal(shouldUsePhotoCaptionOnly('Action accepted: /feed (+7 pet XP, +1 Community XP).', 'feed'), true, 'action results may use photo-caption-only mode');
assert.equal(shouldUsePhotoCaptionOnly('<b>Pet</b>\nMoonpet | Stage: teen | Level 15 | XP 640', 'how_to_play'), false, 'status/detail screens must not use photo-caption-only mode');
assert.equal(shouldUsePhotoCaptionOnly('<b>Pet Run Engine v1</b>\nRun: <code>run-abc</code>', 'petrun'), false, 'run prompts must not use photo-caption-only mode');

{
  const originalFetch = globalThis.fetch;
  const calls = [];
  const replyMarkup = { inline_keyboard: [[{ text: 'Feed', callback_data: 'pet:feed' }]] };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => 'photo sent' };
  };
  try {
    const result = await sendTelegramPetReply('bot-token', '123', [
      'Action accepted: /feed (+7 pet XP, +1 Community XP).',
      '',
      'Moonpet | Stage: teen | Level 15 | XP 640',
      'Health [=========.] 92/100',
      'Energy [==========] 100/100',
    ].join('\n'), { reply_markup: replyMarkup }, 'feed');
    assert.ok(result.ok, 'sendTelegramPetReply must succeed when photo sending succeeds');
    assert.equal(calls.length, 1, 'normal media replies must not send a duplicate text message');
    assert.ok(calls[0].url.includes('/sendPhoto'), 'normal media replies must use sendPhoto');
    const body = JSON.parse(calls[0].init.body);
    assert.ok(body.photo.includes('/CRYPTO%20MOONBOYS%20PET%20FEED.jpg'), 'sendPhoto must use the resolved media URL');
    assert.equal(body.parse_mode, 'HTML', 'sendPhoto captions must use HTML parse mode');
    assert.ok(body.caption.includes('<b>Feed Complete</b>'), 'sendPhoto must include the compact caption');
    assert.deepEqual(body.reply_markup, replyMarkup, 'reply_markup must be attached to sendPhoto');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const originalFetch = globalThis.fetch;
  const calls = [];
  const replyMarkup = { inline_keyboard: [[{ text: 'Feed', callback_data: 'pet:feed' }]] };
  const statusText = [
    '<b>Pet</b>',
    'Moonpet | Stage: teen | Level 15 | XP 640',
    'Health [=========.] 92/100',
    'Hunger [==========] 0/100',
    'Happiness [=========.] 90/100',
    'Cleanliness [========..] 80/100',
    'Energy [==========] 100/100',
    '',
    '<b>Daily Missions</b>',
    'Feed once',
    'Run one job',
  ].join('\n');
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => 'sent' };
  };
  try {
    const result = await sendTelegramPetReply('bot-token', '123', statusText, { reply_markup: replyMarkup }, 'how_to_play');
    assert.ok(result.ok, 'status media replies must still succeed');
    assert.equal(calls.length, 2, 'status/detail screens must send photo hero plus full text details');
    assert.ok(calls[0].url.includes('/sendPhoto'), 'status/detail screens must send the photo first');
    assert.ok(calls[1].url.includes('/sendMessage'), 'status/detail screens must follow with full text');
    const photoBody = JSON.parse(calls[0].init.body);
    const messageBody = JSON.parse(calls[1].init.body);
    assert.equal(photoBody.reply_markup, undefined, 'status/detail photo heroes must not carry buttons');
    assert.equal(messageBody.text, statusText, 'status/detail screens must preserve the full original text');
    assert.deepEqual(messageBody.reply_markup, replyMarkup, 'status/detail follow-up text must carry the keyboard below its instructions');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const originalFetch = globalThis.fetch;
  const calls = [];
  const replyMarkup = { inline_keyboard: [[{ text: 'Fight', callback_data: 'pet:run:run-abc:step:1:fight' }]] };
  const runPrompt = [
    '<b>Pet Run Engine v1</b>',
    'Run: <code>run-abc</code>',
    'Depth: 0/5 | Risk: 1',
    'Unbanked: 0 pet XP, 0 gold, 0 crystals, 0 style',
    'Energy: 100/100 | Health: 92/100',
    '',
    'Pick a route, then extract or push deeper.',
  ].join('\n');
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => 'sent' };
  };
  try {
    const result = await sendTelegramPetReply('bot-token', '123', runPrompt, { reply_markup: replyMarkup }, 'petrun');
    assert.ok(result.ok, 'run prompt media replies must still succeed');
    assert.equal(calls.length, 2, 'run prompts must send photo hero plus full text details');
    assert.ok(calls[0].url.includes('/sendPhoto'), 'run prompts must send the photo first');
    assert.ok(calls[1].url.includes('/sendMessage'), 'run prompts must follow with full text');
    const photoBody = JSON.parse(calls[0].init.body);
    const messageBody = JSON.parse(calls[1].init.body);
    assert.equal(photoBody.reply_markup, undefined, 'run prompt photo heroes must not carry buttons');
    assert.equal(messageBody.text, runPrompt, 'run prompts must preserve the full original text');
    assert.deepEqual(messageBody.reply_markup, replyMarkup, 'run prompt follow-up text must carry the keyboard below its instructions');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

for (const surface of [
  { name: 'Pet Events', mediaKey: 'event', text: '<b>Rival Pet Challenge</b>\nChoose one of the actions below.', action: 'Fight Back' },
  { name: 'Pet Jobs', mediaKey: 'work', text: '<b>Pet Jobs</b>\nChoose a job below.', action: 'Street Artist' },
  { name: 'Pet Shop', mediaKey: 'shop', text: '<b>Pet Shop</b>\nChoose an item below.', action: 'Buy' },
  { name: 'Pet Bag', mediaKey: 'bag', text: '<b>Pet Bag</b>\nChoose an item below.', action: 'Use' },
  { name: 'Kaiju', mediaKey: 'play', text: '<b>Kaiju Battle</b>\nChoose your card below.', action: 'Card' },
  { name: 'Pet Run', mediaKey: 'petrun', text: '<b>Pet Run</b>\nPick a route below.', action: 'Route' },
]) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const replyMarkup = { inline_keyboard: [
    [{ text: surface.action, callback_data: `pet:test:${surface.mediaKey}` }],
    [{ text: 'Back', callback_data: 'pet:bag' }],
  ] };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => 'sent' };
  };
  try {
    const result = await sendTelegramPetReply('bot-token', '123', surface.text, { reply_markup: replyMarkup }, surface.mediaKey);
    assert.ok(result.ok, `${surface.name} media reply must succeed`);
    assert.equal(calls.length, 2, `${surface.name} must send a hero image followed by its instructional text`);
    const photoBody = JSON.parse(calls[0].init.body);
    const messageBody = JSON.parse(calls[1].init.body);
    assert.equal(photoBody.reply_markup, undefined, `${surface.name} must not attach its keyboard to the image`);
    assert.equal(messageBody.text, surface.text, `${surface.name} must preserve its instructional text`);
    assert.deepEqual(messageBody.reply_markup, replyMarkup, `${surface.name} and its Back button must render below the text`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const petArenaCommand = asyncBlock('cmdPetArena');
assert.ok(petArenaCommand.includes('sendTelegramMessage'), 'Pet Arena must keep its instructional menus and buttons in one text message');
assert.equal(petArenaCommand.includes('sendTelegramPetReply'), false, 'Pet Arena must not place buttons on a media message before its instructions');

{
  const originalFetch = globalThis.fetch;
  const calls = [];
  const replyMarkup = { inline_keyboard: [[{ text: 'Feed', callback_data: 'pet:feed' }]] };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/sendPhoto')) {
      return { ok: false, status: 500, text: async () => 'photo failed' };
    }
    if (String(url).includes('/sendMessage')) {
      return { ok: true, status: 200, text: async () => 'message sent' };
    }
    return { ok: true, status: 200, text: async () => 'ok' };
  };
  try {
    const fallback = await sendTelegramPetReply('bot-token', '123', 'Fallback text', { reply_markup: replyMarkup }, 'feed');
    assert.ok(fallback.ok, 'sendTelegramPetReply must succeed when photo sending fails');
    assert.equal(calls.length, 2, 'sendTelegramPetReply must attempt photo first and then fall back to text');
    assert.ok(calls[0].url.includes('/sendPhoto'), 'sendTelegramPetReply must attempt Telegram photo first');
    assert.ok(calls[1].url.includes('/sendMessage'), 'sendTelegramPetReply must fall back to Telegram text');
    assert.deepEqual(JSON.parse(calls[1].init.body).reply_markup, replyMarkup, 'text fallback must keep the original reply_markup');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const originalFetch = globalThis.fetch;
  const calls = [];
  const replyMarkup = { inline_keyboard: [[{ text: 'Run', callback_data: 'pet:run' }]] };
  const longText = [
    `Job complete: ${'Courier '.repeat(180)}.`,
    '+7 Pet XP | +1 Community XP',
    'Moonpet | Stage: elder | Level 15 | XP 640',
    'Health [=========.] 92/100',
    'Energy [==========] 100/100',
  ].join('\n');
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => 'sent' };
  };
  try {
    const result = await sendTelegramPetReply('bot-token', '123', longText, { reply_markup: replyMarkup }, 'sleep');
    assert.ok(result.ok, 'long media replies must still succeed');
    assert.equal(calls.length, 2, 'long captions must send image hero plus one detail message');
    assert.ok(calls[0].url.includes('/sendPhoto'), 'long caption fallback must send the image first');
    assert.ok(calls[1].url.includes('/sendMessage'), 'long caption fallback must send full details as text');
    const photoBody = JSON.parse(calls[0].init.body);
    assert.ok(photoBody.caption.length <= 1024, 'long caption fallback photo caption must stay within Telegram limits');
    assert.equal(photoBody.reply_markup, undefined, 'long caption fallback must keep buttons off the photo');
    const messageBody = JSON.parse(calls[1].init.body);
    assert.equal(messageBody.text, longText, 'long caption fallback must preserve full detail text');
    assert.deepEqual(messageBody.reply_markup, replyMarkup, 'long caption fallback must place buttons below the full detail text');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const verifierStart = worker.indexOf('function verifyPetsBotSecret');
const verifierEnd = worker.indexOf('async function getOrCreatePetProfile');
const secretVerifier = worker.slice(verifierStart, verifierEnd);
assert.ok(secretVerifier.includes('TELEGRAM_PETS_BOT_SECRET'), 'pet secret verifier must read the pet-only secret');
assert.ok(secretVerifier.includes('X-Pets-Bot-Secret'), 'pet secret verifier must read only pet header');
assert.ok(!secretVerifier.includes('ADMIN_SECRET'), 'pet secret verifier must not read ADMIN_SECRET');
assert.ok(!secretVerifier.includes('X-Admin-Secret'), 'pet secret verifier must not read X-Admin-Secret');

const award = asyncBlock('awardCommunityXp');
assert.ok(award.includes('INSERT INTO telegram_xp_log'), 'Community XP helper must write telegram_xp_log');
assert.ok(award.includes('UPDATE telegram_users'), 'Community XP helper must update telegram_users');
assert.ok(award.includes('INSERT INTO telegram_leaderboard'), 'Community XP helper must upsert active leaderboard rows');
assert.ok(award.includes('ON CONFLICT(telegram_id, season_id)'), 'leaderboard write must be idempotent per user/season');
assert.ok(worker.includes('accountWalletRecoveryResolvedSql') && !worker.includes('function accountWalletRecoveryResolvedSql'),
  'account wallet writes must import the shared recovery-pending freeze predicate');
assert.ok(walletReconciliation.includes('export function accountWalletRecoveryResolvedSql') && walletReconciliation.includes('PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_SOURCE') && walletReconciliation.includes('PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE'),
  'account wallet recovery freeze must use shared reconciliation marker constants from the wallet module');
assert.ok(worker.includes('ensurePetAccountWalletReadyForMutation'),
  'account wallet mutation paths must attempt reconciliation before trusting recovery state');
assert.ok(worker.includes("reason: 'wallet_reconciliation_recovery_pending'"),
  'wallet mutation paths must return a structured recovery-pending freeze reason');

const petAction = asyncBlock('processPetAction');
assert.ok(petAction.includes('PETS_DAILY_COMMUNITY_XP_CAP'), 'pet action must apply Community XP daily cap');
assert.ok(petAction.includes('PETS_DAILY_PET_XP_CAP'), 'pet action must apply pet XP daily cap');
assert.ok(petAction.includes('...petCareCommunityStatements(db, eventId)'), 'care must commit the Community XP log and both leaderboard projections in its reward batch');
assert.ok(petAction.includes("if (existing) {"), 'pet action must short-circuit duplicate event keys first');
assert.ok(petAction.includes('...petCareDeltaStatements(db, { eventId, dayKey'), 'care must apply current-row stats and streaks in the reward batch');
assert.ok(petAction.includes('const actionHasWalletReward = hasPetAccountWalletDelta(tokenRewards)'),
  'pet actions must detect wallet movement before applying recovery guards');
assert.ok(petAction.includes("${actionHasWalletReward ? accountWalletRecoveryResolvedSql('?') : '1 = 1'}"),
  'pet-only actions must not be blocked by account-wallet recovery SQL');
assert.ok(petAction.includes('const persistedPet = await getPetInstanceWithAtomicDecay(db, pet.pet_id, now)'),
  'pet action success responses must reload persisted state');
assert.ok(petAction.includes("if (action === 'adopt')"), 'adopt branch must be explicit');
assert.ok(petAction.includes('const pet = await getOrCreatePetProfile(db, telegramId, options)'), 'adopt branch must create the pet profile');
assert.ok(petAction.includes('let pet = await getPetProfile(db, telegramId)'), 'non-adopt actions must use read-only pet lookup first');
assert.ok(petAction.includes("reason: 'pet_not_adopted'"), 'non-adopt actions must fail when the pet was not adopted');
assert.ok(
  petAction.indexOf("if (action === 'adopt')") < petAction.indexOf('let pet = await getPetProfile(db, telegramId)'),
  'adopt creation must happen before non-adopt read-only lookup'
);
assert.ok(
  petAction.indexOf('let pet = await getPetProfile(db, telegramId)') < petAction.indexOf("if (action === 'rename')"),
  'rename must require an existing pet profile'
);

const shopPurchase = asyncBlock('processPetShopPurchase');
assert.ok(shopPurchase.includes("event_type, event_key"), 'shop purchases must be audited as pet events');
assert.ok(shopPurchase.includes("'buy'"), 'shop purchases must use buy event type');
assert.ok(!shopPurchase.includes('awardCommunityXp'), 'shop purchases must not award Community XP');
assert.ok(shopPurchase.includes("duplicate: true"), 'shop purchases must short-circuit duplicate event keys');
assert.ok(shopPurchase.includes("reason: 'already_equipped'"), 'shop purchases must not charge again for already equipped upgrades');
assert.ok(shopPurchase.includes("reason: 'not_enough_pet_currency'"), 'shop purchases must reject unaffordable shop buttons');
assert.ok(shopPurchase.includes("reason: 'wallet_reconciliation_recovery_pending'"), 'shop purchases must freeze wallet spends while historical recovery is pending');
assert.ok(shopPurchase.includes('const persistedPet = await getPetProfile(db, telegramId)'),
  'shop purchase success responses must reload persisted state');
assertOrder(
  shopPurchase,
  'const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);',
  'const pet = await getPetProfile(db, telegramId, true);',
  'shop purchases must check duplicate event keys before loading the pet'
);
assertOrder(
  shopPurchase,
  'const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);',
  'if (!canAffordPetItem(pet, item)) return { accepted: false, reason: \'not_enough_pet_currency\', item, pet };',
  'shop purchases must check duplicate event keys before spending currency'
);

const useItem = asyncBlock('processPetUseItem');
assert.ok(useItem.includes('duplicate'), 'use_item must short-circuit duplicate event keys');
assert.ok(useItem.includes("source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata")
  && useItem.includes("'pet_item_use'") && useItem.includes("status = 'awarded'"),
  'use_item rewards must settle through an atomic item-use reward claim');
assert.ok(useItem.includes("status = 'pending'") && useItem.includes("status = 'accepted'"),
  'use_item must only accept the item-use receipt after gated writes succeed');
assert.ok(useItem.includes('const itemHasWalletReward = hasPetAccountWalletDelta(walletRewards)'),
  'use_item must only guard recovery for account-wallet item rewards');
assert.ok(useItem.indexOf('itemHasWalletReward && !(await ensurePetAccountWalletReadyForMutation') < useItem.indexOf('UPDATE telegram_pet_inventory'),
  'use_item wallet rewards must reconcile/check recovery before consuming inventory');
assert.ok(useItem.includes('UPDATE telegram_pet_inventory'), 'use_item must consume from the authoritative inventory table');
assert.ok(useItem.includes('inventory_authority: true'), 'authority-owned item consumption must bypass the temporary legacy cutover bridge');
assert.ok(useItem.includes('telegram_pet_events'), 'use_item must audit accepted items');
assert.ok(useItem.includes('item_used'), 'use_item must write item_used results');
assert.ok(useItem.includes('consumed_item_key'), 'use_item must write consumed item metadata');
assert.ok(useItem.includes("moon_snack"), 'use_item must support moon_snack');
assert.ok(useItem.includes("energy_drink"), 'use_item must support energy_drink');
assert.ok(useItem.includes("clean_wipe"), 'use_item must support clean_wipe');
assert.ok(useItem.includes("lucky_charm"), 'use_item must support lucky_charm');
assert.ok(useItem.includes("style_patch"), 'use_item must support style_patch');
assert.ok(useItem.includes("adventure_map"), 'use_item must support adventure_map');
assert.ok(asyncBlock('getPetInventory').includes('FROM telegram_pet_inventory'), 'inventory reads must use the authoritative inventory table');
assert.ok(!asyncBlock('getPetInventory').includes('telegram_pet_events'), 'inventory reads must not reconstruct balances from audit events');

const work = asyncBlock('processPetJob');
assert.ok(work.includes('duplicate'), 'work must short-circuit duplicate event keys');
assert.ok(work.includes("source: 'pet_job'") && work.includes('awardPetReward(db'), 'work must use the capped unified reward authority');
assert.ok(work.includes('canStartPetEliteJob'), 'elite jobs must enforce their specialist-track XP gate server-side');
assert.ok(work.includes("reason: 'specialist_job_locked'"), 'elite jobs must explain specialist-track locks');
for (const job of ['street_artist', 'courier', 'crystal_miner', 'vault_guard']) {
  assert.ok(worker.includes(job), `work must support ${job}`);
}

const dailyChest = asyncBlock('processPetDailyChest');
assert.ok(dailyChest.includes('duplicate'), 'daily chest must short-circuit duplicate event keys');
assert.ok(dailyChest.includes("daily_chest"), 'daily chest must write daily_chest events');
assert.match(dailyChest, /MIN\(40,MAX\(0,\?[-]\(SELECT COALESCE\(SUM\(pet_xp_awarded\),0\)/, 'Daily Cache must clamp against accepted account/day XP inside the transaction');
assert.match(dailyChest, /pet_xp \+ \(SELECT pet_xp_awarded FROM daily_award\)/, 'Daily Cache must add the actual event award to current instance XP');
assert.ok(dailyChest.includes("reason: 'wallet_reconciliation_recovery_pending'"), 'daily chest must freeze wallet credits while historical recovery is pending');
assert.ok(dailyChest.includes('const persistedPet = await getPetInstanceWithAtomicDecay(db, pet.pet_id)'), 'Daily Cache must return its captured source pet');
assert.match(dailyChest, /FROM telegram_pet_active_slots WHERE telegram_id=\? AND pet_id=\? AND season_key=\?/, 'compatibility mirror must remain conditional on the captured pet still being selected');

const randomEvent = asyncBlock('processPetRandomEvent');
assert.ok(randomEvent.includes('duplicate: true'), 'random event must short-circuit duplicate event keys');
assertOrder(
  randomEvent,
  'const duplicate = await db.prepare(`',
  'const pet = await getPetProfileWithAtomicDecay(db, telegramId, now);',
  'random event must check duplicate event keys before loading the pet'
);
assertOrder(
  randomEvent,
  'const duplicate = await db.prepare(`',
  'const outcome = pickPetRandomEventOutcome(choice);',
  'random event must check duplicate event keys before the reward roll'
);
assert.ok(randomEvent.includes("source: 'pet_event'") && randomEvent.includes('reservation_id: reservation.reservation_id'), 'random events must finalize their protected reservation through the unified reward authority');

const goldTrade = asyncBlock('processPetGoldTrade');
assert.ok(goldTrade.includes("'trade'"), 'gold trades must use trade event type');
assert.ok(goldTrade.includes('PET_TRADE_COOLDOWN_SECONDS'), 'gold trades must have a cooldown');
assert.ok(!goldTrade.includes('awardCommunityXp'), 'gold trades must not award Community XP');
assert.ok(goldTrade.includes('PETS_DAILY_PET_XP_CAP'), 'gold trades must apply the daily pet XP cap');
assert.ok(goldTrade.includes('getPetWindowTotals(db, telegramId, dayKey, weekKey)'), 'gold trades must read daily totals before awarding pet XP');
assert.ok(goldTrade.includes("reason: 'invalid_trade_wager'"), 'gold trades must reject malformed wagers');
assert.ok(goldTrade.includes('/^\\d+$/'), 'gold trades must validate wager shape before clamping or spending');
assert.ok(goldTrade.includes('pet_xp_awarded: petXp'), 'gold trades must persist the capped pet XP amount');
assert.ok(goldTrade.includes('telegram_pet_season_state'), 'gold trades must update season state');
assert.ok(goldTrade.includes("xp_awarded: 0"), 'gold trades must not award Community XP');
assert.ok(!goldTrade.includes('awardCommunityXp'), 'gold trades must not call the shared Community XP helper');
assert.ok(goldTrade.includes("duplicate: true"), 'gold trades must short-circuit duplicate event keys');
assert.ok(goldTrade.includes("reason: 'wallet_reconciliation_recovery_pending'"), 'gold trades must freeze wallet transitions while historical recovery is pending');
assert.ok(goldTrade.includes('const persistedPet = await getPetProfile(db, telegramId)'),
  'gold trade success responses must reload persisted state');
assertOrder(
  goldTrade,
  'const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);',
  'const pet = await getPetProfile(db, telegramId);',
  'gold trades must check duplicate event keys before loading the pet'
);
assertOrder(
  goldTrade,
  'const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);',
  'const lastTrade = await db.prepare(`',
  'gold trades must check duplicate event keys before the cooldown lookup'
);
assertOrder(
  goldTrade,
  'const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);',
  'const roll = Math.random();',
  'gold trades must check duplicate event keys before the random roll'
);

const adventure = asyncBlock('processPetAdventure');
assert.ok(adventure.includes('normalizePetAdventureChoice'), 'adventures must parse choice keys');
assert.ok(adventure.includes('resolvePetAdventureEncounter'), 'adventures must resolve encounter keys');
assert.ok(adventure.includes('PET_ADVENTURE_COOLDOWN_SECONDS'), 'adventures must have a cooldown');
assert.ok(adventure.includes("source: 'pet_adventure'") && adventure.includes('awardPetReward(db'), 'adventures must use the capped unified reward authority');
assert.ok(adventure.includes('pickPetRandomEventOutcome(choice)'), 'adventures must reuse the roguelite outcome roll');
assert.ok(adventure.includes('applyPetRandomEventDeltas('), 'adventures must apply roguelite-style deltas');
assert.ok(adventure.includes('getPetProfile(db, telegramId)'), 'adventures must look up the pet by telegramId');
assert.ok(adventure.includes('applied.deltas.pet_xp = awarded.pet_xp_awarded'), 'adventures must report the authority-capped Pet XP amount');
assert.ok(adventure.includes("`${encounter.key}:${choice.key}`"), 'adventures must report the encounter and choice');
assert.ok(!adventure.includes('awardCommunityXp'), 'adventures must not award Community XP');
assert.ok(adventure.includes("duplicate: true"), 'adventures must short-circuit duplicate event keys');
assert.ok(adventure.includes("reason: 'invalid_adventure_choice'"), 'adventures must reject invalid choices');
assert.ok(adventure.includes("reason: 'adventure_unavailable'"), 'adventures must reject missing encounters');
assertOrder(
  adventure,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first();",
  'const pet = await getPetProfile(db, telegramId);',
  'adventures must check duplicate event keys before loading the pet'
);
assertOrder(
  adventure,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first();",
  'if (clampPetStat(pet.energy) < adventure.energy_cost) return { accepted: false, reason: \'pet_tired\', encounter, choice, adventure, pet };',
  'adventures must check duplicate event keys before energy spend'
);
assertOrder(
  adventure,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first();",
  "getPetAcceptedActionCooldown(db, telegramId, 'adventure', PET_ADVENTURE_COOLDOWN_SECONDS, now)",
  'adventures must check duplicate event keys before the cooldown lookup'
);

const runStep = asyncBlock('processPetRunStepResult');
assert.ok(runStep.includes('buildPetRunStepEventKey'), 'run steps must use stable callback event keys');
assert.ok(runStep.includes('telegram_pet_run_steps'), 'run steps must persist step records');
assert.ok(runStep.includes('telegram_pet_runs'), 'run steps must update persistent run state');
assert.ok(runStep.includes('const suppliedExpectedStepIndex = options.expected_step_index'), 'run steps must accept an expected callback step index');
assert.ok(runStep.includes("reason: 'stale_run_step'"), 'stale callback steps must be rejected with a clear reason');
assert.ok(runStep.includes('const accountWallet = await readPetAccountWallet(db, telegramId)'), 'run steps must read account wallet authority before checking wallet costs');
assert.ok(runStep.includes('getUnaffordablePetRunCosts(pet, outcome.costs, accountWallet)'), 'run steps must validate rolled wallet costs against the account wallet before applying rewards');
assert.ok(runStep.includes("reason: 'insufficient_run_cost'"), 'unaffordable run steps must be rejected with a clear reason');
assert.ok(runStep.includes('accountWalletDeltaStatement(db, telegramId, walletCostDeltas'), 'accepted run steps must debit wallet costs through account-wallet CAS');
assert.ok(runStep.includes("reason: 'wallet_reconciliation_recovery_pending'"), 'run-step wallet costs must freeze while historical recovery is pending');
assert.ok(runStep.includes("'run_item_use'"), 'accepted run steps must record consumed one-use run items');
assert.ok(runStep.includes('consumed_item_key: outcome.consumed_item_key'), 'run item consumption metadata must preserve the consumed item key');
assert.ok(runStep.includes("SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?"), 'run steps must short-circuit duplicate callbacks by event key');
assert.ok(runStep.includes("SELECT * FROM telegram_pet_run_steps WHERE run_id = ? AND step_index = ?"), 'run steps must block alternate duplicate choices for the same step');
assert.ok(runStep.includes("SET status = 'failed'"), 'failed runs must be marked failed');
assert.ok(runStep.includes('unbanked_pet_xp = 0'), 'failed runs must lose unbanked pet XP');
assert.ok(runStep.includes("unbanked_items = '{}'"), 'failed runs must lose unbanked items');
assert.ok(runStep.includes('PETS_DAILY_PET_XP_CAP'), 'failure consolation XP must respect pet XP cap');
assert.ok(runStep.includes("'run_fail'"), 'failed runs must audit consolation XP as run_fail');
assert.ok(runStep.includes('getPetDayXpTotal(db, run.pet_id, dayKey)'), 'failed-run consolation XP caps must use stored run pet authority');
const startOrResumeRunSource = asyncBlock('startOrResumePetRun');
assert.ok(startOrResumeRunSource.includes("const petId = String(pet.pet_id || '').trim()"), 'new run pet_id must be normalized once');
assert.ok(startOrResumeRunSource.includes('.bind(crypto.randomUUID(), petId,'), 'new runs must persist the normalized pet_id');
assert.equal(serializePetRun({ pet_id: '  pet-normalized  ', telegram_id: 'normalized-owner', run_id: 'normalized-run' }).pet_id, 'pet-normalized',
  'serialized run authority must be normalized');
assert.ok(runStep.includes('recordPetRunBankedEvent'), 'boss step completion must bank through the extract/completion helper');
assert.ok(runStep.includes('retryUnsettledTerminalRunStep'), 'duplicate final run-step callbacks must retry unfinished terminal settlement');
assert.ok(runStep.includes('const terminalRewardDeltas = outcome.success && stepIndex >= PET_RUN_MAX_DEPTH'),
  'final run steps must check account-wallet recovery before an irreversible terminal reward transition');
assert.ok(runStep.includes('const runStepHasWalletMutation = hasPetAccountWalletDelta(walletCostDeltas) || hasPetAccountWalletDelta(terminalRewardDeltas)'),
  'run steps must only apply the recovery SQL predicate when account-wallet authority is involved');
assert.ok(runStep.includes("${runStepHasWalletMutation ? `AND ${accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id')}` : ''}"),
  'pet-only run steps must not be blocked by account-wallet recovery SQL');
assert.ok(runStep.includes('const persistedPet = await getPetInstanceWithAtomicDecay(db, run.pet_id).catch(() => null)'),
  'run-step success responses must reload persisted run-pet authority');
assertOrder(
  runStep,
  'const terminalRewardDeltas = outcome.success && stepIndex >= PET_RUN_MAX_DEPTH',
  'INSERT OR IGNORE INTO telegram_pet_run_steps',
  'terminal wallet recovery must be checked before writing the final step receipt'
);
assertOrder(
  runStep,
  "const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`)",
  'const pet = await getPetInstanceWithAtomicDecay(db, run.pet_id);',
  'run steps must check duplicate event keys before loading and mutating the pet'
);
assertOrder(
  runStep,
  "const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`)",
  "return { accepted: false, reason: 'stale_run_step'",
  'run-step duplicate callbacks must recover the accepted receipt before stale step-index rejection'
);
assertOrder(
  runStep,
  "return { accepted: false, reason: 'stale_run_step'",
  'const pet = await getPetInstanceWithAtomicDecay(db, run.pet_id);',
  'stale run-step callbacks must not load or mutate pet stats'
);
assertOrder(
  runStep,
  "return { accepted: false, reason: 'stale_run_step'",
  'INSERT OR IGNORE INTO telegram_pet_run_steps',
  'stale run-step callbacks must not insert step rows'
);
assertOrder(
  runStep,
  "return { accepted: false, reason: 'stale_run_step'",
  'UPDATE telegram_pet_runs',
  'stale run-step callbacks must not update run rewards or state'
);
assertOrder(
  runStep,
  "const existingStep = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE run_id = ? AND step_index = ?`)",
  'const pet = await getPetInstanceWithAtomicDecay(db, run.pet_id);',
  'run steps must check step-level idempotency before mutating the pet'
);
assertOrder(
  runStep,
  'const missingCosts = getUnaffordablePetRunCosts(pet, outcome.costs, accountWallet);',
  'applyPetRunCosts(pet, outcome.costs);',
  'run step costs must be affordable before any costs are applied'
);
assertOrder(
  runStep,
  'const missingCosts = getUnaffordablePetRunCosts(pet, outcome.costs, accountWallet);',
  'INSERT OR IGNORE INTO telegram_pet_run_steps',
  'unaffordable run steps must be rejected before writing step rewards'
);
assert.ok(runStep.includes('applyPetRunStatRewards(pet, outcome.rewards)'), 'successful run steps must apply non-currency stat rewards before saving pets');
assertOrder(
  runStep,
  'if (!outcome.success) {',
  'applyPetRunStatRewards(pet, outcome.rewards);',
  'run stat rewards must only apply after the failure path has been handled'
);
assert.ok(runStep.indexOf('applyPetRunStatRewards(pet, outcome.rewards);') < runStep.lastIndexOf('runPetInstanceUpdateStatement(db, run.pet_id, pet,'),
  'run stat rewards must be applied before batching the successful step pet persistence');
assert.ok(runStep.includes("AND depth = ?") && runStep.includes('AND EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?)') && runStep.includes('runPetInstanceUpdateStatement(db, run.pet_id, pet,') && runStep.includes("status = 'extractable'") && runStep.includes('RETURNING run_id'), 'run-step receipt, wallet cost, run state, and pet state must be conditionally claimed in one atomic batch');
assert.ok(runStep.includes("if (!stepResults?.[2]?.results?.[0] || Number(stepResults?.[3]?.meta?.changes || 0) !== 1)") && runStep.includes("reason: 'run_closed'"),
  'a run step that loses a terminal-state race must be rejected without applying pet changes');
assert.ok(runStep.includes('runFailEventId') && runStep.includes("SELECT ?, ?, ?, 'run_fail'") && runStep.includes("WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'accepted')"),
  'failed run-step receipt, season state, wallet cost, run state, and pet state must be one atomic outcome');
assert.ok(runStep.includes('inventory_authority: true'), 'authority-owned run item consumption must bypass the temporary legacy cutover bridge');

const startRun = asyncBlock('startOrResumePetRun');
assert.ok(startRun.includes('const requestedRunId = String(options.run_id || \'\').trim().slice(0, 80);'), 'run resume must normalize supplied run ids before inserts');
assert.ok(startRun.includes('const requestedRun = await getPetRunById(db, telegramId, requestedRunId);'), 'run resume must look up supplied run ids before inserts');
assert.ok(startRun.includes("reason: 'run_closed'"), 'old push callbacks for closed runs must be rejected clearly');
assert.ok(startRun.includes("reason: 'run_not_found'"), 'unknown supplied run ids must be rejected cleanly');
assert.ok(startRun.includes('const runId = `run-${crypto.randomUUID()}`.slice(0, 80);'), 'fresh /petrun must create only server-generated run ids');
assert.ok(!startRun.includes('requestedRunId || `run-${crypto.randomUUID()}`'), 'new runs must never insert caller-supplied run ids');
assertOrder(
  startRun,
  'const requestedRun = await getPetRunById(db, telegramId, requestedRunId);',
  'const active = await getActivePetRun(db, telegramId);',
  'supplied run ids must be checked before active-run fallback'
);
assertOrder(
  startRun,
  "return { accepted: false, reason: 'run_not_found'",
  'const active = await getActivePetRun(db, telegramId);',
  'unknown supplied run ids must not fall through to active-run fallback'
);
assertOrder(
  startRun,
  "if (requestedRun && PET_RUN_COMPLETED_STATUSES.includes(requestedRun.status)) return { accepted: false, reason: 'run_closed'",
  'INSERT INTO telegram_pet_runs',
  'closed supplied run ids must be rejected before inserting a duplicate run'
);
assertOrder(
  startRun,
  "return { accepted: false, reason: 'run_not_found'",
  'INSERT INTO telegram_pet_runs',
  'unknown supplied run ids must be rejected before any run insert'
);

const runBank = asyncBlock('recordPetRunBankedEvent');
assert.ok(runBank.includes("source: 'pet_run_legacy'") && runBank.includes('awardPetReward(db'), 'banked run rewards must use the capped unified authority');
assert.ok(runBank.includes("eventType = options.completed ? 'run_complete' : 'run_extract'"), 'run banking must distinguish extract and completion');
assert.ok(runBank.includes("options.completed ? (options.event_key || buildStablePetEventKey(['pet_run_complete', telegramId, run.run_id])) : buildPetRunExtractEventKey(telegramId, run.run_id)"), 'extract banking must ignore caller-provided event keys and use the deterministic run extract key');
assert.ok(runBank.includes('RETURNING *') && runBank.includes('const rewardRun = claimedRow ? serializePetRun(claimedRow)'),
  'terminal claiming must atomically return the exact reward snapshot');
assert.doesNotMatch(runBank, /memory_type:\s*'boss_victory'|boss_id:\s*'alley_king'/,
  'legacy run completion must never create Alley King boss authority');
assert.ok(runBank.includes("rewardRun.status !== terminalStatus"), 'a competing terminal transition must not authorize another reward path');
assertOrder(
  runBank,
  'const claimedRow = await db.prepare(`UPDATE telegram_pet_runs',
  'const awardedAuthority = await awardPetReward(db',
  'extract must atomically claim/close the run and snapshot rewards before awarding them'
);

const runExtract = asyncBlock('processPetRunExtract');
assert.ok(runExtract.includes('recordPetRunBankedEvent'), 'extract must bank through the shared banking helper');
assert.ok(runExtract.includes("reason: 'run_empty'"), 'extract must refuse empty runs');
assert.ok(runExtract.includes('event_key: buildPetRunExtractEventKey(telegramId, run.run_id)'), 'extract must force the deterministic run extract event key');

const actionRoute = routeBlock('/telegram-pets/action');
assert.ok(actionRoute.includes('expected_step_index: body.expected_step_index'), '/telegram-pets/action run_step must carry expected callback step index');

assert.deepEqual(
  getUnaffordablePetRunCosts({}, { moon_gold: 4, moon_crystals: 1, style_tokens: 2 }, { moon_gold: 3, moon_crystals: 1, style_tokens: 0 }),
  { moon_gold: { required: 4, available: 3 }, style_tokens: { required: 2, available: 0 } },
  'run cost validator must report missing account-wallet currencies without reading pet wallet fields'
);
assert.deepEqual(
  getUnaffordablePetRunCosts({}, { moon_gold: 4, moon_crystals: 1, style_tokens: 2 }, { moon_gold: 10, moon_crystals: 1, style_tokens: 2 }),
  {},
  'run cost validator must allow affordable account-wallet currency costs'
);
{
  const pet = { health: 98, hunger: 9, happiness: 94, cleanliness: 91, energy: 88 };
  applyPetRunStatRewards(pet, { health: 10, hunger: 12, happiness: 8, cleanliness: 20, energy: 18, moon_gold: 999 });
  assert.deepEqual(
    pet,
    { health: 100, hunger: 0, happiness: 100, cleanliness: 100, energy: 100 },
    'run stat rewards such as rest must restore/clamp pet stats without applying currency rewards'
  );
}

const notifications = asyncBlock('runPetNeedsNotifications');
assert.ok(notifications.includes('telegram_pet_notification_settings'), 'pet notifications must read the notification preference table');
assert.ok(notifications.includes('PET_NOTIFICATION_COOLDOWN_MINUTES'), 'pet notifications must apply a cooldown');
assert.ok(notifications.includes('sendTelegramMessage'), 'pet notifications must send Telegram messages');

const scheduled = worker.slice(worker.indexOf('async scheduled(event, env, _ctx)'), worker.indexOf('async function cmdGkStart'));
assert.ok(scheduled.includes('shouldRunPetNotifications'), 'scheduled pet notifications must be gated by the cron check');

assert.ok(worker.includes("food?.key === 'crystal_bowl'"), 'crystal_bowl must affect feed bonuses');
assert.ok(worker.includes("toy?.key === 'hoverboard'"), 'hoverboard must affect play bonuses');
assert.ok(worker.includes("outfit?.key === 'crown_jacket'"), 'crown_jacket must affect care bonuses');
assert.ok(worker.includes("bonus.consumed_item_key = 'lucky_charm'"), 'lucky_charm run bonus must mark one charm for consumption');
assert.ok(worker.includes("'run_item_use'"), 'lucky_charm run bonus must be consumed through an inventory-counted event');
assert.ok(worker.includes('buildTelegramMessagePetEventKey'), 'message event keys must be centralized');
assert.ok(worker.includes('buildTelegramCallbackPetEventKey'), 'callback event keys must be centralized');

const stateRoute = routeBlock('/telegram-pets/state');
assert.ok(stateRoute.includes('getPetProfile(env.DB, telegramId)'), 'GET /telegram-pets/state must use read-only pet lookup');
assert.ok(stateRoute.includes('getMoonpetIdentitySummary(env.DB, telegramId)'), 'GET /telegram-pets/state must derive evolution stage from stored identity');
assert.ok(!stateRoute.includes('getOrCreatePetProfile'), 'GET /telegram-pets/state must not create pets');
assert.ok(stateRoute.includes("return err('pet_state_unavailable', 503)"), 'GET /telegram-pets/state must expose a retryable read failure');
assert.ok(!stateRoute.includes('.catch(() => null)'), 'GET /telegram-pets/state must not turn failed reads into a missing pet');

const inventoryRoute = routeBlock('/telegram-pets/inventory');
assert.ok(inventoryRoute.includes('getPetInventory(env.DB, telegramId)'), 'GET /telegram-pets/inventory must expose bag contents');
assert.ok(inventoryRoute.includes("return err('pet_inventory_unavailable', 503)"), 'GET /telegram-pets/inventory must expose a retryable read failure');
assert.ok(!inventoryRoute.includes('.catch(() => null)'), 'GET /telegram-pets/inventory must not turn failed reads into a missing pet or empty bag');

const shopRoute = routeBlock('/telegram-pets/shop');
assert.ok(shopRoute.includes('usable_items'), 'GET /telegram-pets/shop must expose usable items');
assert.ok(shopRoute.includes('jobs'), 'GET /telegram-pets/shop must expose jobs');
assert.ok(shopRoute.includes("return err('pet_shop_unavailable', 503)"), 'GET /telegram-pets/shop must expose a retryable personalized read failure');
assert.ok(!shopRoute.includes('.catch(() => null)'), 'GET /telegram-pets/shop must not turn failed personalized reads into an anonymous Shop');

const missionsRoute = routeBlock('/telegram-pets/missions');
assert.ok(missionsRoute.includes("return err('pet_missions_unavailable', 503)"), 'GET /telegram-pets/missions must expose a retryable read failure');

const failedLegacyReadDb = {
  prepare() {
    return {
      bind() { return this; },
      async first() { throw new Error('simulated_d1_read_failure'); },
      async all() { throw new Error('simulated_d1_read_failure'); },
      async run() { throw new Error('unexpected_write_during_failed_read'); },
    };
  },
  async batch() { throw new Error('unexpected_batch_during_failed_read'); },
};
for (const [path, expectedError] of [
  ['/telegram-pets/state?telegram_id=9001001', 'pet_state_unavailable'],
  ['/telegram-pets/inventory?telegram_id=9001001', 'pet_inventory_unavailable'],
  ['/telegram-pets/missions?telegram_id=9001001', 'pet_missions_unavailable'],
  ['/telegram-pets/shop?telegram_id=9001001', 'pet_shop_unavailable'],
]) {
  const response = await moonboysApiWorker.fetch(new Request(`https://moonboys.test${path}`), { DB: failedLegacyReadDb });
  assert.equal(response.status, 503, `${path} must fail closed when its personalized D1 read fails`);
  assert.equal((await response.json()).error, expectedError, `${path} must return a stable retryable error`);
}

const failedPresentationReadDb = {
  prepare() {
    return {
      bind() { return this; },
      async first() { throw new Error('presentation_read_unavailable'); },
      async all() { throw new Error('presentation_read_unavailable'); },
      async run() { throw new Error('unexpected_write_during_failed_presentation_read'); },
    };
  },
  async batch() { throw new Error('unexpected_batch_during_failed_presentation_read'); },
};
await assert.rejects(getPetEconomyState(failedPresentationReadDb, 'presentation-outage'), /presentation_read_unavailable/,
  'economy state must distinguish a failed profile read from a player with no pet');
await assert.rejects(buildPetGuidanceState(failedPresentationReadDb, 'presentation-outage'), /presentation_read_unavailable/,
  'guidance must distinguish a failed profile read from a player with no pet');
await assert.rejects(syncPetAchievements(failedPresentationReadDb, 'presentation-outage', true), /presentation_read_unavailable/,
  'required achievement projections must distinguish an authority outage from no achievements');
await assert.rejects(getPetEvolutionGuidance(failedPresentationReadDb, 'presentation-outage', { pet_xp: 0 }, {
  current_stage: { stage: 0 }, scope: { pet_id: 'pet-presentation', season_key: 'pet-s2026-001' },
}), /presentation_read_unavailable/,
'evolution guidance must not display zero inventory, victories or relics when its reads fail');

{
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, init = {}) => {
    sent.push(JSON.parse(String(init.body || '{}')).text || '');
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const unavailable = await readTelegramPetPresentation('fixture-token', 'fixture-chat', '…41027 tokens truncated…rds');
assert.equal(rollbackUseItemDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='use-item-rollback' AND status='accepted'").get().count, 0,
  'failed item-use batch must not leave an accepted receipt');
const recoveredRollbackUse = await processPetUseItem(rollbackUseItemDb, 'use-item-rollback', 'style_patch', {
  event_key: 'use-item-rollback', source: 'inventory_authority_regression',
});
assert.equal(recoveredRollbackUse.accepted, true, 'item-use retry after rollback must succeed');
const duplicateRecoveredUse = await processPetUseItem(rollbackUseItemDb, 'use-item-rollback', 'style_patch', {
  event_key: 'use-item-rollback', source: 'inventory_authority_regression',
});
assert.equal(duplicateRecoveredUse.duplicate, true, 'duplicate item-use callback must return the accepted result');
assert.deepEqual(
  { ...rollbackUseItemDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='use-item-rollback' AND asset_key='style_patch'").get() },
  { quantity: 0 },
  'successful item-use plus duplicate retry must consume inventory exactly once',
);
assert.deepEqual(
  { ...rollbackUseItemDb.database.prepare("SELECT style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='use-item-rollback'").get() },
  { style_tokens: 2, pet_xp: 5 },
  'successful item-use plus duplicate retry must grant rewards exactly once',
);
assert.equal(rollbackUseItemDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='use-item-rollback' AND source='pet_item_use' AND status='awarded'").get().count, 1,
  'successful item-use must create exactly one awarded item-use reward claim');

const concurrentSnackDb = seedRepeatRewardPlayer('use-item-concurrent-snack', 70);
await ensurePetStarterSeasonSlot(concurrentSnackDb, 'use-item-concurrent-snack', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(concurrentSnackDb, 'use-item-concurrent-snack');
concurrentSnackDb.database.prepare("UPDATE telegram_pet_profiles SET pet_xp=100, hunger=50, happiness=70, cleanliness=70, energy=70, health=70 WHERE telegram_id='use-item-concurrent-snack'").run();
concurrentSnackDb.database.prepare("UPDATE telegram_pet_instances SET pet_xp=100, hunger=50, happiness=70, cleanliness=70, energy=70, health=70 WHERE telegram_id='use-item-concurrent-snack'").run();
concurrentSnackDb.database.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
  VALUES ('use-item-concurrent-snack', 'item', 'moon_snack', 2)`).run();
const [snackA, snackB] = await Promise.all([
  processPetUseItem(concurrentSnackDb, 'use-item-concurrent-snack', 'moon_snack', {
    event_key: 'use-item-concurrent-snack:a', source: 'inventory_concurrency_regression',
  }),
  processPetUseItem(concurrentSnackDb, 'use-item-concurrent-snack', 'moon_snack', {
    event_key: 'use-item-concurrent-snack:b', source: 'inventory_concurrency_regression',
  }),
]);
assert.equal(snackA.accepted, true, 'first concurrent moon snack use must settle');
assert.equal(snackB.accepted, true, 'second concurrent moon snack use must settle');
assert.equal(concurrentSnackDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='use-item-concurrent-snack' AND asset_key='moon_snack'").get().quantity, 0,
  'two concurrent moon snack uses must consume exactly two items');
assert.deepEqual(
  { ...concurrentSnackDb.database.prepare("SELECT pet_xp, hunger, energy FROM telegram_pet_profiles WHERE telegram_id='use-item-concurrent-snack'").get() },
  { pet_xp: 108, hunger: 14, energy: 86 },
  'two concurrent moon snack uses must apply both XP and stat deltas to the profile',
);
assert.deepEqual(
  { ...concurrentSnackDb.database.prepare("SELECT pet_xp, hunger, energy FROM telegram_pet_instances WHERE telegram_id='use-item-concurrent-snack'").get() },
  { pet_xp: 108, hunger: 14, energy: 86 },
  'two concurrent moon snack uses must apply both XP and stat deltas to the active instance',
);
assert.equal(concurrentSnackDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='use-item-concurrent-snack' AND event_type='use_item' AND status='accepted'").get().count, 2,
  'two concurrent moon snack uses must create two accepted receipts');
assert.equal(concurrentSnackDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='use-item-concurrent-snack' AND source='pet_item_use' AND status='awarded'").get().count, 2,
  'two concurrent moon snack uses must create two awarded reward-claim receipts');

const concurrentMixedDb = seedRepeatRewardPlayer('use-item-concurrent-mixed', 70);
await ensurePetStarterSeasonSlot(concurrentMixedDb, 'use-item-concurrent-mixed', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(concurrentMixedDb, 'use-item-concurrent-mixed');
concurrentMixedDb.database.prepare("UPDATE telegram_pet_profiles SET pet_xp=100, hunger=50, happiness=70, cleanliness=70, energy=70, health=70 WHERE telegram_id='use-item-concurrent-mixed'").run();
concurrentMixedDb.database.prepare("UPDATE telegram_pet_instances SET pet_xp=100, hunger=50, happiness=70, cleanliness=70, energy=70, health=70 WHERE telegram_id='use-item-concurrent-mixed'").run();
concurrentMixedDb.database.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES
  ('use-item-concurrent-mixed', 'item', 'moon_snack', 1),
  ('use-item-concurrent-mixed', 'item', 'energy_drink', 1)`).run();
const [mixedSnack, mixedDrink] = await Promise.all([
  processPetUseItem(concurrentMixedDb, 'use-item-concurrent-mixed', 'moon_snack', {
    event_key: 'use-item-concurrent-mixed:snack', source: 'inventory_concurrency_regression',
  }),
  processPetUseItem(concurrentMixedDb, 'use-item-concurrent-mixed', 'energy_drink', {
    event_key: 'use-item-concurrent-mixed:drink', source: 'inventory_concurrency_regression',
  }),
]);
assert.equal(mixedSnack.accepted, true, 'concurrent moon snack use must settle');
assert.equal(mixedDrink.accepted, true, 'concurrent energy drink use must settle');
assert.deepEqual(
  concurrentMixedDb.database.prepare("SELECT asset_key, quantity FROM telegram_pet_inventory WHERE telegram_id='use-item-concurrent-mixed' ORDER BY asset_key").all().map((row) => ({ ...row })),
  [{ asset_key: 'energy_drink', quantity: 0 }, { asset_key: 'moon_snack', quantity: 0 }],
  'concurrent conflicting item uses must consume each item once without duplication',
);
assert.deepEqual(
  { ...concurrentMixedDb.database.prepare("SELECT pet_xp, hunger, energy FROM telegram_pet_profiles WHERE telegram_id='use-item-concurrent-mixed'").get() },
  { pet_xp: 110, hunger: 32, energy: 100 },
  'concurrent conflicting item uses must not lose XP or stat deltas',
);
assert.equal(concurrentMixedDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='use-item-concurrent-mixed' AND event_type='use_item' AND status='accepted'").get().count, 2,
  'two concurrent conflicting item uses must create two accepted event receipts');
assert.equal(concurrentMixedDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='use-item-concurrent-mixed' AND source='pet_item_use' AND status='awarded'").get().count, 2,
  'two concurrent conflicting item uses must create two awarded reward-claim receipts');

const switchItemDb = seedRepeatRewardPlayer('use-item-switch', 70);
await ensurePetStarterSeasonSlot(switchItemDb, 'use-item-switch', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(switchItemDb, 'use-item-switch');
const switchPetA = switchItemDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='use-item-switch'").get().pet_id;
switchItemDb.database.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES ('use-item-switch-b','use-item-switch','pet-s2026-003',2,'arcade_xp')").run();
switchItemDb.database.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,hunger,energy,health,source_profile_updated_at) VALUES ('use-item-switch-b','use-item-switch','pet-s2026-003',2,0,50,70,70,CURRENT_TIMESTAMP)").run();
switchItemDb.database.prepare("UPDATE telegram_pet_profiles SET pet_xp=100, hunger=50, energy=70, health=70 WHERE telegram_id='use-item-switch'").run();
switchItemDb.database.prepare("UPDATE telegram_pet_instances SET pet_xp=100, hunger=50, energy=70, health=70 WHERE pet_id=?").run(switchPetA);
switchItemDb.database.prepare("INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES ('use-item-switch', 'item', 'moon_snack', 1)").run();
switchItemDb.beforeBatchSql(/INSERT OR IGNORE INTO telegram_pet_events/, () => {
  switchItemDb.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='use-item-switch-b' WHERE telegram_id='use-item-switch'").run();
});
const switchedUse = await processPetUseItem(switchItemDb, 'use-item-switch', 'moon_snack', {
  event_key: 'use-item-switch:snack', source: 'inventory_concurrency_regression',
});
assert.equal(switchedUse.accepted, true, 'active pet switching during item use must not block the claimed pet authority');
assert.equal(switchItemDb.database.prepare('SELECT pet_id FROM telegram_pet_events WHERE event_key=?').get('use-item-switch:snack').pet_id, switchPetA,
  'item-use receipt must keep the pet_id read before active-pet switching');
assert.equal(switchItemDb.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(switchPetA).pet_xp, 104,
  'item-use reward must apply to the originally claimed active pet');
assert.equal(switchItemDb.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='use-item-switch-b'").get().pet_xp, 0,
  'active pet switching must not redirect item-use rewards to the new active pet');

const legacyBossDb = seedRepeatRewardPlayer('legacy-boss-gate', 100, new Date().toISOString(), { seedAuthority: false });
legacyBossDb.database.prepare(`UPDATE telegram_pet_profiles SET pet_xp=100000, level=51, stage='street_moonpet'
  WHERE telegram_id='legacy-boss-gate'`).run();
for (const [evolutionId, stage] of [['moon_egg', 0], ['street_moonpet', 1]]) {
  legacyBossDb.database.prepare(`INSERT INTO telegram_pet_evolutions
    (telegram_id, evolution_id, stage, unlock_event_key, materials_consumed)
    VALUES ('legacy-boss-gate', ?, ?, ?, 1)`).run(evolutionId, stage, `fixture:${evolutionId}`);
}
legacyBossDb.database.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES
  ('legacy-boss-gate', 'scrap_metal', 10),
  ('legacy-boss-gate', 'evolution_fragment', 3)`).run();
legacyBossDb.database.prepare(`INSERT INTO telegram_pet_relics (telegram_id, relic_id, rarity) VALUES
  ('legacy-boss-gate', 'bitcoin_heart', 'legendary'),
  ('legacy-boss-gate', 'neon_boots', 'rare')`).run();
for (let index = 1; index <= 1; index += 1) {
  const runId = `legacy-completion-${index}`;
  legacyBossDb.database.prepare(`INSERT INTO telegram_pet_runs
    (id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level)
    VALUES (?, 'legacy-boss-gate', ?, 'pet-s2026-003', 'active', 5, 5, 1)`).run(`legacy-row-${index}`, runId);
  const run = legacyBossDb.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(runId);
  const pet = legacyBossDb.database.prepare("SELECT * FROM telegram_pet_profiles WHERE telegram_id='legacy-boss-gate'").get();
  const completed = await recordPetRunBankedEvent(legacyBossDb, 'legacy-boss-gate', run, pet, {
    completed: true, event_key: `legacy-complete:${index}`, source: 'legacy_boss_gate_regression',
  });
  assert.equal(completed.accepted, false, 'pre-066 completion must fail closed without run pet authority');
  assert.equal(completed.reason, 'run_pet_authority_required');
}
assert.equal(legacyBossDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_boss_victories WHERE telegram_id='legacy-boss-gate'").get().count, 0,
  'legacy completions must not create Alley King victory rows');
assert.equal(legacyBossDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_memories WHERE telegram_id='legacy-boss-gate'").get().count, 0,
  'rejected pre-066 completions cannot create completion memories');
const blockedCyberEvolution = await evolveMoonpet(legacyBossDb, {
  telegram_id: 'legacy-boss-gate', evolution_id: 'cyber_moonpet', event_key: 'legacy-boss-gate:evolve',
});
assert.equal(blockedCyberEvolution.accepted, false, 'legacy completion cannot unlock boss-gated evolution');
assert.equal(blockedCyberEvolution.reason, 'evolution_authority_unavailable',
  'legacy account-only state cannot bypass missing pet and season authority');

const runSeasonRolloverDb = seedRepeatRewardPlayer('run-season-rollover', 100);
const runSeasonRolloverPet = 'pet-run-season-rollover-a';
runSeasonRolloverDb.database.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type)
  VALUES (?, 'run-season-rollover', 'pet-s2026-001', 1, 'free')`).run(runSeasonRolloverPet);
runSeasonRolloverDb.database.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number, pet_xp, level, happiness, energy, source_profile_updated_at, status)
  VALUES (?, 'run-season-rollover', 'pet-s2026-001', 1, 0, 1, 70, 100, CURRENT_TIMESTAMP, 'active')`).run(runSeasonRolloverPet);
runSeasonRolloverDb.database.prepare(`UPDATE telegram_pet_active_slots
  SET pet_id=?, season_key='pet-s2026-001'
  WHERE telegram_id='run-season-rollover'`).run(runSeasonRolloverPet);
runSeasonRolloverDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level,
   unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items)
  VALUES ('run-season-rollover-row', ?, 'run-season-rollover', 'run-season-rollover-run',
    'pet-s2026-001', 'active', 5, 5, 1, 24, 19, 0, 0, '{}')`).run(runSeasonRolloverPet);
const runSeasonRolloverRun = runSeasonRolloverDb.database.prepare("SELECT * FROM telegram_pet_runs WHERE run_id='run-season-rollover-run'").get();
const runSeasonRolloverResult = await recordPetRunBankedEvent(runSeasonRolloverDb, 'run-season-rollover', runSeasonRolloverRun, {
  pet_id: runSeasonRolloverPet,
  telegram_id: 'run-season-rollover',
}, { completed: true, event_key: 'run-season-rollover-complete', source: 'season_rollover_regression' });
assert.equal(runSeasonRolloverResult.accepted, true, 'run completion after season rollover must still settle');
assert.deepEqual(
  { ...runSeasonRolloverDb.database.prepare(`SELECT pet_id, season_key FROM telegram_pet_events
    WHERE telegram_id='run-season-rollover' AND event_key='run-season-rollover-complete'`).get() },
  { pet_id: runSeasonRolloverPet, season_key: 'pet-s2026-001' },
  'run-derived reward source events must use the persisted run season authority, not the current calendar season',
);
assert.equal(runSeasonRolloverDb.database.prepare(`SELECT total_runs FROM telegram_pet_memories
  WHERE pet_id=? AND season_key='pet-s2026-001'`).get(runSeasonRolloverPet).total_runs, 1,
  'run completion memory must remain attached to the Season A run pet authority');
assert.equal(runSeasonRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_personality_traits
  WHERE pet_id=? AND season_key='pet-s2026-001'`).get(runSeasonRolloverPet).count > 0, true,
  'run completion personality progress must remain attached to the Season A run pet authority');
runSeasonRolloverDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level,
   unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items)
  VALUES ('run-season-rollover-extract-row', ?, 'run-season-rollover', 'run-season-rollover-extract-run',
    'pet-s2026-001', 'active', 3, 5, 1, 12, 7, 0, 0, '{}')`).run(runSeasonRolloverPet);
const runSeasonRolloverExtractRun = runSeasonRolloverDb.database.prepare("SELECT * FROM telegram_pet_runs WHERE run_id='run-season-rollover-extract-run'").get();
const runSeasonRolloverExtract = await recordPetRunBankedEvent(runSeasonRolloverDb, 'run-season-rollover', runSeasonRolloverExtractRun, {
  pet_id: runSeasonRolloverPet,
  telegram_id: 'run-season-rollover',
}, { event_key: 'run-season-rollover-extract', source: 'season_rollover_regression' });
assert.equal(runSeasonRolloverExtract.accepted, true, 'run extraction after season rollover must still settle');
assert.deepEqual(
  { ...runSeasonRolloverDb.database.prepare(`SELECT pet_id, season_key FROM telegram_pet_events
    WHERE telegram_id='run-season-rollover' AND event_key=?`).get(buildPetRunExtractEventKey('run-season-rollover', 'run-season-rollover-extract-run')) },
  { pet_id: runSeasonRolloverPet, season_key: 'pet-s2026-001' },
  'run-derived extraction source events must also use the persisted run season authority',
);

async function runMoonAlleyEnergyFixture(telegramId, randomValue, eventKey) {
  const db = seedRepeatRewardPlayer(telegramId, 18);
  const originalRandom = Math.random;
  Math.random = () => randomValue;
  let result;
  try {
    result = await processPetAdventure(db, telegramId, 'push_forward', {
      encounter_key: 'moon_alley', event_key: eventKey, source: 'adventure_energy_regression',
    });
  } finally {
    Math.random = originalRandom;
  }
  return { db, result };
}

const moonAlleySuccess = await runMoonAlleyEnergyFixture('adventure-energy-success', 0.99, 'adventure-energy-success');
assert.equal(moonAlleySuccess.result.accepted, true, 'Moon Alley must accept a pet with exactly its required 18 Energy');
assert.equal(moonAlleySuccess.result.applied.costsApplied.energy, 16, 'the deterministic success fixture must roll the expected Energy cost');
assert.equal(moonAlleySuccess.db.database.prepare("SELECT energy FROM telegram_pet_instances WHERE telegram_id = 'adventure-energy-success'").get().energy, 2,
  'an accepted Moon Alley adventure must deduct its rolled Energy cost exactly once without extra drain');
const duplicateMoonAlleySuccess = await processPetAdventure(moonAlleySuccess.db, 'adventure-energy-success', 'push_forward', {
  encounter_key: 'moon_alley', event_key: 'adventure-energy-success', source: 'adventure_energy_regression',
});
assert.equal(duplicateMoonAlleySuccess.duplicate, true, 'a duplicate successful adventure callback must be idempotent');
assert.equal(moonAlleySuccess.db.database.prepare("SELECT energy FROM telegram_pet_instances WHERE telegram_id = 'adventure-energy-success'").get().energy, 2,
  'a duplicate successful adventure callback must not charge Energy again');

const moonAlleyRisk = await runMoonAlleyEnergyFixture('adventure-energy-risk', 0, 'adventure-energy-risk');
assert.equal(moonAlleyRisk.result.accepted, true, 'a Moon Alley risk outcome must settle through the reward authority');
assert.equal(moonAlleyRisk.result.applied.costsApplied.energy, 13, 'the deterministic risk fixture must roll the expected Energy cost');
assert.equal(moonAlleyRisk.db.database.prepare("SELECT energy FROM telegram_pet_instances WHERE telegram_id = 'adventure-energy-risk'").get().energy, 5,
  'a failed adventure outcome must consume only its rolled Energy cost and never drain below zero');
const duplicateMoonAlleyRisk = await processPetAdventure(moonAlleyRisk.db, 'adventure-energy-risk', 'push_forward', {
  encounter_key: 'moon_alley', event_key: 'adventure-energy-risk', source: 'adventure_energy_regression',
});
assert.equal(duplicateMoonAlleyRisk.duplicate, true, 'a duplicate failed adventure callback must be idempotent');
assert.equal(moonAlleyRisk.db.database.prepare("SELECT energy FROM telegram_pet_instances WHERE telegram_id = 'adventure-energy-risk'").get().energy, 5,
  'a duplicate failed adventure callback must not consume Energy twice');

const tiredMoonAlleyDb = seedRepeatRewardPlayer('adventure-energy-tired', 17);
const tiredMoonAlleyRequest = {
  encounter_key: 'moon_alley', event_key: 'adventure-energy-tired', source: 'adventure_energy_regression',
};
const firstTiredMoonAlley = await processPetAdventure(tiredMoonAlleyDb, 'adventure-energy-tired', 'push_forward', tiredMoonAlleyRequest);
const retriedTiredMoonAlley = await processPetAdventure(tiredMoonAlleyDb, 'adventure-energy-tired', 'push_forward', tiredMoonAlleyRequest);
assert.equal(firstTiredMoonAlley.reason, 'pet_tired', 'Moon Alley must reject a pet below the required 18 Energy');
assert.equal(retriedTiredMoonAlley.reason, 'pet_tired', 'retrying a rejected adventure must remain rejected');
assert.equal(tiredMoonAlleyDb.database.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id = 'adventure-energy-tired'").get().energy, 17,
  'a failed adventure and its retry must not consume Energy');

const runChoiceItemDb = seedRepeatRewardPlayer('run-choice-item', 90);
await ensurePetStarterSeasonSlot(runChoiceItemDb, 'run-choice-item', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(runChoiceItemDb, 'run-choice-item');
const runChoicePet = runChoiceItemDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='run-choice-item'").get();
runChoiceItemDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level)
  VALUES ('run-choice-item-row', ?, 'run-choice-item', 'run-choice-item-run', 'pet-s2026-003', 'active', 0, 5, 1)`).run(runChoicePet.pet_id);
runChoiceItemDb.database.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
  VALUES ('run-choice-item', 'item', 'lucky_charm', 1)`).run();
const runChoiceRandom = Math.random;
Math.random = () => 0.99;
const offeredRunChoice = buildPetRunChoiceReplyMarkup({ run_id: 'run-choice-item-run', depth: 0, max_depth: 100, risk_level: 1, unbanked_items: '{}' })
  .inline_keyboard[0][0].callback_data.split(':').at(-1);
let runChoiceItemResult;
try {
  runChoiceItemResult = await processPetRunStep(runChoiceItemDb, 'run-choice-item', 'run-choice-item-run', offeredRunChoice, {
    event_key: 'run-choice-item-step', expected_step_index: 1, source: 'inventory_authority_regression',
  });
} finally {
  Math.random = runChoiceRandom;
}
assert.equal(runChoiceItemResult.accepted, true, 'run choices must accept an available authority-backed one-use item');
assert.equal((await getPetInventory(runChoiceItemDb, 'run-choice-item')).find((item) => item.key === 'lucky_charm').count, 0,
  'run choices must consume one-use items from the authoritative inventory table');

function seedWalletCostRun(telegramId, profileGold, instanceGold) {
  const db = seedRepeatRewardPlayer(telegramId, 90);
  db.database.prepare('UPDATE telegram_pet_profiles SET moon_gold = ? WHERE telegram_id = ?').run(profileGold, telegramId);
  return ensurePetStarterSeasonSlot(db, telegramId, new Date('2026-08-15T00:00:00Z')).then(async () => {
    await __petMediaTestHooks.ensureActivePetInstance(db, telegramId);
    const pet = db.database.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = ?').get(telegramId);
    db.database.prepare('UPDATE telegram_pet_instances SET moon_gold = ?, energy = 90, source_profile_updated_at = ? WHERE pet_id = ?')
      .run(instanceGold, '0001-01-01 00:00:00', pet.pet_id);
    let tradeDepth = null;
    for (let depth = 0; depth < 8; depth += 1) {
      const preview = { run_id: `${telegramId}-run`, depth, max_depth: 100, risk_level: 1, unbanked_items: '{}' };
      const callbacks = buildPetRunChoiceReplyMarkup(preview).inline_keyboard.flat().map((button) => button.callback_data);
      if (callbacks.some((callback) => callback.endsWith(':trade'))) {
        tradeDepth = depth;
        break;
      }
    }
    assert.notEqual(tradeDepth, null, 'test fixture must find a Moon Run trade step');
    db.database.prepare(`INSERT INTO telegram_pet_runs
      (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level)
      VALUES (?, ?, ?, ?, 'pet-s2026-003', 'active', ?, 100, 1)`)
      .run(`${telegramId}-row`, pet.pet_id, telegramId, `${telegramId}-run`, tradeDepth);
    return { db, pet, runId: `${telegramId}-run`, expectedStepIndex: tradeDepth + 1 };
  });
}

async function seedChoiceRun(telegramId, choiceKey, requestedDepth = null) {
  const db = seedRepeatRewardPlayer(telegramId, 90);
  await ensurePetStarterSeasonSlot(db, telegramId, new Date('2026-08-15T00:00:00Z'));
  await __petMediaTestHooks.ensureActivePetInstance(db, telegramId);
  const pet = db.database.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = ?').get(telegramId);
  db.database.prepare('UPDATE telegram_pet_instances SET energy = 90, hunger = 25, happiness = 70, cleanliness = 70, source_profile_updated_at = ? WHERE pet_id = ?')
    .run('0001-01-01 00:00:00', pet.pet_id);
  let depth = requestedDepth;
  if (depth === null || depth === undefined) {
    for (let candidateDepth = 0; candidateDepth < 12; candidateDepth += 1) {
      const callbacks = buildPetRunChoiceReplyMarkup({ run_id: `${telegramId}-run`, depth: candidateDepth, max_depth: 100, risk_level: 1, unbanked_items: '{}' })
        .inline_keyboard.flat().map((button) => button.callback_data);
      if (callbacks.some((callback) => callback.endsWith(`:${choiceKey}`))) {
        depth = candidateDepth;
        break;
      }
    }
  }
  assert.notEqual(depth, null, `test fixture must find a Moon Run ${choiceKey} step`);
  db.database.prepare(`INSERT INTO telegram_pet_runs
    (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level, unbanked_items)
    VALUES (?, ?, ?, ?, 'pet-s2026-003', 'active', ?, 100, 1, '{}')`)
    .run(`${telegramId}-row`, pet.pet_id, telegramId, `${telegramId}-run`, depth);
  const callbacks = buildPetRunChoiceReplyMarkup({ run_id: `${telegramId}-run`, depth, max_depth: 100, risk_level: 1, unbanked_items: '{}' })
    .inline_keyboard.flat().map((button) => button.callback_data);
  assert.ok(callbacks.some((callback) => callback.endsWith(`:${choiceKey}`)), `test fixture must offer ${choiceKey}`);
  return { db, pet, runId: `${telegramId}-run`, expectedStepIndex: depth + 1, choiceKey };
}

const recoveryFightRun = await seedChoiceRun('run-recovery-fight', 'fight');
insertWalletRecoveryRequired(recoveryFightRun.db, 'run-recovery-fight');
const recoveryFightRandom = Math.random;
Math.random = () => 0.99;
let recoveryFight;
try {
  recoveryFight = await processPetRunStep(recoveryFightRun.db, 'run-recovery-fight', recoveryFightRun.runId, 'fight', {
    event_key: 'run-recovery-fight-step',
    expected_step_index: recoveryFightRun.expectedStepIndex,
    source: 'recovery_pet_only_run_regression',
  });
} finally {
  Math.random = recoveryFightRandom;
}
assert.equal(recoveryFight.accepted, true, 'recovery-pending fight must be allowed because it does not mutate the account wallet yet');
assert.equal(recoveryFight.reason, 'run_step_complete');
assert.deepEqual(
  { ...recoveryFightRun.db.database.prepare("SELECT depth, status FROM telegram_pet_runs WHERE telegram_id='run-recovery-fight'").get() },
  { depth: recoveryFightRun.expectedStepIndex, status: 'extractable' },
  'recovery-pending fight must advance run state',
);
assert.deepEqual(
  { ...recoveryFightRun.db.database.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id='run-recovery-fight'").get() },
  { moon_gold: 0, moon_crystals: 0, style_tokens: 0 },
  'recovery-pending fight must not mutate the account wallet before terminal settlement',
);
const duplicateRecoveryFight = await processPetRunStep(recoveryFightRun.db, 'run-recovery-fight', recoveryFightRun.runId, 'fight', {
  event_key: 'run-recovery-fight-step',
  expected_step_index: recoveryFightRun.expectedStepIndex,
  source: 'recovery_pet_only_run_regression',
});
assert.equal(duplicateRecoveryFight.duplicate, true, 'duplicate recovery-pending fight callback must return the accepted step');

const recoveryRestRun = await seedChoiceRun('run-recovery-rest', 'rest');
insertWalletRecoveryRequired(recoveryRestRun.db, 'run-recovery-rest');
const recoveryRestRandom = Math.random;
Math.random = () => 0.99;
let recoveryRest;
try {
  recoveryRest = await processPetRunStep(recoveryRestRun.db, 'run-recovery-rest', recoveryRestRun.runId, 'rest', {
    event_key: 'run-recovery-rest-step',
    expected_step_index: recoveryRestRun.expectedStepIndex,
    source: 'recovery_pet_only_run_regression',
  });
} finally {
  Math.random = recoveryRestRandom;
}
assert.equal(recoveryRest.accepted, true, 'recovery-pending rest must be allowed because it only changes pet/run state');
assert.equal(recoveryRest.reason, 'run_step_complete');
assert.deepEqual(
  { ...recoveryRestRun.db.database.prepare("SELECT depth, status FROM telegram_pet_runs WHERE telegram_id='run-recovery-rest'").get() },
  { depth: recoveryRestRun.expectedStepIndex, status: 'extractable' },
  'recovery-pending rest must persist run progress',
);
assert.ok(recoveryRestRun.db.database.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id = ?').get(recoveryRestRun.pet.pet_id).energy >= 90,
  'recovery-pending rest must persist pet-owned stat rewards');

const accountRunCost = await seedWalletCostRun('run-wallet-cost', 100, 0);
const runWalletRandom = Math.random;
Math.random = () => 0.99;
let runWalletResult;
try {
  runWalletResult = await processPetRunStep(accountRunCost.db, 'run-wallet-cost', accountRunCost.runId, 'trade', {
    event_key: 'run-wallet-cost-step', expected_step_index: accountRunCost.expectedStepIndex, source: 'account_wallet_run_cost_regression',
  });
} finally {
  Math.random = runWalletRandom;
}
assert.equal(runWalletResult.accepted, true, 'run-step wallet trade with enough account Moon Gold must succeed');
assert.equal(accountRunCost.db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'run-wallet-cost'").get().moon_gold, 88,
  'run-step wallet trade must debit profile account wallet authority');
assert.equal(runWalletResult.pet.moon_gold, 88,
  'accepted run-step response must return the updated account wallet after wallet costs');
assert.equal(accountRunCost.db.database.prepare('SELECT moon_gold FROM telegram_pet_instances WHERE pet_id = ?').get(accountRunCost.pet.pet_id).moon_gold, 0,
  'run-step wallet trade must not depend on or mutate stale instance wallet columns');
assert.equal(accountRunCost.db.database.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id = ?').get(accountRunCost.pet.pet_id).energy, 80,
  'run-step pet-owned stat costs must still persist to the run pet instance');
const duplicateRunWallet = await processPetRunStep(accountRunCost.db, 'run-wallet-cost', accountRunCost.runId, 'trade', {
  event_key: 'run-wallet-cost-step', expected_step_index: accountRunCost.expectedStepIndex, source: 'account_wallet_run_cost_regression',
});
assert.equal(duplicateRunWallet.accepted, true,
  'duplicate run-step wallet trade callback must recover the accepted result even after the run advanced');
assert.equal(duplicateRunWallet.duplicate, true,
  'duplicate run-step wallet trade callback must be marked idempotent');
assert.equal(accountRunCost.db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'run-wallet-cost'").get().moon_gold, 88,
  'duplicate run-step wallet trade callback must not double-debit account Moon Gold');

const insufficientRunCost = await seedWalletCostRun('run-wallet-insufficient', 3, 999);
const insufficientRunRandom = Math.random;
Math.random = () => 0.99;
let insufficientRunResult;
try {
  insufficientRunResult = await processPetRunStep(insufficientRunCost.db, 'run-wallet-insufficient', insufficientRunCost.runId, 'trade', {
    event_key: 'run-wallet-insufficient-step', expected_step_index: insufficientRunCost.expectedStepIndex, source: 'account_wallet_run_cost_regression',
  });
} finally {
  Math.random = insufficientRunRandom;
}
assert.equal(insufficientRunResult.accepted, false, 'insufficient account wallet must block run-step wallet trades');
assert.equal(insufficientRunResult.reason, 'insufficient_run_cost');
assert.equal(insufficientRunCost.db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'run-wallet-insufficient'").get().moon_gold, 3,
  'failed run-step wallet trade must not debit the account wallet');
assert.equal(insufficientRunCost.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_steps WHERE telegram_id = 'run-wallet-insufficient'").get().count, 0,
  'failed run-step wallet trade must not write an accepted step receipt');

const recoveryFreezeRunCost = await seedWalletCostRun('run-wallet-recovery-freeze', 100, 0);
insertWalletRecoveryRequired(recoveryFreezeRunCost.db, 'run-wallet-recovery-freeze');
const recoveryFreezeRunRandom = Math.random;
Math.random = () => 0.99;
let frozenRunCost;
try {
  frozenRunCost = await processPetRunStep(recoveryFreezeRunCost.db, 'run-wallet-recovery-freeze', recoveryFreezeRunCost.runId, 'trade', {
    event_key: 'run-wallet-recovery-freeze-step', expected_step_index: recoveryFreezeRunCost.expectedStepIndex, source: 'account_wallet_run_cost_regression',
  });
} finally {
  Math.random = recoveryFreezeRunRandom;
}
assert.equal(frozenRunCost.accepted, false, 'pending historical recovery must freeze Moon Run wallet costs');
assert.equal(frozenRunCost.reason, 'wallet_reconciliation_recovery_pending');
assert.equal(recoveryFreezeRunCost.db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'run-wallet-recovery-freeze'").get().moon_gold, 100,
  'frozen run-step wallet cost must not debit the account wallet');
assert.deepEqual(
  { ...recoveryFreezeRunCost.db.database.prepare("SELECT depth, status FROM telegram_pet_runs WHERE telegram_id = 'run-wallet-recovery-freeze'").get() },
  { depth: recoveryFreezeRunCost.expectedStepIndex - 1, status: 'active' },
  'frozen run-step wallet cost must not advance run state',
);
assert.equal(
  recoveryFreezeRunCost.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_steps WHERE telegram_id = 'run-wallet-recovery-freeze'").get().count,
  0,
  'frozen run-step wallet cost must not create a step receipt',
);

const runAtomicPersistenceFailure = await seedWalletCostRun('run-wallet-atomic-failure', 100, 0);
runAtomicPersistenceFailure.db.failBatchOnSql(/UPDATE telegram_pet_instances SET pet_name = \?/);
const atomicFailureRandom = Math.random;
Math.random = () => 0.99;
try {
  await assert.rejects(
    processPetRunStep(runAtomicPersistenceFailure.db, 'run-wallet-atomic-failure', runAtomicPersistenceFailure.runId, 'trade', {
      event_key: 'run-wallet-atomic-failure-step',
      expected_step_index: runAtomicPersistenceFailure.expectedStepIndex,
      source: 'account_wallet_run_cost_regression',
    }),
    /simulated_d1_batch_failure/,
    'run-step pet persistence failure must surface so the callback can retry',
  );
} finally {
  Math.random = atomicFailureRandom;
}
assert.deepEqual(
  { ...runAtomicPersistenceFailure.db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'run-wallet-atomic-failure'").get() },
  { moon_gold: 100 },
  'failed run-step pet persistence must roll back the account-wallet debit',
);
assert.deepEqual(
  { ...runAtomicPersistenceFailure.db.database.prepare("SELECT depth, status FROM telegram_pet_runs WHERE telegram_id = 'run-wallet-atomic-failure'").get() },
  { depth: runAtomicPersistenceFailure.expectedStepIndex - 1, status: 'active' },
  'failed run-step pet persistence must roll back the run state update',
);
assert.equal(
  runAtomicPersistenceFailure.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_steps WHERE telegram_id = 'run-wallet-atomic-failure'").get().count,
  0,
  'failed run-step pet persistence must roll back the run-step receipt',
);
assert.equal(
  runAtomicPersistenceFailure.db.database.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id = ?').get(runAtomicPersistenceFailure.pet.pet_id).energy,
  90,
  'failed run-step pet persistence must leave pet-owned state unchanged for retry',
);
const retryAtomicRandom = Math.random;
Math.random = () => 0.99;
let retriedRunStep;
try {
  retriedRunStep = await processPetRunStep(runAtomicPersistenceFailure.db, 'run-wallet-atomic-failure', runAtomicPersistenceFailure.runId, 'trade', {
    event_key: 'run-wallet-atomic-failure-step',
    expected_step_index: runAtomicPersistenceFailure.expectedStepIndex,
    source: 'account_wallet_run_cost_regression',
  });
} finally {
  Math.random = retryAtomicRandom;
}
assert.equal(retriedRunStep.accepted, true, 'run-step retry should settle after failed persistence rolls back');
assert.equal(runAtomicPersistenceFailure.db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'run-wallet-atomic-failure'").get().moon_gold, 88,
  'retried run-step must debit account wallet exactly once');
const retriedRunState = { ...runAtomicPersistenceFailure.db.database.prepare("SELECT depth, status FROM telegram_pet_runs WHERE telegram_id = 'run-wallet-atomic-failure'").get() };
assert.equal(retriedRunState.depth, runAtomicPersistenceFailure.expectedStepIndex,
  'retried run-step must persist the run depth after the wallet debit');
assert.ok(['active', 'extractable'].includes(retriedRunState.status),
  'retried run-step must leave the run in the state produced by the accepted step');
assert.equal(
  runAtomicPersistenceFailure.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_steps WHERE telegram_id = 'run-wallet-atomic-failure'").get().count,
  1,
  'retried run-step must create exactly one receipt',
);
assert.equal(
  runAtomicPersistenceFailure.db.database.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id = ?').get(runAtomicPersistenceFailure.pet.pet_id).energy,
  80,
  'retried run-step must persist pet-owned costs with the wallet debit',
);
const duplicateRecoveredRunStep = await processPetRunStep(runAtomicPersistenceFailure.db, 'run-wallet-atomic-failure', runAtomicPersistenceFailure.runId, 'trade', {
  event_key: 'run-wallet-atomic-failure-step',
  expected_step_index: runAtomicPersistenceFailure.expectedStepIndex,
  source: 'account_wallet_run_cost_regression',
});
assert.equal(duplicateRecoveredRunStep.duplicate, true,
  'duplicate run-step callback after a recovered persistence failure must return the accepted receipt');
assert.equal(runAtomicPersistenceFailure.db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'run-wallet-atomic-failure'").get().moon_gold, 88,
  'duplicate callback after run-step recovery must not debit the account wallet again');

const failedStepEventDb = seedRepeatRewardPlayer('failed-step-event', 90);
await ensurePetStarterSeasonSlot(failedStepEventDb, 'failed-step-event', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(failedStepEventDb, 'failed-step-event');
const failedStepPet = failedStepEventDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='failed-step-event'").get();
const failedStepDay = new Date().toISOString().slice(0, 10);
failedStepEventDb.database.prepare(`INSERT INTO telegram_pet_events
  (id, pet_id, telegram_id, event_type, event_key, pet_xp_awarded, season_key, day_key, week_key, status)
  VALUES ('other-pet-cap', 'another-pet-instance', 'failed-step-event', 'test', 'other-pet-cap', 1200, 'pet-s2026-003', ?, 'week', 'accepted')`).run(failedStepDay);
failedStepEventDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level)
  VALUES ('failed-step-row', ?, 'failed-step-event', 'failed-step-run', 'pet-s2026-003', 'active', 0, 5, 1)`).run(failedStepPet.pet_id);
const failedStepChoice = buildPetRunChoiceReplyMarkup({ run_id: 'failed-step-run', depth: 0, max_depth: 5, risk_level: 1, unbanked_items: '{}' })
  .inline_keyboard[0][0].callback_data.split(':').at(-1);
const failedStepRandom = Math.random;
Math.random = () => 0;
let failedStepResult;
try {
  failedStepResult = await processPetRunStep(failedStepEventDb, 'failed-step-event', 'failed-step-run', failedStepChoice,
    { event_key: 'failed-step-event-key', expected_step_index: 1, source: 'pet_id_audit_regression' });
} finally {
  Math.random = failedStepRandom;
}
assert.equal(failedStepResult.reason, 'run_failed');
const failedStepLedger = failedStepEventDb.database.prepare("SELECT pet_id, pet_xp_awarded FROM telegram_pet_events WHERE event_type='run_fail'").get();
assert.equal(failedStepLedger.pet_id, failedStepPet.pet_id, 'failed-step consolation XP must be visible in the run pet ledger');
assert.equal(failedStepLedger.pet_xp_awarded, failedStepResult.pet_xp_awarded);
assert.ok(failedStepLedger.pet_xp_awarded > 0, 'another pet consuming its cap cannot suppress this run pet consolation XP');

const terminalRaceDb = seedRepeatRewardPlayer('terminal-race', 90);
await ensurePetStarterSeasonSlot(terminalRaceDb, 'terminal-race', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(terminalRaceDb, 'terminal-race');
const terminalRacePet = terminalRaceDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='terminal-race'").get();
terminalRaceDb.database.prepare(`
  INSERT INTO telegram_pet_runs
    (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level,
      unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items)
  VALUES ('terminal-race-row', ?, 'terminal-race', 'terminal-race-run', 'pet-s2026-003', 'active', 4, 5, 1,
    30, 12, 1, 2, '{}')
`).run(terminalRacePet.pet_id);
const originalRandom = Math.random;
Math.random = () => 0.99;
let extractResult;
let racingStepResult;
let announceExtractClaim, releaseExtract;
const extractClaimed = new Promise(resolve => { announceExtractClaim = resolve; });
const continueExtract = new Promise(resolve => { releaseExtract = resolve; });
terminalRaceDb.afterFirst = async (sql, args, row) => {
  if (sql.includes('UPDATE telegram_pet_runs') && sql.includes('RETURNING *') && args[0] === 'extracted' && row) {
    announceExtractClaim();
    await continueExtract;
  }
};
try {
  // Pause after the terminal CAS but before payout. This tests the intended
  // overlap without depending on unrelated promise/microtask counts.
  const pendingExtract = processPetRunExtract(terminalRaceDb, 'terminal-race', 'terminal-race-run', { source: 'concurrency_regression' });
  await extractClaimed;
  racingStepResult = await processPetRunStep(terminalRaceDb, 'terminal-race', 'terminal-race-run', 'elite', {
    source: 'concurrency_regression', expected_step_index: 5, event_key: 'terminal-race-step',
  });
  releaseExtract();
  extractResult = await pendingExtract;
} finally {
  releaseExtract();
  terminalRaceDb.afterFirst = null;
  Math.random = originalRandom;
}
assert.equal(extractResult.accepted, true, 'the terminal extraction claim must settle successfully');
assert.equal(racingStepResult.accepted, false, 'a concurrent room completion must not be accepted after terminal extraction claims the run');
assert.equal(racingStepResult.reason, 'run_closed', 'the losing room callback must report the terminal run state');
assert.deepEqual(
  { ...terminalRaceDb.database.prepare(`SELECT status, depth, unbanked_pet_xp, unbanked_moon_gold
    FROM telegram_pet_runs WHERE run_id = 'terminal-race-run'`).get() },
  { status: 'extracted', depth: 4, unbanked_pet_xp: 30, unbanked_moon_gold: 12 },
  'terminal claim and reward snapshot must exclude the losing room callback',
);
assert.equal(terminalRaceDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_steps WHERE run_id = 'terminal-race-run'").get().count, 0,
  'a room callback that loses the terminal race must not persist a run step');
assert.equal(terminalRaceDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE source = 'pet_run_legacy'").get().count, 1,
  'concurrent extract and room callbacks must produce exactly one terminal reward claim');
assert.deepEqual(
  { ...terminalRaceDb.database.prepare("SELECT pet_xp, moon_gold, moon_crystals, style_tokens FROM telegram_pet_instances WHERE pet_id = ?").get(terminalRacePet.pet_id) },
  { pet_xp: 30, moon_gold: 0, moon_crystals: 0, style_tokens: 0 },
  'concurrent extract and room callbacks must award Pet XP only to the atomically claimed pet',
);
assert.deepEqual(
  { ...terminalRaceDb.database.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id = 'terminal-race'").get() },
  { moon_gold: 12, moon_crystals: 1, style_tokens: 2 },
  'concurrent extract and room callbacks must award wallet currencies to the account authority',
);

const terminalStepRecoveryPendingDb = seedRepeatRewardPlayer('terminal-step-recovery-pending', 90);
await ensurePetStarterSeasonSlot(terminalStepRecoveryPendingDb, 'terminal-step-recovery-pending', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(terminalStepRecoveryPendingDb, 'terminal-step-recovery-pending');
const terminalStepRecoveryPendingPet = terminalStepRecoveryPendingDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='terminal-step-recovery-pending'").get();
terminalStepRecoveryPendingDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level, unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items)
  VALUES ('terminal-step-recovery-pending-row', ?, 'terminal-step-recovery-pending', 'terminal-step-recovery-pending-run', 'pet-s2026-003', 'active', 99, 100, 1, 22, 11, 1, 2, '{}')`)
  .run(terminalStepRecoveryPendingPet.pet_id);
const terminalStepRecoveryChoice = buildPetRunChoiceReplyMarkup({ run_id: 'terminal-step-recovery-pending-run', depth: 99, max_depth: 100, risk_level: 1, unbanked_items: '{}' })
  .inline_keyboard[0][0].callback_data.split(':').at(-1);
insertWalletRecoveryRequired(terminalStepRecoveryPendingDb, 'terminal-step-recovery-pending');
const terminalStepPendingRandom = Math.random;
Math.random = () => 0.99;
let frozenTerminalStep;
try {
  frozenTerminalStep = await processPetRunStep(terminalStepRecoveryPendingDb, 'terminal-step-recovery-pending', 'terminal-step-recovery-pending-run', terminalStepRecoveryChoice, {
    event_key: 'terminal-step-recovery-pending-step',
    expected_step_index: 100,
    source: 'terminal_step_recovery_regression',
  });
} finally {
  Math.random = terminalStepPendingRandom;
}
assert.equal(frozenTerminalStep.accepted, false, 'pending wallet recovery must block final run-step reward settlement');
assert.equal(frozenTerminalStep.reason, 'wallet_reconciliation_recovery_pending');
assert.deepEqual(
  { ...terminalStepRecoveryPendingDb.database.prepare("SELECT status, depth, unbanked_moon_gold FROM telegram_pet_runs WHERE run_id='terminal-step-recovery-pending-run'").get() },
  { status: 'active', depth: 99, unbanked_moon_gold: 11 },
  'recovery-pending final step must leave the run recoverable before terminal completion',
);
assert.equal(terminalStepRecoveryPendingDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_steps WHERE run_id='terminal-step-recovery-pending-run'").get().count, 0,
  'recovery-pending final step must not write a duplicate-blocking step receipt');
assert.equal(terminalStepRecoveryPendingDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='terminal-step-recovery-pending' AND source='pet_run_legacy'").get().count, 0,
  'recovery-pending final step must not strand a terminal reward claim');
insertWalletReconciled(terminalStepRecoveryPendingDb, 'terminal-step-recovery-pending');
const terminalStepRecoveredRandom = Math.random;
Math.random = () => 0.99;
let recoveredTerminalStep;
try {
  recoveredTerminalStep = await processPetRunStep(terminalStepRecoveryPendingDb, 'terminal-step-recovery-pending', 'terminal-step-recovery-pending-run', terminalStepRecoveryChoice, {
    event_key: 'terminal-step-recovery-pending-step',
    expected_step_index: 100,
    source: 'terminal_step_recovery_regression',
  });
} finally {
  Math.random = terminalStepRecoveredRandom;
}
assert.equal(recoveredTerminalStep.accepted, true, 'retry after wallet recovery must complete the final run step');
assert.equal(recoveredTerminalStep.reason, 'run_completed');
assert.equal(terminalStepRecoveryPendingDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE run_id='terminal-step-recovery-pending-run'").get().status, 'completed',
  'recovered final step must mark the run completed only after terminal settlement succeeds');
assert.equal(terminalStepRecoveryPendingDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='terminal-step-recovery-pending' AND source='pet_run_legacy'").get().count, 1,
  'recovered final step must create exactly one terminal reward claim');
assert.ok(terminalStepRecoveryPendingDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='terminal-step-recovery-pending'").get().moon_gold >= 11,
  'recovered final step must award the banked wallet reward to account authority');

const terminalStepFailureDb = seedRepeatRewardPlayer('terminal-step-failure', 90);
await ensurePetStarterSeasonSlot(terminalStepFailureDb, 'terminal-step-failure', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(terminalStepFailureDb, 'terminal-step-failure');
const terminalStepFailurePet = terminalStepFailureDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='terminal-step-failure'").get();
terminalStepFailureDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level, unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items)
  VALUES ('terminal-step-failure-row', ?, 'terminal-step-failure', 'terminal-step-failure-run', 'pet-s2026-003', 'active', 99, 100, 1, 18, 7, 0, 1, '{}')`)
  .run(terminalStepFailurePet.pet_id);
insertWalletReconciled(terminalStepFailureDb, 'terminal-step-failure');
const terminalStepFailureChoice = buildPetRunChoiceReplyMarkup({ run_id: 'terminal-step-failure-run', depth: 99, max_depth: 100, risk_level: 1, unbanked_items: '{}' })
  .inline_keyboard[0][0].callback_data.split(':').at(-1);
terminalStepFailureDb.failBatchOnSql(/INSERT OR IGNORE INTO telegram_pet_reward_claims/);
const terminalStepFailureRandom = Math.random;
Math.random = () => 0.99;
try {
  await assert.rejects(
    processPetRunStep(terminalStepFailureDb, 'terminal-step-failure', 'terminal-step-failure-run', terminalStepFailureChoice, {
      event_key: 'terminal-step-failure-step',
      expected_step_index: 100,
      source: 'terminal_step_failure_regression',
    }),
    /simulated_d1_batch_failure/,
    'terminal reward failure after a final step must surface for retry',
  );
} finally {
  Math.random = terminalStepFailureRandom;
}
assert.equal(terminalStepFailureDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='terminal-step-failure' AND source='pet_run_legacy'").get().count, 0,
  'failed terminal reward settlement must not leave an accepted or pending claim');
assert.equal(terminalStepFailureDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='terminal-step-failure'").get().moon_gold, 0,
  'failed terminal reward settlement must leave the account wallet unchanged');
assert.equal(terminalStepFailureDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_steps WHERE run_id='terminal-step-failure-run'").get().count, 1,
  'the final step receipt becomes the deterministic retry record after a post-step terminal failure');
const retryTerminalStepFailureRandom = Math.random;
Math.random = () => 0.99;
let recoveredFailedTerminalStep;
try {
  recoveredFailedTerminalStep = await processPetRunStep(terminalStepFailureDb, 'terminal-step-failure', 'terminal-step-failure-run', terminalStepFailureChoice, {
    event_key: 'terminal-step-failure-step',
    expected_step_index: 100,
    source: 'terminal_step_failure_regression',
  });
} finally {
  Math.random = retryTerminalStepFailureRandom;
}
assert.equal(recoveredFailedTerminalStep.accepted, true, 'duplicate final callback must retry unfinished terminal settlement');
assert.equal(recoveredFailedTerminalStep.reason, 'run_completed');
assert.equal(terminalStepFailureDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE run_id='terminal-step-failure-run'").get().status, 'completed',
  'retried terminal final step must complete the run');
assert.equal(terminalStepFailureDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='terminal-step-failure' AND source='pet_run_legacy'").get().count, 1,
  'retried terminal final step must create exactly one reward claim');
const duplicateRecoveredTerminalStep = await processPetRunStep(terminalStepFailureDb, 'terminal-step-failure', 'terminal-step-failure-run', terminalStepFailureChoice, {
  event_key: 'terminal-step-failure-step',
  expected_step_index: 100,
  source: 'terminal_step_failure_regression',
});
assert.equal(duplicateRecoveredTerminalStep.duplicate, true, 'duplicate final callback after recovery must return the accepted settlement');
assert.equal(terminalStepFailureDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='terminal-step-failure' AND source='pet_run_legacy'").get().count, 1,
  'duplicate final callback after recovery must not duplicate terminal rewards');

const profileOnlyRunDb = seedRepeatRewardPlayer('profile-only-run', 90, new Date().toISOString(), { seedAuthority: false });
const refusedProfileOnlyRun = await startOrResumePetRun(profileOnlyRunDb, 'profile-only-run');
assert.equal(refusedProfileOnlyRun.accepted, false);
assert.equal(refusedProfileOnlyRun.reason, 'active_pet_instance_required', 'new runs must reject profile-only authority');
assert.equal(profileOnlyRunDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_runs WHERE telegram_id='profile-only-run'").get().count, 0);

const legacyRunDb = seedRepeatRewardPlayer('legacy-run-owner', 90);
await ensurePetStarterSeasonSlot(legacyRunDb, 'legacy-run-owner', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(legacyRunDb, 'legacy-run-owner');
const legacyActivePet = legacyRunDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='legacy-run-owner'").get();
legacyRunDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, status, depth, max_depth, unbanked_pet_xp, unbanked_moon_gold)
  VALUES ('legacy-run-row', 'legacy-run-owner', 'legacy-run', 'pet-s2026-003', 'active', 2, 5, 41, 13)`).run();
const refusedLegacyExtraction = await processPetRunExtract(legacyRunDb, 'legacy-run-owner', 'legacy-run');
assert.equal(refusedLegacyExtraction.accepted, false);
assert.equal(refusedLegacyExtraction.reason, 'run_pet_authority_required', 'pre-066 extraction must fail closed without pet_id');
assert.equal(legacyRunDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE run_id='legacy-run'").get().status, 'active');
assert.equal(legacyRunDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='legacy-run-owner'").get().count, 0);
assert.equal(legacyRunDb.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?").get(legacyActivePet.pet_id).pet_xp, 0,
  'missing run authority cannot fall back to the current active pet');

const resumeAuthorityDb = seedRepeatRewardPlayer('resume-authority', 90);
await ensurePetStarterSeasonSlot(resumeAuthorityDb, 'resume-authority', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(resumeAuthorityDb, 'resume-authority');
const resumeOriginalPet = resumeAuthorityDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='resume-authority'").get();
resumeAuthorityDb.database.prepare(`INSERT INTO telegram_pet_runs (id, pet_id, telegram_id, run_id, season_key, status)
  VALUES ('resume-row', ?, 'resume-authority', 'resume-run', 'pet-s2026-003', 'active')`).run(resumeOriginalPet.pet_id);
resumeAuthorityDb.database.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type) VALUES ('resume-second', 'resume-authority', 'pet-s2026-003', 2, 'free')`).run();
resumeAuthorityDb.database.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number, pet_name, source_profile_updated_at)
  VALUES ('resume-second', 'resume-authority', 'pet-s2026-003', 2, 'Second pet', CURRENT_TIMESTAMP)`).run();
resumeAuthorityDb.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='resume-second' WHERE telegram_id='resume-authority'").run();
const resumedAuthorityRun = await startOrResumePetRun(resumeAuthorityDb, 'resume-authority', { run_id: 'resume-run' });
assert.equal(resumedAuthorityRun.accepted, true);
assert.equal(resumedAuthorityRun.pet.pet_id, resumeOriginalPet.pet_id, 'resume must load the run pet rather than the active selector');

const extractRecoveryDb = seedRepeatRewardPlayer('extract-recovery-pending', 90);
await ensurePetStarterSeasonSlot(extractRecoveryDb, 'extract-recovery-pending', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(extractRecoveryDb, 'extract-recovery-pending');
const extractRecoveryPet = extractRecoveryDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='extract-recovery-pending'").get();
extractRecoveryDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level, unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items)
  VALUES ('extract-recovery-pending-row', ?, 'extract-recovery-pending', 'extract-recovery-pending-run', 'pet-s2026-003', 'extractable', 5, 100, 1, 15, 6, 1, 1, '{}')`)
  .run(extractRecoveryPet.pet_id);
insertWalletRecoveryRequired(extractRecoveryDb, 'extract-recovery-pending');
const frozenExtraction = await processPetRunExtract(extractRecoveryDb, 'extract-recovery-pending', 'extract-recovery-pending-run');
assert.equal(frozenExtraction.accepted, false, 'recovery-pending final extraction must block wallet settlement');
assert.equal(frozenExtraction.reason, 'wallet_reconciliation_recovery_pending');
assert.deepEqual(
  { ...extractRecoveryDb.database.prepare("SELECT status, depth FROM telegram_pet_runs WHERE run_id='extract-recovery-pending-run'").get() },
  { status: 'extractable', depth: 5 },
  'recovery-pending extraction must leave terminal state recoverable',
);
assert.equal(extractRecoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='extract-recovery-pending' AND source='pet_run_legacy'").get().count, 0,
  'recovery-pending extraction must not create a stranded terminal claim');
insertWalletReconciled(extractRecoveryDb, 'extract-recovery-pending');
const recoveredExtraction = await processPetRunExtract(extractRecoveryDb, 'extract-recovery-pending', 'extract-recovery-pending-run');
assert.equal(recoveredExtraction.accepted, true, 'extraction retry must settle after wallet recovery resolves');
assert.equal(recoveredExtraction.reason, 'run_extracted');
assert.equal(extractRecoveryDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE run_id='extract-recovery-pending-run'").get().status, 'extracted',
  'resolved extraction must close the run after terminal settlement');
assert.deepEqual(
  { ...extractRecoveryDb.database.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id='extract-recovery-pending'").get() },
  { moon_gold: 6, moon_crystals: 1, style_tokens: 1 },
  'resolved extraction must award banked wallet rewards to account authority',
);
const duplicateRecoveredExtraction = await processPetRunExtract(extractRecoveryDb, 'extract-recovery-pending', 'extract-recovery-pending-run');
assert.equal(duplicateRecoveredExtraction.duplicate, true, 'duplicate extraction after recovery must return accepted settlement');
assert.equal(extractRecoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='extract-recovery-pending' AND source='pet_run_legacy'").get().count, 1,
  'duplicate extraction after recovery must not duplicate terminal wallet rewards');

const terminalRecoveryDb = seedRepeatRewardPlayer('terminal-recovery', 90);
await ensurePetStarterSeasonSlot(terminalRecoveryDb, 'terminal-recovery', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(terminalRecoveryDb, 'terminal-recovery');
const terminalRecoveryPet = terminalRecoveryDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='terminal-recovery'").get();
terminalRecoveryDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level, unbanked_pet_xp, unbanked_moon_gold, unbanked_items)
  VALUES ('terminal-recovery-row', ?, 'terminal-recovery', 'terminal-recovery-run', 'pet-s2026-003', 'active', 2, 5, 1, 24, 9, '{}')`).run(terminalRecoveryPet.pet_id);
terminalRecoveryDb.failOnBatch(1);
await assert.rejects(
  processPetRunExtract(terminalRecoveryDb, 'terminal-recovery', 'terminal-recovery-run'),
  /simulated_d1_batch_failure/,
  'reward failure after the terminal claim must surface for retry',
);
assert.equal(terminalRecoveryDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE run_id = 'terminal-recovery-run'").get().status, 'active',
  'a pre-settlement terminal failure must leave the run recoverable for retry');
assert.equal(terminalRecoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id = 'terminal-recovery'").get().count, 0,
  'a failed reward batch must not leave a partial claim');
const recoveredTerminal = await processPetRunExtract(terminalRecoveryDb, 'terminal-recovery', 'terminal-recovery-run');
assert.equal(recoveredTerminal.accepted, true, 'retrying the same terminal callback must settle its persisted snapshot');
assert.equal(recoveredTerminal.duplicate, false, 'the first successful terminal settlement must not be reported as a duplicate');
const duplicateTerminal = await processPetRunExtract(terminalRecoveryDb, 'terminal-recovery', 'terminal-recovery-run');
assert.equal(duplicateTerminal.duplicate, true, 'a settled terminal callback must remain idempotent');
assert.deepEqual(
  { ...terminalRecoveryDb.database.prepare("SELECT pet_xp, moon_gold FROM telegram_pet_instances WHERE pet_id = ?").get(terminalRecoveryPet.pet_id) },
  { pet_xp: 24, moon_gold: 0 },
  'terminal reward recovery and duplicate callbacks must award Pet XP to the run pet exactly once',
);
assert.deepEqual(
  { ...terminalRecoveryDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'terminal-recovery'").get() },
  { moon_gold: 9 },
  'terminal reward recovery and duplicate callbacks must award wallet currency to the account exactly once',
);

function repeatRewardSnapshot(db, telegramId, mode) {
  const profileRow = db.database.prepare(`
    SELECT pet_xp, moon_gold, moon_crystals, style_tokens, energy, happiness
    FROM telegram_pet_profiles WHERE telegram_id = ?
  `).get(telegramId);
  const instanceRow = db.database.prepare(`
    SELECT i.pet_xp, i.energy, i.happiness
    FROM telegram_pet_active_slots a
    JOIN telegram_pet_instances i ON i.pet_id = a.pet_id AND i.telegram_id = a.telegram_id AND i.season_key = a.season_key
    WHERE a.telegram_id = ?
    LIMIT 1
  `).get(telegramId);
  const userRow = db.database.prepare('SELECT xp, level FROM telegram_users WHERE telegram_id = ?').get(telegramId);
  const eventRow = db.database.prepare(`
    SELECT status, reason, pet_xp_awarded, xp_awarded
    FROM telegram_pet_events
    WHERE telegram_id = ? AND event_type NOT IN ('cap_fixture', 'wallet_reconciliation')
    ORDER BY created_at DESC LIMIT 1
  `).get(telegramId) || null;
  const slotRow = db.database.prepare(`
    SELECT claimed_count FROM telegram_pet_repeat_reward_slots
    WHERE telegram_id = ? AND mode = ? ORDER BY day_key DESC LIMIT 1
  `).get(telegramId, mode) || null;
  const xpLogRow = db.database.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(xp_change), 0) AS total
    FROM telegram_xp_log WHERE telegram_id = ? AND action = 'pet_kaiju_battle'
  `).get(telegramId);
  const seasonRow = db.database.prepare(`
    SELECT COUNT(*) AS rows, COALESCE(SUM(season_xp), 0) AS total
    FROM telegram_pet_season_state WHERE telegram_id = ?
  `).get(telegramId);
  const leaderboardRow = db.database.prepare(`
    SELECT COUNT(*) AS rows, COALESCE(SUM(xp), 0) AS total
    FROM telegram_leaderboard WHERE telegram_id = ?
  `).get(telegramId);
  const profile = {
    ...profileRow,
    pet_xp: instanceRow?.pet_xp ?? profileRow.pet_xp,
    energy: instanceRow?.energy ?? profileRow.energy,
    happiness: instanceRow?.happiness ?? profileRow.happiness,
  };
  const user = { ...userRow };
  const event = eventRow ? { ...eventRow } : null;
  const slot = slotRow ? { ...slotRow } : null;
  const xpLog = { ...xpLogRow };
  const season = { ...seasonRow };
  const leaderboard = { ...leaderboardRow };
  return { profile, user, event, slot, xpLog, season, leaderboard };
}

function seedAcceptedDailyPetEvent(db, telegramId, eventKey, petXp, communityXp = 0, dayKey = new Date().toISOString().slice(0, 10), options = {}) {
  const activePet = options.petScoped
    ? db.database.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = ?').get(telegramId)
    : null;
  db.database.prepare(`
    INSERT INTO telegram_pet_events
      (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status)
    VALUES (?, ?, ?, 'cap_fixture', ?, ?, ?, 'cap-fixture', ?, 'cap-fixture', 'accepted')
  `).run(`fixture-${eventKey}`, activePet?.pet_id || null, telegramId, eventKey, communityXp, petXp, dayKey);
}

const recoveryDayA = new Date('2026-09-27T23:50:00.000Z');
const recoveryDayB = new Date('2026-09-28T00:10:00.000Z');
const recoveryDayAKey = '2026-09-27';
const recoveryDayBKey = '2026-09-28';
const recoveryWeekAKey = '2026-W39';
const recoverySeasonAKey = 'pet-s2026-003';

// Settlement helpers also read the server clock. Advance that clock with the
// request so rounded decay cannot depend on when CI happens to run this case.
const repeatRecoveryRealDate = globalThis.Date;
let repeatRecoveryClock = recoveryDayA.getTime();
globalThis.Date = class extends repeatRecoveryRealDate {
  constructor(...args) { super(...(args.length ? args : [repeatRecoveryClock])); }
  static now() { return repeatRecoveryClock; }
};
const eventRecoveryDb = seedRepeatRewardPlayer('event-recovery', 70, recoveryDayA.toISOString());
seedAcceptedDailyPetEvent(eventRecoveryDb, 'event-recovery', 'event-recovery-day-a-cap', 1199, 0, recoveryDayAKey, { petScoped: true });
eventRecoveryDb.failOnBatch(3);
await assert.rejects(
  processPetRandomEvent(eventRecoveryDb, 'event-recovery', 'leave_it', {
    event_key: 'event-recovery-callback',
    encounter: PET_RANDOM_EVENTS.moon_crate_found,
    now: recoveryDayA,
  }),
  /simulated_d1_batch_failure/,
  'Event finalization failure must surface so the same callback can be retried',
);
const eventAfterFailure = repeatRewardSnapshot(eventRecoveryDb, 'event-recovery', 'event');
assert.equal(eventAfterFailure.event.status, 'pending', 'failed Event finalization must leave a recoverable pending reservation');
assert.equal(eventAfterFailure.event.reason, 'repeat_reward_slot:1', 'failed Event finalization must persist its original reward slot');
assert.equal(eventAfterFailure.slot.claimed_count, 1, 'failed Event finalization must consume exactly one slot');
assert.deepEqual(eventAfterFailure.profile, { pet_xp: 0, moon_gold: 0, moon_crystals: 0, style_tokens: 0, energy: 70, happiness: 70 }, 'failed Event finalization must not partially apply rewards or costs');
eventRecoveryDb.database.prepare(`
  UPDATE telegram_pet_profiles SET last_active_day = ?, streak_days = 9 WHERE telegram_id = ?
`).run(recoveryDayBKey, 'event-recovery');
repeatRecoveryClock = recoveryDayB.getTime();
const recoveredEvent = await processPetRandomEvent(eventRecoveryDb, 'event-recovery', 'leave_it', {
  event_key: 'event-recovery-callback',
  encounter: PET_RANDOM_EVENTS.moon_crate_found,
  now: recoveryDayB,
});
assert.equal(recoveredEvent.accepted, true, 'retrying a failed Event callback must complete its pending reservation');
assert.equal(recoveredEvent.reward_slot, 1, 'Event recovery must reuse the original slot');
assert.deepEqual(recoveredEvent.accounting_window, {
  day_key: recoveryDayAKey,
  week_key: recoveryWeekAKey,
  season_key: recoverySeasonAKey,
}, 'Event recovery must report the original reservation accounting window');
const eventAfterRecovery = repeatRewardSnapshot(eventRecoveryDb, 'event-recovery', 'event');
assert.equal(eventAfterRecovery.event.status, 'accepted', 'Event recovery must finalize the pending reservation');
assert.equal(eventAfterRecovery.slot.claimed_count, 1, 'Event recovery must not consume a second slot');
assert.equal(eventAfterRecovery.profile.pet_xp, 1, 'Event recovery must clamp against the original Day A Pet XP allowance');
assert.deepEqual(
  { ...eventRecoveryDb.database.prepare(`
    SELECT day_key, week_key, season_key FROM telegram_pet_events
    WHERE telegram_id = ? AND event_key = ?
  `).get('event-recovery', 'event-recovery-callback') },
  { day_key: recoveryDayAKey, week_key: recoveryWeekAKey, season_key: recoverySeasonAKey },
  'Event recovery must retain the original day, week, and season accounting keys',
);
assert.equal(eventRecoveryDb.database.prepare(`
  SELECT COALESCE(SUM(pet_xp_awarded), 0) AS total FROM telegram_pet_events
  WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
`).get('event-recovery', recoveryDayAKey).total, 1200, 'Event recovery must credit Day A without exceeding its Pet XP cap');
assert.equal(eventRecoveryDb.database.prepare(`
  SELECT COALESCE(SUM(pet_xp_awarded), 0) AS total FROM telegram_pet_events
  WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
`).get('event-recovery', recoveryDayBKey).total, 0, 'Event recovery must leave the Day B Pet XP cap untouched');
assert.deepEqual(
  { ...eventRecoveryDb.database.prepare('SELECT last_active_day, streak_days FROM telegram_pet_profiles WHERE telegram_id = ?').get('event-recovery') },
  { last_active_day: recoveryDayBKey, streak_days: 9 },
  'Event recovery must not move a newer Day B activity streak back to Day A',
);
const duplicateEvent = await processPetRandomEvent(eventRecoveryDb, 'event-recovery', 'leave_it', {
  event_key: 'event-recovery-callback',
  encounter: PET_RANDOM_EVENTS.moon_crate_found,
  now: recoveryDayB,
});
assert.equal(duplicateEvent.duplicate, true, 'a completed Event callback retry must be idempotent');
assert.deepEqual(repeatRewardSnapshot(eventRecoveryDb, 'event-recovery', 'event'), eventAfterRecovery, 'duplicate Event callback must not change XP, currencies, Energy, or its slot');

const eventPetSwitchDb = seedRepeatRewardPlayer('event-retry-switch', 70, recoveryDayA.toISOString());
const eventRetryPetA = eventPetSwitchDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='event-retry-switch'").get().pet_id;
eventPetSwitchDb.failOnBatch(3);
await assert.rejects(
  processPetRandomEvent(eventPetSwitchDb, 'event-retry-switch', 'flip_it_fast', {
    event_key: 'moon_crate_found-retry-switch',
    encounter: PET_RANDOM_EVENTS.moon_crate_found,
    now: recoveryDayA,
  }),
  /simulated_d1_batch_failure/,
  'first Event settlement can fail after creating a pet-owned pending source row',
);
const eventRetryPetB = seedAndSwitchRepeatRewardPet(eventPetSwitchDb, 'event-retry-switch', 2, 70);
const switchedRetry = await processPetRandomEvent(eventPetSwitchDb, 'event-retry-switch', 'flip_it_fast', {
  event_key: 'moon_crate_found-retry-switch',
  encounter: PET_RANDOM_EVENTS.moon_crate_found,
  now: recoveryDayB,
});
assert.equal(switchedRetry.accepted, true, 'retry after active-pet switching must settle the pending Event');
assert.equal(eventPetSwitchDb.database.prepare("SELECT pet_id FROM telegram_pet_events WHERE event_key='moon_crate_found-retry-switch'").get().pet_id, eventRetryPetA,
  'retry keeps the original Pet A source-event authority');
assert.ok(eventPetSwitchDb.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(eventRetryPetA).pet_xp > 0,
  'retry rewards Pet A after the active pet switches');
assert.equal(eventPetSwitchDb.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(eventRetryPetB).pet_xp, 0,
  'retry does not reward active Pet B');
assert.equal(eventPetSwitchDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='curious'").get(eventRetryPetA).count, 1,
  'retry identity writes land on Pet A');
assert.equal(eventPetSwitchDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=?").get(eventRetryPetB).count, 0,
  'retry identity writes do not land on Pet B');

const legacyPendingEventDb = seedRepeatRewardPlayer('event-legacy-pending', 70, recoveryDayA.toISOString());
const legacyPendingPetB = seedAndSwitchRepeatRewardPet(legacyPendingEventDb, 'event-legacy-pending', 2, 70);
legacyPendingEventDb.database.prepare(`
  INSERT INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
  VALUES ('legacy-pending-random-event', NULL, 'event-legacy-pending', 'random_event', 'moon_crate_found-legacy-pending', 0, 0, ?, ?, ?, 'pending', 'repeat_reward_slot:1', '{}')
`).run(recoverySeasonAKey, recoveryDayAKey, recoveryWeekAKey);
legacyPendingEventDb.database.prepare(`
  INSERT INTO telegram_pet_repeat_reward_slots (telegram_id, day_key, mode, claimed_count)
  VALUES ('event-legacy-pending', ?, 'event', 1)
`).run(recoveryDayAKey);
const legacyPendingRetry = await processPetRandomEvent(legacyPendingEventDb, 'event-legacy-pending', 'flip_it_fast', {
  event_key: 'moon_crate_found-legacy-pending',
  encounter: PET_RANDOM_EVENTS.moon_crate_found,
  now: recoveryDayB,
});
assert.equal(legacyPendingRetry.accepted, false, 'legacy pending Event reservations without pet authority must not settle against the active pet');
assert.equal(legacyPendingRetry.reason, 'legacy_repeat_reward_missing_pet_authority', 'legacy pending Event reservations must resolve with an explicit compatibility reason');
assert.equal(legacyPendingRetry.cancelled, true, 'legacy pending Event reservations must be cancelled instead of staying pending forever');
assert.equal(legacyPendingRetry.released_slot, true, 'legacy pending Event reservations must release their consumed repeat slot');
assert.deepEqual(
  { ...legacyPendingEventDb.database.prepare("SELECT status, reason, pet_id FROM telegram_pet_events WHERE event_key='moon_crate_found-legacy-pending'").get() },
  { status: 'cancelled', reason: 'legacy_repeat_reward_missing_pet_authority', pet_id: null },
  'legacy pending Event rows must be visibly cancelled without inventing pet authority',
);
assert.equal(legacyPendingEventDb.database.prepare(`
  SELECT claimed_count FROM telegram_pet_repeat_reward_slots
  WHERE telegram_id = 'event-legacy-pending' AND day_key = ? AND mode = 'event'
`).get(recoveryDayAKey).claimed_count, 0, 'legacy pending Event cancellation must release the consumed reward slot');
assert.equal(legacyPendingEventDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='event-legacy-pending' AND idempotency_key='moon_crate_found-legacy-pending'").get().count, 0,
  'legacy pending Event cancellation must not create a reward claim');
assert.equal(legacyPendingEventDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=?").get(legacyPendingPetB).count, 0,
  'legacy pending Event cancellation must not write identity rows to the active Pet B');
assert.equal(legacyPendingEventDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE telegram_id='event-legacy-pending'").get().count, 0,
  'legacy pending Event cancellation must not write personality progress without source-event pet authority');
assert.equal(legacyPendingEventDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_memories WHERE telegram_id='event-legacy-pending'").get().count, 0,
  'legacy pending Event cancellation must not write memories without source-event pet authority');
const legacyPendingSecondRetry = await processPetRandomEvent(legacyPendingEventDb, 'event-legacy-pending', 'flip_it_fast', {
  event_key: 'moon_crate_found-legacy-pending',
  encounter: PET_RANDOM_EVENTS.moon_crate_found,
  now: recoveryDayB,
});
assert.equal(legacyPendingSecondRetry.accepted, false, 'cancelled legacy pending Event retries must remain non-accepted');
assert.equal(legacyPendingSecondRetry.duplicate, true, 'cancelled legacy pending Event retries must be idempotent');
assert.equal(legacyPendingSecondRetry.reason, 'legacy_repeat_reward_missing_pet_authority', 'cancelled legacy pending Event retries must keep the compatibility reason');

repeatRecoveryClock = recoveryDayA.getTime();
const kaijuRecoveryDb = seedRepeatRewardPlayer('kaiju-recovery', 50, recoveryDayA.toISOString());
kaijuRecoveryDb.database.exec('DELETE FROM telegram_seasons');
kaijuRecoveryDb.database.prepare(`
  INSERT INTO telegram_seasons (name, start_date, end_date, is_active)
  VALUES ('Day A leaderboard season', '2026-01-01T00:00:00.000Z', '2026-09-27T23:59:59.999Z', 0)
`).run();
const dayALeaderboardSeasonId = kaijuRecoveryDb.database.prepare(`
  SELECT id FROM telegram_seasons WHERE name = 'Day A leaderboard season'
`).get().id;
kaijuRecoveryDb.database.prepare(`
  INSERT INTO telegram_seasons (name, start_date, end_date, is_active)
  VALUES ('Day B active leaderboard season', '2026-09-28T00:00:00.000Z', '2027-12-31T23:59:59.999Z', 1)
`).run();
seedAcceptedDailyPetEvent(kaijuRecoveryDb, 'kaiju-recovery', 'kaiju-recovery-day-a-cap', 1190, 245, recoveryDayAKey, { petScoped: true });
const kaijuMatch = kaijuSourceMatch('kaiju-recovery', 'kaiju-recovery-match');
const kaijuRewards = { pet_xp: 38, community_xp: 8, moon_gold: 18, style_tokens: 1, happiness: 5, energy_cost: 6 };
kaijuRecoveryDb.failOnBatch(3);
await assert.rejects(
  awardPetKaijuPlayerResult(kaijuRecoveryDb, 'kaiju-recovery', kaijuMatch, 'kaiju_win', kaijuRewards, { now: recoveryDayA }),
  /simulated_d1_batch_failure/,
  'Kaiju finalization failure must surface so the same result can be retried',
);
const kaijuAfterFailure = repeatRewardSnapshot(kaijuRecoveryDb, 'kaiju-recovery', 'kaiju');
assert.equal(kaijuAfterFailure.event.status, 'pending', 'failed Kaiju finalization must leave a recoverable pending reservation');
assert.equal(kaijuAfterFailure.event.reason, 'repeat_reward_slot:1:energy_paid:6', 'failed Kaiju finalization must persist its slot and paid Energy');
assert.equal(kaijuAfterFailure.slot.claimed_count, 1, 'failed Kaiju finalization must consume exactly one slot');
assert.deepEqual(kaijuAfterFailure.profile, { pet_xp: 0, moon_gold: 0, moon_crystals: 0, style_tokens: 0, energy: 44, happiness: 70 }, 'failed Kaiju finalization must charge Energy once without partially applying rewards');
assert.deepEqual(kaijuAfterFailure.user, { xp: 0, level: 1 }, 'failed Kaiju finalization must not partially apply Community XP');
kaijuRecoveryDb.database.prepare(`
  UPDATE telegram_pet_profiles SET last_active_day = ?, streak_days = 9 WHERE telegram_id = ?
`).run(recoveryDayBKey, 'kaiju-recovery');
kaijuRecoveryDb.database.prepare('UPDATE telegram_pet_instances SET last_active_day=?,streak_days=9 WHERE telegram_id=?').run(recoveryDayBKey, 'kaiju-recovery');
repeatRecoveryClock = recoveryDayB.getTime();
const recoveredKaiju = await awardPetKaijuPlayerResult(kaijuRecoveryDb, 'kaiju-recovery', kaijuMatch, 'kaiju_win', kaijuRewards, { now: recoveryDayB });
assert.equal(recoveredKaiju.accepted, true, 'retrying a failed Kaiju result must complete its pending reservation');
assert.equal(recoveredKaiju.reward_slot, 1, 'Kaiju recovery must reuse the original slot');
assert.deepEqual(recoveredKaiju.accounting_window, {
  day_key: recoveryDayAKey,
  week_key: recoveryWeekAKey,
  season_key: recoverySeasonAKey,
}, 'Kaiju recovery must report the original reservation accounting window');
const kaijuAfterRecovery = repeatRewardSnapshot(kaijuRecoveryDb, 'kaiju-recovery', 'kaiju');
assert.equal(kaijuAfterRecovery.event.status, 'accepted', 'Kaiju recovery must finalize the pending reservation');
assert.equal(kaijuAfterRecovery.slot.claimed_count, 1, 'Kaiju recovery must not consume a second slot');
assert.deepEqual(kaijuAfterRecovery.profile, { pet_xp: 10, moon_gold: 18, moon_crystals: 0, style_tokens: 1, energy: 43, happiness: 74 }, 'Kaiju recovery must clamp Day A progression and apply currency once without a second Energy charge');
assert.deepEqual(kaijuAfterRecovery.user, { xp: 5, level: 1 }, 'Kaiju recovery must clamp Community XP against the original Day A allowance');
assert.deepEqual(kaijuAfterRecovery.xpLog, { count: 1, total: 5 }, 'Kaiju recovery must write one clamped Community XP audit record');
assert.deepEqual(kaijuAfterRecovery.season, { rows: 1, total: 10 }, 'Kaiju recovery must write the clamped Pet XP once');
assert.deepEqual(kaijuAfterRecovery.leaderboard, { rows: 0, total: 0 }, 'Kaiju recovery must not write Community XP to an inactive historical season');
assert.deepEqual(
  { ...kaijuRecoveryDb.database.prepare(`
    SELECT season_key, daily_key, weekly_key, season_xp, daily_xp, weekly_xp
    FROM telegram_pet_season_state WHERE telegram_id = ?
  `).get('kaiju-recovery') },
  {
    season_key: recoverySeasonAKey,
    daily_key: recoveryDayAKey,
    weekly_key: recoveryWeekAKey,
    season_xp: 10,
    daily_xp: 10,
    weekly_xp: 10,
  },
  'Kaiju recovery must credit the original Day A season and week totals',
);
assert.deepEqual(
  { ...kaijuRecoveryDb.database.prepare(`
    SELECT COALESCE(SUM(pet_xp_awarded), 0) AS pet_xp, COALESCE(SUM(xp_awarded), 0) AS community_xp
    FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
  `).get('kaiju-recovery', recoveryDayAKey) },
  { pet_xp: 1200, community_xp: 250 },
  'Kaiju recovery must credit Day A without exceeding either global XP cap',
);
assert.deepEqual(
  { ...kaijuRecoveryDb.database.prepare(`
    SELECT COALESCE(SUM(pet_xp_awarded), 0) AS pet_xp, COALESCE(SUM(xp_awarded), 0) AS community_xp
    FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
  `).get('kaiju-recovery', recoveryDayBKey) },
  { pet_xp: 0, community_xp: 0 },
  'Kaiju recovery must leave both Day B XP caps untouched',
);
assert.deepEqual(
  { ...kaijuRecoveryDb.database.prepare('SELECT last_active_day, streak_days FROM telegram_pet_profiles WHERE telegram_id = ?').get('kaiju-recovery') },
  { last_active_day: recoveryDayBKey, streak_days: 9 },
  'Kaiju recovery must not move a newer Day B activity streak back to Day A',
);
const duplicateKaiju = await awardPetKaijuPlayerResult(kaijuRecoveryDb, 'kaiju-recovery', kaijuMatch, 'kaiju_win', kaijuRewards, { now: recoveryDayB });
assert.equal(duplicateKaiju.duplicate, true, 'a completed Kaiju result retry must be idempotent');
assert.deepEqual(repeatRewardSnapshot(kaijuRecoveryDb, 'kaiju-recovery', 'kaiju'), kaijuAfterRecovery, 'duplicate Kaiju result must not change XP, currencies, Energy, or its slot');
globalThis.Date = repeatRecoveryRealDate;

function kaijuSourceMatch(telegramId, matchId) {
  return { match_id: matchId, mode: 'solo', score_json: JSON.stringify({ reward_sources: {
    [telegramId]: { pet_id: `pet:${telegramId}:pet-s2026-003:1`, season_key: 'pet-s2026-003', equipment_snapshot: {} },
  } }) };
}

function seedSelectableSoloKaijuMatch(db, telegramId, matchId) {
  db.database.prepare(`
    INSERT INTO telegram_pet_kaiju_matches
      (id, match_id, chat_id, mode, status, player1_telegram_id, player1_card_key, cpu_card_key, category_key, roll)
    VALUES (?, ?, ?, 'solo', 'selecting', ?, ?, ?, ?, 1)
  `).run(
    `row-${matchId}`,
    matchId,
    `chat-${matchId}`,
    telegramId,
    PET_KAIJU_CARDS[0].id,
    PET_KAIJU_CARDS[1].id,
    PET_KAIJU_CATEGORIES[0].key,
  );
  db.database.prepare('UPDATE telegram_pet_kaiju_matches SET score_json=? WHERE match_id=?').run(kaijuSourceMatch(telegramId,matchId).score_json,matchId);
  return { ...db.database.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id = ?').get(matchId) };
}

const completedCallbackRecoveryDb = seedRepeatRewardPlayer('completed-callback-recovery', 50);
const completedCallbackMatch = seedSelectableSoloKaijuMatch(completedCallbackRecoveryDb, 'completed-callback-recovery', 'completed-callback-match');
completedCallbackRecoveryDb.failOnBatch(3);
await assert.rejects(
  finishPetKaijuMatch(completedCallbackRecoveryDb, completedCallbackMatch),
  /simulated_d1_batch_failure/,
  'a Kaiju finalization failure after match completion must surface for callback recovery',
);
assert.equal(
  completedCallbackRecoveryDb.database.prepare('SELECT status FROM telegram_pet_kaiju_matches WHERE match_id = ?').get('completed-callback-match').status,
  'completed',
  'the failure fixture must reproduce a completed match with a pending reward reservation',
);
const completedCallbackPending = repeatRewardSnapshot(completedCallbackRecoveryDb, 'completed-callback-recovery', 'kaiju');
assert.equal(completedCallbackPending.event.status, 'pending', 'completed-match failure must leave a pending Kaiju reward');
assert.equal(completedCallbackPending.slot.claimed_count, 1, 'completed-match failure must retain exactly one reward slot');
const recoveredCompletedCallback = await finishPetKaijuMatch(
  completedCallbackRecoveryDb,
  { ...completedCallbackRecoveryDb.database.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id = ?').get('completed-callback-match') },
);
assert.equal(recoveredCompletedCallback.duplicate, true, 'a completed-match retry must use the recovery path');
assert.equal(recoveredCompletedCallback.reward_results[0].result.accepted, true, 'completed-match retry must settle the pending player reward');
const completedCallbackSettled = repeatRewardSnapshot(completedCallbackRecoveryDb, 'completed-callback-recovery', 'kaiju');
assert.equal(completedCallbackSettled.event.status, 'accepted', 'completed-match callback recovery must finalize the pending reward');
assert.equal(completedCallbackSettled.slot.claimed_count, 1, 'completed-match callback recovery must not consume a second slot');
await finishPetKaijuMatch(
  completedCallbackRecoveryDb,
  { ...completedCallbackRecoveryDb.database.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id = ?').get('completed-callback-match') },
);
assert.deepEqual(repeatRewardSnapshot(completedCallbackRecoveryDb, 'completed-callback-recovery', 'kaiju'), completedCallbackSettled, 'replaying a recovered completed callback must not duplicate rewards or Energy');

const insufficientCompletedDb = seedRepeatRewardPlayer('completed-insufficient', 3);
const insufficientCompletedMatch = seedSelectableSoloKaijuMatch(insufficientCompletedDb, 'completed-insufficient', 'completed-insufficient-match');
const rejectedCompletion = await finishPetKaijuMatch(insufficientCompletedDb, insufficientCompletedMatch);
assert.equal(rejectedCompletion.reward_results[0].result.accepted, false, 'completed Kaiju result must expose a rejected Energy claim');
assert.equal(rejectedCompletion.reward_results[0].result.reason, 'insufficient_energy', 'completed Kaiju result must report insufficient Energy instead of promising rewards');
assert.equal(repeatRewardSnapshot(insufficientCompletedDb, 'completed-insufficient', 'kaiju').event, null, 'insufficient completion must not create a reward reservation');
insufficientCompletedDb.database.prepare('UPDATE telegram_pet_instances SET energy = 50 WHERE telegram_id = ?').run('completed-insufficient');
const restoredEnergyRecovery = await finishPetKaijuMatch(
  insufficientCompletedDb,
  { ...insufficientCompletedDb.database.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id = ?').get('completed-insufficient-match') },
);
assert.equal(restoredEnergyRecovery.reward_results[0].result.accepted, true, 'completed callback must retry reward settlement after Energy is restored');
assert.equal(repeatRewardSnapshot(insufficientCompletedDb, 'completed-insufficient', 'kaiju').event.status, 'accepted', 'restored-Energy retry must finalize the Kaiju reward once');

const insufficientKaijuResultDb = seedRepeatRewardPlayer('kaiju-insufficient', 5);
const insufficientKaijuResult = await awardPetKaijuPlayerResult(
  insufficientKaijuResultDb,
  'kaiju-insufficient',
  kaijuSourceMatch('kaiju-insufficient','kaiju-insufficient-match'),
  'kaiju_win',
  kaijuRewards,
);
assert.equal(insufficientKaijuResult.accepted, false, 'a Kaiju result must be rejected when its Energy cannot be claimed');
assert.equal(insufficientKaijuResult.reason, 'insufficient_energy', 'an unaffordable Kaiju result must report insufficient Energy');
assert.deepEqual(
  repeatRewardSnapshot(insufficientKaijuResultDb, 'kaiju-insufficient', 'kaiju'),
  {
    profile: { pet_xp: 0, moon_gold: 0, moon_crystals: 0, style_tokens: 0, energy: 5, happiness: 70 },
    user: { xp: 0, level: 1 },
    event: null,
    slot: null,
    xpLog: { count: 0, total: 0 },
    season: { rows: 0, total: 0 },
    leaderboard: { rows: 0, total: 0 },
  },
  'insufficient Energy must produce no slot, Energy charge, Pet XP, Community XP, currency, happiness, season XP, or leaderboard XP',
);

const eventCapDb = seedRepeatRewardPlayer('event-cap');
seedAcceptedDailyPetEvent(eventCapDb, 'event-cap', 'prior-event-cap', 1199, 0, new Date().toISOString().slice(0, 10), { petScoped: true });
const cappedEvent = await processPetRandomEvent(eventCapDb, 'event-cap', 'leave_it', {
  event_key: 'event-cap-callback',
  encounter: PET_RANDOM_EVENTS.moon_crate_found,
});
assert.equal(cappedEvent.pet_xp_awarded, 1, 'Event finalization must clamp Pet XP to the remaining 1,200/day allowance');
assert.equal(eventCapDb.database.prepare(`
  SELECT SUM(pet_xp_awarded) AS total FROM telegram_pet_events
  WHERE telegram_id = 'event-cap' AND day_key = ? AND status = 'accepted'
`).get(new Date().toISOString().slice(0, 10)).total, 1200, 'Event rewards must not bypass the global Pet XP cap');

const kaijuCapDb = seedRepeatRewardPlayer('kaiju-cap', 50);
seedAcceptedDailyPetEvent(kaijuCapDb, 'kaiju-cap', 'prior-kaiju-cap', 1190, 245, undefined, { petScoped: true });
const cappedKaiju = await awardPetKaijuPlayerResult(
  kaijuCapDb,
  'kaiju-cap',
  kaijuSourceMatch('kaiju-cap','kaiju-cap-match'),
  'kaiju_win',
  kaijuRewards,
);
assert.equal(cappedKaiju.pet_xp_awarded, 10, 'Kaiju finalization must clamp Pet XP to the remaining 1,200/day allowance');
assert.equal(cappedKaiju.xp_awarded, 5, 'Kaiju finalization must clamp Community XP to the remaining 250/day allowance');
const kaijuCapTotals = kaijuCapDb.database.prepare(`
  SELECT SUM(pet_xp_awarded) AS pet_xp, SUM(xp_awarded) AS community_xp
  FROM telegram_pet_events WHERE telegram_id = 'kaiju-cap' AND day_key = ? AND status = 'accepted'
`).get(new Date().toISOString().slice(0, 10));
assert.deepEqual({ ...kaijuCapTotals }, { pet_xp: 1200, community_xp: 250 }, 'Kaiju rewards must not bypass either global XP cap');

const repeatReservation = asyncBlock('reservePetRepeatRewardEvent');
assert.ok(repeatReservation.includes('const results = await db.batch(statements)'), 'event reservation, slot claim, and Kaiju Energy payment must commit as one D1 batch');
assert.ok(repeatReservation.includes('ON CONFLICT(telegram_id, day_key, mode) DO UPDATE SET') && repeatReservation.includes('claimed_count = claimed_count + 1') && repeatReservation.includes('RETURNING claimed_count'), 'Event and Kaiju slot claims must atomically increment and return the exact counter value');
assert.match(repeatReservation, /SET energy = energy - \?, updated_at = CURRENT_TIMESTAMP\s+WHERE telegram_id = \? AND energy >= \?/, 'Kaiju Energy must be claimed with one conditional update');
assert.ok(repeatReservation.match(/EXISTS \(SELECT 1 FROM telegram_pet_events WHERE id = \? AND status = 'pending'\)/g)?.length >= 2, 'Energy and slot claims must be gated by the newly inserted idempotency reservation');
assert.ok(repeatReservation.includes("SET reason = 'repeat_reward_slot:'") && repeatReservation.includes('RETURNING id, pet_id, status, reason'), 'the exact reward slot, pet authority, and paid Energy must be persisted for retry recovery');
assert.ok(repeatReservation.includes('pet_id, status, reason, day_key, week_key, season_key'), 'pending reservations must load and return their stored pet and accounting authority');
assert.ok(repeatReservation.includes("Number(results[1]?.meta?.changes || 0) !== 1"), 'Kaiju reward authorization must require exactly one changed Energy row');
assert.ok(worker.includes("match(/^repeat_reward_slot:") && worker.includes('resumed: true'), 'pending repeat rewards must resume their original slot without another counter increment or Energy charge');

const randomEventHardening = asyncBlock('processPetRandomEvent');
assert.ok(randomEventHardening.indexOf('getPetProfileWithAtomicDecay') < randomEventHardening.indexOf('reservePetRepeatRewardEvent'), 'Event processing must persist stat decay before reserving or awarding rewards');
assert.ok(randomEventHardening.indexOf('reservePetRepeatRewardEvent') < randomEventHardening.indexOf('pickPetRandomEventOutcome'), 'Event slot must be transactionally claimed before reward outcome calculation');
assert.ok(randomEventHardening.includes('existing_event: duplicate') && randomEventHardening.includes("duplicate.status !== 'pending'"), 'Event retries must resume pending reservations while accepted duplicates remain idempotent');
assert.ok(randomEventHardening.includes('const accountingDayKey = rewardSlot.day_key') && randomEventHardening.includes('accounting_window: { day_key: accountingDayKey'), 'Event recovery must finalize against the stored reservation accounting window');
assert.ok(randomEventHardening.includes('reservation_id: reservation.reservation_id'), 'Event rewards must finalize only their pending idempotency reservation');
assert.ok(randomEventHardening.includes("source: 'pet_event'") && randomEventHardening.includes('day_key: accountingDayKey'), 'Event finalization must preserve caps and its original reservation window through the unified authority');
assert.ok(randomEventHardening.includes('buildPetProfileDeltas(rewardsApplied, costsApplied)'), 'Event hunger costs and recovery must use the centralized negative-stat direction');
assert.ok(!randomEventHardening.includes('savePetProfile(db, pet)'), 'Event rewards must not overwrite concurrent profile changes with a stale full-profile save');

assert.ok(adventure.includes('buildPetProfileDeltas(applied.rewardsApplied, {'), 'Adventure hunger costs and recovery must use the centralized negative-stat direction');
assert.ok(adventure.includes('energy: Number(applied.costsApplied.energy || 0),'), 'Adventure profile deltas must use only the rolled Energy cost');
assert.ok(!adventure.includes('+ adventure.energy_cost'), 'Adventure profile deltas must not charge the base Energy cost a second time');

const kaijuHardening = asyncBlock('awardPetKaijuPlayerResult');
assert.ok(kaijuHardening.indexOf('getPetInstanceWithAtomicDecay') < kaijuHardening.indexOf('reservePetRepeatRewardEvent'), 'Kaiju must persist current stat decay before atomically claiming Energy and a reward slot');
assert.ok(kaijuHardening.indexOf('reservePetRepeatRewardEvent') < kaijuHardening.indexOf('scalePetRewards'), 'Kaiju Energy and slot must be claimed before rewards are calculated');
assert.ok(kaijuHardening.includes('energy_cost: energyCost') && kaijuHardening.includes('existing_event: duplicate'), 'Kaiju retries must resume the original paid reservation without paying Energy twice');
assert.ok(kaijuHardening.includes('day_key: rewardSlotAuthority.day_key') && kaijuHardening.includes('week_key: rewardSlotAuthority.week_key') && kaijuHardening.includes('season_key: rewardSlotAuthority.season_key'), 'Kaiju recovery must finalize caps and season totals through the stored reservation accounting window');
assert.ok(kaijuHardening.includes("reason: 'insufficient_energy'") && kaijuHardening.includes('pet_xp_awarded: 0') && kaijuHardening.includes('xp_awarded: 0'), 'failed Energy claims must return no Pet or Community XP');
assert.ok(kaijuHardening.includes("source: 'pet_kaiju'") && kaijuHardening.includes('reservation_id: reservation.reservation_id'), 'Kaiju finalization must preserve both global XP caps through the unified authority');
assert.ok(!kaijuHardening.includes('awardCommunityXp(db, telegramId, communityXp'), 'Kaiju Community XP must commit in the same recoverable finalization batch');
assert.ok(!kaijuHardening.includes('savePetProfile(db, pet)'), 'Kaiju rewards must not restore spent Energy or overwrite concurrent rewards through a stale save');
assert.ok(!kaijuHardening.includes('finalizationId') && !kaijuHardening.includes('eventWrite'), 'the retired manual Kaiju finalizer must not remain as unreachable source after the central reward return');
assert.ok(worker.includes("INSERT OR IGNORE INTO telegram_pet_events") && worker.includes("'pending', 'repeat_reward_pending'"), 'repeat reward reservations must reuse the unique event key for concurrent idempotency');
const finishKaijuHardening = asyncBlock('finishPetKaijuMatch');
assert.ok(finishKaijuHardening.includes('awardPetKaijuMatchResults(db, match, committed)') && finishKaijuHardening.indexOf('awardPetKaijuMatchResults(db, match, committed)') < finishKaijuHardening.indexOf("reason: duplicate ? 'already_completed'"), 'duplicate Kaiju completion callbacks must recover unfinished player reward reservations');
const kaijuCommandHardening = asyncBlock('cmdPetKaiju');
const completedMatchBranch = kaijuCommandHardening.slice(kaijuCommandHardening.indexOf("if (match.status === 'completed')"), kaijuCommandHardening.indexOf('if (!cardKey)'));
assert.ok(completedMatchBranch.includes('finishPetKaijuMatch(db, match)') && completedMatchBranch.includes('formatPetKaijuResult(recovered)'), 'normal completed card callbacks must invoke pending reward recovery and report its settlement result');
const kaijuResultFormatter = worker.slice(worker.indexOf('function formatPetKaijuResult'), worker.indexOf('async function cmdPetKaiju'));
assert.ok(kaijuResultFormatter.includes("award.reason === 'insufficient_energy'") && kaijuResultFormatter.includes('no Pet XP, Community XP, currency or progression reward'), 'Kaiju completion output must not advertise rewards when Energy authorization was rejected');

console.log('telegram-pets-api.test.mjs passed');
