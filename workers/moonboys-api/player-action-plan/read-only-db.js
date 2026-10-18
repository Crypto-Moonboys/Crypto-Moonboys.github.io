const READ_ONLY_SQL = /^\s*(?:SELECT|WITH)\b/iu;
const MUTATING_SQL = /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ATTACH|DETACH|PRAGMA|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|TRANSACTION|EXPLAIN|ANALYZE)\b/iu;

// Ignore reserved words inside correctly quoted SQL string literals when
// checking for mutating statements. The canonical permanent Moonpet space
// query contains the immutable event key 'pet:delete:'; it is data, not a
// DELETE statement. Reject malformed/unclosed quoting rather than guessing.
function withoutSqlStringLiterals(text) {
  let output = '';
  for (let index = 0; index < text.length;) {
    if (text[index] !== "'") {
      output += text[index++];
      continue;
    }
    index++;
    let closed = false;
    while (index < text.length) {
      if (text[index] === "'") {
        if (text[index + 1] === "'") { index += 2; continue; }
        index++;
        closed = true;
        break;
      }
      index++;
    }
    if (!closed) throw new Error('player_action_plan_invalid_sql_literal');
    output += "''";
  }
  return output;
}

function assertReadOnlySql(sql) {
  const text = String(sql || '');
  // Reject multi-statements and comment-bearing SQL even if the first token
  // looks read-only. Query strings are authored by trusted source adapters;
  // there is no need to accept statements hidden in comments or delimiters.
  if (!READ_ONLY_SQL.test(text) || MUTATING_SQL.test(withoutSqlStringLiterals(text))
    || /;|--|\/\*|\*\//u.test(text) || /[\u0000-\u001f\u007f]/u.test(text.replace(/\s/g, ''))) {
    throw new Error('player_action_plan_mutating_sql_rejected');
  }
  return text;
}

function requireRows(result) {
  if (result?.success === false || !Array.isArray(result?.results)) {
    throw new Error('player_action_plan_query_failed');
  }
  return result.results;
}

function requireFirst(result) {
  if (result?.success === false) throw new Error('player_action_plan_query_failed');
  return result ?? null;
}

export function createReadOnlyActionPlanDb(db, options = {}) {
  if (!db || typeof db.prepare !== 'function') throw new Error('player_action_plan_database_unavailable');
  const maxStatements = Math.max(1, Math.min(200, Number(options.maxStatements) || 80));
  const statementTimeoutMs = Math.max(10, Math.min(5000, Number(options.statementTimeoutMs) || 1500));
  // A sequence of independently bounded D1 reads can otherwise stall for
  // tens of seconds. All probes and projections share one absolute deadline.
  const projectionTimeoutMs = Math.max(50, Math.min(15000, Number(options.projectionTimeoutMs) || 5000));
  const projectionDeadline = Date.now() + projectionTimeoutMs;
  function remainingBudget() {
    const remaining = projectionDeadline - Date.now();
    if (remaining <= 0) throw new Error('player_action_plan_projection_deadline_exceeded');
    return remaining;
  }
  const tableCache = new Map();
  const calls = [];

  function reserve(sql, params, method) {
    remainingBudget();
    const text = assertReadOnlySql(sql);
    if (calls.length >= maxStatements) throw new Error('player_action_plan_query_budget_exceeded');
    calls.push({ method, sql: text, parameter_count: params.length });
    return db.prepare(text).bind(...params);
  }

  async function settleWithin(promise) {
    const remaining = remainingBudget();
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(
        projectionDeadline - Date.now() <= 0
          ? 'player_action_plan_projection_deadline_exceeded'
          : 'player_action_plan_query_timeout',
      )), Math.min(statementTimeoutMs, remaining));
    });
    try { return await Promise.race([promise, timeout]); }
    finally { clearTimeout(timeoutId); }
  }

  async function all(sql, params = []) {
    return requireRows(await settleWithin(reserve(sql, params, 'all').all()));
  }

  async function first(sql, params = []) {
    return requireFirst(await settleWithin(reserve(sql, params, 'first').first()));
  }

  async function tableExists(tableName) {
    const table = String(tableName || '');
    if (!/^[a-z][a-z0-9_]{0,80}$/u.test(table)) throw new Error('player_action_plan_invalid_table');
    if (!tableCache.has(table)) {
      tableCache.set(table, first(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        [table],
      ).then((row) => Boolean(row?.name)).catch((error) => {
        tableCache.delete(table);
        throw error;
      }));
    }
    return tableCache.get(table);
  }

  return Object.freeze({
    all,
    first,
    tableExists,
    stats() {
      return Object.freeze({ statement_count: calls.length, max_statements: maxStatements,
        statement_timeout_ms: statementTimeoutMs, projection_timeout_ms: projectionTimeoutMs });
    },
    audit() {
      return calls.map((entry) => ({ ...entry }));
    },
  });
}

export function isReadOnlyActionPlanSql(sql) {
  try {
    assertReadOnlySql(sql);
    return true;
  } catch {
    return false;
  }
}
