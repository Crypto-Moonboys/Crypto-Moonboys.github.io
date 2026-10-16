import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

/**
 * A real v2 browser-controller race: the first signed /run/start HTTP request
 * stays in flight across a reset. The new request MUST wait for its response
 * before touching the server, or the old server batch could invalidate the
 * new owner's unfinished ranked session.
 *
 * Only this isolated VM fixture turns on the otherwise hard-off client flag.
 */
test('reset serializes the old issued challenge before the new server start',async()=>{
  const listeners=new Map(),elements=new Map();
  let domReady=null;
  const element=()=>({
    textContent:'',children:[],dataset:{},hidden:true,
    setAttribute(){},appendChild(child){this.children.push(child);},
    replaceChildren(...children){this.children=children;},
  });
  for(const name of [
    'nbg-record-status','nbg-record-account','nbg-record-personal',
    'nbg-record-rows','nbg-prize-rows','nbg-prize-cutoff','nbg-hud-player',
    'nbg-record-ranking',
  ]) elements.set(name,element());
  const document={
    readyState:'loading',
    getElementById(id){return elements.get(id)||null;},
    querySelectorAll(){return [];},
    createElement(){return element();},
    addEventListener(type,fn){if(type==='DOMContentLoaded')domReady=fn;},
  };
  let who='100';
  const gate={
    getTelegramId(){return who;},
    isTelegramLinked(){return true;},
    async getFreshTelegramAuth(){return {id:who,hash:'valid',auth_date:'1900000000'};},
  };
  const starts=[],finishes=[];
  const window={
    MOONBOYS_IDENTITY:gate,
    MOONBOYS_API:{getLeaderboardUrl:()=> 'https://leaderboard.test'},
    addEventListener(type,callback){listeners.set(type,callback);},
  };
  const ok=data=>({ok:true,async json(){return data;}});
  async function fetch(url,opts={}){
    const path=new URL(url).pathname;
    if(path.endsWith('/run/start')){
      return new Promise(resolve=>starts.push({
        auth:JSON.parse(opts.body).telegram_auth.id,
        capability:JSON.parse(opts.body).replay_capability||null,resolve,
      }));
    }
    if(path.endsWith('/run/finish')){
      finishes.push(JSON.parse(opts.body));
      return ok({ok:true,saved:true,player:'@alpha',time_ms:120000,xp:600});
    }
    if(path.endsWith('/leaderboard'))return ok({ok:true,records:[]});
    if(path.endsWith('/me'))return ok({ok:true,player:'@alpha',records:null});
    if(path.endsWith('/competition'))return ok({
      ok:true,end_ms:Date.now()+86400000,scores_enabled:false,
      payout_enabled:false,standings:[],
    });
    return ok({ok:false,error:'unsupported'});
  }
  const original=readFileSync('game/nbg-london-leaderboards.js','utf8');
  assert.match(original,/window\.NBG_CHALLENGE_CLIENT_RELEASED = false;/,
    'real release gate must remain hard disabled');
  const source=original.replace(
    'window.NBG_CHALLENGE_CLIENT_RELEASED = false;',
    'window.NBG_CHALLENGE_CLIENT_RELEASED = true;'
  );
  vm.runInNewContext(source,{
    window,document,fetch,URL,Date,String,Number,Promise,Object,Array,console,
  });
  assert.equal(typeof domReady,'function');
  domReady();
  async function flush(){
    for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  }
  const first=window.NBG_REQUEST_RANKED_CHALLENGE();
  await flush();
  assert.equal(starts.length,1,'first server challenge has been requested');
  assert.equal(starts[0].auth,'100');
  assert.equal(starts[0].capability,'challenge_v2',
    'only explicit preplay v2 requests may receive a trusted challenge');
  // In production, server-side start invalidates older still-live sessions.
  // If the older response commits after the fresh one, the new run expires.
  listeners.get('nbg-level-reset')({});
  const second=window.NBG_REQUEST_RANKED_CHALLENGE();
  await flush();
  assert.equal(starts.length,1,
    'second HTTP request must wait until first in-flight start settles');
  starts[0].resolve(ok({
    ok:true,ranked:true,run_id:'11111111-1111-4111-8111-111111111111',
    challenge_seed:12345,replay_version:2,player:'@alpha',
  }));
  assert.equal(await first,null,'pre-reset stale source may not start gameplay');
  await flush();
  assert.equal(starts.length,2,'fresh start proceeds after stale request settles');
  starts[1].resolve(ok({
    ok:true,ranked:true,run_id:'22222222-2222-4222-8222-222222222222',
    challenge_seed:98765,replay_version:2,player:'@alpha',
  }));
  const fresh=await second;
  assert.equal(fresh.run_id,'22222222-2222-4222-8222-222222222222');
  assert.equal(fresh.challenge_seed,98765);
  assert.equal(fresh.telegram_id,'100');
  assert.equal(starts.length,2);

  // A mixed browser cache may load the new leaderboard JS alongside an
  // earlier game that emits `nbg-level-started` with NO v2 marker. Even if
  // this client code is unlocked, that old game must receive a v1 session
  // (and still finish its ordinary specialist run) rather than a v2-only
  // challenge that it cannot simulate.
  assert.equal(typeof listeners.get('nbg-level-started'),'function');
  listeners.get('nbg-level-started')({detail:{level:'london-level-1'}});
  await flush();
  assert.equal(starts.length,3,'new client must start old cached v1 game');
  assert.equal(starts[2].capability,null,
    'legacy ranked start never advertises v2 before-play capability');
  starts[2].resolve(ok({
    ok:true,ranked:true,run_id:'33333333-3333-4333-8333-333333333333',
    player:'@alpha',
  }));
  await flush();
  listeners.get('nbg-level-complete')({
    detail:{replay:{version:1,frames:'AQIDBAU='},timeMs:120000,xp:1000000}
  });
  await flush();
  assert.equal(finishes.length,1,
    'legacy cached-game finish must still be forwarded for server v1 scoring');
  assert.equal(finishes[0].run_id,'33333333-3333-4333-8333-333333333333');
  assert.equal(finishes[0].replay.version,1);
  assert.equal(Object.hasOwn(finishes[0],'xp'),false,
    'browser-declared XP is never trusted even on legacy compatibility path');
  listeners.get('nbg-level-started')({detail:{
    level:'london-level-1',replay_version:1,
  }});
  await flush();
  assert.equal(starts.length,3,
    'new-engine practice after an unavailable challenge cannot silently create a second ranked v1 start');
});

test('v2 challenge release stays disabled in production source',()=>{
  const actual=readFileSync('game/nbg-london-leaderboards.js','utf8');
  assert.match(actual,/NBG_CHALLENGE_CLIENT_RELEASED = false/);
});
