import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runCareShadowTick } from '../workers/moonboys-api/pets/care-shadow.js';

const schema = readFileSync('workers/moonboys-api/schema.sql', 'utf8');
const migration = readFileSync('workers/moonboys-api/migrations/114_moonpet_care_shadow.sql', 'utf8');
const cron = '*/30 * * * *';
const dayMs = 86_400_000;
const start = Date.UTC(2026, 10, 1);
const day = n => new Date(start + n * dayMs).toISOString().slice(0, 10);

test('disabled, unrelated and delayed ticks perform no database access', async () => {
  const active = { MOONPET_CARE_SHADOW_ENABLED: 'true', MOONPET_CARE_SHADOW_OWNERS: '1' };
  await runCareShadowTick({ cron, scheduledTime: start }, {}, start);
  await runCareShadowTick({ cron: '*/5 * * * *', scheduledTime: start }, active, start);
  await runCareShadowTick({ cron, scheduledTime: start }, active, start + 1800000);
  await assert.rejects(runCareShadowTick({ cron }, { ...active, MOONPET_CARE_SHADOW_OWNERS: 'invalid' }));
});

test('local D1 settles closed days exactly once from the original pet and preserves awards', { timeout: 60_000 }, async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-04-12',
    script: 'export default {fetch(){return new Response()}}', d1Databases: { DB: 'care-shadow-test' } }));
  try {
    const DB = await mf.getD1Database('DB');
    const env = { DB, PET_MINI_APP_ENABLED: 'true', MOONPET_CARE_SHADOW_ENABLED: 'true', MOONPET_CARE_SHADOW_OWNERS: '1,1' };
    const sql = (query, ...args) => DB.prepare(query).bind(...args);
    const tick = (n, slot = 0) => {
      const time = start + n * dayMs + slot * 1800000;
      return runCareShadowTick({ cron, scheduledTime: time }, env, time);
    };
    const row = n => sql('SELECT * FROM moonpet_care_shadow_days WHERE telegram_id=? AND day_key=?', '1', day(n)).first();
    const names = ['telegram_users','telegram_pet_profiles','telegram_pet_season_slots','telegram_pet_active_slots',
      'telegram_pet_instances','telegram_pet_lifecycle_by_pet','telegram_pet_events','telegram_pet_reward_claims','telegram_pet_daily_completion'];
    const bootstrap = new DatabaseSync(':memory:');
    bootstrap.exec(schema);
    const objects = bootstrap.prepare('SELECT sql,tbl_name FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid').all();
    bootstrap.close();
    await DB.batch(objects.filter(r => names.includes(r.tbl_name)).map(r => DB.prepare(r.sql)));
    const additions = migration.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    for (let attempt = 0; attempt < 2; attempt++) await DB.batch(additions.map(s => DB.prepare(s)));
    await DB.batch([
      sql("INSERT INTO telegram_users(telegram_id,first_name,xp) VALUES('1','Test',600)"),
      sql("INSERT INTO telegram_pet_profiles(telegram_id,pet_xp) VALUES('1',900)"),
      ...['p','q'].flatMap((id, index) => [
        sql("INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES(?,'1','s',?,'free')", id,index+1),
        sql("INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,source_profile_updated_at,pet_xp) VALUES(?,'1','s',?,'2026-01-01',900)", id,index+1),
        sql("INSERT INTO telegram_pet_lifecycle_by_pet(pet_id,telegram_id,identity_seed,phase,hatched_at) VALUES(?,'1','seed','young','2026-01-01')", id),
      ]),
      sql("INSERT INTO telegram_pet_active_slots(telegram_id,pet_id,season_key,updated_at) VALUES('1','p','s','2026-01-01')"),
    ]);
    const receipt = (n, pet, action, xp, status = 'accepted') => {
      const id = crypto.randomUUID();
      return sql(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,status)
        VALUES(?,?,'1',?,?,?,'s',?,?)`,id,pet,action,id,xp,day(n),status);
    };
    // No activity on day zero. Days one and two have partial and complete care.
    await DB.batch([receipt(1,'p','play',0),receipt(1,'p','play',0),receipt(1,'p','feed',0,'rejected'),
      receipt(1,'q','clean',6),receipt(1,'p','claim',94),
      ...['feed','play','clean'].map(a => receipt(2,'p',a,0))]);
    for (let n=0; n<4; n++) {
      for (let slot=0; slot<48; slot++) {
        if (n===3 && slot===4) continue;
        await tick(n,slot);
      }
    }
    assert.equal((await row(3)).settled_at,null);
    assert.equal((await row(0)).debt_thirds,132);
    const partial = await row(1);
    assert.equal(partial.care_mask,2);
    assert.equal(partial.gross_pet_xp,100);
    assert.equal(partial.debt_thirds,264);
    assert.ok(partial.estimated_withheld_xp>10 && partial.estimated_withheld_xp<25);

    await tick(4);
    assert.equal((await row(2)).debt_thirds,132);
    assert.equal((await row(2)).missed_streak,0);
    await Promise.all([tick(5),tick(5),tick(5)]);
    const missing = await row(3);
    assert.equal(missing.exempt_reason,'incomplete_observation');
    assert.equal(missing.debt_thirds,132);
    assert.deepEqual(await row(1),partial);

    await sql("INSERT INTO moonpet_care_shadow_exclusions VALUES(?,'*','service outage')",day(4)).run();
    await tick(6);
    assert.equal((await row(4)).exempt_reason,'service outage');
    await sql("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id='p'").run();
    await tick(7);
    assert.equal((await row(7)).exempt_reason,'hatch_window');
    await sql("UPDATE telegram_pet_active_slots SET pet_id='q', updated_at=? WHERE telegram_id='1'", day(8)).run();
    await tick(8);
    assert.equal((await row(8)).exempt_reason,'selection_changed');
    assert.equal((await row(7)).pet_id,'p');

    // Roll back a half-finished batch, retry, and compare the saved balances.
    await DB.prepare("CREATE TRIGGER abort_settlement BEFORE UPDATE OF settled_at ON moonpet_care_shadow_days BEGIN SELECT RAISE(ABORT,'simulated failure'); END").run();
    await assert.rejects(tick(9));
    assert.equal(await row(9),null);
    await DB.prepare('DROP TRIGGER abort_settlement').run();
    await tick(9);
    assert.ok(await row(9));

    // Replay a long closed-day backlog using fully observed fixture windows.
    // Each tick advances one account day even when every receipt has zero XP.
    const windows = [];
    for (let n=12; n<37; n++) {
      windows.push(sql(`INSERT INTO moonpet_care_shadow_days(telegram_id,day_key,pet_id,observed_slots)
        VALUES('1',?,'q',?)`,day(n),2 ** 49 - 1));
      if (n>=19) windows.push(...['feed','play','clean'].map(a => receipt(n,'q',a,0)));
    }
    await DB.batch(windows);
    for (let slot=0; slot<32; slot++) await tick(40,slot);
    // Prior standing of 44 carries through exempt windows into the absence.
    assert.equal((await row(18)).debt_thirds,(770+44)*3);
    assert.equal((await row(35)).debt_thirds,(814-17*44)*3);
    assert.equal((await row(36)).debt_thirds,22*3);
    assert.equal((await sql("SELECT xp FROM telegram_users WHERE telegram_id='1'").first()).xp,600);
    assert.equal((await sql("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='1'").first()).pet_xp,900);
    assert.equal((await sql('SELECT sum(pet_xp) AS xp FROM telegram_pet_instances').first()).xp,1800);
    assert.equal((await sql("SELECT sum(pet_xp_awarded) AS xp FROM telegram_pet_events WHERE status='accepted'").first()).xp,100);
  } finally { await mf.dispose(); }
});
