#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const {
  extractDownloadTargets,
  collectUrlCandidates,
  buildLocalAtlas
} = require("./generate-moonpet-assets");

const REPO_ROOT = path.resolve(__dirname, "..");
const API_BASE_URL = "https://www.autosprite.io/api/v1";
const REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");
const OUTPUT_DIR = path.join(REPO_ROOT, "output", "moonpets", "botty-front");
const MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "botty-front-existing-sheets.generated.json");
const RAW_DIR = path.join(REPO_ROOT, "output", "manifests", "autosprite", "botty-front-existing");
const CONTACT_SHEET_PATH = path.join(OUTPUT_DIR, "contact-sheet.png");
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
  "front_battle"
];

function parseArgs(argv) {
  const options = {
    characterName: DEFAULT_CHARACTER_NAME,
    characterId: "",
    registryPath: REGISTRY_PATH,
    animation: "",
    limit: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--character-name") options.characterName = argv[++index];
    else if (arg.startsWith("--character-name=")) options.characterName = arg.slice("--character-name=".length);
    else if (arg === "--character-id") options.characterId = argv[++index];
    else if (arg.startsWith("--character-id=")) options.characterId = arg.slice("--character-id=".length);
    else if (arg === "--registry") options.registryPath = path.resolve(argv[++index]);
    else if (arg.startsWith("--registry=")) options.registryPath = path.resolve(arg.slice("--registry=".length));
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
  if (!Number.isFinite(options.limit) || options.limit <= 0) options.limit = null;
  return options;
}

function printHelp() {
  console.log(`Download existing BOTTY front-facing AutoSprite sheets.

Usage:
  node scripts/download-botty-front-animations.js --character-name BOTTY --character-id cmuh1eo4p000113f3alnoim0v

This script lists existing AutoSprite spritesheets and downloads one exact front_* match
per required action. It never creates or regenerates character art.
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

function selectedAnimations(options) {
  let animations = FRONT_ANIMATIONS;
  if (options.animation) {
    if (!FRONT_ANIMATIONS.includes(options.animation)) throw new Error(`Unknown BOTTY front animation: ${options.animation}`);
    animations = [options.animation];
  }
  if (options.limit) animations = animations.slice(0, options.limit);
  return animations;
}

async function resolveCharacterId(options) {
  if (options.characterId) return options.characterId;
  const registry = await readJsonIfExists(options.registryPath, {});
  const registered = registry[options.characterName] || registry[options.characterName.toUpperCase()];
  if (registered && registered.active !== false && registered.character_id) return String(registered.character_id);
  throw new Error(`No AutoSprite character id found for "${options.characterName}".`);
}

async function requestAutoSprite({ urlPath, apiKey, rawName }) {
  const response = await fetch(`${API_BASE_URL}${urlPath}`, {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    }
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
    throw new Error(`AutoSprite GET ${urlPath} failed HTTP ${response.status}: ${message}`);
  }
  return parsed;
}

function extractList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  const candidates = [
    value && value.spritesheets,
    value && value.spriteSheets,
    value && value.data,
    value && value.data && value.data.spritesheets,
    value && value.data && value.data.spriteSheets,
    value && value.result,
    value && value.result && value.result.spritesheets,
    value && value.result && value.result.spriteSheets,
    value && value.items,
    value && value.results
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(Boolean);
  }
  return [];
}

async function listSpritesheets(apiKey, characterId) {
  const endpoints = [
    `/characters/${encodeURIComponent(characterId)}/spritesheets?limit=100`,
    `/characters/${encodeURIComponent(characterId)}/spritesheets`,
    `/spritesheets?characterId=${encodeURIComponent(characterId)}&limit=100`,
    `/spritesheets?character_id=${encodeURIComponent(characterId)}&limit=100`
  ];
  const recordsById = new Map();
  const errors = [];

  for (let index = 0; index < endpoints.length; index += 1) {
    try {
      const response = await requestAutoSprite({
        urlPath: endpoints[index],
        apiKey,
        rawName: `list-${index + 1}.json`
      });
      for (const record of extractList(response)) {
        const id = spritesheetId(record) || `${recordsById.size + 1}`;
        if (!recordsById.has(id)) recordsById.set(id, record);
      }
    } catch (error) {
      errors.push({ endpoint: endpoints[index], message: error.message });
    }
  }

  await writeJson(path.join(RAW_DIR, "list-endpoint-summary.json"), {
    character_id: characterId,
    endpoint_count: endpoints.length,
    found_count: recordsById.size,
    errors
  });

  if (!recordsById.size) {
    throw new Error(`No existing AutoSprite spritesheets were listed for ${characterId}. Endpoint errors saved to ${relative(path.join(RAW_DIR, "list-endpoint-summary.json"))}.`);
  }
  return Array.from(recordsById.values());
}

function spritesheetId(record) {
  return record && (record.id || record.spriteSheetId || record.spritesheetId || record.spritesheet_id);
}

function statusValue(record) {
  return String(record && (record.status || record.state || record.phase || record.jobStatus || "") || "").toLowerCase();
}

function isComplete(record) {
  const status = statusValue(record);
  return !status || ["succeeded", "success", "completed", "complete", "ready", "done"].includes(status);
}

function collectStrings(value, strings = []) {
  if (value === null || value === undefined) return strings;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    strings.push(String(value));
    return strings;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, strings));
    return strings;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      strings.push(key);
      collectStrings(child, strings);
    });
  }
  return strings;
}

function recordMatchesAnimation(record, animationId) {
  const values = collectStrings(record).map((value) => value.toLowerCase());
  return values.some((value) => value === animationId || value.includes(animationId));
}

function recordTimestamp(record) {
  const values = [
    record.updatedAt,
    record.updated_at,
    record.createdAt,
    record.created_at,
    record.completedAt,
    record.completed_at
  ];
  for (const value of values) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

async function fetchSpritesheetDetail({ apiKey, record, animationId }) {
  const id = spritesheetId(record);
  if (!id) return record;
  try {
    const detail = await requestAutoSprite({
      urlPath: `/spritesheets/${encodeURIComponent(id)}`,
      apiKey,
      rawName: `${animationId}-spritesheet-${slug(id)}.json`
    });
    return detail || record;
  } catch (error) {
    await writeJson(path.join(RAW_DIR, `${animationId}-spritesheet-${slug(id)}-detail-error.json`), {
      spritesheet_id: id,
      message: error.message
    });
    return record;
  }
}

function frameCountFromAtlas(atlas) {
  if (!atlas || typeof atlas !== "object") return null;
  if (Array.isArray(atlas.frames)) return atlas.frames.length;
  if (atlas.frames && typeof atlas.frames === "object") return Object.keys(atlas.frames).length;
  return null;
}

function frameSizeFromAtlas(atlas) {
  const frameSource = Array.isArray(atlas && atlas.frames) ? atlas.frames[0] : atlas && atlas.frames && Object.values(atlas.frames)[0];
  const frame = frameSource && (frameSource.frame || frameSource);
  if (frame && Number(frame.w) > 0 && Number(frame.h) > 0) return { w: Number(frame.w), h: Number(frame.h) };
  const metaSize = atlas && atlas.meta && atlas.meta.frame_size;
  if (metaSize && Number(metaSize.w) > 0 && Number(metaSize.h) > 0) return { w: Number(metaSize.w), h: Number(metaSize.h) };
  return null;
}

function firstNumber(record, keys) {
  const stack = [record];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => stack.push(item));
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      if (keys.includes(key) && Number(child) > 0) return Number(child);
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}

async function downloadFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed HTTP ${response.status}: ${url}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

async function readAtlasOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function saveExistingSheet({ apiKey, animationId, record }) {
  const detail = await fetchSpritesheetDetail({ apiKey, record, animationId });
  const targets = extractDownloadTargets(detail);
  const png = targets.find((target) => target.kind === "png");
  const atlas = targets.find((target) => target.kind === "atlas");
  const id = spritesheetId(detail) || spritesheetId(record);

  if (!png) {
    await writeJson(path.join(RAW_DIR, `${animationId}-missing-download-urls.json`), {
      animation_id: animationId,
      spritesheet_id: id,
      candidate_urls: collectUrlCandidates(detail),
      record: detail
    });
    throw new Error(`${animationId} has no downloadable PNG URL in AutoSprite record ${id || "(id unavailable)"}.`);
  }

  const pngPath = path.join(OUTPUT_DIR, `${animationId}.png`);
  const atlasPath = path.join(OUTPUT_DIR, `${animationId}.json`);
  await downloadFile(png.url, pngPath);
  const pngStats = await fs.stat(pngPath);
  if (pngStats.size <= 10 * 1024) throw new Error(`${relative(pngPath)} is too small (${pngStats.size} bytes).`);

  let atlasJson = null;
  let atlasSource = "downloaded";
  if (atlas) {
    await downloadFile(atlas.url, atlasPath);
    atlasJson = await readAtlasOrNull(atlasPath);
  } else {
    const frameCount = firstNumber(detail, ["frameCount", "frame_count", "framesCount", "frames_count"]);
    const frameSize = firstNumber(detail, ["frameSize", "frame_size", "size"]);
    if (!frameCount || !frameSize) {
      throw new Error(`${animationId} did not include an atlas or usable frame count/frame size metadata; refusing to invent frame data.`);
    }
    const metadata = await sharp(pngPath).metadata();
    atlasJson = buildLocalAtlas({ frameCount, frameSize, sheetSize: { w: metadata.width, h: metadata.height } });
    await writeJson(atlasPath, atlasJson);
    atlasSource = "generated_from_autosprite_metadata";
  }

  const metadata = await sharp(pngPath).metadata();
  const alpha = await sharp(pngPath).ensureAlpha().raw().toBuffer();
  let nonTransparent = 0;
  for (let index = 3; index < alpha.length; index += 4) {
    if (alpha[index] > 8) nonTransparent += 1;
  }
  const nonTransparentRatio = nonTransparent / (metadata.width * metadata.height);
  if (nonTransparentRatio <= 0.02) throw new Error(`${animationId} appears blank (${nonTransparentRatio.toFixed(4)} non-transparent pixels).`);

  const frameCount = frameCountFromAtlas(atlasJson) || firstNumber(detail, ["frameCount", "frame_count", "framesCount", "frames_count"]);
  const frameSize = frameSizeFromAtlas(atlasJson);
  if (!frameCount) throw new Error(`${animationId} downloaded but frame count could not be determined.`);

  return {
    id: animationId,
    character_name: DEFAULT_CHARACTER_NAME,
    source: "AutoSprite API",
    provenance: "existing AutoSprite spritesheet download; no generation request was made",
    review_status: "downloaded_pending_visual_review",
    autosprite_spritesheet_id: id || null,
    autosprite_status: statusValue(detail) || null,
    autosprite_updated_at: detail.updatedAt || detail.updated_at || null,
    autosprite_created_at: detail.createdAt || detail.created_at || null,
    output_png_path: relative(pngPath),
    output_atlas_path: relative(atlasPath),
    frame_count: frameCount,
    frame_size: frameSize,
    sheet_size: { w: metadata.width, h: metadata.height },
    image_stats: {
      width: metadata.width,
      height: metadata.height,
      hasAlpha: Boolean(metadata.hasAlpha),
      nonTransparentRatio
    },
    downloads: [
      { kind: "png", path: relative(pngPath), bytes: pngStats.size, fieldName: png.fieldName },
      { kind: "atlas", path: relative(atlasPath), fieldName: atlas ? atlas.fieldName : atlasSource, generatedLocal: !atlas }
    ]
  };
}

function pickRecord(records, animationId) {
  const matches = records
    .filter((record) => isComplete(record) && recordMatchesAnimation(record, animationId))
    .sort((a, b) => recordTimestamp(b) - recordTimestamp(a));
  if (!matches.length) throw new Error(`No complete existing AutoSprite spritesheet matched "${animationId}".`);
  return { record: matches[0], candidates: matches.map((record) => ({
    id: spritesheetId(record) || null,
    status: statusValue(record) || null,
    timestamp: recordTimestamp(record),
    created_at: record.createdAt || record.created_at || null,
    updated_at: record.updatedAt || record.updated_at || null
  })) };
}

async function buildContactSheet(entries) {
  const tileW = 240;
  const tileH = 210;
  const labelH = 38;
  const columns = 5;
  const rows = Math.ceil(entries.length / columns);
  const width = columns * tileW;
  const height = rows * tileH;
  const composites = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const left = (index % columns) * tileW;
    const top = Math.floor(index / columns) * tileH;
    const pngPath = path.join(REPO_ROOT, entry.output_png_path);
    const image = await sharp(pngPath).resize({ width: tileW, height: tileH - labelH, fit: "contain", background: { r: 24, g: 27, b: 33, alpha: 1 } }).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#181b21"/><text x="12" y="24" fill="#f3f5f7" font-family="Arial, sans-serif" font-size="16">${entry.id}</text></svg>`);
    composites.push({ input: image, left, top });
    composites.push({ input: label, left, top: top + tileH - labelH });
  }

  await fs.mkdir(path.dirname(CONTACT_SHEET_PATH), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: { r: 14, g: 16, b: 20, alpha: 1 } } })
    .composite(composites)
    .png()
    .toFile(CONTACT_SHEET_PATH);
}

async function downloadBottyFrontAnimations(options) {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required to download AutoSprite outputs.");
  const characterId = await resolveCharacterId(options);
  const records = await listSpritesheets(apiKey, characterId);
  const animations = selectedAnimations(options);
  const entries = [];
  const matchCandidates = {};

  for (const animationId of animations) {
    const match = pickRecord(records, animationId);
    matchCandidates[animationId] = match.candidates;
    entries.push(await saveExistingSheet({ apiKey, animationId, record: match.record }));
    console.log(`Downloaded existing ${animationId} -> ${entries[entries.length - 1].output_png_path}`);
  }

  await buildContactSheet(entries);
  const manifest = {
    generated_at: new Date().toISOString(),
    source: "AutoSprite API",
    mode: "download-existing",
    character_name: options.characterName,
    character_id: characterId,
    required_animations: animations,
    contact_sheet_path: relative(CONTACT_SHEET_PATH),
    animations: entries.map((entry) => ({ ...entry, character_name: options.characterName, character_id: characterId })),
    match_candidates: matchCandidates
  };
  await writeJson(MANIFEST_PATH, manifest);
  console.log(`Existing BOTTY front manifest written to ${relative(MANIFEST_PATH)}`);
  console.log(`Contact sheet written to ${relative(CONTACT_SHEET_PATH)}`);
  return manifest;
}

async function main() {
  await downloadBottyFrontAnimations(parseArgs(process.argv.slice(2)));
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
  downloadBottyFrontAnimations
};
