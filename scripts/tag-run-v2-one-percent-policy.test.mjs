import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { eligibleAsset, assetKey, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, DAILY_BPS } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { canonicalSnapshotSetPayload, canonicalLegacySnapshotSetDigest } from
  '../workers/moonboys-api/tag-run/v2-snapshot-commitment.js';

const read = n => readFileSync(new URL('../workers/moonboys-api/migrations/'+n,import.meta.url),'utf8');
const migrations = [
  '103_tag_run_street_cred_rewards.sql',
  '104_tag_run_v2_community_token_pot.sql',
  '105_tag_run_v2_payout_execution.sql',
  '106_tag_run_v2_one_percent_policy.sql'
];
const CHAT='-1001234567890',DAY='2026-11-05',ASSET=assetKey('kingsofgraff','LFGK',4);
const SNAP='a'.repeat(64),BLOCK='b'.repeat(64);
const asset = (balanceUnits='10000') => ({
  contract:'kingsofgraff',symbol:'LFGK',precision:4,
  approved:true,confirmed:true,balanceUnits,reservedUnits:'0',excludedUnits:'0'
});
function setup(t,{oldEvidence=false}={}) {
  const db = new DatabaseSync(':memory:');
  t.after(()=>db.close());
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of migrations.slice(0,3)) db.exec(read(name));
  db.prepare('INSERT INTO tag_run_v2_assets '+
    '(asset_key,chain_id,token_contract,token_symbol,token_precision,eligibility) '+
    "VALUES (?,?,?,?,?,'approved')").run(ASSET,WAX_MAINNET_CHAIN_ID,'kingsofgraff','LFGK',4);
  if(oldEvidence) {
    db.prepare('INSERT INTO tag_run_v2_snapshots '+
      '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
      'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
      'spendable_units,five_percent_units,snapshot_digest,status) '+
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'verified')").run(
      CHAT,DAY,ASSET,TIP_ACCOUNT,101,BLOCK,'10000','0','0','10000','500',SNAP);
    db.prepare('INSERT INTO tag_run_v2_draws '+
      '(chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,snapshots_digest) '+
      "VALUES (?,?, 'reviewed',?,?,?,?)").run(CHAT,DAY,SNAP,SNAP,SNAP,SNAP);
  }
  db.exec(read(migrations[3]));
  return db;
}
test('approved 1% BigInt calculation is independent for every token',()=>{
  assert.equal(DAILY_BPS,100);
  assert.equal(eligibleAsset(asset()).dailyBudgetUnits,'100');
  assert.equal(eligibleAsset(asset('99')).dailyBudgetUnits,'0');
  assert.equal(eligibleAsset({...asset('10000'),reservedUnits:'4000',
    excludedUnits:'1000'}).dailyBudgetUnits,'50');
  assert.equal(eligibleAsset(asset('1000000000000000000000000000000'))
    .dailyBudgetUnits,'10000000000000000000000000000');
  assert.notEqual(assetKey('kingsofgraff','LFGK',4),assetKey('otherissuer','LFGK',4));
});
test('106 migration keeps legacy 5% records byte-identical, tagged v1',t=>{
  const db=setup(t,{oldEvidence:true});
  const cfg=db.prepare('SELECT * FROM tag_run_v2_pool_config').get();
  assert.equal(cfg.daily_bps,500);
  assert.equal(cfg.active_daily_bps,100);
  assert.equal(cfg.active_policy_version,2);
  const old=db.prepare('SELECT * FROM tag_run_v2_snapshots').get();
  assert.equal(old.five_percent_units,'500');
  assert.equal(old.reward_policy_bps,500);
  assert.equal(old.daily_reward_units,'0');
  const draw=db.prepare('SELECT * FROM tag_run_v2_draws').get();
  assert.equal(draw.reward_policy_bps,500);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('1% policy cap must match approved v2 snapshot, not 5% legacy amount',t=>{
  const db=setup(t);
  db.prepare("UPDATE tag_run_v2_pool_config SET status='review_only'").run();
  db.prepare('INSERT INTO tag_run_v2_deposits '+
    '(chain_id,global_action_seq,transaction_id,block_num,block_id,'+
    'sender_account,recipient_account,asset_key,units,memo_digest,status) '+
    "VALUES (?,?,?,?,?,?,?,?,?,?,'confirmed_donation')").run(
    WAX_MAINNET_CHAIN_ID,'11','c'.repeat(64),101,BLOCK,
    'somewallet11',TIP_ACCOUNT,ASSET,'10000',SNAP);
  db.prepare('INSERT INTO tag_run_v2_snapshots '+
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status,'+
    'reward_policy_bps,daily_reward_units) '+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,100,'100')").run(
    CHAT,DAY,ASSET,TIP_ACCOUNT,101,BLOCK,'10000','0','0','10000',
    '0',SNAP,'verified');
  db.prepare('INSERT INTO tag_run_v2_draws '+
    '(chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,'+
    'snapshots_digest,reward_policy_bps) '+
    "VALUES (?,?,'reviewed',?,?,?,?,100)").run(CHAT,DAY,SNAP,SNAP,SNAP,SNAP);
  const cap=db.prepare('INSERT INTO tag_run_v2_payout_caps '+
    '(chat_id,day_key,asset_key,snapshot_digest,daily_limit_units,'+
    'per_transfer_limit_units,authorized_by,reward_policy_bps) '+
    'VALUES (?,?,?,?,?,?,?,?)');
  assert.throws(()=>cap.run(CHAT,DAY,ASSET,SNAP,'500','100','reviewed',100),
    /v2_payout_cap_source_unapproved_or_duplicate/);
  assert.throws(()=>cap.run(CHAT,DAY,ASSET,SNAP,'100','100','reviewed',500),
    /v2_payout_cap_source_unapproved_or_duplicate/);
  // SQL must enforce exact 1% itself, not trust a forged 1% policy label.
  db.prepare("UPDATE tag_run_v2_snapshots SET daily_reward_units='500'").run();
  assert.throws(()=>cap.run(CHAT,DAY,ASSET,SNAP,'500','100','reviewed',100),
    /v2_payout_cap_source_unapproved_or_duplicate/);
  db.prepare("UPDATE tag_run_v2_snapshots SET daily_reward_units='100'").run();
  cap.run(CHAT,DAY,ASSET,SNAP,'100','100','reviewed',100);
  assert.throws(()=>db.prepare(
    'UPDATE tag_run_v2_payout_caps SET reward_policy_bps=500'
  ).run(),/v2_payout_cap_policy_immutable/);
  assert.equal(db.prepare('SELECT daily_limit_units FROM tag_run_v2_payout_caps').get().daily_limit_units,'100');
});
test('legacy 5% snapshot cannot silently become v2 committed budget',async t=>{
  const db=setup(t,{oldEvidence:true});
  const row=db.prepare('SELECT s.*, a.token_contract,a.token_symbol,a.token_precision,'+
    'a.chain_id,a.asset_key FROM tag_run_v2_snapshots s '+
    'JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key').get();
  assert.throws(()=>canonicalSnapshotSetPayload({chatId:CHAT,day:DAY,rows:[row]}),
    /snapshot_policy_version_mismatch/);
  const historical=await canonicalLegacySnapshotSetDigest({chatId:CHAT,day:DAY,rows:[row]},webcrypto);
  assert.match(historical,/^[0-9a-f]{64}$/);
});

test('legacy 5% reviewed evidence cannot be relabelled, replaced or deleted',t=>{
  const db=setup(t,{oldEvidence:true});
  const beforeSnapshot=db.prepare('SELECT * FROM tag_run_v2_snapshots').get();
  const beforeDraw=db.prepare('SELECT * FROM tag_run_v2_draws').get();
  for(const [sql,re] of [
    ["UPDATE tag_run_v2_snapshots SET reward_policy_bps=100,daily_reward_units='100'",/v2_snapshot_policy_immutable/],
    ["UPDATE tag_run_v2_draws SET reward_policy_bps=100",/v2_draw_policy_immutable/],
    ["DELETE FROM tag_run_v2_snapshots",/v2_legacy_snapshot_immutable/],
    ["DELETE FROM tag_run_v2_draws",/v2_legacy_draw_immutable/]
  ]) assert.throws(()=>db.exec(sql),re);
  assert.throws(()=>db.prepare('INSERT OR REPLACE INTO tag_run_v2_snapshots '+
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status,reward_policy_bps,daily_reward_units) '+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,? ,100,'100')").run(
      CHAT,DAY,ASSET,TIP_ACCOUNT,101,BLOCK,
      '10000','0','0','10000','0',SNAP,'verified'),
    /v2_snapshot_policy_replacement_forbidden/);
  assert.throws(()=>db.prepare('INSERT OR REPLACE INTO tag_run_v2_draws '+
    '(chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,'+
    'snapshots_digest,reward_policy_bps) '+
    "VALUES (?,?,'reviewed',?,?,?,?,100)").run(CHAT,DAY,SNAP,SNAP,SNAP,SNAP),
    /v2_draw_policy_replacement_forbidden/);
  assert.deepEqual(db.prepare('SELECT * FROM tag_run_v2_snapshots').get(),beforeSnapshot);
  assert.deepEqual(db.prepare('SELECT * FROM tag_run_v2_draws').get(),beforeDraw);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('legacy rowid conflicts and UPDATE OR REPLACE identity moves are forbidden',t=>{
  const db=setup(t,{oldEvidence:true});
  db.exec('PRAGMA recursive_triggers=OFF');
  assert.equal(db.prepare('PRAGMA recursive_triggers').get().recursive_triggers,0);
  const oldSnapshot=db.prepare('SELECT rowid FROM tag_run_v2_snapshots WHERE day_key=?').get(DAY).rowid;
  const oldDraw=db.prepare('SELECT rowid FROM tag_run_v2_draws WHERE day_key=?').get(DAY).rowid;
  const nextDay='2026-11-06';

  // A different composite key must not bypass the INSERT OR REPLACE guard
  // by explicitly colliding with the legacy rowid.
  assert.throws(()=>db.prepare(
    'INSERT OR REPLACE INTO tag_run_v2_snapshots '+
    '(rowid,chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status,'+
    'reward_policy_bps,daily_reward_units) '+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,100,'100')"
  ).run(oldSnapshot,CHAT,nextDay,ASSET,TIP_ACCOUNT,101,BLOCK,
    '10000','0','0','10000','0',SNAP,'verified'),
    /v2_snapshot_policy_replacement_forbidden/);
  assert.throws(()=>db.prepare(
    'INSERT OR REPLACE INTO tag_run_v2_draws '+
    '(rowid,chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,'+
    'snapshots_digest,reward_policy_bps) '+
    "VALUES (?,? ,?,'reviewed',?,?,?,?,100)"
  ).run(oldDraw,CHAT,nextDay,SNAP,SNAP,SNAP,SNAP),
    /v2_draw_policy_replacement_forbidden/);

  // A legitimate v2 record at another day cannot be moved onto a legacy
  // primary key using UPDATE OR REPLACE, or onto its rowid.
  db.prepare('INSERT INTO tag_run_v2_snapshots '+
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status,'+
    'reward_policy_bps,daily_reward_units) '+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,100,'100')"
  ).run(CHAT,nextDay,ASSET,TIP_ACCOUNT,102,BLOCK,'10000','0','0','10000','0',
    'c'.repeat(64),'verified');
  db.prepare('INSERT INTO tag_run_v2_draws '+
    '(chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,'+
    'snapshots_digest,reward_policy_bps) VALUES (?,?,'+
    "'reviewed',?,?,?,?,100)"
  ).run(CHAT,nextDay,SNAP,SNAP,SNAP,SNAP);

  for(const [table,marker] of [
    ['tag_run_v2_snapshots','v2_snapshot_scope_immutable'],
    ['tag_run_v2_draws','v2_draw_scope_immutable']
  ]) {
    assert.throws(()=>db.prepare(
      'UPDATE OR REPLACE '+table+' SET day_key=? WHERE day_key=?'
    ).run(DAY,nextDay),new RegExp(marker));
    const legacyRowid=table.endsWith('snapshots')?oldSnapshot:oldDraw;
    assert.throws(()=>db.prepare(
      'UPDATE OR REPLACE '+table+' SET rowid=? WHERE day_key=?'
    ).run(legacyRowid,nextDay),new RegExp(marker));
    assert.equal(db.prepare('SELECT reward_policy_bps AS policy FROM '+table+
      ' WHERE day_key=?').get(DAY).policy,500);
    assert.equal(db.prepare('SELECT reward_policy_bps AS policy FROM '+table+
      ' WHERE day_key=?').get(nextDay).policy,100);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,2);
  }
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});
