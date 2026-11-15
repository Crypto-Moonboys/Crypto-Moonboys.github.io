/**
 * Deterministic relic-pool selection, version 2.
 *
 * The boss drop/no-drop roll is intentionally not changed. The existing
 * FNV-1a :relic hash has a correlated low bit for ten-entry pools; mixing
 * higher bits into the lower half removes the even/odd index lock.
 *
 * A previously awarded reward is protected by its existing persisted
 * idempotency receipt. This function is used only when a fresh boss reward
 * is computed. No random source, new reward, or drop-chance change.
 */
export function mixBossRelicSelectionRoll(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError('invalid_boss_relic_roll');
  }
  const raw = value >>> 0;
  return (raw ^ (raw >>> 16)) >>> 0;
}

export function selectBossRelicId(pool, rawRoll) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  return pool[mixBossRelicSelectionRoll(rawRoll) % pool.length];
}
