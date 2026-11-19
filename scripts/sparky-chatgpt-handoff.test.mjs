import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
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
  scrollIntoView(){this.scrolled=true;}
  select(){this.selected=true;}
  closest(tag){let n=this.parent;while(n){if(n.tagName===tag)return n;n=n.parent;}return null;}
  querySelectorAll(query){return query === '.gpt-group' ? this.children.filter(n=>n.className==='gpt-group') : [];}
  querySelector(query){
    const m=query.match(/^\[data-activity="([^"]+)"\]$/);
    if (!m) return null;
    const visit=n=>{if(n.attrs['data-activity']===m[1])return n;for(const x of n.children){const match=visit(x);if(match)return match;}return null;};
    return visit(this);
  }
}
function ui(search='') {
  const ids=['gpt-activity-groups','gpt-choice','gpt-what','gpt-open-link','gpt-prompt-preview','gpt-prompt-details','gpt-copy-prompt','gpt-copy-status','gpt-guide-link','gpt-search','gpt-search-count','gpt-launch','gpt-launch-title'];
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
  assert.ok(wiki.indexOf('<!-- MANUAL_CONTENT:END -->') < wiki.indexOf('<!-- RELATED_WIKI_PATHS:BEGIN -->'), 'generated Related Wiki Paths must remain outside manual ownership');
  assert.doesNotMatch(wiki, /data-canon-revision|data-canon-source-tier/);
});

test('single ChatGPT launch carries the campaign spine and reads the published brief', () => {
  const links = [...page.matchAll(/href="(https:\/\/chatgpt\.com\/\?q=[^"]+)"/g)];
  assert.equal(links.length, 1, 'one ChatGPT launch link');
  const url = new URL(links[0][1].replaceAll('&amp;', '&'));
  assert.deepEqual([...url.searchParams.keys()], ['q']);
  const prompt = url.searchParams.get('q');
  assert.match(prompt, /guides\/sparky\/creator-campaign\.md/);
  assert.match(prompt, /graffiti-kings-creative-guide\.html/);
  assert.match(prompt, /ONE consistent mascot/);
  assert.match(prompt, /shock message/);
  assert.match(prompt, /genuinely gifted\/assigned verified GK Moonboy/);
  assert.match(prompt, /my own mascot\/IP/);
  assert.match(prompt, /returning project manager/);
  assert.match(prompt, /Never claim you created a Project, scheduled work, posted/);
  assert.match(page, /href="\/guides\/sparky\/creator-campaign\.md" download/);
  assert.doesNotMatch(page, /id="gpt-activity-groups"|id="creator-memory-studio"|data-feature=|sparky-gpt-app\.js/);
});

test('campaign brief has both routes, original mascot continuity, real proof and canon gates', () => {
  const brief = read('guides/sparky/creator-campaign.md');
  assert.match(brief, /A\. Build with a gifted\/assigned Moonboy/);
  assert.match(brief, /B\. Bring their own mascot\/IP/);
  assert.match(brief, /Do not change the mascot between formats/);
  assert.match(brief, /permissioned offline action/);
  assert.match(brief, /online echo/);
  assert.match(brief, /project files or handoff/);
  assert.match(brief, /pending community review/);
  assert.match(brief, /political Forty/);
  assert.match(brief, /Do not claim background posting, scheduled check-ins/);
  assert.doesNotMatch(brief, /brand-canon\/story-bibles|final-fork-ending/i);
  assert.match(page, /<link rel="canonical" href="https:\/\/cryptomoonboys\.com\/gpt-users\.html">/);
  assert.match(page, /href="\/wiki\/crypto-moonboys\.html"/);
});

test('shared creative guide is publicly linked and culturally grounded', () => {
  const brief = read('graffiti-kings-creative-guide.html');
  assert.match(brief, /data-page-kind="public-creative-brief"/);
  assert.match(brief, /The voice: conviction, wit and something to say/);
  assert.match(brief, /Stories with teeth, people with lives/);
  assert.match(brief, /new illustrative drafts, not official slogans or lore/);
  assert.doesNotMatch(brief, /story-bibles|reconciliation-decisions|issue-1458-proposals|w81-continuity-companion/);
  for (const [, href] of brief.matchAll(/href="(\/[^"#?]+)(?:[?#][^"]*)?"/g)) {
    assert.ok(existsSync(path.join(base, href)), 'missing public resource ' + href);
  }
});
test('creative context offers shock without requiring a new identity or claiming a live swarm', () => {
  const brief = read('graffiti-kings-creative-guide.html');
  const section = id => {
    const content = brief.match(new RegExp('<section id="' + id + '">([\\s\\S]*?)</section>'))?.[1];
    assert.ok(content, 'missing creative context section: ' + id);
    return content;
  };
  assert.match(section('identity'), /One striking image and one line may be enough/);
  assert.match(section('identity'), /full character universe.*optional expansions/);
  assert.match(section('identity'), /Do not rename an established artist, replace their mascot/);
  assert.match(section('shock'), /one message, one recognisable mark, one unexpected twist and one hook/);
  assert.match(section('visuals'), /Test it in one colour, at sticker size/);
  assert.match(section('worlds'), /Start with a grabbing hook, not a lore dump/);
  assert.match(section('streets'), /posters, stickers, stencils/);
  assert.match(section('streets'), /Street sighting → digital story → next physical encounter/);
  assert.match(section('streets'), /physical work is not indestructible/);
  assert.match(section('streets'), /own property or explicitly authorised locations/);
  assert.match(section('swarm'), /24\/7 digital support/);
  assert.match(section('swarm'), /Bots are staff, not fake fans/);
  assert.match(section('swarm'), /does not run a 24\/7 bot service/);
  assert.match(section('swarm'), /separately configured tool, authorised accounts/);
  assert.match(section('activities'), /deliverable stays the thing they chose/);
  assert.doesNotMatch(brief, /Banksy|HODLKONG64\/GRAFFITI-KINGS-APP/i, 'no named artist comparison or private repository dependency');
  const ids = [...brief.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'creative guide IDs must be unique');
  for (const [, id] of brief.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(id), 'creative guide navigation target missing: ' + id);
  }
});


test('SWARMSY continuity CTA points to the published brief, not the retired editor', () => {
  const appPage = read('swarmsy.html');
  const continuity = read('docs/portable-creator-memory.md');
  assert.match(appPage, /href="\/guides\/sparky\/creator-campaign\.md" class="swarmsy-action-card"/);
  assert.match(appPage, /KEEP YOUR PROJECT MOVING/);
  assert.doesNotMatch(appPage, /#creator-memory-studio|SAVE YOUR PROJECT MEMORY|Export or import a portable project JSON file in the public Studio/);
  assert.match(continuity, /website no longer contains a browser memory editor or JSON import\/export buttons/);
  assert.match(continuity, /save those files and bring them back/i);
  assert.match(continuity, /existing JSON record can attach it to ChatGPT/);
});
