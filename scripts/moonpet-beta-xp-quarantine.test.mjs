import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readPetActivity, readPetLeaderboard } from '../workers/moonboys-api/pets/leaderboard.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/080_moonpet_beta_xp_quarantine.sql', import.meta.url), 'utf8');
const auditSql = fs.readFileSync(new URL('./check-moonpet-beta-xp-quarantine.sql', import.meta.url), 'utf8');
const auditQuery = auditSql.slice(auditSql.indexOf('WITH owned_totals')).trim().replace(/;$/, '');

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(schema);
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async all() { return { success: true, results: sql.prepare(this.query).all(...this.args) }; }
  }
  const db = { prepare(query) { return new Statement(query); } };
  const addOwner = (owner, profileXp = 0) => {
    sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, owner);
    sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp) VALUES (?,?)').run(owner, profileXp);
  };
  const addPet = (owner, petId, season, xp, slot = 1, status = 'active') => {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type,status) VALUES (?,?,?,?, 'free',?)")
      .run(petId, owner, season, slot, status);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,status,source_profile_updated_at) VALUES (?,?,?,?,?,?,'0001-01-01 00:00:00')")
      .run(petId, owner, season, slot, xp, status);
  };
  const addEvent = ({ id, owner, petId = null, season = 'pet-s2026-003', xp, created = '2026-09-30 00:00:00' }) => {
    sql.prepare(`INSERT INTO telegram_pet_events
      (id,telegram_id,pet_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status,created_at)
      VALUES (?,?,?,'feed',?,?,?,'2026-09-30','2026-W40','accepted',?)`)
      .run(id, owner, petId, id, xp, season, created);
  };
  return { sql, db, addOwner, addPet, addEvent };
}

test('beta quarantine preserves valid and legacy receipts while hiding unverifiable history', async () => {
  const f = fixture();
  f.addOwner('valid', 100); f.addPet('valid', 'valid-pet', 'pet-s2026-003', 100); f.addEvent({ id: 'valid-event', owner: 'valid', petId: 'valid-pet', xp: 20 });
  f.addOwner('missing', 90); f.addPet('missing', 'missing-current', 'pet-s2026-003', 90); f.addEvent({ id: 'missing-event', owner: 'missing', xp: 40 });
  f.addOwner('excess', 30); f.addPet('excess', 'excess-pet', 'pet-s2026-003', 30); f.addEvent({ id: 'excess-one', owner: 'excess', petId: 'excess-pet', xp: 25 }); f.addEvent({ id: 'excess-two', owner: 'excess', petId: 'excess-pet', xp: 15 });
  f.addOwner('legacy', 80); f.addEvent({ id: 'legacy-event', owner: 'legacy', xp: 20 });
  f.addOwner('archived', 70); f.addPet('archived', 'archived-pet', 'pet-s2025-004', 70, 1, 'archived'); f.addEvent({ id: 'archived-event', owner: 'archived', petId: 'archived-pet', season: 'pet-s2025-004', xp: 10 });

  f.sql.exec(migration);
  f.sql.exec(migration);
  assert.deepEqual(f.sql.prepare('SELECT event_id,reason FROM moonpet_beta_xp_quarantine ORDER BY event_id').all().map(row => ({ ...row })), [
    { event_id: 'excess-one', reason: 'receipt_total_exceeds_retained_pet_xp' },
    { event_id: 'excess-two', reason: 'receipt_total_exceeds_retained_pet_xp' },
    { event_id: 'missing-event', reason: 'missing_pet_authority' },
  ]);

  const now = new Date('2026-09-30T12:00:00.000Z');
  for (const period of ['daily', 'weekly']) {
    const rows = (await readPetLeaderboard(f.db, { period, limit: 100, now })).rows;
    assert.deepEqual(rows.map(row => [row.telegram_id, row.pet_xp]), [['legacy', 20], ['valid', 20], ['archived', 10]]);
  }
  assert.deepEqual((await readPetLeaderboard(f.db, { period: 'all_time', limit: 100, now })).rows
    .map(row => [row.telegram_id, row.pet_xp]), [['valid', 100], ['missing', 90], ['legacy', 80], ['archived', 70], ['excess', 30]]);
  assert.deepEqual((await readPetActivity(f.db, 20)).map(row => row.telegram_id).sort(), ['archived', 'legacy', 'valid']);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_events').get().n, 6, 'audit events are preserved');
});

test('post-migration audit compares legacy weekly receipts with profile XP fallback', () => {
  const f = fixture();
  f.addOwner('legacy-overrun', 15);
  f.addEvent({ id: 'legacy-overrun-event', owner: 'legacy-overrun', xp: 20 });
  f.sql.exec(migration);

  assert.equal(
    f.sql.prepare(auditQuery).get().visible_week_windows_above_retained_all_time,
    1,
    'legacy weekly XP above profile fallback must be reported',
  );
});
