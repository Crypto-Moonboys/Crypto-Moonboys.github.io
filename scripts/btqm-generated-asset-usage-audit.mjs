#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const GENERATED_ROOT = 'art/btqm/generated';
const MANIFEST_PATH = 'art/btqm/manifest.json';
const BOOTSTRAP_PATH = 'js/arcade/games/block-topia-quest-maze/bootstrap.js';
const FX_SYSTEM_PATH = 'js/arcade/games/block-topia-quest-maze/fx-system.js';

function parseArgs(argv) {
  const options = { json: false, help: false };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    'BTQM generated asset usage audit',
    '',
    'Usage:',
    '  node scripts/btqm-generated-asset-usage-audit.mjs [--json]',
    '',
    'Reports:',
    '  - used generated assets',
    '  - loaded but unused generated assets',
    '  - generated manifest records with missing payloads',
    '  - payloads not referenced by the manifest',
    '  - duplicate sha256 payloads within the same category',
  ].join('\n'));
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function toPosix(filePath) {
  return filePath.split(path.sep).join(path.posix.sep);
}

function extractStringSet(source, constantName) {
  const match = source.match(new RegExp(`const\\s+${constantName}\\s*=\\s*new\\s+Set\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`));
  if (!match) throw new Error(`${constantName} must be declared as a Set`);
  return new Set([...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]));
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function extractZones(source) {
  return [...source.matchAll(/\{\s*id:\s*(\d+),[\s\S]*?enemies:\s*\[([\s\S]*?)\],\s*boss:\s*\{\s*name:\s*'([^']+)'/g)].map((match) => ({
    zoneId: Number(match[1]),
    encounters: [...match[2].matchAll(/name:\s*'([^']+)'/g)].map((item) => item[1]),
    bossName: match[3],
  }));
}

function summarizeAsset(asset, context) {
  const encodedOutput = typeof asset.encodedOutput === 'string' ? asset.encodedOutput : null;
  const output = typeof asset.output === 'string' ? asset.output : null;
  const payloadExists = encodedOutput ? existsSync(encodedOutput) : false;
  const hydratedPath = encodedOutput ? encodedOutput.replace(/\.base64$/u, '') : null;
  const loadedByManifest = asset.status === 'generated';
  const allowlisted = context.allowlistedCategories.has(asset.category);
  let runtimeReferenced = false;
  let visiblyUsed = false;
  const reasons = [];

  if (loadedByManifest) reasons.push('generated manifest record');
  if (allowlisted) reasons.push(`category allowlisted (${asset.category})`);

  if (asset.category === 'tilesets') {
    runtimeReferenced = context.zoneIds.has(asset.zoneId) && context.tilesetRuntimeActive;
    visiblyUsed = runtimeReferenced && context.visibleTilesetZoneIds.has(asset.zoneId);
    if (runtimeReferenced) reasons.push(`zone ${asset.zoneId} tileset is registered by the map renderer`);
    if (visiblyUsed) reasons.push('generated tileset frames render in bomber gameplay');
  } else {
    runtimeReferenced = context.runtimeReferencedAssetIds.has(asset.id);
    visiblyUsed = context.visiblyUsedAssetIds.has(asset.id);
    if (runtimeReferenced) reasons.push('referenced by current runtime code');
    if (visiblyUsed) reasons.push('visibly used in bomber gameplay or Bonus Battle');
  }

  return {
    id: asset.id,
    category: asset.category,
    zoneId: asset.zoneId ?? null,
    output,
    encodedOutput,
    hydratedOutput: output,
    loadedByManifest,
    allowlisted,
    runtimeReferenced,
    visiblyUsed,
    payloadExists,
    hydratedPathMatchesOutput: Boolean(output && hydratedPath && output === hydratedPath),
    reasons,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const bootstrap = readFileSync(BOOTSTRAP_PATH, 'utf8');
  const fxSystem = readFileSync(FX_SYSTEM_PATH, 'utf8');

  const allowlistedCategories = extractStringSet(bootstrap, 'BTQM_SAFE_ASSET_CATEGORIES');
  const playerSheetIds = extractStringSet(bootstrap, 'BTQM_PLAYER_SHEET_IDS');
  const fxSheetIds = extractStringSet(bootstrap, 'BTQM_FX_SHEET_IDS');
  const zones = extractZones(bootstrap);
  const zoneIds = new Set(zones.map((zone) => zone.zoneId));
  const generatedAssets = manifest.assets.filter((asset) => asset.status === 'generated');
  const generatedTilesetZoneIds = new Set(generatedAssets.filter((asset) => asset.category === 'tilesets').map((asset) => asset.zoneId));
  const tilesetRuntimeActive = /function\s+getBtqmTileSpriteFrame\s*\(/.test(bootstrap) && /window\.BTQM_TILESET_RENDER_ACTIVE\s*=\s*true/.test(bootstrap);

  const runtimeReferencedAssetIds = new Set();
  const visiblyUsedAssetIds = new Set();

  for (const id of playerSheetIds) runtimeReferencedAssetIds.add(id);
  for (const id of fxSheetIds) runtimeReferencedAssetIds.add(id);
  for (const match of bootstrap.matchAll(/['"](object-[a-z0-9-]+)['"]/gi)) runtimeReferencedAssetIds.add(match[1]);
  for (const zone of zones) {
    for (const encounterName of zone.encounters) {
      const assetId = `enemy-${slugify(encounterName)}`;
      runtimeReferencedAssetIds.add(assetId);
      visiblyUsedAssetIds.add(assetId);
    }
    const bossAssetId = `boss-${slugify(zone.bossName)}`;
    runtimeReferencedAssetIds.add(bossAssetId);
    visiblyUsedAssetIds.add(bossAssetId);
  }

  for (const match of bootstrap.matchAll(/playBtqmPlayerAnim\([\s\S]*?['"]([^'"]+)['"]/g)) visiblyUsedAssetIds.add(match[1]);
  for (const match of fxSystem.matchAll(/playGeneratedFx\(scene,\s*['"]([^'"]+)['"]/g)) visiblyUsedAssetIds.add(match[1]);

  if (generatedTilesetZoneIds.size !== zoneIds.size) {
    for (const id of runtimeReferencedAssetIds) {
      if (id.startsWith('object-')) visiblyUsedAssetIds.add(id);
    }
  }

  const generatedAssetSummaries = generatedAssets
    .map((asset) => summarizeAsset(asset, {
      allowlistedCategories,
      runtimeReferencedAssetIds,
      visiblyUsedAssetIds,
      zoneIds,
      visibleTilesetZoneIds: generatedTilesetZoneIds,
      tilesetRuntimeActive,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

  const usedAssets = generatedAssetSummaries.filter((asset) => asset.loadedByManifest && asset.allowlisted && asset.runtimeReferenced && asset.visiblyUsed && asset.payloadExists && asset.hydratedPathMatchesOutput);
  const loadedButUnusedAssets = generatedAssetSummaries.filter((asset) => asset.loadedByManifest && (!asset.allowlisted || !asset.runtimeReferenced || !asset.visiblyUsed));
  const missingPayloads = generatedAssetSummaries.filter((asset) => !asset.encodedOutput || !asset.payloadExists || !asset.hydratedPathMatchesOutput);

  const manifestGeneratedPayloads = new Set(generatedAssets.map((asset) => asset.encodedOutput).filter(Boolean));
  const encodedPayloadFiles = walkFiles(GENERATED_ROOT)
    .map((file) => toPosix(file))
    .filter((file) => file.endsWith('.png.base64'))
    .sort();
  const hydratedOutputFiles = walkFiles(GENERATED_ROOT)
    .map((file) => toPosix(file))
    .filter((file) => file.endsWith('.png'))
    .sort();
  const orphanPayloads = encodedPayloadFiles.filter((file) => !manifestGeneratedPayloads.has(file));

  const duplicateHashes = [];
  const categoryHashes = new Map();
  for (const asset of generatedAssets) {
    if (!asset.sha256) continue;
    const categoryMap = categoryHashes.get(asset.category) || new Map();
    const firstAsset = categoryMap.get(asset.sha256);
    if (firstAsset) duplicateHashes.push({ category: asset.category, sha256: asset.sha256, assetIds: [firstAsset, asset.id] });
    else categoryMap.set(asset.sha256, asset.id);
    categoryHashes.set(asset.category, categoryMap);
  }

  const summary = {
    generatedAssetCount: generatedAssetSummaries.length,
    usedAssets,
    loadedButUnusedAssets,
    missingPayloads,
    orphanPayloads,
    duplicateHashes,
    encodedPayloadFiles,
    hydratedOutputFiles,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const printAssetList = (title, assets) => {
      console.log(`\n${title} (${assets.length})`);
      if (!assets.length) {
        console.log('- none');
        return;
      }
      for (const asset of assets) {
        console.log(`- ${asset.id} [${asset.category}]`);
        console.log(`  output: ${asset.output}`);
        console.log(`  encoded: ${asset.encodedOutput || '(missing)'}`);
        console.log(`  checks: manifest=${asset.loadedByManifest} allowlisted=${asset.allowlisted} runtime=${asset.runtimeReferenced} visible=${asset.visiblyUsed} payload=${asset.payloadExists}`);
        if (asset.reasons.length) console.log(`  proof: ${asset.reasons.join('; ')}`);
      }
    };

    printAssetList('Used generated assets', usedAssets);
    printAssetList('Loaded but unused generated assets', loadedButUnusedAssets);
    printAssetList('Manifest records with missing payloads', missingPayloads);

    console.log(`\nPayloads not referenced by manifest (${orphanPayloads.length})`);
    if (!orphanPayloads.length) console.log('- none');
    else orphanPayloads.forEach((file) => console.log(`- ${file}`));

    console.log(`\nDuplicate hashes within same category (${duplicateHashes.length})`);
    if (!duplicateHashes.length) console.log('- none');
    else duplicateHashes.forEach((entry) => console.log(`- [${entry.category}] ${entry.sha256}: ${entry.assetIds.join(', ')}`));

    console.log(`\nHydrated output files currently present (${hydratedOutputFiles.length})`);
    if (!hydratedOutputFiles.length) console.log('- none');
    else hydratedOutputFiles.forEach((file) => console.log(`- ${file}`));
  }

  if (loadedButUnusedAssets.length || missingPayloads.length || orphanPayloads.length || duplicateHashes.length) {
    process.exitCode = 1;
  }
}

main();
