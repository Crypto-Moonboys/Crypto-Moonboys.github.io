import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildPetGuidanceCandidates } from '../workers/moonboys-api/pets/player-guidance.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

function fixture(owner = 'notification-owner', { now = null, seasonKey = null } = {}) {
  const storage = new DatabaseSync(':memory:');
  // The slow-scan regressions advance Worker and SQLite time together, while
  // still executing every real transaction and mutation in SQLite.
  const clockSql = query => {
    const timestamp = new Date(now()).toISOString().replace('T', ' ').slice(0, 19);
    return query.replace(/\bCURRENT_TIMESTAMP\b/g, `'${timestamp}'`).replace(/'now'/g, `'${timestamp}'`);
  };
  const sql = now ? { prepare: query => storage.prepare(clockSql(query)), exec: query => storage.exec(clockSql(query)) } : storage;
  for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql', 'migrations/061_moonpet_season_economy_calibration.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
  }
  function failure(mode) {
    if (mode === 'throw') throw new Error('isolated_notification_failure');
    if (mode === 'failed') return { success: false, error: 'isolated_notification_failure', meta: { changes: 1 } };
    if (mode === 'missing') return { success: true };
    if (mode === 'missing_success') return { meta: { changes: 1 } };
    if (mode === 'null') return null;
    if (mode === 'zero') return { success: true, meta: { changes: 0 } };
    if (mode === 'malformed') return { success: true, meta: { changes: '1' } };
    if (mode === 'wrong_owner') return { telegram_id: 'another-owner', enabled: 0 };
    return undefined;
  }
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() {
      if (db.beforeFirst) await db.beforeFirst(this);
      if (db.readFailure && this.query.includes('SELECT telegram_id, enabled')) return failure(db.readFailure);
      return sql.prepare(this.query).get(...this.args) || null;
    }
    async all() {
      if (db.beforeAll) { const override = await db.beforeAll(this); if (override) return override; }
      if (db.readFailure && this.query.includes('telegram_pet_notification_settings')) return failure(db.readFailure);
      return { success: true, results: sql.prepare(this.query).all(...this.args) };
    }
    exec() {
      if (this.query.includes('INSERT INTO telegram_pet_notification_settings') && db.writeFailure) return failure(db.writeFailure);
      const statement = sql.prepare(this.query);
      if (statement.columns().length) {
        const results = statement.all(...this.args);
        return { success: true, results, meta: { changes: /\bRETURNING\b/i.test(this.query) ? results.length : 0 } };
      }
      return { success: true, results: [], meta: { changes: Number(statement.run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) { const override = await db.beforeRun(this); if (override) return override; } return this.exec(); }
  }
  const db = { readFailure: null, writeFailure: null, prepare(query) { return new Statement(query); }, async batch(statements) {
    if (db.beforeBatch) { const override = await db.beforeBatch(statements); if (override) return override; }
    sql.exec('BEGIN');
    try { const results = statements.map(statement => statement.exec()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  function addOwner(owner, chosenPetId = '') {
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Notification player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
  sql.prepare("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
  const season = seasonKey || hooks.getPetSeasonInfo(new Date()).key;
  const petId = chosenPetId || 'pet-' + owner;
  sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,1,'free')").run(petId, owner, season);
  sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,1,200,100,'0001-01-01 00:00:00')").run(petId, owner, season);
  sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(petId, owner, petId);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, petId, season);
  return { pet_id: petId, season_key: season, telegram_id: owner };
  }
  const source=addOwner(owner);
  return { sql, db, owner, source, addOwner, act: enabled => hooks.processPetMiniAppAction(db, owner, { id: owner }, { action: 'notification_set', enabled }, 'fixture-token') };
}


function addPet(f, id, slot = 2, season = f.source.season_key) {
  f.sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id, f.owner, season, slot);
  f.sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,?,200,100,'0001-01-01 00:00:00')").run(id, f.owner, season, slot);
  f.sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(id, f.owner, id);
  return { pet_id: id, season_key: season, telegram_id: f.owner };
}
function select(f, source) {
  f.sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?').run(source.pet_id,source.season_key,f.owner);
}
async function quiet(f, owner = f.owner) {
  const pet=await hooks.getPetProfile(f.db, owner, true);
  const guidance=await hooks.buildPetGuidanceState(f.db,owner,pet);
  await hooks.persistPetGuidanceNotices(f.db,owner,buildPetGuidanceCandidates(guidance),pet);
  f.sql.prepare("UPDATE telegram_pet_guidance_notices SET shown_at=CURRENT_TIMESTAMP WHERE telegram_id=?").run(owner);
  f.sql.prepare("INSERT INTO telegram_pet_daily_completion(telegram_id,utc_day,progress_bits) VALUES (?,date('now'),255) ON CONFLICT(telegram_id,utc_day) DO UPDATE SET progress_bits=255").run(owner);
  f.sql.prepare("UPDATE telegram_pet_instances SET hunger=10,health=100,happiness=100,cleanliness=100,energy=100,last_decay_at=CURRENT_TIMESTAMP WHERE telegram_id=?").run(owner);
}
async function deliveries(fn) {
  const original=globalThis.fetch, messages=[];
  globalThis.fetch=async (url, options)=>{
    const message=JSON.parse(options.body); messages.push(message);
    return new Response(JSON.stringify({ok:true,result:{}}),{status:200});
  };
  try { await fn(messages); } finally { globalThis.fetch=original; }
}
function ack(f, notices, owner=f.owner) {
  return hooks.processPetMiniAppAction(f.db,owner,{id:owner},{action:'guidance_ack',notices},'fixture-token');
}
const unlocked = [{ key:'achievement:caring_hand',type:'achievement',title:'Caring Hand',detail:'Complete 25 care actions.',callback_data:'pet:achievements' }];

test('notice persistence and delayed acknowledgement stay with earning pet/source; legacy rows remain unassigned', async()=>{
  const f=fixture('notice-sources'), b=addPet(f,'other-pet',2,'2026-S3');
  f.sql.prepare("INSERT INTO telegram_pet_guidance_notices(telegram_id,notice_key,notice_type,title) VALUES (?,'achievement:caring_hand','achievement','Legacy Caring Hand')").run(f.owner);
  const before=f.sql.prepare("SELECT * FROM telegram_pet_guidance_notices WHERE notice_key='achievement:caring_hand'").get();
  const aNotices=await hooks.persistPetGuidanceNotices(f.db,f.owner,unlocked,f.source);
  select(f,b);
  assert.deepEqual(await hooks.persistPetGuidanceNotices(f.db,f.owner,[],b),[],'A pending unlock never appears for B without B earning it');
  const bNotices=await hooks.persistPetGuidanceNotices(f.db,f.owner,unlocked,b);
  assert.equal(aNotices.length,1); assert.equal(bNotices.length,1);
  assert.notEqual(aNotices[0].key,bNotices[0].key);
  assert.equal(aNotices[0].pet_id,f.source.pet_id); assert.equal(bNotices[0].season_key,'2026-S3');
  assert.equal((await ack(f,aNotices)).accepted,true,'late delivery from A can acknowledge A while B is selected');
  assert.equal((await hooks.persistPetGuidanceNotices(f.db,f.owner,unlocked,b)).length,1,'A acknowledgement must not suppress B');
  assert.equal((await ack(f,aNotices)).acknowledged,0,'duplicate ack changes nothing');
  assert.equal((await ack(f,[{...aNotices[0],pet_id:b.pet_id,season_key:b.season_key}])).accepted,false);
  assert.equal((await ack(f,[{...bNotices[0],season_key:f.source.season_key}])).accepted,false);
  assert.equal((await hooks.processPetMiniAppAction(f.db,f.owner,{id:f.owner},{action:'guidance_ack',notice_keys:[bNotices[0].key]},'fixture-token')).accepted,false,'old key-only requests cannot consume source-bound notices');
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_guidance_notices WHERE notice_key='achievement:caring_hand'").get(),before);
  f.addOwner('other-owner');
  assert.equal((await ack(f,bNotices,'other-owner')).accepted,false);
  assert.equal((await ack(f,bNotices)).acknowledged,1);
});

test('account season reward notice remains shared while pet unlocks remain distinct',async()=>{
  const f=fixture('notice-account'),b=addPet(f,'account-b');
  const candidate=buildPetGuidanceCandidates({season:{key:'2026-S3',tiers:[{tier_id:'street',title:'Street',required_xp:250,unlocked:true}]}});
  const a=await hooks.persistPetGuidanceNotices(f.db,f.owner,candidate,f.source);
  const second=await hooks.persistPetGuidanceNotices(f.db,f.owner,candidate,b);
  assert.equal(a[0].key,second[0].key);assert.equal(a[0].scope,'account');assert.equal(a[0].pet_id,null);
  assert.equal((await ack(f,a)).accepted,true);
  assert.deepEqual(await hooks.persistPetGuidanceNotices(f.db,f.owner,candidate,b),[]);
});

for(const mode of ['throw','failed']) test(`notice ${mode} writes cannot consume source-bound delivery`,async()=>{
  const f=fixture('notice-failure-'+mode);
  const saved=await hooks.persistPetGuidanceNotices(f.db,f.owner,unlocked,f.source);
  f.db.beforeRun=statement=>{
    if(statement.query.includes('UPDATE telegram_pet_guidance_notices')) {
      if(mode==='throw') throw Error('fixture_unavailable');
      return {success:false,error:'fixture_unavailable',meta:{changes:0}};
    }
  };
  assert.equal((await ack(f,saved)).accepted,false);
  assert.equal(f.sql.prepare('SELECT shown_at FROM telegram_pet_guidance_notices').get().shown_at,null);
  f.db.beforeRun=null;
  assert.equal((await ack(f,saved)).acknowledged,1);
});

test('bounded notification scan advances beyond 35 no-alert players and evaluates decayed owned health',async()=>{
  const f=fixture('scan-000');
  for(let i=1;i<37;i++) f.addOwner('scan-'+String(i).padStart(3,'0'));
  for(let i=0;i<37;i++){
    const owner='scan-'+String(i).padStart(3,'0');
    await quiet(f,owner); await hooks.setPetNotificationPreference(f.db,owner,true);
  }
  f.sql.prepare("UPDATE telegram_pet_instances SET last_decay_at=datetime('now','-72 hours') WHERE telegram_id='scan-036'").run();
  await deliveries(async messages=>{
    const first=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(first.considered,35);assert.equal(first.sent,0);assert.equal(first.skipped,35);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_notification_settings WHERE last_notified_at IS NOT NULL').get().n,0,'scanning must not consume alert cooldowns');
    const next=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(next.sent,1);assert.equal(messages[0].chat_id,'scan-036');assert.match(messages[0].text,/health is low|hungry|needs cleaning/);
    assert.equal(f.sql.prepare("SELECT health FROM telegram_pet_instances WHERE telegram_id='scan-036'").get().health,100,'alert evaluates decay despite the saved health being healthy');
    assert.equal(f.sql.prepare("SELECT enabled FROM telegram_pet_notification_settings WHERE telegram_id='scan-036'").get().enabled,1);
    const after=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(after.sent,0);assert.equal(messages.length,1,'same source retains the sent-alert cooldown');
  });
});

test('a switch during guidance construction sends nothing and consumes no source cooldown',async()=>{
  const f=fixture('notification-switch'),b=addPet(f,'healthy-b');
  await quiet(f); await hooks.setPetNotificationPreference(f.db,f.owner,true);
  f.sql.prepare('UPDATE telegram_pet_instances SET health=20,hunger=100,happiness=0,cleanliness=0,energy=0 WHERE pet_id=?').run(f.source.pet_id);
  let switched=false;
  f.db.beforeBatch=statements=>{
    if(!switched && statements.some(s=>s.query.includes('telegram_pet_personality_traits'))) { switched=true;select(f,b); }
  };
  await deliveries(async messages=>{
    const result=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(switched,true);assert.equal(result.sent,0);assert.equal(result.failed,1);assert.equal(messages.length,0);
    assert.equal(f.sql.prepare('SELECT last_notified_at FROM telegram_pet_notification_settings').get().last_notified_at,null);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_recovery_cursors WHERE setting_key LIKE 'moonpet:notifications:sent:%'").get().n,0);
  });
});

test('a switch during Telegram delivery names original pet and stores only its cooldown, preserving B eligibility',async()=>{
  const f=fixture('notification-inflight'),b=addPet(f,'inflight-b');
  await quiet(f);await hooks.setPetNotificationPreference(f.db,f.owner,true);
  const roster=await hooks.buildPetSeasonSlotSummary(f.db,f.owner);
  const spaceFor=petId=>roster.slots.find(slot=>slot.pet_id===petId).slot_number;
  f.sql.prepare("UPDATE telegram_pet_instances SET pet_name='Original A',health=20,hunger=100,happiness=0,cleanliness=0,energy=0 WHERE pet_id=?").run(f.source.pet_id);
  const original=globalThis.fetch,messages=[];
  globalThis.fetch=async(_url,options)=>{
    messages.push(JSON.parse(options.body)); if(messages.length===1) select(f,b);
    return new Response(JSON.stringify({ok:true,result:{}}),{status:200});
  };
  try{
    const first=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(first.sent,1);assert.match(messages[0].text,new RegExp(`For .* · pet space ${spaceFor(f.source.pet_id)}\\n`));assert.match(messages[0].text,/health is low/);
    assert.equal(f.sql.prepare('SELECT last_notified_at FROM telegram_pet_notification_settings').get().last_notified_at,null,'A cannot stamp B compatibility cooldown');
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_recovery_cursors WHERE setting_key=?").get(`moonpet:notifications:sent:${f.source.season_key}:${f.source.pet_id}`).n,1);
    const second=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(second.sent,1,'B earned notices remain eligible despite A delivery');
    assert.match(messages[1].text,new RegExp(`pet space ${spaceFor(b.pet_id)}\\n`));assert.doesNotMatch(messages[1].text,/health is low/);
  }finally{globalThis.fetch=original;}
});

for(const mode of ['throw','failed','malformed']) test(`a ${mode} whole scan batch cannot claim accounts or send; a healthy retry is eligible`,async()=>{
  const f=fixture('scan-failure-'+mode);await hooks.setPetNotificationPreference(f.db,f.owner,true);
  f.db.beforeBatch=statements=>{
    if(!statements.some(s=>s.query.includes('INSERT INTO telegram_pet_recovery_cursors') && s.args.includes('moonpet:notifications:scan')))return;
    // Return before executing BEGIN: every simulated failed D1 batch has zero writes.
    if(mode==='throw')throw Error('scan_batch_unavailable');
    if(mode==='failed')return statements.map(()=>({success:false,error:'scan_batch_unavailable',meta:{changes:0}}));
    return [{success:true}];
  };
  await deliveries(async messages=>{
    const failed=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(failed.ok,false);assert.equal(failed.sent,0);assert.equal(messages.length,0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_recovery_cursors').get().n,0);
    assert.equal(f.sql.prepare('SELECT enabled FROM telegram_pet_notification_settings').get().enabled,1);
    f.db.beforeBatch=null;
    assert.equal((await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'})).sent,1);
  });
});

test('overlapping scheduler after cursor wrap cannot deliver a pet whose previous send is in flight',async()=>{
  const f=fixture('scan-overlap');await quiet(f);await hooks.setPetNotificationPreference(f.db,f.owner,true);
  await deliveries(async()=>assert.equal((await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'})).sent,0));
  f.sql.prepare("UPDATE telegram_pet_recovery_cursors SET setting_value=json_set(setting_value,'$.expires_at',datetime('now','-1 minute')) WHERE setting_key LIKE 'moonpet:notifications:checking:%'").run();
  f.sql.prepare('UPDATE telegram_pet_instances SET hunger=100,happiness=0,cleanliness=0,energy=0 WHERE pet_id=?').run(f.source.pet_id);
  let entered,release;const ready=new Promise(resolve=>{entered=resolve;});const resume=new Promise(resolve=>{release=resolve;});
  const original=globalThis.fetch;const messages=[];
  globalThis.fetch=async(_url,options)=>{messages.push(JSON.parse(options.body));entered();await resume;return new Response(JSON.stringify({ok:true,result:{}}),{status:200});};
  try{
    const first=hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    await ready;
    const overlapping=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(overlapping.considered,0);assert.equal(overlapping.sent,0);assert.equal(messages.length,1);
    release();assert.equal((await first).sent,1);
  }finally{release();globalThis.fetch=original;}
});

test('failed Telegram delivery retains ON and pending notices; scan lease expires without consuming sent cooldown',async()=>{
  const f=fixture('delivery-retry');await hooks.setPetNotificationPreference(f.db,f.owner,true);
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,description:'fixture delivery unavailable'}),{status:503});
  try{
    const failed=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(failed.sent,0);assert.equal(failed.failed,1);
  }finally{globalThis.fetch=original;}
  assert.equal(f.sql.prepare('SELECT enabled FROM telegram_pet_notification_settings').get().enabled,1);
  assert.equal(f.sql.prepare('SELECT last_notified_at FROM telegram_pet_notification_settings').get().last_notified_at,null);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_guidance_notices WHERE shown_at IS NOT NULL').get().n,0);
  f.sql.prepare("UPDATE telegram_pet_recovery_cursors SET setting_value=json_set(setting_value,'$.expires_at',datetime('now','-1 minute')) WHERE setting_key LIKE 'moonpet:notifications:checking:%'").run();
  await deliveries(async messages=>{
    assert.equal((await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'})).sent,1);
    assert.equal(messages.length,1);
    assert.ok(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_guidance_notices WHERE shown_at IS NOT NULL').get().n<=3,'only displayed notices are acknowledged');
  });
});

test('turning alerts OFF after queue selection prevents delivery without overwriting the saved preference',async()=>{
  const f=fixture('notification-opt-out');await hooks.setPetNotificationPreference(f.db,f.owner,true);
  let off=false;
  f.db.beforeBatch=statements=>{
    if(!off && statements.some(s=>s.query.includes('SELECT n.enabled'))){off=true;f.sql.prepare('UPDATE telegram_pet_notification_settings SET enabled=0 WHERE telegram_id=?').run(f.owner);}
  };
  await deliveries(async messages=>{
    const result=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(off,true);assert.equal(result.sent,0);assert.equal(messages.length,0);
    assert.equal(f.sql.prepare('SELECT enabled FROM telegram_pet_notification_settings').get().enabled,0);
  });
});

for(const mode of ['throw','failed','malformed']) test(`guidance ${mode} pending-notice read rejects instead of presenting successful empty progress`,async()=>{
  const f=fixture('notice-read-'+mode);
  f.db.beforeAll=statement=>{
    if(!statement.query.includes('FROM telegram_pet_guidance_notices'))return;
    if(mode==='throw')throw Error('notice_read_unavailable');
    return mode==='failed'?{success:false,error:'notice_read_unavailable',results:[]}:{success:true};
  };
  await assert.rejects(hooks.persistPetGuidanceNotices(f.db,f.owner,unlocked,f.source),/unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_guidance_notices WHERE shown_at IS NOT NULL').get().n,0);
  f.db.beforeAll=null;
  const pending=await hooks.persistPetGuidanceNotices(f.db,f.owner,unlocked,f.source);
  assert.equal(pending.length,1);assert.equal(pending[0].pet_id,f.source.pet_id);
});

test('an expired/replaced scan lease prevents an old slow worker from sending another scanner\'s pet',async()=>{
  const f=fixture('expired-scan');await hooks.setPetNotificationPreference(f.db,f.owner,true);
  let replaced=false;
  f.db.beforeBatch=statements=>{
    if(!replaced && statements.some(s=>s.query.includes("SET setting_value=json_set(setting_value,'$.expires_at'"))) {
      replaced=true;
      f.sql.prepare("UPDATE telegram_pet_recovery_cursors SET setting_value=json_set(setting_value,'$.token','another-scan','$.expires_at',datetime('now','+1 minute')) WHERE setting_key LIKE 'moonpet:notifications:checking:%'").run();
    }
  };
  await deliveries(async messages=>{
    const result=await hooks.runPetNeedsNotifications({DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-token'});
    assert.equal(replaced,true);assert.equal(result.sent,0);assert.equal(result.skipped,1);assert.equal(messages.length,0);
    assert.equal(f.sql.prepare('SELECT last_notified_at FROM telegram_pet_notification_settings').get().last_notified_at,null);
  });
});

for (const count of [1, 2, 17, 35]) test(`slow preparation of ${count} due players cannot starve the eligible tail across cron scans`, async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-02T12:00:00Z') });
  const ownerAt = i => `slow-${count}-${String(i).padStart(3, '0')}`;
  const f = fixture(ownerAt(0), { now: () => Date.now() });
  for (let i = 1; i < count; i++) f.addOwner(ownerAt(i));
  for (let i = 0; i < count; i++) {
    await quiet(f, ownerAt(i));
    await hooks.setPetNotificationPreference(f.db, ownerAt(i), true);
  }
  const tail = ownerAt(count - 1);
  f.sql.prepare('UPDATE telegram_pet_instances SET hunger=100,happiness=0,cleanliness=0,energy=0 WHERE telegram_id=?').run(tail);
  await deliveries(async messages => {
    for (let round = 0; round < 3; round++) {
      const visited = new Set();
      f.db.beforeBatch = statements => {
        for (const s of statements) {
          if (/SELECT \* FROM telegram_pet_profiles WHERE telegram_id = \?/.test(s.query) && !visited.has(s.args[0])) {
            visited.add(s.args[0]);
            // Exact reported case: 35 sources, 2.1 seconds each. Smaller pools
            // also cross the old up-front lease's one-minute boundary.
            t.mock.timers.tick(count === 35 ? 2100 : Math.ceil(65000 / count));
          }
        }
      };
      const result = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
      assert.equal(result.ok, true);
      assert.equal(result.failed, 0);
      assert.equal(result.sent, round === 0 ? 1 : 0);
      assert.equal(result.considered, round === 0 ? count : count - 1);
      assert.equal(result.skipped, count - 1);
      assert.equal(visited.size, result.considered);
      assert.equal(messages.length, 1, 'later cron ticks respect the successfully saved source cooldown');
      assert.equal(messages[0].chat_id, tail);
      assert.match(messages[0].text, /health is low/);
      assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_recovery_cursors WHERE setting_key LIKE 'moonpet:notifications:sent:%'").get().n, 1);
      assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_recovery_cursors WHERE setting_key LIKE 'moonpet:notifications:checking:%'").get().n, 1, 'quiet prefixes consume neither delivery leases nor sent cooldowns');
      t.mock.timers.tick(300000);
    }
  });
});

async function historicalRoster(owner) {
  const f = fixture(owner, { seasonKey: '2026-S1' });
  const pets = [f.source, addPet(f, `${owner}-b`, 1, '2026-S2'), addPet(f, `${owner}-c`, 1, '2026-S3')];
  for (let i = 0; i < pets.length; i++) {
    f.sql.prepare('UPDATE telegram_pet_season_slots SET created_at=? WHERE pet_id=?').run(`2026-0${i * 3 + 1}-01 00:00:00`, pets[i].pet_id);
    select(f, pets[i]);
    await quiet(f);
  }
  await hooks.setPetNotificationPreference(f.db, f.owner, true);
  return { f, pets };
}
function needsCare(f, source) {
  f.sql.prepare('UPDATE telegram_pet_instances SET health=0,hunger=100,happiness=0,cleanliness=0,energy=0 WHERE pet_id=?').run(source.pet_id);
}
function archive(f, source) {
  // Model the committed ownership transition, without deleting any history.
  f.sql.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id=?").run(source.pet_id);
  f.sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id=?").run(source.pet_id);
}
for (const ordinal of [1, 2, 3]) test(`notification labels permanent space ${ordinal} when all three pets share original source slot 1`, async () => {
  const { f, pets } = await historicalRoster(`historical-space-${ordinal}`);
  const selected = pets[ordinal - 1];
  select(f, selected); needsCare(f, selected);
  const roster = await hooks.buildPetSeasonSlotSummary(f.db, f.owner);
  assert.equal(roster.slots.find(s => s.pet_id === selected.pet_id).slot_number, ordinal);
  assert.deepEqual(f.sql.prepare('SELECT slot_number FROM telegram_pet_season_slots ORDER BY created_at').all().map(s => s.slot_number), [1, 1, 1]);
  await deliveries(async messages => {
    const result = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
    assert.equal(result.sent, 1);
    assert.match(messages[0].text, new RegExp(`For .* · pet space ${ordinal}\\n`));
    assert.match(messages[0].text, /health is low/);
    assert.equal(f.sql.prepare("SELECT setting_key FROM telegram_pet_recovery_cursors WHERE setting_key LIKE 'moonpet:notifications:sent:%'").get().setting_key,
      `moonpet:notifications:sent:${selected.season_key}:${selected.pet_id}`);
  });
});

for (const mutation of ['switch', 'archive_source']) test(`${mutation} after alert preparation rejects delivery for a three-pet historical roster`, async () => {
  const { f, pets } = await historicalRoster(`historical-change-${mutation}`);
  const selected = pets[2]; select(f, selected); needsCare(f, selected);
  let changed = false;
  f.db.beforeBatch = statements => {
    if (!changed && statements.some(s => s.query.includes('SELECT slot_number FROM ('))) {
      changed = true;
      if (mutation === 'archive_source') archive(f, selected);
      select(f, pets[0]);
    }
  };
  await deliveries(async messages => {
    const result = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
    assert.equal(changed, true); assert.equal(result.sent, 0); assert.equal(result.failed, 1); assert.equal(messages.length, 0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_recovery_cursors WHERE setting_key LIKE 'moonpet:notifications:sent:%'").get().n, 0);
    assert.equal(f.sql.prepare('SELECT last_notified_at FROM telegram_pet_notification_settings').get().last_notified_at, null);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_season_slots').get().n, 3, 'historical ownership is retained');
  });
});

test('deleting an earlier historical space during preparation refreshes the surviving source label', async () => {
  const { f, pets } = await historicalRoster('historical-space-removed');
  select(f, pets[2]); needsCare(f, pets[2]);
  let changed = false;
  f.db.beforeBatch = statements => {
    if (!changed && statements.some(s => s.query.includes('SELECT slot_number FROM ('))) {
      changed = true; archive(f, pets[0]);
    }
  };
  await deliveries(async messages => {
    const result = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
    assert.equal(changed, true); assert.equal(result.sent, 1); assert.equal(result.failed, 0);
    const roster = await hooks.buildPetSeasonSlotSummary(f.db, f.owner);
    assert.equal(roster.slots.find(s => s.pet_id === pets[2].pet_id).slot_number, 2);
    assert.match(messages[0].text, /For .* · pet space 2\n/);
    assert.equal(f.sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get(pets[2].pet_id).season_key, '2026-S3');
  });
});

test('overlapping scans that both prepared an alert still deliver only once', async () => {
  const f = fixture('prepared-overlap'); await hooks.setPetNotificationPreference(f.db, f.owner, true);
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const resume = new Promise(resolve => { release = resolve; });
  let held = false;
  f.db.beforeBatch = async statements => {
    if (!held && statements.some(s => s.query.includes('INSERT INTO telegram_pet_recovery_cursors') && s.args.some(a => String(a).startsWith('moonpet:notifications:checking:')))) {
      held = true; entered(); await resume;
    }
  };
  await deliveries(async messages => {
    const first = hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
    try {
      await ready;
      const second = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
      assert.equal(second.sent, 1);
      release();
      const resumed = await first;
      assert.equal(resumed.sent, 0); assert.equal(resumed.skipped, 1); assert.equal(resumed.failed, 0);
      assert.equal(messages.length, 1, 'a newly saved cooldown fences a previously prepared alert');
      assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_recovery_cursors WHERE setting_key LIKE 'moonpet:notifications:sent:%'").get().n, 1);
    } finally { release(); }
  });
});

for (const mode of ['throw', 'failed', 'malformed']) test(`a ${mode} per-source lease cannot send or consume a delivery cooldown`, async () => {
  const f = fixture(`delivery-lease-${mode}`); await hooks.setPetNotificationPreference(f.db, f.owner, true);
  f.db.beforeBatch = statements => {
    if (!statements.some(s => s.query.includes('INSERT INTO telegram_pet_recovery_cursors') && s.args.some(a => String(a).startsWith('moonpet:notifications:checking:')))) return;
    if (mode === 'throw') throw Error('source_lease_unavailable');
    // The failure happens before BEGIN, so it cannot leave a partial lease.
    return statements.map(() => mode === 'failed'
      ? { success: false, error: 'source_lease_unavailable', results: [], meta: { changes: 0 } }
      : { success: true, results: [], meta: { changes: '0' } });
  };
  await deliveries(async messages => {
    const rejected = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
    assert.equal(rejected.sent, 0); assert.equal(rejected.failed, 1); assert.equal(messages.length, 0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_recovery_cursors WHERE setting_key LIKE 'moonpet:notifications:checking:%' OR setting_key LIKE 'moonpet:notifications:sent:%'").get().n, 0);
    assert.equal(f.sql.prepare('SELECT enabled FROM telegram_pet_notification_settings').get().enabled, 1);
    f.db.beforeBatch = null;
    assert.equal((await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' })).sent, 1);
    assert.equal(messages.length, 1);
  });
});
