import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../workers/moonboys-api/pets/season-completion.js', import.meta.url), 'utf8');
const sanctuarySource = readFileSync(new URL('../workers/moonboys-api/pets/sanctuary.js', import.meta.url), 'utf8');

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
  sanctuarySource,
  /const seasonFilter = explicitSettlement \? '' : ' AND c\.season_key<>\?';/,
  'Default reconciliation must skip the current season while keeping completed past seasons reachable.',
);

assert.match(
  sanctuarySource,
  /WHERE c\.telegram_id=\? AND s\.pet_id IS NULL\$\{seasonFilter\}/,
  'Completed-pet reconciliation must apply the season filter before moving pets to Sanctuary.',
);

for (const requiredField of ['min_age_days', 'growth_marks', 'weekly_crests']) {
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