import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import moonboysApiWorker, { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const liveSystemsSource = fs.readFileSync(new URL('../workers/moonboys-api/pets/live-systems.js', import.meta.url), 'utf8');
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
  normalizePetCooldownWindow,
  buildPetCooldownFromSeconds,
  buildPetMiniAppCooldownSummary,
  sumPetArenaGearPower,
  scalePetArenaRewardsForPlayer,
  getPetArenaBucketDistance,
  serializePet,
  serializePetLeaderboardEntry,
  materializePetLeaderboardRows,
  formatPetStatus,
  formatPetDetails,
  petReplyMarkup,
  buildPetAdventureMenuReplyMarkup,
  buildPetManagementMenuReplyMarkup,
  buildPetProgressMenuReplyMarkup,
  normalizePetActivityType,
  computePetActivityRewards,
  getPetEconomyState,
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
const activityRouteSource = worker.slice(worker.indexOf("path === '/telegram-pets/activity'"), worker.indexOf("path === '/telegram-pets/leaderboard'"));
assert.ok(!activityRouteSource.includes('e.event_type <> ?') && activityRouteSource.includes('e.event_key <> ?') && activityRouteSource.includes('PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY'),
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
  pet_name: 'Cipher',
  stage: 'graffiti_guardian',
  phase: 'rare',
  species_id: 'neon_raccoon',
  species_name: 'Neon Raccoon',
  rare_morph_id: 'graffiti_guardian',
  rare_morph_name: 'Graffiti Guardian',
  level: 19,
  pet_xp: 4242,
  moon_gold: 777,
  moon_crystals: 23,
  style_tokens: 41,
  streak_days: 9,
}, 'leaderboard serializer must carry lifecycle identity and all persisted Moonpet currencies');
const eggLeaderboardEntry = serializePetLeaderboardEntry({
  pet_name: 'Unhatched',
  lifecycle_phase: 'egg',
  lifecycle_species_id: 'alley_drake',
  moon_gold: 10,
  moon_crystals: 2,
  style_tokens: 1,
}, 0);
assert.equal(eggLeaderboardEntry.species_id, null, 'leaderboard must not reveal an egg species');
assert.equal(eggLeaderboardEntry.species_name, null, 'leaderboard must not reveal an egg species name');
assert.match(worker, /display_name: \[row\.first_name, row\.last_name\][\s\S]*'Anonymous'/, 'public pet leaderboard must never fall back to a Telegram ID');
assert.match(worker, /MOONPET_SPECIES, createMoonEggLifecycle, ensureMoonpetLifecycle,/, 'legacy lifecycle materialization dependency must be imported');
assert.match(worker, /async function materializePetLeaderboardRows/, 'leaderboards must materialize deterministic identities for legacy rows');
assert.match(worker, /pet_mini_app_state_failed/, 'Mini App state failures must return a controlled JSON error instead of an uncaught fetch failure');
const miniAppStateBuilder = asyncBlock('buildPetMiniAppState');
assert.match(miniAppStateBuilder, /SELECT p\.telegram_id, p\.pet_name,/, 'Mini App leaderboard must select the owner ID needed to materialize legacy lifecycle rows');
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
assert.ok(petLeaderboardRoute.includes('LEFT JOIN telegram_pet_lifecycle_by_pet l'), 'public leaderboard must join persisted Moonpet lifecycle');
for (const field of ['moon_gold', 'moon_crystals', 'style_tokens', 'lifecycle_phase', 'lifecycle_species_id', 'rare_morph_id']) {
  assert.ok(petLeaderboardRoute.includes(field), `public leaderboard must return ${field}`);
}

assert.ok(worker.includes("case 'petarena'"), '/petarena command must exist');
assert.ok(worker.includes("callback_data: 'pet:arena'"), 'pet menu must include Arena button');
assert.ok(worker.includes('Pet Arena unlocks at level 10. Keep growing your Moonpet.'), 'level <10 blocked copy must be exact');
assert.ok(worker.includes('PET_ARENA_MIN_LEVEL = 10'), 'level 10+ can enter Pet Arena');
assert.ok(worker.includes("createPetArenaBattle(db, chatId, pet, appPet, 'app')"), 'private app battle works');
assert.ok(!worker.includes('const done = await completePetArenaBattle(db, battle); await sendTelegramMessage(tok, chatId, formatPetArenaResult(done.battle || battle)); return;'), 'App battle does not instantly complete on create.');
assert.ok(worker.includes('selectPetArenaAppMove(battle)'), 'App battle advances after player move and app AI move.');
assert.ok(worker.includes("Move locked. Waiting for opponent."), 'Group battle waits for both move locks.');
assert.ok(worker.includes("Stale Pet Arena move. Choose from the latest round prompt."), 'Stale round move callbacks are rejected.');
assert.ok(worker.includes("reason:'stale_arena_round'"), 'stale app callbacks reject by callback round mismatch.');
assert.ok(worker.includes('Number(expectedRound || 0) !== roundNumber'), 'stale group callbacks reject by active battle round mismatch.');
assert.ok(worker.includes("reason:'move_already_locked'"), 'Duplicate move callbacks do not double-apply damage.');
assert.ok(worker.includes('forfeitPetArenaBattle'), 'Forfeit resolves safely.');
assert.ok(worker.includes("!['readying','active'].includes(String(battle.status))"), 'stale forfeit after completed battle is rejected before mutation.');
assert.ok(worker.includes("WHERE battle_id=? AND status IN ('readying','active')"), 'forfeit update only claims live battles and cannot rewrite completed winner/result/HP.');
assert.ok(worker.includes("Number(claim?.meta?.changes || 0) <= 0) return { accepted:true, duplicate:true, reason:'already_completed'"), 'stale forfeit with zero changed rows is treated as duplicate and does not award again.');
assert.ok(worker.indexOf("Number(claim?.meta?.changes || 0) <= 0") < worker.indexOf('return completePetArenaBattle(db, await getPetArenaBattle(db, battle.battle_id));', worker.indexOf('async function forfeitPetArenaBattle')), 'forfeit calls completePetArenaBattle only after claiming a live battle.');
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
}, null, { current_stage: { name: 'Moon Egg' } });
for (const copy of [
  '🥚 <b>Moon Egg</b>',
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
assert.ok(petAction.includes('awardCommunityXp'), 'pet action must award through shared Community XP helper');
assert.ok(petAction.includes("if (existing) {"), 'pet action must short-circuit duplicate event keys first');
assert.ok(petAction.includes('updatePetStreakForAction(pet, dayKey)'), 'accepted pet actions must update streaks before saving the active day');
assert.ok(petAction.includes('const actionHasWalletReward = hasPetAccountWalletDelta(tokenRewards)'),
  'pet actions must detect wallet movement before applying recovery guards');
assert.ok(petAction.includes("${actionHasWalletReward ? accountWalletRecoveryResolvedSql('?') : '1 = 1'}"),
  'pet-only actions must not be blocked by account-wallet recovery SQL');
assert.ok(petAction.includes('const persistedPet = await getPetProfile(db, telegramId)'),
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
  'const pet = await getPetProfile(db, telegramId);',
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
assert.ok(dailyChest.includes('getPetWindowTotals(db, telegramId, dayKey, weekKey)'), 'daily chest pet XP must check existing daily totals before awarding');
assert.ok(dailyChest.includes('totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP'), 'daily chest must award 0 pet XP when the daily cap is already reached');
assert.ok(dailyChest.includes('totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP'), 'daily chest must clamp pet XP against prior daily pet XP');
assert.ok(dailyChest.includes("reason: 'wallet_reconciliation_recovery_pending'"), 'daily chest must freeze wallet credits while historical recovery is pending');
assert.ok(dailyChest.includes('const persistedPet = await getPetProfile(db, telegramId)'),
  'daily chest success responses must reload persisted state');
assertOrder(
  dailyChest,
  'const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);',
  'pet.pet_xp = Math.max(0',
  'daily chest must cap pet XP before mutating the pet'
);

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
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'const pet = await getPetProfile(db, telegramId);',
  'adventures must check duplicate event keys before loading the pet'
);
assertOrder(
  adventure,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'if (clampPetStat(pet.energy) < adventure.energy_cost) return { accepted: false, reason: \'pet_tired\', encounter, choice, adventure, pet };',
  'adventures must check duplicate event keys before energy spend'
);
assertOrder(
  adventure,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'const lastAdventure = await db.prepare(`',
  'adventures must check duplicate event keys before the cooldown lookup'
);

const runStep = asyncBlock('processPetRunStep');
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

const inventoryRoute = routeBlock('/telegram-pets/inventory');
assert.ok(inventoryRoute.includes('getPetInventory(env.DB, telegramId)'), 'GET /telegram-pets/inventory must expose bag contents');

const shopRoute = routeBlock('/telegram-pets/shop');
assert.ok(shopRoute.includes('usable_items'), 'GET /telegram-pets/shop must expose usable items');
assert.ok(shopRoute.includes('jobs'), 'GET /telegram-pets/shop must expose jobs');

const petStatus = asyncBlock('cmdPetStatus');
assert.ok(petStatus.includes('getPetProfile(db, telegramId)'), '/pet status command must use read-only pet lookup');
assert.ok(!petStatus.includes('getOrCreatePetProfile'), '/pet status command must not create pets');
assert.ok(worker.includes('function formatPetStatus(pet, identity = null'), 'formatPetStatus must exist');
const statusFormatter = worker.slice(worker.indexOf('function formatPetStatus(pet, identity = null'), worker.indexOf('function formatPetDetails'));
const redesignedStatus = formatPetStatus({ ...baseArenaPet, pet_name: 'Moonpet', pet_xp: 3887, health: 9, hunger: 100, happiness: 4, cleanliness: 32, energy: 0 }, {
  current_stage: { name: 'Legendary Companion' },
  personalities: [{ name: 'Curious' }, { name: 'Explorer' }],
  memories: { favourite_activity: 'Adventure' },
});
for (const label of ['Moonpet', 'Legendary Companion', 'Health', 'Hunger', 'Happiness', 'Cleanliness', 'Energy', 'Needs attention', 'Curious', 'Explorer', 'Adventure']) {
  assert.ok(redesignedStatus.includes(label), `/pet default response must include ${label}`);
}
for (const removed of ['Wallet', 'Equipment', 'Daily Missions', 'Low health: urgent care needed']) {
  assert.ok(!redesignedStatus.includes(removed), `/pet default response must move ${removed} into Details`);
}
assert.match(redesignedStatus, /❤️ Health\n█░{9} 9%/, 'health must use a compact Telegram block bar');
assert.match(redesignedStatus, /🍖 Hunger\n█{10} 100%/, 'hunger must use a compact Telegram block bar');
assert.match(redesignedStatus, /⚡ Energy\n░{10} 0%/, 'zero energy must render an empty block bar');
assert.ok(redesignedStatus.length < 800, '/pet default response must fit comfortably in one mobile viewport');

assert.ok(worker.includes('formatPetBlockedCopy(kind, reason, extra = {})'), 'blocked copy helper must exist');
for (const message of ['Moonpet is too tired for a', 'Moonpet needs a short break before another', 'You need a Moonpet first', 'not available right now']) {
  assert.ok(worker.includes(message), `blocked copy helper must include ${message}`);
}

const petUse = asyncBlock('cmdPetUse');
assert.ok(petUse.includes('processPetUseItem'), '/petuse command must route to processPetUseItem');
assert.ok(petUse.includes('eventKey = null'), '/petuse command must accept optional eventKey');
assert.ok(petUse.includes("event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'petuse'"), '/petuse command must use stable text keys');
assert.ok(petUse.includes('formatPetBlockedCopy('), '/petuse command must use friendly blocked copy');
assert.ok(petUse.includes('if (result.duplicate)'), '/petuse command must guard duplicate button taps');
assert.ok(petUse.includes('buildPetBagReplyMarkup(inventory)'), '/petuse command must keep bag item buttons after item use');

const petWork = asyncBlock('cmdPetWork');
assert.ok(petWork.includes('processPetJob'), '/petwork command must route to processPetJob');
assert.ok(petWork.includes('callback_data: `pet:work:${job.key}`'), '/petwork menu buttons must remain interactive');
assert.ok(petWork.includes('eventKey = null'), '/petwork command must accept optional eventKey');
assert.ok(petWork.includes("event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'petwork', jobKey])"), '/petwork command must use stable text keys');
assert.ok(petWork.includes('formatPetBlockedCopy('), '/petwork command must use friendly blocked copy');

const petDaily = asyncBlock('cmdPetDaily');
assert.ok(petDaily.includes('processPetDailyChest'), '/petdaily command must route to processPetDailyChest');
assert.ok(petDaily.includes('eventKey = null'), '/petdaily command must accept optional eventKey');
assert.ok(petDaily.includes('dayKey = getPetDayKey(new Date())'), '/petdaily command must include the UTC day in the fallback key');
assert.ok(petDaily.includes("event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'daily', dayKey])"), '/petdaily command must day-scope text retries');
assert.ok(petDaily.includes('formatPetBlockedCopy('), '/petdaily command must use friendly blocked copy');

for (const [command, label] of [
  ['cmdPetStatus', '/pet'],
  ['cmdPetAction', 'Feed and care actions'],
  ['cmdPetWork', 'Work'],
  ['cmdPetEvent', 'Event'],
  ['cmdPetRun', 'Run'],
]) {
  assert.ok(asyncBlock(command).includes('getMoonpetIdentityWithLifecycle(db, telegramId)'), `${label} status must retain stored Moonpet identity`);
}
for (const command of ['cmdPetUse', 'cmdPetDaily', 'cmdPetClaim', 'cmdPetTrade', 'cmdPetExtract']) {
  assert.ok(asyncBlock(command).includes('getMoonpetIdentityWithLifecycle(db, telegramId)'), `${command} status must pass identity instead of missions`);
}
assert.ok(!worker.includes('formatPetStatus(result.pet, await buildPetMissions(db, telegramId))'), 'missions must never be passed into the formatPetStatus identity parameter');
assert.ok(asyncBlock('cmdPetDetails').includes('buildPetMissions(db, telegramId)'), 'missions must remain available in the separate Details response');
const petMissionsCommand = asyncBlock('cmdPetMissions');
assert.ok(petMissionsCommand.includes('buildPetMissions(db, telegramId)'), '/petmissions functionality must remain intact');
assert.ok(petMissionsCommand.includes('buildPetProgressMenuReplyMarkup()'), '/petmissions must return players to Progress');
const petActivityCommand = asyncBlock('cmdPetActivity');
assert.ok(petActivityCommand.includes("callback_data: 'pet:start:sleep'"), '/petactivity must expose timed activity choices');
assert.ok(petActivityCommand.includes("callback_data: 'pet:back'"), '/petactivity must provide Back navigation');
assert.ok(asyncBlock('cmdPetStart').includes("callback_data: 'pet:back'"), 'started activities must allow navigation back without cancelling');
assert.ok(asyncBlock('cmdPetCancel').includes('petReplyMarkup()'), 'activity cancellation must return the main dashboard');

const petEvent = asyncBlock('cmdPetEvent');
assert.ok(petEvent.includes('selectPetRandomEncounter'), '/petevent command must show a random encounter');
assert.ok(petEvent.includes('buildPetRandomEventReplyMarkup'), '/petevent command must render encounter buttons');
assert.ok(petEvent.includes('formatPetRandomEventSummary'), '/petevent command must render encounter results');
assert.ok(petEvent.includes('processPetRandomEvent'), '/petevent command must still resolve encounter choices');
assert.ok(!petEvent.includes('Event resolved:'), '/petevent command must not use the old single-step result copy');

const petAdventure = asyncBlock('cmdPetAdventure');
assert.ok(petAdventure.includes('eventKey = null'), '/petadventure command must accept an optional eventKey');
assert.ok(petAdventure.includes('cmdPetRun'), '/petadventure command must alias into Pet Run Engine');
assert.ok(petAdventure.includes('void argStr;'), '/petadventure must not treat legacy adventure args as run ids');
assert.ok(petAdventure.includes("cmdPetRun(db, tok, chatId, telegramId, '', eventKey)"), '/petadventure must open or resume the Pet Run Engine');
assert.ok(!petAdventure.includes('Adventure Complete'), '/petadventure command must not emit the old instant-complete copy');
assert.ok(worker.includes('callback_data: `pet:adventure:${encounter.key}:${choice.key}`'), 'legacy adventure buttons must carry encounter and choice keys');
assert.ok(worker.includes('callback_data: `pet:run:${run.run_id}:step:${Math.max(0, Number(run.depth || 0)) + 1}:${choice.key}`'), 'run buttons must carry run id, step, and choice keys');

const petRun = asyncBlock('cmdPetRun');
assert.ok(petRun.includes('startOrResumePetRun'), '/petrun command must start or resume runs');
assert.ok(petRun.includes('processPetRunStep'), '/petrun command must resolve run choices');
assert.ok(petRun.includes('buildPetRunChoiceReplyMarkup'), '/petrun command must render 3-choice run buttons');
assert.ok(petRun.includes('buildPetRunAfterStepReplyMarkup'), '/petrun command must render Extract and Push Deeper after a step');
assert.ok(petRun.includes('buildPetRunStepEventKey'), '/petrun command must use stable run step keys');
assert.ok(petRun.includes('expectedStepIndex = null'), 'text /petrun path must keep callback step enforcement optional');
assert.ok(petRun.includes('expected_step_index: expectedStepIndex'), '/petrun callback path must pass expected step index into run step processing');
assert.ok(petRun.includes('That run button was already handled'), '/petrun command must guard duplicate taps');

const petExtract = asyncBlock('cmdPetExtract');
assert.ok(petExtract.includes('processPetRunExtract'), '/petextract command must route to run extract banking');
assert.ok(petExtract.includes('formatPetRunBankSummary'), '/petextract command must render banked rewards');
assert.ok(petExtract.includes('That extract was already banked'), '/petextract command must guard duplicate extracts');

const petShop = asyncBlock('cmdPetShop');
assert.ok(petShop.includes('buildPetShopReplyMarkup(items)'), '/petshop command must render clickable shop buttons');
assert.ok(worker.includes('function buildPetShopReplyMarkup'), 'shop must have a dedicated reply markup builder');
assert.ok(worker.includes('callback_data: `pet:buy:${item.key}`'), 'shop item buttons must carry item buy callbacks');

const petBuy = asyncBlock('cmdPetBuy');
assert.ok(petBuy.includes('eventKey = null'), '/petbuy command must accept an optional eventKey');
assert.ok(petBuy.includes("event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'buy', itemKey, 'msg'])"), '/petbuy command must use callback/message event keys before fallback keys');
assert.ok(petBuy.includes('if (result.duplicate)'), '/petbuy command must guard duplicate button taps');
assert.ok(petBuy.includes('Next upgrade run'), '/petbuy command must present post-purchase roguelite options');
assert.ok(petBuy.includes('buildPetPurchaseNextReplyMarkup(result.pet)'), '/petbuy command must keep chaining upgrade/grind choices after purchase');

const petBagCommand = asyncBlock('cmdPetBag');
assert.ok(petBagCommand.includes('getPetInventory(db, telegramId)'), '/petbag command must show the inventory');
assert.ok(petBagCommand.includes('buildPetBagReplyMarkup(inventory)'), '/petbag command must render clickable bag buttons');
assert.ok(worker.includes('function buildPetBagReplyMarkup'), 'bag must have a dedicated reply markup builder');
assert.ok(worker.includes('callback_data: `pet:use:${item.key}`'), 'bag item buttons must carry item use callbacks');
assert.ok(worker.includes('function buildPetPurchaseNextReplyMarkup'), 'purchase complete must have a dedicated next-choice builder');

const mainButtons = petReplyMarkup().inline_keyboard.flat();
assert.deepEqual(mainButtons.map((button) => button.text), ['🍖 Feed', '🎮 Play', '🧼 Clean', '😴 Sleep', '🏋️ Train', '⚔️ Adventure', '⏱ Activities', '⚙️ Management', '🧭 Coach', '📋 Details'], '/pet must expose care actions, guidance and the three primary navigation areas');
assert.equal(mainButtons.find((button) => button.text.includes('Train'))?.callback_data, 'pet:train', 'Train must invoke the existing pet action callback');
assert.equal(mainButtons.find((button) => button.text.includes('Activities'))?.callback_data, 'pet:activity', 'Activities must open timed activities');
assert.equal(mainButtons.find((button) => button.text.includes('Management'))?.callback_data, 'pet:menu:management', 'Management must be reachable from /pet');
for (const removed of ['Work', 'Events', 'Daily', 'Kaiju', 'Arena', 'Run', 'Claim', 'Cancel', 'How To Play', 'Leaderboard', 'Bag', 'Shop']) assert.ok(!mainButtons.some((button) => button.text.includes(removed)), `/pet main buttons must hide ${removed}`);

const menuCases = [
  ['Adventure', buildPetAdventureMenuReplyMarkup(), ['Moon Run', 'Pet Jobs', 'Random Events', 'Kaiju', 'Arena', 'Daily']],
  ['Management', buildPetManagementMenuReplyMarkup(), ['Bag', 'Shop', 'Equipment', 'Trade']],
  ['Progress', buildPetProgressMenuReplyMarkup(), ['Recommended Next Move', 'Details', 'Missions', 'Evolution', 'Personality', 'Memories', 'Achievements', 'Season Rewards', 'Leaderboard', 'Streak']],
];
for (const [name, markup, labels] of menuCases) {
  const buttons = markup.inline_keyboard.flat();
  for (const label of labels) assert.ok(buttons.some((button) => button.text.includes(label)), `${name} submenu must include ${label}`);
  assert.ok(buttons.some((button) => button.callback_data === 'pet:back'), `${name} submenu must include Back navigation`);
  for (const button of buttons.filter((entry) => entry.callback_data)) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64, `${name} callback too long: ${button.callback_data}`);
}
for (const callback of ['pet:activity', 'pet:missions', 'pet:work', 'pet:event', 'pet:daily', 'pet:kaiju', 'pet:arena', 'pet:run', 'pet:shop', 'pet:bag']) assert.ok(worker.includes(callback), `existing command must remain reachable through ${callback}`);
for (const obsolete of [
  "text: '🌕 Pet Menu', callback_data: 'pet:bag'",
  "text: 'Pet Menu', callback_data: 'pet:bag'",
  "text: 'Back', callback_data: 'pet:bag'",
  "text: 'Pet Status', callback_data: 'pet:bag'",
  "text: 'Boss Cleared', callback_data: 'pet:bag'",
]) assert.ok(!worker.includes(obsolete), `misleading navigation must be removed: ${obsolete}`);
assert.ok(worker.includes("text: '🌕 Pet Status', callback_data: 'pet:back'"), 'Moon Run Pet Status must return to /pet');
assert.ok(worker.includes("text: '⬅️ Adventure', callback_data: 'pet:menu:adventure'"), 'adventure features must navigate back to Adventure');
const petReply = worker.slice(worker.indexOf('function petReplyMarkup()'), worker.indexOf('async function cmdPetMenu'));
assert.ok(!statusFormatter.includes('??'), 'formatPetStatus must not contain placeholder question marks');
assert.ok(!petReply.includes('??'), 'petReplyMarkup must not contain placeholder question marks');
assert.ok(!worker.includes('??? Train'), 'telegram pet UI must not contain the old Train placeholder');

const callbackBranch = worker.slice(worker.indexOf('if (update.callback_query)'), worker.indexOf('// Group-level events'));
assert.ok(callbackBranch.includes("if (payload === 'back')") && callbackBranch.includes('cmdPetStatus(db, tok, chatId, telegramId)'), 'Back callbacks must return to the simplified /pet screen');
for (const route of ["payload === 'menu:adventure'", "payload === 'menu:management'", "payload === 'menu:progress'", "payload === 'details'", "payload === 'missions'", "payload === 'activity'", "payload === 'equipment'", "payload === 'trade'", "payload.startsWith('identity:')", "payload === 'leaderboard'", "payload === 'streak'"]) {
  assert.ok(callbackBranch.includes(route), `callback router must preserve grouped navigation route: ${route}`);
}
assert.ok(
  callbackBranch.includes("const telegramId = String(query.from?.id || '');"),
  'pet:adventure callback must use callback_query.from.id as telegramId'
);
assert.ok(
  callbackBranch.includes("const chatId = String(query.message?.chat?.id || '');"),
  'callback chat id must only be used for reply targeting'
);
assert.ok(
  !callbackBranch.includes('query.message?.chat?.id || telegramId'),
  'pet:adventure callback must not fall back to chat id when resolving telegram identity'
);
assert.ok(
  callbackBranch.includes("await cmdPetRun(db, tok, chatId, telegramId, '', eventKey);"),
  'pet:adventure callback must open the Pet Run Engine'
);
assert.ok(callbackBranch.includes("if (payload.startsWith('adventure:'))"), 'legacy adventure choice callbacks must still be recognized');
assert.ok(!callbackBranch.includes('const adventureParts = adventurePayload.split(\':\');'), 'legacy adventure callbacks must not parse encounter keys into run ids');
assert.ok(!callbackBranch.includes('await cmdPetAdventure(db, tok, chatId, telegramId, `${encounterKey}:${choice}`, eventKey);'), 'legacy adventure callbacks must not pass encounter keys to cmdPetRun');
assert.ok(callbackBranch.includes("await cmdPetRun(db, tok, chatId, telegramId, '', eventKey);"), 'pet:run callback must open the run loop');
assert.ok(callbackBranch.includes("if (payload === 'kaiju')"), 'pet:kaiju callback must open Kaiju Sticker Battle');
assert.ok(callbackBranch.includes("if (payload.startsWith('kaiju:'))"), 'pet:kaiju:* callbacks must route Kaiju actions');
assert.ok(callbackBranch.includes("await cmdPetKaiju(db, tok, chatId, telegramId, kaijuPayload, chatType, fromUser, eventKey);"), 'Kaiju callbacks must forward stable callback event keys and chat type');
assert.ok(worker.includes('Card locked for <code>${escapeHtml(telegramId)}</code>. Waiting for the other player.'), 'Kaiju card lock waiting message must not reveal card names before both players lock');
assert.ok(!worker.includes('Card locked: ${escapeHtml(getPetKaijuCard(cardKey)?.name || cardKey)}'), 'Kaiju waiting message must not leak selected card names');
assert.ok(worker.includes("AND player1_card_key IS NULL"), 'Kaiju player 1 card choice must be immutable after first lock');
assert.ok(worker.includes("AND player2_card_key IS NULL"), 'Kaiju player 2 card choice must be immutable after first lock');
assert.ok(worker.includes('Card already locked for <code>${escapeHtml(telegramId)}</code>. Waiting for the other player.'), 'Kaiju duplicate card taps must get an already-locked response');
assert.ok(worker.includes("score?.result === 'player2_win' && opponent.telegram_id === 'app'"), 'Kaiju solo app wins must render as an app win instead of a draw');
assert.ok(worker.includes('roll = CASE WHEN roll IS NULL OR roll = 0 THEN ? ELSE roll END'), 'Kaiju rolled category number must persist even when the default roll is 0');
assert.ok(worker.includes("joinResult?.meta?.changes"), 'Kaiju join race handling must check update changes before announcing players');
assert.ok(worker.includes('async function getFreshPetKaijuMatch'), 'Kaiju callbacks must expire stale matches before acting');
assert.ok(worker.includes("WHERE match_id = ? AND status IN ('open', 'selecting') AND updated_at < datetime('now', ?)"), 'Kaiju stale callback handling must cancel expired open/selecting matches by match id');
assert.ok(worker.includes('This Kaiju table expired. Tap Kaiju or run /petkaiju to start a fresh battle.'), 'Kaiju stale Join/Start/Card callbacks must return a clear expired-table message');
assert.ok(worker.includes('const freshMatch = await getFreshPetKaijuMatch(db, args[0]);'), 'Kaiju join/cpu/card actions must read through the fresh match helper');
assert.ok(worker.includes('const completionResult = await db.prepare'), 'Kaiju completion must capture the status update result before awarding');
assert.ok(worker.includes("reason: 'already_completed'"), 'Kaiju duplicate finish attempts must return an already-completed result');
assert.ok(worker.includes('Number(completionResult.meta.changes || 0) <= 0'), 'Kaiju duplicate finish attempts must skip rewards when the completion update no-ops');
assert.ok(callbackBranch.includes('const stableRunEventKey = buildPetRunExtractEventKey(telegramId, runId);'), 'run extract callbacks must use stable run extract keys');
assert.ok(callbackBranch.includes('const stableRunEventKey = buildPetRunStepEventKey(telegramId, runId, stepIndex, choiceKey);'), 'run step callbacks must use stable run step keys');
assert.ok(callbackBranch.includes('await cmdPetRun(db, tok, chatId, telegramId, `${runId}:${choiceKey}`, stableRunEventKey, stepIndex);'), 'run step callbacks must pass the callback step index through to cmdPetRun');
for (const call of [
  "await cmdPetWork(db, tok, chatId, telegramId, '', eventKey);",
  "await cmdPetWork(db, tok, chatId, telegramId, jobKey, eventKey);",
  "await cmdPetBuy(db, tok, chatId, telegramId, itemKey, eventKey);",
  "await cmdPetUse(db, tok, chatId, telegramId, itemKey, eventKey);",
  "await cmdPetDaily(db, tok, chatId, telegramId, eventKey);",
  "await cmdPetEvent(db, tok, chatId, telegramId, '', eventKey);",
  "const eventParts = eventPayload.split(':');",
  "const encounterKey = eventParts.join(':');",
  "await cmdPetEvent(db, tok, chatId, telegramId, choice, encounterKey);",
  "if (payload.startsWith('adventure:')) {",
  "await cmdPetRun(db, tok, chatId, telegramId, '', eventKey);",
  "await cmdPetExtract(db, tok, chatId, telegramId, runId, stableRunEventKey);",
  "await cmdPetRun(db, tok, chatId, telegramId, runId, buildStablePetEventKey(['pet_run_push', telegramId, runId]));",
  "await cmdPetRun(db, tok, chatId, telegramId, `${runId}:${choiceKey}`, stableRunEventKey, stepIndex);",
]) {
  assert.ok(callbackBranch.includes(call), `callback branch must include ${call}`);
}

const commandSwitch = worker.slice(worker.indexOf('switch (cmdBase)'), worker.indexOf('async function cmdGkStart'));
assert.ok(
  commandSwitch.includes("case 'petbuy':       await cmdPetBuy(db, tok, chatId, telegramId, argStr, stableEventKey); break;"),
  '/petbuy text command must pass the Telegram message stableEventKey'
);
assert.ok(
  commandSwitch.includes("case 'kaiju':        await cmdPetKaiju(db, tok, chatId, telegramId, argStr, chatType, fromUser, stableEventKey); break;"),
  '/kaiju text command must open Telegram Kaiju battle with chat type'
);

const streakHelper = worker.slice(worker.indexOf('function updatePetStreakForAction'), worker.indexOf('async function savePetProfile'));
assert.ok(streakHelper.includes('getPreviousPetDayKey(dayKey)'), 'pet streak helper must compare against yesterday');
assert.ok(streakHelper.includes('pet.streak_days = currentStreak + 1'), 'pet streak helper must increment consecutive-day streaks');
assert.ok(streakHelper.includes('pet.streak_days = 1'), 'pet streak helper must reset after missed days');


assert.equal(normalizePetActivityType('sleep'), 'sleep', 'pet activities must normalize sleep');
assert.equal(computePetActivityRewards('train', 8 * 3600).seconds, 2 * 3600, 'train activity rewards must cap at 2 hours');
assert.ok(computePetActivityRewards('work', 30 * 60).rewards.moon_gold > computePetActivityRewards('work', 5 * 60).rewards.moon_gold, 'work rewards must scale by duration');
assert.ok(formatPetActivityLine({ activity_type: 'sleep', started_at: new Date(Date.now() - 42 * 60 * 1000).toISOString() }).includes('sleep'), '/pet status must format active activity');
for (const token of ['telegram_pet_activity_sessions', 'activity_type', 'started_at', 'ends_at', 'claimed_at', "status IN ('active', 'completed', 'cancelled', 'expired')", 'metadata', 'idx_telegram_pet_activity_one_active']) {
  assert.ok(activityMigration.includes(token), `activity migration must include ${token}`);
  assert.ok(schema.includes(token), `schema.sql must include ${token}`);
}
const activityStart = worker.slice(worker.indexOf('async function startPetActivitySession'), worker.indexOf('async function claimPetActivitySession'));
assert.ok(activityStart.includes('getActivePetActivitySession'), 'start session must block a second active session');
assert.ok(activityStart.includes('already_busy'), 'start session must return already_busy');
assert.ok(activityStart.includes('getRecoverablePetActivitySession') && activityStart.includes('activity_claim_pending'), 'start session must not bypass an unsettled activity claim');
const activityClaim = worker.slice(worker.indexOf('async function claimPetActivitySession'), worker.indexOf('async function cancelPetActivitySession'));
assert.ok(activityClaim.includes("buildStablePetEventKey(['pet_activity_claim', telegramId, session.id])"), 'claim must use stable idempotency event key');
assert.ok(activityClaim.includes("source: 'pet_activity'") && activityClaim.includes('awardPetReward(db'), 'activity claims must apply both XP caps through the unified authority');
assert.ok(activityClaim.includes("event_type: 'activity_claim'"), 'claim must audit rewards in telegram_pet_events');
assert.ok(activityClaim.includes('duplicate'), 'duplicate claim must not double-award');
assert.ok(activityClaim.includes('const claimResult = await db.prepare'), 'activity claim must capture the session completion update');
assert.ok(activityClaim.includes('if (!awarded.accepted)'), 'activity claims must return reward-authority rejection safely');
assert.ok(activityClaim.includes("Number(claimResult?.meta?.changes || 0) !== 1"), 'activity rewards must require exactly one atomic session claim');
assert.ok(activityClaim.includes("AND ends_at >= datetime(?, ?)"), 'activity session claims must reject rows that crossed the expiry boundary');
assert.ok(activityClaim.indexOf('const claimResult = await db.prepare') < activityClaim.indexOf('awardPetReward(db'), 'activity session state must be atomically claimed before rewards are awarded');
assert.ok(activityClaim.includes("claim_state: 'claiming'") && activityClaim.includes("claim_state: 'settled'"), 'activity claims must remain recoverable until reward settlement succeeds');
assert.ok(activityClaim.includes('getRecoverablePetActivitySession'), 'activity claim retries must resume the persisted reward snapshot');
assert.ok(activityClaim.indexOf('awardPetReward(db') < activityClaim.indexOf("claim_state: 'settled'"), 'activity claims must only become settled after reward issuance succeeds');
assert.ok(activityClaim.includes('getPersistedPetActivityAward'), 'duplicate activity settlements must recover the original authoritative award');
assert.ok(activityClaim.includes('authoritativeAward.rewards'), 'duplicate placeholders must not overwrite applied reward metadata');
const activityCancel = worker.slice(worker.indexOf('async function cancelPetActivitySession'), worker.indexOf('async function processPetAction'));
assert.ok(activityCancel.includes("SET status = 'cancelled'"), 'cancel must mark the session cancelled');
assert.ok(!activityCancel.includes('telegram_pet_events'), 'cancel must not award rewards');
assert.ok(callbackBranch.includes("payload === 'activity'"), 'Activity callback button must route');
assert.ok(callbackBranch.includes("payload === 'claim'"), 'Claim callback button must route');
assert.ok(callbackBranch.includes("payload === 'cancel'"), 'Cancel callback button must route');
assert.ok(callbackBranch.includes("payload.startsWith('start:')"), 'activity start callback buttons must route');
assert.ok(commandSwitch.includes("case 'petstart':"), '/petstart command must exist');
assert.ok(commandSwitch.includes("case 'petclaim':"), '/petclaim command must exist');
assert.ok(commandSwitch.includes("case 'petcancel':"), '/petcancel command must exist');
assert.ok(commandSwitch.includes("case 'petactivity':"), '/petactivity command must exist');

for (const table of ['telegram_pet_profiles', 'telegram_pet_events', 'telegram_pet_season_state', 'telegram_pet_mission_completions']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be in schema.sql`);
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be in migration`);
}

for (const table of ['telegram_pet_runs', 'telegram_pet_run_steps', 'telegram_pet_effects']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be in schema.sql`);
  assert.ok(runMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be in Pet Run Engine migration`);
}
for (const table of ['telegram_pet_kaiju_matches', 'telegram_pet_kaiju_queue']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be in schema.sql`);
  assert.ok(kaijuMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be in Kaiju pet migration`);
}
assert.ok(kaijuMigration.includes('idx_telegram_pet_kaiju_one_open_chat'), 'Kaiju migration must enforce one active table per chat');
assert.ok(kaijuMigration.includes('idx_telegram_pet_kaiju_queue_chat'), 'Kaiju migration must index the group queue');
assert.ok(kaijuMigration.includes('idx_telegram_pet_kaiju_queue_one_waiting'), 'Kaiju migration must only enforce one waiting queue row per user/chat');
assert.ok(!kaijuMigration.includes('UNIQUE(chat_id, telegram_id, status)'), 'Kaiju queue migration must not block repeat played history rows');
assert.ok(worker.includes('INSERT OR IGNORE INTO telegram_pet_kaiju_queue'), 'Kaiju queue enqueue must remain compatible with a partial unique waiting index');
for (const column of ['telegram_id', 'run_id', 'season_key', 'status', 'depth', 'max_depth', 'risk_level', 'unbanked_pet_xp', 'unbanked_moon_gold', 'unbanked_moon_crystals', 'unbanked_style_tokens', 'started_at', 'completed_at', 'updated_at']) {
  assert.ok(runMigration.includes(column), `Pet Run Engine migration must include ${column}`);
}
assert.ok(runMigration.includes('idx_telegram_pet_runs_one_open'), 'Pet Run Engine migration must enforce one open run per user');
assert.ok(runMigration.includes('UNIQUE(telegram_id, event_key)'), 'Pet Run Engine steps must dedupe callback event keys');
assert.ok(runMigration.includes('UNIQUE(run_id, step_index)'), 'Pet Run Engine steps must dedupe each run step');

assert.ok(schema.includes('telegram_pet_notification_settings'), 'schema.sql must include telegram_pet_notification_settings');
assert.ok(notificationsMigration.includes('telegram_pet_notification_settings'), 'notifications migration must create telegram_pet_notification_settings');
assert.ok(notificationsMigration.includes('idx_telegram_pet_notification_settings_due'), 'notifications migration must add the notification index');

for (const column of ['moon_gold', 'moon_crystals', 'style_tokens', 'equipped_food', 'equipped_toy', 'equipped_outfit']) {
  assert.ok(schema.includes(column), `schema.sql must include ${column}`);
  assert.ok(economyMigration.includes(`ADD COLUMN ${column}`), `economy migration must add ${column}`);
}

for (const command of ["case 'pet':", "case 'adopt':", "case 'feed':", "case 'play':", "case 'clean':", "case 'sleep':", "case 'train':", "case 'petshop':", "case 'petbag':", "case 'petbuy':", "case 'petuse':", "case 'petwork':", "case 'petdaily':", "case 'petevent':", "case 'pettrade':", "case 'petkaiju':", "case 'kaiju':", "case 'petrun':", "case 'petextract':", "case 'petadventure':", "case 'petnotify':", "case 'petleaderboard':"]) {
  assert.ok(worker.includes(command), `Telegram bot command ${command} must exist`);
}

assert.deepEqual(PET_REPEAT_REWARD_RULES.event, { full_rewarded: 6, reduced_rewarded: 10, reduced_multiplier: 0.5 }, 'Event repeat budget must remain 6 full and 4 half rewards');
assert.deepEqual(PET_REPEAT_REWARD_RULES.kaiju, { full_rewarded: 5, reduced_rewarded: 10, reduced_multiplier: 0.5 }, 'Kaiju repeat budget must remain 5 full and 5 half rewards');
for (const [mode, slot, expected] of [
  ['event', 1, 1], ['event', 6, 1], ['event', 7, 0.5], ['event', 10, 0.5], ['event', 11, 0],
  ['kaiju', 1, 1], ['kaiju', 5, 1], ['kaiju', 6, 0.5], ['kaiju', 10, 0.5], ['kaiju', 11, 0],
]) {
  assert.equal(getPetRepeatRewardMultiplier(mode, slot), expected, `${mode} slot ${slot} must use the correct reward tier`);
}
assert.deepEqual(scalePetRewards({ pet_xp: 21, moon_gold: 9, style_tokens: 1, happiness: 5 }, 0.5), { pet_xp: 10, moon_gold: 4, style_tokens: 0, happiness: 2 }, 'half rewards must floor every progression/currency reward');
assert.deepEqual(scalePetRewards({ pet_xp: 21, moon_gold: 9, style_tokens: 1, happiness: 5 }, 0), { pet_xp: 0, moon_gold: 0, style_tokens: 0, happiness: 0 }, 'zero-tier repeat play must award no progression or currency');

assert.equal(getPetHighLevelGearXpMultiplier({ pet_xp: 46240 }), 1, 'level 35 gear XP stays at 100%');
assert.equal(getPetHighLevelGearXpMultiplier({ pet_xp: 49000 }), 0.6, 'level 36 gear XP tapers to 60%');
assert.equal(getPetHighLevelGearXpMultiplier({ pet_xp: 96040 }), 0.6, 'level 50 gear XP stays at 60%');
assert.equal(getPetHighLevelGearXpMultiplier({ pet_xp: 100000 }), 0.35, 'level 51 gear XP tapers to 35%');
const highLevelGearRewards = { pet_xp: 6, moon_gold: 0, moon_crystals: 0, style_tokens: 0 };
applyPetItemActionBonuses({ pet_xp: 49000, equipped_outfit: 'moon_armor' }, 'feed', { hunger: -28, energy: 4 }, highLevelGearRewards);
assert.equal(highLevelGearRewards.pet_xp, 9, 'only the +5 gear bonus is tapered at level 36; base action XP remains 6');
assert.equal(highLevelGearRewards.moon_gold, 1, 'gear currency utility must not be tapered');

for (const token of ['telegram_pet_repeat_reward_slots', 'telegram_id', 'day_key', 'mode', 'claimed_count', 'PRIMARY KEY (telegram_id, day_key, mode)']) {
  assert.ok(repeatRewardMigration.includes(token), `repeat reward migration must include ${token}`);
  assert.ok(schema.includes(token), `schema.sql must include ${token}`);
}

class RepeatReservationDb {
  constructor(energy = {}) {
    this.energy = new Map(Object.entries(energy));
    this.events = new Map();
    this.counters = new Map();
    this.transaction = Promise.resolve();
  }

  prepare(sql) {
    return {
      bind: (...args) => ({
        sql,
        args,
        first: async () => {
          const row = this.events.get(`${args[0]}:${args[1]}`);
          return row ? {
            id: row.id,
            pet_id: row.pet_id,
            status: row.status,
            reason: row.reason,
            day_key: row.day_key,
            week_key: row.week_key,
            season_key: row.season_key,
          } : null;
        },
      }),
    };
  }

  async batch(statements) {
    const execute = async () => {
      const results = [];
      for (const statement of statements) {
        const { sql, args } = statement;
        if (sql.includes('INSERT OR IGNORE INTO telegram_pet_events')) {
          const [id, petId, telegramId, , eventKey, seasonKey, dayKey, weekKey] = args;
          const eventMapKey = `${telegramId}:${eventKey}`;
          const kaiju = sql.includes('WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles');
          const energyCost = kaiju ? Number(args[10]) : 0;
          if (!this.events.has(eventMapKey) && (!kaiju || Number(this.energy.get(String(telegramId)) || 0) >= energyCost)) {
            this.events.set(eventMapKey, {
              id,
              pet_id: String(petId || '') || null,
              telegram_id: String(telegramId),
              status: 'pending',
              reason: 'repeat_reward_pending',
              day_key: dayKey,
              week_key: weekKey,
              season_key: seasonKey,
            });
            results.push({ meta: { changes: 1 }, results: [] });
          } else {
            results.push({ meta: { changes: 0 }, results: [] });
          }
        } else if (sql.includes('SET energy = energy - ?')) {
          const [cost, telegramId, minimum, reservationId] = args;
          const event = [...this.events.values()].find((row) => row.id === reservationId && row.status === 'pending');
          const current = Number(this.energy.get(String(telegramId)) || 0);
          const changed = Boolean(event && current >= Number(minimum));
          if (changed) this.energy.set(String(telegramId), current - Number(cost));
          results.push({ meta: { changes: changed ? 1 : 0 }, results: [] });
        } else if (sql.includes('INSERT INTO telegram_pet_repeat_reward_slots')) {
          const [telegramId, dayKey, mode, reservationId] = args;
          const event = [...this.events.values()].find((row) => row.id === reservationId && row.status === 'pending');
          if (!event) {
            results.push({ meta: { changes: 0 }, results: [] });
          } else {
            const counterKey = `${telegramId}:${dayKey}:${mode}`;
            const count = Number(this.counters.get(counterKey) || 0) + 1;
            this.counters.set(counterKey, count);
            results.push({ meta: { changes: 1 }, results: [{ claimed_count: count }] });
          }
        } else if (sql.includes("SET reason = 'repeat_reward_slot:'")) {
          const [telegramId, dayKey, mode, suffix, reservationId] = args;
          const event = [...this.events.values()].find((row) => row.id === reservationId && row.status === 'pending');
          if (!event) {
            results.push({ meta: { changes: 0 }, results: [] });
          } else {
            event.reason = `repeat_reward_slot:${this.counters.get(`${telegramId}:${dayKey}:${mode}`)}${suffix}`;
            results.push({
              meta: { changes: 1 },
              results: [{
                id: event.id,
                pet_id: event.pet_id,
                status: event.status,
                reason: event.reason,
                day_key: event.day_key,
                week_key: event.week_key,
                season_key: event.season_key,
              }],
            });
          }
        } else {
          throw new Error(`Unexpected reservation SQL in test: ${sql}`);
        }
      }
      return results;
    };
    const result = this.transaction.then(execute);
    this.transaction = result.catch(() => {});
    return result;
  }
}

function reserveFixture(db, player, mode, eventKey, energyCost = 0) {
  return reservePetRepeatRewardEvent(db, {
    telegram_id: player,
    pet_id: mode === 'event' ? `pet:${player}:season:1` : undefined,
    event_type: mode === 'kaiju' ? 'kaiju_battle' : 'random_event',
    event_key: eventKey,
    season_key: 'season',
    day_key: '2026-08-10',
    week_key: '2026-W33',
    mode,
    energy_cost: energyCost,
  });
}

const eventReservationDb = new RepeatReservationDb();
const concurrentEventReservations = await Promise.all(Array.from({ length: 12 }, (_, index) => reserveFixture(eventReservationDb, 'event-player', 'event', `event-${index}`)));
assert.deepEqual(concurrentEventReservations.map((claim) => claim.claimed_slot).sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 1), 'concurrent Event reservations must receive unique atomic slots');
await assert.rejects(
  reservePetRepeatRewardEvent(new RepeatReservationDb(), {
    telegram_id: 'missing-authority',
    event_type: 'random_event',
    event_key: 'missing-authority-event',
    season_key: 'season',
    day_key: '2026-08-10',
    week_key: '2026-W33',
    mode: 'event',
  }),
  /pet_repeat_reward_authority_required/,
  'new Event reservations must not be created without pet authority',
);

const kaijuReservationDb = new RepeatReservationDb({ 'kaiju-player': 20 });
const concurrentKaijuReservations = await Promise.all(Array.from({ length: 12 }, (_, index) => reserveFixture(kaijuReservationDb, 'kaiju-player', 'kaiju', `kaiju-${index}`, 1)));
assert.deepEqual(concurrentKaijuReservations.map((claim) => claim.claimed_slot).sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 1), 'concurrent Kaiju reservations must receive unique atomic slots');
assert.equal(kaijuReservationDb.energy.get('kaiju-player'), 8, 'each successful Kaiju reservation must atomically pay exactly one Energy cost');

const duplicateKaijuDb = new RepeatReservationDb({ duplicate: 10 });
const duplicateKaijuClaims = await Promise.all(Array.from({ length: 8 }, () => reserveFixture(duplicateKaijuDb, 'duplicate', 'kaiju', 'same-result', 4)));
assert.equal(duplicateKaijuDb.counters.get('duplicate:2026-08-10:kaiju'), 1, 'duplicate Kaiju callbacks must consume only one reward slot');
assert.equal(duplicateKaijuDb.energy.get('duplicate'), 6, 'duplicate Kaiju callbacks must pay Energy only once');
assert.equal(duplicateKaijuClaims.filter((claim) => claim.resumed === false).length, 1, 'only one duplicate Kaiju callback may create the reservation');
assert.ok(duplicateKaijuClaims.every((claim) => claim.claimed_slot === 1), 'duplicate Kaiju callbacks must resume the same persisted reward slot');

const insufficientKaijuDb = new RepeatReservationDb({ broke: 3 });
const insufficientKaiju = await reserveFixture(insufficientKaijuDb, 'broke', 'kaiju', 'unaffordable', 4);
assert.deepEqual(insufficientKaiju, { claimed: false, reason: 'insufficient_energy', reservation_id: null }, 'Kaiju must reserve no slot and authorize no rewards when Energy cannot be claimed');
assert.equal(insufficientKaijuDb.counters.size, 0, 'an unaffordable Kaiju result must not consume a reward slot');

class SqliteD1Statement {
  constructor(adapter, sql, args = []) {
    this.adapter = adapter;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new SqliteD1Statement(this.adapter, this.sql, args);
  }

  async first() {
    if (this.adapter.failReadSqlPattern && this.adapter.failReadSqlPattern.test(this.sql)) {
      this.adapter.failReadSqlPattern = null;
      return { success: false, error: 'simulated_d1_read_failure' };
    }
    return this.adapter.database.prepare(this.sql).get(...this.args) || null;
  }

  async all() {
    if (this.adapter.failReadSqlPattern && this.adapter.failReadSqlPattern.test(this.sql)) {
      this.adapter.failReadSqlPattern = null;
      return { success: false, error: 'simulated_d1_read_failure' };
    }
    return { results: this.adapter.database.prepare(this.sql).all(...this.args) };
  }

  async run() {
    if (typeof this.adapter.beforeRun === 'function') await this.adapter.beforeRun(this.sql, this.args);
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { results: [], meta: { changes: Number(result.changes || 0) } };
  }
}

class SqliteD1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(schema);
    this.database.exec(`CREATE TABLE IF NOT EXISTS telegram_pet_growth_marks(mark_id TEXT PRIMARY KEY,pet_id TEXT,telegram_id TEXT,season_key TEXT,milestone_type TEXT,evidence_key TEXT,earned_day TEXT,earned_at TEXT,UNIQUE(pet_id,season_key,earned_day));
      CREATE TABLE IF NOT EXISTS telegram_pet_weekly_crests(crest_id TEXT PRIMARY KEY,pet_id TEXT,telegram_id TEXT,season_key TEXT,season_week INTEGER,qualification_week INTEGER,objective_id TEXT,evidence_key TEXT,earned_at TEXT);
      CREATE TABLE IF NOT EXISTS telegram_pet_season_completions(pet_id TEXT,telegram_id TEXT,season_key TEXT,completed_at TEXT,legendary_evolution_id TEXT,growth_marks_earned INTEGER,weekly_crests_earned INTEGER,authority_version INTEGER);`);
    this.batchCount = 0;
    this.failBatchNumber = null;
    this.failBatchSqlPattern = null;
    this.beforeBatchSqlPattern = null;
    this.beforeBatchSqlCallback = null;
    this.beforeRun = null;
    this.failReadSqlPattern = null;
  }

  prepare(sql) {
    return new SqliteD1Statement(this, sql);
  }

  failOnBatch(batchNumber) {
    this.failBatchNumber = batchNumber;
  }

  failBatchOnSql(pattern) {
    this.failBatchSqlPattern = pattern;
  }

  beforeBatchSql(pattern, callback) {
    this.beforeBatchSqlPattern = pattern;
    this.beforeBatchSqlCallback = callback;
  }

  failReadOnSql(pattern) {
    this.failReadSqlPattern = pattern;
  }

  async batch(statements) {
    this.batchCount += 1;
    if (this.batchCount === this.failBatchNumber) {
      this.failBatchNumber = null;
      throw new Error('simulated_d1_batch_failure');
    }
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        const prepared = this.database.prepare(statement.sql);
        if (this.beforeBatchSqlPattern && this.beforeBatchSqlPattern.test(statement.sql)) {
          const callback = this.beforeBatchSqlCallback;
          this.beforeBatchSqlPattern = null;
          this.beforeBatchSqlCallback = null;
          if (typeof callback === 'function') callback(statement.sql, statement.args);
        }
        if (this.failBatchSqlPattern && this.failBatchSqlPattern.test(statement.sql)) {
          this.failBatchSqlPattern = null;
          throw new Error('simulated_d1_batch_failure');
        }
        if (/\bRETURNING\b/i.test(statement.sql)) {
          const rows = prepared.all(...statement.args);
          return { results: rows, meta: { changes: rows.length } };
        }
        const result = prepared.run(...statement.args);
        return { results: [], meta: { changes: Number(result.changes || 0) } };
      });
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function seedRepeatRewardPlayer(telegramId, energy = 70, lastDecayAt = new Date().toISOString(), options = {}) {
  const db = new SqliteD1();
  const petId = `pet:${telegramId}:pet-s2026-003:1`;
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare(`
    INSERT INTO telegram_pet_profiles
      (telegram_id, pet_xp, level, happiness, energy, last_decay_at)
    VALUES (?, 0, 1, 70, ?, ?)
  `).run(telegramId, energy, lastDecayAt);
  db.database.prepare(`
    INSERT INTO telegram_seasons (name, start_date, end_date, is_active)
    VALUES ('Repeat recovery test', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', 1)
  `).run();
  if (options.seedAuthority !== false) {
    db.database.prepare(`INSERT INTO telegram_pet_season_slots
      (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
      VALUES (?, ?, 'pet-s2026-003', 1, 'free', 'profile_insert', 0, 'active')`).run(petId, telegramId);
    db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
      VALUES (?, ?, 'pet-s2026-003')`).run(telegramId, petId);
    db.database.prepare(`INSERT INTO telegram_pet_instances
      (pet_id, telegram_id, season_key, slot_number, pet_xp, level, happiness, energy, last_decay_at, source_profile_updated_at, status)
      VALUES (?, ?, 'pet-s2026-003', 1, 0, 1, 70, ?, ?, 'fixture', 'active')`).run(petId, telegramId, energy, lastDecayAt);
  }
  return db;
}

function seedAndSwitchRepeatRewardPet(db, telegramId, slotNumber = 2, energy = 70) {
  const petId = `pet:${telegramId}:pet-s2026-003:${slotNumber}`;
  db.database.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
    VALUES (?, ?, 'pet-s2026-003', ?, 'arcade_xp', ?, 500, 'active')`).run(petId, telegramId, slotNumber, `fixture:slot:${slotNumber}`);
  db.database.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_xp, level, happiness, energy, last_decay_at, source_profile_updated_at, status)
    VALUES (?, ?, 'pet-s2026-003', ?, 0, 1, 70, ?, CURRENT_TIMESTAMP, 'fixture', 'active')`).run(petId, telegramId, slotNumber, energy);
  db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
    VALUES (?, ?, 'pet-s2026-003')
    ON CONFLICT(telegram_id) DO UPDATE SET pet_id=excluded.pet_id, season_key=excluded.season_key, updated_at=CURRENT_TIMESTAMP`)
    .run(telegramId, petId);
  return petId;
}

function buildSignedTelegramAuth(telegramId, botToken = '123456:test-token') {
  const auth = {
    id: String(telegramId),
    first_name: 'Audit',
    username: `audit_${telegramId}`,
    auth_date: String(Math.floor(Date.now() / 1000)),
  };
  const checkString = Object.entries(auth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  return {
    ...auth,
    hash: createHmac('sha256', secret).update(checkString).digest('hex'),
  };
}

function seedIdentityAuditPet(db, telegramId, slotNumber = 1) {
  const petId = `pet:${telegramId}:pet-s2026-003:${slotNumber}`;
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare(`INSERT INTO telegram_pet_profiles
    (telegram_id, pet_name, pet_xp, level, energy, hunger, happiness, cleanliness, health)
    VALUES (?, 'Audit Pet', 100, 2, 80, 0, 80, 80, 100)`).run(telegramId);
  db.database.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
    VALUES (?, ?, 'pet-s2026-003', ?, 'free', ?, 0, 'active')`).run(petId, telegramId, slotNumber, `audit:${slotNumber}`);
  db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
    VALUES (?, ?, 'pet-s2026-003')`).run(telegramId, petId);
  db.database.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_name, pet_xp, level, energy, hunger, happiness, cleanliness, health, source_profile_updated_at, status)
    VALUES (?, ?, 'pet-s2026-003', ?, 'Audit Pet', 100, 2, 80, 0, 80, 80, 100, 'fixture', 'active')`).run(petId, telegramId, slotNumber);
  return petId;
}

function identityAuditCounts(db) {
  const counts = {};
  for (const table of [
    'telegram_pet_memories',
    'telegram_pet_personality_traits',
    'telegram_pet_boss_victories',
    'telegram_pet_identity_events',
    'telegram_pet_identity_analytics',
    'telegram_pet_achievements',
  ]) {
    counts[table] = db.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }
  return counts;
}

const identityAuditDb = new SqliteD1();
const identityAuditPet = seedIdentityAuditPet(identityAuditDb, '9001001', 1);
const otherAuditPet = seedIdentityAuditPet(identityAuditDb, '9002002', 1);
const switchedIdentityAuditPet = 'pet:9001001:pet-s2026-003:3';
const archivedIdentityAuditPet = 'pet:9001001:pet-s2026-002:2';
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
  VALUES (?, '9001001', 'pet-s2026-003', 3, 'arcade_xp', 'switch-fixture', 0, 'active')`).run(switchedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number, pet_name, pet_xp, level, energy, hunger, happiness, cleanliness, health, source_profile_updated_at, status)
  VALUES (?, '9001001', 'pet-s2026-003', 3, 'Switched Audit Pet', 360, 4, 85, 4, 84, 84, 96, 'fixture', 'active')`).run(switchedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
  VALUES (?, '9001001', 'pet-s2026-002', 2, 'free', 'archived-fixture', 0, 'archived')`).run(archivedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number, pet_name, pet_xp, level, energy, hunger, happiness, cleanliness, health, source_profile_updated_at, status)
  VALUES (?, '9001001', 'pet-s2026-002', 2, 'Archived Audit Pet', 240, 3, 70, 5, 75, 75, 95, 'fixture', 'archived')`).run(archivedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_memories
  (pet_id, telegram_id, season_key, first_run_at, total_bosses_defeated, milestones)
  VALUES (?, '9001001', 'pet-s2026-003', '2026-08-21T00:00:00Z', 1, '["first_run"]')`).run(identityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_memories
  (pet_id, telegram_id, season_key, first_run_at, first_boss_id, favourite_activity, total_bosses_defeated, milestones)
  VALUES (?, '9001001', 'pet-s2026-003', '2026-08-22T00:00:00Z', 'switch_boss', 'Care', 4, '["switched_first_run"]')`).run(switchedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_memories
  (pet_id, telegram_id, season_key, first_run_at, first_boss_id, favourite_activity, total_bosses_defeated, milestones)
  VALUES (?, '9001001', 'pet-s2026-002', '2026-07-21T00:00:00Z', 'archive_boss', 'Exploration', 2, '["archived_first_run"]')`).run(archivedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_personality_traits
  (pet_id, telegram_id, season_key, trait_id, progress)
  VALUES (?, '9001001', 'pet-s2026-003', 'curious', 2)`).run(identityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_personality_traits
  (pet_id, telegram_id, season_key, trait_id, progress)
  VALUES (?, '9001001', 'pet-s2026-003', 'loyal', 18)`).run(switchedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_personality_traits
  (pet_id, telegram_id, season_key, trait_id, progress)
  VALUES (?, '9001001', 'pet-s2026-002', 'explorer', 16)`).run(archivedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_boss_victories
  (pet_id, telegram_id, season_key, boss_id, victories)
  VALUES (?, '9001001', 'pet-s2026-003', 'alley_king', 1)`).run(identityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_boss_victories
  (pet_id, telegram_id, season_key, boss_id, victories)
  VALUES (?, '9001001', 'pet-s2026-003', 'switch_boss', 4)`).run(switchedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_boss_victories
  (pet_id, telegram_id, season_key, boss_id, victories)
  VALUES (?, '9001001', 'pet-s2026-002', 'archive_boss', 2)`).run(archivedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_identity_events
  (event_id, pet_id, telegram_id, season_key, event_key, event_kind)
  VALUES ('identity-audit-event', ?, '9001001', 'pet-s2026-003', 'identity:audit:event', 'memory')`).run(identityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_identity_analytics
  (analytics_id, pet_id, telegram_id, season_key, event_type, milestone_id)
  VALUES ('identity-audit-analytics', ?, '9001001', 'pet-s2026-003', 'memory_milestone', 'first_run')`).run(identityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_achievements
  (pet_id, telegram_id, season_key, achievement_id, progress, target)
  VALUES (?, '9001001', 'pet-s2026-003', 'boss_breaker', 1, 5)`).run(identityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_achievements
  (pet_id, telegram_id, season_key, achievement_id, progress, target)
  VALUES (?, '9001001', 'pet-s2026-003', 'social_butterfly', 4, 5)`).run(switchedIdentityAuditPet);
identityAuditDb.database.prepare(`INSERT INTO telegram_pet_achievements
  (pet_id, telegram_id, season_key, achievement_id, progress, target)
  VALUES (?, '9001001', 'pet-s2026-002', 'memory_keeper', 2, 5)`).run(archivedIdentityAuditPet);

const identityAuditEnv = { DB: identityAuditDb, TELEGRAM_BOT_TOKEN: '123456:test-token' };
const identityAuditAuth = JSON.stringify(buildSignedTelegramAuth('9001001'));
const identityAuditAuthorization = { Authorization: `Bearer ${identityAuditAuth}` };
const identityAuditBefore = identityAuditCounts(identityAuditDb);
const activeIdentityAuditResponse = await moonboysApiWorker.fetch(new Request(
  'https://moonboys.test/api/telegram/pets/identity/audit',
  { headers: identityAuditAuthorization },
), identityAuditEnv);
assert.equal(activeIdentityAuditResponse.status, 200, 'identity audit endpoint defaults to active Pet A');
const activeIdentityAuditPayload = await activeIdentityAuditResponse.json();
assert.equal(activeIdentityAuditPayload.pet_id, identityAuditPet, 'active identity audit must use active Pet A');
assert.deepEqual(activeIdentityAuditPayload.personality_traits.map((row) => row.trait_id), ['curious'],
  'active Pet A audit must not include archived Pet B personality');
assert.deepEqual(activeIdentityAuditPayload.boss_victories.map((row) => row.boss_id), ['alley_king'],
  'active Pet A audit must not include archived Pet B boss history');

const identityAuditResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(identityAuditPet)}&season_key=pet-s2026-003`,
  { headers: identityAuditAuthorization },
), identityAuditEnv);
assert.equal(identityAuditResponse.status, 200, 'identity audit endpoint accepts an authenticated owner pet request');
assert.equal(identityAuditResponse.headers.get('Cache-Control'), 'no-store', 'identity audit endpoint must not cache diagnostics');
const identityAuditPayload = await identityAuditResponse.json();
assert.equal(identityAuditPayload.pet_id, identityAuditPet, 'identity audit endpoint returns the requested owned pet');
assert.equal(identityAuditPayload.telegram_id, '9001001', 'identity audit endpoint is scoped to the authenticated Telegram owner');
assert.equal(identityAuditPayload.memories_count, 1, 'identity audit endpoint returns owned memory diagnostics');
assert.deepEqual(identityAuditPayload.personality_traits.map((row) => row.trait_id), ['curious'],
  'identity audit endpoint returns only owned personality rows');
assert.deepEqual(identityAuditPayload.achievements.map((row) => row.achievement_id), ['boss_breaker'],
  'identity audit endpoint returns only owned achievement rows');
assert.deepEqual(identityAuditPayload.boss_victories.map((row) => row.boss_id), ['alley_king'],
  'identity audit endpoint returns only owned boss victory rows');
assert.equal(identityAuditPayload.identity_events.length, 1, 'identity audit endpoint returns bounded owned identity history');
assert.deepEqual(identityAuditPayload.identity_analytics.map((row) => row.analytics_id), ['identity-audit-analytics'],
  'identity audit endpoint returns owned identity analytics rows');
assert.equal(identityAuditPayload.invalid_authority_rows.length, 0, 'identity audit endpoint reports zero invalid rows for owned fixture');
assert.deepEqual(identityAuditCounts(identityAuditDb), identityAuditBefore,
  'identity audit GET must not mutate memories, personality, achievements, boss victories, or identity events');

const archivedIdentityAuditResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(archivedIdentityAuditPet)}&season_key=pet-s2026-002`,
  { headers: identityAuditAuthorization },
), identityAuditEnv);
assert.equal(archivedIdentityAuditResponse.status, 200, 'identity audit endpoint supports archived Pet B while Pet A remains active');
const archivedIdentityAuditPayload = await archivedIdentityAuditResponse.json();
assert.equal(archivedIdentityAuditPayload.pet_id, archivedIdentityAuditPet, 'archived Pet B audit must return the explicit archived pet');
assert.deepEqual(archivedIdentityAuditPayload.personality_traits.map((row) => row.trait_id), ['explorer'],
  'archived Pet B audit must not include active Pet A personality');
assert.deepEqual(archivedIdentityAuditPayload.achievements.map((row) => row.achievement_id), ['memory_keeper'],
  'archived Pet B audit must not include active Pet A achievements');
assert.deepEqual(archivedIdentityAuditPayload.boss_victories.map((row) => row.boss_id), ['archive_boss'],
  'archived Pet B audit must not include active Pet A boss history');
assert.equal(archivedIdentityAuditPayload.memories_count, 1, 'archived Pet B audit must read archived pet memories by full tuple');

identityAuditDb.database.prepare(`UPDATE telegram_pet_active_slots
  SET pet_id = ?, season_key = 'pet-s2026-003'
  WHERE telegram_id = '9001001'`).run(switchedIdentityAuditPet);
const switchedActiveIdentityAuditResponse = await moonboysApiWorker.fetch(new Request(
  'https://moonboys.test/api/telegram/pets/identity/audit',
  { headers: identityAuditAuthorization },
), identityAuditEnv);
assert.equal(switchedActiveIdentityAuditResponse.status, 200, 'identity audit endpoint follows an active-pet switch');
const switchedActiveIdentityAuditPayload = await switchedActiveIdentityAuditResponse.json();
assert.equal(switchedActiveIdentityAuditPayload.pet_id, switchedIdentityAuditPet, 'current profile audit must use switched active Pet C');
assert.deepEqual(switchedActiveIdentityAuditPayload.personality_traits.map((row) => row.trait_id), ['loyal'],
  'switched active Pet C audit must not include active Pet A or archived Pet B personality');
assert.deepEqual(switchedActiveIdentityAuditPayload.achievements.map((row) => row.achievement_id), ['social_butterfly'],
  'switched active Pet C audit must not include active Pet A or archived Pet B achievements');
assert.deepEqual(switchedActiveIdentityAuditPayload.boss_victories.map((row) => row.boss_id), ['switch_boss'],
  'switched active Pet C audit must not include active Pet A or archived Pet B boss history');
assert.equal(switchedActiveIdentityAuditPayload.memories_count, 1, 'switched active Pet C audit must read only Pet C memories');

const petIdOnlyAudit = await buildMoonpetIdentityAuthorityAudit(identityAuditDb, '9001001', { pet_id: archivedIdentityAuditPet });
assert.equal(petIdOnlyAudit, null, 'API audit helper must reject pet_id without season_key instead of falling back to active Pet A');
const petIdOnlyAuditResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(archivedIdentityAuditPet)}`,
  { headers: identityAuditAuthorization },
), identityAuditEnv);
assert.equal(petIdOnlyAuditResponse.status, 404, 'API audit endpoint must reject pet_id-only explicit reads');
assert.equal((await petIdOnlyAuditResponse.json()).error, 'identity_authority_scope_not_found');
const wrongSeasonAudit = await buildMoonpetIdentityAuthorityAudit(identityAuditDb, '9001001', {
  pet_id: archivedIdentityAuditPet,
  season_key: 'pet-s2026-003',
});
assert.equal(wrongSeasonAudit, null, 'API audit helper must reject a wrong season tuple instead of leaking archived Pet B');
const wrongSeasonAuditResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(archivedIdentityAuditPet)}&season_key=pet-s2026-003`,
  { headers: identityAuditAuthorization },
), identityAuditEnv);
assert.equal(wrongSeasonAuditResponse.status, 403, 'API audit endpoint must reject wrong season explicit reads');
assert.equal((await wrongSeasonAuditResponse.json()).error, 'identity_authority_scope_not_found');

const urlCredentialAuditResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?telegram_auth=${encodeURIComponent(identityAuditAuth)}&pet_id=${encodeURIComponent(identityAuditPet)}&season_key=pet-s2026-003`,
), identityAuditEnv);
assert.equal(urlCredentialAuditResponse.status, 400, 'identity audit endpoint rejects URL Telegram credentials');
assert.equal((await urlCredentialAuditResponse.json()).error, 'telegram_auth_url_credentials_rejected');

const crossOwnerResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(otherAuditPet)}&season_key=pet-s2026-003`,
  { headers: identityAuditAuthorization },
), identityAuditEnv);
assert.equal(crossOwnerResponse.status, 403, 'identity audit endpoint rejects another player pet_id');
const crossOwnerPayload = await crossOwnerResponse.json();
assert.equal(crossOwnerPayload.error, 'identity_authority_scope_not_found');
assert.equal(Object.prototype.hasOwnProperty.call(crossOwnerPayload, 'pet_id'), false,
  'cross-owner identity audit rejection must not return another player pet payload');
assert.deepEqual(identityAuditCounts(identityAuditDb), identityAuditBefore,
  'rejected identity audit GET must not mutate identity ledgers');

identityAuditDb.database.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id=?").run(identityAuditPet);
identityAuditDb.database.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id=?").run(identityAuditPet);
const archivedAuditResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(identityAuditPet)}&season_key=pet-s2026-003`,
  { headers: identityAuditAuthorization },
), identityAuditEnv);
assert.equal(archivedAuditResponse.status, 200, 'identity audit endpoint supports explicit owned archived pet audits');
const archivedAuditPayload = await archivedAuditResponse.json();
assert.equal(archivedAuditPayload.pet_id, identityAuditPet);
assert.equal(archivedAuditPayload.identity_analytics.length, 1, 'archived pet audit still returns owned identity analytics');

const invalidDiagnosticDb = new SqliteD1();
const invalidDiagnosticPet = seedIdentityAuditPet(invalidDiagnosticDb, '9004004', 1);
invalidDiagnosticDb.database.exec('PRAGMA foreign_keys=OFF');
invalidDiagnosticDb.database.prepare(`INSERT INTO telegram_pet_identity_analytics
  (analytics_id, pet_id, telegram_id, season_key, event_type)
  VALUES ('invalid-owned-pet-analytics', ?, '9004999', 'wrong-season', 'memory_milestone')`).run(invalidDiagnosticPet);
const invalidDiagnosticAuth = JSON.stringify(buildSignedTelegramAuth('9004004'));
const invalidDiagnosticResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(invalidDiagnosticPet)}&season_key=pet-s2026-003`,
  { headers: { Authorization: `Telegram ${invalidDiagnosticAuth}` } },
), { DB: invalidDiagnosticDb, TELEGRAM_BOT_TOKEN: '123456:test-token' });
assert.equal(invalidDiagnosticResponse.status, 200, 'identity audit endpoint can report invalid rows for an authorized pet');
const invalidDiagnosticPayload = await invalidDiagnosticResponse.json();
assert.deepEqual(
  invalidDiagnosticPayload.invalid_authority_rows.map((row) => ({ table_name: row.table_name, row_key: row.row_key, reason: row.reason })),
  [{ table_name: 'telegram_pet_identity_analytics', row_key: 'invalid-owned-pet-analytics', reason: 'season_slot_tuple_missing' }],
  'identity audit endpoint must not silently hide invalid rows attached to an authorized pet',
);
assert.equal(Object.prototype.hasOwnProperty.call(invalidDiagnosticPayload.invalid_authority_rows[0], 'telegram_id'), false,
  'identity audit endpoint must redact mismatched telegram_id from invalid authority rows');
assert.equal(Object.prototype.hasOwnProperty.call(invalidDiagnosticPayload.invalid_authority_rows[0], 'season_key'), false,
  'identity audit endpoint must redact mismatched season_key from invalid authority rows');

const brokenAuditDb = new SqliteD1();
const brokenAuditPet = seedIdentityAuditPet(brokenAuditDb, '9003003', 1);
brokenAuditDb.database.exec('DROP VIEW moonpet_invalid_identity_authority_rows');
const brokenAuditAuth = JSON.stringify(buildSignedTelegramAuth('9003003'));
const brokenAuditResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(brokenAuditPet)}&season_key=pet-s2026-003`,
  { headers: { Authorization: `Bearer ${brokenAuditAuth}` } },
), { DB: brokenAuditDb, TELEGRAM_BOT_TOKEN: '123456:test-token' });
assert.equal(brokenAuditResponse.status, 500, 'identity audit endpoint must fail closed when verifier view is unavailable');
assert.equal(brokenAuditResponse.headers.get('Cache-Control'), 'no-store', 'failed identity audit diagnostics must not be cached');
assert.equal((await brokenAuditResponse.json()).error, 'identity_authority_audit_failed');

const failedReadAuditDb = new SqliteD1();
const failedReadAuditPet = seedIdentityAuditPet(failedReadAuditDb, '9005005', 1);
failedReadAuditDb.failReadOnSql(/FROM telegram_pet_identity_analytics/i);
const failedReadAuditAuth = JSON.stringify(buildSignedTelegramAuth('9005005'));
const failedReadAuditResponse = await moonboysApiWorker.fetch(new Request(
  `https://moonboys.test/api/telegram/pets/identity/audit?pet_id=${encodeURIComponent(failedReadAuditPet)}&season_key=pet-s2026-003`,
  { headers: { Authorization: `Bearer ${failedReadAuditAuth}` } },
), { DB: failedReadAuditDb, TELEGRAM_BOT_TOKEN: '123456:test-token' });
assert.equal(failedReadAuditResponse.status, 500, 'identity audit endpoint must reject D1 success:false reads');
assert.equal((await failedReadAuditResponse.json()).error, 'identity_authority_audit_failed');

function insertWalletRecoveryRequired(db, telegramId) {
  db.database.prepare(`
    INSERT INTO telegram_pet_reward_claims
      (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata)
    VALUES (?, NULL, ?, 'wallet_reconciliation_recovery_required', 'moonpet_wallet_reconcile_recovery_required:v1', '2026-08-18', 'pending', '{}', '{}', ?)
  `).run(`recovery-required:${telegramId}`, telegramId, JSON.stringify({ outcome: 'recovery_required', reason: 'missing_wallet_snapshot' }));
}

function insertWalletReconciled(db, telegramId) {
  db.database.prepare(`
    INSERT INTO telegram_pet_reward_claims
      (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
    VALUES (?, NULL, ?, 'wallet_reconciliation', 'moonpet_wallet_reconcile:v1', '2026-08-18', 'awarded', '{}', '{}', ?, CURRENT_TIMESTAMP)
  `).run(`wallet-reconciled:${telegramId}`, telegramId, JSON.stringify({ outcome: 'reconciled' }));
}

const seasonSlotRuntimeDb = seedRepeatRewardPlayer('season-slot-runtime');
await ensurePetStarterSeasonSlot(seasonSlotRuntimeDb, 'season-slot-runtime', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(seasonSlotRuntimeDb, 'season-slot-runtime');
seasonSlotRuntimeDb.database.prepare(`
  INSERT INTO arcade_progression_state
    (telegram_id, arcade_xp_total, arcade_daily_xp, arcade_daily_key, arcade_restriction_level, restricted_until, updated_at)
  VALUES ('season-slot-runtime', 1400, 0, '2026-08-15', 0, NULL, CURRENT_TIMESTAMP)
  ON CONFLICT(telegram_id) DO UPDATE SET arcade_xp_total = excluded.arcade_xp_total
`).run();
seasonSlotRuntimeDb.database.prepare(`INSERT INTO arcade_xp_wallets
  (telegram_id, arcade_xp_earned, arcade_xp_spendable, arcade_xp_spent)
  VALUES ('season-slot-runtime', 1400, 1400, 0)`).run();
assert.equal(PET_SEASON_EXTRA_SLOT_COSTS[2], 500, 'second seasonal pet slot must cost Arcade XP');
assert.equal(PET_SEASON_EXTRA_SLOT_COSTS[3], 1000, 'third seasonal pet slot must cost Arcade XP');
const initialSeasonSlots = await buildPetSeasonSlotSummary(seasonSlotRuntimeDb, 'season-slot-runtime', new Date('2026-08-15T00:00:00Z'));
assert.equal(initialSeasonSlots.season.current_at, '2026-08-15T00:00:00.000Z', 'season summary must include the authoritative server timestamp used by the UI');
assert.equal(initialSeasonSlots.slots.length, 3, 'season slot summary must always expose the three season slots');
assert.equal(initialSeasonSlots.slots[0].unlocked, true, 'starter slot must be unlocked for existing pet profiles');
assert.deepEqual(
  Object.keys(initialSeasonSlots.slots[0].pet).sort(),
  ['cleanliness', 'energy', 'happiness', 'health', 'hunger', 'level', 'name', 'pet_xp', 'progression', 'species', 'stage', 'variant'].sort(),
  'owned slot summaries must expose only the pet-instance fields required by the roster card',
);
assert.equal(initialSeasonSlots.slots[0].pet.level >= 1, true, 'owned slot cards must include a valid level');
assert.equal(initialSeasonSlots.slots[0].pet.pet_xp >= 0, true, 'owned slot cards must include pet-instance XP');
assert.equal(typeof initialSeasonSlots.slots[0].pet_id, 'string', 'owned slot summaries must identify the authoritative pet instance');
assert.equal(initialSeasonSlots.purchase_enabled, true, 'season slot purchases must be enabled with per-pet state available');
assert.equal(initialSeasonSlots.purchase_disabled_reason, null);
assert.equal(initialSeasonSlots.slots[1].unlock_cost_arcade_xp, 500, 'slot 2 must show its Arcade XP cost');
assert.equal(initialSeasonSlots.slots[1].affordable, true, 'slot 2 must be marked affordable when Arcade XP covers its cost');
assert.equal(initialSeasonSlots.arcade_xp_lifetime, 1400, 'slot payload must preserve lifetime XP');
assert.equal(initialSeasonSlots.arcade_xp_spendable, 1400, 'slot payload must expose spend authority separately');
assert.equal(initialSeasonSlots.arcade_xp_spent, 0, 'slot payload must expose spent XP');
assert.equal(initialSeasonSlots.next_slot_cost, 500, 'slot payload must expose the next sequential cost');
assert.equal(initialSeasonSlots.can_buy_next_slot, true, 'slot payload must expose wallet affordability');
assert.equal(initialSeasonSlots.slots[2].unlocked, false, 'slot 3 must start locked');
assert.equal(initialSeasonSlots.slots[2].purchase_enabled, false, 'slot 3 must remain disabled until slot 2 is owned');
assert.equal(initialSeasonSlots.slots[2].purchase_disabled_reason, 'previous_pet_slot_required', 'slot 3 must advertise the sequential purchase requirement');
assert.equal(initialSeasonSlots.slots[2].affordable, false, 'slot 3 must not be affordable before slot 2 is owned');
const slotSummaryAction = await processPetMiniAppAction(seasonSlotRuntimeDb, 'season-slot-runtime', { id: 'season-slot-runtime' }, {
  action: 'season_slots',
  request_id: 'slot-summary',
}, 'bot-token');
assert.equal(slotSummaryAction.accepted, true, 'Mini App slot action must return the read-only slot summary');
assert.equal(slotSummaryAction.season_slots.slots.length, 3, 'Mini App slot summary must include all three slots');
const serializedSlotSummaryAction = serializePetMiniAppActionResult(slotSummaryAction);
assert.equal(serializedSlotSummaryAction.season_slots.slots.length, 3, 'serialized Mini App slot action must include the slot summary payload');
assert.equal(seasonSlotRuntimeDb.database.prepare("SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id='season-slot-runtime'").get().arcade_xp_total, 1400, 'read-only slot summary must not spend Arcade XP');
assert.equal(seasonSlotRuntimeDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_season_slots WHERE telegram_id='season-slot-runtime'").get().count, 1, 'read-only slot summary must not create paid slots before per-pet state exists');

const legacyLifecycleStateDb = seedRepeatRewardPlayer('legacy-lifecycle-state');
const materializedLegacyRows = await materializePetLeaderboardRows(legacyLifecycleStateDb, [{
  telegram_id: 'legacy-lifecycle-state',
  pet_name: 'Legacy',
  lifecycle_phase: null,
  lifecycle_species_id: null,
  rare_morph_id: null,
}]);
assert.equal(materializedLegacyRows.length, 1);
assert.equal(materializedLegacyRows[0].lifecycle_phase, 'adult', 'legacy player state must materialize an adult lifecycle instead of crashing');
assert.ok(materializedLegacyRows[0].lifecycle_species_id, 'legacy player state must derive a deterministic species');
assert.equal(
  legacyLifecycleStateDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_by_pet WHERE telegram_id = ?').get('legacy-lifecycle-state').count,
  1,
  'legacy player state must persist exactly one lifecycle row',
);

const repeatTradeDb = seedRepeatRewardPlayer('trade-repeat', 70);
repeatTradeDb.database.prepare("UPDATE telegram_pet_profiles SET moon_gold = 200, happiness = 90, cleanliness = 90, hunger = 10 WHERE telegram_id = 'trade-repeat'").run();
const originalTradeRandom = Math.random;
const originalTimezone = process.env.TZ;
process.env.TZ = 'America/New_York';
Math.random = () => 0.9;
try {
  const firstTrade = await processPetGoldTrade(repeatTradeDb, 'trade-repeat', '50', { event_key: 'callback:trade:first', source: 'telegram_callback' });
  assert.equal(firstTrade.accepted, true, 'first 50-gold callback trade must execute');
  repeatTradeDb.database.prepare("UPDATE telegram_pet_events SET created_at = datetime('now', '-10 minutes') WHERE telegram_id = 'trade-repeat' AND event_key = 'callback:trade:first'").run();
  const secondTrade = await processPetGoldTrade(repeatTradeDb, 'trade-repeat', '50', { event_key: 'callback:trade:second', source: 'telegram_callback' });
  assert.equal(secondTrade.accepted, true, 'same 50-gold wager must execute again after cooldown with a new callback key');
  assert.equal(secondTrade.duplicate, undefined, 'new callback identity must not be mistaken for the prior wager');
  const goldAfterSecondTrade = repeatTradeDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'trade-repeat'").get().moon_gold;
  const duplicateSecondTrade = await processPetGoldTrade(repeatTradeDb, 'trade-repeat', '50', { event_key: 'callback:trade:second', source: 'telegram_callback' });
  assert.equal(duplicateSecondTrade.duplicate, true, 'repeated delivery of the same trade callback must resolve as a duplicate');
  assert.equal(repeatTradeDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'trade-repeat'").get().moon_gold, goldAfterSecondTrade, 'duplicate callback must not apply gold twice');
  assert.equal(repeatTradeDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'trade-repeat' AND event_type = 'trade'").get().count, 2, 'two unique callbacks must create exactly two trade settlements');
} finally {
  Math.random = originalTradeRandom;
  if (originalTimezone == null) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
}
const tradeCommand = asyncBlock('cmdPetTrade');
assert.ok(tradeCommand.includes('eventKey = null') && tradeCommand.includes('event_key: eventKey ||'), 'trade command must accept and prioritize the unique Telegram event key');
assert.ok(tradeCommand.includes('if (result.duplicate)') && !tradeCommand.includes('Trade lost: undefined gold'), 'duplicate trade callbacks must return safe copy without undefined losses');
assert.ok(callbackBranch.includes('cmdPetTrade(db, tok, chatId, telegramId, wager, eventKey)'), 'trade callback router must pass callback_query identity into settlement');

const repeatPurchaseDb = seedRepeatRewardPlayer('purchase-repeat', 70);
repeatPurchaseDb.database.prepare("UPDATE telegram_pet_profiles SET moon_gold = 100 WHERE telegram_id = 'purchase-repeat'").run();
await ensurePetStarterSeasonSlot(repeatPurchaseDb, 'purchase-repeat', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(repeatPurchaseDb, 'purchase-repeat');
const firstPurchase = await processPetShopPurchase(repeatPurchaseDb, 'purchase-repeat', 'moon_kibble', { event_key: 'callback:buy:moon-kibble', source: 'telegram_callback' });
assert.equal(firstPurchase.accepted, true, 'first shop purchase must execute');
assert.equal(repeatPurchaseDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'purchase-repeat'").get().moon_gold, 55,
  'shop purchase must debit account wallet authority once');
const duplicatePurchase = await processPetShopPurchase(repeatPurchaseDb, 'purchase-repeat', 'moon_kibble', { event_key: 'callback:buy:moon-kibble', source: 'telegram_callback' });
assert.equal(duplicatePurchase.duplicate, true, 'duplicate shop purchase event key must resolve as duplicate');
assert.equal(repeatPurchaseDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'purchase-repeat'").get().moon_gold, 55,
  'duplicate shop purchase event key must not double-debit the account wallet');
assert.equal(repeatPurchaseDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'purchase-repeat' AND event_type = 'buy' AND status = 'accepted'").get().count, 1,
  'duplicate shop purchase event key must create exactly one accepted receipt');

const insufficientPurchaseDb = seedRepeatRewardPlayer('purchase-insufficient', 70);
insufficientPurchaseDb.database.prepare("UPDATE telegram_pet_profiles SET moon_gold = 40 WHERE telegram_id = 'purchase-insufficient'").run();
await ensurePetStarterSeasonSlot(insufficientPurchaseDb, 'purchase-insufficient', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(insufficientPurchaseDb, 'purchase-insufficient');
insufficientPurchaseDb.database.prepare("UPDATE telegram_pet_instances SET moon_gold = 999 WHERE telegram_id = 'purchase-insufficient'").run();
const insufficientPurchase = await processPetShopPurchase(insufficientPurchaseDb, 'purchase-insufficient', 'moon_kibble', { event_key: 'callback:buy:insufficient', source: 'telegram_callback' });
assert.equal(insufficientPurchase.accepted, false, 'insufficient account wallet must block shop purchase');
assert.equal(insufficientPurchaseDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'purchase-insufficient'").get().moon_gold, 40,
  'insufficient shop purchase must not debit the account wallet');
assert.equal(insufficientPurchaseDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'purchase-insufficient' AND event_key = 'callback:buy:insufficient' AND status = 'accepted'").get().count, 0,
  'insufficient shop purchase must not create an accepted receipt');

const staleExpeditionDb = seedRepeatRewardPlayer('expedition-stale-level', 20);
staleExpeditionDb.database.prepare(`UPDATE telegram_pet_profiles
  SET pet_xp=5000, level=51, energy=20
  WHERE telegram_id='expedition-stale-level'`).run();
staleExpeditionDb.database.prepare(`UPDATE telegram_pet_instances
  SET pet_xp=5000, level=51, energy=20
  WHERE telegram_id='expedition-stale-level'`).run();
const staleExpeditionNow = new Date('2026-08-19T12:00:00Z');
const staleExpeditionState = await getPetEconomyState(staleExpeditionDb, 'expedition-stale-level', null, staleExpeditionNow);
assert.equal(staleExpeditionState.expedition.key, 'crystal_caves',
  'Crystal Expedition selection must use XP-derived visible level for stale stored-level pets');
assert.equal(staleExpeditionState.expedition.energy, 18);
const staleExpeditionResult = await runPetCrystalExpedition(staleExpeditionDb, 'expedition-stale-level', staleExpeditionNow, 'stale-level-expedition');
assert.equal(staleExpeditionResult.accepted, true);
assert.equal(staleExpeditionResult.expedition.key, 'crystal_caves',
  'Crystal Expedition settlement must use the same XP-derived tier as selection');
assert.equal(staleExpeditionDb.database.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='expedition-stale-level'").get().energy, 2,
  'Crystal Expedition settlement must charge the selected XP-derived tier energy cost');
const staleExpeditionClaim = staleExpeditionDb.database.prepare(`SELECT metadata FROM telegram_pet_reward_claims
  WHERE telegram_id='expedition-stale-level' AND source='pet_expedition'`).get();
assert.equal(JSON.parse(staleExpeditionClaim.metadata).context.expedition_key, 'crystal_caves',
  'Crystal Expedition reward claim reason must match the XP-derived reward tier');
assert.equal(JSON.parse(staleExpeditionClaim.metadata).context.energy_cost, 18,
  'Crystal Expedition claim metadata must record the selected XP-derived tier cost');

const recoveryFreezePurchaseDb = seedRepeatRewardPlayer('purchase-recovery-freeze', 70);
recoveryFreezePurchaseDb.database.prepare("UPDATE telegram_pet_profiles SET moon_gold = 100 WHERE telegram_id = 'purchase-recovery-freeze'").run();
await ensurePetStarterSeasonSlot(recoveryFreezePurchaseDb, 'purchase-recovery-freeze', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(recoveryFreezePurchaseDb, 'purchase-recovery-freeze');
insertWalletRecoveryRequired(recoveryFreezePurchaseDb, 'purchase-recovery-freeze');
const frozenPurchase = await processPetShopPurchase(recoveryFreezePurchaseDb, 'purchase-recovery-freeze', 'moon_kibble', { event_key: 'callback:buy:recovery-freeze', source: 'telegram_callback' });
assert.equal(frozenPurchase.accepted, false, 'pending historical recovery must freeze shop wallet spends');
assert.equal(frozenPurchase.reason, 'wallet_reconciliation_recovery_pending');
assert.deepEqual(
  { ...recoveryFreezePurchaseDb.database.prepare("SELECT moon_gold, equipped_food FROM telegram_pet_profiles WHERE telegram_id='purchase-recovery-freeze'").get() },
  { moon_gold: 100, equipped_food: null },
  'frozen shop spend must not mutate account wallet or equipment state',
);
assert.equal(
  recoveryFreezePurchaseDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='purchase-recovery-freeze' AND event_key='callback:buy:recovery-freeze'").get().count,
  0,
  'frozen shop spend must not create a receipt before recovery completes',
);
insertWalletReconciled(recoveryFreezePurchaseDb, 'purchase-recovery-freeze');
const thawedPurchase = await processPetShopPurchase(recoveryFreezePurchaseDb, 'purchase-recovery-freeze', 'moon_kibble', { event_key: 'callback:buy:recovery-freeze', source: 'telegram_callback' });
assert.equal(thawedPurchase.accepted, true, 'completed wallet reconciliation marker must unfreeze shop wallet spends');
assert.equal(recoveryFreezePurchaseDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='purchase-recovery-freeze'").get().moon_gold, 55,
  'unfrozen shop spend must debit account wallet exactly once');
assert.deepEqual(
  { moon_gold: thawedPurchase.pet.moon_gold, equipped_food: thawedPurchase.pet.equipped_food },
  { moon_gold: 55, equipped_food: 'moon_kibble' },
  'unfrozen shop response must return persisted wallet and equipment state',
);

function installAcceptedEventInsertRace(db, {
  telegramId,
  eventKey,
  eventType,
  reason,
  petXpAwarded = 0,
  xpAwarded = 0,
  profileUpdates = '',
  instanceUpdates = '',
  metadata = {},
}) {
  db.beforeBatchSql(/INSERT OR IGNORE INTO telegram_pet_events/, () => {
    const now = new Date().toISOString();
    const petId = db.database.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = ?').get(telegramId)?.pet_id || null;
    db.database.prepare(`
      INSERT INTO telegram_pet_events
        (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pet-s2026-003', ?, ?, 'accepted', ?, ?, ?)
    `).run(
      `race:${eventKey}`,
      petId,
      telegramId,
      eventType,
      eventKey,
      xpAwarded,
      petXpAwarded,
      new Date().toISOString().slice(0, 10),
      '2026-W33',
      reason,
      JSON.stringify(metadata),
      now,
    );
    if (profileUpdates) db.database.prepare(`UPDATE telegram_pet_profiles SET ${profileUpdates} WHERE telegram_id = ?`).run(telegramId);
    if (instanceUpdates && petId) db.database.prepare(`UPDATE telegram_pet_instances SET ${instanceUpdates} WHERE telegram_id = ? AND pet_id = ?`).run(telegramId, petId);
  });
}

const dailyRaceDb = seedRepeatRewardPlayer('daily-race', 70);
await ensurePetStarterSeasonSlot(dailyRaceDb, 'daily-race', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(dailyRaceDb, 'daily-race');
installAcceptedEventInsertRace(dailyRaceDb, {
  telegramId: 'daily-race',
  eventKey: 'callback:daily:race',
  eventType: 'daily_chest',
  reason: 'daily_chest',
  petXpAwarded: 40,
  profileUpdates: 'moon_gold = 40, style_tokens = 2, pet_xp = 40',
  instanceUpdates: 'pet_xp = 40',
  metadata: { source: 'race_fixture' },
});
const dailyRace = await processPetDailyChest(dailyRaceDb, 'daily-race', { event_key: 'callback:daily:race', source: 'telegram_callback' });
assert.equal(dailyRace.duplicate, true, 'daily chest INSERT OR IGNORE race must return the accepted idempotent result');
assert.deepEqual(
  { moon_gold: dailyRace.pet.moon_gold, style_tokens: dailyRace.pet.style_tokens, pet_xp: dailyRace.pet.pet_xp },
  { moon_gold: 40, style_tokens: 2, pet_xp: 40 },
  'daily chest duplicate race result must include the persisted account wallet and pet state',
);

const actionRaceDb = seedRepeatRewardPlayer('action-race', 70);
await ensurePetStarterSeasonSlot(actionRaceDb, 'action-race', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(actionRaceDb, 'action-race');
installAcceptedEventInsertRace(actionRaceDb, {
  telegramId: 'action-race',
  eventKey: 'callback:feed:race',
  eventType: 'feed',
  reason: 'accepted',
  petXpAwarded: 6,
  profileUpdates: 'moon_gold = 5, pet_xp = 6, hunger = 5',
  instanceUpdates: 'pet_xp = 6, hunger = 5',
  metadata: { source: 'race_fixture' },
});
const actionRace = await processPetAction(actionRaceDb, 'action-race', 'feed', { event_key: 'callback:feed:race', source: 'telegram_callback' });
assert.equal(actionRace.duplicate, true, 'pet action INSERT OR IGNORE race must return the accepted idempotent result');
assert.deepEqual(
  { moon_gold: actionRace.pet.moon_gold, pet_xp: actionRace.pet.pet_xp, hunger: actionRace.pet.hunger },
  { moon_gold: 5, pet_xp: 6, hunger: 5 },
  'pet action duplicate race result must include the persisted wallet and pet state',
);

const purchaseRaceDb = seedRepeatRewardPlayer('purchase-race', 70);
purchaseRaceDb.database.prepare("UPDATE telegram_pet_profiles SET moon_gold = 100 WHERE telegram_id = 'purchase-race'").run();
await ensurePetStarterSeasonSlot(purchaseRaceDb, 'purchase-race', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(purchaseRaceDb, 'purchase-race');
installAcceptedEventInsertRace(purchaseRaceDb, {
  telegramId: 'purchase-race',
  eventKey: 'callback:buy:race',
  eventType: 'buy',
  reason: 'shop_purchase',
  profileUpdates: "moon_gold = 55, equipped_food = 'moon_kibble'",
  instanceUpdates: "equipped_food = 'moon_kibble'",
  metadata: { source: 'race_fixture', item_key: 'moon_kibble' },
});
const purchaseRace = await processPetShopPurchase(purchaseRaceDb, 'purchase-race', 'moon_kibble', { event_key: 'callback:buy:race', source: 'telegram_callback' });
assert.equal(purchaseRace.duplicate, true, 'shop purchase INSERT OR IGNORE race must return the accepted idempotent result');
assert.deepEqual(
  { moon_gold: purchaseRace.pet.moon_gold, equipped_food: purchaseRace.pet.equipped_food },
  { moon_gold: 55, equipped_food: 'moon_kibble' },
  'shop purchase duplicate race result must include the persisted debit and equipment state',
);

const tradeRaceDb = seedRepeatRewardPlayer('trade-race', 70);
tradeRaceDb.database.prepare("UPDATE telegram_pet_profiles SET moon_gold = 200 WHERE telegram_id = 'trade-race'").run();
await ensurePetStarterSeasonSlot(tradeRaceDb, 'trade-race', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(tradeRaceDb, 'trade-race');
installAcceptedEventInsertRace(tradeRaceDb, {
  telegramId: 'trade-race',
  eventKey: 'callback:trade:race',
  eventType: 'trade',
  reason: 'trade_lost',
  petXpAwarded: 1,
  profileUpdates: 'moon_gold = 150, pet_xp = 1',
  instanceUpdates: 'pet_xp = 1',
  metadata: { source: 'race_fixture', wager: 50, won: false },
});
const tradeRace = await processPetGoldTrade(tradeRaceDb, 'trade-race', '50', { event_key: 'callback:trade:race', source: 'telegram_callback' });
assert.equal(tradeRace.duplicate, true, 'gold trade INSERT OR IGNORE race must return the accepted idempotent result');
assert.deepEqual(
  { moon_gold: tradeRace.pet.moon_gold, pet_xp: tradeRace.pet.pet_xp },
  { moon_gold: 150, pet_xp: 1 },
  'gold trade duplicate race result must include the persisted account-wallet debit and pet state',
);

const recoveryFreezeDailyDb = seedRepeatRewardPlayer('daily-recovery-freeze', 70);
await ensurePetStarterSeasonSlot(recoveryFreezeDailyDb, 'daily-recovery-freeze', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(recoveryFreezeDailyDb, 'daily-recovery-freeze');
insertWalletRecoveryRequired(recoveryFreezeDailyDb, 'daily-recovery-freeze');
const frozenDaily = await processPetDailyChest(recoveryFreezeDailyDb, 'daily-recovery-freeze', { event_key: 'callback:daily:recovery-freeze', source: 'telegram_callback' });
assert.equal(frozenDaily.accepted, false, 'pending historical recovery must freeze daily wallet credits');
assert.equal(frozenDaily.reason, 'wallet_reconciliation_recovery_pending');
assert.deepEqual(
  { ...recoveryFreezeDailyDb.database.prepare("SELECT moon_gold, style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='daily-recovery-freeze'").get() },
  { moon_gold: 0, style_tokens: 0, pet_xp: 0 },
  'frozen daily chest must not mutate account wallet or Pet XP state',
);
assert.equal(
  recoveryFreezeDailyDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='daily-recovery-freeze' AND event_key='callback:daily:recovery-freeze'").get().count,
  0,
  'frozen daily chest must not create a receipt before recovery completes',
);

const recoveryFreezeActionDb = seedRepeatRewardPlayer('action-recovery-freeze', 70);
await ensurePetStarterSeasonSlot(recoveryFreezeActionDb, 'action-recovery-freeze', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(recoveryFreezeActionDb, 'action-recovery-freeze');
insertWalletRecoveryRequired(recoveryFreezeActionDb, 'action-recovery-freeze');
const frozenAction = await processPetAction(recoveryFreezeActionDb, 'action-recovery-freeze', 'feed', { event_key: 'callback:feed:recovery-freeze', source: 'telegram_callback' });
assert.equal(frozenAction.accepted, false, 'pending historical recovery must freeze pet-action wallet credits');
assert.equal(frozenAction.reason, 'wallet_reconciliation_recovery_pending');
assert.deepEqual(
  { ...recoveryFreezeActionDb.database.prepare("SELECT moon_gold, pet_xp, hunger FROM telegram_pet_profiles WHERE telegram_id='action-recovery-freeze'").get() },
  { moon_gold: 0, pet_xp: 0, hunger: 25 },
  'frozen pet action must not mutate account wallet or pet-owned state',
);
assert.equal(
  recoveryFreezeActionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='action-recovery-freeze' AND event_key='callback:feed:recovery-freeze'").get().count,
  0,
  'frozen pet action must not create a receipt before recovery completes',
);

const recoveryFreezeRewardDb = seedRepeatRewardPlayer('reward-recovery-freeze', 70);
await ensurePetStarterSeasonSlot(recoveryFreezeRewardDb, 'reward-recovery-freeze', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(recoveryFreezeRewardDb, 'reward-recovery-freeze');
const recoveryFreezePetId = recoveryFreezeRewardDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='reward-recovery-freeze'").get().pet_id;
insertWalletRecoveryRequired(recoveryFreezeRewardDb, 'reward-recovery-freeze');
const frozenPetIdReward = await awardPetReward(recoveryFreezeRewardDb, {
  telegram_id: 'reward-recovery-freeze',
  pet_id: recoveryFreezePetId,
  source: 'pet_action',
  idempotency_key: 'reward-recovery-freeze',
  event_key: 'reward-recovery-freeze',
  event_type: 'feed',
  rewards: { moon_gold: 7, pet_xp: 5 },
});
assert.equal(frozenPetIdReward.accepted, false, 'pending historical recovery must freeze pet_id account-wallet rewards');
assert.equal(frozenPetIdReward.reason, 'wallet_reconciliation_recovery_pending');
assert.deepEqual(
  { ...recoveryFreezeRewardDb.database.prepare("SELECT moon_gold, pet_xp FROM telegram_pet_profiles WHERE telegram_id='reward-recovery-freeze'").get() },
  { moon_gold: 0, pet_xp: 0 },
  'frozen pet_id reward must not mutate account wallet or compatibility profile Pet XP',
);
assert.equal(
  recoveryFreezeRewardDb.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id = ?').get(recoveryFreezePetId).pet_xp,
  0,
  'frozen pet_id reward must not mutate pet-owned Pet XP',
);
insertWalletReconciled(recoveryFreezeRewardDb, 'reward-recovery-freeze');
const thawedPetIdReward = await awardPetReward(recoveryFreezeRewardDb, {
  telegram_id: 'reward-recovery-freeze',
  pet_id: recoveryFreezePetId,
  source: 'pet_action',
  idempotency_key: 'reward-recovery-freeze',
  event_key: 'reward-recovery-freeze',
  event_type: 'feed',
  rewards: { moon_gold: 7, pet_xp: 5 },
});
assert.equal(thawedPetIdReward.accepted, true, 'completed wallet reconciliation marker must unfreeze pet_id account-wallet rewards');
assert.equal(recoveryFreezeRewardDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='reward-recovery-freeze'").get().moon_gold, 7,
  'unfrozen pet_id reward must apply the account wallet credit exactly once');
assert.equal(recoveryFreezeRewardDb.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id = ?').get(recoveryFreezePetId).pet_xp, 5,
  'unfrozen pet_id reward must still apply Pet XP to the pet-owned instance');

const purchaseRecoveryDb = seedRepeatRewardPlayer('purchase-recovery', 70);
purchaseRecoveryDb.database.prepare("UPDATE telegram_pet_profiles SET moon_gold = 100 WHERE telegram_id = 'purchase-recovery'").run();
await ensurePetStarterSeasonSlot(purchaseRecoveryDb, 'purchase-recovery', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(purchaseRecoveryDb, 'purchase-recovery');
purchaseRecoveryDb.failBatchOnSql(/UPDATE telegram_pet_profiles\s+SET equipped_food = \?/);
await assert.rejects(
  processPetShopPurchase(purchaseRecoveryDb, 'purchase-recovery', 'moon_kibble', { event_key: 'callback:buy:failure', source: 'telegram_callback' }),
  /simulated_d1_batch_failure/,
  'shop purchase persistence failure must surface so the callback can retry',
);
assert.deepEqual(
  { ...purchaseRecoveryDb.database.prepare("SELECT moon_gold, equipped_food FROM telegram_pet_profiles WHERE telegram_id='purchase-recovery'").get() },
  { moon_gold: 100, equipped_food: null },
  'failed shop purchase batch must roll back the wallet debit and profile equipment',
);
assert.equal(
  purchaseRecoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='purchase-recovery' AND event_key='callback:buy:failure' AND status='accepted'").get().count,
  0,
  'shop purchase must not commit an accepted receipt before wallet/profile persistence succeeds',
);
const recoveredPurchase = await processPetShopPurchase(purchaseRecoveryDb, 'purchase-recovery', 'moon_kibble', { event_key: 'callback:buy:failure', source: 'telegram_callback' });
assert.equal(recoveredPurchase.accepted, true, 'shop purchase retry should settle after failed persistence rolls back');
assert.deepEqual(
  { ...purchaseRecoveryDb.database.prepare("SELECT moon_gold, equipped_food FROM telegram_pet_profiles WHERE telegram_id='purchase-recovery'").get() },
  { moon_gold: 55, equipped_food: 'moon_kibble' },
  'retried shop purchase must persist the debit and equipment exactly once',
);
const duplicateRecoveredPurchase = await processPetShopPurchase(purchaseRecoveryDb, 'purchase-recovery', 'moon_kibble', { event_key: 'callback:buy:failure', source: 'telegram_callback' });
assert.equal(duplicateRecoveredPurchase.duplicate, true, 'shop purchase duplicate after recovered failure must return the accepted receipt');
assert.deepEqual(
  { ...purchaseRecoveryDb.database.prepare("SELECT moon_gold, equipped_food FROM telegram_pet_profiles WHERE telegram_id='purchase-recovery'").get() },
  { moon_gold: 55, equipped_food: 'moon_kibble' },
  'shop purchase duplicate after recovery must not debit the account wallet again',
);

const tradeRecoveryDb = seedRepeatRewardPlayer('trade-recovery', 70);
tradeRecoveryDb.database.prepare("UPDATE telegram_pet_profiles SET moon_gold = 200, happiness = 90, cleanliness = 90, hunger = 10 WHERE telegram_id = 'trade-recovery'").run();
await ensurePetStarterSeasonSlot(tradeRecoveryDb, 'trade-recovery', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(tradeRecoveryDb, 'trade-recovery');
tradeRecoveryDb.failBatchOnSql(/UPDATE telegram_pet_profiles\s+SET pet_xp = \?/);
const tradeRecoveryRandom = Math.random;
Math.random = () => 0.9;
try {
  await assert.rejects(
    processPetGoldTrade(tradeRecoveryDb, 'trade-recovery', '50', { event_key: 'callback:trade:failure', source: 'telegram_callback' }),
    /simulated_d1_batch_failure/,
    'gold trade persistence failure must surface so the callback can retry',
  );
  assert.deepEqual(
    { ...tradeRecoveryDb.database.prepare("SELECT moon_gold, moon_crystals, pet_xp FROM telegram_pet_profiles WHERE telegram_id='trade-recovery'").get() },
    { moon_gold: 200, moon_crystals: 0, pet_xp: 0 },
    'failed gold trade batch must roll back wallet credits and profile Pet XP',
  );
  assert.equal(
    tradeRecoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='trade-recovery' AND event_key='callback:trade:failure' AND status='accepted'").get().count,
    0,
    'gold trade must not commit an accepted receipt before wallet/profile persistence succeeds',
  );
  const recoveredTrade = await processPetGoldTrade(tradeRecoveryDb, 'trade-recovery', '50', { event_key: 'callback:trade:failure', source: 'telegram_callback' });
  assert.equal(recoveredTrade.accepted, true, 'gold trade retry should settle after failed persistence rolls back');
  assert.deepEqual(
    { ...tradeRecoveryDb.database.prepare("SELECT moon_gold, moon_crystals, pet_xp FROM telegram_pet_profiles WHERE telegram_id='trade-recovery'").get() },
    { moon_gold: 237, moon_crystals: 1, pet_xp: 6 },
    'retried gold trade must persist wallet credits and Pet XP exactly once',
  );
  assert.deepEqual(
    { moon_gold: recoveredTrade.pet.moon_gold, moon_crystals: recoveredTrade.pet.moon_crystals, pet_xp: recoveredTrade.pet.pet_xp },
    { moon_gold: 237, moon_crystals: 1, pet_xp: 6 },
    'retried gold trade response must return persisted wallet and pet state',
  );
  const duplicateRecoveredTrade = await processPetGoldTrade(tradeRecoveryDb, 'trade-recovery', '50', { event_key: 'callback:trade:failure', source: 'telegram_callback' });
  assert.equal(duplicateRecoveredTrade.duplicate, true, 'gold trade duplicate after recovered failure must return the accepted receipt');
  assert.deepEqual(
    { ...tradeRecoveryDb.database.prepare("SELECT moon_gold, moon_crystals, pet_xp FROM telegram_pet_profiles WHERE telegram_id='trade-recovery'").get() },
    { moon_gold: 237, moon_crystals: 1, pet_xp: 6 },
    'gold trade duplicate after recovery must not mutate wallet or pet state again',
  );
} finally {
  Math.random = tradeRecoveryRandom;
}

const dailyChestRecoveryDb = seedRepeatRewardPlayer('daily-chest-recovery', 70);
await ensurePetStarterSeasonSlot(dailyChestRecoveryDb, 'daily-chest-recovery', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(dailyChestRecoveryDb, 'daily-chest-recovery');
dailyChestRecoveryDb.failBatchOnSql(/UPDATE telegram_pet_profiles SET\s+pet_xp = \?/);
await assert.rejects(
  processPetDailyChest(dailyChestRecoveryDb, 'daily-chest-recovery', { event_key: 'callback:daily:failure', source: 'telegram_callback' }),
  /simulated_d1_batch_failure/,
  'daily chest persistence failure must surface so the same receipt can retry',
);
assert.deepEqual(
  { ...dailyChestRecoveryDb.database.prepare("SELECT moon_gold, style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='daily-chest-recovery'").get() },
  { moon_gold: 0, style_tokens: 0, pet_xp: 0 },
  'failed daily chest batch must not leave wallet credits or profile Pet XP behind',
);
assert.equal(
  dailyChestRecoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='daily-chest-recovery' AND event_type='daily_chest' AND status='accepted'").get().count,
  0,
  'daily chest must not commit an accepted receipt before wallet/profile persistence succeeds',
);
const recoveredDailyChest = await processPetDailyChest(dailyChestRecoveryDb, 'daily-chest-recovery', { event_key: 'callback:daily:failure', source: 'telegram_callback' });
assert.equal(recoveredDailyChest.accepted, true, 'daily chest retry should settle after the failed batch rolls back');
assert.deepEqual(
  { ...dailyChestRecoveryDb.database.prepare("SELECT moon_gold, style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='daily-chest-recovery'").get() },
  { moon_gold: 40, style_tokens: 2, pet_xp: 40 },
  'retried daily chest must persist wallet credits and profile Pet XP exactly once',
);
assert.deepEqual(
  { moon_gold: recoveredDailyChest.pet.moon_gold, style_tokens: recoveredDailyChest.pet.style_tokens, pet_xp: recoveredDailyChest.pet.pet_xp },
  { moon_gold: 40, style_tokens: 2, pet_xp: 40 },
  'retried daily chest response must return persisted wallet and pet state',
);
assert.deepEqual(
  { ...dailyChestRecoveryDb.database.prepare("SELECT pet_id, status, pet_xp_awarded FROM telegram_pet_events WHERE telegram_id='daily-chest-recovery' AND event_type='daily_chest'").get() },
  { pet_id: 'pet:daily-chest-recovery:pet-s2026-003:1', status: 'accepted', pet_xp_awarded: 40 },
  'daily chest accepted receipt must be tied to the active pet after persistence succeeds',
);
const duplicateDailyChest = await processPetDailyChest(dailyChestRecoveryDb, 'daily-chest-recovery', { event_key: 'callback:daily:failure', source: 'telegram_callback' });
assert.equal(duplicateDailyChest.duplicate, true, 'daily chest duplicate callback must resolve from the accepted receipt');
assert.deepEqual(
  { ...dailyChestRecoveryDb.database.prepare("SELECT moon_gold, style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='daily-chest-recovery'").get() },
  { moon_gold: 40, style_tokens: 2, pet_xp: 40 },
  'duplicate daily chest callback must not reapply wallet or Pet XP rewards',
);

const actionRecoveryDb = seedRepeatRewardPlayer('pet-action-recovery', 70);
await ensurePetStarterSeasonSlot(actionRecoveryDb, 'pet-action-recovery', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(actionRecoveryDb, 'pet-action-recovery');
actionRecoveryDb.failBatchOnSql(/UPDATE telegram_pet_profiles SET\s+pet_xp = \?/);
await assert.rejects(
  processPetAction(actionRecoveryDb, 'pet-action-recovery', 'feed', { event_key: 'callback:feed:failure', source: 'telegram_callback' }),
  /simulated_d1_batch_failure/,
  'pet action persistence failure must surface so the same receipt can retry',
);
assert.deepEqual(
  { ...actionRecoveryDb.database.prepare("SELECT moon_gold, style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='pet-action-recovery'").get() },
  { moon_gold: 0, style_tokens: 0, pet_xp: 0 },
  'failed pet action batch must not leave wallet credits or profile Pet XP behind',
);
assert.equal(
  actionRecoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='pet-action-recovery' AND event_key='callback:feed:failure' AND status='accepted'").get().count,
  0,
  'pet actions must not commit accepted receipts before wallet/profile persistence succeeds',
);
const recoveredAction = await processPetAction(actionRecoveryDb, 'pet-action-recovery', 'feed', { event_key: 'callback:feed:failure', source: 'telegram_callback' });
assert.equal(recoveredAction.accepted, true, 'pet action retry should settle after the failed batch rolls back');
assert.deepEqual(
  { ...actionRecoveryDb.database.prepare("SELECT moon_gold, pet_xp FROM telegram_pet_profiles WHERE telegram_id='pet-action-recovery'").get() },
  { moon_gold: 5, pet_xp: 6 },
  'retried pet action must persist wallet credits and profile Pet XP exactly once',
);
assert.deepEqual(
  { moon_gold: recoveredAction.pet.moon_gold, pet_xp: recoveredAction.pet.pet_xp },
  { moon_gold: 5, pet_xp: 6 },
  'retried pet action response must return persisted wallet and pet state',
);
assert.deepEqual(
  { ...actionRecoveryDb.database.prepare("SELECT pet_id, status, pet_xp_awarded FROM telegram_pet_events WHERE telegram_id='pet-action-recovery' AND event_key='callback:feed:failure'").get() },
  { pet_id: 'pet:pet-action-recovery:pet-s2026-003:1', status: 'accepted', pet_xp_awarded: 6 },
  'pet action accepted receipt must be tied to the active pet after persistence succeeds',
);
const duplicateAction = await processPetAction(actionRecoveryDb, 'pet-action-recovery', 'feed', { event_key: 'callback:feed:failure', source: 'telegram_callback' });
assert.equal(duplicateAction.duplicate, true, 'pet action duplicate callback must resolve from the accepted receipt');
assert.deepEqual(
  { ...actionRecoveryDb.database.prepare("SELECT moon_gold, pet_xp FROM telegram_pet_profiles WHERE telegram_id='pet-action-recovery'").get() },
  { moon_gold: 5, pet_xp: 6 },
  'duplicate pet action callback must not reapply wallet or Pet XP rewards',
);

function seedPetActivitySession(telegramId, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const elapsedSeconds = Number(options.elapsed_seconds || 1800);
  const startedAt = new Date(now.getTime() - elapsedSeconds * 1000).toISOString();
  const endsAt = new Date(options.ends_at || now.getTime() + 3600 * 1000).toISOString().replace('T', ' ').replace('.000Z', '');
  const sessionId = options.session_id || `activity-${telegramId}`;
  const db = seedRepeatRewardPlayer(telegramId, 70, now.toISOString());
  db.database.prepare(`
    INSERT INTO telegram_pet_activity_sessions
      (id, telegram_id, activity_type, started_at, ends_at, status, metadata)
    VALUES (?, ?, ?, ?, ?, 'active', '{}')
  `).run(sessionId, telegramId, options.activity_type || 'train', startedAt, endsAt);
  return { db, sessionId, now };
}

const activityNow = new Date('2026-08-10T16:00:00.000Z');
const normalActivity = seedPetActivitySession('activity-normal', { now: activityNow, elapsed_seconds: 1800 });
const normalActivityClaim = await claimPetActivitySession(normalActivity.db, 'activity-normal', { now: activityNow, source: 'activity_claim_regression' });
assert.equal(normalActivityClaim.accepted, true, 'an active activity past the minimum duration must claim successfully');
assert.equal(normalActivityClaim.reason, 'claimed', 'the winning activity claim must report claimed');
assert.deepEqual(
  { ...normalActivity.db.database.prepare("SELECT status, claimed_at FROM telegram_pet_activity_sessions WHERE id = 'activity-activity-normal'").get() },
  { status: 'completed', claimed_at: activityNow.toISOString() },
  'the session must reach its claimed terminal state before rewards are returned',
);
assert.deepEqual(
  { ...normalActivity.db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'activity-normal'").get(),
    ...normalActivity.db.database.prepare("SELECT xp AS community_xp FROM telegram_users WHERE telegram_id = 'activity-normal'").get() },
  { pet_xp: 26, community_xp: 2 },
  'a normal activity claim must grant its Pet XP and Community XP exactly once',
);
const duplicateActivityClaim = await claimPetActivitySession(normalActivity.db, 'activity-normal', { now: activityNow, source: 'activity_claim_regression' });
assert.equal(duplicateActivityClaim.accepted, false, 'a duplicate activity claim must lose after the session is terminal');
assert.equal(duplicateActivityClaim.reason, 'no_active_activity', 'a duplicate activity claim must return safely');
assert.equal(normalActivity.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'activity-normal' AND event_type = 'activity_claim'").get().count, 1,
  'a duplicate activity claim must not create a second reward event');
assert.equal(normalActivity.db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'activity-normal'").get().pet_xp, 26,
  'a duplicate activity claim must not grant Pet XP twice');

const recoverableActivity = seedPetActivitySession('activity-reward-retry', { now: activityNow, elapsed_seconds: 1800 });
recoverableActivity.db.failOnBatch(1);
await assert.rejects(
  claimPetActivitySession(recoverableActivity.db, 'activity-reward-retry', { now: activityNow, source: 'activity_claim_regression' }),
  /simulated_d1_batch_failure/,
  'a transient reward settlement failure must propagate so the caller can retry',
);
const interruptedActivitySession = recoverableActivity.db.database.prepare(
  "SELECT status, metadata FROM telegram_pet_activity_sessions WHERE id = 'activity-activity-reward-retry'",
).get();
assert.equal(interruptedActivitySession.status, 'completed', 'a reserved claim must remain closed to cancel and expiry callbacks');
assert.equal(JSON.parse(interruptedActivitySession.metadata).claim_state, 'claiming', 'a failed reward settlement must leave a recoverable claim checkpoint');
assert.equal(recoverableActivity.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'activity-reward-retry'").get().count, 0,
  'a failed transactional reward settlement must not leave partial rewards');
const retriedActivityClaim = await claimPetActivitySession(recoverableActivity.db, 'activity-reward-retry', {
  now: new Date(activityNow.getTime() + 60_000), source: 'activity_claim_regression',
});
assert.equal(retriedActivityClaim.accepted, true, 'retrying a recoverable activity claim must settle the original reward');
assert.equal(retriedActivityClaim.reason, 'claimed', 'a successful recovery must report a claimed activity');
assert.equal(JSON.parse(recoverableActivity.db.database.prepare(
  "SELECT metadata FROM telegram_pet_activity_sessions WHERE id = 'activity-activity-reward-retry'",
).get().metadata).claim_state, 'settled', 'the session must become settled only after reward issuance succeeds');
assert.equal(recoverableActivity.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'activity-reward-retry' AND event_type = 'activity_claim'").get().count, 1,
  'a reward failure followed by retry must create exactly one reward event');
assert.equal(recoverableActivity.db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'activity-reward-retry'").get().pet_xp, 26,
  'a reward failure followed by retry must grant the earned Pet XP exactly once');

const committedActivity = seedPetActivitySession('activity-committed-retry', {
  now: activityNow,
  elapsed_seconds: 7200,
  activity_type: 'explore',
  ends_at: new Date(activityNow.getTime() + 6 * 3600 * 1000).toISOString(),
});
let failCommittedSettlement = true;
committedActivity.db.beforeRun = async (sql) => {
  if (failCommittedSettlement && sql.includes('UPDATE telegram_pet_activity_sessions') && sql.includes('SET metadata = ?')) {
    failCommittedSettlement = false;
    throw new Error('simulated_activity_settlement_failure');
  }
};
await assert.rejects(
  claimPetActivitySession(committedActivity.db, 'activity-committed-retry', { now: activityNow, source: 'activity_claim_regression' }),
  /simulated_activity_settlement_failure/,
  'a caller failure after reward commit must leave the committed award recoverable',
);
committedActivity.db.beforeRun = null;
assert.equal(committedActivity.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'activity-committed-retry' AND event_type = 'activity_claim'").get().count, 1,
  'the interrupted caller must have exactly one committed reward event');
assert.equal(committedActivity.db.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'activity-committed-retry' AND asset_type = 'item' AND asset_key = 'adventure_map'").get().quantity, 1,
  'the interrupted caller must retain its committed authority-backed item');
const committedActivityRetry = await claimPetActivitySession(committedActivity.db, 'activity-committed-retry', {
  now: new Date(activityNow.getTime() + 60_000), source: 'activity_claim_regression',
});
assert.equal(committedActivityRetry.accepted, true, 'retry after a committed reward must settle successfully');
assert.equal(committedActivityRetry.duplicate, true, 'retry after a committed reward must reuse the original claim');
assert.equal(committedActivityRetry.pet_xp_awarded, 36, 'retry must recover the original awarded Pet XP');
assert.equal(committedActivityRetry.rewards.moon_gold, 32, 'retry must recover the original awarded currency');
assert.equal(committedActivityRetry.rewards.items.adventure_map, 1, 'retry must recover the original applied item');
assert.equal(committedActivityRetry.pet.telegram_id, 'activity-committed-retry', 'retry must recover the authoritative Pet state for user-facing output');
const committedSettlementMetadata = JSON.parse(committedActivity.db.database.prepare(
  "SELECT metadata FROM telegram_pet_activity_sessions WHERE id = 'activity-activity-committed-retry'",
).get().metadata);
assert.equal(committedSettlementMetadata.claim_state, 'settled', 'the recovered committed reward must settle the session');
assert.equal(committedSettlementMetadata.applied_rewards.pet_xp, 36, 'settlement metadata must preserve original awarded Pet XP');
assert.equal(committedSettlementMetadata.applied_rewards.moon_gold, 32, 'settlement metadata must preserve original awarded currency');
assert.equal(committedSettlementMetadata.applied_rewards.items.adventure_map, 1, 'settlement metadata must preserve original applied items');
const committedActivityDuplicate = await claimPetActivitySession(committedActivity.db, 'activity-committed-retry', {
  now: new Date(activityNow.getTime() + 120_000), source: 'activity_claim_regression',
});
assert.equal(committedActivityDuplicate.accepted, false, 'a retry after settlement must not award again');
assert.equal(committedActivity.db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'activity-committed-retry'").get().pet_xp, 36,
  'duplicate retry must not add Pet XP');
assert.equal(committedActivity.db.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'activity-committed-retry' AND asset_type = 'item' AND asset_key = 'adventure_map'").get().quantity, 1,
  'duplicate retry must not add items');
assert.deepEqual(JSON.parse(committedActivity.db.database.prepare(
  "SELECT metadata FROM telegram_pet_activity_sessions WHERE id = 'activity-activity-committed-retry'",
).get().metadata), committedSettlementMetadata, 'duplicate retry must not corrupt settled metadata');

const concurrentActivity = seedPetActivitySession('activity-concurrent', { now: activityNow, elapsed_seconds: 1800 });
let concurrentClaimReservations = 0;
let releaseConcurrentClaims;
let markConcurrentClaimsReached;
const concurrentClaimsReached = new Promise((resolve) => { markConcurrentClaimsReached = resolve; });
const continueConcurrentClaims = new Promise((resolve) => { releaseConcurrentClaims = resolve; });
concurrentActivity.db.beforeRun = async (sql) => {
  if (sql.includes('UPDATE telegram_pet_activity_sessions') && sql.includes("SET status = 'completed'")) {
    concurrentClaimReservations += 1;
    if (concurrentClaimReservations === 2) markConcurrentClaimsReached();
    await continueConcurrentClaims;
  }
};
const concurrentActivityClaimPromises = [
  claimPetActivitySession(concurrentActivity.db, 'activity-concurrent', { now: activityNow, source: 'activity_claim_regression' }),
  claimPetActivitySession(concurrentActivity.db, 'activity-concurrent', { now: activityNow, source: 'activity_claim_regression' }),
];
await concurrentClaimsReached;
concurrentActivity.db.beforeRun = null;
releaseConcurrentClaims();
const concurrentActivityClaims = await Promise.all(concurrentActivityClaimPromises);
assert.ok(concurrentActivityClaims.every((claim) => claim.accepted), 'both concurrent callers must receive the settled reward result');
assert.deepEqual(concurrentActivityClaims.map((claim) => claim.pet_xp_awarded), [26, 26], 'concurrent callers must receive consistent awarded Pet XP');
assert.deepEqual(concurrentActivityClaims.map((claim) => claim.xp_awarded), [2, 2], 'concurrent callers must receive consistent awarded Community XP');
assert.ok(concurrentActivityClaims.every((claim) => claim.pet?.telegram_id === 'activity-concurrent'), 'concurrent callers must receive the authoritative Pet state');
assert.equal(concurrentActivity.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'activity-concurrent' AND event_type = 'activity_claim'").get().count, 1,
  'two simultaneous activity claims must create exactly one reward event');
assert.equal(concurrentActivity.db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'activity-concurrent'").get().pet_xp, 26,
  'two simultaneous activity claims must grant Pet XP exactly once');

const cancelRaceActivity = seedPetActivitySession('activity-cancel-race', {
  now: activityNow,
  elapsed_seconds: 1800,
  // Keep this claim/cancel fixture independent from the wall clock. Expiry has
  // its own dedicated race test below.
  ends_at: '2099-01-01T00:00:00.000Z',
});
let releaseCancelRaceClaim;
let markCancelRaceClaimReached;
const cancelRaceClaimReached = new Promise((resolve) => { markCancelRaceClaimReached = resolve; });
const continueCancelRaceClaim = new Promise((resolve) => { releaseCancelRaceClaim = resolve; });
cancelRaceActivity.db.beforeRun = async (sql) => {
  if (sql.includes('UPDATE telegram_pet_activity_sessions') && sql.includes("SET status = 'completed'")) {
    markCancelRaceClaimReached();
    await continueCancelRaceClaim;
  }
};
const racingActivityClaim = claimPetActivitySession(cancelRaceActivity.db, 'activity-cancel-race', { now: activityNow, source: 'activity_claim_regression' });
await cancelRaceClaimReached;
const racingActivityCancel = await cancelPetActivitySession(cancelRaceActivity.db, 'activity-cancel-race');
cancelRaceActivity.db.beforeRun = null;
releaseCancelRaceClaim();
const losingActivityClaim = await racingActivityClaim;
assert.equal(racingActivityCancel.accepted, true, 'cancellation must win when it atomically closes the active session first');
assert.equal(losingActivityClaim.accepted, false, 'a claim callback that loses to cancellation must not award rewards');
assert.equal(losingActivityClaim.reason, 'activity_already_closed', 'a claim callback that loses the terminal race must return safely');
assert.equal(cancelRaceActivity.db.database.prepare("SELECT status FROM telegram_pet_activity_sessions WHERE id = 'activity-activity-cancel-race'").get().status, 'cancelled',
  'the claim/cancel race must preserve the winning cancellation state');
assert.equal(cancelRaceActivity.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'activity-cancel-race'").get().count, 0,
  'a claim callback that loses to cancellation must not create a reward event');
assert.equal(cancelRaceActivity.db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'activity-cancel-race'").get().pet_xp, 0,
  'a claim callback that loses to cancellation must not grant Pet XP');

const expiryEndsAt = new Date(activityNow.getTime() - 23 * 3600 * 1000).toISOString();
const expiryRaceActivity = seedPetActivitySession('activity-expiry-race', {
  now: activityNow, elapsed_seconds: 25 * 3600, ends_at: expiryEndsAt,
});
let releaseExpiryRaceClaim;
let markExpiryRaceClaimReached;
const expiryRaceClaimReached = new Promise((resolve) => { markExpiryRaceClaimReached = resolve; });
const continueExpiryRaceClaim = new Promise((resolve) => { releaseExpiryRaceClaim = resolve; });
expiryRaceActivity.db.beforeRun = async (sql) => {
  if (sql.includes('UPDATE telegram_pet_activity_sessions') && sql.includes("SET status = 'completed'")) {
    markExpiryRaceClaimReached();
    await continueExpiryRaceClaim;
  }
};
const racingExpiryClaim = claimPetActivitySession(expiryRaceActivity.db, 'activity-expiry-race', { now: activityNow, source: 'activity_claim_regression' });
await expiryRaceClaimReached;
await expireOldPetActivitySessions(expiryRaceActivity.db, 'activity-expiry-race', new Date(activityNow.getTime() + 2 * 3600 * 1000));
expiryRaceActivity.db.beforeRun = null;
releaseExpiryRaceClaim();
const losingExpiryClaim = await racingExpiryClaim;
assert.equal(losingExpiryClaim.accepted, false, 'a claim callback that loses to expiry must not award rewards');
assert.equal(losingExpiryClaim.reason, 'activity_already_closed', 'an expiry-race loser must return safely');
assert.equal(expiryRaceActivity.db.database.prepare("SELECT status FROM telegram_pet_activity_sessions WHERE id = 'activity-activity-expiry-race'").get().status, 'expired',
  'the claim/expiry race must preserve the winning expired state');
assert.equal(expiryRaceActivity.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'activity-expiry-race'").get().count, 0,
  'an expired session must not create a reward event');

const cappedActivity = seedPetActivitySession('activity-caps', { now: activityNow, elapsed_seconds: 1800 });
seedAcceptedDailyPetEvent(cappedActivity.db, 'activity-caps', 'activity-caps-prior', 1199, 249, '2026-08-10');
const cappedActivityClaim = await claimPetActivitySession(cappedActivity.db, 'activity-caps', { now: activityNow, source: 'activity_claim_regression' });
assert.equal(cappedActivityClaim.pet_xp_awarded, 1, 'activity claims must preserve the 1,200/day Pet XP cap');
assert.equal(cappedActivityClaim.xp_awarded, 1, 'activity claims must preserve the 250/day Community XP cap');

const itemActivity = seedPetActivitySession('activity-item', {
  now: activityNow, elapsed_seconds: 7200, activity_type: 'explore',
  ends_at: new Date(activityNow.getTime() + 6 * 3600 * 1000).toISOString(),
});
const itemActivityClaim = await claimPetActivitySession(itemActivity.db, 'activity-item', { now: activityNow, source: 'activity_claim_regression' });
assert.equal(itemActivityClaim.accepted, true, 'an eligible explore activity item claim must succeed');
assert.equal(itemActivity.db.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'activity-item' AND asset_type = 'item' AND asset_key = 'adventure_map'").get().quantity, 1,
  'activity item rewards must use telegram_pet_inventory as their balance authority');
await claimPetActivitySession(itemActivity.db, 'activity-item', { now: activityNow, source: 'activity_claim_regression' });
assert.equal((await getPetInventory(itemActivity.db, 'activity-item')).find((item) => item.key === 'adventure_map').count, 1,
  'duplicate activity callbacks must not duplicate authority-backed item rewards');

const inventoryAuthorityDb = seedRepeatRewardPlayer('inventory-authority', 70);
const inventoryAwardRequest = {
  telegram_id: 'inventory-authority', source: 'pet_action', idempotency_key: 'inventory-authority-award',
  event_key: 'inventory-authority-award', rewards: { items: { moon_snack: 1 } },
};
const [inventoryAward, duplicateInventoryAward] = await Promise.all([
  awardPetReward(inventoryAuthorityDb, inventoryAwardRequest),
  awardPetReward(inventoryAuthorityDb, inventoryAwardRequest),
]);
assert.equal(inventoryAward.accepted, true, 'awardPetReward item claims must succeed');
assert.equal(duplicateInventoryAward.accepted, true, 'duplicate item reward callbacks must remain idempotently accepted');
assert.equal(inventoryAuthorityDb.database.prepare(`SELECT quantity FROM telegram_pet_inventory
  WHERE telegram_id = 'inventory-authority' AND asset_type = 'item' AND asset_key = 'moon_snack'`).get().quantity, 1,
  'duplicate reward callbacks must write an item exactly once');
assert.equal((await getPetInventory(inventoryAuthorityDb, 'inventory-authority')).find((item) => item.key === 'moon_snack').count, 1,
  'awardPetReward items must appear through getPetInventory');
const usedAuthorityItem = await processPetUseItem(inventoryAuthorityDb, 'inventory-authority', 'moon_snack', {
  event_key: 'inventory-authority-use', source: 'inventory_authority_regression',
});
assert.equal(usedAuthorityItem.accepted, true, 'an authority-awarded item must be usable');
assert.equal((await getPetInventory(inventoryAuthorityDb, 'inventory-authority')).find((item) => item.key === 'moon_snack').count, 0,
  'using an item must decrement the authoritative inventory balance');
const duplicateAuthorityUse = await processPetUseItem(inventoryAuthorityDb, 'inventory-authority', 'moon_snack', {
  event_key: 'inventory-authority-use', source: 'inventory_authority_regression',
});
assert.equal(duplicateAuthorityUse.duplicate, true, 'duplicate use callbacks must not consume or reward an item twice');
assert.equal(inventoryAuthorityDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'inventory-authority'").get().pet_xp, 4,
  'duplicate item-use callbacks must award their capped effect exactly once');

// Mixed-version cutover: the legacy Worker writes only audit events, migration
// 045 checkpoints them, and the new Worker closes any late-write gap before it
// reads or mutates authoritative inventory.
const cutoverDb = seedRepeatRewardPlayer('inventory-cutover', 70);
const insertLegacyItemEvent = cutoverDb.database.prepare(`INSERT OR IGNORE INTO telegram_pet_events
  (id, telegram_id, event_type, event_key, season_key, day_key, week_key, status, reason, metadata)
  VALUES (?, 'inventory-cutover', ?, ?, 'pet-s2026-003', '2026-08-11', '2026-W33', 'accepted', ?, ?)`);
insertLegacyItemEvent.run('cutover-before-045', 'daily_chest', 'cutover:grant:before-045', 'daily_chest', '{"item_key":"moon_snack","count":2}');
cutoverDb.database.exec(inventoryReconciliationMigration);
assert.equal(cutoverDb.database.prepare(`SELECT quantity FROM telegram_pet_inventory
  WHERE telegram_id = 'inventory-cutover' AND asset_type = 'item' AND asset_key = 'moon_snack'`).get().quantity, 2,
  'migration 045 must reconcile the legacy grant visible at migration time');

insertLegacyItemEvent.run('cutover-after-045-grant', 'daily_chest', 'cutover:grant:after-045', 'daily_chest', '{"item_key":"moon_snack","count":2}');
insertLegacyItemEvent.run('cutover-after-045-consume', 'use_item', 'cutover:consume:after-045', 'item_used', '{"consumed_item_key":"moon_snack"}');
insertLegacyItemEvent.run('cutover-after-045-grant-duplicate', 'daily_chest', 'cutover:grant:after-045', 'daily_chest', '{"item_key":"moon_snack","count":2}');
insertLegacyItemEvent.run('cutover-after-045-consume-duplicate', 'use_item', 'cutover:consume:after-045', 'item_used', '{"consumed_item_key":"moon_snack"}');

assert.equal((await getPetInventory(cutoverDb, 'inventory-cutover')).find((item) => item.key === 'moon_snack').count, 3,
  'the new Worker must reconcile late legacy grants and consumption exactly once at cutover');
const cutoverAuthorityAward = {
  telegram_id: 'inventory-cutover', source: 'pet_action', idempotency_key: 'cutover-authority-award',
  event_key: 'cutover-authority-award', rewards: { items: { moon_snack: 1 } },
};
await awardPetReward(cutoverDb, cutoverAuthorityAward);
await awardPetReward(cutoverDb, cutoverAuthorityAward);
assert.equal((await getPetInventory(cutoverDb, 'inventory-cutover')).find((item) => item.key === 'moon_snack').count, 4,
  'new-authority grants and duplicate callbacks must preserve the reconciled balance');
await processPetUseItem(cutoverDb, 'inventory-cutover', 'moon_snack', {
  event_key: 'cutover-authority-consume', source: 'inventory_cutover_regression',
});
await processPetUseItem(cutoverDb, 'inventory-cutover', 'moon_snack', {
  event_key: 'cutover-authority-consume', source: 'inventory_cutover_regression',
});
assert.equal((await getPetInventory(cutoverDb, 'inventory-cutover')).find((item) => item.key === 'moon_snack').count, 3,
  'new-authority consumption and duplicate callbacks must decrement exactly once');

const bankedItemDb = seedRepeatRewardPlayer('banked-item', 70);
await ensurePetStarterSeasonSlot(bankedItemDb, 'banked-item', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(bankedItemDb, 'banked-item');
const bankedItemPet = bankedItemDb.database.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='banked-item'").get();
bankedItemDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level, unbanked_items)
  VALUES ('banked-item-row', ?, 'banked-item', 'banked-item-run', 'pet-s2026-003', 'active', 1, 5, 1, '{"energy_drink":1}')`).run(bankedItemPet.pet_id);
const bankedItemResult = await processPetRunExtract(bankedItemDb, 'banked-item', 'banked-item-run', { source: 'inventory_authority_regression' });
assert.equal(bankedItemResult.accepted, true, 'run extraction with an item must bank successfully');
assert.equal((await getPetInventory(bankedItemDb, 'banked-item')).find((item) => item.key === 'energy_drink').count, 1,
  'a banked run item must appear in the authoritative bag');
const usedBankedItem = await processPetUseItem(bankedItemDb, 'banked-item', 'energy_drink', {
  event_key: 'banked-item-use', source: 'inventory_authority_regression',
});
assert.equal(usedBankedItem.accepted, true, 'a banked run item must be usable');
assert.equal((await getPetInventory(bankedItemDb, 'banked-item')).find((item) => item.key === 'energy_drink').count, 0,
  'using a banked run item must consume its authoritative balance');

const recoveryStylePatchDb = seedRepeatRewardPlayer('use-item-recovery-style', 70);
await ensurePetStarterSeasonSlot(recoveryStylePatchDb, 'use-item-recovery-style', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(recoveryStylePatchDb, 'use-item-recovery-style');
recoveryStylePatchDb.database.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
  VALUES ('use-item-recovery-style', 'item', 'style_patch', 1)`).run();
insertWalletRecoveryRequired(recoveryStylePatchDb, 'use-item-recovery-style');
const frozenStylePatch = await processPetUseItem(recoveryStylePatchDb, 'use-item-recovery-style', 'style_patch', {
  event_key: 'use-item-recovery-style', source: 'inventory_authority_regression',
});
assert.equal(frozenStylePatch.accepted, false, 'pending wallet recovery must block style_patch before item consumption');
assert.equal(frozenStylePatch.reason, 'wallet_reconciliation_recovery_pending');
assert.deepEqual(
  { ...recoveryStylePatchDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='use-item-recovery-style' AND asset_key='style_patch'").get() },
  { quantity: 1 },
  'recovery-pending style_patch must leave inventory untouched',
);
assert.deepEqual(
  { ...recoveryStylePatchDb.database.prepare("SELECT style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='use-item-recovery-style'").get() },
  { style_tokens: 0, pet_xp: 0 },
  'recovery-pending style_patch must not grant wallet or Pet XP rewards',
);
assert.equal(recoveryStylePatchDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='use-item-recovery-style'").get().count, 0,
  'recovery-pending style_patch must not write settlement events');
insertWalletReconciled(recoveryStylePatchDb, 'use-item-recovery-style');
const recoveredStylePatch = await processPetUseItem(recoveryStylePatchDb, 'use-item-recovery-style', 'style_patch', {
  event_key: 'use-item-recovery-style', source: 'inventory_authority_regression',
});
assert.equal(recoveredStylePatch.accepted, true, 'style_patch retry must succeed after wallet recovery completes');
assert.deepEqual(
  { ...recoveryStylePatchDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='use-item-recovery-style' AND asset_key='style_patch'").get() },
  { quantity: 0 },
  'recovered style_patch retry must consume the item exactly once',
);
assert.deepEqual(
  { ...recoveryStylePatchDb.database.prepare("SELECT style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='use-item-recovery-style'").get() },
  { style_tokens: 2, pet_xp: 5 },
  'recovered style_patch retry must grant wallet and Pet XP rewards once',
);

const recoveryOtherItemDb = seedRepeatRewardPlayer('use-item-recovery-other', 70);
await ensurePetStarterSeasonSlot(recoveryOtherItemDb, 'use-item-recovery-other', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(recoveryOtherItemDb, 'use-item-recovery-other');
recoveryOtherItemDb.database.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
  VALUES ('use-item-recovery-other', 'item', 'energy_drink', 1)`).run();
insertWalletRecoveryRequired(recoveryOtherItemDb, 'use-item-recovery-other');
const frozenOtherItem = await processPetUseItem(recoveryOtherItemDb, 'use-item-recovery-other', 'energy_drink', {
  event_key: 'use-item-recovery-other', source: 'inventory_authority_regression',
});
assert.equal(frozenOtherItem.accepted, true, 'pending wallet recovery must allow pet-only energy_drink item use');
assert.equal(recoveryOtherItemDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='use-item-recovery-other' AND asset_key='energy_drink'").get().quantity, 0,
  'recovery-pending pet-only item must consume inventory when it settles');
assert.equal(recoveryOtherItemDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='use-item-recovery-other'").get().pet_xp, 6,
  'recovery-pending pet-only item must grant Pet XP');
assert.equal(recoveryOtherItemDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='use-item-recovery-other' AND status='accepted'").get().count, 1,
  'recovery-pending pet-only item must write its accepted settlement event');

const recoverySnackItemDb = seedRepeatRewardPlayer('use-item-recovery-snack', 70);
await ensurePetStarterSeasonSlot(recoverySnackItemDb, 'use-item-recovery-snack', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(recoverySnackItemDb, 'use-item-recovery-snack');
recoverySnackItemDb.database.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
  VALUES ('use-item-recovery-snack', 'item', 'moon_snack', 1)`).run();
insertWalletRecoveryRequired(recoverySnackItemDb, 'use-item-recovery-snack');
const recoverySnackItem = await processPetUseItem(recoverySnackItemDb, 'use-item-recovery-snack', 'moon_snack', {
  event_key: 'use-item-recovery-snack', source: 'inventory_authority_regression',
});
assert.equal(recoverySnackItem.accepted, true, 'pending wallet recovery must allow pet-only moon_snack item use');
assert.deepEqual(
  { ...recoverySnackItemDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='use-item-recovery-snack' AND asset_key='moon_snack'").get() },
  { quantity: 0 },
  'recovery-pending moon_snack must consume inventory exactly once',
);
assert.deepEqual(
  { ...recoverySnackItemDb.database.prepare("SELECT pet_xp, hunger, energy, style_tokens FROM telegram_pet_profiles WHERE telegram_id='use-item-recovery-snack'").get() },
  { pet_xp: 4, hunger: 7, energy: 78, style_tokens: 0 },
  'recovery-pending moon_snack must apply pet-only XP/stat effects without wallet drift',
);

const rollbackUseItemDb = seedRepeatRewardPlayer('use-item-rollback', 70);
await ensurePetStarterSeasonSlot(rollbackUseItemDb, 'use-item-rollback', new Date('2026-08-15T00:00:00Z'));
await __petMediaTestHooks.ensureActivePetInstance(rollbackUseItemDb, 'use-item-rollback');
rollbackUseItemDb.database.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
  VALUES ('use-item-rollback', 'item', 'style_patch', 1)`).run();
rollbackUseItemDb.failBatchOnSql(/UPDATE telegram_pet_profiles SET\s+pet_xp = MAX/);
await assert.rejects(
  processPetUseItem(rollbackUseItemDb, 'use-item-rollback', 'style_patch', {
    event_key: 'use-item-rollback', source: 'inventory_authority_regression',
  }),
  /simulated_d1_batch_failure/,
  'item-use persistence failure must surface so the callback can retry',
);
assert.equal(rollbackUseItemDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='use-item-rollback' AND asset_key='style_patch'").get().quantity, 1,
  'failed item-use batch must roll back inventory consumption');
assert.deepEqual(
  { ...rollbackUseItemDb.database.prepare("SELECT style_tokens, pet_xp FROM telegram_pet_profiles WHERE telegram_id='use-item-rollback'").get() },
  { style_tokens: 0, pet_xp: 0 },
  'failed item-use batch must roll back wallet and Pet XP rewards');
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
try {
  [extractResult, racingStepResult] = await Promise.all([
    processPetRunExtract(terminalRaceDb, 'terminal-race', 'terminal-race-run', { source: 'concurrency_regression' }),
    processPetRunStep(terminalRaceDb, 'terminal-race', 'terminal-race-run', 'elite', {
      source: 'concurrency_regression', expected_step_index: 5, event_key: 'terminal-race-step',
    }),
  ]);
} finally {
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
seedAcceptedDailyPetEvent(kaijuRecoveryDb, 'kaiju-recovery', 'kaiju-recovery-day-a-cap', 1190, 245, recoveryDayAKey);
const kaijuMatch = { match_id: 'kaiju-recovery-match', mode: 'solo' };
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
assert.deepEqual(kaijuAfterRecovery.leaderboard, { rows: 1, total: 5 }, 'Kaiju recovery must write the clamped Community XP once');
assert.equal(
  kaijuRecoveryDb.database.prepare('SELECT season_id FROM telegram_leaderboard WHERE telegram_id = ?').get('kaiju-recovery').season_id,
  dayALeaderboardSeasonId,
  'Kaiju recovery must credit Community leaderboard XP to the season containing the stored Day A reservation',
);
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
insufficientCompletedDb.database.prepare('UPDATE telegram_pet_profiles SET energy = 50 WHERE telegram_id = ?').run('completed-insufficient');
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
  { match_id: 'kaiju-insufficient-match', mode: 'solo' },
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
seedAcceptedDailyPetEvent(kaijuCapDb, 'kaiju-cap', 'prior-kaiju-cap', 1190, 245);
const cappedKaiju = await awardPetKaijuPlayerResult(
  kaijuCapDb,
  'kaiju-cap',
  { match_id: 'kaiju-cap-match', mode: 'solo' },
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
assert.ok(kaijuHardening.indexOf('getPetProfileWithAtomicDecay') < kaijuHardening.indexOf('reservePetRepeatRewardEvent'), 'Kaiju must persist current stat decay before atomically claiming Energy and a reward slot');
assert.ok(kaijuHardening.indexOf('reservePetRepeatRewardEvent') < kaijuHardening.indexOf('scalePetRewards'), 'Kaiju Energy and slot must be claimed before rewards are calculated');
assert.ok(kaijuHardening.includes('energy_cost: energyCost') && kaijuHardening.includes('existing_event: duplicate'), 'Kaiju retries must resume the original paid reservation without paying Energy twice');
assert.ok(kaijuHardening.includes('const accountingDayKey = rewardSlot.day_key') && kaijuHardening.includes('accountingSeasonKey, accountingDayKey, accountingWeekKey'), 'Kaiju recovery must finalize caps and season totals against the stored reservation accounting window');
assert.ok(kaijuHardening.includes("reason: 'insufficient_energy'") && kaijuHardening.includes('pet_xp_awarded: 0') && kaijuHardening.includes('xp_awarded: 0'), 'failed Energy claims must return no Pet or Community XP');
assert.ok(kaijuHardening.includes("source: 'pet_kaiju'") && kaijuHardening.includes('reservation_id: reservation.reservation_id'), 'Kaiju finalization must preserve both global XP caps through the unified authority');
assert.ok(!kaijuHardening.includes('awardCommunityXp(db, telegramId, communityXp'), 'Kaiju Community XP must commit in the same recoverable finalization batch');
assert.ok(!kaijuHardening.includes('savePetProfile(db, pet)'), 'Kaiju rewards must not restore spent Energy or overwrite concurrent rewards through a stale save');
assert.ok(worker.includes("INSERT OR IGNORE INTO telegram_pet_events") && worker.includes("'pending', 'repeat_reward_pending'"), 'repeat reward reservations must reuse the unique event key for concurrent idempotency');
const finishKaijuHardening = asyncBlock('finishPetKaijuMatch');
assert.ok(finishKaijuHardening.includes('awardPetKaijuMatchResults(db, match, resolved)') && finishKaijuHardening.indexOf('awardPetKaijuMatchResults(db, match, resolved)') < finishKaijuHardening.indexOf("reason: 'already_completed'"), 'duplicate Kaiju completion callbacks must recover unfinished player reward reservations');
const kaijuCommandHardening = asyncBlock('cmdPetKaiju');
const completedMatchBranch = kaijuCommandHardening.slice(kaijuCommandHardening.indexOf("if (match.status === 'completed')"), kaijuCommandHardening.indexOf('if (!cardKey)'));
assert.ok(completedMatchBranch.includes('finishPetKaijuMatch(db, match)') && completedMatchBranch.includes('formatPetKaijuResult(recovered)'), 'normal completed card callbacks must invoke pending reward recovery and report its settlement result');
const kaijuResultFormatter = worker.slice(worker.indexOf('function formatPetKaijuResult'), worker.indexOf('async function cmdPetKaiju'));
assert.ok(kaijuResultFormatter.includes("award.reason === 'insufficient_energy'") && kaijuResultFormatter.includes('no Pet XP, Community XP, currency or progression reward'), 'Kaiju completion output must not advertise rewards when Energy authorization was rejected');

console.log('telegram-pets-api.test.mjs passed');
