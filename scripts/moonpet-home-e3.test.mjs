import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fixture, hooks, currentSeason } from './moonpet-audit-regression-fixture.mjs';
import { PET_HOME_GARDEN, readPetGardenState } from '../workers/moonboys-api/pets/home-garden.js';
import { buildPetEconomyReachabilityAudit } from '../workers/moonboys-api/pets/economy-reachability-audit.js';

const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/095_moonpet_home_garden.sql', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const crafting = fs.readFileSync(new URL('../workers/moonboys-api/pets/economy-phase-3.js', import.meta.url), 'utf8');

test('095 adds only per-pet garden persistence and receipt authority', () => {
  const f = fixture('home-e3-schema');
  f.sql.exec('PRAGMA foreign_keys=ON');
  f.sql.exec(migration);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(PET_HOME_GARDEN.crop_key, 'garden_veggies');
  assert.equal(PET_HOME_GARDEN.grow_seconds, 21600);
  assert.equal(PET_HOME_GARDEN.harvest_quantity, 1);
  const harvestFks = f.sql.prepare("PRAGMA foreign_key_list('telegram_pet_garden_harvests')").all();
  assert.equal(harvestFks.some(row => row.table === 'telegram_pet_season_slots'), false, 'completed harvest history must survive pet deletion');
  assert.equal(harvestFks.some(row => row.table === 'telegram_pet_profiles' && row.from === 'telegram_id'), true);
  const sourcePet = f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_season_slots WHERE telegram_id=? AND status=\'active\' LIMIT 1').get(f.owner);
  f.sql.prepare(`INSERT INTO telegram_pet_garden_harvests
    (telegram_id,event_key,pet_id,season_key,crop_key,crop_planted_at,quantity,status)
    VALUES (?,?,?,?,?,?,1,'completed')`).run(f.owner,'crop-once',sourcePet.pet_id,sourcePet.season_key,'garden_veggies','2026-01-01T00:00:00Z');
  assert.throws(() => f.sql.prepare(`INSERT INTO telegram_pet_garden_harvests
    (telegram_id,event_key,pet_id,season_key,crop_key,crop_planted_at,quantity,status)
    VALUES (?,?,?,?,?,?,1,'pending')`).run(f.owner,'crop-twice',sourcePet.pet_id,sourcePet.season_key,'garden_veggies','2026-01-01T00:00:00Z'), /UNIQUE constraint/);
  assert.throws(() => f.sql.prepare(`INSERT INTO telegram_pet_garden_plots
    (pet_id,telegram_id,season_key,crop_key,status,planted_at,ready_at)
    VALUES (?,?,?,?,?,?,?)`).run('current-'+f.owner,f.owner,currentSeason,'new_crop','growing','2026-01-01T00:00:00Z','2026-01-01T06:00:00Z'), /CHECK constraint/);
  f.sql.close();
});

test('each pet owns one independent six-hour garden plot', async () => {
  const f = fixture('home-e3-plots');
  const petA = 'current-' + f.owner;
  const petB = 'garden-second-' + f.owner;
  f.pet(petB, currentSeason, 500, 2);

  const first = await f.act({ action:'garden_plant', request_id:'plant-a' });
  assert.equal(first.accepted, true);
  assert.equal(first.reason, 'pet_garden_planted');
  let gardenA = await readPetGardenState(f.db, f.owner, { pet_id:petA, season_key:currentSeason });
  assert.equal(gardenA.status, 'growing');
  assert.equal(Math.round((Date.parse(gardenA.ready_at)-Date.parse(gardenA.planted_at))/1000), 21600);

  const duplicate = await f.act({ action:'garden_plant', request_id:'plant-a-retry' });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 1);

  f.active(petB);
  const coreB = await hooks.buildPetMiniAppCoreState(f.db, f.owner);
  assert.equal(coreB.pet_garden.status, 'empty');
  assert.equal((await f.act({ action:'garden_plant', request_id:'plant-b' })).accepted, true);

  f.active(petA);
  const coreA = await hooks.buildPetMiniAppCoreState(f.db, f.owner);
  assert.equal(coreA.pet_garden.status, 'growing');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 2);
  f.sql.close();
});

test('mature harvest adds exactly one existing veggie box and duplicate retry adds nothing', async () => {
  const f = fixture('home-e3-harvest');
  const before = f.sql.prepare('SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  assert.equal((await f.act({ action:'garden_plant', request_id:'plant' })).accepted, true);
  f.sql.prepare("UPDATE telegram_pet_garden_plots SET planted_at='1999-12-31T18:00:00.000Z', ready_at='2000-01-01T00:00:00.000Z' WHERE telegram_id=?").run(f.owner);

  const earlyState = await hooks.buildPetMiniAppCoreState(f.db, f.owner);
  assert.equal(earlyState.pet_garden.status, 'ready');
  const first = await f.act({ action:'garden_harvest', request_id:'harvest-once' });
  assert.equal(first.accepted, true);
  assert.equal(first.reason, 'pet_garden_harvested');
  assert.equal(first.rewards.items.garden_veggies, 1);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").get(f.owner).quantity, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 0);

  const retry = await f.act({ action:'garden_harvest', request_id:'harvest-once' });
  assert.equal(retry.accepted, true);
  assert.equal(retry.duplicate, true);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").get(f.owner).quantity, 1);
  const after = f.sql.prepare('SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  assert.deepEqual(after, before, 'garden has no XP or currency reward');
  f.sql.close();
});

test('full veggie inventory leaves no pending harvest receipt and can retry after space is freed', async () => {
  const f = fixture('home-e3-capacity-retry');
  await f.act({ action:'garden_plant', request_id:'plant-full' });
  f.sql.prepare("UPDATE telegram_pet_garden_plots SET planted_at='1999-12-31T18:00:00.000Z', ready_at='2000-01-01T00:00:00.000Z' WHERE telegram_id=?").run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_inventory(telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','garden_veggies',999999)").run(f.owner);

  const blocked = await f.act({ action:'garden_harvest', request_id:'full-bag-attempt' });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, 'pet_garden_inventory_full');
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS c FROM telegram_pet_garden_harvests WHERE telegram_id=? AND status IN ('pending','settling')").get(f.owner).c, 0,
    'capacity rejection must not leave a deletion-blocking receipt');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 1,
    'the mature crop remains available');

  f.sql.prepare("UPDATE telegram_pet_inventory SET quantity=999998 WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").run(f.owner);
  const retry = await f.act({ action:'garden_harvest', request_id:'after-space-freed' });
  assert.equal(retry.accepted, true);
  assert.equal(retry.reason, 'pet_garden_harvested');
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").get(f.owner).quantity, 999999);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 0);
  f.sql.close();
});

test('fresh request recovers a crop-bound pending receipt after settlement batch failure', async () => {
  const f = fixture('home-e3-settlement-recovery');
  await f.act({ action:'garden_plant', request_id:'plant' });
  f.sql.prepare("UPDATE telegram_pet_garden_plots SET planted_at='1999-12-31T18:00:00.000Z', ready_at='2000-01-01T00:00:00.000Z' WHERE telegram_id=?").run(f.owner);

  f.db.beforeBatch = statements => {
    if (!statements.some(statement => statement.query.includes("UPDATE telegram_pet_garden_plots SET status='harvesting'"))) return;
    f.db.beforeBatch = null;
    throw new Error('injected garden settlement failure');
  };
  await assert.rejects(
    f.act({ action:'garden_harvest', request_id:'lost-settlement-response' }),
    /injected garden settlement failure/
  );
  const pending = f.sql.prepare("SELECT event_key,status FROM telegram_pet_garden_harvests WHERE telegram_id=?").get(f.owner);
  assert.equal(pending.status, 'pending');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 1);

  const recovered = await f.act({ action:'garden_harvest', request_id:'fresh-ui-request' });
  assert.equal(recovered.accepted, true);
  assert.equal(recovered.reason, 'pet_garden_harvested');
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").get(f.owner).quantity, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS c FROM telegram_pet_garden_harvests WHERE telegram_id=?").get(f.owner).c, 1,
    'fresh UUID recovers the existing crop receipt instead of creating another');
  assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_garden_harvests WHERE telegram_id=?").get(f.owner).status, 'completed');
  f.sql.close();
});

test('pending cleanup does not depend on a later independently-racing bag snapshot', async () => {
  const f = fixture('home-e3-capacity-interleave');
  await f.act({ action:'garden_plant', request_id:'plant' });
  f.sql.prepare("UPDATE telegram_pet_garden_plots SET planted_at='1999-12-31T18:00:00.000Z', ready_at='2000-01-01T00:00:00.000Z' WHERE telegram_id=?").run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_inventory(telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','garden_veggies',999998)").run(f.owner);

  let filledBeforeSettlement = false;
  f.db.beforeBatch = () => {
    if (filledBeforeSettlement) return;
    filledBeforeSettlement = true;
    f.sql.prepare("UPDATE telegram_pet_inventory SET quantity=999999 WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").run(f.owner);
  };
  let consumedBeforeBagRead = false;
  f.db.beforeFirst = statement => {
    if (!consumedBeforeBagRead && statement.query.includes('SELECT quantity FROM telegram_pet_inventory')) {
      consumedBeforeBagRead = true;
      f.sql.prepare("UPDATE telegram_pet_inventory SET quantity=999998 WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").run(f.owner);
    }
    return undefined;
  };

  const raced = await f.act({ action:'garden_harvest', request_id:'capacity-race' });
  assert.equal(raced.accepted, false);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS c FROM telegram_pet_garden_harvests WHERE telegram_id=? AND status='pending'").get(f.owner).c, 0,
    'pending receipt cleanup happens before and independently of the later bag read');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 1);

  f.db.beforeBatch = null;
  f.db.beforeFirst = null;
  const retry = await f.act({ action:'garden_harvest', request_id:'retry-after-race' });
  assert.equal(retry.accepted, true);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").get(f.owner).quantity, 999999);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 0);
  f.sql.close();
});

test('an old harvest request can never consume a later crop', async () => {
  const f = fixture('home-e3-stale-harvest');
  await f.act({ action:'garden_plant', request_id:'plant-one' });
  f.sql.prepare("UPDATE telegram_pet_garden_plots SET planted_at='1999-12-31T18:00:00.000Z', ready_at='2000-01-01T00:00:00.000Z' WHERE telegram_id=?").run(f.owner);
  assert.equal((await f.act({ action:'garden_harvest', request_id:'old-harvest' })).accepted, true);
  assert.equal((await f.act({ action:'garden_plant', request_id:'plant-two' })).accepted, true);
  f.sql.prepare("UPDATE telegram_pet_garden_plots SET planted_at='1999-12-31T18:00:00.000Z', ready_at='2000-01-01T00:00:00.000Z' WHERE telegram_id=?").run(f.owner);
  const retry = await f.act({ action:'garden_harvest', request_id:'old-harvest' });
  assert.equal(retry.accepted, true);
  assert.equal(retry.duplicate, true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_garden_plots WHERE telegram_id=?').get(f.owner).c, 1, 'later crop is untouched');
  f.sql.close();
});

test('economy reachability records Garden as a real additional source of the existing veggie item', () => {
  const audit = buildPetEconomyReachabilityAudit();
  const veggies = audit.canonical_items.find(entry => entry.key === 'garden_veggies');
  assert.ok(veggies.sources.includes('recipe:veggie_patch'));
  assert.ok(veggies.sources.includes('garden:harvest'));
  const garden = audit.surfaces.find(entry => entry.kind === 'garden_source');
  assert.deepEqual({ key:garden.key, quantity:garden.quantity, grow_seconds:garden.grow_seconds },
    { key:'garden_veggies', quantity:1, grow_seconds:21600 });
});

test('Kitchen reuses existing cooked recipes and Gym reuses existing Train authorities', () => {
  for (const key of ['pizza_night','moon_grill','veggie_patch']) {
    assert.match(crafting, new RegExp(key + ':'));
  }
  assert.match(worker, /train:\s*\{ pet_xp: 20, community_xp: 6,[\s\S]*energy: -18, gold: 10, crystals: 1/);
  assert.match(client, /\['pizza_night','moon_grill','veggie_patch'\]/);
  assert.match(client, /button\('TRAIN NOW', 'train'\)/);
  assert.match(client, /button\('START TIMED TRAINING', 'activity_start', \{ activity_type:'train' \}/);
  assert.doesNotMatch(migration, /moon_gold|pet_xp|community_xp|style_tokens|moon_crystals/);
});

test('Home E4 switches dedicated rooms on the existing canvas and garden is not added to live polling', async () => {
  assert.match(client, /var HOME_ROOMS = Object\.freeze\(\['main','kitchen','garden','gym'\]\)/);
  assert.match(client, /function drawDedicatedHomeRoom\(room\)/);
  assert.doesNotMatch(client, /data-home-room/);
  assert.match(client, /\['room','floor','furniture'\]/);
  assert.doesNotMatch(client, /HOME_STATION_HOTSPOTS|homeStationAt\(/);
  assert.match(worker, /readPetGardenState\(lifecycleScope\.singleReads, telegramId, petRaw, now\)/);
  assert.match(worker, /readPetGardenState\(identityScope\.singleReads, telegramId, petRaw, now\)/);
  assert.match(worker, /action === 'garden_plant' \|\| action === 'garden_harvest'/);
  const f = fixture('home-e3-live-read');
  await f.act({ action:'garden_plant', request_id:'plant' });
  let reads = 0;
  f.db.beforeFirst = statement => { if (statement.query.includes('telegram_pet_garden_plots')) reads += 1; };
  await hooks.buildPetMiniAppLiveState(f.db, f.owner);
  assert.equal(reads, 0, 'high-frequency live state performs no garden read');
  f.sql.close();
});
