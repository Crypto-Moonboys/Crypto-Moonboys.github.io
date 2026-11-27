import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_MANIFEST = 'data/runtime-image-manifest.json';
const DEFAULT_LOCK = 'data/runtime-image-lock.json';
const SOURCE_EXTENSION = /\.(?:png|jpe?g|webp)$/iu;
const MASTER_EXTENSION = /-master\.(?:png|jpe?g|webp)$/iu;
const RUNTIME_EXTENSION = /-runtime\.webp$/u;
const SPRITE_NAME = /(?:sprite|sheet|atlas|pixel|icon|logo|\bui\b)/iu;
const RESIZE_KERNELS = new Set(['nearest', 'cubic', 'mitchell', 'lanczos2', 'lanczos3']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileHash(file) {
  return sha256(await readFile(file));
}

function assertFiniteNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function repositoryPath(root, candidate, label) {
  if (typeof candidate !== 'string' || !candidate.trim()) throw new Error(`${label} must be a repository-relative path`);
  const portable = candidate.replaceAll('\\', '/');
  if (path.posix.isAbsolute(portable) || portable.split('/').includes('..')) {
    throw new Error(`${label} must stay inside the repository: ${candidate}`);
  }
  const absolute = path.resolve(root, portable);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escaped the repository: ${candidate}`);
  }
  return { relative: portable.replace(/^\.\//u, ''), absolute };
}

async function assertResolvedInside(root, candidate, label) {
  const resolvedRoot = await realpath(root);
  let existing = candidate;
  while (true) {
    try {
      const resolved = await realpath(existing);
      if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error(`${label} resolves outside the repository: ${candidate}`);
      }
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        const entry = await lstat(existing);
        if (entry.isSymbolicLink()) throw new Error(`${label} contains a broken symbolic link: ${existing}`);
      } catch (lstatError) {
        if (lstatError.code !== 'ENOENT') throw lstatError;
      }
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error(`${label} has no existing repository ancestor: ${candidate}`);
      existing = parent;
    }
  }
}

function normalizedConfig(asset, defaults, index) {
  const label = `assets[${index}]`;
  const mode = asset.mode || 'lossy';
  if (!['lossless', 'lossy'].includes(mode)) throw new Error(`${label}.mode must be lossless or lossy`);
  const width = asset.width == null ? null : assertPositiveInteger(asset.width, `${label}.width`);
  const height = asset.height == null ? null : assertPositiveInteger(asset.height, `${label}.height`);
  const quality = mode === 'lossy'
    ? assertFiniteNumber(asset.quality ?? defaults.lossyQuality ?? 86, `${label}.quality`, { min: 1, max: 100 })
    : 100;
  const minPsnr = mode === 'lossy'
    ? assertFiniteNumber(asset.minPsnr ?? defaults.minPsnr ?? 34, `${label}.minPsnr`, { min: 0, max: 100 })
    : null;
  const minSavingsPercent = assertFiniteNumber(
    asset.minSavingsPercent ?? defaults.minSavingsPercent ?? 5,
    `${label}.minSavingsPercent`,
    { min: 0, max: 99.9 },
  );
  const resizeKernel = asset.resizeKernel || defaults.resizeKernel || 'lanczos3';
  if (!RESIZE_KERNELS.has(resizeKernel)) throw new Error(`${label}.resizeKernel is unsupported: ${resizeKernel}`);
  const preserveAlpha = asset.preserveAlpha ?? defaults.preserveAlpha ?? true;
  if (typeof preserveAlpha !== 'boolean') throw new Error(`${label}.preserveAlpha must be true or false`);
  let sprite = null;
  if (asset.sprite != null) {
    sprite = {
      columns: assertPositiveInteger(asset.sprite.columns, `${label}.sprite.columns`),
      rows: assertPositiveInteger(asset.sprite.rows, `${label}.sprite.rows`),
    };
  }
  return {
    source: asset.source,
    output: asset.output,
    mode,
    quality,
    width,
    height,
    preserveAlpha,
    minPsnr,
    minSavingsPercent,
    resizeKernel,
    sprite,
  };
}

async function loadManifest(root, manifestPath) {
  const manifestFile = repositoryPath(root, manifestPath, 'manifest path');
  await assertResolvedInside(root, manifestFile.absolute, 'manifest path');
  const manifest = JSON.parse(await readFile(manifestFile.absolute, 'utf8'));
  if (manifest.version !== 1) throw new Error(`${manifestPath} must use version 1`);
  if (!manifest.defaults || typeof manifest.defaults !== 'object' || Array.isArray(manifest.defaults)) {
    throw new Error(`${manifestPath} must contain a defaults object`);
  }
  if (!Array.isArray(manifest.assets)) throw new Error(`${manifestPath} must contain an assets array`);
  const sources = new Set();
  const outputs = new Set();
  const assets = await Promise.all(manifest.assets.map(async (asset, index) => {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) throw new Error(`assets[${index}] must be an object`);
    const config = normalizedConfig(asset, manifest.defaults, index);
    const source = repositoryPath(root, config.source, `assets[${index}].source`);
    const output = repositoryPath(root, config.output, `assets[${index}].output`);
    await Promise.all([
      assertResolvedInside(root, source.absolute, `assets[${index}].source`),
      assertResolvedInside(root, output.absolute, `assets[${index}].output`),
    ]);
    if (!SOURCE_EXTENSION.test(source.relative)) throw new Error(`${source.relative} is not a supported raster master`);
    if (!RUNTIME_EXTENSION.test(output.relative)) throw new Error(`${output.relative} must end in -runtime.webp`);
    if (source.relative === output.relative) throw new Error(`${source.relative} cannot overwrite its master`);
    if (sources.has(source.relative)) throw new Error(`Duplicate runtime source: ${source.relative}`);
    if (outputs.has(output.relative)) throw new Error(`Duplicate runtime output: ${output.relative}`);
    sources.add(source.relative);
    outputs.add(output.relative);
    return { ...config, root, source: source.relative, output: output.relative, sourcePath: source.absolute, outputPath: output.absolute };
  }));
  return { manifest, manifestFile, assets };
}

async function transformedMaster(asset) {
  const sourceMetadata = await sharp(asset.sourcePath, { limitInputPixels: false }).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height) throw new Error(`${asset.source} has no readable dimensions`);
  if (asset.sprite) {
    if (sourceMetadata.width % asset.sprite.columns || sourceMetadata.height % asset.sprite.rows) {
      throw new Error(`${asset.source} does not divide cleanly into ${asset.sprite.columns}x${asset.sprite.rows} source frames`);
    }
  }

  let targetWidth = asset.width;
  let targetHeight = asset.height;
  if (targetWidth && targetHeight) {
    const sourceRatio = sourceMetadata.width / sourceMetadata.height;
    const targetRatio = targetWidth / targetHeight;
    const tolerance = 1 / Math.max(sourceMetadata.width, sourceMetadata.height, targetWidth, targetHeight);
    if (Math.abs(sourceRatio - targetRatio) > tolerance) {
      throw new Error(`${asset.output} target ${targetWidth}x${targetHeight} changes the ${asset.source} aspect ratio`);
    }
  }

  let pipeline = sharp(asset.sourcePath, { limitInputPixels: false, sequentialRead: true });
  if (targetWidth || targetHeight) {
    pipeline = pipeline.resize({
      width: targetWidth || undefined,
      height: targetHeight || undefined,
      fit: 'fill',
      kernel: asset.resizeKernel,
      withoutEnlargement: true,
    });
  }
  const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
  targetWidth = metadata.width;
  targetHeight = metadata.height;
  if (!targetWidth || !targetHeight) throw new Error(`${asset.source} could not be transformed`);
  if (asset.width && targetWidth !== asset.width) throw new Error(`${asset.source} is smaller than requested width ${asset.width}`);
  if (asset.height && targetHeight !== asset.height) throw new Error(`${asset.source} is smaller than requested height ${asset.height}`);
  if (asset.sprite && (targetWidth % asset.sprite.columns || targetHeight % asset.sprite.rows)) {
    throw new Error(`${asset.output} does not divide cleanly into ${asset.sprite.columns}x${asset.sprite.rows} runtime frames`);
  }
  return { buffer, metadata };
}

async function psnr(expectedBuffer, outputPath) {
  const probeOptions = { width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true };
  const [expected, actual] = await Promise.all([
    sharp(expectedBuffer, { limitInputPixels: false }).resize(probeOptions).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer(),
    sharp(outputPath, { limitInputPixels: false }).resize(probeOptions).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer(),
  ]);
  if (expected.length !== actual.length) throw new Error(`${outputPath} quality probe dimensions changed`);
  let squaredError = 0;
  for (let index = 0; index < expected.length; index++) {
    const delta = expected[index] - actual[index];
    squaredError += delta * delta;
  }
  const mse = squaredError / expected.length;
  return mse === 0 ? Infinity : 20 * Math.log10(255 / Math.sqrt(mse));
}

async function verifyAsset(asset, expectedBuffer, expectedMetadata) {
  const [sourceStats, outputStats, outputMetadata] = await Promise.all([
    stat(asset.sourcePath),
    stat(asset.outputPath),
    sharp(asset.outputPath, { limitInputPixels: false }).metadata(),
  ]);
  if (outputMetadata.format !== 'webp') throw new Error(`${asset.output} is not WebP`);
  if (outputMetadata.width !== expectedMetadata.width || outputMetadata.height !== expectedMetadata.height) {
    throw new Error(`${asset.output} dimensions changed: expected ${expectedMetadata.width}x${expectedMetadata.height}, got ${outputMetadata.width}x${outputMetadata.height}`);
  }
  if (asset.preserveAlpha && expectedMetadata.hasAlpha) {
    const expectedAlpha = await sharp(expectedBuffer, { limitInputPixels: false }).ensureAlpha().extractChannel(3).raw().toBuffer();
    let fullyOpaque = true;
    for (const value of expectedAlpha) {
      if (value !== 255) {
        fullyOpaque = false;
        break;
      }
    }
    if (!outputMetadata.hasAlpha) {
      if (!fullyOpaque) throw new Error(`${asset.output} lost transparency`);
    } else {
      const outputAlpha = await sharp(asset.outputPath, { limitInputPixels: false }).ensureAlpha().extractChannel(3).raw().toBuffer();
      if (!expectedAlpha.equals(outputAlpha)) throw new Error(`${asset.output} changed its alpha channel`);
    }
  }

  let measuredPsnr = null;
  if (asset.mode === 'lossless') {
    for (const background of ['#000000', '#ffffff']) {
      const [expectedPixels, outputPixels] = await Promise.all([
        sharp(expectedBuffer, { limitInputPixels: false }).flatten({ background }).raw().toBuffer(),
        sharp(asset.outputPath, { limitInputPixels: false }).flatten({ background }).raw().toBuffer(),
      ]);
      if (!expectedPixels.equals(outputPixels)) throw new Error(`${asset.output} is not visibly lossless over ${background}`);
    }
  } else {
    measuredPsnr = await psnr(expectedBuffer, asset.outputPath);
    if (measuredPsnr < asset.minPsnr) {
      throw new Error(`${asset.output} PSNR ${measuredPsnr.toFixed(2)} is below ${asset.minPsnr}`);
    }
  }

  const savingsPercent = (sourceStats.size - outputStats.size) * 100 / sourceStats.size;
  if (savingsPercent < asset.minSavingsPercent) {
    throw new Error(`${asset.output} saves ${savingsPercent.toFixed(1)}%, below the required ${asset.minSavingsPercent}%`);
  }
  return {
    sourceBytes: sourceStats.size,
    outputBytes: outputStats.size,
    savingsPercent,
    width: outputMetadata.width,
    height: outputMetadata.height,
    psnr: measuredPsnr,
  };
}

async function encodeAsset(asset, expectedBuffer) {
  await mkdir(path.dirname(asset.outputPath), { recursive: true });
  await assertResolvedInside(asset.root, path.dirname(asset.outputPath), `${asset.output} parent`);
  const temporary = `${asset.outputPath}.tmp-${process.pid}-${Date.now()}.webp`;
  try {
    const options = asset.mode === 'lossless'
      ? { lossless: true, effort: 6, alphaQuality: 100 }
      : { quality: asset.quality, alphaQuality: 100, effort: 6, smartSubsample: true };
    await sharp(expectedBuffer, { limitInputPixels: false }).webp(options).toFile(temporary);
    return temporary;
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function lockConfig(asset) {
  return {
    mode: asset.mode,
    quality: asset.quality,
    width: asset.width,
    height: asset.height,
    preserveAlpha: asset.preserveAlpha,
    minPsnr: asset.minPsnr,
    minSavingsPercent: asset.minSavingsPercent,
    resizeKernel: asset.resizeKernel,
    sprite: asset.sprite,
  };
}

async function readLock(root, lockPath, required) {
  const lockFile = repositoryPath(root, lockPath, 'lock path');
  await assertResolvedInside(root, lockFile.absolute, 'lock path');
  try {
    const lock = JSON.parse(await readFile(lockFile.absolute, 'utf8'));
    if (lock.version !== 1 || !lock.assets || typeof lock.assets !== 'object') throw new Error(`${lockPath} is invalid`);
    return { lock, lockFile };
  } catch (error) {
    if (error.code === 'ENOENT' && !required) {
      return { lock: { version: 1, generatedBy: 'scripts/build-runtime-images.mjs', assets: {} }, lockFile };
    }
    throw error;
  }
}

async function atomicJsonWrite(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  let current = null;
  try { current = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current === body) return false;
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(temporary, body, 'utf8');
  await rename(temporary, file);
  return true;
}

export async function buildRuntimeImages({
  root = REPOSITORY_ROOT,
  manifestPath = DEFAULT_MANIFEST,
  lockPath = DEFAULT_LOCK,
  check = false,
} = {}) {
  root = path.resolve(root);
  const [{ manifest, assets }, { lock, lockFile }] = await Promise.all([
    loadManifest(root, manifestPath),
    readLock(root, lockPath, check),
  ]);
  const nextLock = { version: 1, generatedBy: 'scripts/build-runtime-images.mjs', assets: {} };
  const results = [];

  for (const asset of assets) {
    const sourceSha256 = await fileHash(asset.sourcePath);
    const configSha256 = sha256(JSON.stringify(lockConfig(asset)));
    const locked = lock.assets[asset.output];
    if (check) {
      if (!locked) throw new Error(`${asset.output} is missing from ${lockPath}; run npm run images:runtime`);
      if (locked.sourceSha256 !== sourceSha256) throw new Error(`${asset.output} is stale because ${asset.source} changed`);
      if (locked.configSha256 !== configSha256) throw new Error(`${asset.output} is stale because its manifest settings changed`);
      const outputSha256 = await fileHash(asset.outputPath);
      if (locked.outputSha256 !== outputSha256) throw new Error(`${asset.output} changed outside the runtime image builder`);
    }

    const { buffer, metadata } = await transformedMaster(asset);
    let measured;
    if (check) {
      measured = await verifyAsset(asset, buffer, metadata);
    } else {
      const temporary = await encodeAsset(asset, buffer);
      try {
        measured = await verifyAsset({ ...asset, outputPath: temporary }, buffer, metadata);
        await rename(temporary, asset.outputPath);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        throw error;
      }
    }
    const outputSha256 = await fileHash(asset.outputPath);
    nextLock.assets[asset.output] = {
      source: asset.source,
      sourceSha256,
      configSha256,
      outputSha256,
      sourceBytes: measured.sourceBytes,
      outputBytes: measured.outputBytes,
      width: measured.width,
      height: measured.height,
      savingsPercent: Number(measured.savingsPercent.toFixed(2)),
      psnr: measured.psnr == null || !Number.isFinite(measured.psnr) ? null : Number(measured.psnr.toFixed(2)),
    };
    results.push({ asset, ...measured });
  }

  if (!check) await atomicJsonWrite(lockFile.absolute, nextLock);
  return { check, manifest, results, lock: check ? lock : nextLock };
}

export async function registerRuntimeImages({
  paths,
  root = REPOSITORY_ROOT,
  manifestPath = DEFAULT_MANIFEST,
} = {}) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('--register needs one or more *-master image paths');
  root = path.resolve(root);
  const { manifest, manifestFile } = await loadManifest(root, manifestPath);
  const knownSources = new Set(manifest.assets.map(asset => asset.source.replaceAll('\\', '/')));
  const additions = [];
  for (const candidate of paths) {
    const source = repositoryPath(root, candidate, 'registered master');
    await assertResolvedInside(root, source.absolute, 'registered master');
    if (!MASTER_EXTENSION.test(source.relative)) throw new Error(`${source.relative} must end in -master.png, -master.jpg, -master.jpeg or -master.webp`);
    if (knownSources.has(source.relative)) continue;
    const metadata = await sharp(source.absolute, { limitInputPixels: false }).metadata();
    const stem = source.relative.replace(/-master\.(?:png|jpe?g|webp)$/iu, '');
    const mode = SPRITE_NAME.test(path.basename(stem)) ? 'lossless' : 'lossy';
    const entry = {
      source: source.relative,
      output: `${stem}-runtime.webp`,
      mode,
      preserveAlpha: true,
    };
    if (mode === 'lossy') entry.quality = manifest.defaults.lossyQuality ?? 86;
    if (metadata.width && metadata.height && SPRITE_NAME.test(path.basename(stem))) {
      entry.note = 'Declare sprite.columns and sprite.rows before wiring if this is a multi-frame sheet.';
    }
    manifest.assets.push(entry);
    knownSources.add(source.relative);
    additions.push(entry);
  }
  manifest.assets.sort((left, right) => left.source.localeCompare(right.source));
  if (additions.length) await atomicJsonWrite(manifestFile.absolute, manifest);
  return additions;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function printReport({ check, results }) {
  console.log(`${check ? 'Verified' : 'Built'} ${results.length} runtime image${results.length === 1 ? '' : 's'}.`);
  for (const result of results) {
    const quality = result.asset.mode === 'lossless' ? 'lossless' : `PSNR ${result.psnr.toFixed(2)} dB`;
    console.log(`- ${result.asset.source} -> ${result.asset.output}: ${formatBytes(result.sourceBytes)} -> ${formatBytes(result.outputBytes)} ` +
      `(${result.savingsPercent.toFixed(1)}% smaller), ${result.width}x${result.height}, ${quality}`);
  }
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} needs a value`);
  return args[index + 1];
}

async function runCli(args) {
  const root = path.resolve(optionValue(args, '--root', REPOSITORY_ROOT));
  const manifestPath = optionValue(args, '--manifest', DEFAULT_MANIFEST);
  const lockPath = optionValue(args, '--lock', DEFAULT_LOCK);
  if (args.includes('--list-generated')) {
    const { assets } = await loadManifest(root, manifestPath);
    for (const asset of assets) console.log(asset.output);
    console.log(manifestPath);
    console.log(lockPath);
    return;
  }
  const registerIndex = args.indexOf('--register');
  if (registerIndex !== -1) {
    const paths = args.slice(registerIndex + 1).filter(value => !value.startsWith('--'));
    const additions = await registerRuntimeImages({ paths, root, manifestPath });
    console.log(`Registered ${additions.length} new runtime image master${additions.length === 1 ? '' : 's'}.`);
    return;
  }
  const result = await buildRuntimeImages({ root, manifestPath, lockPath, check: args.includes('--check') });
  printReport(result);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(`Runtime image pipeline failed: ${error.message}`);
    process.exitCode = 1;
  });
}
