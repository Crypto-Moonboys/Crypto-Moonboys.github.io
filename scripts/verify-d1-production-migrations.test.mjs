import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REQUIRED_D1_MIGRATIONS,
  validateRequest,
  verifyD1MigrationPayload,
} from './verify-d1-production-migrations.mjs';

const request = JSON.parse(fs.readFileSync(new URL('../deployments/d1-evidence-request.json', import.meta.url), 'utf8'));
const workflow = fs.readFileSync(new URL('../.github/workflows/d1-production-migration-verify.yml', import.meta.url), 'utf8');
const remoteQueryStep = workflow.match(/- name: Query production migration records[\s\S]*?(?=\n\s+- name: Report sanitised query failure)/)?.[0] || '';
assert.match(
  remoteQueryStep,
  /050_telegram_pet_guided_progression\.sql/,
  'the workflow_dispatch D1 query must request migration 050 from production',
);
assert.match(
  remoteQueryStep,
  /051_telegram_pet_content_reconciliation\.sql/,
  'the workflow_dispatch D1 query must request migration 051 from production',
);
assert.match(
  remoteQueryStep,
  /053_telegram_pet_species_lifecycle\.sql/,
  'the workflow_dispatch D1 query must request migration 053 from production',
);
assert.match(
  remoteQueryStep,
  /055_telegram_pet_season_slots\.sql/,
  'the workflow_dispatch D1 query must request migration 055 from production',
);
assert.match(
  remoteQueryStep,
  /056_telegram_pet_instance_state\.sql/,
  'the workflow_dispatch D1 query must request migration 056 from production',
);
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

const withoutCutoverReconciliation = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '045_telegram_pet_inventory_cutover_reconciliation.sql'),
};
assert.throws(
  () => validateRequest(withoutCutoverReconciliation),
  /missing required migrations: 045_telegram_pet_inventory_cutover_reconciliation\.sql/,
  'deployment verification must reject an evidence request that omits migration 045',
);

const withoutRuntimeUniqueConstraints = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '046_fix_pet_runtime_unique_constraints.sql'),
};
assert.throws(
  () => validateRequest(withoutRuntimeUniqueConstraints),
  /missing required migrations: 046_fix_pet_runtime_unique_constraints\.sql/,
  'deployment verification must reject an evidence request that omits migration 046',
);

const withoutLeaderboardRewardConstraint = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '047_fix_telegram_leaderboard_reward_constraint.sql'),
};
assert.throws(
  () => validateRequest(withoutLeaderboardRewardConstraint),
  /missing required migrations: 047_fix_telegram_leaderboard_reward_constraint\.sql/,
  'deployment verification must reject an evidence request that omits migration 047',
);

const withoutPlayerExpansion = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '048_telegram_pet_player_expansion.sql'),
};
assert.throws(
  () => validateRequest(withoutPlayerExpansion),
  /missing required migrations: 048_telegram_pet_player_expansion\.sql/,
  'deployment verification must reject an evidence request that omits migration 048',
);

const withoutDialogueHistory = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '049_telegram_pet_dialogue_history.sql'),
};
assert.throws(
  () => validateRequest(withoutDialogueHistory),
  /missing required migrations: 049_telegram_pet_dialogue_history\.sql/,
  'deployment verification must reject an evidence request that omits migration 049',
);

const withoutGuidedProgression = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '050_telegram_pet_guided_progression.sql'),
};
const withoutContentReconciliation = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '051_telegram_pet_content_reconciliation.sql'),
};
assert.throws(
  () => validateRequest(withoutContentReconciliation),
  /missing required migrations: 051_telegram_pet_content_reconciliation\.sql/,
  'deployment verification must reject an evidence request that omits migration 051',
);
assert.throws(
  () => validateRequest(withoutGuidedProgression),
  /missing required migrations: 050_telegram_pet_guided_progression\.sql/,
  'deployment verification must reject an evidence request that omits migration 050',
);

const withoutSpeciesLifecycle = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '053_telegram_pet_species_lifecycle.sql'),
};
assert.throws(
  () => validateRequest(withoutSpeciesLifecycle),
  /missing required migrations: 053_telegram_pet_species_lifecycle\.sql/,
  'deployment verification must reject an evidence request that omits migration 053',
);

const withoutSeasonSlots = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '055_telegram_pet_season_slots.sql'),
};
assert.throws(
  () => validateRequest(withoutSeasonSlots),
  /missing required migrations: 055_telegram_pet_season_slots\.sql/,
  'deployment verification must reject an evidence request that omits migration 055',
);

const withoutPetInstanceState = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '056_telegram_pet_instance_state.sql'),
};
assert.throws(
  () => validateRequest(withoutPetInstanceState),
  /missing required migrations: 056_telegram_pet_instance_state\.sql/,
  'deployment verification must reject an evidence request that omits migration 056',
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
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '045_telegram_pet_inventory_cutover_reconciliation.sql'),
  }], request),
  /missing migrations: 045_telegram_pet_inventory_cutover_reconciliation\.sql/,
  'deployment verification must fail when production D1 has not applied migration 045',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '046_fix_pet_runtime_unique_constraints.sql'),
  }], request),
  /missing migrations: 046_fix_pet_runtime_unique_constraints\.sql/,
  'deployment verification must fail when production D1 has not applied migration 046',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '047_fix_telegram_leaderboard_reward_constraint.sql'),
  }], request),
  /missing migrations: 047_fix_telegram_leaderboard_reward_constraint\.sql/,
  'deployment verification must fail when production D1 has not applied migration 047',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '048_telegram_pet_player_expansion.sql'),
  }], request),
  /missing migrations: 048_telegram_pet_player_expansion\.sql/,
  'deployment verification must fail when production D1 has not applied migration 048',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '049_telegram_pet_dialogue_history.sql'),
  }], request),
  /missing migrations: 049_telegram_pet_dialogue_history\.sql/,
  'deployment verification must fail when production D1 has not applied migration 049',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '050_telegram_pet_guided_progression.sql'),
  }], request),
  /missing migrations: 050_telegram_pet_guided_progression\.sql/,
  'deployment verification must fail when production D1 has not applied migration 050',
);
assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '051_telegram_pet_content_reconciliation.sql'),
  }], request),
  /missing migrations: 051_telegram_pet_content_reconciliation\.sql/,
  'deployment verification must fail when production D1 has not applied migration 051',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '053_telegram_pet_species_lifecycle.sql'),
  }], request),
  /missing migrations: 053_telegram_pet_species_lifecycle\.sql/,
  'deployment verification must fail when production D1 has not applied migration 053',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '055_telegram_pet_season_slots.sql'),
  }], request),
  /missing migrations: 055_telegram_pet_season_slots\.sql/,
  'deployment verification must fail when production D1 has not applied migration 055',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '056_telegram_pet_instance_state.sql'),
  }], request),
  /missing migrations: 056_telegram_pet_instance_state\.sql/,
  'deployment verification must fail when production D1 has not applied migration 056',
);

console.log('verify-d1-production-migrations.test.mjs passed');
