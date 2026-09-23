#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  findSpritesheetIds,
  extractDownloadTargets,
  collectUrlCandidates,
  buildLocalAtlas
} = require("./generate-moonpet-assets");

const REPO_ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(REPO_ROOT, "data", "moonpet-custom-animation-queue.json");
const OUTPUT_DIR = path.join(REPO_ROOT, "output", "moonpets", "custom");
const MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-custom-animation.generated.json");
const RAW_DIR = path.join(REPO_ROOT, "output", "manifests", "autosprite", "custom");
const API_BASE_URL = "https://www.autosprite.io/api/v1";
const ALLOWED_IDS = new Set(["custom_sleep"]);
const PROMPT_LIMIT = 600;

function parseArgs(argv) {
  const options = {
    id: "",
    execute: false,
    dryRun: true,
    pollTimeoutMs: 10 * 60 * 1000,
    queuePath: QUEUE_PATH
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--id") options.id = argv[++index];
    else if (arg.startsWith("--id=")) options.id = arg.slice("--id=".length);
    else if (arg === "--execute") {
      options.execute = true;
      options.dryRun = false;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
      options.execute = false;
    } else if (arg === "--poll-timeout-ms") options.pollTimeoutMs = Number(argv[++index]);
    else if (arg.startsWith("--poll-timeout-ms=")) options.pollTimeoutMs = Number(arg.slice("--poll-timeout-ms=".length));
    else if (arg === "--queue") options.queuePath = path.resolve(argv[++index]);
    else if (arg.startsWith("--queue=")) options.queuePath = path.resolve(arg.slice("--queue=".length));
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "moonpet";
}

function relative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function findQueueItem(queue, id) {
  return (queue.items || []).find((item) => item.id === id) || null;
}

function validatePromotionTarget(item) {
  const target = item && item.promotion_target || {};
  const expectedBase = "/img/moonpets/moonbot-pet-visor-v1/";
  if (!target.sheet_path || !target.atlas_path) throw new Error(`${item.id} is missing promotion target paths.`);
  if (!target.sheet_path.startsWith(expectedBase) || !target.atlas_path.startsWith(expectedBase)) {
    throw new Error(`${item.id} promotion targets must be under ${expectedBase}.`);
  }
  if (!target.sheet_path.endsWith(`${item.id}.png`) || !target.atlas_path.endsWith(`${item.id}.json`)) {
    throw new Error(`${item.id} promotion targets must use stable ${item.id}.png/json names.`);
  }
  return true;
}

function validateQueueItem(item, id) {
  if (!item) throw new Error(`Unknown custom animation id: ${id}`);
  if (!ALLOWED_IDS.has(id)) throw new Error(`Custom animation id ${id} is not enabled yet. Only custom_sleep is allowed.`);
  if (item.id !== id) throw new Error(`Queue item id mismatch: expected ${id}, found ${item.id}`);
  if (item.status !== "planned") throw new Error(`${id} must have status=planned before generation.`);
  if (item.approved !== false) throw new Error(`${id} must have approved=false before generation.`);
  if (item.custom_required !== true) throw new Error(`${id} must have custom_required=true.`);
  if (item.source_character_name !== "MOONBOT PET VISOR V1") throw new Error(`${id} must use source character MOONBOT PET VISOR V1.`);
  if (!item.prompt || item.prompt.length > PROMPT_LIMIT) throw new Error(`${id} prompt is required and must be ${PROMPT_LIMIT} characters or less.`);
  if (item.animation_kind === "attack" || item.role === "attack") throw new Error(`${id} must not use rejected attack.`);
  validatePromotionTarget(item);
  return item;
}

function buildSpritesheetPayload(item) {
  return {
    animations: [
      {
        kind: "custom",
        prompt: item.prompt
      }
    ],
    videoTier: "turbo",
    frameCount: item.output_expectations.frame_count,
    frameSize: item.output_expectations.frame_size,
    removeBg: "ultra"
  };
}

async function requestAutoSprite({ method = "GET", urlPath, apiKey, body, rawName }) {
  const response = await fetch(`${API_BASE_URL}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { rawText: text };
  }
  if (rawName) await writeJson(path.join(RAW_DIR, rawName), parsed || { rawText: text });
  if (!response.ok) {
    const message = parsed && (parsed.message || parsed.error && parsed.error.message || parsed.code) || text || response.statusText;
    throw new Error(`AutoSprite ${method} ${urlPath} failed HTTP ${response.status}: ${message}`);
  }
  return parsed;
}

async function findExistingCharacter(apiKey, name) {
  const list = await requestAutoSprite({
    urlPath: "/characters?limit=50",
    apiKey,
    rawName: "characters-list.json"
  });
  const characters = Array.isArray(list) ? list :
    Array.isArray(list.characters) ? list.characters :
      list.data && Array.isArray(list.data.characters) ? list.data.characters :
        list.data && Array.isArray(list.data) ? list.data : [];
  const match = characters.find((character) => character && character.name === name);
  if (!match) throw new Error(`AutoSprite character "${name}" was not found. Check the existing character name.`);
  await writeJson(path.join(RAW_DIR, "existing-character-moonbot-pet-visor-v1.json"), match);
  return match;
}

function workflowsFromCreateResponse(response) {
  return response && Array.isArray(response.workflows) ? response.workflows : [];
}

function pollDelayMs(pollCount) {
  if (pollCount === 1) return 5000;
  if (pollCount === 2) return 10000;
  if (pollCount === 3) return 15000;
  return 20000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob({ apiKey, jobId, timeoutMs }) {
  const started = Date.now();
  let pollCount = 0;
  while (Date.now() - started < timeoutMs) {
    pollCount += 1;
    await sleep(pollDelayMs(pollCount));
    try {
      const job = await requestAutoSprite({
        urlPath: `/jobs/${encodeURIComponent(jobId)}`,
        apiKey,
        rawName: `job-${slug(jobId)}-poll-${pollCount}.json`
      });
      const status = String(job.status || job.job && job.job.status || job.data && job.data.status || "").toLowerCase();
      console.log(`[custom_sleep] job ${jobId} status=${status || "unknown"}`);
      if (["succeeded", "success", "completed", "complete"].includes(status)) {
        await writeJson(path.join(RAW_DIR, `job-${slug(jobId)}-succeeded.json`), job);
        return job;
      }
      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error(`AutoSprite job ${jobId} ended with status=${status}.`);
      }
    } catch (error) {
      console.warn(`[custom_sleep] poll warning for ${jobId}: ${error.message}`);
    }
  }
  throw new Error(`AutoSprite job ${jobId} did not succeed before timeout.`);
}

function candidateSpritesheetRecords(value, records = []) {
  if (!value || typeof value !== "object") return records;
  if (Array.isArray(value)) {
    for (const item of value) candidateSpritesheetRecords(item, records);
    return records;
  }
  const id = value.id || value.spriteSheetId || value.spritesheetId || value.spritesheet_id;
  const hasDownload = extractDownloadTargets(value).length > 0;
  if (id && hasDownload) records.push(value);
  for (const child of Object.values(value)) candidateSpritesheetRecords(child, records);
  return records;
}

async function downloadFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed HTTP ${response.status}: ${url}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

async function assertOutput(filePath, kind) {
  const stats = await fs.stat(filePath);
  const min = kind === "png" ? 10 * 1024 : 100;
  if (stats.size <= min) throw new Error(`${relative(filePath)} is too small (${stats.size} bytes).`);
  return stats.size;
}

async function fetchSpritesheetRecord({ apiKey, spritesheetId }) {
  const record = await requestAutoSprite({
    urlPath: `/spritesheets/${encodeURIComponent(spritesheetId)}`,
    apiKey,
    rawName: `spritesheet-${slug(spritesheetId)}.json`
  });
  return record;
}

async function resolveSpritesheetRecord({ apiKey, job, createResponse }) {
  const direct = candidateSpritesheetRecords(job)[0] || candidateSpritesheetRecords(createResponse)[0];
  if (direct) return { id: direct.id || direct.spriteSheetId || direct.spritesheetId || "embedded", record: direct };
  const ids = [...new Set([...findSpritesheetIds(job), ...findSpritesheetIds(createResponse)])];
  if (!ids.length) throw new Error("No spritesheet id found in AutoSprite custom animation job response.");
  const record = await fetchSpritesheetRecord({ apiKey, spritesheetId: ids[0] });
  return { id: ids[0], record };
}

async function saveDownloads({ item, spritesheetId, spritesheetRecord }) {
  const targets = extractDownloadTargets(spritesheetRecord);
  const sheet = targets.find((target) => target.kind === "png");
  const atlas = targets.find((target) => target.kind === "atlas");
  if (!sheet) {
    const rawPath = path.join(RAW_DIR, `${item.id}-missing-download-urls.json`);
    await writeJson(rawPath, {
      item_id: item.id,
      spritesheet_id: spritesheetId,
      candidate_urls: collectUrlCandidates(spritesheetRecord),
      record: spritesheetRecord
    });
    throw new Error(`AutoSprite custom animation did not include a PNG sheet URL. Raw record saved to ${relative(rawPath)}.`);
  }

  const sheetPath = path.join(OUTPUT_DIR, `${item.id}.png`);
  const atlasPath = path.join(OUTPUT_DIR, `${item.id}.json`);
  await downloadFile(sheet.url, sheetPath);
  const sheetBytes = await assertOutput(sheetPath, "png");

  let atlasBytes = 0;
  let atlasSource = "downloaded";
  if (atlas) {
    await downloadFile(atlas.url, atlasPath);
    atlasBytes = await assertOutput(atlasPath, "atlas");
  } else {
    const atlasJson = buildLocalAtlas({
      frameCount: item.output_expectations.frame_count,
      frameSize: item.output_expectations.frame_size,
      sheetSize: item.output_expectations.sheet_size
    });
    await writeJson(atlasPath, atlasJson);
    atlasBytes = await assertOutput(atlasPath, "atlas");
    atlasSource = "generated_local";
    console.log(`[${item.id}] Atlas URL missing; generated local atlas.`);
  }

  return {
    generated_sheet_path: relative(sheetPath),
    generated_atlas_path: relative(atlasPath),
    sheet_path_source: relative(sheetPath),
    atlas_path_source: relative(atlasPath),
    source_sheet_path: relative(sheetPath),
    source_atlas_path: relative(atlasPath),
    downloads: [
      { kind: "png", path: relative(sheetPath), bytes: sheetBytes, fieldName: sheet.fieldName },
      { kind: "atlas", path: relative(atlasPath), bytes: atlasBytes, fieldName: atlas ? atlas.fieldName : atlasSource, generatedLocal: atlasSource === "generated_local" }
    ]
  };
}

async function writeManifest(entry) {
  let manifest = { generatedAt: new Date().toISOString(), customAnimations: [] };
  try {
    manifest = await readJson(MANIFEST_PATH);
    if (!Array.isArray(manifest.customAnimations)) manifest.customAnimations = [];
  } catch {
    // First custom generation manifest.
  }
  manifest.generatedAt = new Date().toISOString();
  manifest.customAnimations = manifest.customAnimations.filter((record) => record.id !== entry.id);
  manifest.customAnimations.push(entry);
  await writeJson(MANIFEST_PATH, manifest);
  return manifest;
}

async function generateCustomAnimation(options) {
  if (!options.id) throw new Error("--id is required. For now use --id custom_sleep.");
  const queue = await readJson(options.queuePath);
  const item = validateQueueItem(findQueueItem(queue, options.id), options.id);
  const payload = buildSpritesheetPayload(item);

  if (options.dryRun || !options.execute) {
    const entry = {
      id: item.id,
      role: item.role,
      source_character_name: item.source_character_name,
      status: "dry_run",
      approved: false,
      request_payload: payload,
      target: item.promotion_target,
      created_at: new Date().toISOString()
    };
    await writeManifest(entry);
    console.log(`Dry-run custom animation ${item.id}`);
    console.log(JSON.stringify(payload, null, 2));
    return entry;
  }

  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required with --execute.");

  const character = await findExistingCharacter(apiKey, item.source_character_name);
  const characterId = character.id || character.characterId;
  if (!characterId) throw new Error(`AutoSprite character "${item.source_character_name}" did not include an id.`);

  const createResponse = await requestAutoSprite({
    method: "POST",
    urlPath: `/characters/${encodeURIComponent(characterId)}/spritesheets`,
    apiKey,
    body: payload,
    rawName: `${item.id}-create-spritesheet.json`
  });
  const workflows = workflowsFromCreateResponse(createResponse);
  if (!workflows.length) throw new Error(`AutoSprite custom animation response did not include workflows[].`);
  if (workflows.length !== 1) throw new Error(`Expected exactly one custom animation workflow, received ${workflows.length}.`);
  const jobId = workflows[0].jobId || workflows[0].job_id;
  if (!jobId) throw new Error("AutoSprite custom animation workflow did not include jobId.");

  const job = await pollJob({ apiKey, jobId, timeoutMs: options.pollTimeoutMs });
  const { id: spritesheetId, record } = await resolveSpritesheetRecord({ apiKey, job, createResponse });
  const paths = await saveDownloads({ item, spritesheetId, spritesheetRecord: record });
  const entry = {
    id: item.id,
    role: item.role,
    source_character_name: item.source_character_name,
    status: "generated",
    approved: false,
    promoted: false,
    animation_kind: "custom",
    custom_required: true,
    prompt: item.prompt,
    frame_count: item.output_expectations.frame_count,
    frame_size: item.output_expectations.frame_size,
    sheet_size: item.output_expectations.sheet_size,
    sheet_path: item.promotion_target.sheet_path,
    atlas_path: item.promotion_target.atlas_path,
    autosprite_job_id: jobId,
    autosprite_spritesheet_id: spritesheetId,
    created_at: new Date().toISOString(),
    ...paths
  };
  await writeManifest(entry);
  console.log(`Generated ${item.id} -> ${entry.generated_sheet_path}`);
  return entry;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await generateCustomAnimation(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  findQueueItem,
  validateQueueItem,
  validatePromotionTarget,
  buildSpritesheetPayload,
  generateCustomAnimation
};
