import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('workers/moonboys-api/pets/season-completion.js', 'utf8');

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

assert.match(
  source,
  /petLifecycleCreatedAt/,
  'Lifecycle age checks must use the pet lifecycle table and not require season slot timestamp columns.',
);

assert.doesNotMatch(
  source,
  /evaluateMoonpetEvolutionRequirements/,
  'Lifecycle readiness must not call the active-pet evolution validator for inactive pet progress cards.',
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
