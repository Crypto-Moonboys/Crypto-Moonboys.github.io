// One D1 round trip per request-scoped schema preflight, never a global cache.
// A failed or malformed inspection must not imply that any table exists.
// Centralizes repeated sqlite_master probes without relaxing migration gates.
const VALID_TABLE = /^[a-z][a-z0-9_]{0,80}$/u;

export async function inspectSchemaTables(db, tableNames) {
  if (!Array.isArray(tableNames) ||
      !tableNames.every(name => typeof name === 'string' && VALID_TABLE.test(name))) {
    throw new Error('schema_preflight_invalid_table_names');
  }
  const names = [...new Set(tableNames)];
  if (!names.length) return { ok: true, present: new Set(), missing: [] };
  try {
    const sql = "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (" +
      names.map(() => '?').join(',') + ')';
    const result = await db.prepare(sql).bind(...names).all();
    if (!result || result.success === false || !Array.isArray(result.results)) {
      throw new Error('schema_preflight_query_unavailable');
    }
    const allowed = new Set(names);
    const present = new Set();
    for (const row of result.results) {
      if (!row || typeof row.name !== 'string' || !allowed.has(row.name)) {
        throw new Error('schema_preflight_malformed_rows');
      }
      present.add(row.name);
    }
    return { ok: true, present, missing: names.filter(name => !present.has(name)) };
  } catch (error) {
    return {
      ok: false,
      present: new Set(),
      missing: names,
      error: String(error?.message || error),
    };
  }
}
