import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const source = read('js/my-moonboy-mission-guide.js');
const parity = JSON.parse(read('data/player-action-sync-claim-parity.v1.json'));
function load() {
  const window = {};
  const document = { readyState: 'loading', activeElement: null, addEventListener() {} };
  vm.runInNewContext(source, {window, document}, {filename:'my-moonboy-mission-guide.js'});
  return window.MOONBOYS_MISSION_GUIDE;
}
function target() {
  return { innerHTML: '', querySelectorAll() { return []; }, contains() { return false; } };
}
const ids = [...read('workers/moonboys-api/player-action-plan/sources.js')
  .match(/export const ACTION_PLAN_SOURCE_REGISTRY = Object\.freeze\(\[([\s\S]*?)\]\.map\(/u)[1]
  .matchAll(/^\s*\['([a-z0-9.-]+)'/gmu)].map(x=>x[1]);

test('complete registry checklist exactly tracks every Action Plan source and Saved Status claim gap', () => {
  const guide = load();
  assert.equal(ids.length, 28);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(guide.sources.map(x=>x.key).join('|'), ids.join('|'));
  const gaps = parity.mappings.filter(x=>x.parity === 'gap').map(x=>x.saved_status);
  assert.equal(gaps.length, 5);
  assert.equal(guide.savedOnly.map(x=>x.key).sort().join('|'), gaps.sort().join('|'));
  assert.ok(guide.savedOnly.every(x=>x.description && x.label));
});

test('all resource rules have audited source markers and do not merge Gems, Crystals or XP types', () => {
  const guide = load();
  assert.equal(guide.economy.length, 19);
  assert.equal(new Set(guide.economy.map(x=>x.id)).size, 19);
  for (const item of guide.economy) {
    for (const key of ['group','title','gain','spend','risk','sourceFile','sourceMarker','href'])
      assert.ok(item[key], item.id+' missing '+key);
    assert.match(item.href, /^\/(?!\/)/u);
    assert.ok(fs.existsSync(path.join(ROOT, item.sourceFile)), item.sourceFile);
    assert.ok(read(item.sourceFile).includes(item.sourceMarker),
      item.id+' drifted from source '+item.sourceFile+': '+item.sourceMarker);
  }
  assert.match(guide.economy.find(x=>x.id==='crystals').spend, /NOT Block Topia Gems/u);
  assert.match(guide.economy.find(x=>x.id==='bt-gems').risk, /not a guaranteed award/u);
  assert.match(guide.economy.find(x=>x.id==='bt-xp').risk, /loss/u);
  assert.match(guide.economy.find(x=>x.id==='gold').risk, /No automatic 75 Gold/u);
});

test('all MoonPet economy routes are read from the authoritative game catalogue', () => {
  const guide = load();
  const src = read('workers/moonboys-api/pets/economy-expansion.js');
  const block = src.match(/export const PET_ECONOMY_ROUTES = freeze\(\[([\s\S]*?)\]\);/u)?.[1];
  assert.ok(block);
  const keys = [...block.matchAll(/\{ key: '([a-z_]+)'/gu)].map(x=>x[1]);
  assert.equal(keys.length, 15);
  assert.equal(guide.routes.map(x=>x.key).join('|'), keys.join('|'));
});

test('signed checklist verifies accepted receipts only; absence, preview and stale status stay unknown', () => {
  const guide = load(), el = target();
  const valid={task_id:'valid',source_key:'moonpet.seven-of-seven-claim',title:'Saved claim <script>alert(1)</script>',
    status:'claimed',source_health:'live',evidence:{kind:'server_receipt',verified_completion:true}};
  const advisory={task_id:'preview',source_key:'faction.daily-missions',title:'Browser mission',
    status:'complete',source_health:'live',evidence:{kind:'client_mirror',verified_completion:false}};
  guide.renderChecklist(el,[valid,advisory],{topActions:[valid],moreAvailable:true});
  assert.match(el.innerHTML, /1 receipt-verified \/ 1 loaded task/u);
  assert.match(el.innerHTML, /✓/u);
  assert.match(el.innerHTML, /advisory only/u);
  assert.match(el.innerHTML, /More tasks exist beyond this page/u);
  assert.match(el.innerHTML, /No task in loaded results; status unknown, not completed/u);
  assert.equal((el.innerHTML.match(/Check Saved Status/g) || []).length,5);
  assert.doesNotMatch(el.innerHTML, /<script>|onclick=|type="checkbox"/u);
  assert.match(el.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  guide.renderChecklist(el,[valid],{stale:true,offline:true});
  assert.doesNotMatch(el.innerHTML, /✓/u);
  assert.match(el.innerHTML, /historical only/u);
});

test('public resource guide and private checklist are isolated, with logout purge and CI registration', () => {
  const guide=load(), el=target();
  guide.renderRules(el);
  for (const field of ['Gain / earn:','Spend / use:','Lose / risk / limits:','Block Topia Gems'])
    assert.ok(el.innerHTML.includes(field),field);
  const html=read('my-moonboy.html');
  const client=read('js/my-moonboy.js');
  assert.ok(html.indexOf('id="mm-complete-checklist"') > html.indexOf('id="mm-private"'));
  assert.ok(html.indexOf('id="mm-economy"') > html.indexOf('id="mm-private"'));
  assert.ok(html.indexOf('/js/my-moonboy-mission-guide.js') < html.indexOf('/js/my-moonboy.js'));
  assert.match(client, /byId\('mm-checklist'\)\.replaceChildren\(\)/u);
  assert.match(client, /renderChecklist\(byId\('mm-checklist'\), state\.tasks/u);
  assert.ok(read('scripts/ci-domain-runner.mjs').includes(
    "['node', '--test', 'scripts/my-moonboy-mission-guide.test.mjs']"));
  for (const page of ['index.html','community.html','games/index.html',
    'gkniftyheads-incubator.html','how-to-play.html']) {
    assert.match(read(page), /href="\/my-moonboy\.html"/u,
      page + ' must make the signed mission checklist discoverable');
  }
});

test('Engage, Signal and Cite are distinct Wiki receipt-backed actions; other interactions are not reward claims', () => {
  const guide = load(), items = guide.wikiEngagement;
  assert.deepEqual(items.map(item => item.id).join('|'),
    'engage|signal|cite|comment-vote|citation-submission|reading-sharing');
  assert.deepEqual(items.filter(item => item.missionId !== null).map(item => item.missionId).join('|'),
    'engage|signal|cite');
  assert.equal(new Set(items.map(item => item.id)).size, 6);
  const missionSource = read('js/battle-layer.js');
  const config = read('js/api-config.js');
  const routeTests = read('scripts/wiki-engagement-api.test.mjs');
  for (const item of items) {
    assert.ok(item.label && item.action && item.reward && item.status && item.href);
    assert.ok(fs.existsSync(path.join(ROOT, item.sourceFile)), item.id + ' source must exist');
    assert.ok(read(item.sourceFile).includes(item.sourceMarker),
      item.id + ' backing Wiki action has changed');
    assert.match(item.href, /^\/(wiki\/|search\.html)/u);
    if (item.missionId) {
      assert.ok(missionSource.includes("id: '" + item.missionId + "'"),
        'mission definition is missing for ' + item.id);
      assert.match(routeTests, /reward_status.*xp_synced/u);
    } else {
      assert.match(item.reward, /no .*XP|No .*XP/iu,
        item.id + ' must not be described as an automatically paid source');
    }
  }
  for (const flag of ['COMMENTS', 'LIKES', 'CITATION_VOTES'])
    assert.ok(new RegExp(flag + ':\\s+true').test(config), flag + ' runtime flag changed');
  const publicGuide = read('how-to-play.html');
  assert.match(publicGuide, /Wiki participation — comments, article likes and citation votes/u);
  assert.match(publicGuide, /My Moonboy currently shows only the total accepted Wiki receipts for today/u);
  assert.match(publicGuide, /href="\/my-moonboy\.html#mm-economy"/u);
  assert.match(read('js/comments.js'), /eligible server-accepted Engage, Signal and Cite/u);
  assert.doesNotMatch(read('js/comments.js'), /Comment = 10 XP|Like = 5 XP|Citation = 15 XP/u,
    'outdated fixed frontend reward promises contradict source receipts');
});

test('an accepted aggregate Wiki mission count never supplies individual Engage / Signal / Cite checks', () => {
  const guide = load(), el = target();
  guide.renderChecklist(el, [{
    task_id: 'wiki:today', source_key: 'wiki.accepted-missions',
    title: 'Accepted wiki mission recorded today',
    status: 'complete', source_health: 'live',
    evidence: { kind: 'server_receipt', verified_completion: true },
    progress: { current: 3, target: 1, unit: 'accepted_receipts' },
  }], {});
  const wiki = el.innerHTML.split('data-mm-checklist-key="gap:wiki-engagement"')[1]
    ?.split('</details>')[0] || '';
  assert.match(wiki, /Signed API reports 3 accepted Wiki receipt\(s\) today in total/u);
  assert.equal((wiki.match(/Individual status not projected/g) || []).length, 6,
    'all six Wiki actions remain unverified individually, even when summary count is three');
  assert.doesNotMatch(wiki, /✓|type="checkbox"/u);
  assert.match(wiki, /Open Wiki|Check original page/u);
  guide.renderChecklist(el, [], { stale: true, offline: true });
  assert.match(el.innerHTML, /Individual Wiki mission source receipts are not available/u);
  assert.doesNotMatch(el.innerHTML, /Signed API reports 3 accepted Wiki/u);
});

test('Wiki contributor XP rankings do not fall back to fictional scores', () => {
  const source = read('js/comments.js');
  const section = source.slice(
    source.indexOf('function getContributorData()'),
    source.indexOf('function robotAvatar(')
  );
  assert.ok(section.includes('week && week.length ? week : []'));
  assert.ok(section.includes('allTime && allTime.length ? allTime : []'));
  assert.doesNotMatch(section, /:\s*FALLBACK_TOP_CONTRIBUTORS/u);
  assert.match(source, /Verified contributor rankings unavailable for this period/u);
  assert.match(source, /list\.innerHTML = contributorListHTML\(rows\)/u);
});
