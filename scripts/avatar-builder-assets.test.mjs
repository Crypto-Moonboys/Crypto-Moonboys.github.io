import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { clearOptionalStack, defaultStack, isCompleteValidStack, randomStack } from '../js/avatar-builder-core.mjs';
import { AVATAR_PRESETS } from '../js/avatar-builder-homepage-presets.mjs';
import { positiveModulo } from '../js/avatar-backgrounds/renderer-utils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'data', 'avatar-builder-manifest.json'), 'utf8'));
const webManifestPath = path.join(ROOT, 'data', 'avatar-builder-web-manifest.json');
const webManifest = JSON.parse(await readFile(webManifestPath, 'utf8'));
const expectedCategories = ['background', 'body', 'tattoos', 'clothes', 'chains', 'face', 'hat', 'left-arm', 'right-arm'];

assert.equal(positiveModulo(-.25, 1), .75, 'Animated positions must wrap negative unit values back into view');
assert.equal(positiveModulo(-490, 422), 354, 'Animated positions must wrap repeated negative cycles into a positive range');

assert.deepEqual(manifest.categoryOrder, expectedCategories, 'Manifest category order must include all nine layers');
assert.equal(manifest.categories.length, 9, 'Manifest must contain nine categories');
const animatedTraits = manifest.traits.filter((trait) => trait.kind === 'animated');
const imageTraits = manifest.traits.filter((trait) => trait.kind !== 'animated');
const expectedAnimatedIds = [
  'background-matrix-rain',
  'background-neon-pulse',
  'background-pixel-starfield',
  'background-bitcoin-code-rain',
  'background-neon-outrun-grid',
  'background-pixel-arcade-city',
  'background-retro-sunset',
  'background-graffiti-spray',
  'background-glitch-terminal',
  'background-floating-crypto-coins',
  'background-pixel-fire',
  'background-blockchain-node-network',
];
const expectedRenderers = expectedAnimatedIds.map((id) => id.replace(/^background-/, ''));
assert.equal(imageTraits.length, 912, 'All 912 existing image traits must remain available');
assert.equal(manifest.counts.source, imageTraits.length, 'Source count must match image traits');
assert.equal(manifest.counts.layers, imageTraits.length, 'Layer count must match image traits');
assert.equal(manifest.counts.thumbnails, manifest.traits.length, 'Thumbnail count must match manifest traits');
assert.deepEqual(manifest.categories.filter((category) => category.required).map((category) => category.id), ['background', 'body']);
assert((await stat(webManifestPath)).size < 50 * 1024,
  'Web bootstrap manifest must stay below 50 KiB');
assert((await stat(webManifestPath)).size < (await stat(path.join(ROOT, 'data', 'avatar-builder-manifest.json'))).size * .2,
  'Web bootstrap must remove at least 80 percent of the full catalogue transfer');
assert.deepEqual(webManifest.categoryOrder, expectedCategories);
assert.deepEqual(webManifest.loadedCategories, ['background']);
assert(webManifest.counts.layers < manifest.counts.layers,
  'Web builder must reuse decoded-pixel-identical layer URLs');
assert(webManifest.counts.thumbnails < manifest.counts.thumbnails,
  'Web builder must reuse decoded-pixel-identical thumbnail URLs');
assert.equal(webManifest.traits.filter((trait) => trait.category === 'background').length,
  manifest.categories.find((category) => category.id === 'background').count,
  'The initially visible background tray must be complete in the bootstrap');

const chunkTraits = [];
for (const category of manifest.categories) {
  const chunk = JSON.parse(await readFile(path.join(ROOT, 'data', 'avatar-builder-categories',
    `${category.id}.json`), 'utf8'));
  assert.equal(chunk.version, manifest.version);
  assert.equal(chunk.category, category.id);
  assert.equal(chunk.traits.length, category.count);
  assert(chunk.traits.every((trait) => trait.category === category.id));
  assert(chunk.traits.every((trait) => !('layerBytes' in trait) && !('thumbnailBytes' in trait)),
    `${category.id} web traits must omit build-only byte metadata`);
  chunkTraits.push(...chunk.traits);
}
assert.deepEqual(chunkTraits.map((trait) => trait.id).sort(), manifest.traits.map((trait) => trait.id).sort(),
  'Lazy category manifests must cover the exact authoritative trait catalogue');
for (const trait of chunkTraits) {
  if (trait.layer) await stat(path.join(ROOT, trait.layer.replace(/^\//, '')));
  await stat(path.join(ROOT, trait.thumbnail.replace(/^\//, '')));
}
assert(webManifest.traits.every((trait) => !('layerBytes' in trait) && !('thumbnailBytes' in trait)),
  'Web bootstrap traits must omit build-only byte metadata');
const webTraitIds = new Set(webManifest.traits.map((trait) => trait.id));
for (const { stack } of AVATAR_PRESETS) {
  for (const traitId of Object.values(stack).filter(Boolean)) {
    assert(webTraitIds.has(traitId), `Curated preset trait must be available before lazy category loading: ${traitId}`);
  }
}

const ids = new Set();
for (const trait of manifest.traits) {
  assert.match(trait.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `Trait ID is not web-safe: ${trait.id}`);
  assert(!ids.has(trait.id), `Duplicate trait ID: ${trait.id}`);
  ids.add(trait.id);
  if (trait.layer) assert(!trait.layer.includes('CRYPTO-MOONBOYS-OG-TRAITS'));
  assert(!trait.thumbnail.includes('CRYPTO-MOONBOYS-OG-TRAITS'));
}

assert.deepEqual(animatedTraits.map((trait) => trait.id), expectedAnimatedIds, 'Manifest must include exactly 12 Phase 1 and Phase 2 animated backgrounds');
assert.deepEqual(animatedTraits.map((trait) => trait.renderer), expectedRenderers);
assert.equal(new Set(animatedTraits.map((trait) => trait.id)).size, 12, 'Animated background IDs must be unique');
assert.equal(new Set(animatedTraits.map((trait) => trait.renderer)).size, 12, 'Animated renderer keys must be unique');
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

for (const relativePath of ['moonboy-builder.html', 'avatar-builder-test.html', 'css/avatar-builder-test.css', 'js/avatar-builder-test.js', 'js/avatar-builder-core.mjs']) {
  const content = await readFile(path.join(ROOT, relativePath), 'utf8');
  assert(!content.includes('CRYPTO-MOONBOYS-OG-TRAITS'), `Live file references source assets: ${relativePath}`);
}

const builderCss = await readFile(path.join(ROOT, 'css', 'avatar-builder-test.css'), 'utf8');
const builderRuntime = await readFile(path.join(ROOT, 'js', 'avatar-builder-test.js'), 'utf8');
assert.match(builderRuntime, /fetch\('\/data\/avatar-builder-web-manifest\.json'/,
  'Web builder must use the reduced bootstrap catalogue');
assert.doesNotMatch(builderRuntime, /fetch\('\/data\/avatar-builder-manifest\.json'/,
  'Web builder must not fetch the full Worker catalogue');
assert.match(builderRuntime, /avatar-builder-categories/,
  'Web builder must lazy-load complete categories');
assert.match(builderRuntime, /const layerImages = new Map\(\)/,
  'Web builder must retain unchanged decoded layer elements');
assert.doesNotMatch(builderRuntime, /querySelectorAll\('\.avatar-layer'\).*remove/,
  'A trait change must not destroy every visible layer');
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
assert.equal(randomStack(manifest, () => .999).background, 'background-blockchain-node-network', 'Randomize must be able to choose a Phase 2 animated background');

for (const relativePath of [
  'js/avatar-backgrounds/registry.js',
  'js/avatar-backgrounds/renderer-utils.js',
  'js/avatar-backgrounds/matrix-rain.js',
  'js/avatar-backgrounds/neon-pulse.js',
  'js/avatar-backgrounds/pixel-starfield.js',
  ...expectedRenderers.slice(3).map((renderer) => `js/avatar-backgrounds/${renderer}.js`),
]) {
  await stat(path.join(ROOT, relativePath));
}

console.log(`Avatar asset checks passed: ${manifest.traits.length} traits, ${layerFiles.length} layers, ${thumbnailFiles.length} thumbnails.`);
