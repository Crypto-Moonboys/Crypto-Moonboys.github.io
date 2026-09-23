#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-approved-assets.json");
const SANDBOX_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-animation-sandbox.generated.json");
const PUBLIC_ASSET_DIR = path.join(REPO_ROOT, "img", "moonpets", "moonbot-pet-visor-v1");
const PUBLIC_ASSET_BASE = "/img/moonpets/moonbot-pet-visor-v1";

function parseArgs(argv) {
  return {
    force: argv.includes("--force")
  };
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
  const sourceSheet = record.source_sheet_path || downloadPathFromRecord(record, "sheet") || downloadPathFromRecord(record, "png");
  const sourceAtlas = record.source_atlas_path || downloadPathFromRecord(record, "atlas");
  if (sourceSheet || sourceAtlas) {
    return {
      sheet: sourceSheet,
      atlas: sourceAtlas
    };
  }
  const sheetPath = record.sheet_path && !String(record.sheet_path).startsWith("/img/") ? record.sheet_path : null;
  const atlasPath = record.atlas_path && !String(record.atlas_path).startsWith("/img/") ? record.atlas_path : null;
  return {
    sheet: sheetPath,
    atlas: atlasPath
  };
}

function approvedKey(asset) {
  return `${asset.character_name}::${asset.animation_kind}`;
}

function findManifestRecord(manifest, asset) {
  const key = approvedKey(asset);
  return (manifest.assets || []).find((record) =>
    `${record.character_name}::${record.animation_kind}` === key &&
    record.approved === true &&
    record.rejected !== true
  );
}

async function promoteOne({ asset, record, options }) {
  const sources = sourcePathsFor(record);
  if (!sources.sheet || !sources.atlas) {
    throw new Error(`Missing generated source sheet/atlas paths for approved ${asset.animation_kind}. Run generation first and keep output artifacts available.`);
  }

  const sourceSheet = repoPath(sources.sheet);
  const sourceAtlas = repoPath(sources.atlas);
  if (!(await pathExists(sourceSheet))) {
    throw new Error(`Missing source sheet file for ${asset.animation_kind}: ${sources.sheet}`);
  }
  if (!(await pathExists(sourceAtlas))) {
    throw new Error(`Missing source atlas file for ${asset.animation_kind}: ${sources.atlas}`);
  }

  await fs.mkdir(PUBLIC_ASSET_DIR, { recursive: true });
  const targetSheet = path.join(PUBLIC_ASSET_DIR, `${asset.animation_kind}.png`);
  const targetAtlas = path.join(PUBLIC_ASSET_DIR, `${asset.animation_kind}.json`);
  if (!options.force && ((await pathExists(targetSheet)) || (await pathExists(targetAtlas)))) {
    throw new Error(`Refusing to overwrite promoted ${asset.animation_kind}. Re-run with --force only after explicit approval.`);
  }
  await fs.copyFile(sourceSheet, targetSheet);
  await fs.copyFile(sourceAtlas, targetAtlas);

  return {
    sheet_path: `${PUBLIC_ASSET_BASE}/${asset.animation_kind}.png`,
    atlas_path: `${PUBLIC_ASSET_BASE}/${asset.animation_kind}.json`
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const registry = await readJson(REGISTRY_PATH);
  if (!(await pathExists(SANDBOX_MANIFEST_PATH))) {
    throw new Error(`Sandbox manifest not found: ${path.relative(REPO_ROOT, SANDBOX_MANIFEST_PATH).replace(/\\/g, "/")}`);
  }
  const manifest = await readJson(SANDBOX_MANIFEST_PATH);
  const rejectedKeys = new Set((registry.rejected || []).map(approvedKey));

  let promoted = 0;
  for (const asset of registry.assets || []) {
    if (asset.approved !== true) continue;
    const key = approvedKey(asset);
    if (rejectedKeys.has(key)) {
      throw new Error(`Refusing to promote rejected asset: ${key}`);
    }

    const record = findManifestRecord(manifest, asset);
    if (!record) {
      throw new Error(`No approved generated manifest record found for ${key}.`);
    }

    const paths = await promoteOne({ asset, record, options });
    asset.sheet_path = paths.sheet_path;
    asset.atlas_path = paths.atlas_path;
    asset.promoted = true;
    asset.promoted_at = new Date().toISOString();
    promoted += 1;
    console.log(`promoted ${asset.animation_kind} -> ${paths.sheet_path}`);
  }

  await writeJson(REGISTRY_PATH, registry);
  console.log(`Promoted ${promoted} approved Moonpet assets.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
