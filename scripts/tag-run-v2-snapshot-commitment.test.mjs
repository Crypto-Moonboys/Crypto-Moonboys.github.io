import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { canonicalSnapshotSetPayload,canonicalSnapshotSetDigest,SNAPSHOT_COMMITMENT_DOMAIN,canonicalLegacySnapshotSetDigest,canonicalLegacySnapshotSetPayload } from '../workers/moonboys-api/tag-run/v2-snapshot-commitment.js';
import { assetKey,WAX_MAINNET_CHAIN_ID,TIP_ACCOUNT } from '../workers/moonboys-api/tag-run/v2-core.js';
const DAY='2026-11-02',CHAT='-1001234567890';
const base=(contract,symbol,precision,block=100,units='10000')=>({
 asset_key:assetKey(contract,symbol,precision),chain_id:WAX_MAINNET_CHAIN_ID,
 token_contract:contract,token_symbol:symbol,token_precision:precision,
 status:'verified',wallet_account:TIP_ACCOUNT,chain_irreversible_block:block,
 chain_block_id:'b'.repeat(64),snapshot_digest:'a'.repeat(64),
 onchain_units:units,allocated_unpaid_units:'0',excluded_units:'0',
 spendable_units:units,reward_policy_bps:100,
 daily_reward_units:(BigInt(units)*100n/10000n).toString(),
 five_percent_units:(BigInt(units)*500n/10000n).toString()
});
const a=base('kingsofgraff','LFGK',4);
const b=base('wuffi','WUF',4,101,'1000000000000000000000000');
const args=rows=>({chatId:CHAT,day:DAY,rows});
test('canonical multi-token digest stable regardless of D1 result ordering',async()=>{
 const left=await canonicalSnapshotSetDigest(args([a,b]),webcrypto);
 const right=await canonicalSnapshotSetDigest(args([b,a]),webcrypto);
 assert.equal(left,right);
 assert.match(left,/^[0-9a-f]{64}$/);
 assert.ok(canonicalSnapshotSetPayload(args([a,b])).includes(SNAPSHOT_COMMITMENT_DOMAIN));
});
test('changes to any snapshot source or balance invalidate commitment',async()=>{
 const digest=await canonicalSnapshotSetDigest(args([a,b]),webcrypto);
 for(const patch of [
  {snapshot_digest:'c'.repeat(64)},
  {chain_irreversible_block:102},
  {chain_block_id:'d'.repeat(64)},
  {onchain_units:'10001',spendable_units:'10001'},
  {allocated_unpaid_units:'1',spendable_units:'9999',daily_reward_units:'99'},
  {excluded_units:'1',spendable_units:'9999',daily_reward_units:'99'},
 ]) {
  const changed={...a,...patch};
  const next=await canonicalSnapshotSetDigest(args([changed,b]),webcrypto);
  assert.notEqual(next,digest);
 }
});
test('chain, day, chat and wallet are domain bound',async()=>{
 const digest=await canonicalSnapshotSetDigest(args([a,b]),webcrypto);
 assert.notEqual(await canonicalSnapshotSetDigest({...args([a,b]),day:'2026-11-03'},webcrypto),digest);
 assert.notEqual(await canonicalSnapshotSetDigest({...args([a,b]),chatId:'-1001234567891'},webcrypto),digest);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,wallet_account:'otherwallet'},b])),/invalid_snapshot_evidence/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,chain_id:'0'.repeat(64)},b])),/invalid_snapshot_evidence/);
});
test('duplicate, missing, malformed or over-limit snapshots fail closed',()=>{
 assert.throws(()=>canonicalSnapshotSetPayload(args([a,a])),/duplicate/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([])),/invalid_snapshot_set/);
 assert.throws(()=>canonicalSnapshotSetPayload(args(Array(101).fill(a))),/invalid_snapshot_set/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,status:'quarantined'},b])),/invalid_snapshot_evidence/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,asset_key:b.asset_key},b])),/invalid_or_duplicate_snapshot_asset/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,onchain_units:'9000'},b])),/invalid_snapshot_budget/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,onchain_units:'1e100'},b])),/invalid_token_units/);
});
test('one asset canonical digest differs from legacy raw snapshot digest',async()=>{
 assert.notEqual(await canonicalSnapshotSetDigest(args([a]),webcrypto),a.snapshot_digest);
});

test('legacy 5% snapshot retains a different v1 digest and is rejected as new policy',async()=>{
 const historical={...a,reward_policy_bps:500};
 const legacy=await canonicalLegacySnapshotSetDigest(args([historical]),webcrypto);
 assert.match(legacy,/^[0-9a-f]{64}$/);
 assert.ok(canonicalLegacySnapshotSetPayload(args([historical])).includes('tag-run-v2:snapshot-set:v1'));
 assert.throws(()=>canonicalSnapshotSetPayload(args([historical])),/snapshot_policy_version_mismatch/);
 assert.throws(()=>canonicalLegacySnapshotSetPayload(args([a])),/snapshot_policy_version_mismatch/);
 assert.notEqual(legacy,await canonicalSnapshotSetDigest(args([a]),webcrypto));
});
test('v2 1% snapshot rejects forged budgets and missing policy evidence',()=>{
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,reward_policy_bps:500}])),/snapshot_policy_version_mismatch/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,reward_policy_bps:undefined}])),/snapshot_policy_version_mismatch/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,daily_reward_units:'500'}])),/invalid_snapshot_budget/);
 assert.throws(()=>canonicalSnapshotSetPayload(args([{...a,daily_reward_units:'101'}])),/invalid_snapshot_budget/);
});
