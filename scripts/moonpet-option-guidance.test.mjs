import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { previewEncounterChoice } from '../workers/moonboys-api/pets/choice-preview.js';
import { PET_MARKET_OFFERS } from '../workers/moonboys-api/pets/economy-expansion.js';
const guide = createRequire(import.meta.url)('../js/moonpet-guide.js');
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('js/moonpet-mini-app.js');
const worker = read('workers/moonboys-api/worker.js');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const block = name => between('// TEST-EXPORT: ' + name + ':start', '// TEST-EXPORT: ' + name + ':end');
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function context() {
  const ctx = { state: { adopted: true, pet: { pet_id: 'guidance-pet', energy: 80 }, lifecycle: { phase: 'young' }, guidance: {}, cooldowns: { entries: [] }, entry_requirement: { eligible: true } },
    petActionRefreshRequired: false, escapeHtml: escape, playOptionsReady: () => true,
    number: value => Number(value || 0).toLocaleString('en-US'), words: value => String(value || '').replaceAll('_', ' '),
    cooldownRemainingSeconds: value => Number(value && value.remaining_seconds || 0),
    countdownText: () => 'Available in 2 minutes', countdownMarkup: () => '<span data-cooldown-expires-at="later">Available in 2 minutes</span>',
    post: () => { throw Error('Rendering must not request data'); },
    window: { setTimeout: () => { throw Error('Rendering must not create timers'); } } };
  vm.createContext(ctx); vm.runInContext(between('  function valueText(', '  function renderEconomy('), ctx);
  vm.runInContext(block('actionAvailability') + between('  function button(', '  var panelOpenState'), ctx);
  vm.runInContext(between('  function routeButton(', '  function objectiveRouteButton('), ctx);
  ctx.button('FEED', 'feed', {}, {});
  return ctx;
}
const actions = Object.keys(context().button.guidance);
for (const action of actions) test(`${action}: real button explains the action and preserves its payload`, () => {
  const ctx = context(), payload = { source_id: 'saved&"pet', amount: 17 };
  const html = ctx.button('VISIBLE OPTION', action, payload, { detail: 'LIVE COST 17 GOLD // LIVE REWARD 4 XP' });
  assert.match(html, /class="button-purpose"[^>]*>[^<]+<\/span>/);
  assert.match(html, /aria-label="VISIBLE OPTION"/);
  assert.match(html, /aria-description="[^"<>]+"/);
  assert.match(html, /LIVE COST 17 GOLD \/\/ LIVE REWARD 4 XP/);
  assert.ok(html.includes('data-payload="' + escape(JSON.stringify(payload)) + '"'));
  assert.doesNotMatch(html, /Review the displayed requirements and effect/);
  assert.doesNotMatch(html, / disabled/);
  const dispatch = worker.slice(worker.indexOf('async function processPetMiniAppAction'), worker.indexOf('function serializePetMiniAppActionResult'));
  assert.ok(dispatch.includes("'" + action + "'"), `description refers to an unwired action: ${action}`);
});

// Parse the second argument of actual button calls, including dynamic action choices.
function calledActions() {
  const result = new Set();
  for (const match of source.matchAll(/\bbutton\(/g)) {
    let depth = 0, quote = '', escaped = false, args = [''];
    for (let i = match.index + match[0].length; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        args[args.length - 1] += char;
        if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = '';
      } else if ('\'"`'.includes(char)) { quote = char; args[args.length - 1] += char; }
      else if ('([{'.includes(char)) { depth++; args[args.length - 1] += char; }
      else if (')]}'.includes(char)) { if (char === ')' && depth === 0) break; depth--; args[args.length - 1] += char; }
      else if (char === ',' && depth === 0) args.push('');
      else args[args.length - 1] += char;
    }
    const argument = String(args[1] || '').trim();
    const literal = argument.match(/^['"]([a-z_]+)['"]$/);
    if (literal) result.add(literal[1]);
    else if (argument.includes('?')) for (const branch of argument.matchAll(/[?:]\s*['"]([a-z_]+)['"]/g)) result.add(branch[1]);
    else assert.equal(argument, 'action', 'an unfamiliar computed action needs an explicit guidance audit');
  }
  return result;
}
test('every rendered mutation, including computed actions, has explicit guidance', () => {
  const ctx = context(), called = calledActions();
  assert.ok(called.size >= 60, 'audit must include the real dynamic action call sites');
  for (const action of called) assert.ok(Object.hasOwn(ctx.button.guidance, action), `missing help for rendered ${action}`);
  assert.equal(actions.length, 75, 'Radio, Weekly Bounty, Home and Furniture buttons require explicit purposes');
});

for (const kind of ['claim','spend','risk']) test(`${kind} uses words as well as color to highlight its consequence`, () => {
  const ctx = context(), action = kind === 'claim' ? 'daily_chest' : kind === 'spend' ? 'buy' : 'trade';
  const html = ctx.button('OPTION', action, {}, {});
  assert.match(html, new RegExp('action-' + kind));
  assert.match(html, new RegExp(kind === 'claim' ? 'CLAIM READY' : kind === 'spend' ? 'CHECK COST' : 'REVIEW RISK'));
});

test('cooldown, missing energy, egg gates and uncertainty keep their real disabled reasons', () => {
  const ctx = context();
  ctx.state.cooldowns.entries = [{ key: 'action:feed', remaining_seconds: 120 }];
  assert.match(ctx.button('FEED', 'feed'), / disabled/);
  assert.match(ctx.button('FEED', 'feed'), /Available in 2 minutes/);
  ctx.state.pet.energy = 2; assert.match(ctx.button('TRAIN', 'train'), /Requires 18 energy/);
  ctx.state.lifecycle.phase = 'egg'; assert.match(ctx.button('FEED', 'feed'), /HATCH REQUIRED/);
  assert.doesNotMatch(ctx.button('RECOVER', 'event_recover'), / disabled/);
  ctx.petActionRefreshRequired = true;
  const locked = ctx.button('CLAIM', 'daily_chest');
  assert.match(locked, /REFRESH REQUIRED/); assert.match(locked, /UNAVAILABLE/); assert.doesNotMatch(locked, /CLAIM READY/);
});

test('saved recovery and destructive choices explain their actual outcomes', () => {
  const ctx = context();
  assert.match(ctx.button('ABANDON', 'contract_step', { choice: 'abandon' }, { danger: true }), /no points or XP/);
  ctx.state.guidance.active_run = { settlement_pending: true };
  assert.match(ctx.button('FINISH', 'run_extract', {}), /action-claim/);
  assert.doesNotMatch(ctx.button('FINISH', 'run_extract', {}), /REVIEW RISK/);
  ctx.state.guidance.activity = { recovery_pending: true };
  assert.match(ctx.button('RECOVER', 'activity_claim', {}), /without paying twice/);
  assert.match(ctx.button('DELETE', 'delete_pet_slot'), /training is lost/);
});

test('menus always explain navigation without implying an immediate purchase or reward', () => {
  const ctx = context();
  for (const screen of ['home','missions','explore','work','economy','profile']) {
    const html = ctx.routeButton('OPEN', { screen, focus: 'target' });
    assert.match(html, /\/\/ NO COST/); assert.match(html, /button-purpose/);
    assert.ok(html.includes('data-jump="' + screen + '"'));
    assert.match(html, /without spending resources/);
  }
  assert.match(ctx.routeButton('REVIEW', { screen: 'economy' }, '<unsafe>'), /&lt;unsafe&gt;/);
});

test('care and delayed work controls distinguish their stat and reward effects', () => {
  const ctx = context();
  assert.match(ctx.button('SLEEP', 'sleep'), /Restore energy now/);
  assert.match(ctx.button('START SLEEP', 'activity_start', { activity_type: 'sleep' }), /Recover stats in the background/);
  assert.match(ctx.button('DRINK', 'energy_drink'), /without using a bag item/);
  assert.match(ctx.button('USE', 'use_item'), /Consume one bag item/);
  assert.match(ctx.button('HATCH', 'hatch'), /hidden until Stage 3/);
});


test('accessible descriptions reference purpose plus live price, reward, cooldown and lock text', () => {
  const ctx = context();
  const renders = [
    ctx.button('BUY', 'market_buy', {}, { detail: '17 GOLD // REWARD 2 ITEMS' }),
    ctx.button('TRAIN', 'train', {}, { disabled: true, detail: 'Requires 18 energy' }),
    ctx.button('FEED', 'feed', {}, { disabled: true, cooldown: { remaining_seconds: 120 } }),
    ctx.button('PLAY', 'play'),
  ];
  const seen = new Set();
  for (const html of renders) {
    const refs = html.match(/aria-describedby="([^"]+)"/)[1].split(' ');
    assert.equal(refs.length, html.includes('button-requirements') ? 2 : 1);
    for (const ref of refs) {
      assert.ok(html.includes('id="' + ref + '"'), 'accessible description must target real text');
      assert.ok(!seen.has(ref), 'repeated renders need unique description IDs');
      seen.add(ref);
    }
    assert.ok(refs[0].endsWith('-purpose'));
    if (refs.length === 2) assert.ok(refs[1].endsWith('-requirements'));
  }
  assert.match(renders[0], /id="[^"]+-requirements">Ready now \/\/ 17 GOLD \/\/ REWARD 2 ITEMS/);
  assert.match(renders[1], /id="[^"]+-requirements">LOCKED \/\/ Requires 18 energy/);
  assert.match(renders[2], /id="[^"]+-requirements"><span data-cooldown-expires-at/);
});

test('legacy danger styling does not turn reversible management into semantic risk', () => {
  const ctx = context();
  for (const action of ['notification_set', 'arena_queue_cancel', 'kaiju_queue_cancel', 'kaiju_match_cancel']) {
    const html = ctx.button('CANCEL', action, { enabled: false }, { danger: true });
    assert.match(html, /action-manage/);
    assert.doesNotMatch(html, /action-risk|REVIEW RISK| danger"/);
  }
  assert.match(ctx.button('ABANDON', 'contract_step', { choice: 'abandon' }), /action-risk/);
  for (const action of ['delete_pet_slot', 'arena_forfeit', 'activity_cancel', 'event_close', 'trade']) assert.match(ctx.button('OPTION', action), /REVIEW RISK/);
});


test('hatch entry prompts and timing never promise the later identity reveal', () => {
  assert.doesNotMatch(source, /REVEAL BOT|REVEAL NOT READY|Earliest reveal:|guaranteed reveal:|Journey progress starts after the reveal/);
  assert.match(source, /button\('HATCH BOT', 'hatch'/);
  assert.match(source, /statusLabel: incubation.ready \? '' : 'HATCH NOT READY'/);
  assert.match(source, /Earliest hatch: day/);
  assert.match(source, /guaranteed hatch: day/);
  assert.match(source, /HATCH BOT to start your companion’s breakout. Identity reveals at Stage 3./);
});

test('solo and player Kaiju card choices announce the actual Worker energy cost for every outcome', () => {
  const rewardsSource = worker.slice(worker.indexOf('const PET_KAIJU_RESULT_REWARDS = '), worker.indexOf('async function awardPetKaijuMatchResults'));
  const rewards = vm.runInNewContext(rewardsSource + '\nPET_KAIJU_RESULT_REWARDS;');
  const costText = `Settlement costs ${rewards.kaiju_loss.energy_cost} energy for a loss, ${rewards.kaiju_draw.energy_cost} for a draw or ${rewards.kaiju_win.energy_cost} for a win.`;
  for (const mode of ['solo', 'group']) {
    const ctx = context();
    ctx.state.kaiju = { match: { match_id: mode + '-match', mode } };
    const html = ctx.button('CARD // 90', 'kaiju_card', { match_id: mode + '-match', card_key: 'kong' }, { detail: 'ACTIVE POWER 90 // BEST POWER 90' });
    const purpose = html.match(/class="button-purpose"[^>]*>([^<]+)<\/span>/)[1];
    assert.ok(purpose.includes(costText));
    assert.ok(html.match(/aria-description="([^"]+)"/)[1].includes(costText));
    const purposeId = html.match(/class="button-purpose" id="([^"]+)"/)[1];
    assert.ok(html.match(/aria-describedby="([^"]+)"/)[1].split(' ').includes(purposeId));
    assert.match(html, /COMMIT CHOICE/);
    assert.match(html, /ACTIVE POWER 90 \/\/ BEST POWER 90/);
    assert.match(purpose, /rival’s card stays hidden/);
  }
});


test('Kaiju guidance highlights current category leaders, including ties, without changing payloads', () => {
  const expected = { pwr: ['god-dzilla'], size: ['mf-gidorah'], atk: ['mc-rodan', 'mecha-zilla'], def: ['mecha-zilla'], spd: ['moth-def'], lgcy: ['god-dzilla'] };
  const ctx = context();
  ctx.number = String; ctx.panelOpenState = {}; ctx.window.MoonpetGuide = guide;
  vm.runInContext(block('kaijuGuidance'), ctx);
  for (const category of hooks.PET_KAIJU_CATEGORIES) {
    const cards = hooks.PET_KAIJU_CARDS.map(card => ({ ...card, active_stat: category.label, active_value: card.stats[category.key] }));
    const board = { match: { match_id: 'saved-match', category }, cards };
    const before = structuredClone(board);
    const html = ctx.renderKaijuCards(board);
    const leaders = [...html.matchAll(/data-kaiju-card="([^"]+)" data-kaiju-best-active/g)].map(match => match[1]);
    assert.deepEqual(leaders, expected[category.key]);
    for (const card of cards) {
      assert.ok(html.includes(escape(card.name + ' // ' + category.name + ' [' + category.label + '] ' + card.active_value)));
      assert.ok(html.includes(escape(JSON.stringify({ match_id: 'saved-match', card_key: card.id }))));
    }
    assert.match(html, /not a guaranteed win/);
    assert.match(html, /Settlement costs 4 energy for a loss, 5 for a draw or 6 for a win/);
    assert.deepEqual(board, before);
  }
});

test('Kaiju missing category, bad active values, locked cards and refresh stay truthful', () => {
  const ctx = context(); ctx.number = String; ctx.panelOpenState = {}; ctx.window.MoonpetGuide = guide;
  vm.runInContext(block('kaijuGuidance'), ctx);
  const category = hooks.PET_KAIJU_CATEGORIES.find(entry => entry.key === 'spd');
  const board = { match: { match_id: 'saved', category }, cards: [
    { id: 'wrong', name: '<wrong>', active_stat: 'PWR', active_value: 99 },
    { id: 'null', name: 'Missing', active_stat: 'SPD', active_value: null },
    { id: 'nan', name: 'Invalid', active_stat: 'SPD', active_value: NaN }
  ] };
  assert.doesNotMatch(ctx.renderKaijuCards(board), /data-kaiju-best-active/);
  assert.match(ctx.renderKaijuCards(board), /&lt;wrong&gt;/);
  board.cards.push({ id: 'zero', name: 'Zero', active_stat: 'SPD', active_value: 0 });
  assert.match(ctx.renderKaijuCards(board), /data-kaiju-card="zero" data-kaiju-best-active/);
  board.match.category = null;
  assert.doesNotMatch(ctx.renderKaijuCards(board), /data-kaiju-best-active/);
  board.match.own_card_locked = true;
  assert.equal(ctx.renderKaijuCards(board), '');
  board.match.own_card_locked = false; ctx.petActionRefreshRequired = true;
  assert.match(ctx.renderKaijuCards(board), /REFRESH REQUIRED/);
  assert.doesNotMatch(ctx.renderKaijuCards(board), /CLAIM READY/);
});

test('shared Kaiju example is read-only and help visibility survives redraw preferences', () => {
  const ctx = context(); ctx.panelOpenState = {}; ctx.window.MoonpetGuide = guide;
  vm.runInContext(block('kaijuGuidance'), ctx);
  const html = ctx.renderKaijuHowTo({});
  assert.match(html, / open><summary>/);
  assert.ok(html.includes(guide.kaijuHowTo));
  assert.doesNotMatch(html, /data-action=/);
  assert.match(html, /Example only/);
  assert.match(html, /Solo is a real match with normal settlement costs/);
  assert.ok(guide.sections.find(section => section.id === 'combat').body.includes(guide.kaijuHowTo));
  ctx.panelOpenState['explore:kaiju-help'] = false;
  assert.doesNotMatch(ctx.renderKaijuHowTo({}), / open>/);
  ctx.panelOpenState['explore:kaiju-help'] = true;
  assert.match(ctx.renderKaijuHowTo({ match: { match_id: 'saved' } }), / open>/);
});

test('cost and reward facts stay separate, labelled, escaped and in the accessible description', () => {
  const ctx = context();
  const html = ctx.button('BUNDLE', 'market_buy', { offer_key: 'same-offer' }, {
    cost: { moon_gold: 17, moon_crystals: 2 }, reward: { items: { '<unsafe>': 3 } }, rewardLabel: 'GIVES', missing: '4 Gold',
  });
  assert.match(html, /fact-cost"><b>COST<\/b> 17 moon gold \+ 2 moon crystals/);
  assert.match(html, /fact-reward"><b>GIVES<\/b> 3 &lt;unsafe&gt;/);
  assert.match(html, /<b>STILL NEED<\/b> 4 Gold/);
  assert.ok(html.indexOf('fact-cost') < html.indexOf('class="button-purpose"'), 'prices must be visible before long explanatory prose');
  const requirements = html.match(/id="([^"]+-requirements)"/)[1];
  assert.ok(html.match(/aria-describedby="([^"]+)"/)[1].split(' ').includes(requirements));
  assert.equal(ctx.valueText({}), 'NONE', 'a zero reward is not a free action');
  assert.equal(ctx.costText({}), 'FREE');
});

test('all current adventure and Street Event branches render authoritative odds and separate ranges', () => {
  const ctx = context();
  for (const encounter of [
    ...['moon_alley', 'graffiti_vault', 'nebula_market'].map(hooks.resolvePetAdventureEncounter),
    ...['lost_delivery_drone', 'neon_storm', 'underground_cipher'].map(hooks.resolvePetRandomEncounter),
  ]) for (const choice of encounter.choices) {
    const preview = previewEncounterChoice(choice, { moon_gold: 10000, moon_crystals: 100, style_tokens: 100 });
    const html = ctx.button(choice.label, 'adventure', { adventure_key: choice.key }, { preview });
    assert.equal((html.match(/class="choice-outcome"/g) || []).length, preview.outcomes.length);
    for (const outcome of preview.outcomes) {
      assert.ok(html.includes(Number(outcome.chance.toFixed(2)) + '% ' + outcome.kind.toUpperCase()));
      for (const values of [outcome.rewards, outcome.costs]) for (const [key, bounds] of Object.entries(values)) {
        const range = bounds[0] === bounds[1] ? ctx.number(bounds[0]) : ctx.number(bounds[0]) + '–' + ctx.number(bounds[1]);
        assert.ok(html.includes(range + ' ' + ctx.words(key)), choice.key + ':' + key);
      }
    }
    assert.equal(JSON.parse(html.match(/data-payload="([^"]+)"/)[1].replaceAll('&quot;', '"')).adventure_key, choice.key);
  }
});

test('shop shortfalls use existing currency and material balances, never potential rewards', () => {
  const ctx = context();
  ctx.state.pet = { moon_gold: 7, moon_crystals: 2, style_tokens: 8 };
  ctx.state.materials = [{ key: 'scrap_metal', quantity: 3 }];
  assert.equal(ctx.missingCostText({ moon_gold: 10, moon_crystals: 2, scrap_metal: 5 }), '3 moon gold + 2 scrap metal');
  assert.equal(ctx.missingCostText({ moon_gold: 7 }), '');
  ctx.state.pet.moon_gold = 0;
  assert.equal(ctx.missingCostText({ moon_gold: 10 }), '10 moon gold');
});

test('recommendations omit fully blocked adventures and unquoted or locked upgrades', () => {
  const options = createRequire(import.meta.url)('../js/moonpet-play-options.js');
  const snapshot = { adopted: true, lifecycle: { phase: 'young' }, pet: { energy: 30 },
    adventure: { available: true, minimum_energy: 16, choices: [{ preview: { available: false } }] },
    live_systems: { upgrades: [{ unlocked: false, affordable: true, quote_version: 'quote' }] } };
  assert.ok(!options.recommendations(snapshot).some(entry => ['adventure', 'gear_upgrade'].includes(entry.key)));
  snapshot.adventure.choices.push({ preview: { available: true, affordability: 'conditional' } });
  assert.ok(options.recommendations(snapshot).some(entry => entry.key === 'adventure'));
  snapshot.live_systems.upgrades[0].unlocked = true;
  delete snapshot.live_systems.upgrades[0].quote_version;
  assert.ok(!options.recommendations(snapshot).some(entry => entry.key === 'gear_upgrade'));
  snapshot.live_systems.upgrades[0].quote_version = 'quote';
  assert.ok(options.recommendations(snapshot).some(entry => entry.key === 'gear_upgrade'));
});

test('inverted hunger is presented as accessible fullness and clamped to 100', () => {
  const ctx = context();
  vm.runInContext(between('  function meter(', '  function renderCanvasTools('), ctx);
  assert.match(ctx.meter('FULLNESS', 75, true), /aria-label="FULLNESS".*aria-valuenow="25"/);
  assert.match(ctx.meter('FULLNESS', 75, true), /25\/100/);
  assert.match(ctx.meter('FULLNESS', -20, true), /aria-valuenow="100"/);
  assert.match(ctx.meter('FULLNESS', 130, true), /aria-valuenow="0"/);
  ctx.activeScreen = 'home';
  vm.runInContext(between('  var panelOpenState', '  function meter('), ctx);
  const vitals = ctx.panel('VITAL SYSTEMS', ctx.meter('FULLNESS', 75, true), 'vitals');
  const summary = vitals.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/)[0];
  assert.match(summary, /Check health, energy, fullness, fun and cleanliness\./);
  assert.doesNotMatch(summary, /\bhunger\b/i);
  const home = between('  function renderHome()', '  // TEST-EXPORT: coreStateHydration:start');
  assert.ok(home.includes("meter('FULLNESS', pet.hunger, true)"));
  const care = home.slice(home.indexOf("panel('CARE CONSOLE'"), home.indexOf('      renderSeasonSlots()'));
  assert.doesNotMatch(care, /meter\(/, 'Care actions do not duplicate the vital bars');
});

test('confirmed choice feedback stays with its source pet, hides duplicate gains, and escapes text', () => {
  const ctx = context();
  ctx.lastChoiceResult = null; ctx.panelOpenState = {};
  vm.runInContext(block('actionResultFeedback'), ctx);
  const before = { pet: { pet_id: 'source-pet' } };
  ctx.rememberChoiceResult('adventure', { accepted: false }, before);
  assert.equal(ctx.lastChoiceResult, null);
  ctx.rememberChoiceResult('adventure', { accepted: true, pet: { pet_id: 'source-pet' }, choice: { label: '<Cash Out>' },
    result_copy: '<server outcome>', rewards: { moon_gold: 5 }, applied: { costsApplied: { energy: 7 } } }, before);
  assert.equal(ctx.renderChoiceResult('adventure'), '', 'another pet cannot inherit this response');
  ctx.state.pet.pet_id = 'source-pet';
  const html = ctx.renderChoiceResult('adventure');
  assert.match(html, /&lt;Cash Out&gt;/); assert.match(html, /&lt;server outcome&gt;/);
  assert.match(html, /\+5 moon gold/); assert.match(html, /<b>COST<\/b> 7 energy/);
  assert.match(html, /data-dismiss-choice-result/);
  assert.equal(ctx.renderChoiceResult('street-event'), '');
  ctx.rememberChoiceResult('adventure', { accepted: true, duplicate: true, rewards: { moon_gold: 99 }, applied: { costsApplied: { energy: 7 } } }, before);
  assert.match(ctx.renderChoiceResult('adventure'), /NO SECOND PAYMENT/);
  assert.doesNotMatch(ctx.renderChoiceResult('adventure'), /\+99|<b>COST<\/b>/);
});

test('duplicate Street Event recovery uses the saved source even after a pet switch', async () => {
  // Exercise the actual receipt-only Worker response, which has no result.pet.
  const db = { prepare(sql) {
    assert.match(sql, /id=\? AND telegram_id=\? AND event_type='random_event'/);
    return { bind(id, owner) {
      assert.equal(id, 'accepted-event'); assert.equal(owner, 'owner');
      return { first: async () => ({ id, pet_id: 'source-pet', status: 'accepted' }) };
    } };
  } };
  const result = await hooks.processPetRandomEvent(db, 'owner', '', { saved_event_id: 'accepted-event' });
  assert.equal(result.accepted, true); assert.equal(result.duplicate, true);
  assert.equal(result.pet, undefined);
  const ctx = context(); ctx.lastChoiceResult = null; ctx.panelOpenState = {};
  vm.runInContext(block('actionResultFeedback'), ctx);
  const before = { pet: { pet_id: 'replacement-pet' }, pending_street_events: [
    { event_id: 'other-event', pet_id: 'unrelated-pet' },
    { event_id: 'accepted-event', pet_id: 'source-pet' },
  ] };
  ctx.rememberChoiceResult('event_recover', result, before, { event_id: 'accepted-event' });
  assert.equal(ctx.lastChoiceResult.pet_id, 'source-pet');
  ctx.state.pet.pet_id = 'replacement-pet';
  assert.equal(ctx.renderChoiceResult('street-event'), '');
  ctx.state.pet.pet_id = 'source-pet';
  assert.match(ctx.renderChoiceResult('street-event'), /NO SECOND PAYMENT/);
  assert.doesNotMatch(ctx.renderChoiceResult('street-event'), /\+[0-9]|<b>COST<\/b>/);
  ctx.lastChoiceResult = null;
  ctx.rememberChoiceResult('event_recover', result, before, { event_id: 'missing-event' });
  assert.equal(ctx.lastChoiceResult, null, 'unknown ownership cannot become the displayed pet');
  ctx.rememberChoiceResult('event_recover', result, { pet: before.pet }, { event_id: 'accepted-event' });
  assert.equal(ctx.lastChoiceResult, null, 'absent saved state cannot invent a source');
  ctx.rememberChoiceResult('event_recover', { ...result, pet: { pet_id: 'verified-source' } }, before, { event_id: 'missing-event' });
  assert.equal(ctx.lastChoiceResult.pet_id, 'verified-source', 'a returned source pet remains authoritative');
});

test('real Shop renderer explains each gate and keeps owned free switches available', () => {
  const ctx = context();
  ctx.state.pet = { pet_id: 'guidance-pet', level: 1, moon_gold: 5 };
  ctx.panel = (_, body) => body; ctx.craftingGoalMarkup = () => '';
  ctx.window.MoonpetPlayOptions = createRequire(import.meta.url)('../js/moonpet-play-options.js');
  vm.runInContext(between('  function renderEconomy(', '  // TEST-EXPORT: notificationControls:start'), ctx);
  ctx.state.guidance.shop_items = [
    { key: 'locked', title: 'Locked Item', min_level: 8, unlocked: false, affordable: false, cost: { moon_gold: 12 } },
    { key: 'poor', title: 'Poor Item', min_level: 1, unlocked: true, affordable: false, cost: { moon_gold: 12 } },
    { key: 'ready', title: 'Ready Item', min_level: 1, unlocked: true, affordable: true, cost: { moon_gold: 5 } },
    { key: 'owned', title: 'Owned Item', min_level: 1, unlocked: true, affordable: false, owned: true },
    { key: 'equipped', title: 'Equipped Item', min_level: 1, unlocked: true, owned: true, equipped: true },
  ];
  const html = ctx.renderEconomy();
  const card = title => html.match(new RegExp('<button[^>]*aria-label="[^"\\n]*' + title + '[^"\\n]*"[^>]*>[\\s\\S]*?<\\/button>'))[0];
  assert.match(card('Locked Item'), / disabled.*LEVEL 8 REQUIRED/);
  assert.match(card('Poor Item'), / disabled.*STILL NEED<\/b> 7 moon gold/);
  assert.doesNotMatch(card('Ready Item'), / disabled/); assert.match(card('Ready Item'), /CAN BUY NOW/);
  assert.doesNotMatch(card('Owned Item'), / disabled/); assert.match(card('Owned Item'), /COST<\/b> FREE/);
  assert.match(card('Equipped Item'), / disabled.*EQUIPPED/);
  assert.match(html, /UNLOCK LEVEL 8 \/\/ YOUR LEVEL 1/);
});

test('real Market renderer discloses every cost and granted item/material/currency in all twelve templates', () => {
  const ctx = context();
  ctx.panel = (_, body) => body; ctx.craftingGoalMarkup = () => '';
  ctx.window.MoonpetPlayOptions = createRequire(import.meta.url)('../js/moonpet-play-options.js');
  ctx.state.guidance.economy = { day_key: '2026-10-11', market_offers: PET_MARKET_OFFERS.map(offer => ({ ...offer, unlocked: true, affordable: true, available: true })) };
  vm.runInContext(between('  function renderEconomy(', '  // TEST-EXPORT: notificationControls:start'), ctx);
  const html = ctx.renderEconomy();
  assert.equal(PET_MARKET_OFFERS.length, 12);
  for (const offer of PET_MARKET_OFFERS) {
    const card = html.match(new RegExp('<button[^>]*aria-label="' + offer.title + '"[^>]*>[\\s\\S]*?<\\/button>'))[0];
    assert.match(card, /fact-cost"><b>COST<\/b>/);
    assert.match(card, /fact-reward"><b>GIVES<\/b>/);
    for (const [key, amount] of Object.entries(offer.cost)) assert.ok(card.includes(amount + ' ' + ctx.words(key)));
    for (const [key, amount] of Object.entries(offer.reward)) {
      if (typeof amount === 'object') for (const [item, quantity] of Object.entries(amount)) assert.ok(card.includes(quantity + ' ' + ctx.words(item)));
      else assert.ok(card.includes(amount + ' ' + ctx.words(key)));
    }
    const payload = JSON.parse(card.match(/data-payload="([^"]+)"/)[1].replaceAll('&quot;', '"'));
    assert.equal(payload.offer_key, offer.key); assert.equal(payload.day_key, '2026-10-11');
  }
});

test('meal cooldown affects cooked food only, never unrelated bag items', () => {
  const ctx = context();
  ctx.panel = (_, body) => body;
  ctx.craftingGoalMarkup = () => '';
  ctx.window.MoonpetPlayOptions = createRequire(import.meta.url)('../js/moonpet-play-options.js');
  ctx.state.cooldowns.entries = [{ key: 'action:meal', remaining_seconds: 38, expires_at: new Date(Date.now()+38000).toISOString() }];
  ctx.state.inventory = [
    { key: 'street_pizza', title: 'Street Pizza', kind: 'usable_item', count: 2 },
    { key: 'moon_burger', title: 'Moon Burger', kind: 'usable_item', count: 1 },
    { key: 'moon_snack', title: 'Moon Snack', kind: 'usable_item', count: 2 },
    { key: 'clean_wipe', title: 'Clean Wipe', kind: 'usable_item', count: 1 }
  ];
  vm.runInContext(between('  function renderEconomy(', '  // TEST-EXPORT: notificationControls:start'), ctx);
  const html=ctx.renderEconomy();
  const card=(name)=>html.match(new RegExp('<button[^>]*aria-label="USE '+name+'"[^>]*>[\\s\\S]*?<\\/button>'))?.[0];
  assert.ok(card('Street Pizza') && card('Moon Burger') && card('Moon Snack') && card('Clean Wipe'));
  for (const name of ['Street Pizza','Moon Burger']) assert.match(card(name), / disabled/, name+' must respect shared meal cooldown');
  for (const name of ['Moon Snack','Clean Wipe']) assert.doesNotMatch(card(name), / disabled/, name+' must not inherit cooked meal cooldown');
});

test('real Egg Food Counter renders but never allows a pre-hatch meal', () => {
  const ctx = context();
  ctx.panel = (title, body) => '<section><h2>' + title + '</h2>' + body + '</section>';
  ctx.state.lifecycle.phase = 'egg';
  ctx.stateNeedsFullHydration = () => false;
  ctx.state.inventory = [{ key: 'street_pizza', title: 'Street Pizza', kind: 'usable_item', count: 1 }];
  vm.runInContext(between('  function renderFoodCounter()', '  function renderPetEmotes()'), ctx);
  const html=ctx.renderFoodCounter();
  assert.match(html, /FOOD COUNTER \/\/ CHOOSE A MEAL/, 'the food counter remains visible on Egg Home');
  assert.match(html, /Street Pizza/, 'saved food is not hidden');
  assert.match(html, /HATCH REQUIRED/, 'bag consumption is still gated until hatch');
  assert.match(html, /data-action="use_item"[^>]* disabled/, 'a pre-hatch meal cannot spend a bag item');
});
