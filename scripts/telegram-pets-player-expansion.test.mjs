import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_ACHIEVEMENTS,
  MOONPET_REACTION_LIBRARY,
  PET_SEASON_REWARD_TIERS,
  PET_WEEKLY_BOSSES,
  buildMoonpetReaction,
  buildMoonpetReactionChoice,
  calculatePetWeeklyBossDamage,
  getPetEvolutionPerk,
  getMoonpetMood,
  getPetWeeklyBoss,
  selectMoonpetReaction,
} from '../workers/moonboys-api/pets/player-expansion.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

assert.equal(Object.keys(PET_ACHIEVEMENTS).length, 14, 'expansion must cover every formal evolution, including Moon Guardian');
assert.ok(PET_ACHIEVEMENTS.moon_alley_elite, 'Elite Moonpet evolution must reference a registered achievement');
assert.equal(PET_SEASON_REWARD_TIERS.length, 4, 'season track must ship four bounded claim tiers');
assert.equal(PET_WEEKLY_BOSSES.length, 4, 'weekly rotation must include four bosses');
assert.equal(getPetWeeklyBoss('2026-W33'), getPetWeeklyBoss('2026-W33'), 'weekly boss selection must be deterministic');
assert.notEqual(getPetWeeklyBoss('2026-W33'), null);

const boss = PET_WEEKLY_BOSSES[0];
const baseDamage = calculatePetWeeklyBossDamage({ boss, action: 'strike', level: 20, evolution_stage: 0, health: 80, energy: 80, roll: 0 });
const evolvedDamage = calculatePetWeeklyBossDamage({ boss, action: boss.weakness, level: 20, evolution_stage: 4, health: 80, energy: 80, roll: 0 });
assert.ok(evolvedDamage > baseDamage, 'evolution and exploiting a weakness must materially improve weekly boss power');
assert.match(getPetEvolutionPerk(4).perk, /guardian content/i);
assert.ok(Object.keys(MOONPET_REACTION_LIBRARY.activities).length >= 25, 'reaction library must cover every major player activity');
assert.deepEqual(Object.keys(MOONPET_REACTION_LIBRARY.traits).sort(), ['curious', 'explorer', 'loyal', 'street_fighter']);
assert.equal(Object.keys(MOONPET_REACTION_LIBRARY.moods).length, 8, 'reaction library must cover eight meaningful stat-driven moods');
assert.equal(Object.keys(MOONPET_REACTION_LIBRARY.evolutions).length, 6, 'every evolution stage must have its own reactions');
assert.ok(Object.keys(MOONPET_REACTION_LIBRARY.milestones).length >= 14, 'stored milestones and aggregate memories must affect dialogue');
const reactionCount = Object.values(MOONPET_REACTION_LIBRARY).flatMap((group) => Object.values(group)).reduce((total, pool) => total + pool.length, 0);
assert.ok(reactionCount >= 225, `reaction expansion must contain at least 225 lines, received ${reactionCount}`);
for (const group of Object.values(MOONPET_REACTION_LIBRARY)) for (const pool of Object.values(group)) {
  assert.ok(pool.length >= 4, 'each activity, trait, mood, evolution and memory needs real variation');
}
assert.equal(getMoonpetMood({ health: 40, energy: 100 }), 'unwell');
assert.equal(getMoonpetMood({ health: 100, energy: 20 }), 'exhausted');
assert.equal(getMoonpetMood({ health: 100, energy: 100, hunger: 80 }), 'hungry');
assert.equal(getMoonpetMood({ health: 100, energy: 100, hunger: 0, happiness: 100, cleanliness: 100 }), 'thriving');
assert.equal(getMoonpetMood(), 'steady', 'missing pet stats must remain neutral instead of pretending the Moonpet is thriving');
assert.equal(getMoonpetMood(null), 'steady', 'explicitly absent pet state must remain neutral');
assert.equal(getMoonpetMood({ happiness: 100, energy: 100 }), 'steady', 'partial positive stats cannot prove a thriving or excited mood');
assert.equal(getMoonpetMood({ energy: 20 }), 'exhausted', 'a known urgent stat may still select its truthful mood when other stats are absent');
const reactionIdentity = {
  current_stage: { evolution_id: 'cyber_moonpet', name: 'Cyber Moonpet', stage: 2 },
  personalities: [{ trait_id: 'curious' }],
  memories: { milestones: ['first_boss_victory'], total_bosses_defeated: 2 },
};
assert.equal(buildMoonpetReactionChoice('boss', reactionIdentity).mood, 'steady', 'callers without a profile must not emit a false thriving mood');
const firstReaction = buildMoonpetReactionChoice('event', reactionIdentity, { pet: { health: 100, energy: 80, hunger: 10, happiness: 90, cleanliness: 90 }, seed: 'player-1' });
const nextReaction = buildMoonpetReactionChoice('event', reactionIdentity, { pet: { health: 100, energy: 80, hunger: 10, happiness: 90, cleanliness: 90 }, seed: 'player-1', recent_dialogue: [firstReaction] });
assert.notEqual(nextReaction.key, firstReaction.key, 'recent reaction keys must be excluded from the next selection');
assert.notEqual(nextReaction.text, firstReaction.text, 'recent reaction text must not immediately repeat');
assert.ok(buildMoonpetReaction('event', reactionIdentity).length > 20);

assert.equal(Object.keys(hooks.PET_JOBS).length, 14, 'all standard and elite jobs must share the live job authority');
assert.ok(hooks.PET_JOBS.vault_security && hooks.PET_JOBS.kaiju_recovery, 'elite job definitions must be playable rather than orphaned content');
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
const dialogueMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/049_telegram_pet_dialogue_history.sql', import.meta.url), 'utf8');
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
db.exec(dialogueMigration);
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

class D1DatabaseAdapter {
  constructor(database) { this.database = database; }
  prepare(sql) {
    const statement = this.database.prepare(sql);
    let values = [];
    return {
      bind(...params) { values = params; return this; },
      async first() { const row = statement.get(...values); return row ? { ...row } : null; },
      async all() { return { results: statement.all(...values).map((row) => ({ ...row })) }; },
      async run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes || 0) } }; },
    };
  }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}
const dialogueDb = new D1DatabaseAdapter(db);
const storedFirst = await selectMoonpetReaction(dialogueDb, 'player-1', 'feed', reactionIdentity, { pet: { health: 100, energy: 80, hunger: 10, happiness: 90, cleanliness: 90 }, seed: 'stored-player' });
const storedSecond = await selectMoonpetReaction(dialogueDb, 'player-1', 'feed', reactionIdentity, { pet: { health: 100, energy: 80, hunger: 10, happiness: 90, cleanliness: 90 }, seed: 'stored-player' });
assert.notEqual(storedSecond, storedFirst, 'persisted recent dialogue must prevent immediate repetition across requests');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_dialogue_history WHERE telegram_id = 'player-1'`).get().count, 2);
db.close();

const fullSchema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const eliteSqlite = new DatabaseSync(':memory:');
eliteSqlite.exec(fullSchema);
eliteSqlite.prepare("INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('elite-gate-player', 0, 1)").run();
eliteSqlite.prepare("INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES ('elite-gate-player', 4500, 46)").run();
eliteSqlite.prepare(`INSERT INTO telegram_pet_evolutions
  (telegram_id, evolution_id, stage, unlock_event_key, materials_consumed)
  VALUES ('elite-gate-player', 'elite_moonpet', 3, 'test:elite-stage', 1)`).run();
eliteSqlite.prepare(`INSERT INTO telegram_pet_progression_state
  (telegram_id, training_xp, arena_xp)
  VALUES ('elite-gate-player', 999, 1999)`).run();
const eliteDb = new D1DatabaseAdapter(eliteSqlite);
const vaultLocked = await hooks.processPetJob(eliteDb, 'elite-gate-player', 'vault_security', { event_key: 'test:vault-locked' });
assert.equal(vaultLocked.reason, 'specialist_job_locked');
assert.deepEqual({ track: vaultLocked.required_track, current: vaultLocked.current_xp, required: vaultLocked.required_xp },
  { track: 'training', current: 999, required: 1000 });
const kaijuLocked = await hooks.processPetJob(eliteDb, 'elite-gate-player', 'kaiju_recovery', { event_key: 'test:kaiju-locked' });
assert.equal(kaijuLocked.reason, 'specialist_job_locked');
assert.deepEqual({ track: kaijuLocked.required_track, current: kaijuLocked.current_xp, required: kaijuLocked.required_xp },
  { track: 'arena', current: 1999, required: 2000 });
eliteSqlite.close();

console.log('Telegram Pets player expansion tests passed.');
