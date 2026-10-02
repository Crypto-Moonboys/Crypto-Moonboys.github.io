import { requirePetFirstReadResult, requirePetReadResult } from './read-result.js';

// A successful no-row lookup is null. D1 failures and incomplete rows must never
// become a default battle, an empty queue or evidence that a payout is missing.
export function requirePetCombatRow(row, { text = [], number = [], keys = [] } = {}) {
  requirePetFirstReadResult(row);
  if (row === null) return null;
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || text.some((key) => typeof row[key] !== 'string' || !row[key].trim())
    || number.some((key) => typeof row[key] !== 'number' || !Number.isFinite(row[key]))
    || keys.some((key) => !Object.hasOwn(row, key) || row[key] === undefined)) {
    throw new Error('pet_state_read_unavailable');
  }
  return row;
}

export function requirePetCombatRows(result, shape) {
  requirePetReadResult(result);
  for (const row of result.results) {
    if (!requirePetCombatRow(row, shape)) throw new Error('pet_state_read_unavailable');
  }
  return result;
}

export const PET_ARENA_READ_SHAPE = Object.freeze({
  text: ['battle_id', 'chat_id', 'player1_telegram_id', 'status'],
  number: ['current_round', 'max_rounds', 'player1_hp', 'player2_hp', 'player1_special', 'player2_special'],
});
export const PET_KAIJU_READ_SHAPE = Object.freeze({
  text: ['match_id', 'chat_id', 'player1_telegram_id', 'status', 'mode'],
  keys: ['player1_card_key', 'player2_card_key', 'cpu_card_key', 'category_key', 'result'],
});
