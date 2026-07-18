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
assert.ok(worker.includes("body.action === 'use_item'"), 'telegram pets action route must dispatch use_item actions');
assert.ok(worker.includes("body.action === 'work'"), 'telegram pets action route must dispatch work actions');
assert.ok(worker.includes("body.action === 'daily_chest'"), 'telegram pets action route must dispatch daily_chest actions');
assert.ok(worker.includes("body.action === 'random_event'"), 'telegram pets action route must dispatch random_event actions');

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
assert.ok(petAction.includes("if (existing) {"), 'pet action must short-circuit duplicate event keys first');
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

const useItem = asyncBlock('processPetUseItem');
assert.ok(useItem.includes('duplicate'), 'use_item must short-circuit duplicate event keys');
assert.ok(useItem.includes('PETS_DAILY_PET_XP_CAP'), 'use_item must respect the daily pet XP cap');
assert.ok(useItem.includes('telegram_pet_events'), 'use_item must audit accepted items');
assert.ok(useItem.includes('item_used'), 'use_item must write item_used results');
assert.ok(useItem.includes('consumed_item_key'), 'use_item must write consumed item metadata');
assert.ok(useItem.includes("moon_snack"), 'use_item must support moon_snack');
assert.ok(useItem.includes("energy_drink"), 'use_item must support energy_drink');
assert.ok(useItem.includes("clean_wipe"), 'use_item must support clean_wipe');
assert.ok(useItem.includes("lucky_charm"), 'use_item must support lucky_charm');
assert.ok(useItem.includes("style_patch"), 'use_item must support style_patch');
assert.ok(useItem.includes("adventure_map"), 'use_item must support adventure_map');
assert.ok(worker.includes('consumed_item_key'), 'inventory counting must subtract consumed items');

const work = asyncBlock('processPetJob');
assert.ok(work.includes('duplicate'), 'work must short-circuit duplicate event keys');
assert.ok(work.includes('PETS_DAILY_PET_XP_CAP'), 'work must respect the daily pet XP cap');
for (const job of ['street_artist', 'courier', 'crystal_miner', 'vault_guard']) {
  assert.ok(worker.includes(job), `work must support ${job}`);
}

const dailyChest = asyncBlock('processPetDailyChest');
assert.ok(dailyChest.includes('duplicate'), 'daily chest must short-circuit duplicate event keys');
assert.ok(dailyChest.includes("daily_chest"), 'daily chest must write daily_chest events');

const randomEvent = asyncBlock('processPetRandomEvent');
assert.ok(randomEvent.includes('duplicate'), 'random event must short-circuit duplicate event keys');
for (const choice of ['open', 'sell', 'ignore']) {
  assert.ok(worker.includes(choice), `random event must support ${choice}`);
}

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

const notifications = asyncBlock('runPetNeedsNotifications');
assert.ok(notifications.includes('telegram_pet_notification_settings'), 'pet notifications must read the notification preference table');
assert.ok(notifications.includes('PET_NOTIFICATION_COOLDOWN_MINUTES'), 'pet notifications must apply a cooldown');
assert.ok(notifications.includes('sendTelegramMessage'), 'pet notifications must send Telegram messages');

const scheduled = worker.slice(worker.indexOf('async scheduled(event, env, _ctx)'), worker.indexOf('async function cmdGkStart'));
assert.ok(scheduled.includes('shouldRunPetNotifications'), 'scheduled pet notifications must be gated by the cron check');

assert.ok(worker.includes("food?.key === 'crystal_bowl'"), 'crystal_bowl must affect feed bonuses');
assert.ok(worker.includes("toy?.key === 'hoverboard'"), 'hoverboard must affect play bonuses');
assert.ok(worker.includes("outfit?.key === 'crown_jacket'"), 'crown_jacket must affect care bonuses');
assert.ok(worker.includes('buildTelegramMessagePetEventKey'), 'message event keys must be centralized');
assert.ok(worker.includes('buildTelegramCallbackPetEventKey'), 'callback event keys must be centralized');

const stateRoute = routeBlock('/telegram-pets/state');
assert.ok(stateRoute.includes('getPetProfile(env.DB, telegramId)'), 'GET /telegram-pets/state must use read-only pet lookup');
assert.ok(!stateRoute.includes('getOrCreatePetProfile'), 'GET /telegram-pets/state must not create pets');

const inventoryRoute = routeBlock('/telegram-pets/inventory');
assert.ok(inventoryRoute.includes('getPetInventory(env.DB, telegramId)'), 'GET /telegram-pets/inventory must expose bag contents');

const shopRoute = routeBlock('/telegram-pets/shop');
assert.ok(shopRoute.includes('usable_items'), 'GET /telegram-pets/shop must expose usable items');
assert.ok(shopRoute.includes('jobs'), 'GET /telegram-pets/shop must expose jobs');

const petStatus = asyncBlock('cmdPetStatus');
assert.ok(petStatus.includes('getPetProfile(db, telegramId)'), '/pet status command must use read-only pet lookup');
assert.ok(!petStatus.includes('getOrCreatePetProfile'), '/pet status command must not create pets');
assert.ok(worker.includes('function formatPetStatus(pet, missions = null)'), 'formatPetStatus must exist');
const statusFormatter = worker.slice(worker.indexOf('function formatPetStatus(pet, missions = null)'), worker.indexOf('function petReplyMarkup()'));
for (const label of ['Pet', 'Wallet', 'Gear', 'Needs', 'Daily Missions', 'Streak']) {
  assert.ok(statusFormatter.includes(label), `formatPetStatus must include ${label}`);
}
for (const stat of ['Health', 'Hunger', 'Happiness', 'Cleanliness', 'Energy']) {
  assert.ok(statusFormatter.includes(`${stat} `), `formatPetStatus must include ${stat} bars`);
  assert.ok(statusFormatter.includes('bar('), `formatPetStatus must render ${stat.toLowerCase()} bars dynamically`);
}
for (const warning of ['Low health: urgent care needed', 'High hunger: feed soon', 'Low cleanliness: clean soon', 'Low happiness: play soon', 'Low energy: sleep before adventure']) {
  assert.ok(statusFormatter.includes(warning), `formatPetStatus must include warning: ${warning}`);
}
assert.ok(statusFormatter.includes('Daily Missions'), 'formatPetStatus must include the mission section');
assert.ok(statusFormatter.includes('m.completed') || statusFormatter.includes('completed ?') || statusFormatter.includes('completed ✅'), 'formatPetStatus must distinguish mission completion state');

const petBagCommand = asyncBlock('cmdPetBag');
assert.ok(petBagCommand.includes('getPetInventory(db, telegramId)'), '/petbag command must show the inventory');

assert.ok(worker.includes('formatPetBlockedCopy(kind, reason, extra = {})'), 'blocked copy helper must exist');
for (const message of ['Moonpet is too tired for a', 'Moonpet needs a short break before another', 'You need a Moonpet first', 'not available right now']) {
  assert.ok(worker.includes(message), `blocked copy helper must include ${message}`);
}

const petUse = asyncBlock('cmdPetUse');
assert.ok(petUse.includes('processPetUseItem'), '/petuse command must route to processPetUseItem');
assert.ok(petUse.includes('eventKey = null'), '/petuse command must accept optional eventKey');
assert.ok(petUse.includes("event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'petuse'"), '/petuse command must use stable text keys');
assert.ok(petUse.includes('formatPetBlockedCopy('), '/petuse command must use friendly blocked copy');

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

const petEvent = asyncBlock('cmdPetEvent');
assert.ok(petEvent.includes('processPetRandomEvent'), '/petevent command must route to processPetRandomEvent');
assert.ok(petEvent.includes('eventKey = null'), '/petevent command must accept optional eventKey');
assert.ok(petEvent.includes("event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'petevent', choice])"), '/petevent command must use stable text keys');
assert.ok(petEvent.includes('formatPetBlockedCopy('), '/petevent command must use friendly blocked copy');

const petReply = worker.slice(worker.indexOf('function petReplyMarkup()'), worker.indexOf('async function cmdPetStatus'));
for (const label of ['Feed', 'Play', 'Clean', 'Sleep', 'Train', 'Shop', 'Bag', 'Work', 'Event', 'Daily', 'Adventure', 'How To Play', 'Pet Leaderboard']) {
  assert.ok(petReply.includes(label), `petReplyMarkup must include ${label}`);
}
for (const callback of ['pet:feed', 'pet:play', 'pet:clean', 'pet:sleep', 'pet:train', 'pet:shop', 'pet:bag', 'pet:work', 'pet:event', 'pet:daily', 'pet:adventure']) {
  assert.ok(petReply.includes(callback), `petReplyMarkup must preserve ${callback}`);
}
assert.ok(!statusFormatter.includes('??'), 'formatPetStatus must not contain placeholder question marks');
assert.ok(!petReply.includes('??'), 'petReplyMarkup must not contain placeholder question marks');
assert.ok(!worker.includes('??? Train'), 'telegram pet UI must not contain the old Train placeholder');

const callbackBranch = worker.slice(worker.indexOf('if (update.callback_query)'), worker.indexOf('// Group-level events'));
for (const call of [
  "await cmdPetWork(db, tok, chatId, telegramId, '', eventKey);",
  "await cmdPetWork(db, tok, chatId, telegramId, jobKey, eventKey);",
  "await cmdPetDaily(db, tok, chatId, telegramId, eventKey);",
  "await cmdPetEvent(db, tok, chatId, telegramId, '', eventKey);",
  "await cmdPetEvent(db, tok, chatId, telegramId, choice, eventKey);",
]) {
  assert.ok(callbackBranch.includes(call), `callback branch must include ${call}`);
}

const petBag = asyncBlock('cmdPetBag');
assert.ok(petBag.includes('getPetInventory(db, telegramId)'), '/petbag command must show the inventory');

for (const command of ["case 'pet':", "case 'adopt':", "case 'feed':", "case 'play':", "case 'clean':", "case 'sleep':", "case 'train':", "case 'petshop':", "case 'petbag':", "case 'petbuy':", "case 'petuse':", "case 'petwork':", "case 'petdaily':", "case 'petevent':", "case 'pettrade':", "case 'petadventure':", "case 'petnotify':", "case 'petleaderboard':"]) {
  assert.ok(worker.includes(command), `Telegram bot command ${command} must exist`);
}

console.log('telegram-pets-api.test.mjs passed');

