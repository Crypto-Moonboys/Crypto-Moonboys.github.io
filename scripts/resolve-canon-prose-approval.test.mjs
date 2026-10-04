import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveCanonProseApproval } from './resolve-canon-prose-approval.mjs';

const repository = 'Crypto-Moonboys/Crypto-Moonboys.github.io';
const sha = 'a'.repeat(40);
const before = 'b'.repeat(40);
const pr = {
  base: { ref: 'main', repo: { full_name: repository } },
  labels: [{name:'canon-prose-change-approved'}],
  state:'closed', merged_at:'2026-10-03T22:00:00Z', merge_commit_sha:sha,
};
const event = { ref:'refs/heads/main', before, after:sha };
const args = { eventName:'push', event, repository, sha };
const lookup = (pulls = [pr], parent = before) => async endpoint => endpoint.includes('/git/commits/')
  ? { sha, parents:[{sha:parent}] } : pulls;

assert.equal(await resolveCanonProseApproval({...args,requestJson:lookup()}), true);
for (const changed of [
  {...pr,labels:[]}, {...pr,state:'open'}, {...pr,merged_at:null},
  {...pr,merge_commit_sha:'c'.repeat(40)}, {...pr,base:{...pr.base,ref:'sandbox'}},
  {...pr,base:{...pr.base,repo:{full_name:'another/repo'}}},
]) assert.equal(await resolveCanonProseApproval({...args,requestJson:lookup([changed])}), false);
for (const pulls of [[], null, {}, {pulls:[pr]}]) {
  assert.equal(await resolveCanonProseApproval({...args,requestJson:lookup(pulls)}), false);
}
assert.equal(await resolveCanonProseApproval({...args,requestJson:lookup([pr],'c'.repeat(40))}), false,
  'approval cannot cover extra commits before the merged PR in one push');
assert.equal(await resolveCanonProseApproval({...args,requestJson:async()=>{throw new Error('API unavailable');}}), false);
for (const changed of [
  {...event,ref:'refs/heads/sandbox'}, {...event,after:'c'.repeat(40)},
  {...event,before:'0'.repeat(40)}, {...event,before:'invalid'},
]) assert.equal(await resolveCanonProseApproval({...args,event:changed,requestJson:async()=>assert.fail('must not request')}), false);
assert.equal(await resolveCanonProseApproval({...args,eventName:'workflow_dispatch',requestJson:lookup()}), false);
assert.equal(await resolveCanonProseApproval({...args,repository:'../bad/path',requestJson:lookup()}), false);
assert.equal(await resolveCanonProseApproval({...args,requestJson:async()=>({sha:'c'.repeat(40),parents:[{sha:before}]})}), false);

const noLookup = async () => assert.fail('PR label approval requires no network lookup');
const receipt = {schema_version:1,issue:1436,repository,commit:sha,base:before,paths:['wiki/queen-sarah-p-fly.html']};
const tagName = `canon-direct-1436-${sha}`;
function directLookup({approval=receipt,tagCommit=sha,files=[{filename:'wiki/queen-sarah-p-fly.html',status:'modified'}],lightweight=false}={}) {
  return async endpoint => {
    if (endpoint.includes('/git/commits/')) return {sha,parents:[{sha:before}]};
    if (endpoint.includes('/pulls?')) return [];
    if (endpoint.includes('/git/ref/tags/')) return {ref:`refs/tags/${tagName}`,object:{type:lightweight?'commit':'tag',sha:'d'.repeat(40)}};
    if (endpoint.includes('/git/tags/')) return {tag:tagName,object:{type:'commit',sha:tagCommit},message:JSON.stringify(approval)};
    return {sha,parents:[{sha:before}],files};
  };
}
assert.equal(await resolveCanonProseApproval({...args,requestJson:directLookup()}),true,'exact annotated direct-publication receipt');
for (const approval of [{...receipt,issue:1435},{...receipt,base:'c'.repeat(40)},{...receipt,commit:'c'.repeat(40)},
  {...receipt,repository:'other/repo'},{...receipt,paths:[]},{...receipt,paths:[...receipt.paths,...receipt.paths]}]) {
  assert.equal(await resolveCanonProseApproval({...args,requestJson:directLookup({approval})}),false);
}
assert.equal(await resolveCanonProseApproval({...args,requestJson:directLookup({tagCommit:'c'.repeat(40)})}),false);
assert.equal(await resolveCanonProseApproval({...args,requestJson:directLookup({lightweight:true})}),false);
for (const file of [
  {filename:'wiki/queen-sarah-p-fly.html',status:'added'},
  {filename:'wiki/queen-sarah-p-fly.html',status:'removed'},
  {filename:'wiki/first-witness-master-chronology.html',status:'modified'},
  {filename:'scripts/resolve-canon-prose-approval.mjs',status:'modified'},
  {filename:'js/wiki.js',status:'modified'},
]) assert.equal(await resolveCanonProseApproval({...args,requestJson:directLookup({approval:{...receipt,paths:[file.filename]},files:[file]})}),false);
assert.equal(await resolveCanonProseApproval({...args,eventName:'pull_request',event:{pull_request:pr},requestJson:noLookup}), true);
assert.equal(await resolveCanonProseApproval({...args,eventName:'pull_request',event:{pull_request:{...pr,labels:[]}},requestJson:noLookup}), false);

const directory = fs.mkdtempSync(path.join(os.tmpdir(),'canon-approval-'));
try {
  const eventPath = path.join(directory,'event.json');
  const outputPath = path.join(directory,'output');
  fs.writeFileSync(eventPath,JSON.stringify({pull_request:pr}));
  const result = spawnSync(process.execPath,[fileURLToPath(new URL('./resolve-canon-prose-approval.mjs',import.meta.url))],{
    encoding:'utf8',env:{...process.env,GITHUB_EVENT_PATH:eventPath,GITHUB_OUTPUT:outputPath,
      GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:repository,GITHUB_SHA:sha,GITHUB_TOKEN:''},
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(outputPath,'utf8'),'approved=1\n');
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
console.log('Canon approval handoff passed: exact labelled merged PR, original push baseline, direct push rejection and fail-closed API lookup.');
