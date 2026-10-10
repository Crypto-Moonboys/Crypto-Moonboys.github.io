import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(base,p),'utf8');
const page = read('gpt-users.html');
const wiki = read('wiki/create-your-moonboy.html');
const guide = read('moonboy-ai-canon-guide.txt');
const sourceIndex = JSON.parse(read('moonboy-canon-index.json'));
// This independent, static snapshot checks every character of all 107 goals.
const expected = JSON.parse(read('scripts/fixtures/sparky-creator-goal-hashes.json')).activities;
function fullGoalDigest(input) {
  let hash = 14695981039346656037n;
  for (let i = 0; i < input.length; i++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(input.charCodeAt(i))) * 1099511628211n);
  }
  return hash.toString(16).padStart(16, '0');
}

function boot(doc = null, search = '') {
  const w = { location:{search,hash:''}, navigator:{clipboard:{writeText:async()=>{}}}, document:doc };
  const ctx={window:w,URLSearchParams,encodeURIComponent};
  vm.runInNewContext(read('js/sparky-creator-activities.js'),ctx,{filename:'catalog.js'});
  vm.runInNewContext(read('js/sparky-gpt-app.js'),ctx,{filename:'app.js'});
  return w;
}
class FakeEl {
  constructor(tag='div') { this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.value='';this.href='';this.textContent='';this.open=false;this.parent=null; }
  appendChild(child) {child.parent=this;this.children.push(child);return child;}
  replaceChildren(...nodes){this.children=[];nodes.forEach(n=>this.appendChild(n));}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  addEventListener(event,cb){this.listeners[event]=cb;}
  focus(){this.focused=true;}
  select(){this.selected=true;}
  closest(tag){let n=this.parent;while(n){if(n.tagName===tag)return n;n=n.parent;}return null;}
  querySelector(query){
    const m=query.match(/^\[data-activity="([^"]+)"\]$/);
    if (!m) return null;
    const visit=n=>{if(n.attrs['data-activity']===m[1])return n;for(const x of n.children){const match=visit(x);if(match)return match;}return null;};
    return visit(this);
  }
}
function ui(search='') {
  const ids=['gpt-activity-groups','gpt-choice','gpt-what','gpt-open-link','gpt-prompt-preview','gpt-prompt-details','gpt-copy-prompt','gpt-copy-status','gpt-guide-link','gpt-search','gpt-search-count'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new FakeEl()]));
  const features=['website','wiki','moonboy','stickers','world','do-it'].map(id=>{const b=new FakeEl('button');b.setAttribute('data-feature',id);return b;});
  const doc={getElementById:id=>nodes[id],createElement:tag=>new FakeEl(tag),querySelectorAll:q=>q==='[data-feature]'?features:[]};
  const w=boot(doc,search);
  const findButtons=()=>{const out=[];const visit=n=>{if(n.tagName==='button'&&n.attrs['data-activity'])out.push(n);n.children.forEach(visit);};visit(nodes['gpt-activity-groups']);return out;};
  return {w,nodes,features,findButtons};
}

test('public source index contains only approved existing public sources',()=>{
  assert.equal(sourceIndex.sources.length,23);
  assert.match(guide,/W81.*94/);
  assert.match(guide,/YEAR 3008|year = 3008/i);
  assert.match(guide,/LONG-FORM BIOGRAPHY MODE/);
  assert.match(guide,/NEW DRAFT/);
  assert.match(guide,/PUBLIC Final Fork outcome remains unresolved/i);
  assert.match(wiki,/<h1[^>]*>Create Your Moonboy<\/h1>/);
  assert.match(wiki,/href="\/gpt-users\.html\?activity=moonboy"/);
  const seen=new Set();
  for(const s of sourceIndex.sources){
    assert.ok(!seen.has(s.id),'duplicate source id '+s.id);seen.add(s.id);
    assert.ok(s.approved_public_surface,'unapproved surface '+s.id);
    assert.ok(s.url.startsWith('https://cryptomoonboys.com/'),'unknown host '+s.id);
    assert.ok(!/(story-bibles|editorial|private|secrets|w81\.zip|final-fork-ending)/i.test(s.path),'spoiler or removed path '+s.path);
    assert.ok(existsSync(path.join(base,s.path)),'missing public source '+s.path);
  }
  assert.ok(!guide.includes('https://cryptomoonboys.com/about/w81.zip'),'retired ZIP link remains');
});

test('Moonboy creator article remains a manually owned non-canon reference', () => {
  const inventory = JSON.parse(read('brand-canon/wiki-content-state.json'));
  const record = inventory.pages.find(entry => entry.slug === 'create-your-moonboy');
  assert.ok(record, 'Creator wiki guide missing from deterministic inventory');
  assert.equal(record.page_type, 'reference');
  assert.equal(record.rewrite_status, 'KEEP');
  assert.equal(record.automation_policy, 'metadata-only');
  assert.equal(record.canon_conflict_severity, 'NOT_APPLICABLE');
  assert.equal(record.likely_lore_page, false);
  assert.equal(record.manual_content_block_count, 1);
  assert.equal(record.legacy_unmarked_content, false);
  assert.ok(record.likely_source_family.some(source => source.includes('moonboy-ai-canon-guide.txt')));
  assert.ok(record.likely_source_family.some(source => source.includes('moonboy-canon-index.json')));
  assert.match(wiki, /data-page-kind="public-creator-guide"/);
  assert.match(wiki, /<!-- MANUAL_CONTENT:BEGIN -->/);
  assert.match(wiki, /<!-- MANUAL_CONTENT:END -->/);
  assert.doesNotMatch(wiki, /data-canon-revision|data-canon-source-tier/);
});

test('catalogue has twelve clear sections and exactly the independently expected 107 routes',()=>{
  const app=boot().SPARKY_CREATOR_APP;
  assert.equal(app.catalog.categories.length,12);
  assert.equal(app.all.length,107);
  assert.equal(expected.length,107);
  const seen=new Set();
  const actual=app.all.map(a=>a.id);
  assert.deepEqual([...actual].sort(),expected.map(e=>e.id).sort());
  for(const e of expected){
    const a=app.find(e.id);
    assert.ok(!seen.has(e.id),'duplicate route '+e.id);seen.add(e.id);
    assert.equal(a.title,e.title,'mismatched title for '+e.id);
    assert.equal(a.guide,e.guide,'wrong guide for '+e.id);
    assert.equal(fullGoalDigest(a.goal), e.goalDigest, 'full instructions changed for '+e.id);
    assert.ok(a.goal.length>=55,'route has thin instructions '+e.id);
    const guidePath=e.guide==='core'?'sparky-chatgpt-guide.txt':'guides/sparky/'+e.guide+'.txt';
    assert.ok(existsSync(path.join(base,guidePath)),'missing guide for '+e.id);
    assert.ok(read(guidePath).length>1200,'guide too thin for '+e.id);
  }
  for(const id of ['start','stickers','posters','walls','zines','merch','character','streetart','moonboy','grow','website','wiki','bible','site-seo'])assert.ok(seen.has(id),'missing primary route '+id);
});

test('every one of 107 activities produces correct ChatGPT starter, goal, guide and permission rules',()=>{
  const app=boot().SPARKY_CREATOR_APP;
  for(const e of expected){
    const url=new URL(app.makeUrl(e.id));
    assert.equal(url.origin,'https://chatgpt.com',e.id);
    assert.equal(url.pathname,'/',e.id);
    assert.deepEqual([...url.searchParams.keys()],['q'],e.id);
    const prompt=url.searchParams.get('q');
    assert.equal(prompt,app.makePrompt(e.id),'prompt and link drift: '+e.id);
    assert.ok(prompt.includes('MY STARTER: '+e.title+'.'),'wrong starter: '+e.id);
    assert.ok(prompt.includes('MY GOAL: '+app.find(e.id).goal),'incomplete or wrong goal in launch URL: '+e.id);
    assert.ok(prompt.includes(app.guideFor(e.guide)),'missing specialist guide: '+e.id);
    assert.match(prompt,/not claim publication/i);
    assert.match(prompt,/explicitly authorised locations/i);
    if(e.id==='moonboy'){
      assert.match(app.find(e.id).goal, /verified NFT image/);
      assert.match(app.find(e.id).goal, /never invent traits, rights, faction or official approval/i);
      assert.match(prompt,/moonboy-ai-canon-guide\.txt/);
      assert.match(prompt,/moonboy-canon-index\.json/);
    }
    if(e.id==='website'||e.id==='wiki')assert.match(prompt,/actual working files/i);
  }
});

test('interactive page selects exactly one activity, supports deep-link, search and copy fallback',async()=>{
  const {w,nodes,features,findButtons}=ui('?activity=moonboy');
  assert.equal(nodes['gpt-choice'].textContent,'Selected: Build a Moonboy or PFP');
  assert.ok(nodes['gpt-open-link'].href.includes('chatgpt.com/?q='));
  assert.equal(findButtons().length,107);
  for(const e of expected){
    const button=findButtons().find(b=>b.getAttribute('data-activity')===e.id);
    assert.ok(button,'missing DOM button: '+e.id);
    assert.ok(button.listeners.click,'route not clickable: '+e.id);
    button.listeners.click();
    const selected=findButtons().filter(b=>b.getAttribute('aria-pressed')==='true');
    assert.equal(selected.length,1,'multiple pressed: '+e.id);
    assert.equal(selected[0].getAttribute('data-activity'),e.id);
    assert.equal(nodes['gpt-choice'].textContent,'Selected: '+e.title);
    const query=new URL(nodes['gpt-open-link'].href).searchParams.get('q');
    assert.equal(nodes['gpt-prompt-preview'].value,query,'copy/URL mismatch: '+e.id);
    assert.ok(query.includes('MY GOAL: '+w.SPARKY_CREATOR_APP.find(e.id).goal),'starter goal matches intended text: '+e.id);
    assert.ok(query.includes('MY STARTER: '+e.title+'.'));
  }
  nodes['gpt-search'].value='wiki';
  nodes['gpt-search'].listeners.input();
  assert.ok(findButtons().length>0&&findButtons().length<107);
  assert.match(nodes['gpt-search-count'].textContent,/matching your search/);
  const quick=features.find(x=>x.getAttribute('data-feature')==='website');
  quick.listeners.click();
  assert.equal(nodes['gpt-choice'].textContent,'Selected: Build my first website');
  assert.equal(findButtons().length,107);
  let written='';
  w.navigator.clipboard.writeText=async text=>{written=text;};
  await nodes['gpt-copy-prompt'].listeners.click();
  assert.equal(written,nodes['gpt-prompt-preview'].value);
  w.navigator.clipboard.writeText=async()=>{throw Error('denied');};
  await nodes['gpt-copy-prompt'].listeners.click();
  assert.equal(nodes['gpt-prompt-details'].open,true);
  assert.equal(nodes['gpt-prompt-preview'].selected,true);
  assert.match(nodes['gpt-copy-status'].textContent,/Copy the highlighted message/);
});

test('HTML links to the actual dynamic application without hidden promises',()=>{
  assert.match(page,/id="gpt-search"/);
  assert.match(page,/id="gpt-activity-groups"/);
  assert.match(page,/data-feature="wiki"/);
  assert.match(page,/data-feature="website"/);
  assert.match(page,/data-feature="moonboy"/);
  assert.match(page,/id="gpt-guide-link" href="\/sparky-chatgpt-guide\.txt"/,'no-JavaScript default guide must exist');
  assert.doesNotMatch(page,/href="\/guides\/sparky\/core\.txt"/,'missing static guide should never be linked');
  assert.match(page,/src="\/js\/sparky-creator-activities\.js"/);
  assert.match(page,/src="\/js\/sparky-gpt-app\.js"/);
  assert.match(page,/swarm/i);
  assert.match(page,/read.*canon/i);
});
