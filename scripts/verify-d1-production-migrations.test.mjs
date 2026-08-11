import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REQUIRED_D1_MIGRATIONS,
  validateRequest,
  verifyD1MigrationPayload,
} from './verify-d1-production-migrations.mjs';

const request = JSON.parse(fs.readFileSync(new URL('../deployments/d1-evidence-request.json', import.meta.url), 'utf8'));
assert.deepEqual(
  [...request.required_migrations].sort(),
  [...REQUIRED_D1_MIGRATIONS].sort(),
  'the production evidence request must track the complete exact migration gate',
);
assert.doesNotThrow(() => validateRequest(request), 'the checked-in D1 evidence request must satisfy the migration contract');

const withoutRepeatSlots = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '041_telegram_pet_repeat_reward_slots.sql'),
};
assert.throws(
  () => validateRequest(withoutRepeatSlots),
  /missing required migrations: 041_telegram_pet_repeat_reward_slots\.sql/,
  'deployment verification must reject an evidence request that omits migration 041',
);

const withoutRogueliteFoundation = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '042_telegram_pet_roguelite_foundation.sql'),
};
assert.throws(
  () => validateRequest(withoutRogueliteFoundation),
  /missing required migrations: 042_telegram_pet_roguelite_foundation\.sql/,
  'deployment verification must reject an evidence request that omits migration 042',
);

const withoutIdentityExpansion = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '043_telegram_pet_identity_expansion.sql'),
};
assert.throws(
  () => validateRequest(withoutIdentityExpansion),
  /missing required migrations: 043_telegram_pet_identity_expansion\.sql/,
  'deployment verification must reject an evidence request that omits migration 043',
);

const withoutDailyRuns = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '044_telegram_pet_daily_runs.sql'),
};
assert.throws(
  () => validateRequest(withoutDailyRuns),
  /missing required migrations: 044_telegram_pet_daily_runs\.sql/,
  'deployment verification must reject an evidence request that omits migration 044',
);

const verifiedRows = REQUIRED_D1_MIGRATIONS.map((name) => ({ name }));
assert.equal(
  verifyD1MigrationPayload([{ success: true, results: verifiedRows }], request, '2026-08-10T00:00:00.000Z').status,
  'verified-applied',
  'deployment verification must accept evidence containing every required migration',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '041_telegram_pet_repeat_reward_slots.sql'),
  }], request),
  /missing migrations: 041_telegram_pet_repeat_reward_slots\.sql/,
  'deployment verification must fail when production D1 has not applied migration 041',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '042_telegram_pet_roguelite_foundation.sql'),
  }], request),
  /missing migrations: 042_telegram_pet_roguelite_foundation\.sql/,
  'deployment verification must fail when production D1 has not applied migration 042',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '043_telegram_pet_identity_expansion.sql'),
  }], request),
  /missing migrations: 043_telegram_pet_identity_expansion\.sql/,
  'deployment verification must fail when production D1 has not applied migration 043',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '044_telegram_pet_daily_runs.sql'),
  }], request),
  /missing migrations: 044_telegram_pet_daily_runs\.sql/,
  'deployment verification must fail when production D1 has not applied migration 044',
);

console.log('verify-d1-production-migrations.test.mjs passed');
