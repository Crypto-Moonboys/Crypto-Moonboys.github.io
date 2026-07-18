import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/030_telegram_pets.sql', import.meta.url), 'utf8');
const economyMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/031_telegram_pets_economy.sql', import.meta.url), 'utf8');
const notificationsMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/032_telegram_pets_notifications.sql', import.meta.url), 'utf8');

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

assert.ok(worker.includes('TELEGRAM_PETS_BOT_SECRET'), 'pet-only bot secret must be used');
assert.ok(worker.includes('X-Pets-Bot-Secret'), 'pet-only header must be used');
assert.ok(worker.includes("path === '/telegram-pets/action'"), '/telegram-pets/action route must exist');
assert.ok(worker.includes("path === '/telegram-pets/leaderboard'"), '/telegram-pets/leaderboard route must exist');
assert.ok(worker.includes("path === '/telegram-pets/state'"), '/telegram-pets/state route must exist');
assert.ok(worker.includes("path === '/telegram-pets/missions'"), '/telegram-pets/missions route must exist');
assert.ok(worker.includes("path === '/telegram-pets/activity'"), '/telegram-pets/activity route must exist');
assert.ok(worker.includes("path === '/telegram-pets/shop'"), '/telegram-pets/shop route must exist');
assert.ok(worker.includes("path === '/telegram-pets/inventory'"), '/telegram-pets/inventory route must exist');
assert.ok(worker.includes("body.action === 'trade'"), 'telegram pets action route must dispatch trade actions');
assert.ok(worker.includes("body.action === 'adventure'"), 'telegram pets action route must dispatch adventure actions');
assert.ok(worker.includes("body.action === 'use_item'"), 'telegram pets action route must dispatch item use actions');
assert.ok(worker.includes("body.action === 'work'"), 'telegram pets action route must dispatch job actions');
assert.ok(worker.includes("body.action === 'daily_chest'"), 'telegram pets action route must dispatch daily chest actions');
assert.ok(worker.includes("body.action === 'random_event'"), 'telegram pets action route must dispatch random event choices');

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

const petAction = asyncBlock('processPetAction');
assert.ok(petAction.includes('PETS_DAILY_COMMUNITY_XP_CAP'), 'pet action must apply Community XP daily cap');
assert.ok(petAction.includes('PETS_DAILY_PET_XP_CAP'), 'pet action must apply pet XP daily cap');
assert.ok(petAction.includes('awardCommunityXp'), 'pet action must award through shared Community XP helper');
assert.ok(petAction.includes('updatePetStreakForAction(pet, dayKey)'), 'accepted pet actions must update streaks before saving the active day');
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

const adventure = asyncBlock('processPetAdventure');
assert.ok(adventure.includes("'adventure'"), 'adventures must use adventure event type');
assert.ok(adventure.includes('PET_ADVENTURE_COOLDOWN_SECONDS'), 'adventures must have a cooldown');
assert.ok(adventure.includes('PETS_DAILY_PET_XP_CAP'), 'adventures must apply the daily pet XP cap');
assert.ok(adventure.includes('getPetWindowTotals(db, telegramId, dayKey, weekKey)'), 'adventures must read daily totals before awarding pet XP');
assert.ok(adventure.includes("getPetEquippedItem(pet, 'toy')"), 'adventures must read equipped toy bonuses');
assert.ok(adventure.includes("bonusGold"), 'adventures must calculate bonus gold');
assert.ok(adventure.includes("bonusStyle"), 'adventures must calculate bonus style tokens');
assert.ok(adventure.includes('telegram_pet_season_state'), 'adventures must update season state');
assert.ok(adventure.includes('pet_xp_awarded: petXp'), 'adventures must persist the capped pet XP amount');
assert.ok(adventure.includes("capReason || 'adventure_complete'"), 'adventures must report completion');
assert.ok(!adventure.includes('awardCommunityXp'), 'adventures must not award Community XP');

const petInventory = asyncBlock('getPetInventory');
assert.ok(petInventory.includes('telegram_pet_events'), 'pet inventory must derive from existing pet event audit log');
assert.ok(petInventory.includes("row.event_type === 'use_item'"), 'pet inventory must subtract used items');

const petItemUse = asyncBlock('processPetItemUse');
assert.ok(petItemUse.includes("'use_item'"), 'pet item uses must use use_item event type');
assert.ok(petItemUse.includes('duplicate: true'), 'pet item uses must return duplicate marker for repeated event_key');
assert.ok(petItemUse.includes("reason: 'duplicate'"), 'pet item uses must short-circuit duplicate event_key');
assert.ok(petItemUse.indexOf('getPetEventByKey') < petItemUse.indexOf('getPetProfile(db, telegramId)'), 'pet item duplicate detection must happen before stat changes');
assert.ok(!petItemUse.includes('awardCommunityXp'), 'pet item uses must not award Community XP');

const petWork = asyncBlock('processPetWork');
assert.ok(petWork.includes("'work'"), 'pet jobs must use work event type');
assert.ok(petWork.includes('duplicate: true'), 'pet jobs must return duplicate marker for repeated event_key');
assert.ok(petWork.includes("reason: 'duplicate'"), 'pet jobs must short-circuit duplicate event_key');
assert.ok(petWork.indexOf('getPetEventByKey') < petWork.indexOf('getPetProfile(db, telegramId)'), 'pet job duplicate detection must happen before stat changes');
assert.ok(petWork.includes('PET_WORK_COOLDOWN_SECONDS'), 'pet jobs must have a cooldown');
assert.ok(petWork.includes('PETS_DAILY_PET_XP_CAP'), 'pet jobs must enforce the daily pet XP cap');
assert.ok(petWork.includes('telegram_pet_season_state'), 'pet jobs must update season state');
assert.ok(!petWork.includes('awardCommunityXp'), 'pet jobs must not award Community XP');

const petDaily = asyncBlock('processPetDailyChest');
assert.ok(petDaily.includes("'daily_chest'"), 'daily chest must use daily_chest event type');
assert.ok(petDaily.includes('duplicate: true'), 'daily chest must return duplicate marker for repeated event_key');
assert.ok(petDaily.includes("reason: 'duplicate'"), 'daily chest must short-circuit duplicate event_key');
assert.ok(petDaily.indexOf('getPetEventByKey') < petDaily.indexOf('getPetProfile(db, telegramId)'), 'daily chest duplicate detection must happen before day checks');
assert.ok(petDaily.includes('day_key = ?'), 'daily chest must be limited by UTC day');
assert.ok(!petDaily.includes('awardCommunityXp'), 'daily chest must not award Community XP');

const petRandomEvent = asyncBlock('processPetRandomEventChoice');
assert.ok(petRandomEvent.includes("'random_event'"), 'random events must use random_event event type');
assert.ok(petRandomEvent.includes('duplicate: true'), 'random events must return duplicate marker for repeated event_key');
assert.ok(petRandomEvent.includes("reason: 'duplicate'"), 'random events must short-circuit duplicate event_key');
assert.ok(petRandomEvent.indexOf('getPetEventByKey') < petRandomEvent.indexOf('getPetProfile(db, telegramId)'), 'random event duplicate detection must happen before cooldown checks');
assert.ok(petRandomEvent.includes('PET_EVENT_COOLDOWN_SECONDS'), 'random events must have a cooldown');
assert.ok(!petRandomEvent.includes('awardCommunityXp'), 'random events must not award Community XP');

assert.ok(worker.includes('function buildStablePetEventKey'), 'worker must define a stable pet event key helper');
assert.ok(worker.includes('function getTelegramPetCommandEventKey'), 'worker must derive stable keys for text commands');
assert.ok(worker.includes('function getTelegramPetCallbackEventKey'), 'worker must derive stable keys for callbacks');
assert.ok(worker.includes("event_key: eventKey"), 'pet command handlers must forward stable event keys');
assert.ok(worker.includes('message?.message_id'), 'stable command keys must include message identity');
assert.ok(worker.includes('query.id'), 'stable callback keys must use callback identity');
assert.ok(worker.includes('query.data'), 'stable callback keys must include callback data');
assert.ok(worker.includes("payload === 'bag'"), 'callback pet bag action must exist');
assert.ok(worker.includes("payload === 'daily'"), 'callback pet daily action must exist');
assert.ok(worker.includes("payload === 'work'"), 'callback pet work menu action must exist');
assert.ok(worker.includes("payload === 'event'"), 'callback pet event menu action must exist');
assert.ok(worker.includes("payload.startsWith('work:')"), 'callback pet work action must exist');
assert.ok(worker.includes("payload.startsWith('event:')"), 'callback pet event action must exist');
assert.ok(worker.includes("cmdPetWork(db, tok, chatId, telegramId, '', petEventKey)"), 'callback pet work menu must forward the stable callback key');
assert.ok(worker.includes('cmdPetWork(db, tok, chatId, telegramId, jobKey, petEventKey)'), 'callback pet work must forward the stable callback key');
assert.ok(worker.includes('cmdPetDaily(db, tok, chatId, telegramId, petEventKey)'), 'callback pet daily must forward the stable callback key');
assert.ok(worker.includes("cmdPetEvent(db, tok, chatId, telegramId, '', petEventKey)"), 'callback pet event menu must forward the stable callback key');
assert.ok(worker.includes('cmdPetEvent(db, tok, chatId, telegramId, choice, petEventKey)'), 'callback pet event must forward the stable callback key');
assert.ok(worker.includes('cmdPetBag(db, tok, chatId, telegramId)'), 'callback pet bag must remain read-only and not need an event key');

const notifications = asyncBlock('runPetNeedsNotifications');
assert.ok(notifications.includes('telegram_pet_notification_settings'), 'pet notifications must read the notification preference table');
assert.ok(notifications.includes('PET_NOTIFICATION_COOLDOWN_MINUTES'), 'pet notifications must apply a cooldown');
assert.ok(notifications.includes('sendTelegramMessage'), 'pet notifications must send Telegram messages');

const scheduled = worker.slice(worker.indexOf('async scheduled(event, env, _ctx)'), worker.indexOf('async function cmdGkStart'));
assert.ok(scheduled.includes('shouldRunPetNotifications'), 'scheduled pet notifications must be gated by the cron check');

assert.ok(worker.includes("food?.key === 'crystal_bowl'"), 'crystal_bowl must affect feed bonuses');
assert.ok(worker.includes("toy?.key === 'hoverboard'"), 'hoverboard must affect play bonuses');
assert.ok(worker.includes("outfit?.key === 'crown_jacket'"), 'crown_jacket must affect care bonuses');

const stateRoute = routeBlock('/telegram-pets/state');
assert.ok(stateRoute.includes('getPetProfile(env.DB, telegramId)'), 'GET /telegram-pets/state must use read-only pet lookup');
assert.ok(!stateRoute.includes('getOrCreatePetProfile'), 'GET /telegram-pets/state must not create pets');

const petStatus = asyncBlock('cmdPetStatus');
assert.ok(petStatus.includes('getPetProfile(db, telegramId)'), '/pet status command must use read-only pet lookup');
assert.ok(!petStatus.includes('getOrCreatePetProfile'), '/pet status command must not create pets');

const streakHelper = worker.slice(worker.indexOf('function updatePetStreakForAction'), worker.indexOf('async function savePetProfile'));
assert.ok(streakHelper.includes('getPreviousPetDayKey(dayKey)'), 'pet streak helper must compare against yesterday');
assert.ok(streakHelper.includes('pet.streak_days = currentStreak + 1'), 'pet streak helper must increment consecutive-day streaks');
assert.ok(streakHelper.includes('pet.streak_days = 1'), 'pet streak helper must reset after missed days');

for (const table of ['telegram_pet_profiles', 'telegram_pet_events', 'telegram_pet_season_state', 'telegram_pet_mission_completions']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be in schema.sql`);
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be in migration`);
}
assert.ok(schema.includes('telegram_pet_notification_settings'), 'schema.sql must include telegram_pet_notification_settings');
assert.ok(notificationsMigration.includes('telegram_pet_notification_settings'), 'notifications migration must create telegram_pet_notification_settings');
assert.ok(notificationsMigration.includes('idx_telegram_pet_notification_settings_due'), 'notifications migration must add the notification index');

for (const column of ['moon_gold', 'moon_crystals', 'style_tokens', 'equipped_food', 'equipped_toy', 'equipped_outfit']) {
  assert.ok(schema.includes(column), `schema.sql must include ${column}`);
  assert.ok(economyMigration.includes(`ADD COLUMN ${column}`), `economy migration must add ${column}`);
}

for (const command of ["case 'pet':", "case 'adopt':", "case 'feed':", "case 'play':", "case 'clean':", "case 'sleep':", "case 'train':", "case 'petshop':", "case 'petbuy':", "case 'pettrade':", "case 'petadventure':", "case 'petbag':", "case 'petuse':", "case 'petwork':", "case 'petdaily':", "case 'petevent':", "case 'petnotify':", "case 'petleaderboard':"]) {
  assert.ok(worker.includes(command), `Telegram bot command ${command} must exist`);
}

console.log('telegram-pets-api.test.mjs passed');
