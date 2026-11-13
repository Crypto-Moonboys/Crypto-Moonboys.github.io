import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTagRunBulletin, TAG_RUN_BULLETIN_IMAGE } from '../workers/moonboys-api/tag-run/bulletin-transport.js';
const env = {
  TELEGRAM_GROUP_CHAT_ID: '-1001234567890',
  TELEGRAM_GROUP_THREAD_ID: '23456',
  TELEGRAM_BOT_TOKEN: 'fake-token',
  // Bulletin artwork is fixed, independent of the generated-PFP feature.
  TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'false'
};
const ack = (id=1) => ({ok:true,json:async()=>({ok:true,result:{message_id:id}})});
test('long bulletin gets fixed artwork plus full text in the same topic', async()=>{
  const calls=[];
  const text='Full Community Pot bulletin\n'+'a'.repeat(3000);
  const result=await sendTagRunBulletin(env,text,async(url,options)=>{
    calls.push({method:url.split('/').at(-1),body:JSON.parse(options.body)});
    return ack(calls.length);
  });
  assert.equal(result.status,'sent');
  assert.deepEqual(calls.map(c=>c.method),['sendPhoto','sendMessage']);
  assert.equal(calls[0].body.photo,TAG_RUN_BULLETIN_IMAGE);
  assert.equal(calls[0].body.photo,'https://cryptomoonboys.com/img/Neon%20GKNIFTYHEADS%20Tag-Run%20Launch.jpg');
  assert(calls[0].body.caption.length<=1024);
  assert.equal(calls[1].body.text,text);
  assert(calls.every(c=>c.body.chat_id===env.TELEGRAM_GROUP_CHAT_ID && c.body.message_thread_id===23456));
});
test('successive bulletins always send the same fixed image',async()=>{
  const images=[];
  for(let i=0;i<3;i++) await sendTagRunBulletin(env,'bulletin '+i,async(url,options)=>{
    if(url.endsWith('/sendPhoto')) images.push(JSON.parse(options.body).photo);
    return ack();
  });
  assert.deepEqual(images,[TAG_RUN_BULLETIN_IMAGE,TAG_RUN_BULLETIN_IMAGE,TAG_RUN_BULLETIN_IMAGE]);
});
for(const failure of ['timeout','unreadable','missing_id','rejected','server_error']) {
  test('photo '+failure+' preserves one full text message without a photo retry',async()=>{
    const calls=[];
    const result=await sendTagRunBulletin(env,'full body',async(url,options)=>{
      calls.push({method:url.split('/').at(-1),body:JSON.parse(options.body)});
      if(url.endsWith('/sendMessage')) return ack();
      if(failure==='timeout') throw Error('delivery may have happened');
      if(failure==='unreadable') return {ok:true,json:async()=>{throw Error('bad JSON')}};
      if(failure==='missing_id') return {ok:true,json:async()=>({ok:true,result:{}})};
      return {ok:false,status:failure==='rejected'?400:500,json:async()=>({ok:false})};
    });
    assert.equal(result.status,'partial');
    assert.equal(result.photoStatus,'unconfirmed');
    assert.deepEqual(calls.map(c=>c.method),['sendPhoto','sendMessage']);
    assert.equal(calls[1].body.text,'full body');
  });
}
test('unconfirmed text is never automatically retried',async()=>{
  let calls=0;
  const result=await sendTagRunBulletin(env,'full body',async(url)=>{
    calls++;
    if(url.endsWith('/sendPhoto')) return ack();
    throw Error('text may have been delivered');
  });
  assert.equal(result.status,'unconfirmed');
  assert.equal(result.photoStatus,'sent');
  assert.equal(result.textStatus,'unconfirmed');
  assert.equal(calls,2);
});
test('invalid topic IDs are omitted for both requests',async()=>{
  for(const value of ['', '0', '-1', 'bad', '12345678901234']){
    await sendTagRunBulletin({...env,TELEGRAM_GROUP_THREAD_ID:value},'body',async(url,options)=>{
      assert.equal(Object.hasOwn(JSON.parse(options.body),'message_thread_id'),false);
      return ack();
    });
  }
});
test('missing token or group and invalid text make no API requests',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return ack()};
  await sendTagRunBulletin({...env,TELEGRAM_BOT_TOKEN:''},'body',fetchImpl);
  await sendTagRunBulletin({...env,TELEGRAM_GROUP_CHAT_ID:''},'body',fetchImpl);
  await assert.rejects(sendTagRunBulletin(env,'a'.repeat(4097),fetchImpl),/invalid_text/);
  await assert.rejects(sendTagRunBulletin(env,'',fetchImpl),/invalid_text/);
  assert.equal(calls,0);
});
