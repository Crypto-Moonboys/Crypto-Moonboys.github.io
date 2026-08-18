import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../workers/moonboys-api/pets/season-completion.js', import.meta.url), 'utf8');
const seasonAuthoritySource = readFileSync(new URL('../workers/moonboys-api/pets/season-authority.js', import.meta.url), 'utf8');
const sanctuarySource = readFileSync(new URL('../workers/moonboys-api/pets/sanctuary.js', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const walletMigration = readFileSync(new URL('../workers/moonboys-api/migrations/063_arcade_xp_spendable_wallet.sql', import.meta.url), 'utf8');

assert.match(
  source,
  /sanctuary_transition:\s*'season_settlement'/,
  'Season completion must defer Sanctuary transition until season settlement.',
);

assert.doesNotMatch(
  source,
  /movePetToSanctuaryIfEligible/,
  'Finalizing a completed pet must not immediately archive it into Sanctuary.',
);

const slotPurchaseSource = workerSource.slice(
  workerSource.indexOf('async function buyPetSeasonSlot'),
  workerSource.indexOf('async function switchActivePetSeasonSlot'),
);
assert.match(slotPurchaseSource, /UPDATE arcade_xp_wallets SET arcade_xp_spendable=arcade_xp_spendable-\?/,
  'Paid seasonal slots must debit the spendable Arcade XP wallet.');
assert.doesNotMatch(slotPurchaseSource, /UPDATE arcade_progression_state SET arcade_xp_total=arcade_xp_total-\?/,
  'Lifetime Arcade XP must never be direct spend authority for paid seasonal slots.');
assert.match(walletMigration, /Existing lifetime XP is not backfilled/,
  'Wallet migration must not reinterpret deployed lifetime XP as spendable credit.');
assert.doesNotMatch(walletMigration, /CREATE TABLE IF NOT EXISTS arcade_xp_wallets/,
  'Wallet migration must fail loudly on drift instead of masking an unexpected pre-existing table.');

const progressionSyncSource = workerSource.slice(
  workerSource.indexOf("if (path === '/arcade/progression/sync'"),
  workerSource.indexOf("if (path === '/faction/status'"),
);
assert.match(workerSource, /SELECT COALESCE\(SUM\(xp_awarded\), 0\) AS earned_from_events[\s\S]*FROM arcade_progression_events[\s\S]*status = 'accepted'/,
  'Arcade progression wallet credits must be recoverable from accepted event ledger rows.');
assert.match(progressionSyncSource, /const walletRecoveredXp = await reconcileArcadeXpWalletFromEvents\(env\.DB, verified\.telegramId\);/,
  'Arcade progression sync must reconcile wallet credits from accepted runs before returning.');

assert.match(
  source,
  /SELECT s\.pet_id, s\.telegram_id, s\.season_key, i\.level, i\.pet_xp/,
  'Lifecycle readiness must start from pet instance state, not the active account mirror.',
);

assert.doesNotMatch(
  source,
  /legacyAccountLevel|telegram_pet_profiles WHERE telegram_id/,
  'Lifecycle readiness must not read the account profile mirror for pet level authority.',
);

assert.match(
  source,
  /currentDefinition = evolutions\.find\(\(entry\) => Number\(entry\.stage\) === stage\)/,
  'Migrated pet fallback level must infer only the current evolution already earned.',
);

assert.match(
  source,
  /const level = migratedPetMissingCounters \? Math\.max\(instanceLevel, integer\(currentDefinition\?\.requirements\?\.pet_level\)\) : instanceLevel;/,
  'Migrated pet fallback level must not borrow the next evolution requirement.',
);

assert.match(
  source,
  /const createdAtSource = await seasonSlotCreatedAt\(db, petId, seasonKey\);/,
  'Lifecycle age readiness must use the same season-slot age authority as evolution mutation.',
);

assert.match(
  source,
  /const ageDays = computedAgeDays == null \? 0 : computedAgeDays;/,
  'Unknown age authority must not advertise readiness that the evolution mutation will reject.',
);

assert.doesNotMatch(
  source,
  /evaluateMoonpetEvolutionRequirements/,
  'Lifecycle readiness must not call the active-pet evolution validator for inactive pet progress cards.',
);

assert.match(
  sanctuarySource,
  /isSeasonSettlementReconciliation/,
  'Sanctuary reconciliation must expose an explicit season-settlement gate.',
);

assert.match(
  workerSource,
  /function getPetSeasonInfo\(now = new Date\(\)\) \{\s+return getMoonpetSeasonInfo\(now\);\s+\}/,
  'Worker slot creation must delegate to canonical Moonpet season authority.',
);

assert.match(
  seasonAuthoritySource,
  /Math\.floor\(date\.getUTCMonth\(\) \/ 3\)/,
  'Canonical Moonpet season authority must use calendar-quarter pet season keys.',
);

assert.match(
  sanctuarySource,
  /getMoonpetSeasonKey/,
  'Sanctuary current season filtering must use the shared slot season authority.',
);

assert.doesNotMatch(
  `${seasonAuthoritySource}\n${sanctuarySource}`,
  /dayOfYear|Math\.floor\(dayOfYear \/ 90\)/,
  'Moonpet season authority must not use an independent 90-day key while slot creation uses quarters.',
);

assert.match(
  sanctuarySource,
  /const seasonFilter = explicitSettlement \? '' : ' AND c\.season_key<>\?';/,
  'Default reconciliation must skip the current season while keeping completed past seasons reachable.',
);

assert.match(
  sanctuarySource,
  /WHERE c\.telegram_id=\? AND s\.pet_id IS NULL\$\{seasonFilter\}/,
  'Completed-pet reconciliation must apply the season filter before moving pets to Sanctuary.',
);

for (const requiredField of ['current_evolution', 'min_age_days', 'growth_marks', 'weekly_crests']) {
  assert.match(
    source,
    new RegExp(`${requiredField}:\\s*[a-zA-Z]+Progress`),
    `Lifecycle progress must expose ${requiredField} from per-pet evidence.`,
  );
}

assert.match(
  source,
  /crest:\$\{petId\}:\$\{seasonKey\}:\$\{week\}:\$\{objective\.objective_id\}/,
  'Weekly Crest ids must remain pet-scoped so multiple seasonal pets can earn the same week/objective independently.',
);

assert.match(
  source,
  /weekly_journey:\s*Object\.freeze/,
  'Weekly journey objective must stay registered as a second Crest path for multi-pet season completion.',
);

console.log('Moonpet season integrity hotfix source guard passed.');
