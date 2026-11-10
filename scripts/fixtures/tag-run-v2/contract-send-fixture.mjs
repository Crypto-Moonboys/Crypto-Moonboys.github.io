// TEST ONLY. Neither these hashes nor the reviewer are production approvals.
import { createHash } from 'node:crypto';
import { assetKey, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID } from '../../../workers/moonboys-api/tag-run/v2-core.js';
export const CODE = 'b'.repeat(64);
export const ABI_BYTES = Buffer.from('fixture ABI, not a deployed contract');
export const ABI = createHash('sha256').update(ABI_BYTES).digest('hex');
export const debitAuthority = () => ({
  outstanding_bundle_units_json:'["100"]',amount_units:'100',committed_units:'100',daily_limit_units:'1000',
  per_transfer_limit_units:'500',reward_policy_bps:100,cap_reward_policy_bps:100,
  onchain_units:'100000',allocated_unpaid_units:'0',excluded_units:'0',
  spendable_units:'100000',daily_reward_units:'1000'
});
export const contractPolicy = () => ({schemaVersion:1,approvals:[{
  assetKey:assetKey('kingsofgraff','LFGK',4),codeHash:CODE,abiHash:ABI,
  adapter:'kingsofgraff-config-v1',configState:'absent',
  auditReviewer:'fixture independent reviewer',auditReference:'fixture-only audit',
  validUntil:'2099-01-01T00:00:00.000Z'
}]});
export function contractRpc(state = {}) {
  return async (url, options = {}) => {
    const parsed = new URL(url), method = parsed.pathname.split('/').at(-1);
    if (!['wax.greymass.com','wax.eosphere.io'].includes(parsed.host))
      throw Error('unexpected fixture host');
    const body = JSON.parse(options.body || '{}');
    state.calls?.push({host:parsed.host,method,body});
    let result;
    if (method === 'get_info') result = {chain_id:WAX_MAINNET_CHAIN_ID,last_irreversible_block_num:100};
    else if (method === 'get_account') result = {account_name:TIP_ACCOUNT,permissions:[
      ...['owner','active'].map(name=>({perm_name:name,parent:name==='owner'?'':'owner',
        required_auth:{threshold:1,keys:[{key:'fixture_public_'+name,weight:1}],accounts:[],waits:[]},linked_actions:[]})),
      {
      perm_name:'tagrain',parent:'active',required_auth:{threshold:1,
        keys:[{key:'EOS8i9TNBsg1LYGntvSDKfzVhK3dmXZgkNbRPJ89n9fMMLC8iunGk',weight:1}],accounts:[],waits:[]},
      linked_actions:state.links || [{account:'kingsofgraff',action:'transfer'}]
    }]};
    else if (method === 'get_code_hash') result = {account_name:body.account_name,code_hash:state.codeHash || CODE};
    else if (method === 'get_raw_abi') result = {account_name:body.account_name,code_hash:state.codeHash || CODE,
      abi_hash:state.abiHash || ABI,abi:ABI_BYTES.toString('base64')};
    else if (method === 'get_table_rows') result = {rows:state.configHex ? [state.configHex] : [],more:false,next_key:''};
    else if (method === 'get_currency_balance') result = [state.balance || '1000000.0000 LFGK'];
    else throw Error('unexpected fixture endpoint: ' + method);
    if (state.override) result = await state.override({host:parsed.host,method,body,result});
    return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  };
}
