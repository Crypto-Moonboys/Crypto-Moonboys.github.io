import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWaxDestination } from '../workers/moonboys-api/tag-run/wallet-destination.js';
import { WAX_MAINNET_CHAIN_ID } from '../workers/moonboys-api/tag-run/v2-core.js';

function rpc({chainId=WAX_MAINNET_CHAIN_ID, account='gkniftyheads', status=200,
  malformed=false, mismatch=false, offline=false}={}) {
  const calls=[];
  async function fetchImpl(url,options) {
    calls.push({url,options});
    if (offline) throw new TypeError('network unavailable');
    if (status!==200) return {ok:false,status};
    if (url.endsWith('/get_info')) {
      return {ok:true,json:async()=>malformed?[]:{chain_id:chainId}};
    }
    if (url.endsWith('/get_account')) {
      const name=JSON.parse(options.body).account_name;
      return {ok:true,json:async()=>({account_name:mismatch?'wrongaccount':name})};
    }
    throw Error('Unexpected endpoint');
  }
  return {fetchImpl,calls};
}

test('member-selected WAX account is checked for existence, not ownership',async()=>{
  const network=rpc();
  const result=await checkWaxDestination('gkniftyheads',network.fetchImpl);
  assert.deepEqual(result,{status:'exists',account:'gkniftyheads',ownershipProven:false});
  assert.equal(network.calls.length,2);
  assert(network.calls.every(x=>x.options.method==='POST'));
  assert(network.calls.every(x=>!x.url.includes('push_transaction')));
});

test('bad account syntax is rejected with no RPC calls',async()=>{
  const network=rpc();
  assert.deepEqual(await checkWaxDestination('bad..name',network.fetchImpl),{status:'invalid'});
  assert.equal(network.calls.length,0);
});

test('wrong blockchain fails closed',async()=>{
  const network=rpc({chainId:'wrong-chain'});
  await assert.rejects(checkWaxDestination('gkniftyheads',network.fetchImpl),
    /wax_destination_wrong_chain/);
  assert.equal(network.calls.length,1);
});

test('missing or mismatched account proof cannot be accepted',async()=>{
  const network=rpc({mismatch:true});
  await assert.rejects(checkWaxDestination('gkniftyheads',network.fetchImpl),
    /wax_destination_account_mismatch/);
});

test('provider outage, HTTP failure and malformed responses do not verify account',async()=>{
  for(const args of [{offline:true},{status:503},{malformed:true}]) {
    const network=rpc(args);
    await assert.rejects(checkWaxDestination('gkniftyheads',network.fetchImpl),
      /wax_destination_rpc_unavailable/);
  }
});
