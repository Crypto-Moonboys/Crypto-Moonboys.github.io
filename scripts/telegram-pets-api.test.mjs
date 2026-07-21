import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/030_telegram_pets.sql', import.meta.url), 'utf8');
const economyMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/031_telegram_pets_economy.sql', import.meta.url), 'utf8');
const notificationsMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/032_telegram_pets_notifications.sql', import.meta.url), 'utf8');
const runMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/033_telegram_pet_run_engine.sql', import.meta.url), 'utf8');
const kaijuMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/034_telegram_pet_kaiju.sql', import.meta.url), 'utf8');

const {
  PET_MEDIA_MANIFEST,
  PET_RUN_CHOICE_LIBRARY,
  PET_RUN_MAX_DEPTH,
  PET_RUN_STEP_CHOICES,
  PET_KAIJU_CARDS,
  PET_KAIJU_CATEGORIES,
  PET_RANDOM_EVENTS,
  buildPetKaijuCardReplyMarkup,
  buildPetKaijuLobbyReplyMarkup,
  buildPetKaijuMatchId,
  resolvePetKaijuBattle,
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
assert.ok(worker.includes("body.action === 'run'"), 'telegram pets action route must dispatch run start/resume actions');
assert.ok(worker.includes("body.action === 'run_step'"), 'telegram pets action route must dispatch run step actions');
assert.ok(worker.includes("body.action === 'run_extract'"), 'telegram pets action route must dispatch run extract actions');
assert.ok(worker.includes('export const __petMediaTestHooks'), 'pet media test hooks must be exported');

assert.equal(PET_RUN_MAX_DEPTH, 5, 'Pet Run Engine must use 5-step runs');
assert.equal(PET_RUN_STEP_CHOICES.length, 5, 'Pet Run Engine must define five choice steps');
for (const stepChoices of PET_RUN_STEP_CHOICES) {
  assert.equal(stepChoices.length, 3, 'each Pet Run Engine step must expose exactly 3 choices');
}
for (const choiceType of ['fight', 'sneak', 'loot', 'rest', 'trade', 'gamble', 'boss']) {
  assert.ok(PET_RUN_CHOICE_LIBRARY[choiceType], `Pet Run Engine must support ${choiceType}`);
}
const stableStepKeyA = buildPetRunStepEventKey('123', 'run-abc', 2, 'sneak');
const stableStepKeyB = buildPetRunStepEventKey('123', 'run-abc', 2, 'sneak');
assert.equal(stableStepKeyA, stableStepKeyB, 'run step event keys must be stable for retry-safe callbacks');
assert.equal(buildPetRunExtractEventKey('123', 'run-abc'), 'pet_run_extract:123:run-abc', 'run extract event keys must not depend on callback query ids');
const runMarkup = buildPetRunChoiceReplyMarkup({ run_id: 'run-abc', depth: 0, max_depth: 5, risk_level: 1, unbanked_items: '{}' });
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
const kaijuCards = buildPetKaijuCardReplyMarkup({ match_id: 'kaiju-abc' });
assert.ok(kaijuCards.inline_keyboard.flat().some((button) => button.callback_data === 'pet:kaiju:card:kaiju-abc:god-dzilla'), 'Kaiju card picker must include stable card callbacks');
assert.equal(resolvePetKaijuBattle('god-dzilla', 'big-daddy-kong', 'lgcy').result, 'player1_win', 'Kaiju resolver must compare the rolled stat category');

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
    assert.deepEqual(photoBody.reply_markup, replyMarkup, 'status/detail screens must keep buttons on the photo');
    assert.equal(messageBody.text, statusText, 'status/detail screens must preserve the full original text');
    assert.equal(messageBody.reply_markup, undefined, 'status/detail follow-up text should not duplicate the keyboard');
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
    assert.deepEqual(photoBody.reply_markup, replyMarkup, 'run prompts must keep buttons on the photo');
    assert.equal(messageBody.text, runPrompt, 'run prompts must preserve the full original text');
    assert.equal(messageBody.reply_markup, undefined, 'run prompt follow-up text should not duplicate the keyboard');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

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
    assert.deepEqual(photoBody.reply_markup, replyMarkup, 'long caption fallback must keep buttons on the photo');
    assert.equal(JSON.parse(calls[1].init.body).text, longText, 'long caption fallback must preserve full detail text');
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
assert.ok(shopPurchase.includes("duplicate: true"), 'shop purchases must short-circuit duplicate event keys');
assert.ok(shopPurchase.includes("reason: 'already_equipped'"), 'shop purchases must not charge again for already equipped upgrades');
assert.ok(shopPurchase.includes("reason: 'not_enough_pet_currency'"), 'shop purchases must reject unaffordable shop buttons');
assertOrder(
  shopPurchase,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'const pet = await getPetProfile(db, telegramId);',
  'shop purchases must check duplicate event keys before loading the pet'
);
assertOrder(
  shopPurchase,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'if (!canAffordPetItem(pet, item)) return { accepted: false, reason: \'not_enough_pet_currency\', item, pet };',
  'shop purchases must check duplicate event keys before spending currency'
);

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
assert.ok(dailyChest.includes('getPetWindowTotals(db, telegramId, dayKey, weekKey)'), 'daily chest pet XP must check existing daily totals before awarding');
assert.ok(dailyChest.includes('totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP'), 'daily chest must award 0 pet XP when the daily cap is already reached');
assert.ok(dailyChest.includes('totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP'), 'daily chest must clamp pet XP against prior daily pet XP');
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
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'const pet = await getPetProfile(db, telegramId);',
  'random event must check duplicate event keys before loading the pet'
);
assertOrder(
  randomEvent,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'const outcome = pickPetRandomEventOutcome(choice);',
  'random event must check duplicate event keys before the reward roll'
);
assert.ok(randomEvent.includes('getPetWindowTotals(db, telegramId, dayKey, weekKey)'), 'random event must keep daily caps');

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
assertOrder(
  goldTrade,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'const pet = await getPetProfile(db, telegramId);',
  'gold trades must check duplicate event keys before loading the pet'
);
assertOrder(
  goldTrade,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'const lastTrade = await db.prepare(`',
  'gold trades must check duplicate event keys before the cooldown lookup'
);
assertOrder(
  goldTrade,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);",
  'const roll = Math.random();',
  'gold trades must check duplicate event keys before the random roll'
);

const adventure = asyncBlock('processPetAdventure');
assert.ok(adventure.includes('normalizePetAdventureChoice'), 'adventures must parse choice keys');
assert.ok(adventure.includes('resolvePetAdventureEncounter'), 'adventures must resolve encounter keys');
assert.ok(adventure.includes('PET_ADVENTURE_COOLDOWN_SECONDS'), 'adventures must have a cooldown');
assert.ok(adventure.includes('PETS_DAILY_PET_XP_CAP'), 'adventures must apply the daily pet XP cap');
assert.ok(adventure.includes('getPetWindowTotals(db, telegramId, dayKey, weekKey)'), 'adventures must read daily totals before awarding pet XP');
assert.ok(adventure.includes('pickPetRandomEventOutcome(choice)'), 'adventures must reuse the roguelite outcome roll');
assert.ok(adventure.includes('applyPetRandomEventDeltas('), 'adventures must apply roguelite-style deltas');
assert.ok(adventure.includes('getPetProfile(db, telegramId)'), 'adventures must look up the pet by telegramId');
assert.ok(adventure.includes('telegram_pet_season_state'), 'adventures must update season state');
assert.ok(adventure.includes('pet_xp_awarded: applied.deltas.pet_xp'), 'adventures must persist the capped pet XP amount');
assert.ok(adventure.includes("reason: `${encounter.key}:${choice.key}`"), 'adventures must report the encounter and choice');
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
assert.ok(runStep.includes('getUnaffordablePetRunCosts(pet, outcome.costs)'), 'run steps must validate rolled currency costs before applying rewards');
assert.ok(runStep.includes("reason: 'insufficient_run_cost'"), 'unaffordable run steps must be rejected with a clear reason');
assert.ok(runStep.includes("'run_item_use'"), 'accepted run steps must record consumed one-use run items');
assert.ok(runStep.includes('consumed_item_key: outcome.consumed_item_key'), 'run item consumption metadata must preserve the consumed item key');
assert.ok(runStep.includes("SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?"), 'run steps must short-circuit duplicate callbacks by event key');
assert.ok(runStep.includes("SELECT * FROM telegram_pet_run_steps WHERE run_id = ? AND step_index = ?"), 'run steps must block alternate duplicate choices for the same step');
assert.ok(runStep.includes("SET status = 'failed'"), 'failed runs must be marked failed');
assert.ok(runStep.includes('unbanked_pet_xp = 0'), 'failed runs must lose unbanked pet XP');
assert.ok(runStep.includes("unbanked_items = '{}'"), 'failed runs must lose unbanked items');
assert.ok(runStep.includes('PETS_DAILY_PET_XP_CAP'), 'failure consolation XP must respect pet XP cap');
assert.ok(runStep.includes("'run_fail'"), 'failed runs must audit consolation XP as run_fail');
assert.ok(runStep.includes('recordPetRunBankedEvent'), 'boss step completion must bank through the extract/completion helper');
assertOrder(
  runStep,
  "const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`)",
  'const pet = await getPetProfile(db, telegramId);',
  'run steps must check duplicate event keys before loading and mutating the pet'
);
assertOrder(
  runStep,
  "return { accepted: false, reason: 'stale_run_step'",
  "const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`)",
  'stale run-step callbacks must be rejected before duplicate or write-path work'
);
assertOrder(
  runStep,
  "return { accepted: false, reason: 'stale_run_step'",
  'const pet = await getPetProfile(db, telegramId);',
  'stale run-step callbacks must not load or mutate pet stats'
);
assertOrder(
  runStep,
  "return { accepted: false, reason: 'stale_run_step'",
  'INSERT INTO telegram_pet_run_steps',
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
  'const pet = await getPetProfile(db, telegramId);',
  'run steps must check step-level idempotency before mutating the pet'
);
assertOrder(
  runStep,
  'const missingCosts = getUnaffordablePetRunCosts(pet, outcome.costs);',
  'applyPetRunCosts(pet, outcome.costs);',
  'run step costs must be affordable before any costs are applied'
);
assertOrder(
  runStep,
  'const missingCosts = getUnaffordablePetRunCosts(pet, outcome.costs);',
  'INSERT INTO telegram_pet_run_steps',
  'unaffordable run steps must be rejected before writing step rewards'
);
assert.ok(runStep.includes('applyPetRunStatRewards(pet, outcome.rewards)'), 'successful run steps must apply non-currency stat rewards before saving pets');
assertOrder(
  runStep,
  'if (!outcome.success) {',
  'applyPetRunStatRewards(pet, outcome.rewards);',
  'run stat rewards must only apply after the failure path has been handled'
);
assert.ok(
  runStep.includes('applyPetRunStatRewards(pet, outcome.rewards);\n  pet.last_decay_at = new Date().toISOString();\n  await savePetProfile(db, pet);')
    || runStep.includes('applyPetRunStatRewards(pet, outcome.rewards);\r\n  pet.last_decay_at = new Date().toISOString();\r\n  await savePetProfile(db, pet);'),
  'run stat rewards must be applied before saving the successful step pet'
);

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
assert.ok(runBank.includes('PETS_DAILY_PET_XP_CAP'), 'banked run pet XP must respect the daily pet XP cap');
assert.ok(runBank.includes('PETS_DAILY_COMMUNITY_XP_CAP'), 'banked run Community XP must respect the daily Community XP cap');
assert.ok(runBank.includes('awardCommunityXp'), 'banked run Community XP must use the shared helper');
assert.ok(runBank.includes("eventType = options.completed ? 'run_complete' : 'run_extract'"), 'run banking must distinguish extract and completion');
assert.ok(runBank.includes('PET_RUN_COMPLETED_STATUSES.includes(run.status)'), 'run banking must not bank closed runs twice');
assert.ok(runBank.includes("options.completed ? (options.event_key || buildStablePetEventKey(['pet_run_complete', telegramId, run.run_id])) : buildPetRunExtractEventKey(telegramId, run.run_id)"), 'extract banking must ignore caller-provided event keys and use the deterministic run extract key');
assert.ok(runBank.includes('UPDATE telegram_pet_runs'), 'run banking must claim/close the run before applying rewards');
assert.ok(runBank.includes('if (!claim?.meta?.changes)'), 'run banking must treat already-closed runs as duplicates');
assert.ok(runBank.includes("'run_item'"), 'run banking must persist inventory items as pet events');
assertOrder(
  runBank,
  "const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`)",
  'pet.pet_xp = Math.max(0',
  'extract must check duplicate event keys before banking rewards'
);
assertOrder(
  runBank,
  'const claim = await db.prepare(`',
  'pet.pet_xp = Math.max(0',
  'extract must claim/close the run before applying banked rewards'
);

const runExtract = asyncBlock('processPetRunExtract');
assert.ok(runExtract.includes('recordPetRunBankedEvent'), 'extract must bank through the shared banking helper');
assert.ok(runExtract.includes("reason: 'run_empty'"), 'extract must refuse empty runs');
assert.ok(runExtract.includes('event_key: buildPetRunExtractEventKey(telegramId, run.run_id)'), 'extract must force the deterministic run extract event key');

const actionRoute = routeBlock('/telegram-pets/action');
assert.ok(actionRoute.includes('expected_step_index: body.expected_step_index'), '/telegram-pets/action run_step must carry expected callback step index');

assert.deepEqual(
  getUnaffordablePetRunCosts({ moon_gold: 3, moon_crystals: 1, style_tokens: 0 }, { moon_gold: 4, moon_crystals: 1, style_tokens: 2 }),
  { moon_gold: { required: 4, available: 3 }, style_tokens: { required: 2, available: 0 } },
  'run cost validator must report missing currencies without clamping to zero'
);
assert.deepEqual(
  getUnaffordablePetRunCosts({ moon_gold: 10, moon_crystals: 1, style_tokens: 2 }, { moon_gold: 4, moon_crystals: 1, style_tokens: 2 }),
  {},
  'run cost validator must allow affordable currency costs'
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

const petReply = worker.slice(worker.indexOf('function petReplyMarkup()'), worker.indexOf('async function cmdPetStatus'));
for (const label of ['Feed', 'Play', 'Clean', 'Sleep', 'Train', 'Shop', 'Bag', 'Work', 'Event', 'Daily', 'Kaiju', 'Run', 'How To Play', 'Pet Leaderboard']) {
  assert.ok(petReply.includes(label), `petReplyMarkup must include ${label}`);
}
for (const callback of ['pet:feed', 'pet:play', 'pet:clean', 'pet:sleep', 'pet:train', 'pet:shop', 'pet:bag', 'pet:work', 'pet:event', 'pet:daily', 'pet:kaiju', 'pet:run']) {
  assert.ok(petReply.includes(callback), `petReplyMarkup must preserve ${callback}`);
}
assert.ok(!statusFormatter.includes('??'), 'formatPetStatus must not contain placeholder question marks');
assert.ok(!petReply.includes('??'), 'petReplyMarkup must not contain placeholder question marks');
assert.ok(!worker.includes('??? Train'), 'telegram pet UI must not contain the old Train placeholder');

const callbackBranch = worker.slice(worker.indexOf('if (update.callback_query)'), worker.indexOf('// Group-level events'));
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

console.log('telegram-pets-api.test.mjs passed');
