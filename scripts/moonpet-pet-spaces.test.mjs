import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const block = name => between('// TEST-EXPORT: ' + name + ':start', '// TEST-EXPORT: ' + name + ':end');
function context(full = false) {
  const slots = [2091, 2313, 0].map((xp, index) => ({
    slot_number: index + 1, pet_id: 'saved-pet-' + (index + 1), season_key: index < 2 ? 'original-quarter' : 'current-quarter',
    unlocked: true, active: index === 2, selectable: true, instance_present: true,
    pet: { display_name: index === 2 ? 'Secret Bot' : 'UNKNOWN', level: index < 2 ? 8 : 1, pet_xp: xp,
      lifecycle_phase: index === 2 ? 'egg' : 'young', health: 75, energy: 70,
      ...(full ? { progression: { pet_id: 'saved-pet-' + (index + 1), lifecycle: { current_stage: index === 2 ? 1 : 2, total_stages: 6 } } } : {}) },
  }));
  const ctx = {
    state: { adopted: true, pet: { pet_id: 'saved-pet-3', season_key: 'current-quarter', level: 1 },
      lifecycle: { phase: 'egg', incubation: {} }, hydration: { full, modules: [] },
      season_slots: { hydrated: full, slots, arcade_xp_available: 0, max_slots: 3 } },
    activeScreen: 'home', petActionRefreshRequired: false, MOONPET_IDENTITY_REVEAL_STAGE: 3,
    escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    number: value => Number(value || 0).toLocaleString('en-US'), words: value => String(value || '').replaceAll('_', ' '),
    careActionButtonOptions: (_, options) => options, actionCooldownButtonOptions: (_, options) => options,
    shouldShowAvailability: () => false, playOptionsReady: () => true,
    seasonTiming: () => ({ status: 'UNAVAILABLE' }), seasonSnapshotElapsed: () => 0,
    activePetSummary: () => '', renderPlayNow: () => '', meter: () => '',
    homeNextLine: () => '', profileNextLine: () => '', moonpetStageLabel: (_, pet) => pet.lifecycle_phase || 'Egg',
    resolveMoonpetDisplayName: () => 'UNKNOWN', valueText: () => '', costText: () => '',
  };
  vm.createContext(ctx);
  vm.runInContext(between('  function button(', '  function meter('), ctx);
  vm.runInContext(between('  function renderPetInstanceCard(', '  function routeButton('), ctx);
  vm.runInContext(between('  function routeButton(', '  function objectiveRouteButton('), ctx);
  vm.runInContext(between('  function stateNeedsFullHydration(', '  function stateRefreshPayload('), ctx);
  vm.runInContext(block('notificationControls'), ctx);
  vm.runInContext(between('  function renderHome()', '  // TEST-EXPORT: coreStateHydration:start'), ctx);
  vm.runInContext(between('  function renderProfile()', '  var screens ='), ctx);
  Object.assign(ctx, {
    screen: { innerHTML: '', querySelectorAll: () => [] }, document: { getElementById: () => null },
    fullStateHydrationFailures: 0, FULL_STATE_HYDRATION_MAX_AUTO_RETRIES: 3, fullStateHydrationPromise: null,
    renderedPetId: '', authenticationFailure: false, reducedMotion: false,
    captureEditableState: () => null, renderHud() {}, renderNav() {}, renderCanvasTools() {}, restoreEditableState() {},
    renderRecommended: () => '', applyRequestedFocus() {},
    screens: { home: ctx.renderHome, profile: ctx.renderProfile },
  });
  vm.runInContext(between('  function render(options)', '  // TEST-EXPORT: actionResultFeedback:start'), ctx);
  return ctx;
}

function petSpaces(html) {
  const match = html.match(/<details\b[^>]*data-panel="pet-spaces"[^>]*>[\s\S]*?<\/details>/);
  assert.ok(match, 'pet spaces have their own labelled panel outside competition details');
  return match[0];
}
function switchButtons(html) {
  return [...html.matchAll(/<button\b[^>]*data-action="switch_pet_slot"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
}

for (const full of [false, true]) for (const screen of ['home', 'profile']) {
  test(`${screen}: ${full ? 'full' : 'core'} egg roster exposes both original pets and enabled switches`, () => {
    const ctx = context(full); ctx.activeScreen = screen;
    const html = ctx[screen === 'home' ? 'renderHome' : 'renderProfile']();
    const roster = petSpaces(html);
    assert.match(roster, /^<details\b[^>]*\sopen(?:\s|>)/, 'the selector is expanded on first visit');
    assert.match(roster, /PET SPACES/);
    assert.match(roster, /2,091/); assert.match(roster, /2,313/);
    const switches = switchButtons(roster);
    assert.equal(switches.length, 2);
    for (let index = 0; index < switches.length; index++) {
      assert.doesNotMatch(switches[index], / disabled|HATCH REQUIRED/);
      const payload = JSON.parse(switches[index].match(/data-payload="([^"]+)"/)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
      assert.equal(payload.pet_id, 'saved-pet-' + (index + 1));
      assert.equal(payload.slot_number, index + 1);
    }
    assert.match(roster, /data-season-slot="3"[\s\S]*◆ ACTIVE/);
    assert.doesNotMatch(roster, /data-action="buy_pet_slot"/, 'three owned pets cannot purchase another space');
    assert.equal((html.match(/data-season-slot="1"/g) || []).length, 1, 'the roster is rendered once');
  });
}

test('a preserved space with a missing instance stays visible without a switch or delete button', () => {
  const ctx = context(); const missing = ctx.state.season_slots.slots[0];
  Object.assign(missing, { selectable: false, instance_present: false, pet: null, selection_disabled_reason: 'pet_instance_missing' });
  const html = petSpaces(ctx.renderHome());
  const row = html.match(/<article\b[^>]*data-season-slot="1"[^>]*>[\s\S]*?<\/article>/)[0];
  assert.match(row, /OWNED SPACE PRESERVED/);
  assert.doesNotMatch(row, /data-action="(?:switch_pet_slot|delete_pet_slot)"/);
  assert.equal(switchButtons(html).length, 1);
});

test('a saved decision to collapse pet spaces is respected', () => {
  const ctx = context(); ctx.panelOpenState['saved-pet-3:home:pet-spaces'] = false;
  assert.doesNotMatch(petSpaces(ctx.renderHome()).split('>')[0], /\sopen(?:\s|$)/);
});

test('uncertain prior action blocks switching even when a saved roster is present', () => {
  const ctx = context(); ctx.petActionRefreshRequired = true;
  for (const button of switchButtons(petSpaces(ctx.renderHome()))) {
    assert.match(button, / disabled/);
  }
});

for (const stopped of [false, true]) {
  test(`Profile ${stopped ? 'failed' : 'pending'} hydration retains the core roster and enabled switches`, () => {
    const ctx = context(); ctx.activeScreen = 'profile';
    ctx.fullStateHydrationFailures = stopped ? 3 : 0;
    ctx.fullStateHydrationPromise = stopped ? null : Promise.resolve();
    ctx.render();
    const roster = petSpaces(ctx.screen.innerHTML);
    assert.equal(switchButtons(roster).length, 2);
    assert.match(roster, /2,091/); assert.match(roster, /2,313/);
    for (const button of switchButtons(roster)) assert.doesNotMatch(button, / disabled/);
    assert.match(ctx.screen.innerHTML, /data-panel="module-loading"/);
    if (stopped) assert.match(ctx.screen.innerHTML, /RETRY MODULE/);
  });
}
