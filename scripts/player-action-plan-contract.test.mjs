import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const registry = JSON.parse(read('data/player-action-plan-source-registry.v1.json'));
const audit = read('docs/player-action-plan-pr1-source-audit-2026-10-17.md');
const contract = read('docs/player-action-plan-v1-contract.md');

test('PR1 design registry remains complete and uniquely identified', () => {
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.issue, 1552);
  assert.match(registry.baseline_main_sha, /^[0-9a-f]{40}$/u);
  assert.equal(registry.verified_in_production, false);
  assert.match(registry.registry_kind, /design inventory/u);
  assert.ok(registry.sources.length >= 25, 'cover actual ecosystem before implementation');
  const ids = new Set();
  const groups = new Set();
  for (const s of registry.sources) {
    assert.match(s.key, /^[a-z][a-z0-9-]*(?:[.][a-z0-9-]+)+$/u, 'canonical source key');
    assert.ok(!ids.has(s.key), 'duplicate source key ' + s.key);
    ids.add(s.key);
    groups.add(s.group);
    assert.ok(['public','account','pet','original_pet','faction_member'].includes(s.owner_scope));
    assert.equal(s.requires_verified_identity, s.owner_scope !== 'public');
    assert.ok(registry.valid_evidence.includes(s.evidence_class), s.key + ': unsupported evidence');
    assert.ok(registry.valid_adapter_gates.includes(s.adapter_gate), s.key + ': unsupported gate');
    assert.ok(s.period && s.example_task && s.known_gap && s.route_hint, s.key + ': no owner/clock/task/gap/route');
    assert.match(s.route_hint, /^\//u, s.key + ': no local route');
    const file = path.join(root, s.source_file);
    assert.ok(fs.existsSync(file), s.key + ': missing backing code ' + s.source_file);
    assert.ok(read(s.source_file).includes(s.source_marker), s.key + ': code marker drift ' + s.source_marker);
    assert.notEqual(s.adapter_gate, 'shipped', 'registry describes a plan, not implemented endpoint');
    if (s.adapter_gate === 'deferred') assert.equal(s.evidence_class, 'schedule_preview');
    if (s.evidence_class === 'client_mirror') assert.equal(s.adapter_gate, 'verification_review');
  }
  for (const group of ['onboarding','community','faction','battle','arcade','moonpet','wiki','championship','external_game']) {
    assert.ok(groups.has(group), 'missing '+group);
  }
  for (const id of ['faction.daily-missions','moonpet.daily-seven-missions','moonpet.seven-of-seven-claim',
    'moonpet.weekly-journey','moonpet.saved-run','championship.verified-clout']) {
    assert.ok(ids.has(id), id + ' must remain part of the inventory');
  }
});

test('lock UTC / source-specific clocks without constructing one fake global timer', () => {
  const sources = new Map(registry.sources.map((s) => [s.key, s]));
  assert.equal(sources.get('faction.daily-missions').period, 'utc_day');
  assert.equal(sources.get('battle.wtf-windows').period, 'event_window');
  assert.equal(sources.get('moonpet.weekly-journey').period, 'pet_journey_week');
  assert.equal(sources.get('moonpet.evolution').period, 'permanent');
  assert.equal(sources.get('moonpet.jobs').period, 'saved_timer');
  // 00:00 UTC is not fixed to 00:00 UK across daylight saving.
  const formatUK = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/London',
    hour: '2-digit', minute: '2-digit', hourCycle:'h23' }).format(new Date(iso));
  assert.equal(formatUK('2026-10-24T00:00:00.000Z'), '01:00');
  assert.equal(formatUK('2026-10-26T00:00:00.000Z'), '00:00');
});

test('baseline real source proves identity, pet ownership and correct read-boundary risks', () => {
  const daily = read('workers/moonboys-api/routes/daily-loop-state.js');
  assert.ok(daily.includes("path !== '/daily-loop/state'"));
  assert.match(daily, /verifyTelegramIdentityFromBody/u);
  assert.match(daily, /daily_wtf_status/u);
  assert.match(daily, /source_status/u);
  const singleton = read('js/core/daily-loop-state.js');
  assert.match(singleton, /getFreshAuth/u);
  assert.match(singleton, /linked:auth_required/u);
  const faction = read('js/arcade/systems/faction-missions.js');
  assert.ok(faction.includes('_pickMissions(pool, 3, seed)'));
  assert.match(faction, /localStorage/u);
  assert.ok(faction.includes("'/player/daily-missions/progress'"));
  assert.match(faction, /clout_delta: 0/u);
  const bridge = read('js/battle-chamber-faction-bridge.js');
  assert.ok(bridge.includes('/roguelite/daily-state'));
  const pet = read('workers/moonboys-api/worker.js');
  assert.ok(pet.includes("path === '/telegram-pets/app/state' && request.method === 'POST'"));
  assert.ok(pet.includes('authenticatePetMiniApp(body, env)'));
  assert.ok(pet.includes('preparePetMiniAppState(db, telegramId, now)'));
  assert.ok(pet.includes('recoverPetStandardRunEndings('));
  assert.ok(pet.includes("path === '/telegram-pets/state' && request.method === 'GET'"));
  assert.ok(pet.includes("url.searchParams.get('telegram_id')"));
  const source = read('js/moonpet-play-options.js');
  assert.ok(source.includes('function recommendations(snapshot, preferences)'));
  assert.ok(read('workers/moonboys-api/pets/player-guidance.js').includes('function choosePetNextAction('));
});

test('documented API scope forbids unverified or mutating read-side shortcuts', () => {
  for (const term of ['/my-moonboy.html','POST /player/action-plan','Cache-Control: no-store',
    'verified_completion', 'claim_ready', 'sync_unavailable', 'pet_journey_week',
    'client_mirror', 'schedule_preview', 'buildPetMiniAppState', 'preparePetMiniAppState',
    'public faction', '365-day', 'not a deployed endpoint']) {
    assert.ok(contract.includes(term), 'missing safety/feature contract: ' + term);
  }
  for (const term of ['#1530','#1478','#903','#1513','GET /telegram-pets/state?telegram_id=',
    'clout_delta: 0','source_status','PARTIAL VERIFICATION','No personal gaming dashboard']) {
    assert.ok(audit.includes(term), 'missing evidence/gap entry: ' + term);
  }
  assert.ok(!fs.existsSync(path.join(root, 'my-moonboy.html')), 'PR1 must not ship a UI before the API security contract');
  const routePath = path.join(root, 'workers/moonboys-api/routes/player-action-plan.js');
  if (fs.existsSync(routePath)) {
    const route = read('workers/moonboys-api/routes/player-action-plan.js');
    assert.match(read('workers/moonboys-api/worker.js'), /verifyIdentity: \(body, authEnv\) => verifyTelegramIdentityFromBody/u);
    assert.match(route, /createReadOnlyActionPlanDb/u);
    assert.match(route, /no-store, private/u);
  }
});
