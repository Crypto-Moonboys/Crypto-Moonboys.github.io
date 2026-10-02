#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

function telegramCommentHash(id) {
  return `tg:${createHash('sha256').update(String(id)).digest('hex')}`;
}

// Execute real SQL so receipt, wallet, leaderboard and source atomicity are tested
// together; the old string-matching mock could acknowledge writes it never saved.
class MockStatement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new MockStatement(this.db, this.sql, args); }
  exec() {
    if (this.db.failCommentStatusUpdates && /UPDATE wiki_comments\s+SET status/.test(this.sql)) throw Error('simulated_status_update_failure');
    if (this.db.failSql && this.db.failSql(this.sql)) throw Error('simulated_atomic_award_failure');
    const statement = this.db.sqlite.prepare(this.sql);
    if (statement.columns().length) {
      const results = statement.all(...this.args);
      return { success: true, results, meta: { changes: /\bRETURNING\b/i.test(this.sql) ? results.length : 0 } };
    }
    return { success: true, results: [], meta: { changes: Number(statement.run(...this.args).changes) } };
  }
  readFailure() {
    if (!this.db.readFailure || !this.sql.includes('FROM ' + this.db.readFailure.table)) return null;
    if (this.db.readFailure.kind === 'thrown') throw Error('simulated_award_read_failure');
    return this.db.readFailure.kind === 'resolved' ? { success: false, error: 'simulated_award_read_failure' } : {};
  }
  async first() { return this.readFailure() || this.exec().results[0] || null; }
  async all() { return this.readFailure() || this.exec(); }
  async run() { return this.exec(); }
}

let fixtureNumber = 0;
class MockD1 {
  constructor({ missingTables = [], failCommentStatusUpdates = false } = {}) {
    this.clientIp = '192.0.2.' + ++fixtureNumber;
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(read('workers/moonboys-api/schema.sql'));
    this.sqlite.exec(read('workers/moonboys-api/migrations/029_wiki_engagement.sql'));
    for (const table of missingTables) {
      assert.ok(REQUIRED_TABLES.includes(table));
      this.sqlite.exec(`DROP TABLE ${table}`);
    }
    this.failCommentStatusUpdates = failCommentStatusUpdates;
    this.failSql = null;
    this.readFailure = null;
    const sql = this.sqlite;
    this.comments = {
      get(id) { return sql.prepare('SELECT * FROM wiki_comments WHERE id=?').get(String(id)); },
      get size() { return sql.prepare('SELECT COUNT(*) count FROM wiki_comments').get().count; },
    };
    this.linkConfirmed = { set(id) {
      sql.prepare('INSERT OR IGNORE INTO telegram_users (telegram_id) VALUES (?)').run(String(id));
      sql.prepare("INSERT INTO telegram_activity_log (telegram_id,action) VALUES (?,'link_confirmed')").run(String(id));
    } };
    this.blocktopiaProgression = { set(id, row) {
      sql.prepare('INSERT INTO blocktopia_progression (telegram_id,xp) VALUES (?,?)').run(String(id), row.xp);
    } };
  }
  get xpLog() { return this.sqlite.prepare('SELECT * FROM telegram_xp_log ORDER BY id').all(); }
  prepare(sql) { return new MockStatement(this, sql); }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map(statement => statement.exec());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

function makeEnv(db, overrides = {}) {
  return { DB: db, TELEGRAM_BOT_TOKEN, ...overrides };
}

async function api(db, pathName, body, method = 'POST', envOverrides = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': db.clientIp };
  const init = method === 'GET'
    ? { method, headers }
    : { method, headers, body: JSON.stringify(body || {}) };
  const response = await worker.fetch(new Request(`${BASE_URL}${pathName}`, init), makeEnv(db, envOverrides), {});
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

  const guestDb = new MockD1();
  const blankGuest = await api(guestDb, '/comments', {
    page_id: 'wuffi',
    name: 'No Email Guest',
    text: 'No email and no Telegram should fail.',
  });
  assert.equal(blankGuest.response.status, 400, 'blank email plus no Telegram auth is rejected');
  assert.equal(blankGuest.json.error, 'valid email or linked Telegram auth required');
  assert.equal(guestDb.comments.size, 0, 'rejected blank-email guest comment is not stored');

  const emailGuest = await api(guestDb, '/comments', {
    page_id: 'wuffi',
    name: 'Email Guest',
    email: 'guest@example.com',
    text: 'Email-only comment still works.',
  });
  assert.equal(emailGuest.response.status, 201, 'valid email plus no Telegram still works');
  assert.equal(emailGuest.json.status, 'pending', 'email-only comment remains pending');
  assert.equal(emailGuest.json.moderation, 'pending', 'email-only moderation remains pending');
  assert.equal(emailGuest.json.mission.reward_status, 'telegram_sync_required');
  assert(!JSON.stringify(emailGuest.json).includes('guest@example.com'), 'raw email is not exposed in comment post response');
  assert.equal(guestDb.comments.get(emailGuest.json.comment_id).status, 'pending', 'email-only stored comment stays pending');
  const emailGuestGet = await api(guestDb, '/comments?page_id=wuffi', null, 'GET');
  assert.equal(emailGuestGet.json.comments.length, 0, 'email-only pending comment does not appear publicly');

  const approvedDb = new MockD1();
  const telegramAuth = signTelegramAuth(LINKED_ID);
  const approved = await api(approvedDb, '/comments', {
    page_id: 'wuffi',
    name: 'Telegram Approved',
    text: 'Verified Telegram comment should publish immediately.',
    avatar_url: 'https://t.me/i/userpic/320/linked.jpg',
    telegram_auth: telegramAuth,
    telegram_username: 'linked_mod',
    discord_username: 'mod#1234',
  });
  assert.equal(approved.response.status, 201, 'Telegram-linked signed comment with blank email returns 201');
  assert.equal(approved.json.status, 'approved', 'Telegram-linked signed comment with blank email becomes approved');
  assert.equal(approved.json.moderation, 'approved', 'Telegram-linked signed comment moderation is approved');
  assert.equal(approved.json.message, 'Comment posted.');
  assert(!JSON.stringify(approved.json).includes('telegram_auth'), 'raw telegram_auth is not exposed in approved comment response');
  const approvedRow = approvedDb.comments.get(approved.json.comment_id);
  assert.equal(approvedRow.email_hash, telegramCommentHash(LINKED_ID), 'Telegram blank-email comment stores deterministic non-email hash');
  assert.equal(approvedRow.status, 'approved', 'Telegram auto-approval updates stored status approved');
  const approvedGet = await api(approvedDb, '/comments?page_id=wuffi', null, 'GET');
  assert.equal(approvedGet.json.comments.length, 1, 'approved Telegram-linked comment appears in public GET /comments');
  assert.equal(approvedGet.json.comments[0].id, approved.json.comment_id);

  const statusUpdateFailDb = new MockD1({ failCommentStatusUpdates: true });
  const statusUpdateFail = await api(statusUpdateFailDb, '/comments', {
    page_id: 'wuffi',
    name: 'Telegram Update Fail',
    text: 'Auto-approval update failure should fail closed.',
    telegram_auth: telegramAuth,
  });
  assert.equal(statusUpdateFail.response.status, 201, 'status update failure after Telegram auto-approval returns 201');
  assert.equal(statusUpdateFail.json.status, 'pending', 'status update failure after Telegram auto-approval returns pending');
  assert.equal(statusUpdateFail.json.moderation, 'pending', 'status update failure response moderation is pending');
  assert.equal(statusUpdateFail.json.message, 'Comment received and awaiting automated review.');
  const statusUpdateFailGet = await api(statusUpdateFailDb, '/comments?page_id=wuffi', null, 'GET');
  assert.equal(statusUpdateFailGet.json.comments.length, 0, 'status update failure leaves comment out of public GET');

  const db = new MockD1();
  db.linkConfirmed.set(LINKED_ID, { action: 'link_confirmed', created_at: new Date().toISOString() });
  const linkedAuth = signTelegramAuth(LINKED_ID);

  const engage1 = await api(db, '/comments', {
    page_id: 'wuffi',
    name: 'Linked User',
    text: 'Engage mission source with Telegram fallback avatar hash.',
    avatar_url: 'https://t.me/i/userpic/320/linked.jpg',
    telegram_auth: linkedAuth,
  });
  assert.equal(engage1.response.status, 201);
  assert.equal(engage1.json.status, 'approved', 'verified Telegram comments auto-approve while Engage reward timing stays submission-based');
  assert.equal(engage1.json.mission.reward_status, 'xp_synced');
  assert.equal(engage1.json.mission.mission_id, 'engage');
  const linkedComment = db.comments.get(engage1.json.comment_id);
  assert.equal(linkedComment.email_hash, telegramCommentHash(LINKED_ID), 'Telegram fallback email_hash is deterministic');
  assert(linkedComment.email_hash.startsWith('tg:'), 'Telegram fallback email_hash is explicitly non-Gravatar');
  assert(!linkedComment.email_hash.includes(LINKED_ID), 'Telegram fallback email_hash does not contain raw telegram_id');
  assert.equal(linkedComment.avatar_url, 'https://t.me/i/userpic/320/linked.jpg', 'Telegram avatar URL is stored when supplied');
  assert(!JSON.stringify(engage1.json).includes('telegram_auth'), 'raw Telegram auth is not exposed in comment post response');

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

  // The durable Like survives an XP outage, while all award projections and
  // mission completion roll back together. Retrying the same Like recovers it.
  for (const failedWrite of ['telegram_xp_log', 'telegram_users', 'telegram_leaderboard', 'wiki_mission_completions']) {
    const recoveryDb = new MockD1();
    recoveryDb.linkConfirmed.set(LINKED_ID);
    recoveryDb.sqlite.prepare("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Wiki rewards','2000-01-01','2999-01-01')").run();
    let failureInjected = false;
    recoveryDb.failSql = sql => {
      const fails = failedWrite === 'telegram_users'
        ? /UPDATE telegram_users SET xp/.test(sql)
        : new RegExp('INSERT(?: OR IGNORE)? INTO ' + failedWrite).test(sql);
      failureInjected ||= fails;
      return fails;
    };
    const failed = await api(recoveryDb, '/likes', { page_id: 'wuffi', telegram_auth: linkedAuth });
    assert.equal(failed.response.status, 500, failedWrite + ' failure cannot acknowledge an unsaved reward');
    assert.equal(failureInjected, true, failedWrite + ' failure must be exercised');
    for (const table of ['telegram_community_xp_awards', 'telegram_xp_log', 'telegram_leaderboard', 'wiki_mission_completions']) {
      assert.equal(recoveryDb.sqlite.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count, 0, failedWrite + ': ' + table + ' rolls back');
    }
    assert.equal(recoveryDb.sqlite.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(LINKED_ID).xp, 0);
    assert.equal(recoveryDb.sqlite.prepare('SELECT COUNT(*) count FROM wiki_page_likes').get().count, 1, 'verified source Like is retained');
    recoveryDb.failSql = null;
    const recovered = await api(recoveryDb, '/likes', { page_id: 'wuffi', telegram_auth: linkedAuth });
    assert.equal(recovered.response.status, 200);
    assert.equal(recovered.json.already_liked, true);
    assert.equal(recovered.json.mission.reward_status, 'xp_synced');
    assert.equal(recovered.json.mission.xp_awarded, 10);
    const replay = await api(recoveryDb, '/likes', { page_id: 'wuffi', telegram_auth: linkedAuth });
    assert.equal(replay.json.mission.reward_status, 'already_completed');
    assert.equal(replay.json.mission.xp_awarded, 0);
    assert.equal(recoveryDb.xpLog.length, 1);
    assert.equal(recoveryDb.sqlite.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(LINKED_ID).xp, 10);
    assert.equal(recoveryDb.sqlite.prepare('SELECT xp FROM telegram_leaderboard WHERE telegram_id=?').get(LINKED_ID).xp, 10);
    assert.equal(recoveryDb.sqlite.prepare('SELECT COUNT(*) count FROM wiki_mission_completions').get().count, 1);
    assert.equal(recoveryDb.sqlite.prepare('SELECT COUNT(*) count FROM telegram_community_xp_awards').get().count, 1);
    recoveryDb.sqlite.close();
  }

  for (const table of ['wiki_mission_completions', 'telegram_community_xp_awards', 'telegram_xp_log', 'telegram_seasons']) {
    for (const kind of ['thrown', 'resolved', 'malformed']) {
      const unreadableDb = new MockD1();
      const unreadableId = String(30000 + fixtureNumber), unreadableAuth = signTelegramAuth(unreadableId);
      unreadableDb.linkConfirmed.set(unreadableId);
      unreadableDb.readFailure = { table, kind };
      const failed = await api(unreadableDb, '/likes', { page_id: 'wuffi', telegram_auth: unreadableAuth });
      assert.equal(failed.response.status, 500, table + ': ' + kind + ' cannot acknowledge a completion or empty award history');
      assert.equal(unreadableDb.xpLog.length, 0);
      assert.equal(unreadableDb.sqlite.prepare('SELECT COUNT(*) count FROM telegram_community_xp_awards').get().count, 0);
      assert.equal(unreadableDb.sqlite.prepare('SELECT COUNT(*) count FROM wiki_mission_completions').get().count, 0);
      unreadableDb.readFailure = null;
      const recovered = await api(unreadableDb, '/likes', { page_id: 'wuffi', telegram_auth: unreadableAuth });
      assert.equal(recovered.response.status, 200);
      assert.equal(recovered.json.already_liked, true);
      assert.equal(recovered.json.mission.xp_awarded, 10);
      assert.equal(unreadableDb.xpLog.length, 1);
      unreadableDb.sqlite.close();
    }
  }

  const apiConfig = read('js/api-config.js');
  assert(apiConfig.includes('COMMENTS:           true'), 'comments feature flag is enabled after migration/deploy verification');
  assert(apiConfig.includes('LIKES:              true'), 'likes feature flag is enabled after migration/deploy verification');
  assert(apiConfig.includes('CITATION_VOTES:     true'), 'citation votes feature flag is enabled after migration/deploy verification');

  const gif = 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXJ4dHVlaHJ0ZWdvem92dW1zanFyYnc5bmxmM3Fyb2N6Z2YxbG55dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GwigOL3Iw4kAa2ugsZ/giphy.gif';
  const battleLayer = read('js/battle-layer.js');
  const alcor = read('wiki/alcor-exchange.html');
  assert(battleLayer.includes('wuffi:') && battleLayer.includes(gif), 'WUF GIF remains WUFFI-only in page media map');
  assert(!alcor.includes(gif), 'other wiki pages do not receive WUF GIF');

  console.log('Wiki engagement API route regression PASSED.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
