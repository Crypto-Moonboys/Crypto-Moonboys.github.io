import assert from 'node:assert/strict';
import fs from 'node:fs';

const wikiPage = fs.readFileSync(new URL('../wiki/crypto-moonboy-pets.html', import.meta.url), 'utf8');
const howTo = fs.readFileSync(new URL('../how-to-play-crypto-moonboy-pets.html', import.meta.url), 'utf8');
const leaderboard = fs.readFileSync(new URL('../crypto-moonboy-pets-leaderboard.html', import.meta.url), 'utf8');
const community = fs.readFileSync(new URL('../community.html', import.meta.url), 'utf8');
const games = fs.readFileSync(new URL('../games/index.html', import.meta.url), 'utf8');
const petSurfaceScript = fs.readFileSync(new URL('../js/crypto-moonboy-pets.js', import.meta.url), 'utf8');
const miniAppScript = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const index = JSON.parse(fs.readFileSync(new URL('../js/wiki-index.json', import.meta.url), 'utf8'));
function sectionByHeading(html, heading) {
  return html.match(new RegExp(`<section class="[^"]+">\\s*<h2>${heading}<\\/h2>[\\s\\S]*?<\\/section>`))?.[0] || '';
}

assert.ok(wikiPage.includes('Crypto Moonboy Pets'), 'wiki page must name Crypto Moonboy Pets');
assert.ok(wikiPage.includes('/how-to-play-crypto-moonboy-pets.html'), 'wiki page must link How To Play page');
assert.ok(wikiPage.includes('/crypto-moonboy-pets-leaderboard.html'), 'wiki page must link pet leaderboard');
assert.ok(wikiPage.includes('Community XP'), 'wiki page must explain Community XP sync');
assert.ok(wikiPage.includes('Coming Soon Roadmap'), 'wiki page must highlight roadmap systems');
const wikiRoadmapSection = sectionByHeading(wikiPage, 'Coming Soon Roadmap');
assert.ok(wikiRoadmapSection, 'wiki page must include a Coming Soon Roadmap section');
for (const futureSystem of ['Advanced Traits', 'Breeding', 'Lineage', 'Fusion', 'Sanctuary', 'Prestige']) {
  assert.ok(wikiRoadmapSection.includes(futureSystem), `wiki roadmap section must list future system ${futureSystem}`);
}
assert.ok(wikiRoadmapSection.includes('issue #1256'), 'wiki roadmap section must link the detailed roadmap issue');

for (const command of ['/adopt', '/feed', '/train', '/petrun', '/petextract', '/petadventure', '/petbag', '/petuse moon_snack', '/petwork courier', '/petdaily', '/petevent', '/petnotify on', '/petarena', '/petstart train', '/petactivity', '/petclaim', '/petcancel']) {
  assert.ok(howTo.includes(command), `How To Play must explain ${command}`);
}
assert.ok(howTo.includes('Generates a random encounter with three choices.'), 'How To Play must explain what /petevent does');
assert.ok(howTo.includes('Care Loadout'), 'How To Play must explain the Care Loadout');
assert.ok(howTo.includes('Battle Loadout'), 'How To Play must explain the Battle Loadout');
assert.ok(howTo.includes('Food, Toy and Outfit'), 'How To Play must define care slots');
assert.ok(howTo.includes('Armor, Weapon and Charm'), 'How To Play must define battle slots');
assert.ok(howTo.includes('Changing one does not reset the other'), 'How To Play must state loadouts are independent');
assert.ok(howTo.includes('Empty battle slots display') && howTo.includes('<strong>none</strong>'), 'How To Play must explain empty battle slots');
assert.ok(howTo.includes('hatched active Moonpet') && howTo.includes('level 10 active Moonpet'), 'docs must mention the current Arena hatch and level unlock gates');
assert.ok(howTo.includes('Kaiju Sticker Battle flow for accounts with a hatched active Moonpet'), 'docs must mention the Kaiju hatch unlock gate');
assert.ok(howTo.includes('Pet Arena equipment') || howTo.includes('Gear Shop'), 'docs explain the Arena equipment shop');
assert.ok(howTo.includes('Pet XP'), 'How To Play must explain pet XP');
assert.ok(howTo.includes('Community XP'), 'How To Play must explain Community XP');
assert.ok(howTo.includes('Current Build In Moonpet OS'), 'How To Play must show the current build section');
assert.ok(howTo.includes('Coming Soon Roadmap'), 'How To Play must show the roadmap section');
const currentBuildSection = sectionByHeading(howTo, 'Current Build In Moonpet OS');
assert.ok(currentBuildSection, 'How To Play must include the current-build section body');
assert.ok(currentBuildSection.includes('Pet, Care, Daily Journey, Weekly Journey, Jobs, Runs, Equipment, Arena, Kaiju and Progression'), 'How To Play current-build section must name the current gameplay priorities');
const comingSoonSection = sectionByHeading(howTo, 'Coming Soon Roadmap');
assert.ok(comingSoonSection, 'How To Play must include the coming-soon roadmap section body');
for (const futureSystem of ['Advanced Traits', 'Breeding', 'Lineage', 'Fusion', 'Sanctuary', 'Prestige']) {
  assert.ok(comingSoonSection.includes(futureSystem), `How To Play coming-soon section must keep ${futureSystem} in the roadmap list`);
}
assert.ok(howTo.includes('lucky_charm') && howTo.includes('consumed when it boosts a run'), 'How To Play must explain lucky_charm run consumption');
assert.ok(howTo.includes('game-only rewards') && howTo.includes('game currencies'), 'How To Play must keep rewards framed as game progression');
assert.ok(!howTo.toLowerCase().includes('financial'), 'How To Play must avoid financial wording');
assert.ok(!howTo.toLowerCase().includes('real-world value'), 'How To Play must avoid real-world value wording');
assert.ok(howTo.includes('pet-card-gallery'), 'How To Play must include a pet card gallery');
assert.ok(howTo.includes('Crypto Moonboys Pet Feed card'), 'How To Play must preview the feed card');
assert.ok(howTo.includes('Crypto Moonboys Pet How To Play card'), 'How To Play must preview the how-to-play card');
assert.match(howTo, /\.pet-card-gallery img\s*\{[\s\S]*aspect-ratio:\s*4 \/ 5;[\s\S]*object-fit:\s*contain;/, 'pet card gallery must show full portrait card art without cropping');
assert.doesNotMatch(howTo, /\.pet-card-gallery img\s*\{[\s\S]*object-fit:\s*cover;/, 'pet card gallery must not crop card art');
assert.ok(!leaderboard.includes('pet-card-gallery'), 'Leaderboard page must not dump the pet card gallery');
assert.ok(!community.includes('pet-card-gallery'), 'Community page must not dump the pet card gallery');

for (const script of [
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/wiki.js',
  '/js/crypto-moonboy-pets.js',
]) {
  assert.ok(howTo.includes(`src="${script}"`), `How To Play must load canonical boot script ${script}`);
}
assert.ok(howTo.indexOf('/js/core/moonboys-state.js') < howTo.indexOf('/js/components/connection-status-panel.js'), 'state must load before the connection status panel');
assert.ok(howTo.indexOf('/js/core/daily-loop-state.js') < howTo.indexOf('/js/components/connection-status-panel.js'), 'daily loop state must load before the connection status panel');

assert.ok(leaderboard.includes('data-crypto-pets-leaderboard'), 'pet leaderboard page must use pet leaderboard data hook');
for (const period of ['seasonal', 'daily', 'weekly', 'all_time']) assert.ok(leaderboard.includes(`data-period="${period}"`), `pet leaderboard must show ${period} period`);
assert.ok(community.includes('data-crypto-pets-summary'), 'community page must have compact pet summary only');
assert.ok(!community.includes('data-crypto-pets-leaderboard'), 'community page must not dump full pet leaderboard');
assert.ok(games.includes('Crypto Moonboy Pets — Telegram Game'), 'games index must list Pets as a Telegram Game');

assert.ok(petSurfaceScript.includes('<strong>Care Loadout</strong>'), 'pet summary must distinguish care equipment');
assert.ok(petSurfaceScript.includes('<strong>Battle Loadout</strong>'), 'pet summary must distinguish arena equipment');
for (const field of ['equipped_food', 'equipped_toy', 'equipped_outfit', 'equipped_armor', 'equipped_weapon', 'equipped_charm']) assert.ok(petSurfaceScript.includes(`pet.${field}`), `pet summary must render ${field}`);
assert.ok(petSurfaceScript.includes("formatLoadoutValue(pet.equipped_armor, 'none')"), 'empty armor slot must render as none');
assert.ok(petSurfaceScript.includes("formatLoadoutValue(pet.equipped_weapon, 'none')"), 'empty weapon slot must render as none');
assert.ok(!petSurfaceScript.includes("formatLoadoutValue(pet.equipped_armor, 'starter')"), 'empty armor slot must not invent starter gear');
assert.ok(!petSurfaceScript.includes("formatLoadoutValue(pet.equipped_weapon, 'starter')"), 'empty weapon slot must not invent starter gear');
const guideMarkupSource = miniAppScript.match(/function guideMarkup\(\)\s*\{[\s\S]*?\n  \}/)?.[0] || '';
assert.ok(guideMarkupSource, 'Mini App guide helper must be extractable');
const renderGuideMarkup = new Function('hasCombatUnlocked', `${guideMarkupSource}; return guideMarkup();`);
const lockedGuideMarkup = renderGuideMarkup(() => false);
assert.ok(lockedGuideMarkup.includes('Kaiju requires a hatched active Moonpet, and Arena requires a hatched active Moonpet plus level 10.'), 'Mini App guide must state runtime combat gates when combat is locked');
for (const [label, pattern] of [
  ['Pet', /PET|Pet/],
  ['Care', /care/i],
  ['Daily Journey', /Daily Journey/],
  ['Weekly Journey', /Weekly Journey/],
  ['Jobs', /jobs/i],
  ['Runs', /Moon Run|RUN/i],
  ['Equipment', /equipment/i],
  ['Arena', /Arena/],
  ['Kaiju', /Kaiju/],
  ['Progression', /evolution and season rewards|progression/i],
]) {
  assert.match(lockedGuideMarkup, pattern, `Mini App guide must include current-build vocabulary for ${label}`);
}
const roadmapStepBody = lockedGuideMarkup.match(/<strong>6 \/\/ IDENTITY AND ROADMAP<\/strong>([\s\S]*?)<\/div>/)?.[1] || '';
assert.ok(roadmapStepBody, 'Mini App guide must include the identity and roadmap step');
assert.ok(roadmapStepBody.includes('remain coming soon'), 'Mini App guide future systems must be marked as coming soon');
const guideOutsideRoadmap = lockedGuideMarkup.replace(roadmapStepBody, '');
for (const futureSystem of ['Advanced Traits', 'Breeding', 'Lineage', 'Fusion', 'Sanctuary', 'Prestige']) {
  assert.ok(roadmapStepBody.includes(futureSystem), `Mini App roadmap step must list ${futureSystem}`);
  assert.ok(!guideOutsideRoadmap.includes(futureSystem), `Mini App guide must only mention ${futureSystem} in the coming-soon roadmap step`);
}

const entry = index.find((item) => item.url === '/wiki/crypto-moonboy-pets.html');
assert.ok(entry, 'Crypto Moonboy Pets must be present in js/wiki-index.json');
const searchText = JSON.stringify(entry).toLowerCase();
for (const term of ['crypto moonboy pets', 'telegram', 'pet game', 'tamagotchi', 'roguelite', 'pet leaderboard', 'pet adventure', 'pet notifications', 'moon gold', 'pet bag', 'pet jobs', 'daily chest', 'random event']) assert.ok(searchText.includes(term), `wiki index entry must include search term: ${term}`);
assert.ok(wikiPage.includes('armor, weapon and charm'), 'wiki explains Pet Arena gear slots');

console.log('crypto-moonboy-pets-surface.test.mjs passed');
