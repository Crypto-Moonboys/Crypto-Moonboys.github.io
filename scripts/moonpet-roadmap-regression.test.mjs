import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');

// Extract the futureSystemTitles definition block using TEST-EXPORT markers.
const startMarker = '// TEST-EXPORT: futureSystemTitles:start';
const endMarker = '// TEST-EXPORT: futureSystemTitles:end';
const blockStart = client.indexOf(startMarker);
assert.ok(blockStart !== -1, 'futureSystemTitles TEST-EXPORT block must be present');
const blockEnd = client.indexOf(endMarker, blockStart);
const futureSystemTitlesBlock = client.slice(blockStart, blockEnd);

// Allowed future roadmap systems — not yet playable, expected in roadmap panel.
const ROADMAP_ALLOWED = ['breeding', 'lineage', 'fusion', 'traits'];
for (const key of ROADMAP_ALLOWED) {
  assert.match(
    futureSystemTitlesBlock,
    new RegExp('\\b' + key + ':'),
    `"${key}" must be present in futureSystemTitles (it is a future roadmap system)`,
  );
}

// Playable systems — must never appear in futureSystemTitles.
const ROADMAP_BLOCKED = ['arena', 'kaiju', 'weekly_journey', 'daily_journey', 'equipment'];
for (const key of ROADMAP_BLOCKED) {
  assert.doesNotMatch(
    futureSystemTitlesBlock,
    new RegExp('\\b' + key + ':'),
    `"${key}" must NOT be in futureSystemTitles — it is an active playable system and must not appear in the roadmap panel`,
  );
}

// The rendered roadmap rows must also filter sanctuary and prestige so they
// never appear as plain roadmap entries (each has its own dedicated panel).
assert.match(
  client,
  /var futureSystemRows = futureSystems\.filter[\s\S]*?sanctuary[\s\S]*?prestige/,
  'futureSystemRows filter must exclude sanctuary and prestige from the roadmap panel',
);

// Terminology: "Personality" copy must not mix in the word "traits" in a way
// that implies Personality is earned through unlocking individual traits.
assert.doesNotMatch(
  client,
  /Personality traits unlock through play/,
  'fallback copy must not say "Personality traits unlock through play" — use "Personality develops through play"',
);
assert.match(
  client,
  /Personality develops through play/,
  'fallback copy must say "Personality develops through play"',
);

console.log('moonpet-roadmap-regression.test.mjs passed');
