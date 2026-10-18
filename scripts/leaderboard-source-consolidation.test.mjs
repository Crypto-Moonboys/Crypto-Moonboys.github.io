import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const leaderboard = read('games/leaderboard.html');
const rankings = read('js/arcade-leaderboard.js');
assert.doesNotMatch(rankings, /You are linked as|getCurrentIdentityLabel\(/u,
  'header owns account identity; leaderboard only offers ranking presence controls');
assert.match(rankings, /Ranking presence/u);
const shell = read('js/site-shell.js');
const retention = read('js/arcade-retention-engine.js');
const myMoonboy = read('my-moonboy.html');
const account = read('js/my-moonboy.js');
const worker = read('workers/moonboys-api/routes/daily-loop-state.js');

const tabs = rankings.match(/const RAW_TABS = \[([\s\S]*?)\];/u)?.[1];
assert.ok(tabs);
const keys = [...tabs.matchAll(/key: '([^']+)'/gu)].map(x => x[1]);
assert.equal(keys.length, 9, 'global + exactly eight source-authoritative individual boards');
for (const game of ['snake','blocktopia','meme-swarm-3008','chain-maze','forkfield',
  'bullrun-brick-smash','block-topia-dropzone','kaiju']) assert.ok(keys.includes(game));
for (const link of ['/moonpet-game.html','/games/dead-run/','/games/nbg-london/',
  '/games/block-topia/','/games/','/my-moonboy.html'])
  assert.ok(leaderboard.includes('href="' + link + '"'), link + ' missing separate source link');
assert.match(leaderboard, /Global aggregates the supported shared Arcade source only/u);
assert.match(leaderboard, /Other playable games — separate sources/u);
assert.doesNotMatch(leaderboard, /class="lb-overview-grid"|class="lb-sync-zone"|aria-label="Arcade system explainer"/u,
  'duplicate onboarding cards must not displace the public scoreboard');

const inlineStats = shell.slice(shell.indexOf('function ensureInlineLiveStats(content)'),
  shell.indexOf('function ensureMainContent()', shell.indexOf('function ensureInlineLiveStats(content)')));
assert.ok(inlineStats.includes('if (legacy) legacy.remove()'));
assert.ok(inlineStats.includes('function shouldShowInlineStats(_pathname)'));
assert.ok(inlineStats.includes('return false'));
assert.doesNotMatch(inlineStats, /appendChild\(container\)|data-csp-panel/u,
  'shared shell must no longer inject private summary cards on general game pages');
assert.ok(read('community.html').includes('data-fop-private'),
  'canonical faction member operations remain on Community');
assert.ok(read('games/index.html').includes('id="telegram-games"'),
  'canonical game launchers remain on Games');

assert.match(retention, /if \(isGamePage\(\)\) \{\s*init\(\)/u);
assert.doesNotMatch(retention, /location\.pathname[^;\n]*includes\('\/games\/leaderboard'\)/u,
  'read-only leaderboard must not auto-start local comeback missions');

const t = 1_800_000_000_000;
const expiredMission = {id:'mission-switch-preexisting',type:'switch-return',
  label:'Play 2 different games in 10 mins',created_at:t+7200000,
  expires_at:t+7800000,target_runs:2,target_unique_games:2,
  progress_runs:0,progress_games:[],completed:false};
const storage = new Map([['arcade_retention_v1', JSON.stringify({
  last_played_at:t,comeback_mission:expiredMission
})]]);
const localStorage = {
  getItem:key=>storage.get(key)||null,
  setItem:(key,val)=>storage.set(key,val),
};
const fakeWindow = {localStorage};
const fakeDocument = {getElementById:()=>null,querySelector:()=>null};
const src = retention.replace(/^import [^\n]+\n/gmu,'')
  .replace(/^export \{ ArcadeRetentionEngine \};/gmu,'') +
  '\nglobalThis.__testRetention={maybeGenerateComebackMission,maybeExpireMission,getState:()=>state};';
const context = {window:fakeWindow,document:fakeDocument,localStorage,
  location:{pathname:'/games/leaderboard.html'},
  ArcadeMeta:{getComebackPressure:()=>null},playSound() {}};
vm.runInNewContext(src,context,{filename:'arcade-retention-engine.js'});
const probe = context.__testRetention;
for(let i=0;i<10;i++){
  assert.equal(probe.maybeGenerateComebackMission(t+7800000+15000*i),null,
    'mission cannot reset itself every 15 seconds after expiry');
  assert.equal(probe.getState().comeback_mission.id,expiredMission.id,
    'same inactivity episode retains one expired mission tombstone');
}
assert.ok(!fakeWindow.__retentionInitialized, 'read-only leaderboard did not start retention timer');

assert.match(worker, /SUM\(missed_xp_value\)/u);
assert.match(worker, /xp_total_all_time: hasXpColumn/u);
assert.match(worker, /xp_source_status: hasXpColumn \? 'verified' : 'migration_pending'/u);
assert.match(myMoonboy, /id="mm-missed-xp"/u);
assert.match(account, /String\(loop\.identity\.telegram_id \|\| ''\) === ownerId/u);
assert.match(account, /isRequestCurrent\(epoch, ownerId, day\)/u);
assert.match(account, /xp_source_status === 'verified'/u);
assert.match(account, /'mm-missed-xp'\)\.textContent = 'Not confirmed'/u);
console.log('Leaderboard coverage, personal-panel consolidation, retention expiry and missed XP tests passed.');
