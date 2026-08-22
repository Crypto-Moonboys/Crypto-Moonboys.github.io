import assert from 'node:assert/strict';
import {
  verifyMoonpetHardeningAuditPayloads,
  verifyMoonpetHardeningLivePayload,
  verifyMoonpetHardeningSchemaPayload,
  verifyMoonpetHardeningSpecialistPayload,
} from './verify-d1-moonpet-hardening-audit.mjs';

const schemaPayload = [{
  success: true,
  results: [
    { type: 'view', name: 'moonpet_invalid_identity_authority_rows' },
    { type: 'table', name: 'telegram_pet_specialist_progression' },
    { type: 'table', name: 'telegram_pet_specialist_events' },
    { type: 'table', name: 'telegram_pet_live_progression_state' },
    { type: 'table', name: 'telegram_pet_system_events' },
    { type: 'table', name: 'telegram_pet_event_chain_progress' },
    { type: 'table', name: 'telegram_pet_seasonal_boss_progress' },
    { type: 'index', name: 'idx_pet_specialist_progression_owner' },
    { type: 'index', name: 'idx_pet_specialist_events_owner_created' },
    { type: 'index', name: 'idx_pet_system_events_owner' },
    { type: 'index', name: 'idx_pet_system_events_pet_owner' },
  ],
}];

const specialistPayload = [{ success: true, results: [{
  invalid_specialist_progression_rows: 0,
  invalid_specialist_event_rows: '0',
  specialist_event_pet_crossovers: 0,
  account_wallet_pet_id_columns: 0,
  missing_wallet_balance_columns: 0,
}] }];

const livePayload = [{ success: true, results: [{
  invalid_live_progression_rows: 0,
  invalid_system_event_rows: 0,
  invalid_event_chain_rows: 0,
  invalid_seasonal_boss_rows: 0,
  empty_pet_owned_system_events: 0,
  invalid_daily_journey_rows: 0,
  invalid_weekly_journey_rows: 0,
  invalid_daily_run_rows: 0,
}] }];

assert.doesNotThrow(() => verifyMoonpetHardeningSchemaPayload(schemaPayload));
assert.doesNotThrow(() => verifyMoonpetHardeningSpecialistPayload(specialistPayload));
assert.doesNotThrow(() => verifyMoonpetHardeningLivePayload(livePayload));
assert.equal(
  verifyMoonpetHardeningAuditPayloads({ schemaPayload, specialistPayload, livePayload }).status,
  'verified',
);

assert.throws(
  () => verifyMoonpetHardeningSchemaPayload([{ success: true, results: [] }]),
  /Missing schema objects/,
);

assert.throws(
  () => verifyMoonpetHardeningSpecialistPayload([{ success: true, results: [{
    invalid_specialist_progression_rows: 1,
    invalid_specialist_event_rows: 0,
    specialist_event_pet_crossovers: 0,
    account_wallet_pet_id_columns: 0,
    missing_wallet_balance_columns: 0,
  }] }]),
  /invalid_specialist_progression_rows expected 0, got 1/,
);

assert.throws(
  () => verifyMoonpetHardeningLivePayload([{ success: true, results: [{
    invalid_live_progression_rows: 0,
    invalid_system_event_rows: 0,
    invalid_event_chain_rows: 0,
    invalid_seasonal_boss_rows: 0,
    empty_pet_owned_system_events: 0,
    invalid_daily_journey_rows: 'bad',
    invalid_weekly_journey_rows: 0,
    invalid_daily_run_rows: 0,
  }] }]),
  /Invalid invalid_daily_journey_rows value/,
);

console.log('verify-d1-moonpet-hardening-audit.test.mjs passed');
