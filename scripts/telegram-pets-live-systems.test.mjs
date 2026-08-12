import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PET_EVENT_CHAINS, PET_FACTION_BONUSES, PET_REGION_CONTENT, PET_SEASONAL_BOSSES } from '../workers/moonboys-api/pets/content-phase-4.js';
import { PET_COSMETIC_SINKS, PET_EQUIPMENT_UPGRADE_COSTS, PET_PRESTIGE_REQUIREMENTS } from '../workers/moonboys-api/pets/economy-phase-3.js';
import { applyPetFactionBonus, getActiveSeasonalBoss } from '../workers/moonboys-api/pets/live-systems.js';
import { buildPetRegionDirectory, PET_REGION_LORE } from '../workers/moonboys-api/pets/game-content.js';

const root = new URL('../', import.meta.url);
const worker = fs.readFileSync(new URL('workers/moonboys-api/worker.js', root), 'utf8');
const client = fs.readFileSync(new URL('js/moonpet-mini-app.js', root), 'utf8');
const schema = fs.readFileSync(new URL('workers/moonboys-api/schema.sql', root), 'utf8');
const migration = fs.readFileSync(new URL('workers/moonboys-api/migrations/052_telegram_pet_live_systems.sql', root), 'utf8');

assert.equal(Object.keys(PET_REGION_CONTENT).length, 6);
assert.ok(Object.values(PET_REGION_LORE).every((region) => region.status === 'live'), 'all six districts must be live');
const unlocked = buildPetRegionDirectory(100, { moon_alley: 100, neon_rooftops: 300, rugpull_mines: 700, blockchain_sewers: 1400, kaiju_district: 3000 });
assert.ok(unlocked.every((region) => region.playable), 'district gates must use the preceding district mastery');
assert.equal(Object.keys(PET_EVENT_CHAINS).length, 4);
assert.equal(Object.keys(PET_SEASONAL_BOSSES).length, 4);
assert.ok(getActiveSeasonalBoss(new Date('2026-08-12T00:00:00Z')).hp >= 900);
assert.equal(Object.keys(PET_FACTION_BONUSES).length, 9);
assert.ok(applyPetFactionBonus({ moon_gold: 100 }, 'blockstars', 'jobs').rewards.moon_gold > 100);
for (const [faction, definition] of Object.entries(PET_FACTION_BONUSES)) {
  const applied = applyPetFactionBonus({ moon_gold: 100, pet_xp: 100 }, faction, definition.system);
  assert.ok(applied.bonus, `${faction} must resolve in its declared gameplay system`);
  if (definition.system !== 'training') assert.ok(applied.rewards.moon_gold > 100 || applied.rewards.pet_xp > 100, `${faction} must change a live reward`);
}
assert.match(worker, /track_multiplier: 1 \+ Number\(factionBonus/, 'training faction bonus must change runtime Training XP');
assert.match(worker, /applyPetFactionBonus\(player1Scaled\.rewards/, 'Arena faction bonuses must be applied before settlement');
assert.equal(Object.keys(PET_EQUIPMENT_UPGRADE_COSTS).length, 9);
assert.equal(Object.keys(PET_COSMETIC_SINKS).length, 4);
assert.equal(PET_PRESTIGE_REQUIREMENTS.min_level, 100);

for (const action of ['district_mission', 'event_chain', 'seasonal_boss', 'gear_upgrade', 'cosmetic_unlock', 'prestige']) {
  assert.match(worker, new RegExp(`action === '${action}'`), `${action} needs a server action`);
  assert.ok(client.includes(`'${action}'`), `${action} needs a Mini App control`);
}
for (const table of ['telegram_pet_system_events', 'telegram_pet_event_chain_progress', 'telegram_pet_seasonal_boss_progress', 'telegram_pet_cosmetic_unlocks']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}

const db = new DatabaseSync(':memory:');
db.exec(schema);
db.prepare("INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('live-player', 0, 1)").run();
db.prepare("INSERT INTO telegram_pet_profiles (telegram_id) VALUES ('live-player')").run();
db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'telegram_pet_%'").get().count > 0, true);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);

console.log('telegram-pets-live-systems.test.mjs passed');
