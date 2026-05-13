#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixellabModule from '../lib/pixellab-client.js';

const { PixelLabClient } = pixellabModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const promptPath = path.join(repoRoot, 'art/btqm/source-prompts.json');
const outputRoot = path.join(repoRoot, 'art/btqm/generated');
const manifestPath = path.join(repoRoot, 'art/btqm/manifest.json');
const supportedCategories = ['tilesets', 'player', 'enemies', 'bosses', 'ui', 'fx', 'objects', 'icons'];

function parseArgs(argv) {
  const options = {
    execute: false,
    categories: new Set(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--category' || arg === '--categories') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      value.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => options.categories.add(item));
      i += 1;
    } else if (arg.startsWith('--category=')) {
      arg.slice('--category='.length).split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => options.categories.add(item));
    } else if (arg.startsWith('--categories=')) {
      arg.slice('--categories='.length).split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => options.categories.add(item));
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`BTQM PixelLab asset generator\n\nUsage:\n  node scripts/generate-btqm-assets.mjs [--execute] [--category <name[,name]>]\n\nCategories:\n  ${supportedCategories.join(', ')}\n\nDry run is the default and never calls PixelLab. Real generation requires --execute with PIXELLAB_API_KEY or PIXELLAB_SECRET.`);
}

function validateCategories(categories) {
  const invalid = [...categories].filter((category) => !supportedCategories.includes(category));
  if (invalid.length > 0) {
    throw new Error(`Unsupported category: ${invalid.join(', ')}. Supported categories: ${supportedCategories.join(', ')}`);
  }
}

function hashPrompt(asset, styleGuide) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({
    promptPrefix: styleGuide.sharedPromptPrefix || '',
    negativePrompt: asset.negativePrompt || styleGuide.negativePrompt || '',
    prompt: asset.prompt,
    size: asset.size,
  }));
  return hash.digest('hex').slice(0, 16);
}

function resolveSafeOutputPath(assetOutput) {
  const absoluteOutput = path.resolve(outputRoot, assetOutput);
  const relative = path.relative(outputRoot, absoluteOutput);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe asset output path: ${assetOutput}`);
  }
  return absoluteOutput;
}

function toManifestAsset(asset, status, styleGuide, details = {}) {
  return {
    id: asset.id,
    category: asset.category,
    zoneId: asset.zoneId,
    zoneName: asset.zoneName,
    name: asset.name,
    status,
    promptHash: hashPrompt(asset, styleGuide),
    output: path.posix.join('art/btqm/generated', asset.output.split(path.sep).join(path.posix.sep)),
    size: asset.size,
    ...(details.method ? { method: details.method } : {}),
    ...(details.imageUrl ? { imageUrl: details.imageUrl } : {}),
    ...(details.error ? { error: details.error } : {}),
  };
}

function printPlan(assets, styleGuide, dryRun) {
  console.log(`${dryRun ? 'DRY RUN' : 'EXECUTE'}: ${assets.length} BTQM PixelLab asset prompt(s) planned.`);
  for (const asset of assets) {
    const output = path.posix.join('art/btqm/generated', asset.output);
    const negative = asset.negativePrompt || styleGuide.negativePrompt || '';
    console.log('\n---');
    console.log(`[${asset.category}] ${asset.id}`);
    console.log(`Name: ${asset.name}`);
    console.log(`Output: ${output}`);
    console.log(`Size: ${asset.size.width}x${asset.size.height}`);
    console.log(`Prompt: ${[styleGuide.sharedPromptPrefix, asset.prompt].filter(Boolean).join('. ')}`);
    if (negative) console.log(`Negative: ${negative}`);
  }
}

async function loadPromptPlan() {
  const raw = await readFile(promptPath, 'utf8');
  const plan = JSON.parse(raw);
  if (!Array.isArray(plan.assets)) throw new Error('source-prompts.json must include an assets array.');
  return plan;
}

async function writeManifest(plan, assets) {
  const manifest = {
    version: plan.version || 1,
    game: plan.game || 'Block Topia Quest Maze',
    generatedAt: new Date().toISOString(),
    dryRun: assets.every((asset) => asset.status === 'planned'),
    sourcePrompts: 'art/btqm/source-prompts.json',
    outputRoot: 'art/btqm/generated',
    categories: supportedCategories,
    assets,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function generateAssets(plan, assets) {
  if (!process.env.PIXELLAB_API_KEY && !process.env.PIXELLAB_SECRET) {
    throw new Error('Refusing to execute without PIXELLAB_API_KEY or PIXELLAB_SECRET in the environment.');
  }

  const client = new PixelLabClient();
  const manifestAssets = [];
  let failedCount = 0;

  for (const asset of assets) {
    try {
      const absoluteOutput = resolveSafeOutputPath(asset.output);
      await mkdir(path.dirname(absoluteOutput), { recursive: true });
      console.log(`Generating ${asset.id} -> ${path.relative(repoRoot, absoluteOutput)}`);

      const result = await client.generateAsset(asset, plan.styleGuide || {}, absoluteOutput);
      manifestAssets.push(toManifestAsset(asset, 'generated', plan.styleGuide || {}, { method: result.method }));
    } catch (error) {
      failedCount += 1;
      manifestAssets.push(toManifestAsset(asset, 'failed', plan.styleGuide || {}, { error: error.message }));
      console.error(`Failed ${asset.id}: ${error.message}`);
    }
  }

  return { manifestAssets, failedCount };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  validateCategories(options.categories);
  const plan = await loadPromptPlan();
  const selectedCategories = options.categories.size > 0 ? options.categories : new Set(supportedCategories);
  const assets = plan.assets.filter((asset) => selectedCategories.has(asset.category));

  if (assets.length === 0) {
    throw new Error('No assets matched the selected categories.');
  }

  await mkdir(outputRoot, { recursive: true });
  printPlan(assets, plan.styleGuide || {}, !options.execute);

  const generationResult = options.execute
    ? await generateAssets(plan, assets)
    : {
        manifestAssets: assets.map((asset) => toManifestAsset(asset, 'planned', plan.styleGuide || {})),
        failedCount: 0,
      };

  const manifest = await writeManifest(plan, generationResult.manifestAssets);
  console.log(`\nWrote ${path.relative(repoRoot, manifestPath)} with ${manifest.assets.length} asset record(s).`);

  if (!options.execute) {
    console.log('Dry run complete. No PixelLab API call was made. Pass --execute with PIXELLAB_API_KEY or PIXELLAB_SECRET to generate images.');
  } else if (generationResult.failedCount > 0) {
    console.error(`${generationResult.failedCount} asset generation request(s) failed. Manifest was still written.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`BTQM asset generation failed: ${error.message}`);
  process.exitCode = 1;
});
