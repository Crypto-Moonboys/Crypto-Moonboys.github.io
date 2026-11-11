#!/usr/bin/env node
// Explicit owner-operated D1 draw administration. No transfer/signing imports.
import { readFile,writeFile,realpath } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve,dirname,relative,isAbsolute } from 'node:path';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { makeD1RestAdapter,confirmExactly } from './tag-run-v2-owner-payout.mjs';
import { commitDraw,revealDraw,reviewDraw,rejectDraw,inspectPersistedDraw } from './tag-run-v2-draw-workflow.mjs';
import { chooseFutureWaxBlock,readIrreversibleWaxBlock } from './tag-run-v2-draw-entropy.mjs';
import { sha256Text,TIP_ACCOUNT,validUtcDay } from '../workers/moonboys-api/tag-run/v2-core.js';
const DB='8a36e17a-18fa-4b98-90e1-3f269164b166';
const FLAGS={TAG_RUN_ENABLED:'true',TAG_RUN_WEEKLY_REWARDS_ENABLED:'false',TAG_RUN_V2_TIP_ACCOUNT:TIP_ACCOUNT,
  TAG_RUN_V2_POOL_ENABLED:'true',TAG_RUN_V2_DRAWS_ENABLED:'true',TAG_RUN_V2_OBSERVATION_ENABLED:'false',
  TAG_RUN_V2_DRAW_REVIEW_RELEASE_APPROVED:'true'};
const fail=reason=>{throw Error('tag_run_draw_operator_'+reason);};
export function parseDrawCommand(argv){
  const [command,...rest]=argv;
  if(!['commit','reveal','review','reject','verify'].includes(command))fail('unknown_command');
  const options={};
  for(let i=0;i<rest.length;i++){
    const name=rest[i];if(!['--day','--seed-file','--reviewer','--inputs-digest','--reason','--live'].includes(name)||name in options)fail('invalid_option');
    if(name==='--live')options[name]=true;
    else {const value=rest[++i];if(!value||value.startsWith('--'))fail('missing_value');options[name]=value;}
  }
  if(!validUtcDay(options['--day']))fail('day_required');
  if(command!=='verify'&&options['--live']!==true)fail('explicit_live_required');
  return {command,options};
}
export function validateDrawSettings(settings){
  if(!Array.isArray(settings?.bindings))fail('settings_unavailable');
  const map=new Map();for(const row of settings.bindings){if(map.has(row.name))fail('duplicate_binding');map.set(row.name,row);}
  const db=map.get('DB');if(db?.type!=='d1'||(db.database_id??db.id)!==DB||
    (db.database_id&&db.id&&db.database_id!==db.id))fail('wrong_database');
  for(const [name,value] of Object.entries(FLAGS))if(map.get(name)?.type!=='plain_text'||map.get(name).text!==value)fail('release_not_approved');
  return {...FLAGS};
}
export async function loadPrivateDrawSeed(file,chatId,day,create){
  if(typeof file!=='string'||!file)fail('private_seed_file_required');
  const parent=await realpath(dirname(resolve(file))),project=await realpath(fileURLToPath(new URL('../',import.meta.url)));
  const within=relative(project,parent);if(!within||(!within.startsWith('..')&&!isAbsolute(within)))fail('seed_must_be_outside_repository');
  const target=resolve(parent,resolve(file).split(/[\\/]/).at(-1));
  let content;
  try{const real=await realpath(target),loc=relative(project,real);if(!loc||(!loc.startsWith('..')&&!isAbsolute(loc)))fail('seed_must_be_outside_repository');content=await readFile(real,'utf8');}
  catch(error){
    if(error.code!=='ENOENT'||!create)throw error;
    content=JSON.stringify({chatId,day,seedHex:randomBytes(32).toString('hex')});
    await writeFile(target,content+'\n',{flag:'wx',mode:0o600});
  }
  if(content.length>4096)fail('invalid_seed_file');
  const row=JSON.parse(content);
  if(row.chatId!==chatId||row.day!==day||!/^[a-f0-9]{64}$/.test(row.seedHex||''))fail('invalid_seed_file');
  return row.seedHex;
}
export async function runDrawOperator(argv,{vars=process.env,fetchImpl=fetch,confirmation=confirmExactly,
  loadSeed=loadPrivateDrawSeed,log=console.log}={}){
  const {command,options:o}=parseDrawCommand(argv),day=o['--day'];
  const account=vars.CLOUDFLARE_ACCOUNT_ID,token=vars.CLOUDFLARE_API_TOKEN,chatId=vars.TAG_RUN_OPERATOR_GROUP_ID;
  if(!/^[a-f0-9]{32}$/.test(account||'')||typeof token!=='string'||token.length<12||!/^\S+$/.test(token)||!/^\-100[0-9]{5,20}$/.test(chatId||''))fail('operator_credentials_missing');
  const db=makeD1RestAdapter({accountId:account,token,fetchImpl});
  const settings=async()=>{
    let response,payload;try{response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/moonboys-api/settings',
      {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),redirect:'error'});payload=await response.json();}catch{fail('settings_unavailable');}
    if(response?.ok!==true||payload?.success!==true||payload.errors?.length)fail('settings_unavailable');
    return validateDrawSettings(payload.result);
  };
  if(command==='verify'){const result=await inspectPersistedDraw(db,chatId,day);log(JSON.stringify(result));return result;}
  const flags=await settings(),env={...flags,DB:db,TELEGRAM_GROUP_CHAT_ID:chatId};
  await confirmation(command.toUpperCase()+' DRAW '+day+(o['--inputs-digest']?' '+o['--inputs-digest']:''));
  let result;
  if(command==='commit'){
    const seed=await loadSeed(o['--seed-file'],chatId,day,true);
    result=await commitDraw(env,{day,seedCommitment:await sha256Text(seed),committedBy:o['--reviewer'],
      chooseFutureBlock:()=>chooseFutureWaxBlock({fetchImpl}),verifyRelease:settings});
  }else if(command==='reveal'){
    const seed=await loadSeed(o['--seed-file'],chatId,day,false);
    result=await revealDraw(env,{day,seedHex:seed,readIrreversibleBlock:block=>readIrreversibleWaxBlock(block,{fetchImpl}),verifyRelease:settings});
  }else if(command==='review')result=await reviewDraw(env,{day,reviewedBy:o['--reviewer'],expectedInputsDigest:o['--inputs-digest'],verifyRelease:settings});
  else result=await rejectDraw(env,{day,reviewedBy:o['--reviewer'],reason:o['--reason'],verifyRelease:settings});
  log(JSON.stringify(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runDrawOperator(process.argv.slice(2)).catch(()=>{console.error('TAG RUN draw operation blocked or unavailable; inspect the saved day before retrying.');process.exitCode=1;});
