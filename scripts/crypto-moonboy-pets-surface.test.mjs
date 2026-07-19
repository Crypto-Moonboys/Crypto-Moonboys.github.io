import assert from 'node:assert/strict';
import fs from 'node:fs';

const wikiPage = fs.readFileSync(new URL('../wiki/crypto-moonboy-pets.html', import.meta.url), 'utf8');
const howTo = fs.readFileSync(new URL('../how-to-play-crypto-moonboy-pets.html', import.meta.url), 'utf8');
const leaderboard = fs.readFileSync(new URL('../crypto-moonboy-pets-leaderboard.html', import.meta.url), 'utf8');
const community = fs.readFileSync(new URL('../community.html', import.meta.url), 'utf8');
const games = fs.readFileSync(new URL('../games/index.html', import.meta.url), 'utf8');
const index = JSON.parse(fs.readFileSync(new URL('../js/wiki-index.json', import.meta.url), 'utf8'));

assert.ok(wikiPage.includes('Crypto Moonboy Pets'), 'wiki page must name Crypto Moonboy Pets');
assert.ok(wikiPage.includes('/how-to-play-crypto-moonboy-pets.html'), 'wiki page must link How To Play page');
assert.ok(wikiPage.includes('/crypto-moonboy-pets-leaderboard.html'), 'wiki page must link pet leaderboard');
assert.ok(wikiPage.includes('Community XP'), 'wiki page must explain Community XP sync');

assert.ok(howTo.includes('/adopt'), 'How To Play must explain /adopt');
assert.ok(howTo.includes('/feed'), 'How To Play must explain /feed');
assert.ok(howTo.includes('/train'), 'How To Play must explain /train');
assert.ok(howTo.includes('/petadventure'), 'How To Play must explain /petadventure');
assert.ok(howTo.includes('/petbag'), 'How To Play must explain /petbag');
assert.ok(howTo.includes('/petuse moon_snack'), 'How To Play must explain /petuse');
assert.ok(howTo.includes('/petwork courier'), 'How To Play must explain /petwork');
assert.ok(howTo.includes('/petdaily'), 'How To Play must explain /petdaily');
assert.ok(howTo.includes('/petevent open'), 'How To Play must explain /petevent');
assert.ok(howTo.includes('/petnotify on'), 'How To Play must explain pet notifications');
assert.ok(howTo.includes('Pet XP'), 'How To Play must explain pet XP');
assert.ok(howTo.includes('Community XP'), 'How To Play must explain Community XP');
assert.ok(howTo.includes('no financial promises'), 'How To Play must include no-financial-promises note');
assert.ok(howTo.includes('pet-card-gallery'), 'How To Play must include a pet card gallery');
assert.ok(howTo.includes('Crypto Moonboys Pet Feed card'), 'How To Play must preview the feed card');
assert.ok(howTo.includes('Crypto Moonboys Pet How To Play card'), 'How To Play must preview the how-to-play card');
assert.match(howTo, /\.pet-card-gallery img\s*\{[\s\S]*aspect-ratio:\s*4 \/ 5;[\s\S]*object-fit:\s*contain;/, 'pet card gallery must show full portrait card art without cropping');
assert.doesNotMatch(howTo, /\.pet-card-gallery img\s*\{[\s\S]*object-fit:\s*cover;/, 'pet card gallery must not crop card art');
assert.ok(!leaderboard.includes('pet-card-gallery'), 'Leaderboard page must not dump the pet card gallery');
assert.ok(!community.includes('pet-card-gallery'), 'Community page must not dump the pet card gallery');

assert.ok(leaderboard.includes('data-crypto-pets-leaderboard'), 'pet leaderboard page must use pet leaderboard data hook');
assert.ok(leaderboard.includes('data-period="seasonal"'), 'pet leaderboard must show seasonal period');
assert.ok(leaderboard.includes('data-period="daily"'), 'pet leaderboard must show daily period');
assert.ok(leaderboard.includes('data-period="weekly"'), 'pet leaderboard must show weekly period');
assert.ok(leaderboard.includes('data-period="all_time"'), 'pet leaderboard must show all-time period');

assert.ok(community.includes('data-crypto-pets-summary'), 'community page must have compact pet summary only');
assert.ok(!community.includes('data-crypto-pets-leaderboard'), 'community page must not dump full pet leaderboard');
assert.ok(games.includes('Crypto Moonboy Pets — Telegram Game'), 'games index must list Pets as a Telegram Game');

const entry = index.find((item) => item.url === '/wiki/crypto-moonboy-pets.html');
assert.ok(entry, 'Crypto Moonboy Pets must be present in js/wiki-index.json');
const searchText = JSON.stringify(entry).toLowerCase();
for (const term of ['crypto moonboy pets', 'telegram', 'pet game', 'tamagotchi', 'roguelite', 'pet leaderboard', 'pet adventure', 'pet notifications', 'moon gold', 'pet bag', 'pet jobs', 'daily chest', 'random event']) {
  assert.ok(searchText.includes(term), `wiki index entry must include search term: ${term}`);
}

console.log('crypto-moonboy-pets-surface.test.mjs passed');
