// Read-only WAX mainnet reconciliation for TAG RUN V2 payout receipts.
// Never count a push_transaction response alone as settlement. This checks
// RPC's last irreversible block and two independent Hyperion indexers.
// Two indexers agreeing is corroboration, NOT cryptographic Merkle inclusion.
import { WAX_CHAIN_API,WAX_HYPERION,WAX_HYPERION_FALLBACKS } from './v2-chain.js';
import { WAX_MAINNET_CHAIN_ID,TIP_ACCOUNT } from './v2-core.js';

const HEX=/^[0-9a-f]{64}$/;
const SEQ=/^[1-9][0-9]{0,24}$/;
const fail=reason=>{throw new Error('payout_chain_'+reason);};
async function post(fetchImpl,method,body){
  let r;
  try {
    r=await fetchImpl(WAX_CHAIN_API+'/v1/chain/'+method,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
  }catch(_){fail(method+'_unavailable');}
  if(r?.ok!==true)fail(method+'_unavailable');
  try {return await r.json();}catch(_){fail(method+'_malformed');}
}
async function get(fetchImpl,url){
  let r;
  try {r=await fetchImpl(url,{method:'GET'});}
  catch(_){fail('history_unavailable');}
  if(r?.ok!==true)fail('history_unavailable');
  try{return await r.json();}catch(_){fail('history_malformed');}
}
function readAction(row,{transactionId,sequence}){
  if(!row||String(row.global_sequence)!==sequence||
     row.trx_id!==transactionId||
     !Number.isSafeInteger(row.block_num)||row.block_num<1||
     row.act?.name!=='transfer'||!row.act?.account ||
     row.act?.data?.from!==TIP_ACCOUNT||
     typeof row.act.data.to!=='string'||
     typeof row.act.data.quantity!=='string'||
     typeof row.act.data.memo!=='string')
    fail('history_action_mismatch');
  return {
    transactionId,sequence,blockNum:row.block_num,
    blockId:row.block_id??null,contract:row.act.account,
    name:row.act.name,from:row.act.data.from,to:row.act.data.to,
    quantity:row.act.data.quantity,memo:row.act.data.memo
  };
}
export async function verifyIrreversibleWaxPayout({
  transactionId,globalSequence,fetchImpl=fetch,
  corroborators=[WAX_HYPERION,WAX_HYPERION_FALLBACKS[0]]
}={}){
  if(!HEX.test(transactionId||'')||
     !SEQ.test(globalSequence||'')||
     !Array.isArray(corroborators)||corroborators.length!==2||
     corroborators[0]===corroborators[1]||
     corroborators.some(h=>![WAX_HYPERION,...WAX_HYPERION_FALLBACKS].includes(h)))
    fail('invalid_chain_proof_input');
  const info=await post(fetchImpl,'get_info',{});
  if(info?.chain_id!==WAX_MAINNET_CHAIN_ID||
     !Number.isSafeInteger(info.last_irreversible_block_num)||
     info.last_irreversible_block_num<=0)fail('wrong_chain_or_lib');
  const params=new URLSearchParams({
    account:TIP_ACCOUNT,global_sequence:globalSequence,
    'act.name':'transfer',sort:'desc',limit:'2',checkLib:'true'
  });
  let agreed=null;
  for(const host of corroborators){
    const history=await get(fetchImpl,host+'/v2/history/get_actions?'+params);
    if(!Array.isArray(history?.actions)||history.actions.length!==1)
      fail('missing_or_ambiguous_action');
    const row=readAction(history.actions[0],{
      transactionId,sequence:globalSequence
    });
    if(!agreed)agreed=row;
    else if(JSON.stringify(agreed)!==JSON.stringify(row))
      fail('provider_disagreement');
  }
  if(agreed.blockNum>info.last_irreversible_block_num)
    fail('not_irreversible');
  const block=await post(fetchImpl,'get_block',{
    block_num_or_id:agreed.blockNum
  });
  if(block?.block_num!==agreed.blockNum ||
     typeof block.id!=='string'||!HEX.test(block.id))
    fail('block_invalid');
  if(agreed.blockId!=null&&agreed.blockId!==block.id)
    fail('block_mismatch');
  if(agreed.blockNum===info.last_irreversible_block_num &&
     typeof info.last_irreversible_block_id==='string' &&
     info.last_irreversible_block_id!==block.id)
    fail('lib_block_mismatch');
  return Object.freeze({
    irreversible:true,chainId:WAX_MAINNET_CHAIN_ID,
    transactionId,globalSequence,
    blockNum:agreed.blockNum,blockId:block.id,
    contract:agreed.contract,name:agreed.name,
    from:agreed.from,to:agreed.to,
    quantity:agreed.quantity,memo:agreed.memo,
    corroborators:2,merkleInclusionProven:false
  });
}


export async function discoverAndVerifyIrreversibleWaxPayout({
  transactionId, fetchImpl = fetch,
  corroborators = [WAX_HYPERION, WAX_HYPERION_FALLBACKS[0]]
} = {}) {
  if (!HEX.test(transactionId || '') ||
      !Array.isArray(corroborators) || corroborators.length !== 2 ||
      corroborators[0] === corroborators[1] ||
      corroborators.some(host =>
        ![WAX_HYPERION, ...WAX_HYPERION_FALLBACKS].includes(host))) {
    fail('invalid_chain_proof_input');
  }
  const params = new URLSearchParams({
    account: TIP_ACCOUNT, trx_id: transactionId,
    'act.name': 'transfer', sort: 'desc', limit: '10', checkLib: 'true'
  });
  let agreedSequence = null;
  for (const host of corroborators) {
    const history = await get(fetchImpl,
      host + '/v2/history/get_actions?' + params.toString());
    if (!Array.isArray(history?.actions)) fail('history_malformed');
    const matches = history.actions.filter(row =>
      row?.trx_id === transactionId &&
      row?.act?.name === 'transfer' &&
      row?.act?.data?.from === TIP_ACCOUNT);
    if (matches.length !== 1) fail('missing_or_ambiguous_action');
    const sequence = String(matches[0].global_sequence ?? '');
    if (!SEQ.test(sequence)) fail('history_action_mismatch');
    if (agreedSequence === null) agreedSequence = sequence;
    else if (agreedSequence !== sequence) fail('provider_disagreement');
  }
  return verifyIrreversibleWaxPayout({
    transactionId, globalSequence: agreedSequence,
    fetchImpl, corroborators
  });
}
