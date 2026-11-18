import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { sandboxPlayers } from './moonpet-sandbox-players.mjs';

const { missionStatus, missionClaims, menuStatuses, menuBadge, legendaryRoadmap } = createRequire(import.meta.url)('../js/moonpet-play-options.js');
const keys = ['pet-daily-feed', 'pet-daily-train', 'pet-daily-care', 'pet-daily-trade', 'pet-daily-shop', 'pet-daily-adventure', 'pet-daily-bank'];
function snapshot(completed = 0) {
  return { adopted: true, pet: { pet_id: 'selected-pet' }, lifecycle: { phase: 'young' },
    guidance: { missions: keys.map((key, index) => ({ key, title: key, completed: index < completed })),
      daily_completion: { available: true, ready: completed === 7, claimed: false, pending: [] } } };
}

test('missing and deferred mission authority never renders a completed checklist', () => {
  for (const state of [null, {}, { adopted: false }, { adopted: true, pet: {} },
    { ...snapshot(7), hydration: { full: false, mode: 'core' } }]) {
    assert.equal(missionStatus(state).available, false);
    assert.equal(missionStatus(state).status, 'SYNCING');
  }
  const missions = { ...snapshot(7), hydration: { full: false, modules: ['missions'] } };
  assert.equal(missionStatus(missions).status, 'COMPLETE');
});

test('Road to Legendary reads authoritative lifetime state and exposes navigation only', () => {
  const state = snapshot(4);
  state.pet = { pet_id: 'selected-pet', level: 27, pet_xp: 28942 };
  state.season_slots = { slots: [{ active: true, pet: { progression: {
    lifecycle: { current_stage: 2, total_stages: 6 },
    growth_marks: { earned: 90, required: 240 },
    weekly_crests: { earned: 13, required: 44 },
  } } }] };
  state.relics = [{ relic_id: 'one' }, { relic_id: 'two' }, { relic_id: 'two' }];
  state.materials = [
    { key: 'scrap_metal', quantity: 112 },
    { key: 'evolution_fragment', quantity: 22 },
  ];
  state.guidance.jobs = [
    { key: 'vault_guard', title: 'Vault Guard', pet_xp: 36, available: true },
    { key: 'signal_hacker', title: 'Signal Hacker', pet_xp: 38, available: false },
    { key: 'crystal_miner', title: 'Crystal Miner', pet_xp: 30, available: true },
  ];
  state.guidance.activity_options = [{ key: 'explore', cap_seconds: 28800 }];
  state.guidance.evolution = {
    name: 'Elite Moonpet', ready: false,
    missing: [
      { key: 'growth_marks', label: 'Growth Marks', current: 90, required: 120, source: 'Daily Journey' },
      { key: 'weekly_crests', label: 'Weekly Crests', current: 13, required: 16, source: 'Weekly Journey' },
    ],
  };
  const road = legendaryRoadmap(state);
  assert.equal(road.available, true);
  assert.equal(road.status, 'IN PROGRESS');
  assert.equal(road.stage, 1, 'older snapshots identify Stage 1 as the second form');
  assert.equal(road.level, 27);
  assert.equal(road.petXp, 28942);
  assert.deepEqual(road.growthMarks, { earned: 90, required: 240 });
  assert.deepEqual(road.weeklyCrests, { earned: 13, required: 44 });
  assert.equal(road.relics, 2, 'duplicate relic IDs count once');
  assert.deepEqual(road.materials, { scrapMetal: 112, evolutionFragments: 22 });
  assert.deepEqual(road.bestJob, { key: 'vault_guard', title: 'Vault Guard', basePetXp: 36 });
  assert.equal(road.exploreActivityAvailable, true);
  assert.equal(road.routes[3].title, 'TIMED EXPLORE');
  assert.equal(road.routes[4].title, 'BEST UNLOCKED JOB // Vault Guard');
  assert.equal(road.nextEvolution.missing.length, 2);
  assert.deepEqual(road.routes.map(route => route.screen + ':' + route.focus), [
    'missions:daily-journey', 'missions:weekly-journey', 'explore:moon-run',
    'work:timed-activity', 'work:jobs', 'economy:relics', 'profile:evolution'
  ]);
  assert.ok(road.routes.every(route => !Object.prototype.hasOwnProperty.call(route, 'action')),
    'roadmap routes must navigate only and never submit gameplay');
});

test('the roadmap follows saved Worker stages, incubation and per-evolution Journey requirements', async () => {
  const fixture = await performanceFixture();
  try {
    for (const stage of [0, 3, 4, 5]) {
      await sandboxPlayers['stage-' + stage].prepare(fixture);
      if (stage === 0) {
        fixture.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=0, level=1 WHERE telegram_id=?').run(fixture.owner);
        fixture.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=0, level=1 WHERE telegram_id=?').run(fixture.owner);
      }
      const { state } = await fixture.measureHttp();
      const road = legendaryRoadmap(state);
      assert.equal(road.stage, stage);
      assert.equal(road.finalForm, stage === 5);
      if (stage === 0) {
        assert.equal(road.petXp, 0);
        assert.equal(road.status, 'INCUBATING');
        assert.deepEqual(road.routes, [{ screen: 'home', focus: 'incubation', title: state.next.title, detail: state.next.detail }]);
      } else if (!road.finalForm) {
        const req = state.season_slots.slots.find(slot => slot.active).pet.progression.lifecycle.requirements;
        if (stage === 3) assert.ok(req.growth_marks.required < road.growthMarks.required);
        for (const [key, label] of [['min_age_days', 'Pet age (days)'], ['growth_marks', 'Growth Marks'], ['weekly_crests', 'Weekly Crests']]) {
          assert.equal(req[key].complete, false);
          const rows = road.nextEvolution.missing.filter(row => row.label === label);
          assert.deepEqual(rows.map(row => [row.current, row.required]), [[req[key].current, req[key].required]]);
        }
        assert.ok(state.guidance.evolution.missing.every(row => road.nextEvolution.missing.some(entry => entry.label === row.label)));
        const daily = road.routes.find(route => route.focus === 'moon-run');
        assert.match(daily.detail, /ends your one official Daily Run attempt for the UTC day/);
        assert.match(daily.detail, /repeatable Moon Run banks its XP bag/);
      } else {
        assert.equal(road.nextEvolution, null);
      }
    }
  } finally { fixture.close(); }
});

test('Road to Legendary fails closed on missing identity or partial hydration', () => {
  assert.equal(legendaryRoadmap({}).available, false);
  assert.equal(legendaryRoadmap({ adopted: true, pet: { pet_id: 'p' }, hydration: { full: false } }).status, 'SYNCING');
});

test('the roadmap distinguishes missing Worker data from saved zero counts', () => {
  const state = { ...snapshot(), hydration: { full: true }, relics: [], relics_available: true };
  const pet = {};
  state.season_slots = { slots: [{ active: true, pet }] };
  const saved = {
    lifecycle: { current_stage: 1, total_stages: 6 },
    growth_marks: { earned: 0, required: 240 },
    weekly_crests: { earned: 0, required: 44 },
  };
  for (const missing of [null, {}, { ...saved, lifecycle: null }, { ...saved, growth_marks: { required: 240 } },
    { ...saved, weekly_crests: { earned: 0, required: null } }]) {
    pet.progression = missing;
    assert.deepEqual(legendaryRoadmap(state), { available: false, status: 'SYNCING', routes: [] });
  }
  pet.progression = saved;
  const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
  const renderer = client.slice(client.indexOf('  function renderLegendaryRoadmap()'), client.indexOf('  function renderMissions()'));
  const context = vm.createContext({ state, window: { MoonpetPlayOptions: { legendaryRoadmap } },
    panel: (_, body) => body, routeButton: route => route, escapeHtml: String, number: String });
  vm.runInContext(renderer, context);
  assert.match(context.renderLegendaryRoadmap(), /UNIQUE RELICS<\/span><strong>0<\/strong>/);
  state.relics_available = false;
  assert.match(context.renderLegendaryRoadmap(), /UNIQUE RELICS<\/span><strong>UNAVAILABLE<\/strong>/);
  assert.match(context.renderLegendaryRoadmap(), /GROWTH MARKS<\/span><strong>0\/240<\/strong>/);
});

test('legacy season_complete alone cannot label Road to Legendary complete', () => {
  const state = snapshot();
  state.pet = { pet_id: 'selected-pet', level: 20, pet_xp: 10000 };
  state.season_slots = { slots: [{ active: true, pet: { progression: {
    season_complete: true, lifetime_complete: false,
    lifecycle: { current_stage: 3, total_stages: 6 },
    growth_marks: { earned: 100, required: 240 },
    weekly_crests: { earned: 14, required: 44 },
  } } }] };
  assert.equal(legendaryRoadmap(state).status, 'IN PROGRESS');
});

test('Missions renders Road to Legendary through navigation buttons only', () => {
  const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
  assert.match(client, /panel\('ROAD TO LEGENDARY'/);
  const start = client.indexOf('function renderLegendaryRoadmap()');
  const end = client.indexOf('function renderMissions()', start);
  assert.ok(start >= 0 && end > start);
  const body = client.slice(start, end);
  assert.match(body, /legendaryRoadmap\(state\)/);
  assert.match(body, /routeButton\(target\.title, target, target\.detail\)/);
  assert.doesNotMatch(body, /\bbutton\(/, 'Road to Legendary must never emit an action button');
  assert.doesNotMatch(body, /data-action=/, 'Road to Legendary must not submit an action directly');
});

test('daily mission completion and bonus payment are distinct authoritative states', () => {
  const state = snapshot(3);
  assert.equal(missionStatus(state).completed, 3);
  assert.equal(missionStatus(state).total, 7);
  assert.equal(missionStatus(state).status, 'IN PROGRESS');
  assert.ok(!missionStatus(state).next.completed);
  assert.equal(missionStatus(state).next.key, keys[3], 'current goal follows the saved checklist order');
  const completed = snapshot(7);
  assert.equal(missionStatus(completed).status, 'COMPLETE');
  assert.equal(missionStatus(completed).next, null);
  completed.guidance.daily_completion.claimed = true;
  assert.equal(missionStatus(completed).status, 'BONUS CLAIMED');
  completed.guidance.daily_completion.available = false;
  assert.equal(missionStatus(completed).status, 'CHECKLIST COMPLETE');
});

test('incomplete daily goals never borrow Journey completion or an older saved bonus', () => {
  const state = snapshot(0);
  state.daily_journey = { completed_objectives: 5, required_objectives: 5, awarded: true };
  state.weekly_journey = { completed_objectives: 5, required_objectives: 5, awarded: true };
  state.guidance.daily_completion.pending = [{ utc_day: '2000-01-01', pet_id: 'earlier-pet' }];
  assert.equal(missionStatus(state).status, 'IN PROGRESS');
  assert.equal(missionClaims(state)[0].count, 1);
});

test('an egg can recover an assigned old bonus but cannot select itself for an unassigned bonus', () => {
  const state = snapshot(7);
  state.lifecycle.phase = 'egg';
  state.guidance.daily_completion.pending = [{ utc_day: '2000-01-01', pet_id: 'earlier-pet' }, { utc_day: '2000-01-02' }];
  assert.equal(missionClaims(state)[0].count, 1);
  state.lifecycle.phase = 'young';
  assert.equal(missionClaims(state)[0].count, 2);
  state.guidance.daily_completion.available = false;
  assert.deepEqual(missionClaims(state), []);
});

test('claim counts deduplicate saved receipts and exclude unfinished or paid rewards', () => {
  const state = snapshot(7);
  state.guidance.daily_completion.pending = [{ utc_day: '2000-01-01' }, { utc_day: '2000-01-01' }];
  state.contracts = { available: false, pending_rewards: [{ contract_id: 'saved', pet_id: 'earlier-pet' }, { contract_id: 'saved', pet_id: 'earlier-pet' }], run: { status: 'active' } };
  state.season_finales = { available: true, pets: [
    { pet_id: 'earlier-pet', competition_season_key: 'old-quarter', status: 'won', claimed: false, playable: false },
    { pet_id: 'earlier-pet', competition_season_key: 'old-quarter', status: 'won', claimed: false },
    { pet_id: 'selected-pet', competition_season_key: 'paid-quarter', status: 'won', claimed: true },
    { pet_id: 'selected-pet', competition_season_key: 'new-quarter', status: 'active' },
    { pet_id: 'selected-pet', competition_season_key: 'next-quarter', status: 'not_started', eligible: true }
  ] };
  const before = structuredClone(state);
  assert.deepEqual(missionClaims(state).map(({ focus, count }) => ({ focus, count })), [
    { focus: 'daily-completion', count: 1 }, { focus: 'contracts', count: 1 }, { focus: 'season-finale', count: 1 }
  ]);
  assert.deepEqual(state, before, 'navigation status cannot mutate authoritative state');
  state.season_finales.available = false;
  assert.equal(missionClaims(state).some(claim => claim.focus === 'season-finale'), false);
});

test('automatic Journey settlement, unclaimed cache and unrelated tabs do not inflate Missions counts', () => {
  const state = snapshot(7);
  state.daily_journey = { ready: true };
  state.weekly_journey = { ready: true };
  state.guidance.daily_cache = { available: true };
  state.guidance.weekly_boss = { pending_rewards: [{ pet_id: 'selected-pet' }] };
  state.guidance.season = { tiers: [{ unlocked: true, claimed_at: null }] };
  state.live_systems = { bounties: [{ complete: true, claimed: false }] };
  assert.deepEqual(missionClaims(state), []);
});


test('capped Contract backlog stays a lower bound through claims and becomes exact below ten', () => {
  const state = snapshot(7);
  state.guidance.daily_completion.pending = [{ utc_day: '2000-01-01' }];
  const backlog = Array.from({ length: 12 }, (_, index) => ({ contract_id: `saved-${index}`, pet_id: 'earlier-pet' }));
  const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
  const navSource = client.slice(client.indexOf('  var navItems = ['), client.indexOf('  // TEST-EXPORT: callsignDraft:start'));
  const statusSource = client.slice(client.indexOf('  function renderMissionStatus('), client.indexOf('  function renderSeasonFinales('));
  const context = vm.createContext({ state, window: { MoonpetPlayOptions: { missionClaims, menuStatuses, menuBadge } }, nav: {},
    authenticationFailure: false, petActionRefreshRequired: false, activeScreen: 'missions',
    number: String, escapeHtml: String, objectiveRouteButton: () => '', routeButton: label => label, panelOpenState: {}, countdownMarkup: () => '' });
  vm.runInContext(navSource + statusSource, context);
  for (const remaining of [12, 11, 10, 9, 1, 0]) {
    state.contracts = { available: false, pending_rewards: backlog.slice(0, remaining).slice(0, 10) };
    const claims = missionClaims(state);
    const contract = claims.find(claim => claim.key === 'contract_claim');
    const lowerBound = remaining >= 10;
    if (remaining) {
      assert.equal(contract.count, Math.min(remaining, 10));
      assert.equal(contract.countLowerBound, lowerBound);
      const review = context.renderMenuStatus();
      assert.ok(review.includes(`REVIEW SAVED CONTRACT XP // ${contract.count}${lowerBound ? '+' : ''}`));
    } else assert.equal(contract, undefined);
    context.renderNav();
    const total = Math.min(remaining, 10) + 1;
    assert.ok(context.nav.innerHTML.includes(`<small>${total}${lowerBound ? '+' : ''} ${total === 1 ? 'claim' : 'claims'}</small>`));
    assert.ok(context.nav.innerHTML.includes(`MISSIONS, ${lowerBound ? 'at least ' : ''}${total} saved rewards ready to claim`) || total === 1 && context.nav.innerHTML.includes('MISSIONS, 1 saved reward ready to claim'));
    assert.ok(context.nav.innerHTML.includes(`class="dock-claim-badge" aria-hidden="true">${total}${lowerBound ? '+' : ''}</b>`));
  }
  context.petActionRefreshRequired = true;
  context.renderNav();
  assert.ok(!context.nav.innerHTML.includes('dock-claim-badge'));
  assert.ok(!context.nav.innerHTML.includes('at least'));
});

test('each menu counts its own actionable authority; opening the inbox changes no state', () => {
  const state = snapshot(7);
  Object.assign(state.guidance, {
    daily_cache: { available: true, claimed: false },
    daily_completion: { available: true, pending: [{ utc_day: '2026-10-10', pet_id: 'original' }] },
    weekly_boss: { pending_rewards: [{ pet_id: 'original', week_key: 'week', boss_id: 'boss' }] },
    activity: { ready: true, activity_type: 'work' },
    economy: { bounties: [{ key: 'done', complete: true, claimed: false }, { key: 'unfinished', complete: false }] },
    season: { key: 'new-quarter', tiers: [{ tier_id: 'one', unlocked: true }, { tier_id: 'one', season_key: 'old-quarter', unlocked: true }] }
  });
  const original = structuredClone(state);
  const menus = menuStatuses(state);
  assert.deepEqual(Object.values(menus).map(menu => menuBadge(menu).count), [1, 1, 1, 1, 1, 2]);
  assert.ok(Object.values(menus).every(menu => menuBadge(menu).kind === 'claims'));
  assert.deepEqual(state, original);
  assert.equal(menus.profile.entries[0].focus, 'season');
  assert.equal(menus.work.entries[0].focus, 'timed-activity');
});

test('partial projections suppress even retained data for menus whose authority is deferred', () => {
  const state = snapshot(7);
  state.guidance.daily_cache = { available: true };
  state.guidance.daily_completion.pending = [{ utc_day: 'saved' }];
  state.guidance.activity = { ready: true };
  state.guidance.season = { key: 'quarter', tiers: [{ tier_id: 'one', unlocked: true }] };
  state.hydration = { full: false, mode: 'core' };
  assert.equal(menuBadge(menuStatuses(state).home).count, 1);
  for (const key of ['missions', 'explore', 'work', 'economy', 'profile']) {
    assert.equal(menuStatuses(state)[key].loaded, false);
    assert.deepEqual(menuStatuses(state)[key].entries, []);
  }
  state.hydration.modules = ['missions'];
  assert.equal(menuBadge(menuStatuses(state).missions).count, 1);
  assert.equal(menuBadge(menuStatuses(state).work).count, 0);
});

test('Weekly Boss counts account payouts once; capped boss and raid inboxes stay lower bounds', () => {
  const state = snapshot();
  state.guidance.weekly_boss = { pending_rewards: [
    { pet_id: 'one', boss_id: 'boss', week_key: 'week' },
    { pet_id: 'two', boss_id: 'boss', week_key: 'week' }
  ] };
  assert.equal(menuBadge(menuStatuses(state).explore).count, 1);
  const weekly = Array.from({ length: 10 }, (_, i) => ({ pet_id: 'one', boss_id: 'boss', week_key: 'week-' + i }));
  const raids = Array.from({ length: 10 }, (_, i) => ({ pet_id: 'one', boss_key: 'boss', season_instance: 'rotation-' + i }));
  for (const remaining of [10, 9, 1, 0]) {
    state.guidance.weekly_boss.pending_rewards = weekly.slice(0, remaining);
    state.live_systems = { seasonal_boss: { pending_rewards: raids.slice(0, remaining) } };
    const badge = menuBadge(menuStatuses(state).explore);
    assert.equal(badge.count, remaining * 2);
    assert.equal(badge.countLowerBound, remaining > 0, 'Weekly list can filter old boss IDs after its limit');
    state.guidance.weekly_boss.pending_rewards = [];
    assert.equal(menuBadge(menuStatuses(state).explore).countLowerBound, remaining === 10, 'Raid list filters before its limit');
  }
});

test('the real inbox stays compact, preserves expansion and opens recovery without replay controls', () => {
  const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
  const source = client.slice(client.indexOf('  // TEST-EXPORT: menuStatus:start'), client.indexOf('  // TEST-EXPORT: menuStatus:end'));
  const state = snapshot();
  state.guidance.activity = { activity_type: 'work', ready: true };
  const context = vm.createContext({ state, activeScreen: 'work', window: { MoonpetPlayOptions: { menuStatuses, menuBadge } },
    panelOpenState: {}, petActionRefreshRequired: false, number: String, escapeHtml: String,
    routeButton: (title, entry) => `<button data-jump="${entry.screen}" data-focus="${entry.focus}">${title}</button>`, countdownMarkup: () => '' });
  vm.runInContext(source, context);
  assert.match(context.renderMenuStatus(), /aria-label="work saved status"><summary/);
  context.panelOpenState['selected-pet:work:menu-status'] = true;
  assert.match(context.renderMenuStatus(), /aria-label="work saved status" open><summary/);
  delete context.panelOpenState['selected-pet:work:menu-status'];
  state.guidance.activity.recovery_pending = true;
  assert.match(context.renderMenuStatus(), /aria-label="work saved status" open><summary/);
  assert.match(context.renderMenuStatus(), /RECOVER SAVED REWARD/);
  assert.doesNotMatch(context.renderMenuStatus(), /data-action=/, 'inbox only navigates; it cannot replay a write');
  context.petActionRefreshRequired = true;
  assert.match(context.renderMenuStatus(), /REFRESH REQUIRED/);
  assert.doesNotMatch(context.renderMenuStatus(), /data-jump=/);
});

test('timer readiness comes from the server, including unavailable and saved-claim states', () => {
  const state = snapshot();
  state.guidance.activity = { ready: false, activity_type: 'train', cooldown: { remaining_seconds: 0, expires_at: '2000-01-01' } };
  let menu = menuStatuses(state).work;
  assert.equal(menuBadge(menu).kind, 'active');
  assert.equal(menu.entries[0].status, 'RUNNING');
  state.guidance.activity.ready = true;
  assert.equal(menuBadge(menuStatuses(state).work).kind, 'claims');
  state.guidance.activity.recovery_pending = true;
  assert.equal(menuBadge(menuStatuses(state).work).kind, 'review');
  assert.equal(menuStatuses(state).work.entries[0].status, 'RECOVER SAVED REWARD');
  state.guidance.activity.unavailable = true;
  assert.equal(menuStatuses(state).work.entries[0].status, 'REFRESH REQUIRED');
});

test('saved source-pet runs, locked choices and queues stay separate from reward claims', () => {
  const state = snapshot();
  state.run = { daily: false, depth: 4, max_depth: 100, source_pet: { pet_id: 'original', energy: 0 } };
  state.arena = { status: 'active', own_move_locked: true };
  state.kaiju = { queue: { position: 2 } };
  let menu = menuStatuses(state).explore;
  assert.equal(menuBadge(menu).count, 3);
  assert.equal(menuBadge(menu).kind, 'active');
  assert.equal(menu.entries[0].status, 'SOURCE PET NEEDS ENERGY');
  assert.equal(menu.entries[1].status, 'WAITING FOR RESOLUTION');
  state.run.source_available = false;
  assert.equal(menuStatuses(state).explore.entries[0].status, 'SOURCE PET NEEDS REVIEW');
  state.run = { daily: true, current_room: 10, max_room: 10, settlement_pending: true };
  assert.equal(menuStatuses(state).explore.entries[0].kind, 'recovery');
  assert.match(menuStatuses(state).explore.entries[0].detail, /without another fight or attempt/);
});

test('egg unlocks do not advertise a Cache or unassigned bonus; original saved claims remain visible', () => {
  const state = snapshot();
  state.lifecycle = { phase: 'egg', incubation: { ready: true } };
  state.guidance.daily_cache = { available: true };
  state.guidance.daily_completion.pending = [{ utc_day: 'assigned', pet_id: 'original' }, { utc_day: 'unassigned' }];
  state.guidance.weekly_boss = { pending_rewards: [{ pet_id: 'original', boss_id: 'boss', week_key: 'week' }] };
  assert.equal(menuStatuses(state).home.entries[0].key, 'hatch');
  assert.equal(menuBadge(menuStatuses(state).home).kind, 'ready');
  assert.equal(menuBadge(menuStatuses(state).missions).count, 1);
  assert.equal(menuBadge(menuStatuses(state).explore).count, 1);
  state.adopted = false;
  assert.ok(Object.values(menuStatuses(state)).every(menu => !menu.entries.length));
});

test('terminal Journeys and quest progress never become extra claim badges', () => {
  const state = snapshot(7);
  state.daily_journey = { completed_objectives: 5, required_objectives: 5, growth_mark_awarded: true };
  state.weekly_journey = { state: 'AVAILABLE', completed_objectives: 5, required_objectives: 5, weekly_crest_awarded: false };
  state.contracts = { available: true, run: { title: 'Contract', status: 'completed', depth: 6, max_depth: 6, progress: 3, target: 3 } };
  let menu = menuStatuses(state).missions;
  assert.equal(menuBadge(menu).count, 0);
  assert.deepEqual(menu.entries.map(entry => entry.status), ['COMPLETE', 'SETTLED', 'COMPLETE // SETTLEMENT PENDING']);
  state.weekly_journey.state = 'LOCKED';
  assert.equal(menuStatuses(state).missions.entries.some(entry => entry.key === 'weekly_journey'), false);
  state.contracts.run.status = 'active';
  assert.equal(menuBadge(menuStatuses(state).missions).kind, 'active');
  state.contracts.run.status = 'failed';
  assert.equal(menuStatuses(state).missions.entries[0].status, 'ENDED // FAILED');
});

test('failed playable Finales stay retry-ready, then resume or become a reward claim', () => {
  const state = snapshot();
  const failed = { pet_id: 'original-pet', competition_season_key: 'saved-quarter', status: 'failed', playable: true };
  state.season_finales = { available: true, pets: [failed, { ...failed },
    { ...failed, pet_id: 'deleted-pet', playable: false },
    { ...failed, pet_id: '' }, { ...failed, competition_season_key: '' },
    { ...failed, pet_id: 'not-started', status: 'not_started' },
    { ...failed, pet_id: 'active-pet', status: 'active' }] };
  const before = structuredClone(state);
  let menu = menuStatuses(state).missions;
  const retry = menu.entries.find(entry => entry.key === 'finale_retry');
  assert.equal(retry.count, 1, 'retries deduplicate original pet and competition season');
  assert.equal(retry.status, 'RETRY READY');
  assert.equal(retry.kind, 'ready');
  assert.equal(retry.focus, 'season-finale');
  assert.match(retry.detail, /not a reward claim/);
  assert.deepEqual(menuBadge(menu), { count: 1, countLowerBound: false, kind: 'ready', activeCount: 1 });
  assert.deepEqual(missionClaims(state), [], 'failed battles cannot count as earned rewards');
  assert.deepEqual(state, before, 'review status does not retry or mutate a battle');
  state.season_finales.pets = [failed];
  failed.status = 'active';
  menu = menuStatuses(state).missions;
  assert.equal(menu.entries.some(entry => entry.key === 'finale_retry'), false);
  assert.equal(menuBadge(menu).kind, 'active');
  failed.status = 'won';
  assert.equal(menuBadge(menuStatuses(state).missions).kind, 'claims');
  failed.claimed = true;
  assert.equal(menuBadge(menuStatuses(state).missions).count, 0);
  failed.status = 'failed';
  state.season_finales.available = false;
  assert.equal(menuBadge(menuStatuses(state).missions).count, 0);
  state.season_finales.available = true;
  state.hydration = { full: false, modules: [] };
  assert.equal(menuBadge(menuStatuses(state).missions).count, 0, 'deferred authority suppresses retries');
});

test('paid bounties/tiers disappear, while evolution is labelled an upgrade rather than a claim', () => {
  const state = snapshot();
  state.guidance.economy = { bounties: [{ key: 'one', complete: true, claimed: true }] };
  state.guidance.season = { key: 'quarter', tiers: [{ tier_id: 'one', unlocked: true, claimed_at: 'paid' }, { tier_id: 'two', unlocked: false }] };
  assert.equal(menuBadge(menuStatuses(state).economy).count, 0);
  assert.equal(menuStatuses(state).economy.entries[0].status, 'ALL CLAIMED');
  assert.equal(menuBadge(menuStatuses(state).profile).count, 0);
  state.guidance.evolution = { ready: true, name: 'Next stage' };
  assert.equal(menuBadge(menuStatuses(state).profile).kind, 'ready');
  assert.match(menuStatuses(state).profile.entries[0].detail, /upgrade/);
});

test('saved district/story/raid decisions preserve resume and settlement states, not new payouts', () => {
  const state = snapshot();
  state.regions = [{ key: 'one', title: 'District', pending_choice_key: 'fight' }];
  state.live_systems = { chains: [{ key: 'chain', steps: ['one','two'], step_index: 1, pending_choice_key: 'hide' }], seasonal_boss: { pending_move: 'strike', settling: true } };
  const menu = menuStatuses(state).explore;
  assert.equal(menuBadge(menu).kind, 'active');
  assert.deepEqual(menu.entries.map(entry => entry.focus), ['districts', 'story-chains', 'seasonal-boss']);
  assert.equal(menu.entries[2].status, 'SETTLING');
  state.pending_street_events = [{ event_id: 'old', recoverable: false, close_available: true }];
  const old = menuStatuses(state).explore.entries.find(entry => entry.key === 'street_event:old');
  assert.equal(old.kind, 'review');
  assert.match(old.detail, /No verified payout/);
});
