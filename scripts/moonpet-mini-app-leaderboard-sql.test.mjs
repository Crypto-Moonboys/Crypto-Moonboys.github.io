import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const startMarker = '// TEST-EXPORT: petMiniAppInitialLeaderboardSql:start';
const endMarker = '// TEST-EXPORT: petMiniAppInitialLeaderboardSql:end';
const start = worker.indexOf(startMarker);
const end = worker.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, 'initial Mini App leaderboard SQL must expose a test extraction block');
const source = worker.slice(worker.indexOf('\n', start) + 1, end);
const sql = new Function(`${source}; return PET_MINI_APP_INITIAL_LEADERBOARD_SQL;`)();

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE telegram_pet_profiles (
    telegram_id TEXT PRIMARY KEY, pet_name TEXT, level INTEGER, pet_xp INTEGER,
    moon_gold INTEGER, moon_crystals INTEGER, style_tokens INTEGER, streak_days INTEGER,
    updated_at TEXT
  );
  CREATE TABLE telegram_pet_active_slots (telegram_id TEXT PRIMARY KEY, pet_id TEXT, season_key TEXT);
  CREATE TABLE telegram_pet_instances (pet_id TEXT, telegram_id TEXT, season_key TEXT);
  CREATE TABLE telegram_pet_season_slots (pet_id TEXT, telegram_id TEXT, season_key TEXT);
  CREATE TABLE telegram_pet_lifecycle_by_pet (
    pet_id TEXT, telegram_id TEXT, phase TEXT, species_id TEXT, rare_morph_id TEXT
  );
  CREATE TABLE telegram_pet_evolutions_by_pet (
    pet_id TEXT, telegram_id TEXT, evolution_id TEXT, stage INTEGER
  );
  CREATE TABLE telegram_pet_evolutions (telegram_id TEXT, evolution_id TEXT, stage INTEGER);

  INSERT INTO telegram_pet_profiles VALUES
    ('100', 'Stored Alpha', 20, 900, 10, 1, 2, 3, '2026-09-01 00:00:00'),
    ('200', 'Stored Beta', 35, 700, 20, 2, 3, 4, '2026-09-02 00:00:00'),
    ('300', 'Stored Gamma', 5, 500, 30, 3, 4, 5, '2026-09-03 00:00:00');
  INSERT INTO telegram_pet_active_slots VALUES
    ('100', 'pet-100-active', '2026-s3'),
    ('200', 'pet-200-active', '2026-s3'),
    ('300', 'pet-300-active', '2026-s3');
  INSERT INTO telegram_pet_instances VALUES
    ('pet-100-active', '100', '2026-s3'),
    ('pet-100-stale', '100', '2026-s2'),
    ('pet-200-active', '200', '2026-s3'),
    ('pet-300-active', '300', '2026-s3');
  INSERT INTO telegram_pet_season_slots VALUES
    ('pet-100-active', '100', '2026-s3'),
    ('pet-100-stale', '100', '2026-s2'),
    ('pet-200-active', '200', '2026-s3'),
    ('pet-300-active', '300', '2026-s3');
  INSERT INTO telegram_pet_lifecycle_by_pet VALUES
    ('pet-100-active', '100', 'adult', 'vinyl_crab', NULL),
    ('pet-200-active', '200', 'adult', 'neon_raccoon', NULL),
    ('pet-300-active', '300', 'young', 'bubble_ram', NULL);
  INSERT INTO telegram_pet_evolutions_by_pet VALUES
    ('pet-100-active', '100', 'cyber_moonpet', 2),
    ('pet-100-stale', '100', 'legendary_moon_guardian', 5),
    ('pet-200-active', '200', 'elite_moonpet', 3);
  INSERT INTO telegram_pet_evolutions VALUES ('300', 'street_moonpet', 1);
`);

const statement = db.prepare(sql);
const columnNames = statement.columns().map((column) => column.name);
assert.equal(columnNames.filter((name) => name === 'evolution_stage').length, 1,
  'query must expose one authoritative evolution_stage column');
const rows = statement.all();
assert.deepEqual(rows.map((row) => row.telegram_id), ['100', '200', '300'],
  'ranking must preserve pet XP descending order');
assert.deepEqual(rows.map((row) => Number(row.evolution_stage)), [2, 3, 1],
  'active per-pet evolution must win, with the legacy evolution table used only as fallback');
assert.equal(rows[0].stage, 'cyber_moonpet');
assert.equal(rows[0].lifecycle_species_id, 'vinyl_crab');
assert.equal(rows[1].stage, 'elite_moonpet');
assert.equal(rows[2].stage, 'street_moonpet');
assert.doesNotMatch(sql, /scores\.telegram_id/, 'initial profile leaderboard must not reference the scores alias');

console.log('Moonpet initial Mini App leaderboard SQL executed successfully against SQLite');
