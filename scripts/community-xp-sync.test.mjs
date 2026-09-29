import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../workers/moonboys-api/worker.js';
import { readCommunityLeaderboard } from '../workers/moonboys-api/community-leaderboard.js';
import { selectCommunitySeason } from '../workers/moonboys-api/community-season-authority.js';

// Exercise the command with a local message sink; never contact Telegram.
const source = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const commandSource = source.slice(source.indexOf('async function cmdGkLeaderboard('), source.indexOf('\nasync function cmdGkQuests('));
const messages = [];
const command = new Function('readCommunityLeaderboard', 'sendTelegramMessage', 'escapeHtml', 'displayNameFromRow', commandSource + ';return cmdGkLeaderboard;')(
  readCommunityLeaderboard, async (_token, _chat, message) => messages.push(message), value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'), row => row.first_name || row.telegram_id,
);

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
sql.exec("INSERT INTO telegram_users (telegram_id,xp) VALUES ('200',400),('100',400),('300',10)");
let failure = null;
const queries = [];
const db = { prepare(query) {
  queries.push(query);
  return { args: [], bind(...args) { this.args = args; return this; }, async all() {
    if (failure && query.includes(failure.table)) {
      if (failure.kind === 'throw') throw Error('read failed');
      if (failure.kind === 'resolved') return { success: false, error: 'read failed', results: [] };
      return { success: true };
    }
    return { success: true, results: sql.prepare(query).all(...this.args) };
  } };
} };
async function get(limit = 10) {
  const response = await worker.fetch(new Request('https://moonboys-api.test/telegram/leaderboard?limit=' + limit), { DB: db });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, data: await response.json() };
}

let result = await get();
assert.equal(result.status, 200);
assert.equal(result.data.score_basis, 'all_time');
assert.equal(result.data.season, null);
assert.deepEqual(result.data.entries.map(e => e.telegram_id), ['100', '200', '300'], 'ties use a stable owner order');
assert.equal((await get(-3)).data.entries.length, 1);
assert.equal((await get('NaN')).data.entries.length, 3);
assert.equal((await get('1.9')).data.entries.length, 1);
await command(db, 'fixture-token', 'fixture-chat');
assert.match(messages.pop(), /All-time Community XP[\s\S]*1\. 100 — 400 Community XP/);

for (const table of ['telegram_seasons', 'telegram_users']) {
  for (const kind of ['throw', 'resolved', 'malformed']) {
    failure = { table, kind }; queries.length = 0;
    assert.equal((await get()).status, 503, `${table}: ${kind} cannot turn into empty scores`);
    if (table === 'telegram_seasons') assert.equal(queries.length, 1, 'unknown season cannot fall back to all-time');
  }
}
failure = null;
sql.exec("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community A','2000-01-01','2999-01-01')");
result = await get();
assert.equal(result.data.score_basis, 'community_season');
assert.deepEqual(result.data.entries, [], 'empty season cannot display all-time XP');
await command(db, 'fixture-token', 'fixture-chat');
assert.match(messages.pop(), /Community season: Community A[\s\S]*No Community XP recorded for this period/);
sql.exec("INSERT INTO telegram_leaderboard (telegram_id,season_id,xp) VALUES ('100',1,3),('200',1,5)");
result = await get();
assert.deepEqual(result.data.entries.map(e => [e.rank, e.xp]), [[1, 5], [2, 3]]);
await command(db, 'fixture-token', 'fixture-chat');
assert.match(messages.pop(), /1\. 200 — 5 Community XP[\s\S]*2\. 100 — 3 Community XP/);
for (const kind of ['throw', 'resolved', 'malformed']) {
  failure = { table: 'FROM telegram_leaderboard', kind }; queries.length = 0;
  assert.equal((await get()).status, 503);
  assert.ok(!queries.some(q => q.includes('FROM telegram_users')), 'failed season scores cannot trigger all-time fallback');
  await command(db, 'fixture-token', 'fixture-chat');
  assert.equal(messages.pop(), 'Community XP is unavailable. Please retry /gkleaderboard.');
}
failure = null;
sql.exec("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community B','2000-01-01','2999-01-01')");
result = await get();
assert.equal(result.data.season.name, 'Community B');
assert.deepEqual(result.data.entries, [], 'new Community season cannot reuse earlier scores');
sql.exec("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Future','2999-01-01','3000-01-01'),('Expired','2000-01-01','2001-01-01'),('Overlap','2000-01-01','2999-01-01')");
assert.equal((await selectCommunitySeason(db, new Date('2026-09-29T00:00:00Z'))).name, 'Overlap', 'overlapping current seasons use start date then id ordering');
assert.equal((await selectCommunitySeason(db, new Date('2999-06-01T00:00:00Z'))).name, 'Future', 'future season becomes current only inside its date range');
sql.exec("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Timestamp Future','4000-01-01T12:00:00Z','4001-01-01T12:00:00Z')");
assert.equal(await selectCommunitySeason(db, new Date('4000-01-01T00:00:00Z')), null, 'timestamp-formatted future seasons stay inactive before their datetime start');
assert.equal((await selectCommunitySeason(db, new Date('4000-01-02T00:00:00Z'))).name, 'Timestamp Future', 'timestamp-formatted seasons use the same datetime boundary as reward writes');
assert.equal(await selectCommunitySeason(db, new Date('1999-01-01T00:00:00Z')), null, 'no active season is an explicit all-time period');
sql.close();
console.log('Community XP API: explicit score basis, empty season, bounds, stable ranks and fail-closed D1 reads passed');
