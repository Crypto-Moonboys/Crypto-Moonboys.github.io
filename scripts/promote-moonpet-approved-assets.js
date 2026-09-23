#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-approved-assets.json");
const SANDBOX_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-animation-sandbox.generated.json");
const SPRITESHEET_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-spritesheets.generated.json");
const PUBLIC_ASSET_DIR = path.join(REPO_ROOT, "img", "moonpets", "moonbot-pet-visor-v1");
const PUBLIC_ASSET_BASE = "/img/moonpets/moonbot-pet-visor-v1";

function parseArgs(argv) {
  const options = {
    force: argv.includes("--force"),
    registryPath: REGISTRY_PATH,
    sandboxManifestPath: SANDBOX_MANIFEST_PATH,
    spritesheetManifestPath: SPRITESHEET_MANIFEST_PATH,
    publicAssetDir: PUBLIC_ASSET_DIR,
    publicAssetBase: PUBLIC_ASSET_BASE
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--registry") options.registryPath = path.resolve(argv[++index]);
    else if (arg.startsWith("--registry=")) options.registryPath = path.resolve(arg.slice("--registry=".length));
    else if (arg === "--sandbox-manifest") options.sandboxManifestPath = path.resolve(argv[++index]);
    else if (arg.startsWith("--sandbox-manifest=")) options.sandboxManifestPath = path.resolve(arg.slice("--sandbox-manifest=".length));
    else if (arg === "--spritesheet-manifest") options.spritesheetManifestPath = path.resolve(argv[++index]);
    else if (arg.startsWith("--spritesheet-manifest=")) options.spritesheetManifestPath = path.resolve(arg.slice("--spritesheet-manifest=".length));
    else if (arg === "--public-dir") options.publicAssetDir = path.resolve(argv[++index]);
    else if (arg.startsWith("--public-dir=")) options.publicAssetDir = path.resolve(arg.slice("--public-dir=".length));
    else if (arg === "--public-base") options.publicAssetBase = argv[++index];
    else if (arg.startsWith("--public-base=")) options.publicAssetBase = arg.slice("--public-base=".length);
  }
  return options;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function repoPath(publicOrRelativePath) {
  const clean = String(publicOrRelativePath || "").replace(/^\/+/, "");
  return path.join(REPO_ROOT, clean);
}

function downloadPathFromRecord(record, kind) {
  const download = (record.downloads || []).find((entry) => entry.kind === kind || (kind === "sheet" && entry.kind === "png"));
  return download ? download.path : null;
}

function sourcePathsFor(record) {
  const sourceSheet = record.generated_sheet_path ||
    record.sheet_path_source ||
    record.source_sheet_path ||
    downloadPathFromRecord(record, "sheet") ||
    downloadPathFromRecord(record, "png");
  const sourceAtlas = record.generated_atlas_path ||
    record.atlas_path_source ||
    record.source_atlas_path ||
    downloadPathFromRecord(record, "atlas");
  if (sourceSheet || sourceAtlas) {
    return {
      sheet: sourceSheet,
      atlas: sourceAtlas
    };
  }
  const sheetPath = record.sheet_path && String(record.sheet_path).startsWith("output/") ? record.sheet_path : null;
  const atlasPath = record.atlas_path && String(record.atlas_path).startsWith("output/") ? record.atlas_path : null;
  return {
    sheet: sheetPath,
    atlas: atlasPath
  };
}

function approvedKey(asset) {
  return `${asset.character_name}::${asset.animation_kind}`;
}

function recordsFromManifest(manifest, sourceName) {
  const sandboxAssets = (manifest && Array.isArray(manifest.assets)) ? manifest.assets : [];
  const spriteSheets = (manifest && Array.isArray(manifest.spriteSheets)) ? manifest.spriteSheets : [];
  return [...sandboxAssets, ...spriteSheets].map((record) => ({ ...record, manifest_source: sourceName }));
}

function matchingRecords(records, asset) {
  const key = approvedKey(asset);
  return records.filter((record) =>
    `${record.character_name}::${record.animation_kind}` === key &&
    record.approved === true &&
    record.rejected !== true
  );
}

function debugRecord(record) {
  const sources = sourcePathsFor(record);
  return {
    manifest_source: record.manifest_source || null,
    character_name: record.character_name || null,
    animation_kind: record.animation_kind || null,
    approved: record.approved === true,
    rejected: record.rejected === true,
    sheet_path: record.sheet_path || null,
    atlas_path: record.atlas_path || null,
    generated_sheet_path: record.generated_sheet_path || null,
    generated_atlas_path: record.generated_atlas_path || null,
    sheet_path_source: record.sheet_path_source || null,
    atlas_path_source: record.atlas_path_source || null,
    source_sheet_path: record.source_sheet_path || null,
    source_atlas_path: record.source_atlas_path || null,
    resolved_sheet: sources.sheet || null,
    resolved_atlas: sources.atlas || null
  };
}

function printPromotionDebug({ asset, checkedManifests, candidateRecords, expectedSources }) {
  console.error(`Promotion source missing for approved animation: ${asset.animation_kind}`);
  console.error(`Checked manifests: ${checkedManifests.join(", ") || "none"}`);
  console.error(`Candidate generated records found: ${JSON.stringify(candidateRecords.map(debugRecord), null, 2)}`);
  console.error(`Expected source paths: ${JSON.stringify(expectedSources, null, 2)}`);
}

async function resolveExistingSource(record) {
  const sources = sourcePathsFor(record);
  const sourceSheet = sources.sheet ? repoPath(sources.sheet) : null;
  const sourceAtlas = sources.atlas ? repoPath(sources.atlas) : null;
  return {
    sources,
    sourceSheet,
    sourceAtlas,
    sheetExists: sourceSheet ? await pathExists(sourceSheet) : false,
    atlasExists: sourceAtlas ? await pathExists(sourceAtlas) : false
  };
}

async function findPromotableRecord(asset, records) {
  const candidates = matchingRecords(records, asset);
  for (const record of candidates) {
    const resolved = await resolveExistingSource(record);
    if (resolved.sheetExists && resolved.atlasExists) {
      return { record, resolved, candidates };
    }
  }
  return { record: null, resolved: null, candidates };
}

async function promoteOne({ asset, record, resolved, options }) {
  const sources = sourcePathsFor(record);
  if (!sources.sheet || !sources.atlas) {
    throw new Error(`Missing generated source sheet/atlas paths for approved ${asset.animation_kind}. Run generation first and keep output artifacts available.`);
  }

  const sourceSheet = resolved ? resolved.sourceSheet : repoPath(sources.sheet);
  const sourceAtlas = resolved ? resolved.sourceAtlas : repoPath(sources.atlas);
  if (!(await pathExists(sourceSheet))) {
    throw new Error(`Missing source sheet file for ${asset.animation_kind}: ${sources.sheet}`);
  }
  if (!(await pathExists(sourceAtlas))) {
    throw new Error(`Missing source atlas file for ${asset.animation_kind}: ${sources.atlas}`);
  }

  await fs.mkdir(options.publicAssetDir, { recursive: true });
  const targetSheet = path.join(options.publicAssetDir, `${asset.animation_kind}.png`);
  const targetAtlas = path.join(options.publicAssetDir, `${asset.animation_kind}.json`);
  if (!options.force && ((await pathExists(targetSheet)) || (await pathExists(targetAtlas)))) {
    throw new Error(`Refusing to overwrite promoted ${asset.animation_kind}. Re-run with --force only after explicit approval.`);
  }
  await fs.copyFile(sourceSheet, targetSheet);
  await fs.copyFile(sourceAtlas, targetAtlas);

  return {
    sheet_path: `${options.publicAssetBase}/${asset.animation_kind}.png`,
    atlas_path: `${options.publicAssetBase}/${asset.animation_kind}.json`
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const registry = await readJson(options.registryPath);
  const checkedManifests = [];
  const allRecords = [];

  if (await pathExists(options.sandboxManifestPath)) {
    checkedManifests.push(path.relative(REPO_ROOT, options.sandboxManifestPath).replace(/\\/g, "/"));
    allRecords.push(...recordsFromManifest(await readJson(options.sandboxManifestPath), "moonpet-animation-sandbox.generated.json"));
  }
  if (await pathExists(options.spritesheetManifestPath)) {
    checkedManifests.push(path.relative(REPO_ROOT, options.spritesheetManifestPath).replace(/\\/g, "/"));
    allRecords.push(...recordsFromManifest(await readJson(options.spritesheetManifestPath), "moonpet-spritesheets.generated.json"));
  }
  if (allRecords.length === 0) {
    throw new Error(`No generated Moonpet manifests found. Checked: ${[
      path.relative(REPO_ROOT, options.sandboxManifestPath).replace(/\\/g, "/"),
      path.relative(REPO_ROOT, options.spritesheetManifestPath).replace(/\\/g, "/")
    ].join(", ")}`);
  }
  const rejectedKeys = new Set((registry.rejected || []).map(approvedKey));

  let promoted = 0;
  for (const asset of registry.assets || []) {
    if (asset.approved !== true) continue;
    const key = approvedKey(asset);
    if (rejectedKeys.has(key)) {
      throw new Error(`Refusing to promote rejected asset: ${key}`);
    }

    const { record, resolved, candidates } = await findPromotableRecord(asset, allRecords);
    if (!record) {
      const candidateRecords = candidates.length ? candidates : allRecords.filter((entry) =>
        entry.character_name === asset.character_name && entry.animation_kind === asset.animation_kind
      );
      printPromotionDebug({
        asset,
        checkedManifests,
        candidateRecords,
        expectedSources: {
          generated_sheet_path: "output/moonpets/spritesheets/...png",
          generated_atlas_path: "output/moonpets/spritesheets/...json",
          sheet_path_source: "output/moonpets/spritesheets/...png",
          atlas_path_source: "output/moonpets/spritesheets/...json"
        }
      });
      throw new Error(`No approved generated manifest record found for ${key}.`);
    }

    const paths = await promoteOne({ asset, record, resolved, options });
    asset.sheet_path = paths.sheet_path;
    asset.atlas_path = paths.atlas_path;
    asset.promoted = true;
    asset.promoted_at = new Date().toISOString();
    promoted += 1;
    console.log(`promoted ${asset.animation_kind} -> ${paths.sheet_path}`);
  }

  await writeJson(options.registryPath, registry);
  console.log(`Promoted ${promoted} approved Moonpet assets.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
