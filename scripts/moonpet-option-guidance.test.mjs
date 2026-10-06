import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('js/moonpet-mini-app.js');
const worker = read('workers/moonboys-api/worker.js');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const block = name => between('// TEST-EXPORT: ' + name + ':start', '// TEST-EXPORT: ' + name + ':end');
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function context() {
  const ctx = { state: { adopted: true, pet: { pet_id: 'guidance-pet', energy: 80 }, lifecycle: { phase: 'young' }, guidance: {}, cooldowns: { entries: [] }, entry_requirement: { eligible: true } },
    petActionRefreshRequired: false, escapeHtml: escape, playOptionsReady: () => true,
    cooldownRemainingSeconds: value => Number(value && value.remaining_seconds || 0),
    countdownText: () => 'Available in 2 minutes', countdownMarkup: () => '<span data-cooldown-expires-at="later">Available in 2 minutes</span>',
    post: () => { throw Error('Rendering must not request data'); },
    window: { setTimeout: () => { throw Error('Rendering must not create timers'); } } };
  vm.createContext(ctx); vm.runInContext(block('actionAvailability') + between('  function button(', '  var panelOpenState'), ctx);
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
  assert.equal(actions.length, 69);
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
