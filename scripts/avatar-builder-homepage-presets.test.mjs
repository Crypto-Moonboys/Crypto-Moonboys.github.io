import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHomepagePresetCycle } from '../js/avatar-builder-homepage-presets.mjs';
const manifest = JSON.parse(readFileSync(new URL('../data/avatar-builder-manifest.json', import.meta.url), 'utf8'));
const expectedNames = [
  [
    "Bg 2",
    "Body 1",
    "Tattoo 2",
    null,
    "Chain 96",
    "Face 27",
    "Hat 22",
    "Left 5",
    "Right 2"
  ],
  [
    "Bitcoin Code Rain",
    "Body 1",
    "Tattoo 1",
    "Clothes 23",
    "Chain 111",
    "Face 14",
    "Hat 24",
    "Left 1",
    "Right 12"
  ],
  [
    "Background 1",
    "Body 1",
    "Tattoo 6",
    "Clothes 21",
    "Chain 132",
    "Face 50",
    "Hat 33",
    "Left 8",
    "Right 25"
  ],
  [
    "Bg 6",
    "Body 1",
    "Tattoo 12",
    "Clothes 9",
    "Chain 93",
    "Face 23",
    "Hat 31",
    "Left 10",
    "Right 57"
  ],
  [
    "Bg 33",
    "Body 1",
    "Tattoo 12",
    "Clothes 1",
    "Chain 89",
    "Face 44",
    "Hat 7",
    "Left 60",
    "Right 40"
  ],
  [
    "Bg 36",
    "Body 1",
    "Tattoo 12",
    "Clothes 111",
    "Chain 105",
    "Face 25",
    "Hat 3",
    "Left 58",
    "Right 11"
  ],
  [
    "Bg 3",
    "Body 1",
    "Tattoo 12",
    "Clothes 110",
    "Chain 100",
    "Face 110",
    "Hat 2",
    "Left 56",
    "Right 67"
  ],
  [
    "Bg 23",
    "Body 1",
    "Tattoo 11",
    "Clothes 118",
    "Chain 103",
    "Face 19",
    "Hat 5",
    "Left 59",
    "Right 43"
  ],
  [
    "Bg 23",
    "Body 1",
    "Tattoo 3",
    null,
    "Chain 111",
    "Face 3",
    "Hat 13",
    "Left 29",
    "Right 42"
  ],
  [
    "Bg 34",
    "Body 1",
    "Tattoo 4",
    null,
    "Chain 115",
    "Face 12",
    "Hat 17",
    "Left 35",
    "Right 44"
  ],
  [
    "Bg 1A",
    "Body 1",
    "Tattoo 6",
    "Clothes 118",
    null,
    "Face 82",
    "Hat 35",
    "Left 11",
    "Right 20"
  ],
  [
    "Pixel Fire",
    "Body 1",
    "Tattoo 10",
    "Clothes 70",
    "Chain 112",
    "Face 33",
    "Hat 28",
    "Left 56",
    "Right 22"
  ],
  [
    "Bg 46",
    "Body 1",
    "Tattoo 8",
    "Clothes 96",
    "Chain 174",
    "Face 64",
    "Hat 195",
    "Left 39",
    "Right 104"
  ],
  [
    "Bg 40",
    "Body 1",
    null,
    "Clothes 129",
    "Chain 98",
    "Face 13",
    "Hat 43",
    "Left 21",
    "Right 18"
  ],
  [
    "Bg 8",
    "Body 1",
    null,
    "Clothes 85",
    "Chain 112",
    "Face 44",
    "Hat 62",
    "Left 9",
    "Right 54"
  ],
  [
    "Matrix Rain",
    "Body 1",
    null,
    "Clothes 11",
    "Chain 97",
    null,
    "Hat 49",
    "Left 34",
    "Right 19"
  ],
  [
    "Bg 26",
    "Body 1",
    null,
    "Clothes 25",
    "Chain 90",
    "Face 27",
    "Hat 87",
    "Left 6",
    "Right 52"
  ],
  [
    "Bg 31",
    "Body 1",
    null,
    "Clothes 28",
    "Chain 99",
    "Face 34",
    "Hat 91",
    "Left 13",
    "Right 67"
  ],
  [
    "Bg 38",
    "Body 1",
    null,
    "Clothes 130",
    "Chain 175",
    "Face 63",
    "Hat 108",
    "Left 42",
    "Right 31"
  ],
  [
    "Bg 1",
    "Body 1",
    null,
    "Clothes 27",
    "Chain 113",
    "Face 91",
    "Hat 138",
    "Left 8",
    "Right 53"
  ]
];
const byId = new Map(manifest.traits.map(trait => [trait.id, trait]));
const next = createHomepagePresetCycle(manifest);
for (let click = 0; click < expectedNames.length * 3; click++) {
  const stack = next();
  assert.deepEqual(manifest.categoryOrder.map(category =>
    stack[category] === null ? null : byId.get(stack[category])?.name),
    expectedNames[click % expectedNames.length], 'Exact trait names for click ' + (click + 1));
}
// Caller edits must not mutate future presets; new sessions start at #1.
const fresh = createHomepagePresetCycle(manifest);
const edited = fresh();
edited.background = 'changed';
for (let n = 0; n < expectedNames.length - 1; n++) fresh();
assert.equal(fresh().background, 'background-mb-bg-2');
assert.equal(createHomepagePresetCycle(manifest)().clothes, null);
assert.throws(() => createHomepagePresetCycle({
  ...manifest, traits: manifest.traits.filter(trait => trait.id !== 'chains-mb-chain-96')
}), /unavailable/);
assert.throws(() => createHomepagePresetCycle({
  ...manifest, traits: manifest.traits.map(trait => trait.id === 'hat-mb-hat-22' ? {...trait, category:'face'} : trait)
}), /unavailable/);
console.log('Homepage presets passed: 60 ordered clicks across 20 presets, optional traits, isolated cycles, mutation safety and missing/wrong-category traits.');
