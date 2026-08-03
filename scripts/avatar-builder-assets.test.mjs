import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { clearOptionalStack, defaultStack, isCompleteValidStack, randomStack } from '../js/avatar-builder-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'data', 'avatar-builder-manifest.json'), 'utf8'));
const expectedCategories = ['background', 'body', 'tattoos', 'clothes', 'chains', 'face', 'hat', 'left-arm', 'right-arm'];

assert.deepEqual(manifest.categoryOrder, expectedCategories, 'Manifest category order must include all nine layers');
assert.equal(manifest.categories.length, 9, 'Manifest must contain nine categories');
const animatedTraits = manifest.traits.filter((trait) => trait.kind === 'animated');
const imageTraits = manifest.traits.filter((trait) => trait.kind !== 'animated');
assert.equal(imageTraits.length, 912, 'All 912 existing image traits must remain available');
assert.equal(manifest.counts.source, imageTraits.length, 'Source count must match image traits');
assert.equal(manifest.counts.layers, imageTraits.length, 'Layer count must match image traits');
assert.equal(manifest.counts.thumbnails, manifest.traits.length, 'Thumbnail count must match manifest traits');
assert.deepEqual(manifest.categories.filter((category) => category.required).map((category) => category.id), ['background', 'body']);

const ids = new Set();
for (const trait of manifest.traits) {
  assert.match(trait.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `Trait ID is not web-safe: ${trait.id}`);
  assert(!ids.has(trait.id), `Duplicate trait ID: ${trait.id}`);
  ids.add(trait.id);
  if (trait.layer) assert(!trait.layer.includes('CRYPTO-MOONBOYS-OG-TRAITS'));
  assert(!trait.thumbnail.includes('CRYPTO-MOONBOYS-OG-TRAITS'));
}

assert.deepEqual(animatedTraits.map((trait) => trait.id), [
  'background-matrix-rain',
  'background-neon-pulse',
  'background-pixel-starfield',
], 'Manifest must include exactly the three Phase 1 animated backgrounds');
assert.deepEqual(animatedTraits.map((trait) => trait.renderer), ['matrix-rain', 'neon-pulse', 'pixel-starfield']);
assert(animatedTraits.every((trait) => trait.category === 'background' && trait.thumbnail.endsWith('.webp')));

async function collectFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collectFiles(resolved));
    else output.push(resolved);
  }
  return output;
}

const layerFiles = await collectFiles(path.join(ROOT, 'img', 'avatar-builder', 'layers'));
const thumbnailFiles = [
  ...await collectFiles(path.join(ROOT, 'img', 'avatar-builder', 'thumbnails')),
  ...await collectFiles(path.join(ROOT, 'img', 'avatar-builder', 'animated-thumbnails')),
];
assert.equal(layerFiles.length, imageTraits.length, 'Generated layer file count must match image traits');
assert.equal(thumbnailFiles.length, manifest.traits.length, 'Generated thumbnail file count must match manifest');

async function verifyDimensions(files, expectedSize, label) {
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      const metadata = await sharp(file).metadata();
      assert.equal(metadata.width, expectedSize, `${label} width mismatch: ${file}`);
      assert.equal(metadata.height, expectedSize, `${label} height mismatch: ${file}`);
      assert.equal(metadata.format, 'webp', `${label} should be WebP: ${file}`);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
}

await verifyDimensions(layerFiles, 1000, 'Layer');
await verifyDimensions(thumbnailFiles, 240, 'Thumbnail');

for (const relativePath of ['avatar-builder-test.html', 'css/avatar-builder-test.css', 'js/avatar-builder-test.js', 'js/avatar-builder-core.mjs']) {
  const content = await readFile(path.join(ROOT, relativePath), 'utf8');
  assert(!content.includes('CRYPTO-MOONBOYS-OG-TRAITS'), `Live file references source assets: ${relativePath}`);
}

const builderCss = await readFile(path.join(ROOT, 'css', 'avatar-builder-test.css'), 'utf8');
assert(!builderCss.includes('@scope'), 'Builder CSS must not depend on unsupported @scope blocks');
for (const selector of [
  '.avatar-builder-host .builder-shell',
  '.avatar-builder-host .control-panel',
  '.avatar-builder-host .trait-grid',
  '.avatar-builder-host .avatar-layer',
  '.avatar-builder-host button',
  '.avatar-builder-host h2',
]) {
  assert(builderCss.includes(selector), `Builder CSS must explicitly scope ${selector}`);
}

const defaults = defaultStack(manifest);
assert(isCompleteValidStack(manifest, defaults), 'Reset/default stack must be complete and valid');
for (let index = 0; index < 100; index += 1) {
  assert(isCompleteValidStack(manifest, randomStack(manifest)), 'Randomize must produce a complete valid stack');
}
const cleared = clearOptionalStack(manifest, defaults);
assert.equal(cleared.background, defaults.background);
assert.equal(cleared.body, defaults.body);
assert(manifest.categories.filter((category) => !category.required).every((category) => cleared[category.id] === null));
const animatedCleared = clearOptionalStack(manifest, { ...defaults, background: 'background-matrix-rain' });
assert.equal(animatedCleared.background, 'background-matrix-rain', 'Clear All must preserve the selected animated required background');
assert.equal(randomStack(manifest, () => .999).background, 'background-pixel-starfield', 'Randomize must be able to choose an animated background');

for (const relativePath of [
  'js/avatar-backgrounds/registry.js',
  'js/avatar-backgrounds/renderer-utils.js',
  'js/avatar-backgrounds/matrix-rain.js',
  'js/avatar-backgrounds/neon-pulse.js',
  'js/avatar-backgrounds/pixel-starfield.js',
]) {
  await stat(path.join(ROOT, relativePath));
}

console.log(`Avatar asset checks passed: ${manifest.traits.length} traits, ${layerFiles.length} layers, ${thumbnailFiles.length} thumbnails.`);
