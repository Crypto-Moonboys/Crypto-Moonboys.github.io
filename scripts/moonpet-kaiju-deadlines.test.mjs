import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, hooks, clockFixture, httpAction } from './moonpet-audit-regression-fixture.mjs';

const card = hooks.PET_KAIJU_CARDS[0].id;
const paid = f => f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_kaiju' AND status='awarded'").get().n;
for (const [name, delay, race, accepted] of [
  ['before', 20*60000-1000, false, true], ['exactly at', 20*60000, false, true],
  ['after', 20*60000+1000, false, false], ['crossing read/write', 20*60000-1000, true, false],
]) test(`solo Kaiju deadline: ${name}`, async t => {
  const f = fixture(String(954100 + delay)), clock = clockFixture(f); t.after(() => { clock.restore(); f.sql.close(); });
  const start = await httpAction(f,{action:'kaiju_start'}); assert.equal(start.status,200);
  const id = start.body.result.match.match_id; clock.advance(delay);
  let intercepted = false;
  if (race) f.db.beforeRun = statement => { if (statement.query.includes('UPDATE telegram_pet_kaiju_matches SET player1_card_key=')) {
    intercepted=true; clock.advance(2000); f.db.beforeRun=null;
  } };
  const result = await httpAction(f,{action:'kaiju_card',match_id:id,card_key:card});
  assert.equal(result.status, accepted ? 200 : 409);
  assert.equal(paid(f), accepted ? 1 : 0);
  const saved = f.sql.prepare('SELECT status,player1_card_key FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id);
  assert.equal(saved.status, accepted ? 'completed' : 'cancelled');
  if (!accepted) { assert.equal(saved.player1_card_key,null); assert.equal(result.body.result.reason,'kaiju_expired'); }
  if (race) assert.equal(intercepted,true);
});

test('multiplayer second card crossing expiry cannot pay either participant', async t => {
  const f = fixture('954201'), clock = clockFixture(f), rival='954202'; t.after(() => { clock.restore(); f.sql.close(); });
  f.sql.prepare('INSERT INTO telegram_users(telegram_id,first_name) VALUES(?,?)').run(rival,'Rival');
  f.sql.prepare('INSERT INTO telegram_pet_profiles(telegram_id,pet_xp,energy) VALUES(?,10000,100)').run(rival);
  await hooks.preparePetMiniAppState(f.db,rival,new Date());
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE telegram_id=?").run(rival);
  assert.equal((await httpAction(f,{action:'kaiju_matchmake'})).status,200);
  const joined = await httpAction(f,{action:'kaiju_matchmake'},rival), match=joined.body.result.match;
  assert.equal(joined.status,200);
  const players = f.sql.prepare('SELECT player1_telegram_id,player2_telegram_id FROM telegram_pet_kaiju_matches WHERE match_id=?').get(match.match_id);
  assert.equal((await httpAction(f,{action:'kaiju_card',match_id:match.match_id,card_key:card},players.player1_telegram_id)).body.result.reason,'kaiju_card_waiting');
  clock.advance(20*60000-1000);
  f.db.beforeRun = statement => { if (statement.query.includes('UPDATE telegram_pet_kaiju_matches SET player2_card_key=')) {clock.advance(2000);f.db.beforeRun=null;} };
  const late = await httpAction(f,{action:'kaiju_card',match_id:match.match_id,card_key:card},players.player2_telegram_id);
  assert.equal(late.status,409); assert.equal(late.body.result.reason,'kaiju_expired'); assert.equal(paid(f),0);
  assert.equal(f.sql.prepare('SELECT player2_card_key FROM telegram_pet_kaiju_matches WHERE match_id=?').get(match.match_id).player2_card_key,null);
});

test('already committed cards recover an interrupted ending after expiry exactly once', async t => {
  const f = fixture('954301'), clock = clockFixture(f); t.after(() => { clock.restore(); f.sql.close(); });
  const start = await httpAction(f,{action:'kaiju_start'}), id=start.body.result.match.match_id;
  f.sql.exec("CREATE TRIGGER fail_completion BEFORE UPDATE OF status ON telegram_pet_kaiju_matches WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'interrupted_ending'); END");
  assert.equal((await httpAction(f,{action:'kaiju_card',match_id:id,card_key:card})).status,500);
  const saved = f.sql.prepare('SELECT player1_card_key,cpu_card_key FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id);
  assert.ok(saved.player1_card_key && saved.cpu_card_key); assert.equal(paid(f),0);
  f.sql.exec('DROP TRIGGER fail_completion'); clock.advance(21*60000);
  assert.equal((await httpAction(f,{action:'kaiju_card',match_id:id,card_key:card})).status,200);
  assert.equal((await httpAction(f,{action:'kaiju_card',match_id:id,card_key:card})).body.result.duplicate,true);
  assert.equal(paid(f),1);
});

for (const fault of ['IGNORE', "ABORT,'failed_card'"]) test(`unsaved card (${fault}) is rejected and healthy retry pays once`, async t => {
  const f=fixture('9544'+fault.length),clock=clockFixture(f); t.after(() => {clock.restore();f.sql.close();});
  const start=await httpAction(f,{action:'kaiju_start'}),id=start.body.result.match.match_id;
  f.sql.exec(`CREATE TRIGGER fail_card BEFORE UPDATE OF player1_card_key ON telegram_pet_kaiju_matches WHEN NEW.player1_card_key IS NOT NULL BEGIN SELECT RAISE(${fault}); END`);
  assert.equal((await httpAction(f,{action:'kaiju_card',match_id:id,card_key:card})).status,fault==='IGNORE'?409:500);
  assert.equal(paid(f),0); f.sql.exec('DROP TRIGGER fail_card');
  assert.equal((await httpAction(f,{action:'kaiju_card',match_id:id,card_key:card})).status,200); assert.equal(paid(f),1);
});

for (const action of ['join', 'cpu']) {
  for (const [name, delay, race, accepted] of [
    ['before', 20*60000-1000, false, true], ['exactly at', 20*60000, false, true],
    ['after', 20*60000+1000, false, false], ['crossing read/write', 20*60000-1000, true, false],
  ]) test(`Telegram Kaiju ${action}: ${name}`, async t => {
    const f=fixture('954501'), clock=clockFixture(f), chat='-100954501';
    const originalFetch=globalThis.fetch, messages=[];
    t.after(()=>{globalThis.fetch=originalFetch;clock.restore();f.sql.close();});
    // Intercept every bot response locally; no Telegram request leaves the test.
    globalThis.fetch=async (_url, init={})=>{
      messages.push(JSON.parse(String(init.body||'{}')).text||'');
      return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{headers:{'Content-Type':'application/json'}});
    };
    const start=await httpAction(f,{action:'kaiju_start'}), id=start.body.result.match.match_id;
    if(action==='join') f.sql.prepare("INSERT INTO telegram_users(telegram_id) VALUES('954502')").run();
    f.sql.prepare("UPDATE telegram_pet_kaiju_matches SET chat_id=?,mode='group',status='open',player1_telegram_id=? WHERE match_id=?")
      .run(chat,action==='join'?'954502':f.owner,id);
    clock.advance(delay);
    let intercepted=false;
    if(race) f.db.beforeRun=statement=>{
      const transition=action==='join'?'SET player2_telegram_id =':'SET mode =';
      if(statement.query.includes(transition)&&statement.query.includes('telegram_pet_kaiju_matches')){
        intercepted=true;clock.advance(2000);f.db.beforeRun=null;
      }
    };
    await hooks.cmdPetKaiju(f.db,'local-regression-token',chat,f.owner,`${action}:${id}`,'group',{id:Number(f.owner)});
    const row=f.sql.prepare('SELECT status,player2_telegram_id FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id);
    assert.equal(row.status,accepted?'selecting':'cancelled');
    assert.equal(row.player2_telegram_id,accepted&&action==='join'?f.owner:null);
    assert.equal(paid(f),0);
    assert.equal(messages.some(message=>/locked in|Choose your sticker card/.test(message)),accepted);
    if(race)assert.equal(intercepted,true);
  });
}

for (const status of ['open', 'selecting']) {
  for (const [name, delay, race, accepted] of [
    ['before', 20*60000-1000, false, true], ['exactly at', 20*60000, false, true],
    ['after', 20*60000+1000, false, false], ['crossing read/write', 20*60000-1000, true, false],
  ]) test(`Kaiju ${status} category hydration: ${name}`, async t => {
    const f=fixture('954601'),clock=clockFixture(f);
    t.after(()=>{clock.restore();f.sql.close();});
    const start=await httpAction(f,{action:'kaiju_start'}),id=start.body.result.match.match_id;
    // Retained pre-category tables enter this real state-hydration path.
    f.sql.prepare('UPDATE telegram_pet_kaiju_matches SET category_key=NULL,roll=0,status=?,mode=? WHERE match_id=?')
      .run(status,status==='open'?'group':'solo',id);
    const snapshot=f.sql.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id);
    clock.advance(delay);
    let intercepted=false;
    if(race)f.db.beforeRun=statement=>{
      if(statement.query.includes('SET category_key = ?, roll = ?')){
        intercepted=true;clock.advance(2000);f.db.beforeRun=null;
      }
    };
    const hydrated=await hooks.ensurePetKaijuMatchCategory(f.db,snapshot);
    const saved=f.sql.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id);
    assert.equal(Boolean(saved.category_key),accepted);
    assert.equal(Boolean(hydrated.category_key),accepted);
    assert.equal(saved.status,status);
    assert.equal(paid(f),0);
    if(accepted){
      assert.equal(saved.roll,hooks.PET_KAIJU_CATEGORIES.find(category=>category.key===saved.category_key)?.roll);
      assert.notEqual(saved.updated_at,snapshot.updated_at);
      // Once saved, repeated state hydration must not keep renewing the TTL.
      clock.advance(21*60000);
      await hooks.ensurePetKaijuMatchCategory(f.db,hydrated);
      assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id),saved);
    }else{
      assert.deepEqual(saved,snapshot,'late hydration cannot persist a category, roll or renewed TTL');
    }
    if(race)assert.equal(intercepted,true);
  });
}

for(const fault of ['IGNORE',"ABORT,'failed_category'"])test(`Kaiju category ${fault} preserves TTL and retries without payout`,async t=>{
  const f=fixture('954701'),clock=clockFixture(f);t.after(()=>{clock.restore();f.sql.close();});
  const start=await httpAction(f,{action:'kaiju_start'}),id=start.body.result.match.match_id;
  f.sql.prepare('UPDATE telegram_pet_kaiju_matches SET category_key=NULL,roll=0 WHERE match_id=?').run(id);
  const snapshot=f.sql.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id);
  clock.advance(60000);
  f.sql.exec(`CREATE TRIGGER fail_category BEFORE UPDATE OF category_key ON telegram_pet_kaiju_matches
    WHEN NEW.category_key IS NOT NULL BEGIN SELECT RAISE(${fault}); END`);
  if(fault==='IGNORE')assert.equal((await hooks.ensurePetKaijuMatchCategory(f.db,snapshot)).category_key,null);
  else await assert.rejects(hooks.ensurePetKaijuMatchCategory(f.db,snapshot),/failed_category/);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id),snapshot);
  f.sql.exec('DROP TRIGGER fail_category');
  assert.ok((await hooks.ensurePetKaijuMatchCategory(f.db,snapshot)).category_key);
  assert.equal(paid(f),0);
});
