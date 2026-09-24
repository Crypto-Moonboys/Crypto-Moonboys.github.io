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
const QUEUE_PATH = path.join(REPO_ROOT, "data", "moonpet-side-scroller-animation-queue.json");
const OUTPUT_DIR = path.join(REPO_ROOT, "output", "moonpets", "side-scroller");
const MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-side-scroller.generated.json");
const RAW_DIR = path.join(REPO_ROOT, "output", "manifests", "autosprite", "side-scroller");
const API_BASE_URL = "https://www.autosprite.io/api/v1";
const SIDE_SEQUENCE = [
  "side_idle",
  "side_walk",
  "side_run",
  "side_jump",
  "side_eat",
  "side_sleep",
  "side_play",
  "side_clean",
  "side_train",
  "side_hurt",
  "side_work",
  "side_equip",
  "side_evolve",
  "side_trade",
  "side_celebrate",
  "side_interact",
  "side_battle",
  "side_turn",
  "side_front_wave",
  "side_front_victory",
  "side_eat_chaos",
  "side_play_ball"
];
const ALLOWED_IDS = new Set(SIDE_SEQUENCE);
const FRAME_COUNT = 25;
const FRAME_SIZE = 256;
const SHEET_SIZE = { w: 1280, h: 1280 };
const PROMPT_LIMIT = 600;
const NEGATIVE_PROMPT = "No tail, no ears, no snout, no animal body, no fur, no paws, no whiskers, no claws.";

function parseArgs(argv) {
  const options = {
    id: "side_idle",
    execute: false,
    dryRun: true,
    review: true,
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
      options.execute = false;
      options.dryRun = true;
    } else if (arg === "--no-review") options.review = false;
    else if (arg === "--review") options.review = true;
    else if (arg === "--poll-timeout-ms") options.pollTimeoutMs = Number(argv[++index]);
    else if (arg.startsWith("--poll-timeout-ms=")) options.pollTimeoutMs = Number(arg.slice("--poll-timeout-ms=".length));
    else if (arg === "--queue") options.queuePath = path.resolve(argv[++index]);
    else if (arg.startsWith("--queue=")) options.queuePath = path.resolve(arg.slice("--queue=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.pollTimeoutMs) || options.pollTimeoutMs <= 0) {
    options.pollTimeoutMs = 10 * 60 * 1000;
  }
  return options;
}

function printHelp() {
  console.log(`Moonpet side-scroller generation

Usage:
  node scripts/generate-moonpet-side-scroller-animation.js --id side_idle --dry-run
  node scripts/generate-moonpet-side-scroller-animation.js --id side_idle --execute

Options:
  --id <id>              Side-scroller queue id. Known ids: ${SIDE_SEQUENCE.join(", ")}.
  --dry-run             Validate and write a dry-run manifest without calling AutoSprite. Default.
  --execute             Call AutoSprite for the selected side-scroller animation.
  --review / --no-review
                         Run mechanical checks after generation. Review is on by default.
  --poll-timeout-ms <n> Max time to poll the AutoSprite job. Default 600000.
  --queue <path>        Alternate side-scroller queue JSON path.
`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function relative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function repoPath(value) {
  return path.join(REPO_ROOT, String(value || "").replace(/^\/+/, ""));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "moonbot";
}

function pass(id, label, detail = "") {
  return { id, label, status: "pass", detail };
}

function fail(id, label, detail = "") {
  return { id, label, status: "fail", detail };
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findQueueItem(queue, id) {
  return (queue.items || []).find((item) => item.id === id) || null;
}

function hasForbiddenDirection(value) {
  return /(^iso_|_down$|_down_|down_facing|isometric)/i.test(String(value || ""));
}

function hasRequiredNegativePromptTerms(value) {
  const normalized = String(value || "").toLowerCase();
  return [
    "no tail",
    "no ears",
    "no snout",
    "no animal body",
    "no fur",
    "no paws",
    "no whiskers",
    "no claws"
  ].every((term) => normalized.includes(term));
}

function validateItem(item, id) {
  const checks = [];
  checks.push(ALLOWED_IDS.has(id)
    ? pass("id_enabled", "Side-scroller animation id is enabled", id)
    : fail("id_enabled", "Unknown side-scroller animation id", id));
  checks.push(Boolean(item)
    ? pass("queue_item_exists", "Queue item exists", id)
    : fail("queue_item_exists", "Queue item missing", id));
  if (!item) return checks;

  const prompt = String(item.prompt || "");
  const negativePrompt = String(item.negative_prompt || "");
  const combinedPrompt = `${prompt} ${negativePrompt}`.replace(/\s+/g, " ").trim();
  const target = item.promotion_target || {};

  checks.push([
    "planned",
    "pending",
    "generated_pending_review",
    "generated_pending_visual_review",
    "rejected_pending_regeneration",
    "mechanically_passed",
    "skipped"
  ].includes(item.status)
    ? pass("status_generatable", "Queue item status can be generated", item.status)
    : fail("status_generatable", "Queue item must be planned, pending, generated_pending_review, generated_pending_visual_review, rejected_pending_regeneration, mechanically_passed, or skipped", item.status));
  checks.push(item.approved === false
    ? pass("not_approved", "Queue item is not approved", "approved=false")
    : fail("not_approved", "Do not generate already-approved side-scroller assets here", "approved=true"));
  checks.push(item.promoted === false
    ? pass("not_promoted", "Queue item is not promoted", "promoted=false")
    : fail("not_promoted", "Do not generate over promoted side-scroller assets here", "promoted=true"));
  checks.push(item.source_character_name === "MOONBOT PET VISOR V1"
    ? pass("source_character", "Uses existing Moonbot source character", item.source_character_name)
    : fail("source_character", "Expected source character MOONBOT PET VISOR V1", item.source_character_name));
  checks.push(item.id === id && item.role === id && String(id).startsWith("side_")
    ? pass("side_id_role", "Selected item uses side_ id and role", `${item.id}/${item.role}`)
    : fail("side_id_role", "Selected item must use matching side_ id and role", `${item.id}/${item.role}`));
  checks.push(!hasForbiddenDirection(item.id) && !hasForbiddenDirection(item.role) && !hasForbiddenDirection(item.animation_kind)
    ? pass("no_isometric_direction", "Item avoids isometric/down-facing naming", `${item.id}/${item.animation_kind}`)
    : fail("no_isometric_direction", "Item must not use isometric/down-facing naming", `${item.id}/${item.animation_kind}`));
  checks.push(item.id !== "attack" && item.role !== "attack" && item.animation_kind !== "attack"
    ? pass("not_attack", "Item does not use attack", item.animation_kind)
    : fail("not_attack", "Rejected attack must not be used", item.animation_kind));
  checks.push(typeof item.animation_kind === "string" && item.animation_kind.length > 0
    ? pass("animation_kind", "Animation kind is present", item.animation_kind)
    : fail("animation_kind", "Animation kind is required", String(item.animation_kind)));
  checks.push(prompt.includes("Moonbot") && !/\bpet\b/i.test(prompt)
    ? pass("moonbot_terms", "Prompt uses Moonbot terminology and avoids pet", prompt)
    : fail("moonbot_terms", "Prompt must use Moonbot terminology and avoid pet", prompt));
  checks.push(hasRequiredNegativePromptTerms(negativePrompt)
    ? pass("negative_prompt", "Negative prompt blocks animal drift", negativePrompt)
    : fail("negative_prompt", "Negative prompt must block animal drift", negativePrompt));
  checks.push(combinedPrompt.length <= PROMPT_LIMIT
    ? pass("prompt_length", "Prompt and negative prompt are under 600 characters", `${combinedPrompt.length}`)
    : fail("prompt_length", "Prompt and negative prompt must be under 600 characters", `${combinedPrompt.length}`));
  checks.push(item.output_expectations && item.output_expectations.frame_count === FRAME_COUNT
    ? pass("frame_count", "Expected frame count is 25", "25")
    : fail("frame_count", "Expected frame count must be 25", String(item.output_expectations && item.output_expectations.frame_count)));
  checks.push(item.output_expectations && item.output_expectations.frame_size === FRAME_SIZE
    ? pass("frame_size", "Expected frame size is 256", "256")
    : fail("frame_size", "Expected frame size must be 256", String(item.output_expectations && item.output_expectations.frame_size)));
  checks.push(item.output_expectations &&
    item.output_expectations.sheet_size &&
    item.output_expectations.sheet_size.w === SHEET_SIZE.w &&
    item.output_expectations.sheet_size.h === SHEET_SIZE.h
    ? pass("sheet_size", "Expected sheet size is 1280x1280", "1280x1280")
    : fail("sheet_size", "Expected sheet size must be 1280x1280", JSON.stringify(item.output_expectations && item.output_expectations.sheet_size)));
  checks.push(target.sheet_path === `/img/moonpets/moonbot-pet-visor-v1-side/${id}.png` &&
    target.atlas_path === `/img/moonpets/moonbot-pet-visor-v1-side/${id}.json`
    ? pass("promotion_targets", "Public target paths are stable", `${target.sheet_path} / ${target.atlas_path}`)
    : fail("promotion_targets", `Public target paths must target ${id}.png/json`, `${target.sheet_path || "missing"} / ${target.atlas_path || "missing"}`));

  return checks;
}

function autospritePromptForItem(item) {
  return `${String(item.prompt || "")} ${String(item.negative_prompt || "")}`
    .replace(/\s+/g, " ")
    .trim();
}

function buildSpritesheetPayload(item) {
  const animation = { kind: item.animation_kind };
  if (item.custom_required === true || item.animation_kind === "custom") {
    animation.prompt = autospritePromptForItem(item);
    animation.name = item.display_name || item.id;
  }
  return {
    animations: [animation],
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
    const message = parsed && (parsed.message || parsed.code || parsed.error && parsed.error.message) || text || response.statusText;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pollDelayMs(pollCount) {
  if (pollCount === 1) return 5000;
  if (pollCount === 2) return 10000;
  if (pollCount === 3) return 15000;
  return 20000;
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
      console.log(`[side-scroller] job ${jobId} status=${status || "unknown"}`);
      if (["succeeded", "success", "completed", "complete"].includes(status)) {
        await writeJson(path.join(RAW_DIR, `job-${slug(jobId)}-succeeded.json`), job);
        return job;
      }
      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error(`AutoSprite job ${jobId} ended with status=${status}.`);
      }
    } catch (error) {
      console.warn(`[side-scroller] poll warning for ${jobId}: ${error.message}`);
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

async function fetchSpritesheetRecord({ apiKey, spritesheetId }) {
  return requestAutoSprite({
    urlPath: `/spritesheets/${encodeURIComponent(spritesheetId)}`,
    apiKey,
    rawName: `spritesheet-${slug(spritesheetId)}.json`
  });
}

async function resolveSpritesheetRecord({ apiKey, job, createResponse, item }) {
  const direct = candidateSpritesheetRecords(job)[0] || candidateSpritesheetRecords(createResponse)[0];
  if (direct) return { id: direct.id || direct.spriteSheetId || direct.spritesheetId || "embedded", record: direct };
  const ids = [...new Set([...findSpritesheetIds(job), ...findSpritesheetIds(createResponse)])];
  if (!ids.length) throw new Error(`No spritesheet id found in AutoSprite ${item.id} job response.`);
  const record = await fetchSpritesheetRecord({ apiKey, spritesheetId: ids[0] });
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
    throw new Error(`AutoSprite ${item.id} did not include a PNG sheet URL. Raw record saved to ${relative(rawPath)}.`);
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
    await writeJson(atlasPath, buildLocalAtlas({
      frameCount: item.output_expectations.frame_count,
      frameSize: item.output_expectations.frame_size,
      sheetSize: item.output_expectations.sheet_size
    }));
    atlasBytes = await assertOutput(atlasPath, "atlas");
    atlasSource = "generated_local";
    console.log(`[${item.id}] Atlas URL missing; generated local atlas.`);
  }

  console.log(`[${item.id}] completed spritesheet id=${spritesheetId}`);
  console.log(`[${item.id}] sheet URL field=${sheet.fieldName}`);
  console.log(`[${item.id}] atlas URL field=${atlas ? atlas.fieldName : "generated_local"}`);
  console.log(`[${item.id}] saved local PNG path=${relative(sheetPath)}`);
  console.log(`[${item.id}] saved local atlas path=${relative(atlasPath)}`);

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

function normalizeAtlasFrames(atlas) {
  if (!atlas || typeof atlas !== "object") return [];
  if (Array.isArray(atlas.frames)) return atlas.frames;
  if (atlas.frames && typeof atlas.frames === "object") {
    return Object.keys(atlas.frames)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => atlas.frames[key]);
  }
  return [];
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

async function reviewGeneratedOutput(item, record) {
  const checks = [];
  const sheetPath = repoPath(record.generated_sheet_path || `output/moonpets/side-scroller/${item.id}.png`);
  const atlasPath = repoPath(record.generated_atlas_path || `output/moonpets/side-scroller/${item.id}.json`);
  const sheetRelative = relative(sheetPath);
  const atlasRelative = relative(atlasPath);

  const sheetExists = await pathExists(sheetPath);
  const atlasExists = await pathExists(atlasPath);
  checks.push(sheetExists ? pass("png_exists", "PNG exists", sheetRelative) : fail("png_exists", "PNG missing", sheetRelative));
  checks.push(atlasExists ? pass("atlas_exists", "Atlas exists", atlasRelative) : fail("atlas_exists", "Atlas missing", atlasRelative));
  checks.push(record.id === item.id
    ? pass("requested_animation", "Output matches requested animation id", record.id)
    : fail("requested_animation", "Output must match requested animation id", record.id));

  let frames = [];
  let atlas = null;
  if (atlasExists) {
    try {
      atlas = await readJson(atlasPath);
      frames = normalizeAtlasFrames(atlas);
      checks.push(frames.length === FRAME_COUNT
        ? pass("frame_count", "Atlas has 25 frames", String(frames.length))
        : fail("frame_count", "Atlas must have 25 frames", String(frames.length)));
      checks.push(frames.every((frame) => frame && frame.w === FRAME_SIZE && frame.h === FRAME_SIZE)
        ? pass("frame_size", "Atlas frames are 256x256", "all frames")
        : fail("frame_size", "Atlas frames must be 256x256", "one or more frames differ"));
      const metaSize = atlas.meta && atlas.meta.size || {};
      checks.push(metaSize.w === SHEET_SIZE.w && metaSize.h === SHEET_SIZE.h
        ? pass("atlas_sheet_size", "Atlas sheet size is 1280x1280", `${metaSize.w}x${metaSize.h}`)
        : fail("atlas_sheet_size", "Atlas sheet size must be 1280x1280", `${metaSize.w || "?"}x${metaSize.h || "?"}`));
    } catch (error) {
      checks.push(fail("atlas_parse", "Atlas JSON parses", error.message));
    }
  }

  let imageStats = null;
  if (sheetExists) {
    try {
      const bytes = (await fs.stat(sheetPath)).size;
      checks.push(bytes > 50 * 1024
        ? pass("png_size", "PNG file is larger than 50KB", `${bytes} bytes`)
        : fail("png_size", "PNG file must be larger than 50KB", `${bytes} bytes`));
      imageStats = await checkImageOccupancy(sheetPath);
      checks.push(imageStats.width === SHEET_SIZE.w && imageStats.height === SHEET_SIZE.h
        ? pass("png_sheet_size", "PNG sheet size is 1280x1280", `${imageStats.width}x${imageStats.height}`)
        : fail("png_sheet_size", "PNG sheet size must be 1280x1280", `${imageStats.width}x${imageStats.height}`));
      checks.push(imageStats.nonTransparentRatio > 0.02
        ? pass("not_blank", "PNG is not blank or fully transparent", imageStats.nonTransparentRatio.toFixed(4))
        : fail("not_blank", "PNG appears blank or fully transparent", imageStats.nonTransparentRatio.toFixed(4)));
    } catch (error) {
      checks.push(fail("image_analysis", "Image analysis completed", error.message));
    }
  }

  const failed = checks.filter((check) => check.status === "fail");
  return {
    review_status: failed.length ? "fail" : "pass",
    checks,
    output_png_path: sheetRelative,
    output_atlas_path: atlasRelative,
    frame_count: frames.length || null,
    frame_size: FRAME_SIZE,
    sheet_size: imageStats ? { w: imageStats.width, h: imageStats.height } : SHEET_SIZE,
    image_stats: imageStats
  };
}

async function writeManifest(entry) {
  let manifest = { generated_at: new Date().toISOString(), sideScrollerAnimations: [] };
  try {
    manifest = await readJson(MANIFEST_PATH);
    if (!Array.isArray(manifest.sideScrollerAnimations)) manifest.sideScrollerAnimations = [];
  } catch {
    // First side-scroller manifest.
  }
  manifest.generated_at = new Date().toISOString();
  manifest.sideScrollerAnimations = manifest.sideScrollerAnimations.filter((record) => record.id !== entry.id);
  manifest.sideScrollerAnimations.push(entry);
  await writeJson(MANIFEST_PATH, manifest);
  return manifest;
}

async function generateSideScrollerAnimation(options) {
  const queue = await readJson(options.queuePath);
  const item = findQueueItem(queue, options.id);
  const setupChecks = validateItem(item, options.id);
  const setupFailed = setupChecks.filter((check) => check.status === "fail");
  if (setupFailed.length) {
    const entry = {
      id: options.id,
      status: "failed",
      generation_status: "not_run",
      review_status: "fail",
      checks: setupChecks,
      reason: setupFailed.map((check) => check.detail || check.label).join("; "),
      created_at: new Date().toISOString()
    };
    await writeManifest(entry);
    throw new Error(entry.reason);
  }

  const payload = buildSpritesheetPayload(item);
  if (options.dryRun || !options.execute) {
    const entry = {
      id: item.id,
      role: item.role,
      source_character_name: item.source_character_name,
      generation_status: "dry_run",
      review_status: "pass",
      dry_run_status: "pass",
      approved: false,
      promoted: false,
      visual_review_required: true,
      prompt: item.prompt,
      negative_prompt: item.negative_prompt,
      request_payload: payload,
      output_png_path: relative(path.join(OUTPUT_DIR, `${item.id}.png`)),
      output_atlas_path: relative(path.join(OUTPUT_DIR, `${item.id}.json`)),
      public_target: item.promotion_target,
      frame_count: item.output_expectations.frame_count,
      frame_size: item.output_expectations.frame_size,
      sheet_size: item.output_expectations.sheet_size,
      checks: setupChecks,
      created_at: new Date().toISOString()
    };
    await writeManifest(entry);
    console.log(`Dry-run side-scroller animation ${item.id}`);
    console.log(JSON.stringify({
      id: item.id,
      source_character_name: item.source_character_name,
      request_payload: payload,
      prompt: item.prompt,
      negative_prompt: item.negative_prompt,
      output: {
        png: entry.output_png_path,
        atlas: entry.output_atlas_path
      }
    }, null, 2));
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
  if (workflows.length !== 1) throw new Error(`Expected exactly one ${item.id} workflow, received ${workflows.length}.`);
  const jobId = workflows[0].jobId || workflows[0].job_id;
  if (!jobId) throw new Error(`AutoSprite ${item.id} workflow did not include jobId.`);

  const job = await pollJob({ apiKey, jobId, timeoutMs: options.pollTimeoutMs });
  const { id: spritesheetId, record: spritesheetRecord } = await resolveSpritesheetRecord({ apiKey, job, createResponse, item });
  const paths = await saveDownloads({ item, spritesheetId, spritesheetRecord });
  const entry = {
    id: item.id,
    role: item.role,
    source_character_name: item.source_character_name,
    generation_status: "generated_pending_review",
    review_status: "not_run",
    approved: false,
    promoted: false,
    visual_review_required: true,
    animation_kind: item.animation_kind,
    prompt: item.prompt,
    negative_prompt: item.negative_prompt,
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

  if (options.review) {
    const review = await reviewGeneratedOutput(item, entry);
    entry.review_status = review.review_status;
    entry.status = review.review_status === "pass" ? "mechanically_passed" : "rejected_pending_regeneration";
    entry.checks = [...setupChecks, ...review.checks];
    entry.output_png_path = review.output_png_path;
    entry.output_atlas_path = review.output_atlas_path;
    entry.frame_count = review.frame_count || entry.frame_count;
    entry.frame_size = review.frame_size || entry.frame_size;
    entry.sheet_size = review.sheet_size || entry.sheet_size;
    entry.image_stats = review.image_stats;
  } else {
    entry.status = "generated_pending_review";
    entry.checks = setupChecks;
  }

  await writeManifest(entry);
  console.log(`Generated side-scroller ${item.id} -> ${entry.generated_sheet_path}`);
  console.log(`Review status: ${entry.review_status}`);
  return entry;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entry = await generateSideScrollerAnimation(options);
  if (entry.review_status === "fail") process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  validateItem,
  buildSpritesheetPayload,
  generateSideScrollerAnimation,
  reviewGeneratedOutput,
  normalizeAtlasFrames,
  SIDE_SEQUENCE
};
