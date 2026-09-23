#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(REPO_ROOT, "data", "moonpet-custom-animation-queue.json");
const MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-custom-animation.generated.json");
const PUBLIC_DIR = path.join(REPO_ROOT, "img", "moonpets", "moonbot-pet-visor-v1");
const ALLOWED_IDS = new Set(["custom_sleep"]);

function parseArgs(argv) {
  const options = { id: "", force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--id") options.id = argv[++index];
    else if (arg.startsWith("--id=")) options.id = arg.slice("--id=".length);
    else if (arg === "--force") options.force = true;
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function repoPath(relativePath) {
  return path.join(REPO_ROOT, String(relativePath || "").replace(/^\/+/, ""));
}

function generatedRecordFor(manifest, id) {
  return (manifest.customAnimations || []).find((entry) => entry.id === id && entry.status === "generated") || null;
}

async function promoteCustomAnimation(options) {
  if (!options.id) throw new Error("--id is required. For now use --id custom_sleep.");
  if (!ALLOWED_IDS.has(options.id)) throw new Error(`Only custom_sleep can be promoted by this script right now.`);

  const queue = await readJson(QUEUE_PATH);
  const manifest = await readJson(MANIFEST_PATH);
  const item = (queue.items || []).find((entry) => entry.id === options.id);
  if (!item) throw new Error(`Queue item not found: ${options.id}`);
  if (item.approved === true) throw new Error(`${options.id} is already approved. This promoter must not approve assets.`);

  const record = generatedRecordFor(manifest, options.id);
  if (!record) throw new Error(`Generated custom animation record not found for ${options.id}.`);

  const sourceSheet = repoPath(record.generated_sheet_path || record.source_sheet_path);
  const sourceAtlas = repoPath(record.generated_atlas_path || record.source_atlas_path);
  if (!(await pathExists(sourceSheet))) throw new Error(`Missing generated sheet: ${record.generated_sheet_path}`);
  if (!(await pathExists(sourceAtlas))) throw new Error(`Missing generated atlas: ${record.generated_atlas_path}`);

  const targetSheet = path.join(PUBLIC_DIR, `${options.id}.png`);
  const targetAtlas = path.join(PUBLIC_DIR, `${options.id}.json`);
  if (!options.force && ((await pathExists(targetSheet)) || (await pathExists(targetAtlas)))) {
    throw new Error(`Refusing to overwrite promoted ${options.id}. Re-run with --force only after explicit review.`);
  }

  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.copyFile(sourceSheet, targetSheet);
  await fs.copyFile(sourceAtlas, targetAtlas);

  item.status = "promoted";
  item.promoted = true;
  item.promoted_at = new Date().toISOString();
  item.sheet_path = `/img/moonpets/moonbot-pet-visor-v1/${options.id}.png`;
  item.atlas_path = `/img/moonpets/moonbot-pet-visor-v1/${options.id}.json`;
  item.approved = false;
  await writeJson(QUEUE_PATH, queue);
  console.log(`Promoted ${options.id}; approval still required separately.`);
}

if (require.main === module) {
  promoteCustomAnimation(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, promoteCustomAnimation };
