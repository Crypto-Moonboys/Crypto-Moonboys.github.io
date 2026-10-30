import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import baseWorker from '../workers/moonboys-api/worker.js';
import deployedWorker from '../workers/moonboys-api/deployment-entry.js';

const ORIGINS=['https://cryptomoonboys.com','https://www.cryptomoonboys.com','https://crypto-moonboys.github.io'];
const CUSTOM='https://staging.example.com';
const ROUTES=['/telegram-pets/app/state','/telegram-pets/app/action'];
function request(route,origin,method='POST',body='{}') {
  return new Request('https://api.cryptomoonboys.com'+route,{
    method,headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},
    ...(method==='POST'?{body}:{}),
  });
}
async function withBase(handler,fn) {
  const original=baseWorker.fetch;baseWorker.fetch=handler;
  try{return await fn();}finally{baseWorker.fetch=original;}
}
for(const route of ROUTES) {
  test(route+': default production origins can preflight without touching state',async()=>{
    let calls=0;
    await withBase(async()=>{calls++;throw Error('must not delegate preflight');},async()=>{
      for(const origin of ORIGINS) {
        const response=await deployedWorker.fetch(request(route,origin,'OPTIONS'),{});
        assert.equal(response.status,204);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
        assert.equal(response.headers.get('Access-Control-Allow-Methods'),'POST, OPTIONS');
        assert.equal(response.headers.get('Access-Control-Allow-Headers'),'Content-Type');
        assert.equal(await response.text(),'');
      }
    });assert.equal(calls,0);
  });
  test(route+': configured allowlist replaces defaults for preflight and actual responses',async()=>{
    const env={CORS_ALLOWED_ORIGINS:' '+CUSTOM+' , https://second.example.com '};
    for(const origin of [CUSTOM,'https://second.example.com']) {
      const preflight=await deployedWorker.fetch(request(route,origin,'OPTIONS'),env);
      assert.equal(preflight.status,204);
      assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
      const actual=await deployedWorker.fetch(request(route,origin),env);
      assert.equal(actual.status,401,'the CORS wrapper cannot grant unauthenticated gameplay');
      assert.equal(actual.headers.get('Access-Control-Allow-Origin'),origin);
    }
    for(const origin of [...ORIGINS,'https://evil.example',null]) {
      const preflight=await deployedWorker.fetch(request(route,origin,'OPTIONS'),env);
      assert.equal(preflight.status,403);
      assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),null,'excluded defaults must not leak through jsonError');
      assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
      const actual=await deployedWorker.fetch(request(route,origin),env);
      assert.equal(actual.status,401);
      assert.equal(actual.headers.get('Access-Control-Allow-Origin'),null);
    }
  });
  test(route+': comma-only override denies all rather than reverting to defaults',async()=>{
    const response=await deployedWorker.fetch(request(route,ORIGINS[0],'OPTIONS'),{CORS_ALLOWED_ORIGINS:' , '});
    assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  });
  test(route+': auth rejection remains readable and never queries Telegram or D1',async()=>{
    let dbCalls=0,fetchCalls=0;const originalFetch=globalThis.fetch;
    globalThis.fetch=async()=>{fetchCalls++;throw Error('must not call Telegram');};
    try {
      const response=await deployedWorker.fetch(request(route,ORIGINS[0]),{
        DB:{prepare(){dbCalls++;throw Error('must not read or write state');}},
      });
      assert.equal(response.status,401);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGINS[0]);
      assert.equal(typeof (await response.json()).error,'string');
      assert.equal(dbCalls,0);assert.equal(fetchCalls,0);
    } finally {globalThis.fetch=originalFetch;}
  });
  test(route+': malformed JSON keeps its 400 response',async()=>{
    const response=await deployedWorker.fetch(request(route,ORIGINS[0],'POST','{broken'),{});
    assert.equal(response.status,400);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGINS[0]);
    assert.equal(typeof (await response.json()).error,'string');
  });
  test(route+': normalization preserves body, status, rate-limit and cache variation headers',async()=>{
    for(const status of [200,400,401,403,429,503]) {
      let calls=0;
      await withBase(async req=>{
        calls++;assert.deepEqual(await req.json(),{action:'feed',event_key:'fixture'});
        return new Response(JSON.stringify({status}),{status,headers:{
          'Content-Type':'application/json','Retry-After':'9','Vary':'Accept-Encoding',
          'Cache-Control':'no-store','X-Fixture':'retained',
        }});
      },async()=>{
        const response=await deployedWorker.fetch(request(route,CUSTOM,'POST',JSON.stringify({action:'feed',event_key:'fixture'})),{CORS_ALLOWED_ORIGINS:CUSTOM});
        assert.equal(response.status,status);assert.deepEqual(await response.json(),{status});
        assert.equal(response.headers.get('Access-Control-Allow-Origin'),CUSTOM);
        assert.equal(response.headers.get('Retry-After'),'9');
        assert.equal(response.headers.get('Cache-Control'),'no-store');
        assert.equal(response.headers.get('X-Fixture'),'retained');
        const vary=response.headers.get('Vary').toLowerCase().split(',').map(s=>s.trim());
        assert.ok(vary.includes('origin'));assert.ok(vary.includes('accept-encoding'));
      });assert.equal(calls,1,'CORS normalization must never retry a mutation');
    }
  });
}
test('non-MoonPet routes retain existing wrapper behavior',async()=>{
  const response=await deployedWorker.fetch(new Request('https://api.cryptomoonboys.com/health',{headers:{Origin:CUSTOM}}),{CORS_ALLOWED_ORIGINS:CUSTOM});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),CUSTOM);
});


const TOKEN='123456:moonpet-cors-fixture';
function signedInitData(id) {
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Fixture'})});
  const check=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const key=createHmac('sha256','WebAppData').update(TOKEN).digest();
  params.set('hash',createHmac('sha256',key).update(check).digest('hex'));
  return params.toString();
}
for(const [index,route] of ROUTES.entries()) {
  for(const member of [false,true]) {
    test(route+': real signed '+(member?'member storage failure':'non-member denial')+' remains protected and readable',async()=>{
      const originalFetch=globalThis.fetch;let lookups=0,dbCalls=0;
      globalThis.fetch=async()=>{lookups++;return Response.json({ok:true,result:{status:member?'member':'left'}});};
      try {
        const response=await deployedWorker.fetch(request(route,CUSTOM,'POST',JSON.stringify({
          init_data:signedInitData(880000+index*2+Number(member)),mode:'core',action:'feed',event_key:'fixture',
        })),{CORS_ALLOWED_ORIGINS:CUSTOM,TELEGRAM_BOT_TOKEN:TOKEN,TELEGRAM_GROUP_CHAT_ID:'-1001234567890',
          DB:{prepare(){dbCalls++;throw Error('fixture storage unavailable');}},
        });
        assert.equal(response.status,member?503:403);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'),CUSTOM);
        const body=await response.json();
        assert.equal(body.error,member?(index===0?'mini_app_state_failed':'mini_app_action_failed'):'telegram_group_membership_required');
        assert.equal(lookups,1);
        if(!member)assert.equal(dbCalls,0,'non-member must not read or mutate a saved pet');
      }finally{globalThis.fetch=originalFetch;}
    });
  }
}


test('a signed member loads core state through the production wrapper and records membership timing',async()=>{
  const f=await performanceFixture({owner:'880010'});
  const originalFetch=globalThis.fetch,originalInfo=console.info,events=[];let lookups=0;
  globalThis.fetch=async()=>{lookups++;return Response.json({ok:true,result:{status:'member'}});};
  console.info=value=>{if(typeof value==='string'&&value.includes('moonpet_state_timing'))events.push(JSON.parse(value));};
  try {
    const response=await deployedWorker.fetch(request(ROUTES[0],CUSTOM,'POST',JSON.stringify({init_data:signedInitData(Number(f.owner)),mode:'core'})),{
      DB:f.db,TELEGRAM_BOT_TOKEN:TOKEN,TELEGRAM_GROUP_CHAT_ID:'-1001234567890',CORS_ALLOWED_ORIGINS:CUSTOM,
    });
    assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),CUSTOM);
    const body=await response.json();assert.equal(body.ok,true);assert.equal(body.state.adopted,true);
    assert.ok(events.some(event=>event.stage==='group_membership'&&event.outcome==='completed'));
    assert.equal(lookups,1);
  }finally{globalThis.fetch=originalFetch;console.info=originalInfo;await f.drain();f.close();}
});
