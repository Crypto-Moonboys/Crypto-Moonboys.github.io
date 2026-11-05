#!/usr/bin/env node
// Operator-only, public RPC inspection. NO keys, signer or transactions.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { reviewWaxTransferAuthority } from
  '../workers/moonboys-api/tag-run/v2-wax-authority-review.js';

const error = message => { throw Error('tag_run_wax_readonly_' + message); };
export function parseOnchainReviewArgs(argv) {
  if (argv.length===1 && argv[0]==='--help') return {help:true};
  const values = {};
  const allowed = new Set(['contract','symbol','precision','approved-code-hash']);
  if (argv.length % 2 !== 0) error('missing_argument');
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    if (!key?.startsWith('--') || !allowed.has(key.slice(2)) ||
        !value || value.startsWith('--') || values[key.slice(2)] !== undefined)
      error('unexpected_arguments');
    values[key.slice(2)]=value;
  }
  if (!values.contract || !values.symbol ||
      !/^[0-8]$/.test(values.precision||''))
    error('exact_token_identity_required');
  return {
    contract:values.contract,
    symbol:values.symbol,
    precision:Number(values.precision),
    expectedCodeHash:values['approved-code-hash']??null
  };
}
export async function runOnchainReview(argv,{
  fetchImpl=fetch,print=value=>console.log(value)
}={}) {
  const args=parseOnchainReviewArgs(argv);
  if(args.help){
    print('node scripts/tag-run-v2-wax-authority-review.mjs '+
      '--contract kingsofgraff --symbol LFGK --precision 4 '+
      '[--approved-code-hash <64-hex-audited-deployment-hash>]');
    return {status:'HELP'};
  }
  const result=await reviewWaxTransferAuthority({...args,fetchImpl});
  print(JSON.stringify(result,null,2));
  return result;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runOnchainReview(process.argv.slice(2)).then(result=>{
    // Never return zero from an audit that only reaches manual review.
    process.exitCode=result.status==='HELP'?0:
      result.status==='MANUAL_REVIEW_REQUIRED'?3:2;
  }).catch(()=>{
    // Do not echo potentially sensitive diagnostic URLs or parameters.
    console.error('WAX read-only authority check could not be completed');
    process.exitCode=1;
  });
}
