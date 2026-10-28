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
      // Mirror Championship Clout's validSnapshot game-key rules rather than
      // accepting every JSON array. JSON1 casts nested objects/arrays to text,
      // which can hide unverifiable saved MoonPet contributions.
      // Stream only the key column: bounded memory and no player identifiers.
      const GAME_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
      let invalid=0, moonpet=0;
      for (const row of db.prepare('SELECT game_keys_json FROM ' + quote(found.daily)).iterate()) {
        let games;
        try { games=JSON.parse(row.game_keys_json); }
        catch {invalid++;continue;}
        if (!Array.isArray(games)) {invalid++;continue;}
        // Count direct MoonPet labels even if they have inconsistent casing or
        // spacing, while still marking such noncanonical arrays unverifiable.
        if (games.some(g => typeof g === 'string' && g.trim().toLowerCase() === 'moonpet'))
          moonpet++;
        if (games.length>200 || new Set(games).size!==games.length ||
            games.some(g=>typeof g!=='string'||!GAME_KEY.test(g)))
          invalid++;
      }
      result.invalid_daily_json_rows=invalid;
      result.daily_rows=moonpet;
      if (invalid>0) blocker('championship_clout_daily_json_unverifiable');
      if (moonpet>0) blocker('moonpet_clout_daily_projection_requires_review');
    }
  }
  if (found.archives) {
    result.archived_periods = count(db,
      'SELECT COUNT(*) AS n FROM ' + quote(found.archives));
  }
  return result;
}
