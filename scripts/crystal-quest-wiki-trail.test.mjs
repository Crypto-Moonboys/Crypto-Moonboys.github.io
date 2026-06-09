import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isCloseSignalAnswerMatch } from '../js/arcade/games/crystal-quest/signal-vault-utils.mjs';

const root = process.cwd();
const htmlPath = 'games/crystal-quest/index.html';
const bootPath = 'js/arcade/games/crystal-quest/bootstrap.js';
const html = fs.readFileSync(path.join(root, htmlPath), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, bootPath), 'utf8');
const packs = [
  'games/data/question_pack_001.json',
  'games/data/question_pack_002.json',
];

assert.match(html, /id="wikiTrailToggle"[^>]*>Open Wiki Trail<\/button>/, 'Wiki Trail toggle exists near the answer controls');
assert.match(html, /id="wikiTrailPanel"[^>]*aria-label="Crystal Quest Wiki Trail"/, 'Wiki Trail panel exists');
assert.match(html, /id="wikiTrailFullLink"[^>]*>Open full wiki page<\/a>/, 'full wiki link remains available inside panel');
assert.match(html, /id="questLink"/, 'original questLink remains available');

assert.match(bootstrap, /function renderWikiTrailPanel\(\)[\s\S]*wikiTrailTitle\.textContent = q\.title/, 'panel renders current mission title');
assert.match(bootstrap, /wikiTrailClue\.textContent = q\.clue/, 'panel renders current mission clue');
assert.match(bootstrap, /wikiTrailUrl\.textContent = q\.wiki_url/, 'panel renders wiki URL');
assert.match(bootstrap, /wikiTrailDiff\.textContent = 'Difficulty: ' \+ \(q\.difficulty/, 'panel renders difficulty');
assert.match(bootstrap, /renderCurrentQuestion\(\)[\s\S]*renderWikiTrailPanel\(\)/, 'Wiki Trail updates when the run renders the active question');
assert.match(bootstrap, /await fetch\(url, \{ credentials: 'same-origin' \}\)/, 'preview fetch is same-origin');
assert.match(bootstrap, /doc\.querySelectorAll\('script, style, noscript, iframe, object, embed'\)/, 'unsafe preview elements are stripped');
assert.match(bootstrap, /textContent = preview\.body/, 'preview uses textContent instead of injecting HTML');
assert.match(bootstrap, /Could not load the inline preview\. The full wiki page link still works\./, 'failed preview fetch shows fallback copy');
assert.match(bootstrap, /Wrong-attempt tier/, 'panel shows wrong-attempt tier state');
assert.match(bootstrap, /Close signal match — check exact wording\./, 'close answer feedback is present');

const closeQuestion = { accepted_answers: ['DIAMOND HANDS'] };
assert.equal(isCloseSignalAnswerMatch(closeQuestion, 'diamond hand'), true, 'close normalized answer is detected');
assert.equal(isCloseSignalAnswerMatch(closeQuestion, 'paper hands'), false, 'unrelated normalized answer is not close');

for (const packPath of packs) {
  const pack = JSON.parse(fs.readFileSync(path.join(root, packPath), 'utf8'));
  assert.ok(Array.isArray(pack.quests), `${packPath} exposes quests array`);
  for (const [index, q] of pack.quests.entries()) {
    const label = `${packPath} quest ${index + 1}`;
    assert.ok(q.id, `${label} has id`);
    assert.ok(q.title, `${label} has title`);
    assert.ok(q.difficulty, `${label} has difficulty`);
    assert.ok(q.clue, `${label} has clue`);
    assert.ok(q.wiki_url, `${label} has wiki_url`);
    assert.ok(Array.isArray(q.accepted_answers) && q.accepted_answers.some((answer) => String(answer).trim()), `${label} has at least one accepted answer`);
    assert.ok(Number(q.rewards && q.rewards.score) > 0, `${label} has positive reward score`);
    assert.match(q.wiki_url, /^\/wiki\/[a-z0-9][a-z0-9-]*\.html$/i, `${label} wiki_url points to local /wiki/*.html path`);
    const wikiFile = q.wiki_url.replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(root, wikiFile)), `${label} wiki file exists: ${wikiFile}`);
  }
}

const mojibakeMarkers = /(?:â€”|â€“|â€¦|â€œ|â€�|â€™|â€˜|â€¢|ï¿½|ðŸ)/u;
for (const file of [htmlPath, bootPath, 'js/arcade/games/crystal-quest/signal-vault-utils.mjs', ...packs]) {
  assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), mojibakeMarkers, `${file} contains no visible mojibake markers`);
}

console.log('crystal-quest-wiki-trail: passed');
