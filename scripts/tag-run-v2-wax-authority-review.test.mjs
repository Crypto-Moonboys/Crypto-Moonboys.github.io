import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewWaxTransferAuthority,WAX_AUTHORITY_READ_ONLY,WAX_AUTHORITY_PROVIDERS
} from '../workers/moonboys-api/tag-run/v2-wax-authority-review.js';
import { WAX_MAINNET_CHAIN_ID } from '../workers/moonboys-api/tag-run/v2-core.js';
import {parseOnchainReviewArgs} from './tag-run-v2-wax-authority-review.mjs';

const HASH='a'.repeat(64);
const KEY='EOS8i9TNBsg1LYGntvSDKfzVhK3dmXZgkNbRPJ89n9fMMLC8iunGk';
const TARGET={contract:'kingsofgraff',symbol:'LFGK',precision:4,
  expectedCodeHash:HASH};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(changes={}) {
  const links=changes.link===false ? [] :
    [{account:'kingsofgraff',action:'transfer'}];
  const account={
    account_name:'isthatajoint',permissions:[
      {perm_name:'owner',parent:'',
        required_auth:{threshold:1,
          keys:[{key:'OWNER_FIXTURE_KEY',weight:1}],accounts:[],waits:[]},
        linked_actions:[]},
      {perm_name:'active',parent:'owner',
        required_auth:{threshold:1,
          keys:[{key:'ACTIVE_FIXTURE_KEY',weight:1}],accounts:[],waits:[]},
        linked_actions:[]},
      {perm_name:'tagrain',parent:'active',
        required_auth:{threshold:1,
          keys:[{key:KEY,weight:1}],accounts:[],waits:[]},
        linked_actions:links}
    ]
  };
  const info={chain_id:WAX_MAINNET_CHAIN_ID,
    last_irreversible_block_num:123456789};
  const abi={
    account_name:'kingsofgraff',abi:{
      actions:[{name:'transfer',type:'transfer'}],
      structs:[{name:'transfer',base:'',fields:[
        {name:'from',type:'name'},{name:'to',type:'name'},
        {name:'quantity',type:'asset'},{name:'memo',type:'string'}
      ]}]
    }
  };
  const code={account_name:'kingsofgraff',code_hash:HASH};
  const stats={LFGK:{issuer:'kingsofgraff',
    supply:'100000000.0000 LFGK',max_supply:'1000000000.0000 LFGK'}};
  const balances=['1000000.0000 LFGK'];
  const base={
    get_info:info,get_account:account,get_abi:abi,
    get_code_hash:code,get_currency_stats:stats,
    get_currency_balance:balances
  };
  let calls=[];
  const fetchImpl=async(url,opts)=>{
    const parsed=new URL(url);
    if (opts?.method!=='POST' || !url.includes('/v1/chain/') ||
        !WAX_AUTHORITY_PROVIDERS.includes(parsed.origin))
      throw Error('unexpected or non-readonly fetch '+url);
    const method=parsed.pathname.split('/').pop();
    if (!(method in base)) throw Error('non-readonly method '+method);
    const data=JSON.parse(opts.body||'{}');
    if (method==='get_account' && data.account_name!=='isthatajoint')
      throw Error('wrong account argument');
    if ((method==='get_abi'||method==='get_code_hash') &&
        data.account_name!=='kingsofgraff') throw Error('wrong contract argument');
    if (method==='get_currency_stats' &&
        (data.code!=='kingsofgraff'||data.symbol!=='LFGK'))
      throw Error('wrong symbol');
    if (method==='get_currency_balance' &&
        (data.code!=='kingsofgraff'||data.account!=='isthatajoint'||
        data.symbol!=='LFGK')) throw Error('wrong balance');
    calls.push({host:parsed.origin,method});
    if (changes.throwOn === method && parsed.origin === WAX_AUTHORITY_PROVIDERS[1])
      throw Error('simulated outage');
    const reply=clone(base[method]);
    if (typeof changes.mutate==='function')
      changes.mutate(parsed.origin,method,reply);
    return {ok:true,json:async()=>reply};
  };
  return {fetchImpl,calls};
}
const review=(f,args=TARGET)=>reviewWaxTransferAuthority({...args,
  fetchImpl:f.fetchImpl});
const has=(r,x)=>assert.ok(r.reasonCodes.includes(x),
  'missing '+x+': '+JSON.stringify(r.reasonCodes));

test('two independent providers yield review evidence, NEVER payout approval',async()=>{
  const f=fixture();
  const r=await review(f);
  assert.equal(r.status,'MANUAL_REVIEW_REQUIRED');
  assert.equal(WAX_AUTHORITY_READ_ONLY,true);
  assert.equal(r.releaseAuthorized,false);
  assert.equal(r.signerConfigured,false);
  assert.equal(r.transferAttempted,false);
  assert.equal(r.transactionBroadcast,false);
  assert.equal(r.wasmAuthorizationAudited,false);
  assert.equal(r.sharedContractActionRisk,true);
  assert.equal(r.codeHashObserved,HASH);
  assert.equal(r.tokenBalanceUnits,'10000000000');
  assert.equal(f.calls.length,12);
  assert.deepEqual(new Set(f.calls.map(x=>x.host)),
    new Set(WAX_AUTHORITY_PROVIDERS));
  assert.deepEqual(new Set(f.calls.map(x=>x.method)),
    new Set(['get_info','get_account','get_abi','get_code_hash',
      'get_currency_stats','get_currency_balance']));
});
test('missing reviewed code hash pin never clears authorization',async()=>{
  const r=await review(fixture(),{...TARGET,expectedCodeHash:null});
  assert.equal(r.status,'BLOCKED');
  has(r,'independent_wasm_hash_approval_missing');
});
test('missing tagrain action link fails closed',async()=>{
  const r=await review(fixture({link:false}));
  assert.equal(r.status,'BLOCKED');has(r,'tagrain_transfer_action_not_linked');
});
test('wildcard or second action link blocks shared signer scope',async()=>{
  const f=fixture({mutate:(host,method,row)=>{
    if(method==='get_account')
      row.permissions[2].linked_actions.push({account:'eosio.token',action:'transfer'});
  }});
  const r=await review(f);has(r,'tagrain_has_unexpected_action_links');
});
test('unexpected on-chain key and hierarchy both fail closed',async()=>{
  for(const patch of [
    row=>row.permissions[2].required_auth.keys=[{key:'UNEXPECTED',weight:1}],
    row=>row.permissions[2].parent='owner',
    row=>row.permissions[2].required_auth.threshold=2
  ]) {
    const f=fixture({mutate:(host,method,row)=>{
      if(method==='get_account') patch(row);
    }});
    has(await review(f),'tagrain_authority_mismatch');
  }
});
test('different active controller keys between providers reject agreement',async()=>{
  const f=fixture({mutate:(host,method,row)=>{
    if(host===WAX_AUTHORITY_PROVIDERS[1] && method==='get_account')
      row.permissions[1].required_auth.keys[0].key='OTHER_ACTIVE_FIXTURE_KEY';
  }});
  const result=await review(f);
  assert.equal(result.status,'BLOCKED');
  has(result,'independent_provider_state_disagreement');
  assert.equal(result.sameHeadStateObservation,false);
  assert.equal(result.releaseAuthorized,false);
});
test('different owner authorities or delegated weights reject agreement',async()=>{
  for(const mutate of [
    row => { row.permissions[0].required_auth.keys[0].key='OTHER_OWNER_FIXTURE_KEY'; },
    row => { row.permissions[0].required_auth.threshold=2; },
    row => { row.permissions[1].required_auth.accounts.push({
      permission:{actor:'otheractor',permission:'active'},weight:1
    }); },
    row => { row.permissions[0].required_auth.waits.push({wait_sec:3600,weight:1}); },
    row => { row.permissions[1].required_auth.keys[0].weight=2; }
  ]){
    const f=fixture({mutate:(host,method,row)=>{
      if(host===WAX_AUTHORITY_PROVIDERS[1] && method==='get_account')
        mutate(row);
    }});
    const result=await review(f);
    has(result,'independent_provider_state_disagreement');
    assert.equal(result.sameHeadStateObservation,false);
    assert.equal(result.status,'BLOCKED');
  }
});
test('reordered owner authority key/delegation lists compare identically',async()=>{
  const f=fixture({mutate:(host,method,row)=>{
    if(method!=='get_account')return;
    const active=row.permissions[1].required_auth;
    active.keys.push({key:'SECOND_ACTIVE_FIXTURE_KEY',weight:1});
    active.accounts.push(
      {permission:{actor:'anotheracct1',permission:'active'},weight:1},
      {permission:{actor:'anotheracct2',permission:'owner'},weight:2});
    if(host===WAX_AUTHORITY_PROVIDERS[1]){
      active.keys.reverse();
      active.accounts.reverse();
    }
  }});
  const result=await review(f);
  assert.equal(result.status,'MANUAL_REVIEW_REQUIRED');
  assert.equal(result.sameHeadStateObservation,true);
  assert.equal(result.releaseAuthorized,false);
});
test('missing or malformed parent authority data fails closed',async()=>{
  for(const mutate of [
    row => { row.permissions[0].required_auth={}; },
    row => { delete row.permissions[1].linked_actions; },
    row => { row.permissions[0].required_auth.keys[0].weight=0; },
    row => { row.permissions[1].required_auth.accounts=[{permission:{actor:'x'},weight:1}]; }
  ]){
    const f=fixture({mutate:(host,method,row)=>{
      if(host===WAX_AUTHORITY_PROVIDERS[1] && method==='get_account')
        mutate(row);
    }});
    const result=await review(f);
    assert.equal(result.status,'BLOCKED');
    has(result,'independent_wax_rpc_evidence_unavailable');
  }
});

test('contract hash disagreement and unapproved deployed WASM block',async()=>{
  let f=fixture({mutate:(host,method,row)=>{
    if(host===WAX_AUTHORITY_PROVIDERS[1] && method==='get_code_hash')
      row.code_hash='b'.repeat(64);
  }});
  has(await review(f),'independent_provider_state_disagreement');
  has(await review(f),'contract_wasm_hash_not_approved');
  f=fixture();
  has(await review(f,{...TARGET,expectedCodeHash:'b'.repeat(64)}),
    'contract_wasm_hash_not_approved');
});
test('nonstandard transfer ABI rejected even when both nodes agree',async()=>{
  const f=fixture({mutate:(host,method,row)=>{
    if(method==='get_abi') row.abi.structs[0].fields[2].type='uint64';
  }});
  has(await review(f),'nonstandard_token_transfer_abi');
});
test('currency precision mismatch causes fail-closed evidence error',async()=>{
  const f=fixture({mutate:(host,method,row)=>{
    if(method==='get_currency_balance') row[0]='100.000 LFGK';
  }});
  const r=await review(f);
  assert.equal(r.status,'BLOCKED');
  has(r,'independent_wax_rpc_evidence_unavailable');
});
test('wrong mainnet chain and provider outage cannot be treated as success',async()=>{
  let f=fixture({mutate:(host,method,row)=>{
    if(method==='get_info' && host===WAX_AUTHORITY_PROVIDERS[1])
      row.chain_id='0'.repeat(64);
  }});
  has(await review(f),'independent_wax_rpc_evidence_unavailable');
  f=fixture({throwOn:'get_account'});
  has(await review(f),'independent_wax_rpc_evidence_unavailable');
});
test('balance disagreement and empty balance are both blocked',async()=>{
  let f=fixture({mutate:(host,method,row)=>{
    if(method==='get_currency_balance' &&
        host===WAX_AUTHORITY_PROVIDERS[1]) row[0]='1.0000 LFGK';
  }});
  has(await review(f),'independent_provider_state_disagreement');
  f=fixture({mutate:(host,method,row)=>{
    if(method==='get_currency_balance') row.splice(0);
  }});
  has(await review(f),'treasury_token_balance_empty');
});
test('input restrictions block malformed code hashes and tokens',async()=>{
  await assert.rejects(()=>review(fixture(),{
    ...TARGET,expectedCodeHash:'not-a-hash'
  }),/invalid_expected_code_hash/);
  await assert.rejects(()=>review(fixture(),{
    ...TARGET,precision:9
  }),/invalid_precision|invalid_token_identity/);
});

test('CLI rejects missing identity and does not infer audited WASM hash',()=>{
  assert.equal(parseOnchainReviewArgs(['--help']).help,true);
  assert.deepEqual(parseOnchainReviewArgs([
    '--contract','kingsofgraff','--symbol','LFGK','--precision','4'
  ]),{
    contract:'kingsofgraff',symbol:'LFGK',precision:4,expectedCodeHash:null
  });
  assert.throws(()=>parseOnchainReviewArgs([
    '--contract','kingsofgraff','--symbol','LFGK'
  ]),/exact_token_identity_required/);
  assert.throws(()=>parseOnchainReviewArgs([
    '--contract','kingsofgraff','--symbol','LFGK','--precision','4',
    '--live','true'
  ]),/unexpected_arguments/);
});

test('provider transport failures expose endpoint and provider only',async()=>{
  const f=fixture({throwOn:'get_account'});
  const r=await review(f);
  assert.equal(r.status,'BLOCKED');
  assert.deepEqual(r.diagnostics,[{
    provider:WAX_AUTHORITY_PROVIDERS[1],
    stage:'get_account',
    code:'rpc_transport_failure'
  }]);
  assert.equal(r.releaseAuthorized,false);
  assert.equal(r.transactionBroadcast,false);
});
test('invalid token stats identify endpoint without leaking raw RPC response',async()=>{
  const f=fixture({mutate:(host,method,row)=>{
    if(host===WAX_AUTHORITY_PROVIDERS[1] && method==='get_currency_stats')
      row.LFGK.supply='not a quantity';
  }});
  const r=await review(f);
  assert.deepEqual(r.diagnostics,[{
    provider:WAX_AUTHORITY_PROVIDERS[1],
    stage:'get_currency_stats',
    code:'token_precision_mismatch'
  }]);
  assert.equal(r.status,'BLOCKED');
});
test('malformed permission data identifies get_account stage',async()=>{
  const f=fixture({mutate:(host,method,row)=>{
    if(host===WAX_AUTHORITY_PROVIDERS[0] && method==='get_account')
      delete row.permissions[1].required_auth.keys;
  }});
  const r=await review(f);
  assert.deepEqual(r.diagnostics,[{
    provider:WAX_AUTHORITY_PROVIDERS[0],
    stage:'get_account',
    code:'permission_data_incomplete'
  }]);
});
test('independent provider failures are both reported in fixed order',async()=>{
  const f=fixture({mutate:(host,method,row)=>{
    if(method==='get_code_hash') delete row.code_hash;
  }});
  const r=await review(f);
  assert.equal(r.diagnostics.length,2);
  assert.deepEqual(r.diagnostics.map(x=>x.provider),WAX_AUTHORITY_PROVIDERS);
  assert.ok(r.diagnostics.every(x=>
    x.stage==='get_code_hash' && x.code==='contract_code_hash_invalid'));
});
test('untrusted RPC exception text is never included in diagnostics',async()=>{
  const f=fixture();
  const result=await reviewWaxTransferAuthority({...TARGET,
    fetchImpl:async(url,opts)=>{
      if(url.endsWith('/get_abi'))throw Error('SECRET_PRIVATE_KEY_DO_NOT_PRINT');
      return f.fetchImpl(url,opts);
    }
  });
  assert.equal(result.status,'BLOCKED');
  assert.equal(JSON.stringify(result).includes('SECRET_PRIVATE_KEY'),false);
  assert.ok(result.diagnostics.every(x=>x.code==='rpc_transport_failure'));
});
