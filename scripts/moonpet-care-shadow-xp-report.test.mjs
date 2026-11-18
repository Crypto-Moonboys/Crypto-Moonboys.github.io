import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const report = readFileSync(new URL('./report-moonpet-care-shadow-xp.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../workers/moonboys-api/migrations/114_moonpet_care_shadow.sql', import.meta.url), 'utf8');

test('whole-XP replay uses only standing known at day open, and keeps fractions per owner', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE telegram_pet_profiles(telegram_id TEXT PRIMARY KEY)');
    db.exec(migration);
    db.exec("INSERT INTO telegram_pet_profiles VALUES ('a'),('b')");
    const query = db.prepare(report);
    assert.deepEqual(query.all(), []);
    const insert = db.prepare(`INSERT INTO moonpet_care_shadow_days
      (telegram_id,day_key,gross_pet_xp,debt_thirds,settled_at,exempt_reason) VALUES (?,?,?,?,?,?)`);
    for (const owner of ['a','b']) {
      insert.run(owner,'2026-11-01',1200,4620,'2026-11-03T00:00:00Z',null);
      insert.run(owner,'2026-11-02',1200,2310,'2026-11-04T00:00:00Z',null);
      insert.run(owner,'2026-11-03',1200,2310,'2026-11-05T00:10:00Z',null);
      insert.run(owner,'2026-11-04',3,2310,'2026-11-06T00:10:00Z',null);
      insert.run(owner,'2026-11-05',1200,2310,'2026-11-07T00:10:00Z','outage');
      insert.run(owner,'2026-11-06',0,2310,'2026-11-08T00:10:00Z',null);
      insert.run(owner,'2026-11-07',1,0,'2026-11-09T00:10:00Z',null);
      insert.run(owner,'2026-11-08',1200,0,'2026-11-10T00:10:00Z',null);
      insert.run(owner,'2026-11-11',1200,0,'2026-11-13T00:10:00Z',null);
      insert.run(owner,'2026-11-12',null,null,null,null);
    }
    db.exec('PRAGMA query_only=ON');
    const rows = query.all();
    assert.deepEqual(rows.map(row => row.projected_withheld_xp), [0,0,0,0,0,0,2,600,0]);
    assert.equal(rows[4].exempt_account_days,2);
    assert.equal(rows[5].eligible_zero_xp_days,2);
    assert.ok(rows.every(row => row.settled_account_days===2 &&
      row.projected_net_pet_xp+row.projected_withheld_xp===row.actual_pet_xp));
  } finally { db.close(); }
});

test('partial standing replays the same total as individual one-XP awards', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE telegram_pet_profiles(telegram_id TEXT PRIMARY KEY); INSERT INTO telegram_pet_profiles VALUES ('a')");
    db.exec(migration);
    const insert = db.prepare(`INSERT INTO moonpet_care_shadow_days
      (telegram_id,day_key,gross_pet_xp,debt_thirds,settled_at) VALUES ('a',?,?,?,?)`);
    insert.run('2026-11-01',0,132,'2026-11-03T00:01:00Z');
    let remainder = 0;
    const expected = [0];
    for (let day = 10; day < 20; day++) {
      const gross = day % 2 === 0 ? 1200 : 3;
      insert.run('2026-11-'+day,gross,132,'2026-11-'+(day+2)+'T00:01:00Z');
      let withheld = 0;
      // At 44 standing the additional 15% is scaled by 44/770.
      for (let award = 0; award < gross; award++) {
        remainder += 10*770 + 15*44;
        if (remainder >= 100*770) {
          remainder -= 100*770;
          withheld++;
        }
      }
      expected.push(withheld);
    }
    assert.deepEqual(db.prepare(report).all().map(row => row.projected_withheld_xp),expected);
  } finally { db.close(); }
});
