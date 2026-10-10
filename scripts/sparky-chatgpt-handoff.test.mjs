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
// This independent snapshot makes a missing, swapped or incorrectly named activity fail CI.
const expected = [{"id":"start","title":"I'm starting from zero","guide":"core","goalLead":"I have no idea yet. Choose one simple creative activity using or"},{"id":"learn-drawing","title":"Teach me to draw","guide":"core","goalLead":"Teach me a basic drawing skill by guiding one ten-minute practic"},{"id":"rough-sketch","title":"Improve my rough sketch","guide":"core","goalLead":"Help me turn a sketch or photo I provide into a clearer design w"},{"id":"style","title":"Find my creative style","guide":"core","goalLead":"Show me three distinct artistic directions rooted in my interest"},{"id":"seven-day","title":"My first seven creative days","guide":"core","goalLead":"Make a flexible 7-day plan with one doable asset each day. Give "},{"id":"restart","title":"Restart an unfinished project","guide":"core","goalLead":"Help me recover a stalled creative project from my notes, identi"},{"id":"continue","title":"Continue my project","guide":"core","goalLead":"Help me continue an existing project. Ask me to paste my saved p"},{"id":"files","title":"I already have artwork or files","guide":"core","goalLead":"Help me organise the image, notes, PDF or website files I upload"},{"id":"do-it","title":"You choose — do it for me","guide":"core","goalLead":"Make one imaginative draft immediately from any clues I share. M"},{"id":"stickers","title":"Make stickers","guide":"art-print","goalLead":"Help me make my first original sticker design: strong message, b"},{"id":"posters","title":"Make posters","guide":"art-print","goalLead":"Design an original A4 poster with headline, composition, print-r"},{"id":"walls","title":"Paint a legal wall","guide":"art-print","goalLead":"Plan a mural or legal wall sketch, small test panel, materials a"},{"id":"zines","title":"Make a mini zine","guide":"art-print","goalLead":"Create a one-sheet A4 folded zine with a simple panel map, clear"},{"id":"merch","title":"Make my own merch","guide":"art-print","goalLead":"Help place one original artwork on a shirt, tote, patch or badge"},{"id":"streetart","title":"Try graffiti-style art","guide":"art-print","goalLead":"Create original graffiti lettering or stencil-inspired work on p"},{"id":"screenprint","title":"Try printmaking","guide":"art-print","goalLead":"Help me design a one-colour print and choose an accessible hand-"},{"id":"exhibit","title":"Exhibit my artwork","guide":"art-print","goalLead":"Help display actual finished art in a shop window, community ven"},{"id":"community-art","title":"Create a community art project","guide":"art-print","goalLead":"Plan a small lawful, inclusive collaborative artwork with suppli"},{"id":"artist-name","title":"Invent an artist identity","guide":"identity","goalLead":"Help me create an original artist alias or anonymous identity, a"},{"id":"logo","title":"Design a logo or symbol","guide":"identity","goalLead":"Develop one distinctive mark that works as a profile image, stic"},{"id":"character","title":"Invent a character","guide":"identity","goalLead":"Create an original mascot or fictional character with a recogniz"},{"id":"character-bio","title":"Write my character biography","guide":"identity","goalLead":"Write a compelling character biography based on confirmed detail"},{"id":"visual-identity","title":"Build a visual identity","guide":"identity","goalLead":"Create a practical style guide for colours, typography, imagery,"},{"id":"portfolio","title":"Write my artist portfolio","guide":"identity","goalLead":"Help organise my real artwork and achievements into portfolio se"},{"id":"brand","title":"Build my brand","guide":"identity","goalLead":"Turn my current art, product or rough idea into a memorable iden"},{"id":"moonboy","title":"Build a Moonboy or PFP","guide":"identity","goalLead":"Help build a Moonboy or NFT-avatar identity. Begin by asking whe"},{"id":"world","title":"Build an original fictional universe","guide":"worlds","goalLead":"Help create an original world with a unique premise, culture, lo"},{"id":"bible","title":"Create a world bible","guide":"worlds","goalLead":"Make an editable world bible with setting rules, cast, timeline,"},{"id":"factions","title":"Create fictional factions","guide":"worlds","goalLead":"Create distinct groups with work, material needs, internal confl"},{"id":"world-characters","title":"Create a character cast","guide":"worlds","goalLead":"Develop a cast with motivations, role, voice, relationships, sec"},{"id":"locations","title":"Invent cities and locations","guide":"worlds","goalLead":"Create a small illustrated-world location atlas with districts, "},{"id":"timeline","title":"Build a lore timeline","guide":"worlds","goalLead":"Organise known events chronologically, flag uncertain dates and "},{"id":"story","title":"Write my first story","guide":"worlds","goalLead":"Help outline and draft an original story anchored in a protagoni"},{"id":"comic","title":"Make a comic series","guide":"worlds","goalLead":"Build a comic concept with original cast, episode arc, readable "},{"id":"mystery","title":"Design an interactive mystery","guide":"worlds","goalLead":"Write a safe fiction-first puzzle trail with clues and optional "},{"id":"canon-audit","title":"Check my lore for contradictions","guide":"worlds","goalLead":"Audit my uploaded story bible and chapters for inconsistent date"},{"id":"website","title":"Build my first website","guide":"websites","goalLead":"Build a beginner-friendly one-page website from my project or ar"},{"id":"artist-site","title":"Build an artist portfolio website","guide":"websites","goalLead":"Build a mobile-friendly artist portfolio with galleries, real bi"},{"id":"wiki","title":"Build my own lore wiki","guide":"websites","goalLead":"Build a searchable fictional-world wiki with home page, characte"},{"id":"wiki-characters","title":"Build a character encyclopedia","guide":"websites","goalLead":"Turn my original character records into connected, categorized b"},{"id":"blog","title":"Create a blog or magazine","guide":"websites","goalLead":"Set up a simple editorial site with posts, categories, author cr"},{"id":"gallery","title":"Make an art archive/gallery","guide":"websites","goalLead":"Build a gallery to archive dated real work with tags, photograph"},{"id":"shop-site","title":"Create a product landing page","guide":"websites","goalLead":"Build a clear product or merch landing page with artwork, descri"},{"id":"publish-site","title":"Put my website online","guide":"websites","goalLead":"Guide me through a suitable hosting route such as GitHub Pages, "},{"id":"site-seo","title":"Improve my website","guide":"websites","goalLead":"Audit accessibility, speed, mobile layout, navigation, headings,"},{"id":"ai-art","title":"Create an AI artwork","guide":"media","goalLead":"Help me generate an original image or production brief with the "},{"id":"album-art","title":"Design album art","guide":"media","goalLead":"Create an original album/single visual identity, square artwork "},{"id":"short-video","title":"Create a short video","guide":"media","goalLead":"Plan a 15–60 second real-world creative clip with shot list, cap"},{"id":"animation","title":"Animate my character","guide":"media","goalLead":"Develop a character animation or motion storyboard with poses, k"},{"id":"music","title":"Make original music","guide":"media","goalLead":"Help plan an original track or beat with style references, struc"},{"id":"dj","title":"Create a DJ project","guide":"media","goalLead":"Develop an original DJ identity, mix series, track plan, cover a"},{"id":"podcast","title":"Start a podcast","guide":"media","goalLead":"Create an episode concept, show structure, script outline, artwo"},{"id":"photos","title":"Improve my art photographs","guide":"media","goalLead":"Help improve photographs of actual artworks through lighting, fr"},{"id":"storyboard","title":"Make a storyboard","guide":"media","goalLead":"Turn my story or promo concept into scene beats, shots, panels, "},{"id":"apparel","title":"Design clothing","guide":"products","goalLead":"Create an original mini apparel range with one main design, size"},{"id":"toy","title":"Create a designer toy","guide":"products","goalLead":"Turn my original mascot into a realistic toy concept with turnar"},{"id":"packaging","title":"Make product packaging","guide":"products","goalLead":"Design a clear label, box or insert with brand voice, layout dim"},{"id":"print-edition","title":"Release art prints","guide":"products","goalLead":"Plan a transparent small edition of original prints with paper o"},{"id":"product-copy","title":"Write product descriptions","guide":"products","goalLead":"Write useful product listings grounded in real specs, material, "},{"id":"mockups","title":"Make product mockups","guide":"products","goalLead":"Create or plan believable product mockups labeled as concepts wh"},{"id":"pricing","title":"Price my products","guide":"products","goalLead":"Work out production costs, labor, fees, margins and sensible tes"},{"id":"drop","title":"Plan a merch or art drop","guide":"products","goalLead":"Build an honest release plan with limited quantities only if rea"},{"id":"collectible","title":"Create a collectible concept","guide":"products","goalLead":"Develop a collectible character series with rarity as design lor"},{"id":"social","title":"Create social media posts","guide":"marketing","goalLead":"Turn real creative progress into a short platform-specific post,"},{"id":"content-calendar","title":"Plan my content calendar","guide":"marketing","goalLead":"Create a realistic four-week content plan that uses existing art"},{"id":"reels","title":"Make a reel or TikTok","guide":"marketing","goalLead":"Create a punchy short-form video concept with hook, shot list, n"},{"id":"campaign","title":"Create a street-to-digital campaign","guide":"marketing","goalLead":"Design a distinct lawful local campaign tied to one real creativ"},{"id":"press","title":"Write a press pitch","guide":"marketing","goalLead":"Turn my verified project into a concise media angle, short press"},{"id":"launch","title":"Launch my new project","guide":"marketing","goalLead":"Plan a simple launch with assets, landing page, truthful proof a"},{"id":"meme","title":"Create shareable art or memes","guide":"marketing","goalLead":"Develop an original meme format or remix prompt without harassme"},{"id":"puzzle-campaign","title":"Build a lore mystery campaign","guide":"marketing","goalLead":"Plan opt-in clue drops, coded posters on permitted surfaces and "},{"id":"collab","title":"Find a collaboration route","guide":"marketing","goalLead":"Identify realistic types of partners such as shops, artists and "},{"id":"grow","title":"Show or sell my art","guide":"marketing","goalLead":"Help me share or sell one actual creative thing I have made. Fir"},{"id":"start-community","title":"Start a creative community","guide":"community","goalLead":"Define a clear purpose, fair rules, first meeting or online spac"},{"id":"telegram","title":"Set up a Telegram or Discord community","guide":"community","goalLead":"Guide me through choosing and configuring a community platform w"},{"id":"event","title":"Plan an art event","guide":"community","goalLead":"Plan a small exhibition, workshop or pop-up with venue approval,"},{"id":"challenge","title":"Run an art challenge","guide":"community","goalLead":"Create a fair optional drawing, sticker or poster challenge with"},{"id":"missions","title":"Create community missions","guide":"community","goalLead":"Make optional creative missions and authentic proof review witho"},{"id":"newsletter","title":"Write a newsletter","guide":"community","goalLead":"Draft a community or collector newsletter from actual updates, w"},{"id":"collab-zine","title":"Create a collaborative zine","guide":"community","goalLead":"Plan a multi-artist zine with contributions, credits, permission"},{"id":"public-benefit","title":"Create a community benefit project","guide":"community","goalLead":"Develop a permission-first creative workshop or art project with"},{"id":"creative-business","title":"Start a creative business","guide":"business","goalLead":"Turn my art or service into a one-page practical business plan w"},{"id":"commission","title":"Sell art commissions","guide":"business","goalLead":"Help define commission packages, scope, revision rules, a fair q"},{"id":"client-pitch","title":"Pitch my creative work","guide":"business","goalLead":"Build an evidence-backed client proposal with concept, benefits,"},{"id":"invoices","title":"Make an invoice or quote","guide":"business","goalLead":"Draft professional quotation and invoice templates from facts I "},{"id":"budget","title":"Plan my creative budget","guide":"business","goalLead":"Make a beginner budget for materials, prototypes, fees and optio"},{"id":"funding","title":"Find grants or sponsorship","guide":"business","goalLead":"Help research current legitimate funding opportunities or sponso"},{"id":"licensing","title":"Understand copyright and rights","guide":"business","goalLead":"Explain practical copyright, music clearance and artwork licensi"},{"id":"shop","title":"Start selling my art online","guide":"business","goalLead":"Plan a small online shop or enquiry workflow with real product p"},{"id":"collector","title":"Build a collector offering","guide":"business","goalLead":"Create an honest collector-facing print, commission or exhibitio"},{"id":"game","title":"Build a simple browser game","guide":"tools","goalLead":"Help me make a beginner browser game with playable HTML, CSS and"},{"id":"interactive-world","title":"Make an interactive fictional world","guide":"tools","goalLead":"Build a small choose-your-route or lore-exploration site with ch"},{"id":"quests","title":"Design game missions","guide":"tools","goalLead":"Develop fair fictional quests or community tasks with goals, cle"},{"id":"bot","title":"Build a simple community bot","guide":"tools","goalLead":"Explain safe starter bot design for Telegram/Discord, permission"},{"id":"automation","title":"Automate creative tasks","guide":"tools","goalLead":"Identify what I can do manually, what real integrations are avai"},{"id":"github","title":"Help me with GitHub","guide":"tools","goalLead":"Walk me through a beginner repository, version history, pull req"},{"id":"nft-plan","title":"Plan a digital collectible project","guide":"tools","goalLead":"Help map art, metadata, publishing and rights verification for a"},{"id":"tools-website","title":"Make a useful website tool","guide":"tools","goalLead":"Build a simple calculator, character sorter or interactive galle"},{"id":"project-plan","title":"Plan my next 30 days","guide":"projects","goalLead":"Make a manageable one-month creative plan focused on actual outp"},{"id":"daily","title":"Plan today's creative work","guide":"projects","goalLead":"Help choose one 25-minute action with a finished deliverable and"},{"id":"proof","title":"Build my proof log","guide":"projects","goalLead":"Help me separate ideas, drafts, approved decisions, made things,"},{"id":"organise-files","title":"Organise my art and notes","guide":"projects","goalLead":"Sort supplied work into folders, file names, image credits and a"},{"id":"research","title":"Research my creative subject","guide":"projects","goalLead":"Research a topic from reliable public sources or supplied files,"},{"id":"critique","title":"Critique my artwork","guide":"projects","goalLead":"Give actionable feedback on the actual draft I share, keeping it"},{"id":"week-review","title":"Review this week's progress","guide":"projects","goalLead":"Check what was actually created, what worked, what is blocked an"},{"id":"handover","title":"Make a project handover","guide":"projects","goalLead":"Prepare a portable, copyable project bible: goals, approved deci"},{"id":"site-audit","title":"Audit my website or wiki","guide":"projects","goalLead":"Review my current site and suggest high-impact accessible naviga"}];

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
    const m=query.match(/^\\[data-activity="([^"]+)"\\]$/);
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
  assert.match(wiki,/<h1[^>]*>Create Your Moonboy<\\/h1>/);
  assert.match(wiki,/href="\\/gpt-users\\.html\\?activity=moonboy"/);
  const seen=new Set();
  for(const s of sourceIndex.sources){
    assert.ok(!seen.has(s.id),'duplicate source id '+s.id);seen.add(s.id);
    assert.ok(s.approved_public_surface,'unapproved surface '+s.id);
    assert.ok(s.url.startsWith('https://cryptomoonboys.com/'),'unknown host '+s.id);
    assert.ok(!/(story-bibles|editorial|private|secrets|w81\\.zip|final-fork-ending)/i.test(s.path),'spoiler or removed path '+s.path);
    assert.ok(existsSync(path.join(base,s.path)),'missing public source '+s.path);
  }
  assert.ok(!guide.includes('https://cryptomoonboys.com/about/w81.zip'),'retired ZIP link remains');
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
    assert.ok(a.goal.startsWith(e.goalLead),'mismatched instructions for '+e.id);
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
    assert.ok(prompt.includes('MY GOAL: '+e.goalLead),'wrong goal: '+e.id);
    assert.ok(prompt.includes(app.guideFor(e.guide)),'missing specialist guide: '+e.id);
    assert.match(prompt,/not claim publication/i);
    assert.match(prompt,/explicitly authorised locations/i);
    if(e.id==='moonboy'){
      assert.match(prompt,/moonboy-ai-canon-guide\\.txt/);
      assert.match(prompt,/moonboy-canon-index\\.json/);
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
  assert.match(page,/src="\\/js\\/sparky-creator-activities\\.js"/);
  assert.match(page,/src="\\/js\\/sparky-gpt-app\\.js"/);
  assert.match(page,/swarm/i);
  assert.match(page,/read.*canon/i);
});
