import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlPath = 'games/crystal-quest/index.html';
const bootPath = 'js/arcade/games/crystal-quest/bootstrap.js';
const html = fs.readFileSync(path.join(root, htmlPath), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, bootPath), 'utf8');

const requiredControls = [
  'signalMissionGrid',
  'samAgent',
  'wikiTrailToggle',
  'wikiTrailPanel',
  'wikiTrailFullLink',
  'answerInput',
  'submitBtn',
  'skipBtn',
  'runCompleteBanner',
  'feedback',
  'statusLine',
];

for (const id of requiredControls) {
  assert.match(html, new RegExp(`id="${id}"`), `Crystal Quest DOM keeps required control #${id}`);
}

assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/, 'mobile viewport meta remains present');
assert.match(html, /\.game-card\{[^}]*max-width:100%[^}]*box-sizing:border-box/, 'game card clamps to viewport width');
assert.match(html, /\.input\{[^}]*min-width:0[^}]*max-width:100%/, 'answer input can shrink without horizontal scroll');
assert.match(html, /\.btn\{[^}]*min-height:44px/, 'buttons meet touch-size baseline');
assert.match(html, /@media\(max-width:560px\)[\s\S]*\.row \.btn,\.wiki-trail-toggle\{[^}]*width:100%/, 'mobile controls stack to avoid horizontal overflow');
assert.match(html, /@media\(max-width:560px\)[\s\S]*\.input\{[^}]*width:100%/, 'mobile answer input stacks full width');
assert.match(html, /\.wiki-trail-panel\{[^}]*max-width:100%[^}]*overflow-wrap:anywhere/, 'Wiki Trail panel wraps long content');
assert.match(html, /\.wiki-trail-grid\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(180px,\.45fr\)/, 'desktop Wiki Trail uses a bounded second column so the answer terminal is not crushed');
assert.match(html, /@media\(max-width:760px\)\{\.wiki-trail-grid\{grid-template-columns:1fr\}\}/, 'mobile Wiki Trail collapses to one column');
assert.match(html, /id="signalMissionGrid"[^>]*aria-live="polite"[^>]*role="list"/, 'Signal Vault grid is announced as a live list');
assert.match(html, /id="runCompleteBanner"[^>]*role="status"[^>]*aria-live="assertive"/, 'run-complete banner remains assertive live feedback');
assert.match(html, /id="feedback"[^>]*aria-live="polite"/, 'feedback line is live for state changes');
assert.match(html, /id="answerInput"[^>]*aria-describedby="feedback statusLine"/, 'answer input references feedback/status copy');
assert.match(html, /id="wikiTrailToggle"[^>]*aria-expanded="false"[^>]*aria-controls="wikiTrailPanel"/, 'Wiki Trail toggle exposes expanded state and controls target');
assert.match(html, /id="wikiTrailFullLink"[^>]*aria-disabled="true"[^>]*tabindex="-1"/, 'disabled full wiki link starts non-focusable');

assert.match(bootstrap, /function closeWikiTrail\(\)[\s\S]*wikiTrailPanel\.setAttribute\('hidden', ''\);[\s\S]*wikiTrailToggle\.setAttribute\('aria-expanded', 'false'\);/, 'closeWikiTrail hides panel and syncs aria-expanded');
assert.match(bootstrap, /function openWikiTrail\(\)[\s\S]*wikiTrailPanel\.removeAttribute\('hidden'\);[\s\S]*wikiTrailToggle\.setAttribute\('aria-expanded', 'true'\);/, 'openWikiTrail reveals panel and syncs aria-expanded');
assert.match(bootstrap, /e\.key === 'Escape' && isWikiTrailOpen\(\)[\s\S]*closeWikiTrail\(\);/, 'Escape closes Wiki Trail without routing through reset');
assert.doesNotMatch(bootstrap, /e\.key === 'Escape'[\s\S]{0,220}reset\(/, 'Escape handler does not reset the run');
assert.match(bootstrap, /e\.key === 'Enter' && run && !run\.completed[\s\S]*submitAnswer\(\);/, 'Enter-to-decode path is preserved');
assert.match(bootstrap, /answerInput\.addEventListener\('keydown', boundAnswerKeydown\)/, 'answer key handler remains attached to the input');
assert.match(bootstrap, /document\.addEventListener\('keydown', boundDocumentKeydown\)/, 'document Escape handler is attached');
assert.match(bootstrap, /answerInput\.removeEventListener\('keydown', boundAnswerKeydown\)/, 'answer key handler is cleaned up on destroy');
assert.match(bootstrap, /document\.removeEventListener\('keydown', boundDocumentKeydown\)/, 'document Escape handler is cleaned up on destroy');
assert.match(bootstrap, /answerInput\.disabled = !active;[\s\S]*answerInput\.setAttribute\('aria-disabled', active \? 'false' : 'true'\);/, 'answer input disabled state tracks active run state');
assert.match(bootstrap, /submitBtn\.disabled = !active;[\s\S]*skipBtn\.disabled = !active;/, 'Decode and Bypass buttons remain disabled until a signal is active');

assert.match(bootstrap, /Run not started/, 'run-not-started state is explicit');
assert.match(bootstrap, /Signal Vault armed/, 'signal-active state is explicit');
assert.match(bootstrap, /Wrong-attempt tier/, 'wrong-answer state is explicit');
assert.match(bootstrap, /Close signal match — check exact wording\./, 'close-match state is explicit');
assert.match(bootstrap, /Signal bypassed\./, 'bypassed signal state is explicit');
assert.match(bootstrap, /Vault Sealed/, 'vault-sealed state is explicit');
assert.doesNotMatch(bootstrap, /accepted_answers[^\n]*(textContent|innerHTML)|textContent[^\n]*accepted_answers|innerHTML[^\n]*accepted_answers/, 'accepted answers are not rendered directly into player-facing HTML');

assert.match(html, /var GAME_ROOT_SELECTOR = '\.crystal-quest-card';/, 'fullscreen DOM audit targets Crystal Quest root');
assert.match(html, /if \(roots\.length > 1\) issues\.push\('Duplicate Crystal Quest roots: ' \+ roots\.length\);/, 'fullscreen DOM audit detects duplicate Crystal Quest roots');
assert.match(html, /if \(fsControls\.length > 1\) issues\.push\('Duplicate overlay ctrl bars: ' \+ fsControls\.length\);/, 'fullscreen DOM audit detects duplicate overlay control bars');
assert.match(html, /document\.addEventListener\('arcade-overlay-open',[\s\S]*auditDom\('after-overlay-open'\)/, 'fullscreen overlay open audit is wired');
assert.match(html, /document\.addEventListener\('arcade-overlay-close',[\s\S]*auditDom\('after-overlay-close'\)/, 'fullscreen overlay close audit is wired');
assert.equal((html.match(/class="game-card crystal-quest-card"/g) || []).length, 1, 'page contains one Crystal Quest root');
assert.doesNotMatch(html, /id="overlay-ctrl-bar"/, 'Crystal Quest page does not render its own overlay control bar');

assert.match(bootstrap, /run\.completed = true;[\s\S]*syncQuestRun\([\s\S]*finalizeCompletedRun\(\)/, 'completion still calls syncQuestRun then finalizeCompletedRun');
assert.match(bootstrap, /function syncQuestRun\(sessionData\)/, 'syncQuestRun function remains present');
assert.match(bootstrap, /function finalizeCompletedRun\(\)/, 'finalizeCompletedRun function remains present');
assert.match(bootstrap, /submitScore\(ArcadeSync\.getPlayer\(\), score, GAME_ID\)/, 'score submission contract remains present');

const mojibakeMarkers = /(?:â€”|â€“|â€¦|â€œ|â€�|â€™|â€˜|â€¢|ï¿½|ðŸ)/u;
for (const file of [htmlPath, bootPath]) {
  assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), mojibakeMarkers, `${file} contains no visible mojibake markers`);
}

console.log('crystal-quest-mobile-fullscreen-polish: passed');
