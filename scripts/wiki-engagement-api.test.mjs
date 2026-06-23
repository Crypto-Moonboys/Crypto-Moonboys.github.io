#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const worker = read('workers/moonboys-api/worker.js');
const migration = read('workers/moonboys-api/migrations/029_wiki_engagement.sql');
const apiConfig = read('js/api-config.js');
const battleLayer = read('js/battle-layer.js');
const engagement = read('js/engagement.js');
const comments = read('js/comments.js');
const wuffi = read('wiki/wuffi.html');
const waxcash = read('waxcash.html');

console.log('\nWiki engagement API regression\n');

for (const table of [
  'wiki_comments',
  'wiki_comment_votes',
  'wiki_page_likes',
  'wiki_citation_votes',
  'wiki_mission_completions',
]) {
  check(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `migration creates ${table}`);
  check(worker.includes(`'${table}'`), `worker requires ${table} before live routes`);
}

check(migration.includes('PRIMARY KEY (page_id, mission_id, mission_window, telegram_id)'), 'mission completions are unique per page/mission/day/user');
check(migration.includes('PRIMARY KEY (page_id, telegram_id)'), 'page likes are unique per page/user');
check(migration.includes('PRIMARY KEY (page_id, cite_id, telegram_id)'), 'citation votes are unique per page/citation/user');
check(migration.includes('PRIMARY KEY (comment_id, telegram_id)'), 'comment votes are unique per comment/user');

check(worker.includes("path === '/comments' && request.method === 'GET'"), 'GET /comments route exists');
check(worker.includes("path === '/comments' && request.method === 'POST'"), 'POST /comments route exists');
check(worker.includes("path.match(/^\\/comments\\/([^/]+)\\/vote$/)"), 'POST /comments/:id/vote route exists');
check(worker.includes("path === '/likes' && request.method === 'GET'"), 'GET /likes route exists');
check(worker.includes("path === '/likes' && request.method === 'POST'"), 'POST /likes route exists');
check(worker.includes("path === '/citation-votes' && request.method === 'GET'"), 'GET /citation-votes route exists');
check(worker.includes("path === '/citation-votes' && request.method === 'POST'"), 'POST /citation-votes route exists');
check(worker.includes("path === '/wiki-missions/complete' && request.method === 'POST'"), 'POST /wiki-missions/complete route exists');
check(worker.includes("path === '/wiki-missions/status'"), 'wiki mission status route exists');

check(worker.includes('verifyRequiredWikiTelegram(body, env)'), 'rewarded/competitive routes require signed Telegram auth');
check(worker.includes('verifyOptionalWikiTelegram(body, env)'), 'comment posting can attach signed Telegram auth without requiring it');
check(worker.includes("return { error: verified.error, status: verified.status || 401 };"), 'invalid Telegram auth is rejected before rewards');
check(worker.includes("reward_status: 'telegram_sync_required'"), 'non-linked users cannot receive mission rewards');

check(worker.includes("missionId: 'engage'") && worker.includes("source: 'comments'"), 'comment post completes Engage from accepted action');
check(worker.includes("missionId: 'signal'") && worker.includes("source: 'likes'"), 'page like completes Signal from accepted action');
check(worker.includes("missionId: 'cite'") && worker.includes("source: 'citation-votes'"), 'citation vote completes Cite from accepted action');
check(worker.includes('INSERT OR IGNORE INTO wiki_mission_completions'), 'mission completion insert is idempotent');
check(worker.includes("already_completed: !inserted"), 'duplicate mission completion returns already completed');
check(worker.includes("await awardXp(db, verified.telegramId, WIKI_MISSION_XP, 'wiki_mission_complete', referenceId)"), 'XP is awarded only after the mission completion insert wins');

check(comments.includes('payload.telegram_auth = telegramAuth'), 'comments send signed Telegram auth when available');
check(engagement.includes('payload.telegram_auth = telegramAuth'), 'likes and citation votes send signed Telegram auth');
check(comments.includes('mission: data && data.mission ? data.mission : null'), 'comment success event includes backend mission status');
check(engagement.includes('mission: data.mission || null') && engagement.includes('mission: data && data.mission ? data.mission : null'), 'engagement success events include backend mission status');
check(battleLayer.includes('hydrateMissionStatus(pageId)'), 'Daily Missions hydrate real backend state');
check(battleLayer.includes('if (!mission || mission.completed !== true) return;'), 'Daily Missions do not trust local events as reward authority');

check(apiConfig.includes('COMMENTS:           true'), 'comments feature flag enabled for implemented route');
check(apiConfig.includes('LIKES:              true'), 'likes feature flag enabled for implemented route');
check(apiConfig.includes('CITATION_VOTES:     true'), 'citation votes feature flag enabled for implemented route');
check(apiConfig.includes('LEADERBOARD:        false') && apiConfig.includes('LIVE_FEED:          false') && apiConfig.includes('ACTIVITY_PANEL:     false'), 'unimplemented panels remain disabled');

check(wuffi.includes('id="wuf-alcor-chart"') || wuffi.includes('WUF token analytics') || wuffi.includes('Alcor'), 'WUF analytics/chart content remains present');
check(waxcash.includes('WAXCASH'), 'WAXCASH page remains present and unchanged by wiki engagement routes');

if (process.exitCode) {
  console.error('\nWiki engagement API regression FAILED.\n');
  process.exit(process.exitCode);
}

console.log('\nWiki engagement API regression PASSED.\n');
