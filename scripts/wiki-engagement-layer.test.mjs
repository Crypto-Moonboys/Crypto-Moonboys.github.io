#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WUF_GIF = 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXJ4dHVlaHJ0ZWdvem92dW1zanFyYnc5bmxmM3Fyb2N6Z2YxbG55dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GwigOL3Iw4kAa2ugsZ/giphy.gif';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function check(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[PASS] ${message}`);
}

const battleLayer = read('js/battle-layer.js');
const engagement = read('js/engagement.js');
const comments = read('js/comments.js');
const css = read('css/battle-layer.css');
const apiConfig = read('js/api-config.js');
const worker = read('workers/moonboys-api/worker.js');
const wuffi = read('wiki/wuffi.html');
const alcor = read('wiki/alcor-exchange.html');
const rugPullWars = read('wiki/rug-pull-wars.html');

console.log('\nWiki engagement layer regression\n');

check(battleLayer.includes('wuffi:') && battleLayer.includes(WUF_GIF), 'WUF Battle Heat media map uses the exact supplied GIF');
check(!alcor.includes(WUF_GIF) && !rugPullWars.includes(WUF_GIF), 'Other wiki pages do not hardcode the WUF GIF');
check(css.includes('.battle-page-media') && css.includes('max-height: 260px'), 'Battle Heat page media has responsive CSS');

check(battleLayer.includes('<h3>Daily Missions</h3>') && battleLayer.includes('MISSION_DEFINITIONS'), 'Daily Missions render from mission definitions on wiki pages');
check(battleLayer.includes("ensurePageLikeWidget(pageId)") && battleLayer.includes("className = 'page-like-widget'"), 'Page-like widget is auto-injected when missing');
check(battleLayer.includes("'.citations-list li, .source-ref-list li'"), 'Citation votes inject into both citations-list and source-ref-list items');
check(wuffi.includes('class="source-ref-list"'), 'WUF uses source-ref-list and is covered by citation injection');

check(engagement.includes('COPY.FEATURE_UNAVAILABLE') && battleLayer.includes('mission-status--unavailable'), 'Disabled engagement features show unavailable state');
check(apiConfig.includes('COMMENTS:           false') && apiConfig.includes('LIKES:              false') && apiConfig.includes('CITATION_VOTES:     false'), 'Article engagement feature flags remain disabled');

check(comments.includes("CustomEvent('moonboys:comment-posted'"), 'Successful comment posts notify mission completion');
check(engagement.includes("CustomEvent('moonboys:page-liked'"), 'Successful page likes notify mission completion');
check(engagement.includes("CustomEvent('moonboys:citation-voted'"), 'Successful citation votes notify mission completion');
check(battleLayer.includes('if (isMissionComplete(pageId, missionId)) return;'), 'Mission completion is guarded once per page/window');
check(battleLayer.includes("window.sessionStorage.setItem(getMissionStorageKey(pageId, missionId), 'complete')"), 'Mission completion persists once per session mission window');
check(battleLayer.includes("CustomEvent(WIKI_MISSION_EVENT"), 'Mission layer emits a reward/completion event for Telegram-linked reward plumbing');

check(!worker.includes("path === '/comments'") && !worker.includes("path === '/likes'") && !worker.includes("path === '/citation-votes'"), 'Backend audit confirms article engagement routes are not live in moonboys-api worker');

if (process.exitCode) {
  console.error('\nWiki engagement layer regression FAILED.\n');
  process.exit(process.exitCode);
}

console.log('\nWiki engagement layer regression PASSED.\n');
