import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const {
  processPetMiniAppAction,
  getPetArenaBattleForPlayer,
  getPetArenaQueueState,
  getPetKaijuMatchForPlayer,
  getPetKaijuQueueState,
  serializePetMiniAppArenaBattle,
  serializePetMiniAppKaijuMatch,
} = __petMediaTestHooks;

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.adapter.database.prepare(this.sql).all(...this.args) }; }
  async run() {
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { results: [], meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor() { this.database = new DatabaseSync(':memory:'); this.database.exec(schema); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) {
        const result = this.database.prepare(statement.sql).run(...statement.args);
        results.push({ results: [], meta: { changes: Number(result.changes || 0) } });
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function seedPlayer(db, telegramId, name, xp) {
  db.database.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(telegramId, name);
  db.database.prepare(`INSERT INTO telegram_pet_profiles
    (telegram_id, pet_name, pet_xp, level, health, energy, happiness, cleanliness, moon_gold)
    VALUES (?, ?, ?, 20, 100, 100, 90, 90, 100)`).run(telegramId, name, xp);
}

const db = new D1();
seedPlayer(db, 'arena-one', 'Alley Cat', 1500);
seedPlayer(db, 'arena-two', 'Cyber Cat', 1520);
seedPlayer(db, 'kaiju-one', 'Kaiju Cat', 1400);
seedPlayer(db, 'kaiju-two', 'Sticker Cat', 1450);

const act = (telegramId, action, payload = {}) => processPetMiniAppAction(db, telegramId, { id: telegramId }, {
  action,
  request_id: `${action}:${telegramId}:${crypto.randomUUID()}`,
  ...payload,
}, '123456:test-token');

const arenaQueued = await act('arena-one', 'arena_matchmake');
assert.equal(arenaQueued.reason, 'arena_queued');
assert.equal((await getPetArenaQueueState(db, 'mini:arena:global', 'arena-one')).waiting, true);

const arenaMatched = await act('arena-two', 'arena_matchmake');
assert.equal(arenaMatched.reason, 'arena_match_found');
const arenaBattle = await getPetArenaBattleForPlayer(db, 'mini:arena:global', 'arena-one');
assert.ok(arenaBattle?.battle_id);
assert.equal(await getPetArenaQueueState(db, 'mini:arena:global', 'arena-one'), null);
assert.equal(serializePetMiniAppArenaBattle(arenaBattle, 'arena-two').player.pet_name, 'Cyber Cat', 'arena state must orient each player as self');

const firstReady = await act('arena-one', 'arena_ready', { battle_id: arenaBattle.battle_id });
assert.equal(firstReady.reason, 'waiting_for_opponent');
assert.equal(firstReady.battle.status, 'readying', 'one Ready must not activate a PvP battle');
const secondReady = await act('arena-two', 'arena_ready', { battle_id: arenaBattle.battle_id });
assert.equal(secondReady.battle.status, 'active');
const firstMove = await act('arena-one', 'arena_move', { battle_id: arenaBattle.battle_id, expected_round: 1, move: 'ab' });
assert.equal(firstMove.reason, 'waiting_for_opponent');
const secondMove = await act('arena-two', 'arena_move', { battle_id: arenaBattle.battle_id, expected_round: 1, move: 'bh' });
assert.ok(['round_resolved', 'arena_completed'].includes(secondMove.reason));

const kaijuQueued = await act('kaiju-one', 'kaiju_matchmake');
assert.equal(kaijuQueued.reason, 'kaiju_queued');
assert.equal((await getPetKaijuQueueState(db, 'kaiju-one')).waiting, true);
const kaijuMatched = await act('kaiju-two', 'kaiju_matchmake');
assert.equal(kaijuMatched.reason, 'kaiju_match_found');
const kaijuMatch = await getPetKaijuMatchForPlayer(db, 'kaiju-one');
assert.equal(kaijuMatch.mode, 'group');
assert.equal(serializePetMiniAppKaijuMatch(kaijuMatch, 'kaiju-two').role, 'player2');

const firstCard = await act('kaiju-one', 'kaiju_card', { match_id: kaijuMatch.match_id, card_key: 'big-daddy-kong' });
assert.equal(firstCard.reason, 'kaiju_card_waiting');
const secondCard = await act('kaiju-two', 'kaiju_card', { match_id: kaijuMatch.match_id, card_key: 'god-dzilla' });
assert.equal(secondCard.reason, 'kaiju_completed');
assert.ok(['player1_win', 'player2_win', 'draw'].includes(secondCard.match.result));
assert.equal(await getPetKaijuMatchForPlayer(db, 'kaiju-one'), null);

console.log('telegram-pets-mini-app-parity.test.mjs passed');
