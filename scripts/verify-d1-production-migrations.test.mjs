import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REQUIRED_D1_MIGRATIONS,
  normalizeD1StatementResult,
  validateRequest,
  verifyD1MigrationPayload,
} from './verify-d1-production-migrations.mjs';
import { verifyD1IdentityAuthorityAuditPayload } from './verify-d1-identity-authority-audit.mjs';

const request = JSON.parse(fs.readFileSync(new URL('../deployments/d1-evidence-request.json', import.meta.url), 'utf8'));
const workflow = fs.readFileSync(new URL('../.github/workflows/d1-production-migration-verify.yml', import.meta.url), 'utf8');
const remoteQueryStep = workflow.match(/- name: Query production migration records[\s\S]*?(?=\n\s+- name: Report sanitised query failure)/)?.[0] || '';
const remoteIdentityAuditStep = workflow.match(/- name: Query production identity authority violations[\s\S]*?(?=\n\s+- name: Upload sanitised evidence)/)?.[0] || '';
const pullRequestPaths = workflow.match(/pull_request:\s*\n\s*paths:([\s\S]*?)\n\s*workflow_dispatch:/)?.[1] || '';
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/058_telegram_pet_season_completion\.sql/, 'migration 058 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/059_telegram_pet_sanctuary\.sql/, 'migration 059 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/060_telegram_pet_sanctuary_indexes\.sql/, 'migration 060 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/061_moonpet_season_economy_calibration\.sql/, 'migration 061 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/062_moonpet_evolution_stage_5\.sql/, 'migration 062 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/063_arcade_xp_spendable_wallet\.sql/, 'migration 063 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/064_moonpet_beta_runtime_cutover\.sql/, 'migration 064 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/065_moonpet_reward_pet_id_authority\.sql/, 'migration 065 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/066_moonpet_run_pet_id_authority\.sql/, 'migration 066 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/067_moonpet_daily_journey_authority\.sql/, 'migration 067 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/068_moonpet_weekly_journey_authority\.sql/, 'migration 068 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/069_moonpet_breeding_authority\.sql/, 'migration 069 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/070_moonpet_pet_identity_achievement_authority\.sql/, 'migration 070 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/071_moonpet_arena_pet_authority\.sql/, 'migration 071 changes must trigger production migration verification');
assert.match(pullRequestPaths, /workers\/moonboys-api\/migrations\/072_moonpet_identity_authority_verification\.sql/, 'migration 072 changes must trigger production migration verification');
assert.match(pullRequestPaths, /scripts\/verify-d1-identity-authority-audit\.mjs/, 'identity authority audit parser changes must trigger production migration verification');
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
assert.match(
  remoteQueryStep,
  /057_telegram_pet_lifecycle_pet_id\.sql/,
  'the workflow_dispatch D1 query must request migration 057 from production',
);
assert.match(
  remoteQueryStep,
  /058_telegram_pet_season_completion\.sql/,
  'the workflow_dispatch D1 query must request migration 058 from production',
);
assert.match(remoteQueryStep, /059_telegram_pet_sanctuary\.sql/, 'the workflow_dispatch D1 query must request migration 059 from production');
assert.match(remoteQueryStep, /060_telegram_pet_sanctuary_indexes\.sql/, 'the workflow_dispatch D1 query must request migration 060 from production');
assert.match(remoteQueryStep, /061_moonpet_season_economy_calibration\.sql/, 'the workflow_dispatch D1 query must request migration 061 from production');
assert.match(remoteQueryStep, /062_moonpet_evolution_stage_5\.sql/, 'the workflow_dispatch D1 query must request migration 062 from production');
assert.match(remoteQueryStep, /063_arcade_xp_spendable_wallet\.sql/, 'the workflow_dispatch D1 query must request migration 063 from production');
assert.match(remoteQueryStep, /064_moonpet_beta_runtime_cutover\.sql/, 'the workflow_dispatch D1 query must request migration 064 from production');
assert.match(remoteQueryStep, /065_moonpet_reward_pet_id_authority\.sql/, 'the workflow_dispatch D1 query must request migration 065 from production');
assert.match(remoteQueryStep, /066_moonpet_run_pet_id_authority\.sql/, 'the workflow_dispatch D1 query must request migration 066 from production');
assert.match(remoteQueryStep, /067_moonpet_daily_journey_authority\.sql/, 'the workflow_dispatch D1 query must request migration 067 from production');
assert.match(remoteQueryStep, /068_moonpet_weekly_journey_authority\.sql/, 'the workflow_dispatch D1 query must request migration 068 from production');
assert.match(remoteQueryStep, /069_moonpet_breeding_authority\.sql/, 'the workflow_dispatch D1 query must request migration 069 from production');
assert.match(remoteQueryStep, /070_moonpet_pet_identity_achievement_authority\.sql/, 'the workflow_dispatch D1 query must request migration 070 from production');
assert.match(remoteQueryStep, /071_moonpet_arena_pet_authority\.sql/, 'the workflow_dispatch D1 query must request migration 071 from production');
assert.match(remoteQueryStep, /072_moonpet_identity_authority_verification\.sql/, 'the workflow_dispatch D1 query must request migration 072 from production');
assert.match(remoteIdentityAuditStep, /SELECT COUNT\(\*\) AS invalid_identity_authority_rows FROM moonpet_invalid_identity_authority_rows/,
  'workflow_dispatch must query the production identity authority verification view');
assert.match(remoteIdentityAuditStep, /verify-d1-identity-authority-audit\.mjs/,
  'workflow_dispatch must use the shared D1 response normalisation parser for identity authority audits');
assert.match(remoteIdentityAuditStep, /d1-identity-audit-verify/,
  'workflow_dispatch must expose a distinct identity authority audit verification status');
assert.match(workflow, /d1-query-failure-diagnostics/,
  'workflow_dispatch must upload migration query failure diagnostics separately');
assert.match(workflow, /d1-identity-authority-audit-failure-diagnostics/,
  'workflow_dispatch must upload identity audit failure diagnostics separately');
assert.match(workflow, /d1-identity-authority-audit-result\.txt/,
  'workflow_dispatch must upload successful identity audit evidence');
assert.doesNotMatch(workflow, /path:\s*\|\s*d1-identity-authority-audit-failure\.txt\s*d1-identity-authority-audit\.json/s,
  'identity audit failure artifacts must not upload raw Wrangler JSON');
assert.doesNotMatch(workflow, /path:\s*\|\s*d1-identity-authority-audit-failure\.txt[\s\S]*d1-identity-authority-audit\.stderr[\s\S]*retention-days: 30/s,
  'identity audit failure artifacts must not upload raw Wrangler stderr');
assert.doesNotMatch(workflow, /path:\s*\|\s*d1-production-migration-evidence\.json\s*d1-identity-authority-audit\.json/s,
  'successful evidence artifacts must not upload raw Wrangler identity audit JSON');
assert.ok(
  REQUIRED_D1_MIGRATIONS.includes('069_moonpet_breeding_authority.sql'),
  'migration 069 must be detected by the production migration verification script',
);
assert.ok(
  REQUIRED_D1_MIGRATIONS.includes('070_moonpet_pet_identity_achievement_authority.sql'),
  'migration 070 must be detected by the production migration verification script',
);
assert.ok(
  REQUIRED_D1_MIGRATIONS.includes('071_moonpet_arena_pet_authority.sql'),
  'migration 071 must be detected by the production migration verification script',
);
assert.ok(
  REQUIRED_D1_MIGRATIONS.includes('072_moonpet_identity_authority_verification.sql'),
  'migration 072 must be detected by the production migration verification script',
);
assert.ok(
  request.required_migrations.includes('069_moonpet_breeding_authority.sql'),
  'migration 069 must be included in the checked-in D1 evidence request',
);
assert.ok(
  request.required_migrations.includes('070_moonpet_pet_identity_achievement_authority.sql'),
  'migration 070 must be included in the checked-in D1 evidence request',
);
assert.ok(
  request.required_migrations.includes('071_moonpet_arena_pet_authority.sql'),
  'migration 071 must be included in the checked-in D1 evidence request',
);
assert.ok(
  request.required_migrations.includes('072_moonpet_identity_authority_verification.sql'),
  'migration 072 must be included in the checked-in D1 evidence request',
);
assert.deepEqual(
  [...request.required_migrations].sort(),
  [...REQUIRED_D1_MIGRATIONS].sort(),
  'the production evidence request must track the complete exact migration gate',
);
assert.doesNotThrow(() => validateRequest(request), 'the checked-in D1 evidence request must satisfy the migration contract');

assert.doesNotThrow(() => normalizeD1StatementResult([{ success: true, results: [] }]), 'normaliser accepts array statement responses');
assert.doesNotThrow(() => normalizeD1StatementResult({ result: [{ success: true, results: [] }] }), 'normaliser accepts result[] responses');
assert.doesNotThrow(() => normalizeD1StatementResult({ success: true, results: [] }), 'normaliser accepts results[] object responses');
assert.throws(() => normalizeD1StatementResult([{ success: false, results: [] }]), /did not report success/,
  'normaliser requires success === true');
assert.throws(() => normalizeD1StatementResult({ success: false, result: [{ success: true, results: [] }] }), /did not report success/,
  'normaliser rejects top-level success:false before result unwrapping');
for (const payload of [
  [{ success: true, results: [{ invalid_identity_authority_rows: 0 }] }],
  { result: [{ success: true, results: [{ invalid_identity_authority_rows: '0' }] }] },
  { success: true, results: [{ count: 0 }] },
]) assert.deepEqual(verifyD1IdentityAuthorityAuditPayload(payload), { invalid_identity_authority_rows: 0 },
  'identity audit parser accepts every Wrangler D1 response shape');
for (const value of [null, '', '-1', -1, '1.5', 1.5]) assert.throws(
  () => verifyD1IdentityAuthorityAuditPayload([{ success: true, results: [{ invalid_identity_authority_rows: value }] }]),
  /Invalid identity authority audit output/,
  `identity audit parser rejects malformed count ${JSON.stringify(value)}`,
);
assert.throws(
  () => verifyD1IdentityAuthorityAuditPayload([{ success: false, results: [{ invalid_identity_authority_rows: 0 }] }]),
  /did not report success/,
  'identity audit parser requires success === true',
);
assert.throws(
  () => verifyD1IdentityAuthorityAuditPayload([{ success: true, results: [{ invalid_identity_authority_rows: 1 }] }]),
  /Expected 0 invalid identity authority rows, got 1/,
  'identity audit parser fails deployment when invalid authority rows exist',
);

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

const withoutArcadeXpSpendableWallet = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '063_arcade_xp_spendable_wallet.sql'),
};
const withoutMoonpetSeasonEconomyCalibration = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '061_moonpet_season_economy_calibration.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetSeasonEconomyCalibration),
  /missing required migrations: 061_moonpet_season_economy_calibration\.sql/,
  'deployment verification must reject an evidence request that omits migration 061',
);
const withoutMoonpetEvolutionStage5 = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '062_moonpet_evolution_stage_5.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetEvolutionStage5),
  /missing required migrations: 062_moonpet_evolution_stage_5\.sql/,
  'deployment verification must reject an evidence request that omits migration 062',
);
assert.throws(
  () => validateRequest(withoutArcadeXpSpendableWallet),
  /missing required migrations: 063_arcade_xp_spendable_wallet\.sql/,
  'deployment verification must reject an evidence request that omits migration 063',
);

const withoutMoonpetBetaRuntimeCutover = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '064_moonpet_beta_runtime_cutover.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetBetaRuntimeCutover),
  /missing required migrations: 064_moonpet_beta_runtime_cutover\.sql/,
  'deployment verification must reject an evidence request that omits migration 064',
);

const withoutMoonpetRewardPetIdAuthority = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '065_moonpet_reward_pet_id_authority.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetRewardPetIdAuthority),
  /missing required migrations: 065_moonpet_reward_pet_id_authority\.sql/,
  'deployment verification must reject an evidence request that omits migration 065',
);

const withoutMoonpetDailyJourneyAuthority = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '067_moonpet_daily_journey_authority.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetDailyJourneyAuthority),
  /missing required migrations: 067_moonpet_daily_journey_authority\.sql/,
  'deployment verification must reject an evidence request that omits migration 067',
);

const withoutMoonpetWeeklyJourneyAuthority = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '068_moonpet_weekly_journey_authority.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetWeeklyJourneyAuthority),
  /missing required migrations: 068_moonpet_weekly_journey_authority\.sql/,
  'deployment verification must reject an evidence request that omits migration 068',
);

const withoutMoonpetBreedingAuthority = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '069_moonpet_breeding_authority.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetBreedingAuthority),
  /missing required migrations: 069_moonpet_breeding_authority\.sql/,
  'deployment verification must reject an evidence request that omits migration 069',
);

const withoutMoonpetPetIdentityAchievementAuthority = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '070_moonpet_pet_identity_achievement_authority.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetPetIdentityAchievementAuthority),
  /missing required migrations: 070_moonpet_pet_identity_achievement_authority\.sql/,
  'deployment verification must reject an evidence request that omits migration 070',
);

const withoutMoonpetArenaPetAuthority = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '071_moonpet_arena_pet_authority.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetArenaPetAuthority),
  /missing required migrations: 071_moonpet_arena_pet_authority\.sql/,
  'deployment verification must reject an evidence request that omits migration 071',
);

const withoutMoonpetIdentityAuthorityVerification = {
  ...request,
  required_migrations: request.required_migrations.filter((name) => name !== '072_moonpet_identity_authority_verification.sql'),
};
assert.throws(
  () => validateRequest(withoutMoonpetIdentityAuthorityVerification),
  /missing required migrations: 072_moonpet_identity_authority_verification\.sql/,
  'deployment verification must reject an evidence request that omits migration 072',
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

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '061_moonpet_season_economy_calibration.sql'),
  }], request),
  /missing migrations: 061_moonpet_season_economy_calibration\.sql/,
  'deployment verification must fail when production D1 has not applied migration 061',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '062_moonpet_evolution_stage_5.sql'),
  }], request),
  /missing migrations: 062_moonpet_evolution_stage_5\.sql/,
  'deployment verification must fail when production D1 has not applied migration 062',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '063_arcade_xp_spendable_wallet.sql'),
  }], request),
  /missing migrations: 063_arcade_xp_spendable_wallet\.sql/,
  'deployment verification must fail when production D1 has not applied migration 063',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '067_moonpet_daily_journey_authority.sql'),
  }], request),
  /missing migrations: 067_moonpet_daily_journey_authority\.sql/,
  'deployment verification must fail when production D1 has not applied migration 067',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '068_moonpet_weekly_journey_authority.sql'),
  }], request),
  /missing migrations: 068_moonpet_weekly_journey_authority\.sql/,
  'deployment verification must fail when production D1 has not applied migration 068',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '069_moonpet_breeding_authority.sql'),
  }], request),
  /missing migrations: 069_moonpet_breeding_authority\.sql/,
  'deployment verification must fail when production D1 has not applied migration 069',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '070_moonpet_pet_identity_achievement_authority.sql'),
  }], request),
  /missing migrations: 070_moonpet_pet_identity_achievement_authority\.sql/,
  'deployment verification must fail when production D1 has not applied migration 070',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '071_moonpet_arena_pet_authority.sql'),
  }], request),
  /missing migrations: 071_moonpet_arena_pet_authority\.sql/,
  'deployment verification must fail when production D1 has not applied migration 071',
);

assert.throws(
  () => verifyD1MigrationPayload([{
    success: true,
    results: verifiedRows.filter(({ name }) => name !== '072_moonpet_identity_authority_verification.sql'),
  }], request),
  /missing migrations: 072_moonpet_identity_authority_verification\.sql/,
  'deployment verification must fail when production D1 has not applied migration 072',
);

console.log('verify-d1-production-migrations.test.mjs passed');
