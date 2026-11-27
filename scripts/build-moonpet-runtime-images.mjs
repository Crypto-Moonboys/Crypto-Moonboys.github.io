import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(ROOT, 'data', 'moonpet-bot-art-registry.json');
const CHECK_ONLY = process.argv.includes('--check');
const STATIC_PNGS = [
  'img/BOTTY WINGS-waveone-v1.png',
  'img/ball-disco.png',
  'img/bass-yeo.png',
  'img/tank-fishyfish.png',
  'img/lamp-larvalampy.png',
  'img/pot-pot.png',
  'img/pepe-pepeb0y.png',
  'img/neonmatt.png',
  'img/goldmatt.png',
  'img/camomatt.png',
  'img/blacknsilvermatt.png',
];

async function runtimeSources() {
  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8'));
  const manifestPaths = new Set([
    registry.egg_art?.manifest_path,
    registry.shared_stages?.stage_1?.manifest_path,
  ].filter(Boolean));
  for (const bot of Object.values(registry.bots || {})) {
    for (const art of Object.values(bot.evolution_art || {})) {
      if (art.manifest_path) manifestPaths.add(art.manifest_path);
    }
  }

  const sources = new Set(STATIC_PNGS);
  const manifests = [];
  for (const manifestUrl of manifestPaths) {
    const manifestPath = path.join(ROOT, manifestUrl.replace(/^\//, ''));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    let changed = false;
    for (const asset of manifest.assets || []) {
      if (!asset.png_path || !/\.(?:png|webp)$/i.test(asset.png_path)) {
        throw new Error(`${manifestUrl} must point runtime art at WebP: ${asset.png_path || 'missing path'}`);
      }
      const source = asset.png_path.replace(/^\//, '').replace(/\.webp$/i, '.png');
      sources.add(source);
      if (!CHECK_ONLY && asset.png_path.endsWith('.png')) {
        asset.png_path = asset.png_path.replace(/\.png$/i, '.webp');
        changed = true;
      } else if (CHECK_ONLY && !asset.png_path.endsWith('.webp')) {
        throw new Error(`${manifestUrl} must point runtime art at WebP: ${asset.png_path}`);
      }
    }
    manifests.push({ manifest, manifestPath, changed });
  }
  return { sources: [...sources].sort(), manifests };
}

export async function verifyPair(sourcePath, outputPath) {
  const [sourceMeta, outputMeta, sourceStat, outputStat] = await Promise.all([
    sharp(sourcePath).metadata(),
    sharp(outputPath).metadata(),
    stat(sourcePath),
    stat(outputPath),
  ]);
  if (outputMeta.format !== 'webp') throw new Error(`${outputPath} is not WebP`);
  if (sourceMeta.width !== outputMeta.width || sourceMeta.height !== outputMeta.height) {
    throw new Error(`${outputPath} changed dimensions`);
  }
  if (Boolean(sourceMeta.hasAlpha) !== Boolean(outputMeta.hasAlpha)) {
    throw new Error(`${outputPath} changed alpha support`);
  }
  if (outputStat.size >= sourceStat.size) throw new Error(`${outputPath} is not smaller than its PNG master`);
  // Transparent pixels can contain invisible RGB values that WebP is free to
  // discard. Compare the rendered result over black and white instead; exact
  // equality on both proves visible colour and alpha are unchanged.
  for (const background of ['#000000', '#ffffff']) {
    const [sourcePixels, outputPixels] = await Promise.all([
      sharp(sourcePath).flatten({ background }).raw().toBuffer(),
      sharp(outputPath).flatten({ background }).raw().toBuffer(),
    ]);
    if (!sourcePixels.equals(outputPixels)) {
      throw new Error(`${outputPath} is not visually pixel-identical to its PNG master`);
    }
  }
  return { sourceBytes: sourceStat.size, outputBytes: outputStat.size };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const { sources, manifests } = await runtimeSources();
  let sourceBytes = 0;
  let outputBytes = 0;
  for (const relativeSource of sources) {
    const sourcePath = path.join(ROOT, relativeSource);
    const outputPath = sourcePath.replace(/\.png$/i, '.webp');
    if (!CHECK_ONLY) {
      await sharp(sourcePath).webp({ lossless: true, quality: 100, alphaQuality: 100 }).toFile(outputPath);
    }
    const result = await verifyPair(sourcePath, outputPath);
    sourceBytes += result.sourceBytes;
    outputBytes += result.outputBytes;
  }
  if (!CHECK_ONLY) {
    for (const { manifest, manifestPath, changed } of manifests) {
      if (changed) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
  }

  console.log(`Moonpet runtime images ${CHECK_ONLY ? 'verified' : 'built'}: ${sources.length} transparent WebPs, ` +
    `${sourceBytes} -> ${outputBytes} bytes (${((sourceBytes - outputBytes) * 100 / sourceBytes).toFixed(1)}% smaller).`);
}
