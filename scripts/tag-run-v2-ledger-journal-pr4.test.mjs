import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { assetKey, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, sha256Text } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { webcrypto } from 'node:crypto';
import { simulateV2PayoutLifecycle } from
  '../workers/moonboys-api/tag-run/v2-ledger-lifecycle-rehearsal.js';

const ASSET=assetKey('kingsofgraff','LFGK',4),
  DAY='2026-11-02',CHAT='-1001234567890',
  FIRST='a'.repeat(64),SECOND='b'.repeat(64),
  BLOCK='c'.repeat(64),TX='d'.repeat(64),DEST='e'.repeat(64);
const entry=(id,index)=>[
  id,CHAT,DAY,ASSET,index,'1111','current','gkniftyheads',
  DEST,'100',BLOCK,BLOCK
];
function setup(t){
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA recursive_triggers=OFF');
  assert.equal(db.prepare('PRAGMA recursive_triggers').get().recursive_triggers,0);
  for(const file of [
    '../workers/moonboys-api/migrations/104_tag_run_v2_community_token_pot.sql',
    './fixtures/tag-run-v2-accounting-rehearsal.sql',
    './fixtures/tag-run-v2-ledger-lifecycle-rehearsal.sql'
  ]) db.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
  db.prepare('INSERT INTO tag_run_v2_assets '+
    '(asset_key,chain_id,token_contract,token_symbol,token_precision) '+
    'VALUES (?,?,?,?,?)').run(ASSET,WAX_MAINNET_CHAIN_ID,'kingsofgraff','LFGK',4);
  const insert=db.prepare('INSERT INTO tag_run_v2_payout_intents_rehearsal '+
    '(intent_key,chat_id,day_key,asset_key,bundle_index,telegram_id,'+
    'ticket_class,destination_account,destination_digest,amount_units,snapshot_digest,'+
    'source_receipts_digest) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run(...entry(FIRST,0));
  insert.run(...entry(SECOND,1));
  return db;
}
// Compute append_seq within the same SQLite INSERT that writes the event.
// Never infer replay order from event ID or the second-resolution timestamp.
const insertSql='INSERT INTO tag_run_v2_lifecycle_events_rehearsal '+
  '(append_seq,event_id,intent_key,event_kind,amount_units,destination_account,'+
  'chain_tx_id,chain_action_sequence,chain_block_id,chain_block_num,'+
  'evidence_digest) '+
  'VALUES ((SELECT COALESCE(MAX(append_seq),0)+1 FROM '+
  'tag_run_v2_lifecycle_events_rehearsal),?,?,?,?,?,?,?,?,?,?)';
const add=(db,id,intent,type,amount='100',account='gkniftyheads',
  tx=null,sequence=null,evidence=null,blockId=null,blockNum=null)=>
  db.prepare(insertSql).run(id,intent,type,amount,account,
    tx,sequence,blockId,blockNum,evidence);

test('offline SQL cannot enter the production D1 migration runner',()=>{
  assert(!existsSync(new URL(
    '../workers/moonboys-api/migrations/106_tag_run_v2_lifecycle.sql',
    import.meta.url)));
  assert(existsSync(new URL('./fixtures/tag-run-v2-ledger-lifecycle-rehearsal.sql',
    import.meta.url)));
  const wrangler=readFileSync(
    new URL('../workers/moonboys-api/wrangler.toml',import.meta.url),'utf8');
  assert.match(wrangler,/migrations_dir = "migrations"/);
});

test('SQLite rehearsal journal accepts only immutable simulated events',t=>{
  const db=setup(t);
  add(db,'1'.repeat(64),FIRST,'simulate_hold');
  add(db,'2'.repeat(64),FIRST,'simulate_unknown');
  add(db,'3'.repeat(64),FIRST,'simulate_reconcile',
    '100','gkniftyheads',TX,'12345',BLOCK,BLOCK,1234567);
  const rows=db.prepare('SELECT event_kind,status FROM '+
    'tag_run_v2_lifecycle_events_rehearsal ORDER BY event_id').all();
  assert.deepEqual(rows.map(x=>x.event_kind),[
    'simulate_hold','simulate_unknown','simulate_reconcile'
  ]);
  assert(rows.every(x=>x.status==='simulation_only'));
  assert.throws(()=>db.prepare('UPDATE tag_run_v2_lifecycle_events_rehearsal '+
    "SET status='paid'").run(),/immutable_lifecycle_event/);
  assert.throws(()=>db.prepare(
    'DELETE FROM tag_run_v2_lifecycle_events_rehearsal').run(),
    /immutable_lifecycle_event/);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('primary key, alternate unique event and REPLACE cannot overwrite history',t=>{
  const db=setup(t);
  add(db,FIRST,FIRST,'simulate_hold');
  const replace=db.prepare(insertSql.replace('INSERT INTO','INSERT OR REPLACE INTO'));
  assert.throws(()=>replace.run(FIRST,FIRST,'simulate_cancel',
    '100','gkniftyheads',null,null,null),/immutable_lifecycle_event/);
  assert.throws(()=>replace.run('4'.repeat(64),FIRST,'simulate_hold',
    '100','gkniftyheads',null,null,null),/immutable_lifecycle_event/);
  assert.equal(db.prepare('SELECT event_kind FROM tag_run_v2_lifecycle_events_rehearsal '+
    'WHERE event_id=?').get(FIRST).event_kind,'simulate_hold');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_lifecycle_events_rehearsal')
    .get().n,1);
});

test('implicit SQLite rowid cannot replace an immutable event',t=>{
  const db=setup(t);
  add(db,'1'.repeat(64),FIRST,'simulate_hold');
  assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name='tag_run_v2_lifecycle_events_rehearsal'")
    .get().sql.includes('WITHOUT ROWID'),true);
  assert.throws(()=>db.prepare('SELECT rowid FROM tag_run_v2_lifecycle_events_rehearsal').all(),
    /no such column: rowid/);
  assert.throws(()=>db.prepare('INSERT OR REPLACE INTO tag_run_v2_lifecycle_events_rehearsal '+
    '(rowid,event_id,intent_key,event_kind,amount_units,destination_account) '+
    'VALUES (1,?,?,?,?,?)').run('2'.repeat(64),FIRST,'simulate_cancel','100','gkniftyheads'),
    /no column named rowid/);
  assert.equal(db.prepare('SELECT event_kind FROM tag_run_v2_lifecycle_events_rehearsal')
    .get().event_kind,'simulate_hold');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_lifecycle_events_rehearsal').get().n,1);
});

test('append order blocks forged sequence reuse, gaps and replacement',t=>{
  const db=setup(t);
  add(db,'f'.repeat(64),FIRST,'simulate_hold');
  const explicit=db.prepare('INSERT OR REPLACE INTO tag_run_v2_lifecycle_events_rehearsal '+
    '(append_seq,event_id,intent_key,event_kind,amount_units,destination_account) '+
    'VALUES (?,?,?,?,?,?)');
  assert.throws(()=>explicit.run(1,'e'.repeat(64),FIRST,
    'simulate_cancel','100','gkniftyheads'),
    /immutable_lifecycle_event|invalid_lifecycle_append_sequence/);
  assert.throws(()=>explicit.run(3,'e'.repeat(64),FIRST,
    'simulate_cancel','100','gkniftyheads'),
    /invalid_lifecycle_append_sequence/);
  assert.throws(()=>explicit.run(0,'e'.repeat(64),FIRST,
    'simulate_cancel','100','gkniftyheads'),
    /invalid_lifecycle_append_sequence|CHECK/);
  assert.throws(()=>db.prepare('UPDATE tag_run_v2_lifecycle_events_rehearsal '+
    'SET append_seq=100').run(),/immutable_lifecycle_event/);
  const remaining=db.prepare('SELECT append_seq,event_id FROM '+
    'tag_run_v2_lifecycle_events_rehearsal').all().map(row=>({
      append_seq:row.append_seq,event_id:row.event_id
    }));
  assert.deepEqual(remaining,[{append_seq:1,event_id:'f'.repeat(64)}]);
});

test('same-second nonchronological IDs replay hold-cancel-hold by append sequence',async t=>{
  const db=setup(t),account='gkniftyheads';
  const destinationDigest=await sha256Text(['1111',account,DAY].join('|'),webcrypto);
  const makeIntent=async index=>{
    const intentKey=await sha256Text([
      CHAT,DAY,ASSET,index,'1111','current','100',account,
      destinationDigest,BLOCK,BLOCK
    ].join('|'),webcrypto);
    return {
      intent_key:intentKey,chat_id:CHAT,day_key:DAY,asset_key:ASSET,
      bundle_index:index,telegram_id:'1111',ticket_class:'current',
      destination_account:account,destination_digest:destinationDigest,
      amount_units:'100',snapshot_digest:BLOCK,source_receipts_digest:BLOCK,
      status:'simulation_only'
    };
  };
  const [a,b]=await Promise.all([makeIntent(2),makeIntent(3)]);
  const insertIntent=db.prepare('INSERT INTO tag_run_v2_payout_intents_rehearsal '+
    '(intent_key,chat_id,day_key,asset_key,bundle_index,telegram_id,'+
    'ticket_class,destination_account,destination_digest,amount_units,'+
    'snapshot_digest,source_receipts_digest) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const i of [a,b]){
    insertIntent.run(i.intent_key,i.chat_id,i.day_key,i.asset_key,
      i.bundle_index,i.telegram_id,i.ticket_class,i.destination_account,
      i.destination_digest,i.amount_units,i.snapshot_digest,
      i.source_receipts_digest);
  }
  // Set the exact same timestamp for all events, so only the monotonic
  // append sequence preserves the actual accepted operation order.
  const append=db.prepare('INSERT INTO tag_run_v2_lifecycle_events_rehearsal '+
    '(append_seq,event_id,intent_key,event_kind,amount_units,'+
    'destination_account,created_at) VALUES ('+
    '(SELECT COALESCE(MAX(append_seq),0)+1 FROM '+
    'tag_run_v2_lifecycle_events_rehearsal),?,?,?,?,?,?)');
  const stamp='2026-11-03 08:00:00';
  append.run('f'.repeat(64),a.intent_key,'simulate_hold','100',account,stamp);
  append.run('1'.repeat(64),a.intent_key,'simulate_cancel','100',account,stamp);
  append.run('9'.repeat(64),b.intent_key,'simulate_hold','100',account,stamp);
  const read=order=>db.prepare(
    'SELECT append_seq,event_id,intent_key,event_kind,created_at FROM '+
    'tag_run_v2_lifecycle_events_rehearsal ORDER BY '+order
  ).all();
  const chronological=read('append_seq ASC');
  assert.deepEqual(chronological.map(x=>x.append_seq),[1,2,3]);
  assert.deepEqual(chronological.map(x=>x.event_kind),[
    'simulate_hold','simulate_cancel','simulate_hold'
  ]);
  assert.equal(new Set(chronological.map(x=>x.created_at)).size,1,
    'all events are tied at one SQLite timestamp');
  const misordered=read('created_at ASC,event_id ASC');
  assert.notDeepEqual(misordered.map(x=>x.event_id),
    chronological.map(x=>x.event_id),
    'event IDs are intentionally nonchronological');
  const asHistory=rows=>rows.map(x=>({
    appendSeq:x.append_seq,eventId:x.event_id,
    intentKey:x.intent_key,action:x.event_kind
  }));
  const rehearsal={
    status:'simulation_only',executable:false,transferAttempted:false,
    reservable:false,funded:false,reviewed:false,wallet:TIP_ACCOUNT,
    day:DAY,intents:[a,b]
  };
  const opts={rehearsal,limits:[{assetKey:ASSET,dayKey:DAY,
    dailyLimitUnits:'100',maxTransferUnits:'100'}],paused:true,
    cryptoImpl:webcrypto};
  const valid=await simulateV2PayoutLifecycle({
    ...opts,historicalEvents:asHistory(chronological)
  });
  assert.equal(valid.entries.find(x=>x.intentKey===a.intent_key).state,
    'simulation_cancelled');
  assert.equal(valid.entries.find(x=>x.intentKey===b.intent_key).state,
    'simulation_held');
  assert.equal(valid.caps[0].simulatedHeldUnits,'100');
  assert.equal(valid.caps[0].simulatedReleasedUnits,'100');
  assert.equal(valid.caps[0].actualTransferredUnits,'0');
  await assert.rejects(simulateV2PayoutLifecycle({
    ...opts,historicalEvents:asHistory(misordered)
  }),/ledger_rehearsal_historical_append_order_invalid/);
});

test('frozen destination and amount cannot be rewritten by another event',t=>{
  const db=setup(t);
  assert.throws(()=>add(db,'1'.repeat(64),FIRST,
    'simulate_hold','100','otherwax'),/rehearsal_lifecycle_intent_mismatch/);
  assert.throws(()=>add(db,'2'.repeat(64),FIRST,
    'simulate_hold','101','gkniftyheads'),/rehearsal_lifecycle_intent_mismatch/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_lifecycle_events_rehearsal')
    .get().n,0);
});

test('two intents cannot reuse the same purported chain action with REPLACE',t=>{
  const db=setup(t);
  add(db,'1'.repeat(64),FIRST,'simulate_reconcile','100',
    'gkniftyheads',TX,'12345',BLOCK,BLOCK,1234567);
  assert.throws(()=>add(db,'2'.repeat(64),SECOND,'simulate_reconcile','100',
    'gkniftyheads',TX,'12345',BLOCK,BLOCK,1234567),/immutable_lifecycle_event/);
  const replace=db.prepare(insertSql.replace('INSERT INTO','INSERT OR REPLACE INTO'));
  assert.throws(()=>replace.run('3'.repeat(64),SECOND,'simulate_reconcile',
    '100','gkniftyheads',TX,'12345',BLOCK,1234567,BLOCK),/immutable_lifecycle_event/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_lifecycle_events_rehearsal')
    .get().n,1);
});

test('NULL evidence, invalid sequences and a paid status are forbidden',t=>{
  const db=setup(t);
  for(const bad of [null,'0','01','1a','9'.repeat(26)]){
    assert.throws(()=>add(db,'1'.repeat(64),FIRST,'simulate_reconcile','100',
      'gkniftyheads',TX,bad,BLOCK,BLOCK,1234567),/CHECK|NOT NULL/);
  }
  for(const [blockId,blockNum] of [
    [null,1234567],[BLOCK,null],['bad',1234567],
    [BLOCK,0],[BLOCK,-1],[BLOCK,1.5],
    [BLOCK,'not-a-number'],[BLOCK,9007199254740992]
  ]){
    assert.throws(()=>add(db,'1'.repeat(64),FIRST,'simulate_reconcile','100',
      'gkniftyheads',TX,'12345',BLOCK,blockId,blockNum),/CHECK|NOT NULL/);
  }
  assert.throws(()=>add(db,'1'.repeat(64),FIRST,'simulate_hold','100',
    'gkniftyheads',null,null,null,BLOCK,1234567),/CHECK/);
  const invalid=db.prepare('INSERT INTO tag_run_v2_lifecycle_events_rehearsal '+
    '(append_seq,event_id,intent_key,event_kind,amount_units,destination_account,status) '+
    'VALUES ((SELECT COALESCE(MAX(append_seq),0)+1 FROM '+
    'tag_run_v2_lifecycle_events_rehearsal),?,?,?,?,?,?)');
  assert.throws(()=>invalid.run('2'.repeat(64),FIRST,
    'simulate_hold','100','gkniftyheads','paid'),/CHECK/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_lifecycle_events_rehearsal')
    .get().n,0);
});