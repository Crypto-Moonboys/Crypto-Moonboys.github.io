// Public WAX reads only. No keys, transactions, price oracle or D1 writes.
import { WAX_MAINNET_CHAIN_ID } from '../workers/moonboys-api/tag-run/v2-core.js';
import { WAX_AUTHORITY_PROVIDERS } from '../workers/moonboys-api/tag-run/v2-wax-authority-review.js';
const fail=()=>{throw Error('v2_draw_independent_wax_entropy_unavailable');};
async function read(fetchImpl,host,method,body){
  let reader;
  try{
    const response=await fetchImpl(host+'/v1/chain/'+method,{method:'POST',redirect:'error',
      signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response?.ok||!response.body?.getReader)fail();
    reader=response.body.getReader();const chunks=[];let bytes=0;
    for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>524288){await reader.cancel();fail();}chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{fail();}finally{reader?.releaseLock();}
}
async function info(fetchImpl,host){
  const row=await read(fetchImpl,host,'get_info',{});
  if(row?.chain_id!==WAX_MAINNET_CHAIN_ID||!Number.isSafeInteger(row.head_block_num)||row.head_block_num<1||
    !Number.isSafeInteger(row.last_irreversible_block_num)||row.last_irreversible_block_num<1||
    row.last_irreversible_block_num>row.head_block_num||typeof row.head_block_time!=='string')fail();
  const time=Date.parse(row.head_block_time.endsWith('Z')?row.head_block_time:row.head_block_time+'Z');
  if(!Number.isFinite(time)||Math.abs(Date.now()-time)>15000)fail();
  return row;
}
export async function chooseFutureWaxBlock({fetchImpl=fetch}={}){
  const started=Date.now();
  const states=await Promise.all(WAX_AUTHORITY_PROVIDERS.map(host=>info(fetchImpl,host)));
  if(Date.now()-started>8000)fail();
  const head=Math.max(...states.map(s=>s.head_block_num));
  if(head>4294967175)fail();
  return {head,block:head+120,notAfter:Math.floor(started/1000)+10};
}
export async function readIrreversibleWaxBlock(block,{fetchImpl=fetch}={}){
  if(!Number.isSafeInteger(block)||block<1||block>4294967295)fail();
  const rows=await Promise.all(WAX_AUTHORITY_PROVIDERS.map(async host=>{
    const state=await info(fetchImpl,host);
    if(state.last_irreversible_block_num<block)fail();
    const row=await read(fetchImpl,host,'get_block',{block_num_or_id:block});
    if(row?.block_num!==block||typeof row.id!=='string'||!/^[a-f0-9]{64}$/.test(row.id)||parseInt(row.id.slice(0,8),16)!==block)fail();
    return row.id;
  }));
  if(rows[0]!==rows[1])fail();
  return {block,id:rows[0],irreversible:true};
}
