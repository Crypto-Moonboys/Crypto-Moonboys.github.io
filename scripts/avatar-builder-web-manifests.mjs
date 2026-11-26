import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AVATAR_PRESETS } from '../js/avatar-builder-homepage-presets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FULL_MANIFEST_PATH = path.join(ROOT, 'data', 'avatar-builder-manifest.json');
const WEB_MANIFEST_PATH = path.join(ROOT, 'data', 'avatar-builder-web-manifest.json');
const CATEGORY_ROOT = path.join(ROOT, 'data', 'avatar-builder-categories');

function runtimeTrait(trait) {
  const { layerBytes, thumbnailBytes, ...runtime } = trait;
  return runtime;
}

async function canonicalRuntimeTraits(manifest, root) {
  const canonical = { layer: new Map(), thumbnail: new Map() };
  const output = [];
  for (const sourceTrait of manifest.traits) {
    const trait = runtimeTrait(sourceTrait);
    for (const key of ['layer', 'thumbnail']) {
      if (!trait[key]) continue;
      const filePath = path.join(root, trait[key].replace(/^\//, ''));
      const hash = createHash('sha256').update(await readFile(filePath)).digest('hex');
      if (canonical[key].has(hash)) trait[key] = canonical[key].get(hash);
      else canonical[key].set(hash, trait[key]);
    }
    output.push(trait);
  }
  return output;
}

export async function writeAvatarWebManifests(manifest, root = ROOT) {
  const webManifestPath = path.join(root, path.relative(ROOT, WEB_MANIFEST_PATH));
  const categoryRoot = path.join(root, path.relative(ROOT, CATEGORY_ROOT));
  const webTraits = await canonicalRuntimeTraits(manifest, root);
  const traitsById = new Map(webTraits.map((trait) => [trait.id, trait]));
  const bootstrapIds = new Set(manifest.categories.map((category) => category.defaultTraitId));

  for (const { stack } of AVATAR_PRESETS) {
    for (const category of manifest.categories) {
      const traitId = stack[category.id];
      if (traitId) bootstrapIds.add(traitId);
    }
  }

  // Background is the first visible tray on both builder pages. Include it in
  // the bootstrap; all other complete category catalogues load on first use.
  const bootstrapTraits = webTraits.filter((trait) =>
    trait.category === 'background' || bootstrapIds.has(trait.id));
  for (const traitId of bootstrapIds) {
    if (!traitsById.has(traitId)) throw new Error(`Missing bootstrap trait: ${traitId}`);
  }

  const webManifest = {
    version: manifest.version,
    layerSize: manifest.layerSize,
    thumbnailSize: manifest.thumbnailSize,
    categoryOrder: manifest.categoryOrder,
    categories: manifest.categories,
    counts: {
      ...manifest.counts,
      layers: new Set(webTraits.filter((trait) => trait.layer).map((trait) => trait.layer)).size,
      thumbnails: new Set(webTraits.map((trait) => trait.thumbnail)).size,
    },
    loadedCategories: ['background'],
    categoryManifestBase: '/data/avatar-builder-categories/',
    traits: bootstrapTraits,
  };

  await mkdir(categoryRoot, { recursive: true });
  await writeFile(webManifestPath, `${JSON.stringify(webManifest)}\n`, 'utf8');
  await Promise.all(manifest.categories.map(async (category) => {
    const categoryManifest = {
      version: manifest.version,
      category: category.id,
      traits: webTraits.filter((trait) => trait.category === category.id),
    };
    await writeFile(path.join(categoryRoot, `${category.id}.json`),
      `${JSON.stringify(categoryManifest)}\n`, 'utf8');
  }));

  return { webManifestPath, categoryRoot, bootstrapTraits: bootstrapTraits.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const manifest = JSON.parse(await readFile(FULL_MANIFEST_PATH, 'utf8'));
  const result = await writeAvatarWebManifests(manifest);
  console.log(`Wrote ${path.relative(ROOT, result.webManifestPath)} with ` +
    `${result.bootstrapTraits}/${manifest.traits.length} bootstrap traits and nine lazy category manifests.`);
}
