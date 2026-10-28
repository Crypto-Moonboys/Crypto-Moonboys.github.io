/**
 * Read-only scan of non-MoonPet Championship Clout source provenance.
 *
 * These shared tables have NO FK to MoonPet Growth Mark/Crest receipts. If
 * MoonPet beta evidence is deleted while a Clout proof/effect/day persists,
 * the unrelated game may retain an unverifiable award. Only counts and
 * blocker codes are returned; no player identifiers leave this function.
 *
 * A pass NEVER constitutes permission for a production D1 reset.
 */
const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
const evidenceTables = Object.freeze({
  sources: 'championship_clout_sources',
  effects: 'championship_clout_effects',
  daily: 'championship_clout_daily',
  archives: 'championship_clout_archives',
});

function tableMap(db) {
  return new Map(db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(row => [String(row.name).toLowerCase(), String(row.name)]));
}
function requireColumns(db, name, required) {
  const cols = new Set(db.prepare('PRAGMA table_info(' + quote(name) + ')')
    .all().map(row => String(row.name).toLowerCase()));
  return required.every(field => cols.has(field));
}
function count(db, sql) {
  const n = db.prepare(sql).get()?.n;
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error('moonpet_shared_proof_invalid_count');
  return n;
}

/** Safe to call from both the offline planner and read-only backup audit. */
export function auditMoonpetSharedCloutProof(db) {
  const known = tableMap(db);
  const found = Object.fromEntries(Object.entries(evidenceTables)
    .map(([kind, name]) => [kind, known.get(name) || null]));
  const result = {
    source_rows: null,
    effect_rows: null,
    daily_rows: null,
    invalid_daily_json_rows: null,
    archived_periods: null,
    missing_projection_tables: [],
    blockers: [],
  };
  function blocker(value) {
    if (!result.blockers.includes(value)) result.blockers.push(value);
  }
  if (found.sources) {
    if (!requireColumns(db, found.sources, ['source_system','source_event_id']))
      blocker('championship_clout_source_schema_unavailable');
    else {
      result.source_rows = count(db,
        'SELECT COUNT(*) AS n FROM ' + quote(found.sources) +
        " WHERE lower(trim(source_system))='moonpet'");
      if (result.source_rows > 0)
        blocker('moonpet_clout_source_provenance_requires_review');
    }
    // Current (post-migration-100) Clout uses all three ledgers. Older offline
    // rehearsal fixtures may not have them; the separate acceptance audit
    // must treat missing tables as an incomplete current-production backup.
    for (const kind of ['effects','daily']) {
      if (!found[kind]) result.missing_projection_tables.push(evidenceTables[kind]);
    }
  }
  if (found.effects) {
    if (!requireColumns(db,found.effects,['source_system','source_event_id','game_key','source_pet_id']))
      blocker('championship_clout_effects_schema_unavailable');
    else {
      result.effect_rows = count(db,
        'SELECT COUNT(*) AS n FROM ' + quote(found.effects) +
        " WHERE lower(trim(source_system))='moonpet'" +
        " OR lower(trim(coalesce(game_key,'')))='moonpet'" +
        " OR source_pet_id IS NOT NULL");
      if (result.effect_rows > 0)
        blocker('moonpet_clout_effects_provenance_requires_review');
    }
  }
  if (found.daily) {
    if (!requireColumns(db, found.daily, ['game_keys_json']))
      blocker('championship_clout_daily_schema_unavailable');
    else {
      const table=quote(found.daily);
      result.invalid_daily_json_rows = count(db,
        'SELECT COUNT(*) AS n FROM ' + table +
        " WHERE CASE WHEN json_valid(game_keys_json) THEN json_type(game_keys_json)<>'array' ELSE 1 END");
      if(result.invalid_daily_json_rows > 0)
        blocker('championship_clout_daily_json_unverifiable');
      result.daily_rows = count(db,
        'SELECT COUNT(*) AS n FROM ' + table + ' AS d WHERE EXISTS (' +
        "SELECT 1 FROM json_each(CASE WHEN json_valid(d.game_keys_json) THEN d.game_keys_json ELSE '[]' END) AS j" +
        " WHERE lower(trim(CAST(j.value AS TEXT)))='moonpet')");
      if (result.daily_rows > 0)
        blocker('moonpet_clout_daily_projection_requires_review');
    }
  }
  if (found.archives) {
    result.archived_periods = count(db,
      'SELECT COUNT(*) AS n FROM ' + quote(found.archives));
  }
  return result;
}
