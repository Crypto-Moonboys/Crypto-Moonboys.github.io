import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {fixture,clockFixture,hooks,worker} from './moonpet-audit-regression-fixture.mjs';
const summaries=[];let sequence=975100;
for(const crossing of ['preparation','nested'])for(const boundary of ['2026-09-30T23:59:59.999Z','2026-10-04T23:59:59.999Z','2026-10-06T23:59:59.999Z'])for(const mode of ['full','missions','core','profile']){
 const f=fixture(String(++sequence)),clock=clockFixture(f,boundary);
 f.pet('retained-pet','pet-s2026-003',10000,2);f.active('retained-pet','pet-s2026-003');
 f.sql.prepare("UPDATE telegram_pet_season_slots SET created_at='2026-07-01 00:00:00'").run();
 for(const [season,xp] of [['pet-s2026-003',300],['pet-s2026-004',500]]) f.sql.prepare('INSERT INTO telegram_pet_season_state(telegram_id,season_key,season_xp) VALUES(?,?,?)').run(f.owner,season,xp);
 let crossed=false;f.db.beforeFirst=s=>{if(!crossed&&s.query.includes(crossing==='preparation'?'SELECT telegram_id FROM telegram_pet_profiles':'FROM telegram_pet_lifecycle_by_pet')){crossed=true;clock.advance(2);}};
 f.db.beforeAll=f.db.beforeFirst;
 const token='123456:local-boundary-token';
 const fields=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(f.owner),first_name:'Fixture'})});
 const check=[...fields.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('\n');
 fields.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));
 const response=await worker.fetch(new Request('https://moonboys-api.test/telegram-pets/app/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({init_data:fields.toString(),mode})}),{DB:f.db,TELEGRAM_BOT_TOKEN:token});
 assert.equal(response.status,200);const {state}=await response.json();
 const freshBoard=await hooks.buildPetMiniAppLeaderboard(f.db,f.owner,'seasonal',25);
 const report={boundary,mode,crossing,status:response.status,server_time:state.server_time,competition_season:state.competition_season?.key,guidance_day:state.guidance?.day_key,guidance_week:state.guidance?.week_key,guidance_season:state.guidance?.season?.key,guidance_season_xp:state.guidance?.season?.xp,finale_season:state.season_finales?.competition_season_key,leaderboard_xp:state.leaderboard?.[0]?.pet_xp,fresh_leaderboard_xp:freshBoard.entries[0]?.pet_xp,journey_day:state.daily_journey?.utc_day,pet_id:state.pet.pet_id};
 assert.equal(state.server_time,boundary);
 assert.equal(report.competition_season,hooks.getPetSeasonInfo(new Date(boundary)).key);
 assert.equal(report.pet_id,'retained-pet');
 if(mode!=='core'){
   assert.equal(report.guidance_day,boundary.slice(0,10));
   assert.equal(report.guidance_week,boundary.startsWith('2026-10-06')?'2026-W41':'2026-W40');
   assert.equal(report.journey_day,boundary.slice(0,10));
   assert.equal(report.finale_season,report.competition_season);
   if(mode!=='missions'){
     assert.equal(report.guidance_season,report.competition_season);
     assert.equal(report.guidance_season_xp,boundary.startsWith('2026-09-30')?300:500);
     assert.equal(report.leaderboard_xp,report.guidance_season_xp);
   }
 }
 assert.equal(f.sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get('retained-pet').season_key,'pet-s2026-003');
 summaries.push(report);clock.restore();f.sql.close();
}
console.log(`Moonpet projection periods: ${summaries.length} authenticated rollover cases passed.`);

// A committed action can earn in the previous quarter while its subsequent
// hydration begins in the new one. The response state is coherent in itself;
// the saved source receipt must remain in the earning quarter.
{
 const {httpAction}=await import('./moonpet-audit-regression-fixture.mjs');
 const f=fixture('975199'),clock=clockFixture(f,'2026-09-30T23:59:59.999Z');
 try {
  let crossed=false;f.db.beforeBatch=statements=>{
   if(!crossed && statements.some(s=>s.query.includes("'pet_action_pending'"))){crossed=true;clock.advance(2);}
  };
  const response=await httpAction(f,{action:'feed',request_id:'quarter-feed',response_mode:'full'});
  assert.equal(response.status,200);assert.equal(response.body.result.accepted,true);assert.equal(crossed,true);
  const state=response.body.state;assert.ok(state);
  assert.equal(state.guidance.day_key,'2026-10-01');assert.equal(state.daily_journey.utc_day,'2026-10-01');
  assert.equal(state.competition_season.key,'pet-s2026-004');assert.equal(state.guidance.season.key,'pet-s2026-004');
  assert.equal(state.season_finales.competition_season_key,'pet-s2026-004');
  const receipt=f.sql.prepare("SELECT day_key,week_key FROM telegram_pet_events WHERE event_type='feed' AND status='accepted'").get();
  assert.equal(receipt.day_key,'2026-09-30');assert.equal(receipt.week_key,'2026-W40');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='feed' AND status='accepted'").get().n,1);
 } finally {clock.restore();f.sql.close();}
}
