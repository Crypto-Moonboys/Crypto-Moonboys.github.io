import { requirePetMutationResult } from './read-result.js';

// D1 batches are transactions, but a successful statement can change no rows.
// Check SQLite's changes() immediately after each required write, before any
// later statement or COMMIT. Invalid JSON paths abort and roll back the batch.
// Preserve callers' result indexes; legitimate reservation losers remain no-ops.
export async function atomicPetBatch(db, statements, requirements = []) {
  const required = new Map(requirements.map(rule => [rule.index, rule]));
  const batch = [], positions = [];
  for (const [index, statement] of statements.entries()) {
    positions.push(batch.length);
    batch.push(statement);
    const rule = required.get(index);
    if (rule) batch.push(db.prepare(`SELECT json_extract('{}', CASE
      WHEN NOT (${rule.when || '1=1'}) OR changes()=? THEN '$'
      ELSE 'moonpet_required_mutation_missing' END) AS mutation_committed`)
      .bind(...(rule.args || []), rule.changes ?? 1));
  }
  const results = await db.batch(batch);
  if (!Array.isArray(results) || results.length !== batch.length) throw new Error('pet_state_write_unavailable');
  results.forEach(result => {
    if (!result) throw new Error('pet_state_write_unavailable');
    requirePetMutationResult(result);
  });
  return positions.map(index => results[index]);
}
