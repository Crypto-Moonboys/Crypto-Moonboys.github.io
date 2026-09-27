import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql',import.meta.url),'utf8'));
sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql',import.meta.url),'utf8'));
class Statement {
  constructor(query,args=[]) { this.query=query; this.args=args; }
  bind(...args) { return new Statement(this.query,args); }
  async first() { return sql.prepare(this.query).get(...this.args)||null; }
  async all() { return {results:sql.prepare(this.query).all(...this.args)}; }
  async run() {
    if (/\bRETURNING\b/i.test(this.query)) { const results=sql.prepare(this.query).all(...this.args); return {results,meta:{changes:results.length}}; }
    return {results:[],meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};
  }
}
const db={prepare(query){return new Statement(query);},async batch(statements){
  sql.exec('BEGIN');
  try { const results=[]; for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results; }
  catch(error){sql.exec('ROLLBACK');throw error;}
}};
const now=new Date(), season=hooks.getPetSeasonInfo(now).key;
function seed(owner,xp=100) {
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner,'Player '+owner);
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp) VALUES (?,?)').run(owner,xp);
}
function pet(owner,id,slot,xp,sourceSeason=season,phase='young') {
  sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id,owner,sourceSeason,slot);
  sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,source_profile_updated_at) VALUES (?,?,?,?,?,'0001-01-01 00:00:00')").run(id,owner,sourceSeason,slot,xp);
  sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,?,?,'{}','[]')").run(id,owner,id,phase,'vinyl_crab');
}
function active(owner,id,sourceSeason=season) {
  sql.prepare('INSERT OR REPLACE INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner,id,sourceSeason);
}
async function get(path) {
  const response=await worker.fetch(new Request('https://moonboys-api.test'+path),{DB:db});
  assert.equal(response.status,200);
  if(path.startsWith('/telegram-pets/')) assert.equal(response.headers.get('cache-control'),'no-store');
  return response.json();
}
seed('70001');pet('70001','earned-pet',1,100);pet('70001','second-pet',2,200);active('70001','earned-pet');
let board=await get('/telegram-pets/leaderboard?period=all_time');
assert.equal(board.entries[0].pet_xp,300,'all-time account XP includes both owned pets');
active('70001','second-pet');
sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=200 WHERE telegram_id=?').run('70001');
board=await get('/telegram-pets/leaderboard?period=all_time');
assert.equal(board.entries[0].pet_xp,300,'switching pets cannot replace the all-time total');

// Old-season recovery counts for its source season and account all-time, while
// daily/weekly count the actual settlement. The current pet keeps its own XP.
const previousSeason=hooks.getPetSeasonInfo(new Date(Date.UTC(now.getUTCFullYear()-1,0,15))).key;
pet('70001','archived-pet',1,400,previousSeason);
sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id='archived-pet'").run();
sql.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id='archived-pet'").run();
sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES ('archived-pet','70001','elite_moonpet',3,'reveal')").run();
sql.prepare("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
const reward={telegram_id:'70001',pet_id:'archived-pet',season_key:previousSeason,source:'pet_action',idempotency_key:'sync-reward',event_key:'sync-reward',event_type:'feed',rewards:{pet_xp:20,community_xp:3},now};
assert.equal((await awardPetReward(db,reward)).pet_xp_awarded,20);
assert.equal((await awardPetReward(db,reward)).pet_xp_awarded,0);
assert.equal(sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='second-pet'").get().pet_xp,200);
assert.equal((await get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,720);
for(const period of ['daily','weekly']) assert.equal((await get('/telegram-pets/leaderboard?period='+period)).entries[0].pet_xp,20);
assert.deepEqual((await get('/telegram-pets/leaderboard?period=seasonal')).entries,[],'old recovery cannot inflate current-season ranks');
assert.equal(sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?').get('70001',previousSeason).season_xp,20);
let activity=await get('/telegram-pets/activity');
assert.equal(activity.items[0].display_name,'BOTTY','activity identifies the archived earning pet, not the active hidden pet');
assert.equal(activity.items[0].pet_xp_awarded,20);
assert.equal(activity.items.length,1,'duplicate recovery creates no second public action');
sql.prepare("UPDATE telegram_leaderboard SET rank=99 WHERE telegram_id='70001'").run();
const community=await get('/telegram/leaderboard');
assert.equal(community.entries.find((entry)=>entry.telegram_id==='70001').xp,3,'only Community XP reaches the Community leaderboard');
assert.equal(community.entries.find((entry)=>entry.telegram_id==='70001').rank,1,'displayed rank follows current XP rather than a stale stored rank');

// Ties, self outside the top page, legacy rows, and malformed active pointers.
seed('70002',720);seed('70003',720);seed('70004',30);
pet('70004','fourth-pet',1,30);active('70004','archived-pet',previousSeason);
for(const [owner,xp] of [['70001',8],['70002',8],['70003',9],['70004',1]]) {
  sql.prepare('INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp) VALUES (?,?,?)').run(owner,season,xp);
}
const changes=()=>sql.prepare('SELECT total_changes() n').get().n;
const beforeReads=changes();
for(const period of ['daily','weekly','seasonal','all_time','run_depth']) {
  const publicBoard=await get('/telegram-pets/leaderboard?period='+period+'&limit=2');
  const miniBoard=await hooks.buildPetMiniAppLeaderboard(db,'70004',period,2);
  const comparable=(entry)=>{const {player_display_name,username,last_active_label,is_current,...rest}=entry;return rest;};
  assert.deepEqual(publicBoard.entries.map(comparable),miniBoard.entries.map(comparable),period+' website and Mini App must match');
  if(['seasonal','all_time'].includes(period)) assert.equal(miniBoard.self.rank,4,'self row is retained below the top page');
}
await get('/telegram-pets/activity');
assert.equal(changes(),beforeReads,'ranking and activity reads never initialize or switch another player');
const initial=await hooks.buildPetMiniAppState(db,'70001','fixture-token');
const seasonal=await hooks.buildPetMiniAppLeaderboard(db,'70001','seasonal',10);
assert.deepEqual(initial.leaderboard,seasonal.entries.map(({is_current,...entry})=>entry),'initial Mini App panel and full seasonal ranks match');
const hidden=(await hooks.buildPetMiniAppLeaderboard(db,'70004','all_time',100)).self;
assert.equal(hidden.display_name,'UNKNOWN');assert.equal(hidden.art_identity_id,null,'foreign active pointer cannot disclose another pet');
sql.prepare("UPDATE telegram_users SET first_name=NULL,username=NULL,last_name=NULL WHERE telegram_id='70001'").run();
activity=await get('/telegram-pets/activity');
assert.match(activity.items[0].text,/^Anonymous /);
assert.ok(!JSON.stringify(activity).includes('70001'),'public activity cannot expose owner IDs');
assert.ok(!JSON.stringify(await get('/telegram-pets/leaderboard')).includes('telegram_id'));

// Invalid source authority is masked, never replaced with the current pet.
sql.prepare("UPDATE telegram_pet_events SET season_key='wrong-season' WHERE event_key='sync-reward'").run();
assert.equal((await get('/telegram-pets/activity')).items[0].display_name,'UNKNOWN');
sql.prepare("UPDATE telegram_pet_events SET season_key=? WHERE event_key='sync-reward'").run(previousSeason);
sql.prepare("INSERT INTO telegram_pet_events (id,telegram_id,event_key,event_type,status,season_key,day_key,week_key,metadata) VALUES ('internal','70001','moonpet_wallet_reconcile:v1','feed','accepted',?,'2000-01-01','2000-W01','{}')").run(season);
assert.equal((await get('/telegram-pets/activity')).items.length,1,'wallet maintenance is not public gameplay');
for(const path of ['/telegram-pets/leaderboard?period=bogus&limit=NaN','/telegram-pets/activity?limit=NaN']) assert.ok(await get(path));
const broken={prepare(){throw Error('injected_read_failure');}};
for(const path of ['/telegram-pets/leaderboard','/telegram-pets/activity']) {
  const response=await worker.fetch(new Request('https://moonboys-api.test'+path),{DB:broken});
  assert.equal(response.status,503,'outages must not masquerade as empty rankings');
}
console.log('Moonpet public synchronization tests passed');
