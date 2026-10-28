import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {auditMoonpetSharedCloutProof} from './moonpet-v1-beta-shared-clout-proof.mjs';

function dbWithSharedClout() {
  const db=new DatabaseSync(':memory:');
  db.exec([
    'CREATE TABLE championship_clout_sources(source_system TEXT,source_event_id TEXT)',
    'CREATE TABLE championship_clout_effects(source_system TEXT,source_event_id TEXT,game_key TEXT,source_pet_id TEXT)',
    'CREATE TABLE championship_clout_daily(game_keys_json TEXT)',
    'CREATE TABLE championship_clout_archives(standings_json TEXT)',
  ].join(';'));
  return db;
}
test('independent Clout source/effect/day records remain unblocked',()=>{
  const db=dbWithSharedClout();
  try {
    db.exec("INSERT INTO championship_clout_sources VALUES ('dead_run','run-1')");
    db.exec("INSERT INTO championship_clout_effects VALUES ('dead_run','run-1','dead-run',NULL)");
    db.exec("INSERT INTO championship_clout_daily VALUES ('[\"dead-run\"]')");
    db.exec("INSERT INTO championship_clout_archives VALUES ('[]')");
    const result=auditMoonpetSharedCloutProof(db);
    assert.deepEqual(result.blockers,[]);
    assert.equal(result.source_rows,0);
    assert.equal(result.effect_rows,0);
    assert.equal(result.daily_rows,0);
    assert.equal(result.archived_periods,1);
    assert.deepEqual(result.missing_projection_tables,[]);
  } finally {db.close();}
});
test('orphan MoonPet effect blocks even when the source ledger has no MoonPet rows',()=>{
  const db=dbWithSharedClout();
  try {
    db.exec("INSERT INTO championship_clout_effects VALUES ('MoonPet','crest-1',NULL,'pet-1')");
    const result=auditMoonpetSharedCloutProof(db);
    assert.equal(result.source_rows,0);
    assert.equal(result.effect_rows,1);
    assert.ok(result.blockers.includes('moonpet_clout_effects_provenance_requires_review'));
  } finally {db.close();}
});
test('MoonPet daily projection blocks even if sources and effects are empty',()=>{
  const db=dbWithSharedClout();
  try {
    db.exec("INSERT INTO championship_clout_daily VALUES ('[\"dead-run\",\" MoonPet \"]')");
    const result=auditMoonpetSharedCloutProof(db);
    assert.equal(result.daily_rows,1);
    assert.ok(result.blockers.includes('moonpet_clout_daily_projection_requires_review'));
  } finally {db.close();}
});
test('invalid daily game-keys JSON cannot silently pass',()=>{
  const db=dbWithSharedClout();
  try {
    db.exec("INSERT INTO championship_clout_daily VALUES ('not-json')");
    db.exec("INSERT INTO championship_clout_daily VALUES ('{}')");
    const result=auditMoonpetSharedCloutProof(db);
    assert.equal(result.invalid_daily_json_rows,2);
    assert.ok(result.blockers.includes('championship_clout_daily_json_unverifiable'));
  } finally {db.close();}
});
test('mixed-case Clout table and source labels are detected without changing anything',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE Championship_Clout_Effects(source_system TEXT,source_event_id TEXT,game_key TEXT,source_pet_id TEXT)");
    db.exec("INSERT INTO Championship_Clout_Effects VALUES ('DEAD_RUN','run-1','MOONPET',NULL)");
    const result=auditMoonpetSharedCloutProof(db);
    assert.equal(result.effect_rows,1);
    assert.ok(result.blockers.includes('moonpet_clout_effects_provenance_requires_review'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Championship_Clout_Effects').get().n,1);
  } finally {db.close();}
});
test('missing Clout projections are reported for release acceptance, not invented as zero',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE championship_clout_sources(source_system TEXT,source_event_id TEXT)');
    const r=auditMoonpetSharedCloutProof(db);
    assert.deepEqual(r.missing_projection_tables,['championship_clout_effects','championship_clout_daily']);
    assert.equal(r.effect_rows,null);
    assert.equal(r.daily_rows,null);
  } finally {db.close();}
});
test('changed shared Clout schema fails closed',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE championship_clout_effects(source_system TEXT)');
    const r=auditMoonpetSharedCloutProof(db);
    assert.ok(r.blockers.includes('championship_clout_effects_schema_unavailable'));
  } finally {db.close();}
});


test('non-string members, nested JSON and malformed game-key shapes fail closed',()=>{
  const invalidArrays=[
    [['moonpet']], [{game_key:'moonpet'}], [null], [1], [true],
    ['dead-run','dead-run'], ['Dead-Run'], ['a'.repeat(65)],
    Array.from({length:201},(_,i)=>'game-'+i),
  ];
  const db=dbWithSharedClout();
  try {
    const insert=db.prepare('INSERT INTO championship_clout_daily(game_keys_json) VALUES (?)');
    for(const games of invalidArrays){
      insert.run(JSON.stringify(games));
      const result=auditMoonpetSharedCloutProof(db);
      assert.ok(result.blockers.includes('championship_clout_daily_json_unverifiable'),
        JSON.stringify(games));
      assert.equal(result.invalid_daily_json_rows,db.prepare(
        'SELECT COUNT(*) AS n FROM championship_clout_daily').get().n,
        'each noncanonical array must count as an unverifiable row');
      assert.equal(result.daily_rows,0,'a nested MoonPet object/array must not be mistaken for verified proof');
    }
    db.exec('DELETE FROM championship_clout_daily');
    insert.run('["dead-run","nbg-london"]');
    const good=auditMoonpetSharedCloutProof(db);
    assert.equal(good.invalid_daily_json_rows,0);
    assert.equal(good.daily_rows,0);
    assert.deepEqual(good.blockers,[]);
  }finally{db.close();}
});

test('noncanonical MoonPet spelling is counted as evidence and invalid JSON shape',()=>{
  const db=dbWithSharedClout();
  try {
    db.prepare('INSERT INTO championship_clout_daily(game_keys_json) VALUES (?)')
      .run('["dead-run"," MoonPet "]');
    const result=auditMoonpetSharedCloutProof(db);
    assert.equal(result.daily_rows,1);
    assert.equal(result.invalid_daily_json_rows,1);
    assert.ok(result.blockers.includes('moonpet_clout_daily_projection_requires_review'));
    assert.ok(result.blockers.includes('championship_clout_daily_json_unverifiable'));
  }finally{db.close();}
});
