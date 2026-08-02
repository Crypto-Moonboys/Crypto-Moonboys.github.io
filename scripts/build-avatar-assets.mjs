import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(ROOT, 'img', 'CRYPTO-MOONBOYS-OG-TRAITS');
const LAYER_ROOT = path.join(ROOT, 'img', 'avatar-builder', 'layers');
const THUMB_ROOT = path.join(ROOT, 'img', 'avatar-builder', 'thumbnails');
const MANIFEST_PATH = path.join(ROOT, 'data', 'avatar-builder-manifest.json');

export const CATEGORY_DEFINITIONS = [
  { id: 'background', name: 'Background', folder: 'LAYER 1 BACKGROUNDS', required: true },
  { id: 'body', name: 'Body', folder: 'LAYER 2 BODY', required: true },
  { id: 'tattoos', name: 'Tattoos', folder: 'LAYER 3 TATTOOS', required: false },
  { id: 'clothes', name: 'Clothes', folder: 'LAYER 4 CLOTHES', required: false },
  { id: 'chains', name: 'Chains', folder: 'LAYER 5 CHAINS', required: false },
  { id: 'face', name: 'Face', folder: 'LAYER 6 FACE', required: false },
  { id: 'hat', name: 'Hat', folder: 'LAYER 7 HAT', required: false },
  { id: 'left-arm', name: 'Left Arm', folder: 'LAYER 8 LEFT ARM BB', required: false },
  { id: 'right-arm', name: 'Right Arm', folder: 'LAYER 9 RIGHT ARM', required: false },
];

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readableName(filename, category, index) {
  const base = path.parse(filename).name
    .replace(/^(?:mb|mc)[-_ ]*/i, '')
    .replace(new RegExp(`^${category.id.replace('-', '[-_ ]?')}[-_ ]*`, 'i'), '')
    .replace(/[()[\]]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || /^\d+$/.test(base)) return `${category.name} ${Number(base || index + 1)}`;
  return base.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function listSourceTraits(category) {
  const directory = path.join(SOURCE_ROOT, category.folder);
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort(collator.compare);
}

async function renderTrait(sourcePath, layerPath, thumbnailPath, hasAlpha) {
  const common = { quality: 90, alphaQuality: 100, effort: 4, smartSubsample: true };
  const layerEncoder = hasAlpha ? { ...common, nearLossless: true } : { ...common, quality: 86 };
  const thumbnailEncoder = hasAlpha ? { ...common, quality: 84, nearLossless: true } : { ...common, quality: 78 };

  await Promise.all([
    sharp(sourcePath, { limitInputPixels: false })
      .resize(1000, 1000, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .webp(layerEncoder)
      .toFile(layerPath),
    sharp(sourcePath, { limitInputPixels: false })
      .resize(240, 240, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .webp(thumbnailEncoder)
      .toFile(thumbnailPath),
  ]);
}

async function runPool(items, worker, concurrency = 4) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
      if ((index + 1) % 25 === 0 || index + 1 === items.length) {
        process.stdout.write(`Generated ${index + 1}/${items.length}\r`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  process.stdout.write('\n');
}

async function byteSize(filePath) {
  return (await stat(filePath)).size;
}

async function pruneGeneratedDirectory(directory, expectedNames) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.webp') && !expectedNames.has(entry.name))
    .map((entry) => unlink(path.join(directory, entry.name))));
}

async function build() {
  const jobs = [];
  const categories = [];
  const traits = [];

  for (const category of CATEGORY_DEFINITIONS) {
    const files = await listSourceTraits(category);
    if (!files.length) throw new Error(`No source traits found for ${category.name}`);

    await Promise.all([
      mkdir(path.join(LAYER_ROOT, category.id), { recursive: true }),
      mkdir(path.join(THUMB_ROOT, category.id), { recursive: true }),
    ]);

    const categoryTraits = files.map((filename, index) => {
      const sourceStem = slugify(path.parse(filename).name) || String(index + 1);
      const id = `${category.id}-${sourceStem}`;
      const relativeLayer = `/img/avatar-builder/layers/${category.id}/${id}.webp`;
      const relativeThumbnail = `/img/avatar-builder/thumbnails/${category.id}/${id}.webp`;
      const trait = {
        id,
        name: readableName(filename, category, index),
        category: category.id,
        layer: relativeLayer,
        thumbnail: relativeThumbnail,
      };
      jobs.push({
        sourcePath: path.join(SOURCE_ROOT, category.folder, filename),
        layerPath: path.join(ROOT, relativeLayer.slice(1)),
        thumbnailPath: path.join(ROOT, relativeThumbnail.slice(1)),
        trait,
      });
      return trait;
    });

    const generatedNames = new Set(categoryTraits.map((trait) => `${trait.id}.webp`));
    await Promise.all([
      pruneGeneratedDirectory(path.join(LAYER_ROOT, category.id), generatedNames),
      pruneGeneratedDirectory(path.join(THUMB_ROOT, category.id), generatedNames),
    ]);

    traits.push(...categoryTraits);
    categories.push({
      id: category.id,
      name: category.name,
      order: categories.length,
      count: categoryTraits.length,
      required: category.required,
      defaultTraitId: categoryTraits[0].id,
    });
  }

  await runPool(jobs, async (job) => {
    const metadata = await sharp(job.sourcePath, { limitInputPixels: false }).metadata();
    if (metadata.width !== metadata.height) throw new Error(`Source is not square: ${job.sourcePath}`);
    await renderTrait(job.sourcePath, job.layerPath, job.thumbnailPath, metadata.hasAlpha);
    job.trait.layerBytes = await byteSize(job.layerPath);
    job.trait.thumbnailBytes = await byteSize(job.thumbnailPath);
  });

  const totals = traits.reduce((summary, trait) => ({
    layerBytes: summary.layerBytes + trait.layerBytes,
    thumbnailBytes: summary.thumbnailBytes + trait.thumbnailBytes,
  }), { layerBytes: 0, thumbnailBytes: 0 });

  const defaults = new Map(categories.map((category) => [category.id, category.defaultTraitId]));
  const approximateInitialTransferBytes = traits
    .filter((trait) => defaults.get(trait.category) === trait.id)
    .reduce((sum, trait) => sum + trait.layerBytes, 0);

  const manifest = {
    version: 1,
    layerSize: 1000,
    thumbnailSize: 240,
    categoryOrder: categories.map((category) => category.id),
    categories,
    counts: {
      source: traits.length,
      layers: traits.length,
      thumbnails: traits.length,
    },
    totals: { ...totals, approximateInitialTransferBytes },
    traits,
  };

  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)} with ${traits.length} traits.`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
