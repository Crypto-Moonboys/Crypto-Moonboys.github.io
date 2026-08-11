import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_ACHIEVEMENTS,
  PET_SEASON_REWARD_TIERS,
  PET_WEEKLY_BOSSES,
  buildMoonpetReaction,
  calculatePetWeeklyBossDamage,
  getPetEvolutionPerk,
  getPetWeeklyBoss,
} from '../workers/moonboys-api/pets/player-expansion.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

assert.equal(Object.keys(PET_ACHIEVEMENTS).length, 12, 'expansion must ship twelve permanent achievements');
assert.equal(PET_SEASON_REWARD_TIERS.length, 4, 'season track must ship four bounded claim tiers');
assert.equal(PET_WEEKLY_BOSSES.length, 4, 'weekly rotation must include four bosses');
assert.equal(getPetWeeklyBoss('2026-W33'), getPetWeeklyBoss('2026-W33'), 'weekly boss selection must be deterministic');
assert.notEqual(getPetWeeklyBoss('2026-W33'), null);

const boss = PET_WEEKLY_BOSSES[0];
const baseDamage = calculatePetWeeklyBossDamage({ boss, action: 'strike', level: 20, evolution_stage: 0, health: 80, energy: 80, roll: 0 });
const evolvedDamage = calculatePetWeeklyBossDamage({ boss, action: boss.weakness, level: 20, evolution_stage: 4, health: 80, energy: 80, roll: 0 });
assert.ok(evolvedDamage > baseDamage, 'evolution and exploiting a weakness must materially improve weekly boss power');
assert.match(getPetEvolutionPerk(4).perk, /guardian content/i);
assert.match(buildMoonpetReaction('event', { personalities: [{ trait_id: 'curious' }] }), /Curiosity/i);
assert.match(buildMoonpetReaction('boss', { memories: { total_bosses_defeated: 2 } }), /remembers/i);

assert.equal(Object.keys(hooks.PET_JOBS).length, 12, 'jobs must expand from four to twelve');
assert.equal(Object.keys(hooks.PET_RANDOM_EVENTS).length, 10, 'random events must expand from five to ten');
assert.equal(hooks.PET_JOBS.guardian_patrol.min_evolution_stage, 4, 'late jobs must use evolution as a content gate');
assert.equal(hooks.PET_RANDOM_EVENTS.guardian_distress_call.min_evolution_stage, 4, 'late events must use evolution as a content gate');

const workerSource = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
for (const command of ['petachievements', 'petevolve', 'petboss', 'petseason']) {
  assert.match(workerSource, new RegExp(`case '${command}'`), `${command} must be routed by the Telegram command handler`);
}
assert.match(workerSource, /awardPetReward\(db, \{[\s\S]*source: 'pet_weekly_boss'/);
assert.match(workerSource, /source: 'pet_season_reward'/);

let defeatedBossBatchCalls = 0;
let defeatedBossWriteCalls = 0;
const defeatedAt = '2026-08-10T12:00:00.000Z';
const rewardClaimedAt = '2026-08-10T12:00:01.000Z';
const defeatedBossDb = {
  prepare(sql) {
    const query = String(sql);
    return {
      bind() { return this; },
      async first() {
        if (query.includes('FROM telegram_pet_profiles')) return {
          telegram_id: 'boss-winner', pet_xp: 500, hunger: 0, happiness: 100,
          cleanliness: 100, energy: 80, health: 100, last_decay_at: new Date().toISOString(),
        };
        if (query.includes('FROM telegram_pet_weekly_boss_progress')) return {
          telegram_id: 'boss-winner', week_key: 'current', boss_id: 'test',
          attempts: 3, damage: 999, defeated_at: defeatedAt, reward_claimed_at: rewardClaimedAt,
        };
        return null;
      },
      async all() { return { results: [] }; },
      async run() { defeatedBossWriteCalls += 1; return { meta: { changes: 1 } }; },
    };
  },
  async batch() {
    defeatedBossBatchCalls += 1;
    throw new Error('a defeated weekly boss must never reserve another attack');
  },
};
const defeatedBossResult = await hooks.processPetWeeklyBoss(defeatedBossDb, 'boss-winner', 'strike');
assert.equal(defeatedBossResult.reason, 'boss_already_defeated');
assert.equal(defeatedBossResult.progress.defeated_at, defeatedAt);
assert.equal(defeatedBossBatchCalls, 0, 'post-defeat attacks must not enter the energy/damage reservation batch');
assert.equal(defeatedBossWriteCalls, 0, 'post-defeat attacks must not consume energy or mutate boss state');

const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8');
for (const table of ['telegram_pet_achievements', 'telegram_pet_weekly_boss_progress', 'telegram_pet_weekly_boss_events', 'telegram_pet_season_reward_claims']) {
  assert.match(migration, new RegExp(`CREATE TABLE ${table}`), `${table} must be created by migration 048`);
}
assert.match(migration, /UNIQUE \(telegram_id, week_key, day_key\)/, 'weekly bosses must enforce one attempt per player per UTC day at D1 level');
assert.match(migration, /PRIMARY KEY \(telegram_id, season_key, tier_id\)/, 'season tier claims must be unique in D1');

const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY);
  INSERT INTO telegram_pet_profiles (telegram_id) VALUES ('player-1');
`);
db.exec(migration);
db.prepare(`
  INSERT INTO telegram_pet_weekly_boss_events
    (event_id, telegram_id, week_key, day_key, boss_id, event_key, action, damage)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('event-1', 'player-1', '2026-W33', '2026-08-11', 'void_kraken', 'boss:2026-W33:2026-08-11', 'strike', 20);
assert.throws(() => db.prepare(`
  INSERT INTO telegram_pet_weekly_boss_events
    (event_id, telegram_id, week_key, day_key, boss_id, event_key, action, damage)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('event-2', 'player-1', '2026-W33', '2026-08-11', 'void_kraken', 'boss:2026-W33:duplicate', 'strike', 25), /UNIQUE constraint failed/, 'D1 schema must reject a second weekly boss attempt on the same UTC day');
db.prepare(`
  INSERT INTO telegram_pet_season_reward_claims
    (telegram_id, season_key, tier_id, event_key)
  VALUES (?, ?, ?, ?)
`).run('player-1', '2026-S3', 'stardust', 'season:2026-S3:stardust');
assert.throws(() => db.prepare(`
  INSERT INTO telegram_pet_season_reward_claims
    (telegram_id, season_key, tier_id, event_key)
  VALUES (?, ?, ?, ?)
`).run('player-1', '2026-S3', 'stardust', 'season:2026-S3:duplicate'), /UNIQUE constraint failed/, 'D1 schema must reject duplicate season tier claims');
db.close();

console.log('Telegram Pets player expansion tests passed.');
