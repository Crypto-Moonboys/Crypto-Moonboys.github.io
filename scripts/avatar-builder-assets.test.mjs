import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { clearOptionalStack, defaultStack, isCompleteValidStack, randomStack } from '../js/avatar-builder-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'data', 'avatar-builder-manifest.json'), 'utf8'));
const expectedCategories = ['background', 'body', 'tattoos', 'clothes', 'chains', 'face', 'hat', 'left-arm', 'right-arm'];

assert.deepEqual(manifest.categoryOrder, expectedCategories, 'Manifest category order must include all nine layers');
assert.equal(manifest.categories.length, 9, 'Manifest must contain nine categories');
assert.equal(manifest.traits.length, manifest.counts.source, 'Source count must match manifest traits');
assert.equal(manifest.counts.layers, manifest.traits.length, 'Layer count must match manifest traits');
assert.equal(manifest.counts.thumbnails, manifest.traits.length, 'Thumbnail count must match manifest traits');
assert.deepEqual(manifest.categories.filter((category) => category.required).map((category) => category.id), ['background', 'body']);

const ids = new Set();
for (const trait of manifest.traits) {
  assert.match(trait.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `Trait ID is not web-safe: ${trait.id}`);
  assert(!ids.has(trait.id), `Duplicate trait ID: ${trait.id}`);
  ids.add(trait.id);
  assert(!trait.layer.includes('CRYPTO-MOONBOYS-OG-TRAITS'));
  assert(!trait.thumbnail.includes('CRYPTO-MOONBOYS-OG-TRAITS'));
}

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
const thumbnailFiles = await collectFiles(path.join(ROOT, 'img', 'avatar-builder', 'thumbnails'));
assert.equal(layerFiles.length, manifest.traits.length, 'Generated layer file count must match manifest');
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

const defaults = defaultStack(manifest);
assert(isCompleteValidStack(manifest, defaults), 'Reset/default stack must be complete and valid');
for (let index = 0; index < 100; index += 1) {
  assert(isCompleteValidStack(manifest, randomStack(manifest)), 'Randomize must produce a complete valid stack');
}
const cleared = clearOptionalStack(manifest, defaults);
assert.equal(cleared.background, defaults.background);
assert.equal(cleared.body, defaults.body);
assert(manifest.categories.filter((category) => !category.required).every((category) => cleared[category.id] === null));

console.log(`Avatar asset checks passed: ${manifest.traits.length} traits, ${layerFiles.length} layers, ${thumbnailFiles.length} thumbnails.`);
