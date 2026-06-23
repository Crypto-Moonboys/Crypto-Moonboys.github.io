#!/usr/bin/env node
import assert from 'node:assert/strict';
import worker from '../workers/moonboys-api/worker-with-comment-moderation.js';

const BASE_URL = 'https://moonboys-api.test';
const SWARMSY_BRIDGE_TOKEN = 'test-swarmsy-token';
const SWARMSY_MODERATION_URL = 'https://swarmsy.test/api/swarmsy/internal/moderate-comment';

const REQUIRED_TABLES = new Set([
  'wiki_comments',
  'wiki_comment_votes',
  'wiki_page_likes',
  'wiki_citation_votes',
  'wiki_mission_completions',
]);

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
    const [a0] = this.args.map((arg) => String(arg));
    if (sql.includes("FROM sqlite_master WHERE type = 'table' AND name = ?")) {
      return REQUIRED_TABLES.has(a0) ? { name: a0 } : null;
    }
    if (sql.includes('SELECT xp_awarded, source, source_id, created_at FROM wiki_mission_completions')) return null;
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  async all() {
    const sql = this.normalizedSql();
    if (sql.includes('FROM wiki_comments') && sql.includes("status = 'approved'")) {
      const [pageId, limitRaw] = this.args;
      const limit = Math.max(1, Math.min(Number(limitRaw) || 20, 50));
      const results = Array.from(this.db.comments.values())
        .filter((row) => row.page_id === String(pageId) && row.status === 'approved')
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit);
      return { results };
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }

  async run() {
    const sql = this.normalizedSql();
    const args = this.args;
    if (sql.startsWith('INSERT INTO wiki_comments')) {
      const row = {
        id: String(args[0]),
        page_id: String(args[1]),
        telegram_id: args[2] == null ? null : String(args[2]),
        name: String(args[3]),
        email_hash: String(args[4]),
        avatar_url: args[5] == null ? null : String(args[5]),
        telegram_username: args[6] == null ? null : String(args[6]),
        discord_username: args[7] == null ? null : String(args[7]),
        text: String(args[8]),
        status: 'pending',
        votes_up: 0,
        votes_down: 0,
        created_at: new Date().toISOString(),
      };
      this.db.comments.set(row.id, row);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE wiki_comments SET status = ? WHERE id = ?')) {
      const status = String(args[0]);
      const commentId = String(args[1]);
      const row = this.db.comments.get(commentId);
      if (row) row.status = status;
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    throw new Error(`Unhandled run SQL: ${sql}`);
  }
}

class MockD1 {
  constructor() {
    this.comments = new Map();
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

function makeEnv(db, overrides = {}) {
  return {
    DB: db,
    SWARMSY_BRIDGE_TOKEN,
    SWARMSY_MODERATION_URL,
    ...overrides,
  };
}

async function api(db, pathName, body, envOverrides = {}) {
  const response = await worker.fetch(new Request(`${BASE_URL}${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }), makeEnv(db, envOverrides), {});
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function publicComments(db, pageId = 'wuffi') {
  const response = await worker.fetch(new Request(`${BASE_URL}/comments?page_id=${encodeURIComponent(pageId)}`, {
    method: 'GET',
  }), makeEnv(db), {});
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function run() {
  console.log('\nWiki comment SWARMSY auto-moderation regression\n');
  const originalFetch = globalThis.fetch;
  let swarmsyDecision = 'approved';
  let swarmsyCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    swarmsyCalls += 1;
    assert.equal(String(url), SWARMSY_MODERATION_URL, 'comment moderation uses dedicated SWARMSY moderation endpoint');
    assert.equal(init.headers['X-SWARMSY-BRIDGE-TOKEN'], SWARMSY_BRIDGE_TOKEN, 'bridge token is sent only server-to-server');
    const payload = JSON.parse(String(init.body || '{}'));
    assert.equal(payload.type, 'wiki_comment_moderation');
    assert.equal(payload.site, 'cryptomoonboys.com');
    assert(payload.comment_id, 'moderation payload includes comment id');
    assert(payload.text, 'moderation payload includes comment text');
    assert(!JSON.stringify(payload).includes('guest@example.com'), 'raw email is never sent to SWARMSY moderation');
    return new Response(JSON.stringify({ decision: swarmsyDecision, reason: `${swarmsyDecision}_by_swarmsy`, confidence: 0.91 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const approvedDb = new MockD1();
    swarmsyDecision = 'approved';
    const approved = await api(approvedDb, '/comments', {
      page_id: 'wuffi',
      name: 'Normal User',
      email: 'guest@example.com',
      text: 'This is a normal wiki comment.',
    });
    assert.equal(approved.response.status, 201);
    assert.equal(approved.json.status, 'approved', 'safe SWARMSY-approved comment returns approved');
    assert.equal(approved.json.moderation, 'approved');
    assert.equal(approved.json.moderation_source, 'swarmsy');
    assert(!JSON.stringify(approved.json).includes(SWARMSY_BRIDGE_TOKEN), 'SWARMSY bridge token is never exposed in post response');
    const approvedPublic = await publicComments(approvedDb);
    assert.equal(approvedPublic.json.comments.length, 1, 'approved comment is returned publicly');

    const rejectedDb = new MockD1();
    swarmsyDecision = 'rejected';
    const rejected = await api(rejectedDb, '/comments', {
      page_id: 'wuffi',
      name: 'Spam User',
      email: 'spam@example.com',
      text: 'Seed phrase wallet drain airdrop scam.',
    });
    assert.equal(rejected.response.status, 201);
    assert.equal(rejected.json.status, 'rejected', 'SWARMSY-rejected comment returns rejected');
    const rejectedPublic = await publicComments(rejectedDb);
    assert.equal(rejectedPublic.json.comments.length, 0, 'rejected comment is not returned publicly');

    const pendingDb = new MockD1();
    const pending = await api(pendingDb, '/comments', {
      page_id: 'wuffi',
      name: 'Fallback User',
      email: 'fallback@example.com',
      text: 'Moderation token missing should leave this pending.',
    }, { SWARMSY_BRIDGE_TOKEN: '' });
    assert.equal(pending.response.status, 201);
    assert.equal(pending.json.status, 'pending', 'missing SWARMSY token leaves comment pending');
    const pendingPublic = await publicComments(pendingDb);
    assert.equal(pendingPublic.json.comments.length, 0, 'pending comment is not returned publicly');

    assert.equal(swarmsyCalls, 2, 'missing token path does not call SWARMSY');
    console.log('Wiki comment SWARMSY auto-moderation regression PASSED.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
