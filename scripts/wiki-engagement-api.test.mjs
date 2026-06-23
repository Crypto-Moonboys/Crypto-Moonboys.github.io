#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../workers/moonboys-api/worker.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'https://moonboys-api.test';
const TELEGRAM_BOT_TOKEN = '123456:test-bot-token';
const LINKED_ID = '10001';
const UNLINKED_ID = '10002';

const REQUIRED_TABLES = [
  'wiki_comments',
  'wiki_comment_votes',
  'wiki_page_likes',
  'wiki_citation_votes',
  'wiki_mission_completions',
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function signTelegramAuth(id) {
  const fields = {
    id: String(id),
    first_name: `User${id}`,
    username: `user_${id}`,
    auth_date: String(Math.floor(Date.now() / 1000)),
  };
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return { ...fields, hash };
}

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  normalizedSql() {
    return this.sql.replace(/\s+/g, ' ').trim();
  }

  async first() {
    const sql = this.normalizedSql();
    const [a0, a1, a2, a3] = this.args.map((arg) => String(arg));

    if (sql.includes("FROM sqlite_master WHERE type = 'table' AND name = ?")) {
      return this.db.missingTables.has(a0) ? null : { name: a0 };
    }
    if (sql.includes('SELECT u.telegram_id FROM telegram_users u') && sql.includes("al.action = 'link_confirmed'")) {
      return this.db.telegramUsers.has(a0) && this.db.linkConfirmed.has(a0)
        ? { telegram_id: a0 }
        : null;
    }
    if (sql.includes('SELECT xp_awarded, source, source_id, created_at FROM wiki_mission_completions')) {
      return this.db.missionCompletions.get(`${a0}:${a1}:${a2}:${a3}`) || null;
    }
    if (sql.includes('SELECT COUNT(*) AS count FROM wiki_page_likes WHERE page_id = ?')) {
      let count = 0;
      for (const like of this.db.pageLikes.values()) {
        if (like.page_id === a0) count += 1;
      }
      return { count };
    }
    if (sql.includes('SELECT vote FROM wiki_citation_votes')) {
      return this.db.citationVotes.get(`${a0}:${a1}:${a2}`) || null;
    }
    if (sql.includes('FROM wiki_citation_votes') && sql.includes('SUM(CASE WHEN vote')) {
      let score = 0;
      let up = 0;
      let down = 0;
      for (const row of this.db.citationVotes.values()) {
        if (row.page_id !== a0 || row.cite_id !== a1) continue;
        if (row.vote === 'up') { score += 1; up += 1; }
        if (row.vote === 'down') { score -= 1; down += 1; }
      }
      return { score, up, down };
    }
    if (sql.includes('SELECT id FROM wiki_comments WHERE id = ? AND page_id = ? AND telegram_id = ?')) {
      const row = this.db.comments.get(a0);
      return row && row.page_id === a1 && row.telegram_id === a2 ? { id: row.id } : null;
    }
    if (sql.includes('SELECT page_id FROM wiki_page_likes WHERE page_id = ? AND telegram_id = ?')) {
      const row = this.db.pageLikes.get(`${a0}:${a1}`);
      return row ? { page_id: row.page_id } : null;
    }
    if (sql.includes('SELECT cite_id FROM wiki_citation_votes WHERE page_id = ? AND cite_id = ? AND telegram_id = ?')) {
      const row = this.db.citationVotes.get(`${a0}:${a1}:${a2}`);
      return row ? { cite_id: row.cite_id } : null;
    }
    if (sql.includes('SELECT id FROM wiki_comments WHERE id = ? LIMIT 1')) {
      return this.db.comments.has(a0) ? { id: a0 } : null;
    }
    if (sql.includes('SELECT votes_up, votes_down FROM wiki_comments WHERE id = ? LIMIT 1')) {
      const row = this.db.comments.get(a0);
      return row ? { votes_up: row.votes_up || 0, votes_down: row.votes_down || 0 } : null;
    }
    if (sql.includes('SELECT vote FROM wiki_comment_votes WHERE comment_id = ? AND telegram_id = ?')) {
      return this.db.commentVotes.get(`${a0}:${a1}`) || null;
    }
    if (sql.includes('FROM telegram_users WHERE telegram_id = ?')) {
      return this.db.telegramUsers.get(a0) || null;
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  async all() {
    const sql = this.normalizedSql();
    if (sql.includes('FROM wiki_comments') && sql.includes("status = 'approved'")) return { results: [] };
    if (sql.includes('FROM wiki_mission_completions') && sql.includes('WHERE page_id = ?')) {
      const [pageId, missionWindow, telegramId] = this.args.map((arg) => String(arg));
      const results = [];
      for (const row of this.db.missionCompletions.values()) {
        if (row.page_id === pageId && row.mission_window === missionWindow && row.telegram_id === telegramId) {
          results.push(row);
        }
      }
      return { results };
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }

  async run() {
    const sql = this.normalizedSql();
    const args = this.args;

    if (sql.startsWith('INSERT INTO telegram_users')) {
      const telegramId = String(args[0]);
      const existing = this.db.telegramUsers.get(telegramId) || { telegram_id: telegramId, xp: 0, level: 1 };
      this.db.telegramUsers.set(telegramId, {
        ...existing,
        telegram_id: telegramId,
        username: args[1] || null,
        first_name: args[2] || null,
        last_name: args[3] || null,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO wiki_comments')) {
      const row = {
        id: String(args[0]),
        page_id: String(args[1]),
        telegram_id: args[2] == null ? null : String(args[2]),
        name: String(args[3]),
        email_hash: String(args[4]),
        text: String(args[8]),
        status: 'pending',
        votes_up: 0,
        votes_down: 0,
      };
      this.db.comments.set(row.id, row);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT OR IGNORE INTO wiki_page_likes')) {
      const key = `${args[0]}:${args[1]}`;
      if (this.db.pageLikes.has(key)) return { success: true, meta: { changes: 0 } };
      this.db.pageLikes.set(key, { page_id: String(args[0]), telegram_id: String(args[1]) });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO wiki_citation_votes')) {
      const key = `${args[0]}:${args[1]}:${args[2]}`;
      this.db.citationVotes.set(key, {
        page_id: String(args[0]),
        cite_id: String(args[1]),
        telegram_id: String(args[2]),
        vote: String(args[3]),
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT OR IGNORE INTO wiki_mission_completions')) {
      const key = `${args[0]}:${args[1]}:${args[2]}:${args[3]}`;
      if (this.db.missionCompletions.has(key)) return { success: true, meta: { changes: 0 } };
      this.db.missionCompletions.set(key, {
        page_id: String(args[0]),
        mission_id: String(args[1]),
        mission_window: String(args[2]),
        telegram_id: String(args[3]),
        source: args[4] == null ? null : String(args[4]),
        source_id: args[5] == null ? null : String(args[5]),
        xp_awarded: Number(args[6]) || 0,
        created_at: new Date().toISOString(),
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO telegram_xp_log')) {
      this.db.xpLog.push({
        telegram_id: String(args[0]),
        action: String(args[1]),
        xp_change: Number(args[2]) || 0,
        reference_id: args[3] == null ? null : String(args[3]),
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE telegram_users SET xp')) {
      const telegramId = String(args[2]);
      const row = this.db.telegramUsers.get(telegramId) || { telegram_id: telegramId, xp: 0, level: 1 };
      row.xp = Number(row.xp || 0) + Number(args[0] || 0);
      row.level = Math.floor(row.xp / 100) + 1;
      this.db.telegramUsers.set(telegramId, row);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO telegram_activity_log')) {
      this.db.activityLog.push({
        telegram_id: String(args[0]),
        action: String(args[1]),
        metadata: args[2],
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO wiki_comment_votes')) {
      const key = `${args[0]}:${args[1]}`;
      this.db.commentVotes.set(key, { comment_id: String(args[0]), telegram_id: String(args[1]), vote: String(args[2]) });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE wiki_comments SET votes_up')) {
      const vote = String(args[0]);
      const commentId = String(args[2]);
      const row = this.db.comments.get(commentId);
      if (row && vote === 'up') row.votes_up = (row.votes_up || 0) + 1;
      if (row && vote === 'down') row.votes_down = (row.votes_down || 0) + 1;
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    throw new Error(`Unhandled run SQL: ${sql}`);
  }
}

class MockD1 {
  constructor({ missingTables = [] } = {}) {
    this.missingTables = new Set(missingTables);
    this.telegramUsers = new Map();
    this.linkConfirmed = new Map();
    this.blocktopiaProgression = new Map();
    this.comments = new Map();
    this.commentVotes = new Map();
    this.pageLikes = new Map();
    this.citationVotes = new Map();
    this.missionCompletions = new Map();
    this.xpLog = [];
    this.activityLog = [];
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

function makeEnv(db) {
  return { DB: db, TELEGRAM_BOT_TOKEN };
}

async function api(db, pathName, body, method = 'POST') {
  const init = method === 'GET'
    ? { method }
    : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) };
  const response = await worker.fetch(new Request(`${BASE_URL}${pathName}`, init), makeEnv(db), {});
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function run() {
  console.log('\nWiki engagement API route regression\n');

  const migration = read('workers/moonboys-api/migrations/029_wiki_engagement.sql');
  for (const table of REQUIRED_TABLES) {
    assert(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `migration creates ${table}`);
  }

  const missingDb = new MockD1({ missingTables: ['wiki_comments'] });
  const missing = await api(missingDb, '/likes?page_id=wuffi', null, 'GET');
  assert.equal(missing.response.status, 503, 'migration missing returns clean 503');
  assert.equal(missing.json.error, 'wiki_engagement_unavailable');

  const unlinkedDb = new MockD1();
  const unlinkedAuth = signTelegramAuth(UNLINKED_ID);
  unlinkedDb.blocktopiaProgression.set(UNLINKED_ID, { telegram_id: UNLINKED_ID, xp: 1 });
  const unlinkedComment = await api(unlinkedDb, '/comments', {
    page_id: 'wuffi',
    name: 'Signed Not Linked',
    email: 'not-linked@example.com',
    text: 'Signed auth and progression alone should not earn XP.',
    telegram_auth: unlinkedAuth,
  });
  assert.equal(unlinkedComment.response.status, 201);
  assert.equal(unlinkedComment.json.mission.reward_status, 'telegram_link_required');
  assert.equal(unlinkedDb.xpLog.length, 0, 'signed auth plus blocktopia_progression but no link_confirmed cannot earn XP');

  const db = new MockD1();
  db.linkConfirmed.set(LINKED_ID, { action: 'link_confirmed', created_at: new Date().toISOString() });
  const linkedAuth = signTelegramAuth(LINKED_ID);

  const engage1 = await api(db, '/comments', {
    page_id: 'wuffi',
    name: 'Linked User',
    email: 'linked@example.com',
    text: 'Engage mission source.',
    telegram_auth: linkedAuth,
  });
  assert.equal(engage1.response.status, 201);
  assert.equal(engage1.json.status, 'pending', 'Engage rewards are submission-timed for stored pending comments');
  assert.equal(engage1.json.mission.reward_status, 'xp_synced');
  assert.equal(engage1.json.mission.mission_id, 'engage');

  const engage2 = await api(db, '/comments', {
    page_id: 'wuffi',
    name: 'Linked User',
    email: 'linked@example.com',
    text: 'Second comment should not farm Engage.',
    telegram_auth: linkedAuth,
  });
  assert.equal(engage2.response.status, 201);
  assert.equal(engage2.json.mission.reward_status, 'already_completed');

  const signal1 = await api(db, '/likes', { page_id: 'wuffi', telegram_auth: linkedAuth });
  assert.equal(signal1.response.status, 200);
  assert.equal(signal1.json.mission.reward_status, 'xp_synced');
  const signal2 = await api(db, '/likes', { page_id: 'wuffi', telegram_auth: linkedAuth });
  assert.equal(signal2.response.status, 200);
  assert.equal(signal2.json.mission.reward_status, 'already_completed');

  const cite1 = await api(db, '/citation-votes', {
    page_id: 'wuffi',
    cite_id: '1',
    vote: 'up',
    telegram_auth: linkedAuth,
  });
  assert.equal(cite1.response.status, 200);
  assert.equal(cite1.json.mission.reward_status, 'xp_synced');
  const cite2 = await api(db, '/citation-votes', {
    page_id: 'wuffi',
    cite_id: '1',
    vote: 'up',
    telegram_auth: linkedAuth,
  });
  assert.equal(cite2.response.status, 200);
  assert.equal(cite2.json.mission.reward_status, 'already_completed');

  assert.equal(db.xpLog.length, 3, 'linked user can complete Engage/Signal/Cite once only');
  assert.equal(db.xpLog.reduce((sum, row) => sum + row.xp_change, 0), 30, 'duplicate actions do not duplicate XP');

  const forged = await api(db, '/wiki-missions/complete', {
    page_id: 'wuffi',
    mission_id: 'cite',
    source: 'citation-votes',
    source_id: '999',
    telegram_auth: linkedAuth,
  });
  assert.equal(forged.response.status, 409, '/wiki-missions/complete without matching source action is rejected');
  assert.equal(db.xpLog.length, 3, 'forged direct completion does not award XP');

  const apiConfig = read('js/api-config.js');
  assert(apiConfig.includes('COMMENTS:           false'), 'comments feature flag stays false until migration/deploy are live');
  assert(apiConfig.includes('LIKES:              false'), 'likes feature flag stays false until migration/deploy are live');
  assert(apiConfig.includes('CITATION_VOTES:     false'), 'citation votes feature flag stays false until migration/deploy are live');

  const gif = 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXJ4dHVlaHJ0ZWdvem92dW1zanFyYnc5bmxmM3Fyb2N6Z2YxbG55dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GwigOL3Iw4kAa2ugsZ/giphy.gif';
  const battleLayer = read('js/battle-layer.js');
  const alcor = read('wiki/alcor-exchange.html');
  assert(battleLayer.includes('wuffi:') && battleLayer.includes(gif), 'WUF GIF remains WUFFI-only in page media map');
  assert(!alcor.includes(gif), 'other wiki pages do not receive WUF GIF');

  const waxcash = read('waxcash.html');
  const waxonedgeRoute = read('workers/moonboys-api/routes/waxonedge.js');
  assert(waxcash.includes('WAXCASH'), 'WAXCASH page remains present');
  assert(waxonedgeRoute.includes('cachedAnalyticsPayload'), 'WaxOnEdge cache route remains present');

  console.log('Wiki engagement API route regression PASSED.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
