import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');

function extractTestExport(source, name) {
  const startMarker = `// TEST-EXPORT: ${name}:start`;
  const endMarker = `// TEST-EXPORT: ${name}:end`;
  const start = source.indexOf(startMarker);
  if (start === -1) return null;
  const bodyStart = source.indexOf('\n', start + startMarker.length);
  if (bodyStart === -1) return null;
  const end = source.indexOf(endMarker, bodyStart + 1);
  if (end === -1) return null;
  return source.slice(bodyStart + 1, end);
}

const futureSystemTitlesBlock = extractTestExport(client, 'futureSystemTitles');
assert.ok(futureSystemTitlesBlock, 'futureSystemTitles TEST-EXPORT block must be present and closed');
const futureSystemTitlesMatch = futureSystemTitlesBlock.match(/var futureSystemTitles = ({[\s\S]*?});/);
assert.ok(futureSystemTitlesMatch, 'futureSystemTitles TEST-EXPORT block must contain the futureSystemTitles object');
const futureSystemTitles = vm.runInNewContext(`(${futureSystemTitlesMatch[1]})`);

// Allowed future roadmap systems — not yet playable, expected in roadmap panel.
const ROADMAP_ALLOWED = ['breeding', 'lineage', 'fusion', 'traits'];
const ROADMAP_BLOCKED = ['arena', 'kaiju', 'weekly_journey', 'daily_journey', 'equipment'];
assert.deepEqual(
  Object.keys(futureSystemTitles).sort(),
  ['breeding', 'fusion', 'lineage', 'prestige', 'sanctuary', 'traits'],
  'futureSystemTitles must stay limited to roadmap systems plus the dedicated future-season panels',
);
for (const key of ROADMAP_BLOCKED) {
  assert.ok(
    !(key in futureSystemTitles),
    `"${key}" must NOT be in futureSystemTitles — it is an active playable system and must not appear in the roadmap panel`,
  );
}

const futureSystemRowsFilterMatch = client.match(
  /var futureSystemRows = futureSystems\.filter\(function \(system\) {\s*return ([^;]+);\s*}\)\.map/,
);
assert.ok(futureSystemRowsFilterMatch, 'futureSystemRows must keep an explicit roadmap filter predicate');
const roadmapFilter = new Function('system', `return ${futureSystemRowsFilterMatch[1]};`);
assert.equal(roadmapFilter({ key: 'sanctuary' }), false, 'roadmap filter must exclude sanctuary from roadmap rows');
assert.equal(roadmapFilter({ key: 'prestige' }), false, 'roadmap filter must exclude prestige from roadmap rows');

const roadmapKeys = Object.keys(futureSystemTitles).filter((key) => roadmapFilter({ key })).sort();
assert.deepEqual(
  roadmapKeys,
  [...ROADMAP_ALLOWED].sort(),
  'roadmap rows must resolve to exactly the allowed future systems and no playable systems',
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

for (const heading of [
  "panel('ROADMAP // FUTURE SEASONS'",
  "panel('PRESTIGE // FUTURE SEASON'",
  "panel('MOONPET SANCTUARY // FUTURE SEASON'",
]) {
  assert.ok(client.includes(heading), `${heading} must remain the exact future roadmap heading`);
}

console.log('moonpet-roadmap-regression.test.mjs passed');
