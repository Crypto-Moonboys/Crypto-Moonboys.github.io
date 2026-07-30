import assert from 'node:assert/strict';
import fs from 'node:fs';

const wikiPage = fs.readFileSync(new URL('../wiki/crypto-moonboy-pets.html', import.meta.url), 'utf8');
const howTo = fs.readFileSync(new URL('../how-to-play-crypto-moonboy-pets.html', import.meta.url), 'utf8');
const leaderboard = fs.readFileSync(new URL('../crypto-moonboy-pets-leaderboard.html', import.meta.url), 'utf8');
const community = fs.readFileSync(new URL('../community.html', import.meta.url), 'utf8');
const games = fs.readFileSync(new URL('../games/index.html', import.meta.url), 'utf8');
const petSurfaceScript = fs.readFileSync(new URL('../js/crypto-moonboy-pets.js', import.meta.url), 'utf8');
const index = JSON.parse(fs.readFileSync(new URL('../js/wiki-index.json', import.meta.url), 'utf8'));

assert.ok(wikiPage.includes('Crypto Moonboy Pets'), 'wiki page must name Crypto Moonboy Pets');
assert.ok(wikiPage.includes('/how-to-play-crypto-moonboy-pets.html'), 'wiki page must link How To Play page');
assert.ok(wikiPage.includes('/crypto-moonboy-pets-leaderboard.html'), 'wiki page must link pet leaderboard');
assert.ok(wikiPage.includes('Community XP'), 'wiki page must explain Community XP sync');

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
assert.ok(howTo.includes('Pet Arena unlocks at level 10'), 'docs mention Pet Arena level unlock');
assert.ok(howTo.includes('Gear Shop'), 'docs explain the Arena Gear Shop');
assert.ok(howTo.includes('Pet XP'), 'How To Play must explain pet XP');
assert.ok(howTo.includes('Community XP'), 'How To Play must explain Community XP');
assert.ok(howTo.includes('lucky_charm') && howTo.includes('consumed when it boosts a run'), 'How To Play must explain lucky_charm run consumption');
assert.ok(howTo.includes('community/game progression only'), 'How To Play must keep rewards framed as game progression');
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

const entry = index.find((item) => item.url === '/wiki/crypto-moonboy-pets.html');
assert.ok(entry, 'Crypto Moonboy Pets must be present in js/wiki-index.json');
const searchText = JSON.stringify(entry).toLowerCase();
for (const term of ['crypto moonboy pets', 'telegram', 'pet game', 'tamagotchi', 'roguelite', 'pet leaderboard', 'pet adventure', 'pet notifications', 'moon gold', 'pet bag', 'pet jobs', 'daily chest', 'random event']) assert.ok(searchText.includes(term), `wiki index entry must include search term: ${term}`);
assert.ok(wikiPage.includes('armor, weapon and charm'), 'wiki explains Pet Arena gear slots');

console.log('crypto-moonboy-pets-surface.test.mjs passed');
