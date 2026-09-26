#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const {
  findSpritesheetIds,
  extractDownloadTargets,
  collectUrlCandidates,
  buildLocalAtlas
} = require("./generate-moonpet-assets");

const REPO_ROOT = path.resolve(__dirname, "..");
const API_BASE_URL = "https://www.autosprite.io/api/v1";
const REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");
const DIAGNOSTIC_DIR = path.join(REPO_ROOT, "data", "autosprite-generation-diagnostics");
const DISCOVERY_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "botty-autosprite-character.json");
const FRAME_COUNT = 25;
const FRAME_SIZE = 256;
const SHEET_SIZE = { w: 1280, h: 1280 };
const DEFAULT_CHARACTER_NAME = "BOTTY";
const FRONT_ANIMATIONS = [
  "front_idle",
  "front_feed",
  "front_play",
  "front_clean",
  "front_sleep",
  "front_train",
  "front_travel",
  "front_work",
  "front_equip",
  "front_evolve",
  "front_trade",
  "front_celebrate",
  "front_interact",
  "front_blocked",
  "front_battle",
  "front_dance",
  "front_victory",
  "front_fight"
];

const ACTION_PROMPTS = {
  front_idle: "front-facing idle loop with subtle breathing, small visor blink, centered stance",
  front_feed: "front-facing feeding animation, happily receiving a snack, readable hand and mouth/visor reaction",
  front_play: "front-facing play animation, energetic toy interaction, bouncy happy pose",
  front_clean: "front-facing cleaning animation, tidy scrub and sparkle reaction, clear care action",
  front_sleep: "front-facing sleep animation, drowsy nod, soft sleep pose, peaceful loop",
  front_train: "front-facing training animation, determined exercise motion, strong upbeat effort",
  front_travel: "front-facing travel animation, ready-to-go stepping motion, compact journey energy",
  front_work: "front-facing work animation, focused task interaction, busy productive loop",
  front_equip: "front-facing equip animation, presenting or activating gear, confident reveal",
  front_evolve: "front-facing evolve animation, transformation energy, glow-up pose, celebratory upgrade",
  front_trade: "front-facing trade animation, offering an item forward, friendly exchange gesture",
  front_celebrate: "front-facing celebrate animation, victory cheer, confetti-like energy, joyful bounce",
  front_interact: "front-facing interact animation, friendly wave and attention gesture toward viewer",
  front_blocked: "front-facing blocked animation, clear refusal or shield pose, readable no-entry reaction",
  front_battle: "front-facing battle animation, combat-ready stance, punchy attack preparation, intense visor focus",
  front_dance: "front-facing seamless dance loop, rhythmic full-body movement, returning cleanly to the opening pose",
  front_victory: "front-facing one-shot victory celebration, clear triumphant gesture, ending in a stable victory pose",
  front_fight: "front-facing one-shot combat action, readable attack motion, recovering cleanly to the centered idle stance"
};

function parseArgs(argv) {
  const options = {
    characterName: DEFAULT_CHARACTER_NAME,
    characterId: "",
    execute: false,
    dryRun: true,
    pollTimeoutMs: 12 * 60 * 1000,
    registryPath: REGISTRY_PATH,
    discoveryManifestPath: DISCOVERY_MANIFEST_PATH,
    animation: "",
    limit: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--character-name") options.characterName = argv[++index];
    else if (arg.startsWith("--character-name=")) options.characterName = arg.slice("--character-name=".length);
    else if (arg === "--character-id") options.characterId = argv[++index];
    else if (arg.startsWith("--character-id=")) options.characterId = arg.slice("--character-id=".length);
    else if (arg === "--execute") {
      options.execute = true;
      options.dryRun = false;
    } else if (arg === "--dry-run") {
      options.execute = false;
      options.dryRun = true;
    } else if (arg === "--poll-timeout-ms") options.pollTimeoutMs = Number(argv[++index]);
    else if (arg.startsWith("--poll-timeout-ms=")) options.pollTimeoutMs = Number(arg.slice("--poll-timeout-ms=".length));
    else if (arg === "--registry") options.registryPath = path.resolve(argv[++index]);
    else if (arg.startsWith("--registry=")) options.registryPath = path.resolve(arg.slice("--registry=".length));
    else if (arg === "--discovery-manifest") options.discoveryManifestPath = path.resolve(argv[++index]);
    else if (arg.startsWith("--discovery-manifest=")) options.discoveryManifestPath = path.resolve(arg.slice("--discovery-manifest=".length));
    else if (arg === "--animation") options.animation = argv[++index];
    else if (arg.startsWith("--animation=")) options.animation = arg.slice("--animation=".length);
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.characterName = String(options.characterName || "").trim();
  options.characterId = String(options.characterId || "").trim();
  if (!options.characterName) throw new Error("--character-name is required.");
  if (!Number.isFinite(options.pollTimeoutMs) || options.pollTimeoutMs <= 0) options.pollTimeoutMs = 12 * 60 * 1000;
  if (!Number.isFinite(options.limit) || options.limit <= 0) options.limit = null;
  return options;
}

function printHelp() {
  console.log(`Generate BOTTY front-facing AutoSprite animation sheets.

Usage:
  node scripts/generate-botty-front-animations.js --character-name BOTTY --execute

Options:
  --character-name <n>       Character registry key/name. Default BOTTY.
  --character-id <id>        Override the registry/discovery character id.
  --execute                  Call AutoSprite and download sheets.
  --dry-run                  Write the request plan only. Default.
  --animation <id>           Generate one front_* animation.
  --limit <n>                Generate the first n animations.
  --poll-timeout-ms <n>      Max wait per AutoSprite job. Default 720000.
`);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function relative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "botty";
}

function outputPaths(characterName) {
  const characterSlug = slug(characterName).replace(/_/g, "-");
  return {
    outputDir: path.join(REPO_ROOT, "output", "moonpets", `${characterSlug}-front`),
    manifestPath: path.join(REPO_ROOT, "output", "manifests", `${characterSlug}-front-animation-sheets.generated.json`),
    rawDir: path.join(REPO_ROOT, "output", "manifests", "autosprite", `${characterSlug}-front`),
    diagnosticPath: path.join(DIAGNOSTIC_DIR, `${characterSlug}-front-last-error.json`)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pollDelayMs(pollCount) {
  if (pollCount === 1) return 5000;
  if (pollCount === 2) return 10000;
  if (pollCount === 3) return 15000;
  return 20000;
}

async function requestAutoSprite({ method = "GET", urlPath, apiKey, body, rawName, rawDir }) {
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
  if (rawName) await writeJson(path.join(rawDir, rawName), parsed || { rawText: text });
  if (!response.ok) {
    const message = parsed && (parsed.message || parsed.code || parsed.error && parsed.error.message) || text || response.statusText;
    throw new Error(`AutoSprite ${method} ${urlPath} failed HTTP ${response.status}: ${message}`);
  }
  return parsed;
}

function buildPrompt(characterName, animationId) {
  return [
    `${characterName} existing AutoSprite character, custom ${animationId} animation.`,
    ACTION_PROMPTS[animationId],
    "Strict front-facing view, symmetrical body facing the viewer, preserve the uploaded character identity exactly.",
    "Keep the complete character, feet, head, outfit, props, weapons and effects inside every frame with transparent spacing around movement.",
    "Transparent background, no text, labels, borders, UI, scenery, replacement character, alternate skin or redesign."
  ].join(" ");
}

function buildSpritesheetPayload(characterName, animationId) {
  return {
    animations: [{
      kind: "custom",
      name: animationId,
      prompt: buildPrompt(characterName, animationId)
    }],
    videoTier: "turbo",
    frameCount: FRAME_COUNT,
    frameSize: FRAME_SIZE,
    removeBg: "ultra"
  };
}

async function resolveCharacterId(options) {
  if (options.characterId) return options.characterId;

  const registry = await readJsonIfExists(options.registryPath, {});
  const registered = registry[options.characterName] || registry[options.characterName.toUpperCase()];
  if (registered && registered.active !== false && registered.character_id) {
    return String(registered.character_id);
  }

  const discovery = await readJsonIfExists(options.discoveryManifestPath, null);
  if (discovery && discovery.character_name === options.characterName && discovery.character_id) {
    return String(discovery.character_id);
  }

  throw new Error(`No AutoSprite character id found for "${options.characterName}". Run discover-autosprite-character first.`);
}

function workflowsFromCreateResponse(response) {
  const workflows =
    response && Array.isArray(response.workflows) ? response.workflows :
    response && response.data && Array.isArray(response.data.workflows) ? response.data.workflows :
    response && response.result && Array.isArray(response.result.workflows) ? response.result.workflows :
    [];
  return workflows.filter(Boolean);
}

async function pollJob({ apiKey, jobId, timeoutMs, animationId, paths }) {
  const started = Date.now();
  let pollCount = 0;
  while (Date.now() - started < timeoutMs) {
    pollCount += 1;
    await sleep(pollDelayMs(pollCount));
    try {
      const job = await requestAutoSprite({
        urlPath: `/jobs/${encodeURIComponent(jobId)}`,
        apiKey,
        rawName: `${animationId}-job-${slug(jobId)}-poll-${pollCount}.json`,
        rawDir: paths.rawDir
      });
      const status = String(job.status || job.job && job.job.status || job.data && job.data.status || "").toLowerCase();
      console.log(`[${animationId}] job ${jobId} status=${status || "unknown"}`);
      if (["succeeded", "success", "completed", "complete"].includes(status)) {
        await writeJson(path.join(paths.rawDir, `${animationId}-job-${slug(jobId)}-succeeded.json`), job);
        return job;
      }
      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error(`AutoSprite job ${jobId} ended with status=${status}.`);
      }
    } catch (error) {
      console.warn(`[${animationId}] poll warning for ${jobId}: ${error.message}`);
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
  if (id && extractDownloadTargets(value).length > 0) records.push(value);
  for (const child of Object.values(value)) candidateSpritesheetRecords(child, records);
  return records;
}

async function fetchSpritesheetRecord({ apiKey, spritesheetId, animationId, paths }) {
  return requestAutoSprite({
    urlPath: `/spritesheets/${encodeURIComponent(spritesheetId)}`,
    apiKey,
    rawName: `${animationId}-spritesheet-${slug(spritesheetId)}.json`,
    rawDir: paths.rawDir
  });
}

async function resolveSpritesheetRecord({ apiKey, job, createResponse, animationId, paths }) {
  const direct = candidateSpritesheetRecords(job)[0] || candidateSpritesheetRecords(createResponse)[0];
  if (direct) return { id: direct.id || direct.spriteSheetId || direct.spritesheetId || "embedded", record: direct };
  const ids = [...new Set([...findSpritesheetIds(job), ...findSpritesheetIds(createResponse)])];
  if (!ids.length) throw new Error(`No spritesheet id found in AutoSprite ${animationId} job response.`);
  const record = await fetchSpritesheetRecord({ apiKey, spritesheetId: ids[0], animationId, paths });
  return { id: ids[0], record };
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

async function checkImageOccupancy(sheetPath) {
  const image = sharp(sheetPath);
  const metadata = await image.metadata();
  const raw = await image.ensureAlpha().raw().toBuffer();
  let nonTransparent = 0;
  for (let index = 3; index < raw.length; index += 4) {
    if (raw[index] > 8) nonTransparent += 1;
  }
  const totalPixels = metadata.width * metadata.height;
  return {
    width: metadata.width,
    height: metadata.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    nonTransparentRatio: nonTransparent / totalPixels
  };
}

async function saveDownloads({ animationId, spritesheetId, spritesheetRecord, paths }) {
  const targets = extractDownloadTargets(spritesheetRecord);
  const sheet = targets.find((target) => target.kind === "png");
  const atlas = targets.find((target) => target.kind === "atlas");
  if (!sheet) {
    const rawPath = path.join(paths.rawDir, `${animationId}-missing-download-urls.json`);
    await writeJson(rawPath, {
      animation_id: animationId,
      spritesheet_id: spritesheetId,
      candidate_urls: collectUrlCandidates(spritesheetRecord),
      record: spritesheetRecord
    });
    throw new Error(`AutoSprite ${animationId} did not include a PNG sheet URL. Raw record saved to ${relative(rawPath)}.`);
  }

  const sheetPath = path.join(paths.outputDir, `${animationId}.png`);
  const atlasPath = path.join(paths.outputDir, `${animationId}.json`);
  await downloadFile(sheet.url, sheetPath);
  const sheetBytes = await assertOutput(sheetPath, "png");

  let atlasBytes = 0;
  let atlasSource = "downloaded";
  if (atlas) {
    await downloadFile(atlas.url, atlasPath);
    atlasBytes = await assertOutput(atlasPath, "atlas");
  } else {
    await writeJson(atlasPath, buildLocalAtlas({
      frameCount: FRAME_COUNT,
      frameSize: FRAME_SIZE,
      sheetSize: SHEET_SIZE
    }));
    atlasBytes = await assertOutput(atlasPath, "atlas");
    atlasSource = "generated_local";
  }

  const imageStats = await checkImageOccupancy(sheetPath);
  if (imageStats.width !== SHEET_SIZE.w || imageStats.height !== SHEET_SIZE.h) {
    throw new Error(`${animationId} PNG must be ${SHEET_SIZE.w}x${SHEET_SIZE.h}; got ${imageStats.width}x${imageStats.height}.`);
  }
  if (imageStats.nonTransparentRatio <= 0.02) {
    throw new Error(`${animationId} PNG appears blank or fully transparent (${imageStats.nonTransparentRatio.toFixed(4)}).`);
  }

  return {
    output_png_path: relative(sheetPath),
    output_atlas_path: relative(atlasPath),
    downloads: [
      { kind: "png", path: relative(sheetPath), bytes: sheetBytes, fieldName: sheet.fieldName },
      { kind: "atlas", path: relative(atlasPath), bytes: atlasBytes, fieldName: atlas ? atlas.fieldName : atlasSource, generatedLocal: atlasSource === "generated_local" }
    ],
    image_stats: imageStats
  };
}

async function writeManifest(entry, paths) {
  let manifest = {
    generated_at: new Date().toISOString(),
    source: "AutoSprite API",
    character_name: entry.character_name,
    character_id: entry.character_id,
    animations: []
  };
  try {
    manifest = await readJsonIfExists(paths.manifestPath, manifest);
    if (!Array.isArray(manifest.animations)) manifest.animations = [];
  } catch {
    // First manifest.
  }
  manifest.generated_at = new Date().toISOString();
  manifest.source = "AutoSprite API";
  manifest.character_name = entry.character_name;
  manifest.character_id = entry.character_id;
  manifest.animations = manifest.animations.filter((record) => record.id !== entry.id);
  manifest.animations.push(entry);
  await writeJson(paths.manifestPath, manifest);
  return manifest;
}

function selectedAnimations(options) {
  let animations = FRONT_ANIMATIONS;
  if (options.animation) {
    if (!FRONT_ANIMATIONS.includes(options.animation)) throw new Error(`Unknown BOTTY front animation: ${options.animation}`);
    animations = [options.animation];
  }
  if (options.limit) animations = animations.slice(0, options.limit);
  return animations;
}

async function generateOne({ apiKey, characterName, characterId, animationId, options, paths }) {
  const payload = buildSpritesheetPayload(characterName, animationId);
  if (options.dryRun || !options.execute) {
    const entry = {
      id: animationId,
      character_name: characterName,
      character_id: characterId,
      source: "AutoSprite API",
      generation_status: "dry_run",
      request_payload: payload,
      output_png_path: relative(path.join(paths.outputDir, `${animationId}.png`)),
      output_atlas_path: relative(path.join(paths.outputDir, `${animationId}.json`)),
      frame_count: FRAME_COUNT,
      frame_size: FRAME_SIZE,
      sheet_size: SHEET_SIZE,
      created_at: new Date().toISOString()
    };
    await writeManifest(entry, paths);
    return entry;
  }

  const createResponse = await requestAutoSprite({
    method: "POST",
    urlPath: `/characters/${encodeURIComponent(characterId)}/spritesheets`,
    apiKey,
    body: payload,
    rawName: `${animationId}-create-spritesheet.json`,
    rawDir: paths.rawDir
  });
  const workflows = workflowsFromCreateResponse(createResponse);
  if (workflows.length !== 1) throw new Error(`Expected exactly one ${animationId} workflow, received ${workflows.length}.`);
  const jobId = workflows[0].jobId || workflows[0].job_id;
  if (!jobId) throw new Error(`AutoSprite ${animationId} workflow did not include jobId.`);

  const job = await pollJob({ apiKey, jobId, timeoutMs: options.pollTimeoutMs, animationId, paths });
  const { id: spritesheetId, record } = await resolveSpritesheetRecord({ apiKey, job, createResponse, animationId, paths });
  const downloads = await saveDownloads({ animationId, spritesheetId, spritesheetRecord: record, paths });
  const entry = {
    id: animationId,
    character_name: characterName,
    character_id: characterId,
    source: "AutoSprite API",
    generation_status: "generated",
    review_status: "mechanical_pass",
    animation_kind: "custom",
    prompt: payload.animations[0].prompt,
    frame_count: FRAME_COUNT,
    frame_size: FRAME_SIZE,
    sheet_size: SHEET_SIZE,
    autosprite_job_id: jobId,
    autosprite_spritesheet_id: spritesheetId,
    created_at: new Date().toISOString(),
    ...downloads
  };
  await writeManifest(entry, paths);
  console.log(`Generated ${animationId} -> ${entry.output_png_path}`);
  return entry;
}

async function generateBottyFrontAnimations(options) {
  const paths = outputPaths(options.characterName);
  const characterId = await resolveCharacterId(options);
  const animations = selectedAnimations(options);
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (options.execute && !apiKey) throw new Error("AUTOSPRITE_API_KEY is required with --execute.");

  const entries = [];
  for (const animationId of animations) {
    entries.push(await generateOne({
      apiKey,
      characterName: options.characterName,
      characterId,
      animationId,
      options,
      paths
    }));
  }

  console.log(`${options.characterName} front animation manifest written to ${relative(paths.manifestPath)}`);
  return entries;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const paths = outputPaths(options.characterName);
  try {
    await generateBottyFrontAnimations(options);
  } catch (error) {
    await writeJson(paths.diagnosticPath, {
      captured_at: new Date().toISOString(),
      source: "AutoSprite API",
      character_name: options.characterName,
      execute: options.execute,
      dry_run: options.dryRun,
      animation: options.animation || null,
      limit: options.limit || null,
      error_message: error.message,
      note: "This file is intentionally non-secret and excludes AUTOSPRITE_API_KEY."
    });
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  FRONT_ANIMATIONS,
  parseArgs,
  buildSpritesheetPayload,
  generateBottyFrontAnimations,
  outputPaths
};
