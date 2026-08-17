import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('workers/moonboys-api/pets/season-completion.js', 'utf8');
const sanctuarySource = readFileSync('workers/moonboys-api/pets/sanctuary.js', 'utf8');

assert.match(
  source,
  /sanctuary_transition:\s*'season_settlement'/,
  'Season completion must defer Sanctuary transition until explicit season settlement.',
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
  /petLifecycleCreatedAt/,
  'Lifecycle age checks must use the pet lifecycle table and not require season slot timestamp columns.',
);

assert.match(
  source,
  /const ageDays = computedAgeDays == null \? minAgeDays : computedAgeDays;/,
  'Missing legacy age timestamps must not permanently block otherwise-qualified legacy pets.',
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
  /if \(!isSeasonSettlementReconciliation\(options\)\) return \[\];/,
  'Generic completed-pet reconciliation must no-op unless season settlement is explicitly requested.',
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