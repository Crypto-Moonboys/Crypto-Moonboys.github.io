import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import evolutions from '../workers/moonboys-api/pets/content/evolutions.json' with { type: 'json' };
import bosses from '../workers/moonboys-api/pets/content/bosses.json' with { type: 'json' };
import enemies from '../workers/moonboys-api/pets/content/enemies.json' with { type: 'json' };
import { PET_CRAFTING_MATERIALS } from '../workers/moonboys-api/pets/economy-phase-3.js';
import { PET_REGION_CONTENT } from '../workers/moonboys-api/pets/content-phase-4.js';
import { PET_ACHIEVEMENTS } from '../workers/moonboys-api/pets/player-expansion.js';
import { buildPetRegionDirectory, PET_JOB_LORE, PET_REGION_LORE } from '../workers/moonboys-api/pets/game-content.js';

const root = new URL('../', import.meta.url);
const schema = fs.readFileSync(new URL('workers/moonboys-api/schema.sql', root), 'utf8');
const migration = fs.readFileSync(new URL('workers/moonboys-api/migrations/051_telegram_pet_content_reconciliation.sql', root), 'utf8');
const worker = fs.readFileSync(new URL('workers/moonboys-api/worker.js', root), 'utf8');
const miniApp = fs.readFileSync(new URL('js/moonpet-mini-app.js', root), 'utf8');

const evolutionMaterials = new Set(evolutions.flatMap((entry) => Object.keys(entry.requirements.inventory?.material || {})));
for (const material of evolutionMaterials) assert.ok(PET_CRAFTING_MATERIALS[material], `evolution material ${material} must be canonical`);
for (const legacy of ['neon_scrap', 'spray_pigment']) {
  assert.ok(!evolutionMaterials.has(legacy), `${legacy} cannot remain in evolution requirements`);
  assert.ok(!JSON.stringify([bosses, enemies]).includes(legacy), `${legacy} cannot remain in live reward content`);
}
assert.equal(PET_REGION_CONTENT.moon_alley.boss, 'alley_king', 'Moon Alley must have one canonical boss');
for (const evolution of evolutions) for (const achievement of evolution.achievement_unlocks) {
  assert.ok(PET_ACHIEVEMENTS[achievement], `${evolution.name} achievement ${achievement} must be registered`);
}
assert.equal(Object.keys(PET_REGION_LORE).length, 6, 'every defined district needs lore');
assert.equal(buildPetRegionDirectory(100, { moon_citadel: 3000 }).length, 6, 'all regions must be represented in the Mini App directory');
for (const job of ['vault_security', 'kaiju_recovery']) {
  assert.ok(PET_JOB_LORE[job], `${job} needs player-facing lore`);
  assert.match(worker, new RegExp(`${job}: \\{`), `${job} must be wired into the live job authority`);
}
assert.match(miniApp, /arena_forfeit/, 'server-supported Arena forfeit must have a Mini App control');
for (const panel of ['DISTRICT NETWORK', 'CRAFTING MATERIALS', 'RELIC VAULT', 'LEARNED APTITUDES']) assert.ok(miniApp.includes(panel), `${panel} must be player-facing`);
assert.match(worker, /growth_stage: getPetGrowthStage/, 'XP maturity must be exposed separately from earned evolution identity');
assert.match(worker, /stage: currentEvolution\?\.name \|\| null/, 'public evolution stage must come from stored identity, never XP thresholds');
assert.doesNotMatch(worker, /stage: 'Street Moonpet', min_xp/, 'formal evolution names cannot be assigned from XP alone');
assert.match(worker, /canStartPetEliteJob\(key/, 'elite job execution must enforce specialist XP');
assert.match(worker, /canStartPetEliteJob\(job\.key/, 'elite job availability must enforce specialist XP');

const db = new DatabaseSync(':memory:');
db.exec(schema);
db.prepare("INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('reconcile-player', 0, 1)").run();
db.prepare("INSERT INTO telegram_pet_profiles (telegram_id) VALUES ('reconcile-player')").run();
db.prepare("INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES ('reconcile-player', 'material', 'scrap_metal', 3)").run();
db.prepare("INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES ('reconcile-player', 'item', 'evolution_fragment', 7)").run();
db.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('reconcile-player', 'scrap_metal', 2)").run();
db.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('reconcile-player', 'evolution_fragment', 2)").run();
db.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('reconcile-player', 'neon_scrap', 4)").run();
db.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('reconcile-player', 'spray_pigment', 5)").run();
db.exec(migration);
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='reconcile-player' AND material_key='scrap_metal'").get().quantity, 9);
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='reconcile-player' AND material_key='moon_fabric'").get().quantity, 5);
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='reconcile-player' AND material_key='evolution_fragment'").get().quantity, 9);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM telegram_pet_inventory WHERE telegram_id='reconcile-player' AND asset_type='material'").get().count, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM telegram_pet_inventory WHERE telegram_id='reconcile-player' AND asset_type='item' AND asset_key='evolution_fragment'").get().count, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM telegram_pet_material_balances WHERE material_key IN ('neon_scrap','spray_pigment')").get().count, 0);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);

console.log('telegram-pets-content-reconciliation.test.mjs passed');
