import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(ROOT, 'img', 'CRYPTO-MOONBOYS-OG-TRAITS');
const LAYER_ROOT = path.join(ROOT, 'img', 'avatar-builder', 'layers');
const THUMB_ROOT = path.join(ROOT, 'img', 'avatar-builder', 'thumbnails');
const MANIFEST_PATH = path.join(ROOT, 'data', 'avatar-builder-manifest.json');
const ANIMATED_CONFIG_PATH = path.join(ROOT, 'data', 'avatar-builder-animated-backgrounds.json');
const ANIMATED_THUMB_ROOT = path.join(ROOT, 'img', 'avatar-builder', 'animated-thumbnails');

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

function animatedThumbnailSvg(renderer) {
  const artwork = {
    'matrix-rain': `<rect width="240" height="240" fill="#010704"/><g fill="#2fee68" font-family="monospace" font-weight="700" font-size="17" opacity=".8"><text x="18" y="28">0</text><text x="65" y="52">NBG</text><text x="126" y="28">1</text><text x="168" y="68">BTC</text><text x="24" y="98">WAX</text><text x="96" y="124">MOONBOY</text><text x="50" y="162">10110</text><text x="142" y="194">NBG</text><text x="22" y="224">BTC</text></g>`,
    'neon-pulse': `<defs><radialGradient id="a"><stop stop-color="#00efff" stop-opacity=".9"/><stop offset="1" stop-color="#00efff" stop-opacity="0"/></radialGradient><radialGradient id="b"><stop stop-color="#e42cff" stop-opacity=".8"/><stop offset="1" stop-color="#e42cff" stop-opacity="0"/></radialGradient></defs><rect width="240" height="240" fill="#030515"/><circle cx="72" cy="82" r="118" fill="url(#a)"/><circle cx="180" cy="164" r="126" fill="url(#b)"/>`,
    'pixel-starfield': `<rect width="240" height="240" fill="#01040f"/><g fill="#fff"><rect x="118" y="115" width="5" height="5"/><rect x="35" y="42" width="3" height="3"/><rect x="186" y="50" width="4" height="4"/><rect x="70" y="182" width="5" height="5"/></g><g fill="#6cf7ff"><rect x="22" y="126" width="6" height="6"/><rect x="202" y="176" width="7" height="7"/><rect x="155" y="23" width="3" height="3"/></g><g fill="#ffd166"><rect x="213" y="87" width="4" height="4"/><rect x="92" y="66" width="3" height="3"/></g>`,
  }[renderer];
  if (!artwork) throw new Error(`No thumbnail artwork for ${renderer}`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">${artwork}</svg>`);
}

async function prepareAnimatedBackgrounds() {
  const configured = JSON.parse(await readFile(ANIMATED_CONFIG_PATH, 'utf8'));
  if (!Array.isArray(configured) || configured.length !== 3) {
    throw new Error('Animated background config must contain exactly three records.');
  }
  const ids = new Set();
  await mkdir(ANIMATED_THUMB_ROOT, { recursive: true });
  await Promise.all(configured.map(async (trait) => {
    if (trait.kind !== 'animated' || trait.category !== 'background' || !trait.renderer) {
      throw new Error(`Invalid animated background record: ${trait.id || 'unknown'}`);
    }
    if (ids.has(trait.id)) throw new Error(`Duplicate animated background ID: ${trait.id}`);
    ids.add(trait.id);
    const thumbnailPath = path.join(ROOT, trait.thumbnail.replace(/^\//, ''));
    await sharp(animatedThumbnailSvg(trait.renderer)).webp({ quality: 88, effort: 4 }).toFile(thumbnailPath);
    trait.thumbnailBytes = await byteSize(thumbnailPath);
  }));
  return configured;
}

async function build() {
  const jobs = [];
  const categories = [];
  const traits = [];
  const animatedBackgrounds = await prepareAnimatedBackgrounds();

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

  traits.push(...animatedBackgrounds);
  const backgroundCategory = categories.find((category) => category.id === 'background');
  backgroundCategory.count += animatedBackgrounds.length;

  const totals = traits.reduce((summary, trait) => ({
    layerBytes: summary.layerBytes + (trait.layerBytes || 0),
    thumbnailBytes: summary.thumbnailBytes + (trait.thumbnailBytes || 0),
  }), { layerBytes: 0, thumbnailBytes: 0 });

  const defaults = new Map(categories.map((category) => [category.id, category.defaultTraitId]));
  const approximateInitialTransferBytes = traits
    .filter((trait) => defaults.get(trait.category) === trait.id)
    .reduce((sum, trait) => sum + (trait.layerBytes || 0), 0);

  const manifest = {
    version: 1,
    layerSize: 1000,
    thumbnailSize: 240,
    categoryOrder: categories.map((category) => category.id),
    categories,
    counts: {
      source: jobs.length,
      layers: jobs.length,
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
