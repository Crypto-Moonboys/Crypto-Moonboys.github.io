// A Mini App request can span several D1 calls. Checking the active pointer
// once cannot authorize later reads/writes: another request can switch pets.
// Keep the rendered identity in request-local state and assert it inside the
// same D1 transaction as every statement, including standalone mutations.
// No SQL is rewritten and callers retain their original batch result indexes.
const STALE_PATH = 'moonpet_displayed_pet_changed';

export function isDisplayedPetScopeStaleError(error) {
  return String(error?.message || error).includes(STALE_PATH);
}

export function createDisplayedPetScope(database, owner, petId, seasonKey = null, { coalesceReads = false } = {}) {
  let changed = false;
  let pending = Promise.resolve();
  let reads = null;
  const statements = new WeakMap();
  const readOnly = new WeakSet();
  const stale = () => new Error(STALE_PATH);
  const guard = () => database.prepare(`SELECT json_extract('{}', CASE WHEN EXISTS (
    SELECT 1 FROM telegram_pet_active_slots a
    JOIN telegram_pet_instances p ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
    WHERE a.telegram_id=? AND a.pet_id=? AND p.status='active' AND s.status='active'
      AND (? IS NULL OR a.season_key=?)
  ) THEN '$' ELSE '${STALE_PATH}' END) AS displayed_pet_authority`)
    .bind(String(owner), String(petId), seasonKey, seasonKey);

  async function execute(entries) {
    if (changed) throw stale();
    const native = entries.map(entry => {
      const statement = statements.get(entry);
      if (!statement) throw new Error('displayed_pet_unscoped_statement');
      return statement;
    });
    try {
      // An invalid JSON path deliberately aborts the whole transaction when
      // the active pet differs. A separate SELECT followed by writes would
      // recreate the race. D1 rolls back all statements on assertion failure.
      const results = await database.batch([...native, guard()]);
      if (!Array.isArray(results) || results.length !== entries.length + 1) throw new Error('pet_state_read_unavailable');
      if (results.at(-1)?.success === false) throw new Error(results.at(-1).error || 'pet_state_read_unavailable');
      // Passing the ownership assertion does not make an earlier failed
      // statement successful. Never let callers treat it as saved progress or
      // an empty read, even when a failed response carries results/metadata.
      if (results.some(result => !result || result.success === false)) throw new Error('pet_state_read_unavailable');
      return results.slice(0, -1);
    } catch (error) {
      if (isDisplayedPetScopeStaleError(error)) changed = true;
      throw error;
    }
  }

  function enqueue(entries) {
    const result = pending.then(() => execute(entries));
    // Requests often read several projections in parallel. D1 transactions
    // execute sequentially; preserve that ordering within this request too.
    pending = result.catch(() => {});
    return result;
  }

  function flushReads(group = reads) {
    if (!group || group !== reads) return;
    reads = null;
    enqueue(group.entries).then(
      results => group.waiters.forEach((waiter, index) => waiter.resolve(results[index])),
      error => group.waiters.forEach(waiter => waiter.reject(error)),
    );
  }

  function batch(entries) {
    // Explicit batches and mutations are ordering barriers, never coalesced.
    flushReads();
    return enqueue(entries);
  }

  function read(statement) {
    if (!readOnly.has(statement)) return batch([statement]).then(results => results[0]);
    if (!reads) {
      reads = { entries: [], waiters: [] };
      const group = reads;
      Promise.resolve().then(() => flushReads(group));
    }
    reads.entries.push(statement);
    const result = new Promise((resolve, reject) => reads.waiters.push({ resolve, reject }));
    if (reads.entries.length >= 16) flushReads();
    return result;
  }

  function wrap(native, isReadOnly) {
    const statement = {
      bind(...args) { return wrap(native.bind(...args), isReadOnly); },
      async first(column) {
        const result = await read(statement);
        if (!Array.isArray(result?.results)) throw new Error('pet_state_read_unavailable');
        const row = result.results[0] || null;
        return column === undefined ? row : row?.[column] ?? null;
      },
      async all() { return read(statement); },
      async run() { return (await batch([statement]))[0]; },
    };
    statements.set(statement, native);
    if (isReadOnly) readOnly.add(statement);
    return statement;
  }

  return {
    // Only plain SELECTs qualify. CTEs, RETURNING and .run() retain their old
    // transaction boundaries. A single final assertion guards all reads in the
    // same D1 transaction, so switching ownership aborts the entire group.
    db: { prepare(query) { return wrap(database.prepare(query), coalesceReads && /^\s*SELECT\b/i.test(query)); }, batch },
    // Optional modules can fail independently while sharing the same sticky
    // ownership failure and ordering queue with the mandatory projection.
    singleReads: { prepare(query) { return wrap(database.prepare(query), false); }, batch },
    get changed() { return changed; },
  };
}
