#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const TRAITS_PATH = path.join(REPO_ROOT, "data", "moonpet-traits.json");
const MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-assets.generated.json");
const CHARACTER_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "autosprite-characters.generated.json");
const JOB_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "autosprite-jobs.generated.json");
const SPRITESHEET_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-spritesheets.generated.json");
const SANDBOX_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-animation-sandbox.generated.json");
const APPROVED_ASSETS_PATH = path.join(REPO_ROOT, "data", "moonpet-approved-assets.json");
const ERROR_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "autosprite-errors.generated.json");
const RAW_RESPONSE_DIR = path.join(REPO_ROOT, "output", "manifests", "autosprite");
const POLL_ERROR_DIR = path.join(RAW_RESPONSE_DIR, "poll-errors");
const EXISTING_CHARACTER_PATH = path.join(RAW_RESPONSE_DIR, "existing-character-moonbot-pet.json");
const SPRITESHEET_OUTPUT_DIR = path.join(REPO_ROOT, "output", "moonpets", "spritesheets");
const API_BASE_URL = "https://www.autosprite.io/api/v1";
const DEFAULT_SPRITESHEET_ANIMATIONS = ["iso_idle_down"];
const AUTOSPRITE_PROMPT_LIMIT = 600;
const AUTOSPRITE_PROMPT_TARGET = 450;
const DUPLICATE_CHARACTER_CODE = "DUPLICATE_CHARACTER";

const OUTPUT_FOLDERS = [
  "output/moonpets/base",
  "output/moonpets/skins",
  "output/moonpets/faces",
  "output/moonpets/headwear",
  "output/moonpets/accessories",
  "output/moonpets/elements",
  "output/moonpets/frames",
  "output/moonpets/spritesheets",
  "output/manifests",
  "output/manifests/autosprite",
  "output/manifests/autosprite/poll-errors"
];

function parseArgs(argv) {
  const options = {
    dryRun: true,
    execute: false,
    resume: true,
    phase: "dry-run",
    limit: null,
    rateLimitMs: null,
    pollIntervalMs: 5000,
    pollTimeoutMs: 10 * 60 * 1000,
    traitsPath: TRAITS_PATH,
    debugPayload: false,
    resumeJobs: false,
    animationKind: null,
    forceApproved: false,
    sandboxManifestPath: SANDBOX_MANIFEST_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--execute") {
      options.execute = true;
      options.dryRun = false;
    } else if (arg === "--no-resume") options.resume = false;
    else if (arg === "--resume") options.resume = true;
    else if (arg === "--phase") options.phase = argv[++index] || options.phase;
    else if (arg.startsWith("--phase=")) options.phase = arg.slice("--phase=".length);
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--rate-limit-ms") options.rateLimitMs = Number(argv[++index]);
    else if (arg.startsWith("--rate-limit-ms=")) options.rateLimitMs = Number(arg.slice("--rate-limit-ms=".length));
    else if (arg === "--poll-interval-ms") options.pollIntervalMs = Number(argv[++index]);
    else if (arg.startsWith("--poll-interval-ms=")) options.pollIntervalMs = Number(arg.slice("--poll-interval-ms=".length));
    else if (arg === "--poll-timeout-ms") options.pollTimeoutMs = Number(argv[++index]);
    else if (arg.startsWith("--poll-timeout-ms=")) options.pollTimeoutMs = Number(arg.slice("--poll-timeout-ms=".length));
    else if (arg === "--traits") options.traitsPath = path.resolve(argv[++index]);
    else if (arg === "--animation") options.animationKind = argv[++index] || null;
    else if (arg.startsWith("--animation=")) options.animationKind = arg.slice("--animation=".length);
    else if (arg === "--debug-payload") options.debugPayload = true;
    else if (arg === "--force-approved") options.forceApproved = true;
    else if (arg === "--sandbox-manifest") {
      const next = argv[index + 1];
      options.sandboxManifestPath = next && !next.startsWith("--") ? path.resolve(argv[++index]) : SANDBOX_MANIFEST_PATH;
    }
    else if (arg.startsWith("--sandbox-manifest=")) options.sandboxManifestPath = path.resolve(arg.slice("--sandbox-manifest=".length));
    else if (arg === "--resume-jobs") {
      options.resumeJobs = true;
      options.execute = true;
      options.dryRun = false;
      if (options.phase === "dry-run") options.phase = "test";
    }
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.execute && options.phase !== "test") {
    throw new Error("Real AutoSprite generation is locked to --phase=test for the Moonbot base asset workflow.");
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) options.limit = null;
  if (!Number.isFinite(options.rateLimitMs) || options.rateLimitMs < 0) options.rateLimitMs = null;
  if (!Number.isFinite(options.pollIntervalMs) || options.pollIntervalMs <= 0) options.pollIntervalMs = 5000;
  if (!Number.isFinite(options.pollTimeoutMs) || options.pollTimeoutMs <= 0) options.pollTimeoutMs = 10 * 60 * 1000;

  return options;
}

function printHelp() {
  console.log(`Moonpet Art Factory

Usage:
  node scripts/generate-moonpet-assets.js --dry-run
  node scripts/generate-moonpet-assets.js --phase=test --execute

Options:
  --dry-run              Build the Moonbot base spritesheet plan without calling AutoSprite. Default.
  --execute              Call AutoSprite. Only allowed with --phase=test.
  --phase <name>         Phase to generate. Initial real phase is "test".
  --resume / --no-resume Reuse saved character/job IDs where possible. Resume is on by default.
  --limit <n>            Cap character count. Use --limit 1 for a single-character smoke run.
  --rate-limit-ms <n>    Delay between character pipelines.
  --poll-interval-ms <n> Legacy option; polling now uses 5s, 10s, 15s, then 20s.
  --poll-timeout-ms <n>  Max time to poll one spritesheet job. Default 600000.
  --traits <path>        Alternate moonpet trait JSON path.
  --animation <kind>     Override autosprite_test_animations for this run. One animation only.
  --debug-payload        Print sanitized AutoSprite request bodies, never headers.
  --force-approved       Allow overwriting an approved output. Default protects approved files.
  --sandbox-manifest [path]
                         Write the animation sandbox manifest. Default output/manifests/moonpet-animation-sandbox.generated.json.
  --resume-jobs          Poll existing job IDs from output/manifests/autosprite-jobs.generated.json.
`);
}

async function ensureFolders() {
  await Promise.all(
    OUTPUT_FOLDERS.map((folder) => fs.mkdir(path.join(REPO_ROOT, folder), { recursive: true }))
  );
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath, fallback) {
  if (!(await pathExists(filePath))) return fallback;
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function sleep(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildCompressedPrompt(skin) {
  const fallback = `${skin.name} Moonpet bot mascot, cute glossy cyber toy style, clean full-body front view, transparent background, no text.`;
  const prompt = compactWhitespace(skin.autospritePrompt || fallback);
  if (prompt.length <= AUTOSPRITE_PROMPT_TARGET) return prompt;

  const sentences = prompt.split(/(?<=[.!?])\s+/);
  let compressed = "";
  for (const sentence of sentences) {
    const next = compactWhitespace(`${compressed} ${sentence}`);
    if (next.length > AUTOSPRITE_PROMPT_TARGET) break;
    compressed = next;
  }

  return compressed || prompt.slice(0, AUTOSPRITE_PROMPT_TARGET).replace(/\s+\S*$/, "").trim();
}

function autospriteName(displayName, styleVersion) {
  const cleanName = compactWhitespace(displayName);
  const cleanVersion = compactWhitespace(styleVersion);
  if (!cleanVersion) return cleanName;
  return cleanName.toLowerCase().endsWith(cleanVersion.toLowerCase())
    ? cleanName
    : `${cleanName} ${cleanVersion}`;
}

function nextStyleVersionName(currentName) {
  const match = compactWhitespace(currentName).match(/^(.*?)(\d+)$/);
  if (!match) return `${currentName} V2`;
  return `${match[1]}${Number(match[2]) + 1}`;
}

function validateCharacterPrompt(character) {
  if (character.prompt.length > AUTOSPRITE_PROMPT_LIMIT) {
    throw new Error(
      `AutoSprite prompt too long for ${character.name}: ${character.prompt.length} characters. Limit is ${AUTOSPRITE_PROMPT_LIMIT}.`
    );
  }
}

function getSpriteSheetAnimations(traits, options = {}) {
  if (options.animationKind) {
    return [{ kind: options.animationKind }];
  }
  if (Array.isArray(traits.autosprite_test_animations) && traits.autosprite_test_animations.length > 0) {
    return traits.autosprite_test_animations.map((animation) => ({ kind: animation.kind || animation }));
  }
  if (Array.isArray(traits.autospriteAnimations) && traits.autospriteAnimations.length > 0) {
    return traits.autospriteAnimations.map((animation) => ({ kind: animation.kind || animation }));
  }
  return DEFAULT_SPRITESHEET_ANIMATIONS.map((kind) => ({ kind }));
}

function buildCharacterPlan(traits, options) {
  const animations = getSpriteSheetAnimations(traits, options);
  if (animations.length !== 1) {
    throw new Error("Moonpet base tests must request exactly one animation per run. Use --animation KIND to override.");
  }
  const spritesheetSettings = traits.spritesheetGeneration && traits.spritesheetGeneration.test
    ? traits.spritesheetGeneration.test
    : { videoTier: "turbo", frameCount: 25, frameSize: 256, removeBg: "ultra" };
  const phaseSkins = traits.skins.filter((skin) => options.phase === "dry-run" || skin.phase === options.phase);
  const skins = traits.use_existing_autosprite_character
    ? phaseSkins.filter((skin) => skin.id === "default_white_moonpet")
    : phaseSkins;
  const characters = skins.map((skin) => {
    const prompt = buildCompressedPrompt(skin);
    const usesExistingCharacter = Boolean(traits.use_existing_autosprite_character && skin.id === "default_white_moonpet");
    const characterName = usesExistingCharacter
      ? traits.existing_autosprite_character_name
      : autospriteName(skin.name, traits.style_version);
    return {
      id: slug(skin.id),
      name: skin.name,
      autospriteName: characterName,
      usesExistingAutoSpriteCharacter: usesExistingCharacter,
      phase: skin.phase,
      skin: skin.id,
      prompt,
      localDescription: skin.description,
      promptLength: prompt.length,
      animations,
      spritesheetSettings,
      gameActionMapping: traits.gameActionMapping
    };
  });

  const limited = options.limit ? characters.slice(0, options.limit) : characters;
  if (limited.length > 3) {
    throw new Error(`Refusing to plan ${limited.length} characters. Initial AutoSprite batch limit is 3.`);
  }

  return limited;
}

function buildResumeJobPlan(jobManifest, traits, options) {
  const jobs = Array.isArray(jobManifest.jobs) ? jobManifest.jobs : [];
  const limitedJobs = options.limit ? jobs.slice(0, options.limit) : jobs;
  const skinsById = new Map((traits.skins || []).map((skin) => [skin.id, skin]));
  const spritesheetSettings = traits.spritesheetGeneration && traits.spritesheetGeneration.test
    ? traits.spritesheetGeneration.test
    : { videoTier: "turbo", frameCount: 25, frameSize: 256, removeBg: "ultra" };

  return limitedJobs.map((job) => {
    const skin = skinsById.get(job.skin) || {};
    const prompt = buildCompressedPrompt({ ...skin, name: job.name || job.localId || job.jobId });
    const characterName = job.autospriteName || autospriteName(job.name || job.localId || job.jobId, traits.style_version);
    return {
      id: slug(job.localId || job.skin || job.name || job.jobId),
      name: job.name || job.localId || job.jobId,
      autospriteName: characterName,
      phase: "test",
      skin: job.skin || job.localId,
      prompt,
      localDescription: skin.description || "Resumed AutoSprite spritesheet job.",
      promptLength: prompt.length,
      animations: (options.animationKind ? [{ kind: options.animationKind }] : job.animations || getSpriteSheetAnimations(traits, options)).map((animation) =>
        typeof animation === "string" ? { kind: animation } : animation
      ),
      spritesheetSettings,
      gameActionMapping: traits.gameActionMapping,
      characterId: job.characterId,
      jobId: job.jobId,
      workflowKind: job.kind,
      videoId: job.videoId,
      resumeJobOnly: true
    };
  });
}

function approvedAssetKey(localId, kind, role) {
  return `${localId}::${kind}::${role}`;
}

function normalizeApprovedAsset(asset) {
  const animationKind = asset.animation_kind || asset.kind || null;
  const localId = asset.local_id || asset.localId || null;
  return {
    ...asset,
    localId,
    local_id: localId,
    characterName: asset.character_name || asset.characterName || asset.autospriteName || null,
    character_name: asset.character_name || asset.characterName || asset.autospriteName || null,
    sourceCharacterName: asset.source_character_name || asset.sourceCharacterName || asset.character_name || asset.characterName || asset.autospriteName || null,
    source_character_name: asset.source_character_name || asset.sourceCharacterName || asset.character_name || asset.characterName || asset.autospriteName || null,
    animationKind,
    animation_kind: animationKind,
    kind: animationKind,
    frameCount: asset.frame_count || asset.frameCount || null,
    frame_count: asset.frame_count || asset.frameCount || null,
    frameSize: asset.frame_size || asset.frameSize || null,
    frame_size: asset.frame_size || asset.frameSize || null,
    sheetSize: asset.sheet_size || asset.sheetSize || null,
    sheet_size: asset.sheet_size || asset.sheetSize || null,
    sheet_path: asset.sheet_path || null,
    atlas_path: asset.atlas_path || null
  };
}

function getApprovedAssets(approvedManifest) {
  const assets = Array.isArray(approvedManifest.assets) ? approvedManifest.assets : [];
  return assets.map(normalizeApprovedAsset).filter((asset) => asset && asset.approved === true);
}

function getRejectedAssets(approvedManifest) {
  const rejected = Array.isArray(approvedManifest.rejected) ? approvedManifest.rejected : [];
  return rejected.map((asset) => ({
    ...asset,
    character_name: asset.character_name || asset.characterName || null,
    animation_kind: asset.animation_kind || asset.kind || null,
    rejected: asset.rejected === true
  })).filter((asset) => asset.rejected === true);
}

function findApprovedAssetFor(character, animationKind, approvedAssets) {
  return approvedAssets.find((asset) =>
    asset.approved === true &&
    asset.character_name === character.autospriteName &&
    asset.animation_kind === animationKind
  ) || null;
}

function findRejectedAssetFor(character, animationKind, rejectedAssets) {
  return rejectedAssets.find((asset) =>
    asset.rejected === true &&
    asset.character_name === character.autospriteName &&
    asset.animation_kind === animationKind
  ) || null;
}

function assertNoRejectedAnimations(characters, rejectedAssets) {
  for (const character of characters) {
    for (const animation of character.animations) {
      const rejected = findRejectedAssetFor(character, animation.kind, rejectedAssets);
      if (rejected) {
        throw new Error(
          `Animation ${animation.kind} is rejected for ${character.autospriteName}: ${rejected.reason || "rejected by Moonpet approved asset registry"}.`
        );
      }
    }
  }
}

function applyApprovedLocks(characters, approvedManifest, options = {}) {
  const approvedAssets = getApprovedAssets(approvedManifest);
  if (approvedAssets.length === 0) return characters;

  return characters.map((character) => {
    const requestedKinds = character.animations.map((animation) => animation.kind);
    const approvedOutputs = approvedAssets.filter((asset) => asset.character_name === character.autospriteName);
    const approvedRequested = requestedKinds
      .map((kind) => findApprovedAssetFor(character, kind, approvedAssets))
      .filter(Boolean);
    const allRequestedApproved = !options.forceApproved && requestedKinds.length > 0 && approvedRequested.length === requestedKinds.length;

    return {
      ...character,
      approvedOutputs,
      approved: allRequestedApproved,
      role: allRequestedApproved ? approvedRequested[0].role : character.role,
      approvedKind: allRequestedApproved ? approvedRequested[0].animation_kind : null,
      approvedManifestKey: allRequestedApproved
        ? approvedAssetKey(approvedRequested[0].local_id, approvedRequested[0].animation_kind, approvedRequested[0].role)
        : null,
      skipGeneration: allRequestedApproved,
      skipReason: allRequestedApproved ? "approved_output_locked" : null
    };
  });
}

function validateCharacterPrompts(characters) {
  for (const character of characters) {
    validateCharacterPrompt(character);
  }
}

function buildCreateCharacterBody(character) {
  validateCharacterPrompt(character);
  return {
    name: character.autospriteName,
    prompt: character.prompt
  };
}

function buildCreateSpritesheetBody(character) {
  return {
    animations: character.animations,
    ...character.spritesheetSettings
  };
}

function safeStringify(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseResponseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pickErrorValue(parsed, key) {
  if (!parsed || typeof parsed !== "object") return null;
  const error = parsed.error && typeof parsed.error === "object" ? parsed.error : null;
  return parsed[key] ?? (error ? error[key] : undefined) ?? null;
}

function buildAutoSpriteErrorDetails(response, bodyText, parsedBody) {
  const firstArrayError =
    parsedBody &&
    Array.isArray(parsedBody.errors) &&
    parsedBody.errors.length > 0 &&
    typeof parsedBody.errors[0] === "object"
      ? parsedBody.errors[0]
      : null;

  const code = pickErrorValue(parsedBody, "code") ?? pickErrorValue(firstArrayError, "code") ?? null;
  const message =
    pickErrorValue(parsedBody, "message") ??
    pickErrorValue(parsedBody, "error_description") ??
    pickErrorValue(firstArrayError, "message") ??
    safeStringify(parsedBody && parsedBody.error) ??
    bodyText;
  const details =
    pickErrorValue(parsedBody, "details") ??
    pickErrorValue(parsedBody, "detail") ??
    pickErrorValue(firstArrayError, "details") ??
    pickErrorValue(firstArrayError, "detail") ??
    null;

  return {
    status: response.status,
    statusText: response.statusText || "",
    code: safeStringify(code),
    message: safeStringify(message),
    details: safeStringify(details),
    bodyText,
    parsedBody
  };
}

function formatAutoSpriteError(details) {
  const parts = [`HTTP ${details.status}${details.statusText ? ` ${details.statusText}` : ""}`];
  if (details.code) parts.push(`code=${details.code}`);
  if (details.message) parts.push(`message=${details.message}`);
  if (details.details) parts.push(`details=${details.details}`);
  return parts.join(" | ");
}

function isDuplicateCharacterError(error) {
  const details = error && error.autoSprite;
  return Boolean(details && details.status === 409 && details.code === DUPLICATE_CHARACTER_CODE);
}

function duplicateCharacterMessage(character, error) {
  const suggestedName = nextStyleVersionName(character.autospriteName);
  const baseMessage = error.autoSprite ? formatAutoSpriteError(error.autoSprite) : error.message;
  return `${baseMessage}. AutoSprite character name already exists: "${character.autospriteName}". Try next version name: "${suggestedName}".`;
}

class AutoSpriteHttpError extends Error {
  constructor(details) {
    super(`AutoSprite request failed: ${formatAutoSpriteError(details)}`);
    this.name = "AutoSpriteHttpError";
    this.autoSprite = details;
  }
}

function extractId(responseJson, labels) {
  if (!responseJson || typeof responseJson !== "object") return null;
  const candidates = [
    responseJson.id,
    responseJson.character_id,
    responseJson.characterId,
    responseJson.job_id,
    responseJson.jobId,
    responseJson.data && responseJson.data.id,
    responseJson.data && responseJson.data.character && responseJson.data.character.id,
    responseJson.data && responseJson.data.job && responseJson.data.job.id,
    responseJson.character && responseJson.character.id,
    responseJson.job && responseJson.job.id,
    responseJson.result && responseJson.result.id,
    responseJson.result && responseJson.result.character && responseJson.result.character.id,
    responseJson.result && responseJson.result.job && responseJson.result.job.id
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate);
    }
  }

  throw new Error(`AutoSprite response did not include a ${labels.join(" or ")}.`);
}

function extractWorkflows(responseJson) {
  const workflows =
    responseJson && Array.isArray(responseJson.workflows) ? responseJson.workflows :
    responseJson && responseJson.data && Array.isArray(responseJson.data.workflows) ? responseJson.data.workflows :
    responseJson && responseJson.result && Array.isArray(responseJson.result.workflows) ? responseJson.result.workflows :
    [];

  return workflows
    .filter((workflow) => workflow && workflow.jobId)
    .map((workflow) => ({
      jobId: String(workflow.jobId),
      kind: workflow.kind || "unknown",
      videoId: workflow.videoId || null
    }));
}

function extractCharactersList(responseJson) {
  const characters =
    responseJson && Array.isArray(responseJson.characters) ? responseJson.characters :
    responseJson && responseJson.data && Array.isArray(responseJson.data.characters) ? responseJson.data.characters :
    responseJson && responseJson.result && Array.isArray(responseJson.result.characters) ? responseJson.result.characters :
    responseJson && Array.isArray(responseJson.data) ? responseJson.data :
    [];

  return characters.filter(Boolean);
}

function isDefaultBaseCharacter(character) {
  return character.id === "default_white_moonpet";
}

function extractSpritesheetsList(responseJson) {
  const spritesheets =
    responseJson && Array.isArray(responseJson.spritesheets) ? responseJson.spritesheets :
    responseJson && responseJson.data && Array.isArray(responseJson.data.spritesheets) ? responseJson.data.spritesheets :
    responseJson && responseJson.result && Array.isArray(responseJson.result.spritesheets) ? responseJson.result.spritesheets :
    [];

  return spritesheets.filter(Boolean);
}

function findSucceededSpritesheetId(responseJson, kind) {
  const spritesheets = extractSpritesheetsList(responseJson);
  const match = spritesheets.find((sheet) => {
    const status = String(sheet.status || "").toLowerCase();
    return (!kind || sheet.kind === kind) && (status === "succeeded" || status === "success" || status === "complete" || status === "completed");
  });
  return match && (match.id || match.spriteSheetId || match.spritesheetId);
}

function collectSpriteSheetIds(value, ids = new Set(), allowDirectId = false) {
  if (!value) return ids;
  if (typeof value === "string" || typeof value === "number") {
    ids.add(String(value));
    return ids;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSpriteSheetIds(item, ids, true);
    return ids;
  }
  if (typeof value === "object") {
    const direct = value.id || value.sprite_sheet_id || value.spritesheet_id || value.spriteSheetId;
    if (allowDirectId && direct) ids.add(String(direct));
    for (const key of ["sprite_sheet_ids", "spritesheet_ids", "spriteSheetIds", "sprite_sheets", "spritesheets", "spriteSheets"]) {
      if (value[key]) collectSpriteSheetIds(value[key], ids, true);
    }
    for (const key of ["data", "result", "output", "job"]) {
      if (value[key]) collectSpriteSheetIds(value[key], ids, false);
    }
  }
  return ids;
}

function extractSpriteSheetIds(jobJson) {
  return Array.from(collectSpriteSheetIds(jobJson, new Set(), false));
}

function pickUrl(record, names) {
  for (const name of names) {
    if (record && typeof record[name] === "string") return record[name];
  }
  for (const container of ["data", "result", "spriteSheet", "spritesheet", "sprite_sheet"]) {
    if (record && record[container]) {
      const nested = pickUrl(record[container], names);
      if (nested) return nested;
    }
  }
  return null;
}

function extractDownloadTargets(spriteSheetRecord) {
  const pngUrl = pickUrl(spriteSheetRecord, [
    "sheetUrl",
    "sheet_url",
    "png_url",
    "pngUrl",
    "image_url",
    "imageUrl",
    "spritesheet_url",
    "spriteSheetUrl",
    "url"
  ]);
  const atlasUrl = pickUrl(spriteSheetRecord, [
    "atlasUrl",
    "atlas_url",
    "atlas_url",
    "atlasUrl",
    "json_url",
    "jsonUrl",
    "metadata_url",
    "metadataUrl"
  ]);

  return [
    pngUrl && { kind: "png", url: pngUrl, extension: "png" },
    atlasUrl && { kind: "atlas", url: atlasUrl, extension: atlasUrl.toLowerCase().includes(".json") ? "json" : "atlas" }
  ].filter(Boolean);
}

function computeSheetSize(frameCount, frameSize) {
  const count = Number(frameCount);
  const size = Number(frameSize);
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(size) || size <= 0) return null;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return { w: columns * size, h: rows * size };
}

function getManifestSheetPaths(downloads) {
  const sheet = downloads.find((download) => download.kind === "png" || download.kind === "sheet");
  const atlas = downloads.find((download) => download.kind === "atlas");
  return {
    sheet_path: sheet ? sheet.path : null,
    atlas_path: atlas ? atlas.path : null
  };
}

function findRejectedAssetForName(characterName, animationKind, rejectedAssets) {
  return rejectedAssets.find((asset) =>
    asset.rejected === true &&
    asset.character_name === characterName &&
    asset.animation_kind === animationKind
  ) || null;
}

function findApprovedAssetForName(characterName, animationKind, approvedAssets) {
  return approvedAssets.find((asset) =>
    asset.approved === true &&
    asset.character_name === characterName &&
    asset.animation_kind === animationKind
  ) || null;
}

function buildSpriteSheetManifestEntry({ character, characterRecord, jobRecord, spriteSheetId, downloads, spriteSheetRecord, approvedAsset }) {
  const paths = getManifestSheetPaths(downloads);
  const frameCount = character.spritesheetSettings.frameCount || (approvedAsset && approvedAsset.frame_count) || null;
  const frameSize = character.spritesheetSettings.frameSize || (approvedAsset && approvedAsset.frame_size) || null;
  return {
    localId: character.id,
    local_id: approvedAsset ? approvedAsset.local_id : character.id,
    name: character.name,
    character_name: character.autospriteName,
    source_character_name: characterRecord.autospriteName || character.autospriteName,
    autospriteName: character.autospriteName,
    skin: character.skin,
    characterId: characterRecord.characterId,
    jobId: jobRecord.jobId,
    autosprite_job_id: jobRecord.jobId,
    kind: jobRecord.kind,
    animation_kind: jobRecord.kind,
    spriteSheetId,
    autosprite_spritesheet_id: spriteSheetId,
    approved: approvedAsset ? approvedAsset.approved === true : false,
    role: approvedAsset ? approvedAsset.role || null : null,
    sheet_path: paths.sheet_path,
    atlas_path: paths.atlas_path,
    frame_count: frameCount,
    frame_size: frameSize,
    sheet_size: approvedAsset && approvedAsset.sheet_size ? approvedAsset.sheet_size : computeSheetSize(frameCount, frameSize),
    created_at: new Date().toISOString(),
    downloads,
    record: spriteSheetRecord
  };
}

function sandboxAssetKey(characterName, animationKind) {
  return `${characterName}::${animationKind}`;
}

function normalizeSandboxAsset(asset) {
  return {
    character_name: asset.character_name || asset.autospriteName || asset.name || null,
    source_character_name: asset.source_character_name || asset.character_name || asset.autospriteName || asset.name || null,
    animation_kind: asset.animation_kind || asset.kind || null,
    role: asset.role || null,
    approved: asset.approved === true,
    rejected: asset.rejected === true,
    rejection_reason: asset.rejection_reason || asset.reason || null,
    sheet_path: asset.sheet_path || null,
    atlas_path: asset.atlas_path || null,
    source_sheet_path: asset.source_sheet_path || null,
    source_atlas_path: asset.source_atlas_path || null,
    frame_count: asset.frame_count || asset.frameCount || null,
    frame_size: asset.frame_size || asset.frameSize || null,
    sheet_size: asset.sheet_size || asset.sheetSize || null,
    created_at: asset.created_at || asset.createdAt || null,
    autosprite_job_id: asset.autosprite_job_id || asset.jobId || null,
    autosprite_spritesheet_id: asset.autosprite_spritesheet_id || asset.spriteSheetId || null
  };
}

function buildSandboxManifest({ traits, options, approvedAssets, rejectedAssets, spritesheetManifest }) {
  const generatedAt = new Date().toISOString();
  const assetsByKey = new Map();
  const putAsset = (asset) => {
    const normalized = normalizeSandboxAsset(asset);
    if (!normalized.character_name || !normalized.animation_kind) return;
    const key = sandboxAssetKey(normalized.character_name, normalized.animation_kind);
    assetsByKey.set(key, { ...(assetsByKey.get(key) || {}), ...normalized });
  };

  for (const asset of approvedAssets) {
    putAsset({
      ...asset,
      role: asset.role || null,
      approved: true,
      rejected: false,
      rejection_reason: null,
      sheet_path: asset.sheet_path || null,
      atlas_path: asset.atlas_path || null,
      frame_count: asset.frame_count,
      frame_size: asset.frame_size,
      sheet_size: asset.sheet_size
    });
  }

  for (const asset of rejectedAssets) {
    putAsset({
      ...asset,
      role: asset.role || "rejected_side_scroller_output",
      approved: false,
      rejected: true,
      rejection_reason: asset.reason || "Rejected by Moonpet approved asset registry."
    });
  }

  const spriteSheets = Array.isArray(spritesheetManifest.spriteSheets) ? spritesheetManifest.spriteSheets : [];
  for (const spriteSheet of spriteSheets) {
    const characterName = spriteSheet.character_name || spriteSheet.autospriteName || spriteSheet.name;
    const animationKind = spriteSheet.animation_kind || spriteSheet.kind;
    const approved = findApprovedAssetForName(characterName, animationKind, approvedAssets);
    const rejected = findRejectedAssetForName(characterName, animationKind, rejectedAssets);
    putAsset({
      ...spriteSheet,
      character_name: characterName,
      source_character_name: spriteSheet.source_character_name || characterName,
      animation_kind: animationKind,
      role: approved ? approved.role : spriteSheet.role,
      approved: Boolean(approved),
      rejected: Boolean(rejected),
      rejection_reason: rejected ? rejected.reason : null,
      sheet_path: (approved && approved.sheet_path) || spriteSheet.sheet_path,
      atlas_path: (approved && approved.atlas_path) || spriteSheet.atlas_path,
      source_sheet_path: spriteSheet.sheet_path || null,
      source_atlas_path: spriteSheet.atlas_path || null,
      frame_count: spriteSheet.frame_count,
      frame_size: spriteSheet.frame_size,
      sheet_size: spriteSheet.sheet_size,
      created_at: spriteSheet.created_at,
      autosprite_job_id: spriteSheet.autosprite_job_id,
      autosprite_spritesheet_id: spriteSheet.autosprite_spritesheet_id
    });
  }

  return {
    generated_at: generatedAt,
    provider: "AutoSprite",
    source: "scripts/generate-moonpet-assets.js",
    registry_path: "data/moonpet-approved-assets.json",
    spritesheet_manifest_path: "output/manifests/moonpet-spritesheets.generated.json",
    rules: {
      approved_assets_require_force_approved: true,
      rejected_assets_must_not_be_promoted: true,
      attack_rejected_for_moonbot_isometric_pack: true,
      live_game_runtime_untouched: true
    },
    current_request: {
      phase: options.phase,
      dry_run: options.dryRun,
      animation: options.animationKind || null,
      force_approved: options.forceApproved
    },
    approved_built_in_movement_pack: (traits.autospriteAnimations || []).map((animation) => animation.kind || animation),
    custom_pet_state_animations: traits.custom_pet_state_animations || [],
    assets: Array.from(assetsByKey.values()).sort((a, b) =>
      `${a.character_name}:${a.animation_kind}`.localeCompare(`${b.character_name}:${b.animation_kind}`)
    )
  };
}

async function saveRawResponse(rawResponses, step, character, responseBody) {
  const index = String(rawResponses.length + 1).padStart(3, "0");
  const fileName = `${index}-${slug(character.id)}-${slug(step)}.json`;
  const filePath = path.join(RAW_RESPONSE_DIR, fileName);
  await writeJson(filePath, {
    capturedAt: new Date().toISOString(),
    step,
    character: {
      id: character.id,
      name: character.name,
      skin: character.skin
    },
    response: responseBody
  });
  rawResponses.push(path.relative(REPO_ROOT, filePath).replace(/\\/g, "/"));
}

async function savePollError({ character, jobId, endpoint, attempt, error }) {
  const fileName = `${String(attempt).padStart(3, "0")}-${slug(character.id)}-${slug(jobId)}.json`;
  const filePath = path.join(POLL_ERROR_DIR, fileName);
  const autoSpriteError = error.autoSprite || {};
  await writeJson(filePath, {
    capturedAt: new Date().toISOString(),
    character: {
      id: character.id,
      name: character.name,
      skin: character.skin
    },
    jobId,
    endpoint,
    attempt,
    status: autoSpriteError.status || null,
    statusText: autoSpriteError.statusText || null,
    code: autoSpriteError.code || null,
    message: autoSpriteError.message || error.message,
    details: autoSpriteError.details || null,
    responseBody: autoSpriteError.bodyText || null,
    parsedResponseBody: autoSpriteError.parsedBody || null
  });
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

async function resolveExistingAutoSpriteCharacter({ traits, character, apiKey, options, rawResponses }) {
  if (!traits.use_existing_autosprite_character || !isDefaultBaseCharacter(character)) {
    return null;
  }

  const expectedName = traits.existing_autosprite_character_name;
  if (!expectedName) {
    throw new Error("use_existing_autosprite_character is true, but existing_autosprite_character_name is missing.");
  }

  const charactersResponse = await requestAutoSprite({
    method: "GET",
    urlPath: "/characters?limit=50",
    apiKey,
    options,
    rawResponses,
    step: "list-existing-characters",
    character
  });
  const existingCharacters = extractCharactersList(charactersResponse);
  const matched = existingCharacters.find((entry) => entry && entry.name === expectedName);

  if (!matched || !matched.id) {
    throw new Error(`Existing AutoSprite character "${expectedName}" was not found. Check the AutoSprite character name exactly; no replacement character was created.`);
  }

  await writeJson(EXISTING_CHARACTER_PATH, {
    matchedAt: new Date().toISOString(),
    requestedName: expectedName,
    localId: character.id,
    character: matched,
    listResponse: charactersResponse
  });

  return {
    localId: character.id,
    name: character.name,
    autospriteName: matched.name,
    skin: character.skin,
    characterId: String(matched.id),
    response: matched,
    source: "existing_autosprite_character"
  };
}

async function requestAutoSprite({ method, urlPath, body, apiKey, options, rawResponses, step, character }) {
  if (options.debugPayload && body) {
    console.log(`[debug-payload] ${character.id} ${step} ${JSON.stringify(body)}`);
  }

  const response = await fetch(`${API_BASE_URL}${urlPath}`, {
    method,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const parsedBody = parseResponseBody(text);
  const responseBody = parsedBody || { raw: text };
  await saveRawResponse(rawResponses, step, character, responseBody);

  if (!response.ok) {
    const details = buildAutoSpriteErrorDetails(response, text, parsedBody);
    details.method = method;
    details.endpoint = `${API_BASE_URL}${urlPath}`;
    throw new AutoSpriteHttpError(details);
  }

  return responseBody;
}

async function withRetries(label, maxRetries, baseDelayMs, operation) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (isDuplicateCharacterError(error)) {
        throw error;
      }
      if (attempt > maxRetries) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`${label} failed on attempt ${attempt}: ${error.message}; retrying after ${delay}ms.`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function downloadFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`);
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

function pollDelayMs(pollCount) {
  if (pollCount === 1) return 5000;
  if (pollCount === 2) return 10000;
  if (pollCount === 3) return 15000;
  return 20000;
}

async function pollJob({ jobId, apiKey, options, rawResponses, character }) {
  const started = Date.now();
  let pollCount = 0;
  const endpoint = `${API_BASE_URL}/jobs/${encodeURIComponent(jobId)}`;
  const pollErrors = [];
  let lastJobListAt = 0;
  let lastSpritesheetListAt = 0;

  while (Date.now() - started < options.pollTimeoutMs) {
    pollCount += 1;
    await sleep(pollDelayMs(pollCount));
    const elapsed = Date.now() - started;

    try {
      const job = await requestAutoSprite({
        method: "GET",
        urlPath: `/jobs/${encodeURIComponent(jobId)}`,
        apiKey,
        options,
        rawResponses,
        step: `poll-job-${pollCount}`,
        character
      });

      const status = String(job.status || (job.job && job.job.status) || (job.data && job.data.status) || "").toLowerCase();
      console.log(`[${character.id}] job ${jobId} status=${status || "unknown"}`);

      if (status === "succeeded" || status === "success" || status === "completed" || status === "complete") {
        return { status: "succeeded", job, pollErrors, endpoint };
      }
      if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
        return {
          status: "job_failed",
          job,
          pollErrors,
          endpoint,
          error: `AutoSprite job ${jobId} ended with status=${status}.`
        };
      }
    } catch (error) {
      const autoSpriteError = error.autoSprite || null;
      const pollErrorPath = await savePollError({ character, jobId, endpoint, attempt: pollCount, error });
      pollErrors.push(pollErrorPath);
      console.warn(`[${character.id}] poll error for job ${jobId}: ${error.message}`);

      if (!autoSpriteError || autoSpriteError.status < 500) {
        return {
          status: "job_poll_failed",
          pollErrors,
          endpoint,
          error: error.message
        };
      }
    }

    if (character.characterId && Date.now() - lastJobListAt >= 60000) {
      lastJobListAt = Date.now();
      try {
        const jobsList = await requestAutoSprite({
          method: "GET",
          urlPath: `/jobs?characterId=${encodeURIComponent(character.characterId)}&limit=10`,
          apiKey,
          options,
          rawResponses,
          step: `list-jobs-${pollCount}`,
          character
        });
        const jobs = Array.isArray(jobsList.jobs) ? jobsList.jobs : [];
        const listedJob = jobs.find((job) => job && String(job.jobId || job.id) === String(jobId));
        const listedStatus = listedJob && String(listedJob.status || "").toLowerCase();
        if (listedStatus) {
          console.log(`[${character.id}] listed job ${jobId} status=${listedStatus}`);
        }
        if (listedStatus === "succeeded" || listedStatus === "success" || listedStatus === "completed" || listedStatus === "complete") {
          const spritesheetsList = await requestAutoSprite({
            method: "GET",
            urlPath: `/characters/${encodeURIComponent(character.characterId)}/spritesheets`,
            apiKey,
            options,
            rawResponses,
            step: `list-character-spritesheets-after-job-list-${pollCount}`,
            character
          });
          const spriteSheetId = findSucceededSpritesheetId(spritesheetsList, character.workflowKind);
          if (spriteSheetId) {
            return {
              status: "succeeded",
              job: { ...listedJob, spritesheetIds: [spriteSheetId], fallback: "jobs_list_then_character_spritesheets" },
              pollErrors,
              endpoint
            };
          }
        }
        if (listedStatus === "failed" || listedStatus === "error" || listedStatus === "cancelled" || listedStatus === "canceled") {
          return {
            status: "job_failed",
            job: listedJob,
            pollErrors,
            endpoint,
            error: listedJob.error || `AutoSprite job ${jobId} ended with status=${listedStatus}.`
          };
        }
      } catch (error) {
        const pollErrorPath = await savePollError({ character, jobId, endpoint: `${API_BASE_URL}/jobs?characterId=${encodeURIComponent(character.characterId)}&limit=10`, attempt: pollCount, error });
        pollErrors.push(pollErrorPath);
        console.warn(`[${character.id}] job-list fallback error for job ${jobId}: ${error.message}`);
      }
    }

    if (character.characterId && elapsed >= 120000 && Date.now() - lastSpritesheetListAt >= 60000) {
      lastSpritesheetListAt = Date.now();
      try {
        const spritesheetsList = await requestAutoSprite({
          method: "GET",
          urlPath: `/characters/${encodeURIComponent(character.characterId)}/spritesheets`,
          apiKey,
          options,
          rawResponses,
          step: `list-character-spritesheets-${pollCount}`,
          character
        });
        const spriteSheetId = findSucceededSpritesheetId(spritesheetsList, character.workflowKind);
        if (spriteSheetId) {
          console.log(`[${character.id}] spritesheet fallback found ${spriteSheetId} for ${character.workflowKind || "unknown"}`);
          return {
            status: "succeeded",
            job: { jobId, characterId: character.characterId, status: "succeeded", spritesheetIds: [spriteSheetId], fallback: "character_spritesheets" },
            pollErrors,
            endpoint
          };
        }
      } catch (error) {
        const pollErrorPath = await savePollError({ character, jobId, endpoint: `${API_BASE_URL}/characters/${encodeURIComponent(character.characterId)}/spritesheets`, attempt: pollCount, error });
        pollErrors.push(pollErrorPath);
        console.warn(`[${character.id}] spritesheet-list fallback error for job ${jobId}: ${error.message}`);
      }
    }
  }

  return {
    status: "job_poll_failed",
    pollErrors,
    endpoint,
    error: `Timed out polling AutoSprite job ${jobId} after ${options.pollTimeoutMs}ms.`
  };
}

async function writeErrorManifest(errors) {
  await writeJson(ERROR_MANIFEST_PATH, {
    generatedAt: new Date().toISOString(),
    provider: "AutoSprite",
    errors
  });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const traits = JSON.parse(await fs.readFile(options.traitsPath, "utf8"));
  const spriteSheetAnimationKinds = getSpriteSheetAnimations(traits, options).map((animation) => animation.kind);
  if (spriteSheetAnimationKinds.length !== 1) {
    throw new Error("Moonpet base generation is limited to one animation per run.");
  }
  const rateLimitMs = options.rateLimitMs ?? traits.generation.rateLimitMs;
  const maxRetries = traits.generation.maxRetries;
  const retryBaseDelayMs = traits.generation.retryBaseDelayMs;
  const apiKey = process.env.AUTOSPRITE_API_KEY;

  await ensureFolders();

  if (!options.dryRun && !apiKey) {
    throw new Error("AUTOSPRITE_API_KEY is required for real generation.");
  }

  const rawResponses = [];
  const errors = [];
  const characterManifest = await readJsonIfExists(CHARACTER_MANIFEST_PATH, {
    generatedAt: null,
    provider: "AutoSprite",
    characters: []
  });
  const jobManifest = await readJsonIfExists(JOB_MANIFEST_PATH, {
    generatedAt: null,
    provider: "AutoSprite",
    jobs: []
  });
  const approvedManifest = await readJsonIfExists(APPROVED_ASSETS_PATH, {
    assets: []
  });
  const approvedAssets = getApprovedAssets(approvedManifest);
  const rejectedAssets = getRejectedAssets(approvedManifest);
  const characters = applyApprovedLocks(options.resumeJobs
    ? buildResumeJobPlan(jobManifest, traits, options)
    : buildCharacterPlan(traits, options), approvedManifest, options);
  validateCharacterPrompts(characters);
  assertNoRejectedAnimations(characters, rejectedAssets);

  if (options.resumeJobs && characters.length === 0) {
    throw new Error("No saved AutoSprite jobs found in output/manifests/autosprite-jobs.generated.json.");
  }
  const spritesheetManifest = await readJsonIfExists(SPRITESHEET_MANIFEST_PATH, {
    generatedAt: new Date().toISOString(),
    provider: "AutoSprite",
    spriteSheets: []
  });
  spritesheetManifest.generatedAt = new Date().toISOString();
  const planManifest = {
    generatedAt: new Date().toISOString(),
    provider: "AutoSprite",
    phase: options.phase,
    dryRun: options.dryRun,
    resume: options.resume,
    resumeJobs: options.resumeJobs,
    animationOverride: options.animationKind,
    forceApproved: options.forceApproved,
    useExistingAutoSpriteCharacter: traits.use_existing_autosprite_character,
    existingAutoSpriteCharacterName: traits.existing_autosprite_character_name,
    workflow: "characters -> spritesheets job -> poll job -> fetch spritesheet records -> download png/atlas",
    animations: spriteSheetAnimationKinds,
    approvedAssets: approvedAssets.map((asset) => ({
      local_id: asset.local_id,
      character_name: asset.character_name,
      source_character_name: asset.source_character_name,
      animation_kind: asset.animation_kind,
      role: asset.role || null,
      approved: asset.approved === true,
      frame_count: asset.frame_count,
      frame_size: asset.frame_size,
      sheet_size: asset.sheet_size || null,
      sheet_path: asset.sheet_path || null,
      atlas_path: asset.atlas_path || null,
      notes: asset.notes || null
    })),
    rejectedAssets,
    rejectedAutoSpriteAnimations: traits.rejected_autosprite_animations || [],
    approvedBuiltInMovementPack: (traits.autospriteAnimations || []).map((animation) => animation.kind || animation),
    customPetStateAnimations: traits.custom_pet_state_animations || [],
    plannedCharacters: characters.length,
    gameActionMapping: traits.gameActionMapping,
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      autospriteName: character.autospriteName,
      phase: character.phase,
      prompt: character.prompt,
      promptLength: character.promptLength,
      localDescription: character.localDescription,
      animations: character.animations,
      character_name: character.autospriteName,
      source_character_name: character.autospriteName,
      animation_kind: character.animations[0] ? character.animations[0].kind : null,
      approved: character.approved === true,
      role: character.role || null,
      sheet_path: null,
      atlas_path: null,
      frame_count: character.spritesheetSettings.frameCount || null,
      frame_size: character.spritesheetSettings.frameSize || null,
      sheet_size: computeSheetSize(character.spritesheetSettings.frameCount, character.spritesheetSettings.frameSize),
      created_at: null,
      autosprite_job_id: null,
      autosprite_spritesheet_id: null,
      approvedOutputs: character.approvedOutputs || [],
      skipGeneration: character.skipGeneration === true,
      skipReason: character.skipReason || null,
      status: options.dryRun ? "dry_run" : "planned"
    })),
    rawResponses
  };

  console.log(`Moonpet Art Factory: ${options.dryRun ? "dry-run" : "execute"} phase=${options.phase} characters=${characters.length}`);

  if (options.dryRun) {
    for (const character of characters) {
      if (options.debugPayload) {
        if (character.usesExistingAutoSpriteCharacter) {
          console.log(`[debug-payload] ${character.id} list-existing-characters {"limit":50,"matchName":"${character.autospriteName}"}`);
        } else {
          console.log(`[debug-payload] ${character.id} create-character ${JSON.stringify(buildCreateCharacterBody(character))}`);
        }
        console.log(`[debug-payload] ${character.id} create-spritesheets ${JSON.stringify(buildCreateSpritesheetBody(character))}`);
      }
      const approvalStatus = character.approved ? `, approved=true, role=${character.role}, skipGeneration=${character.skipGeneration}` : "";
      console.log(`[dry-run] local_id=${character.id}, autospriteName="${character.autospriteName}", promptLength=${character.promptLength}, request animations ${spriteSheetAnimationKinds.join(", ")}${approvalStatus}`);
    }
    await writeJson(MANIFEST_PATH, planManifest);
    await writeJson(options.sandboxManifestPath, buildSandboxManifest({
      traits,
      options,
      approvedAssets,
      rejectedAssets,
      spritesheetManifest
    }));
    console.log(`Manifest written to ${path.relative(REPO_ROOT, MANIFEST_PATH).replace(/\\/g, "/")}`);
    console.log(`Sandbox manifest written to ${path.relative(REPO_ROOT, options.sandboxManifestPath).replace(/\\/g, "/")}`);
    return;
  }

  for (const [index, character] of characters.entries()) {
    console.log(`[${index + 1}/${characters.length}] character ${character.id}`);
    try {
      if (character.skipGeneration) {
        console.log(`[${character.id}] skip ${character.skipReason}`);
        planManifest.characters = planManifest.characters.map((entry) =>
          entry.id === character.id
            ? {
                ...entry,
                status: "approved_locked",
                approved: true,
                role: character.role,
                character_name: character.autospriteName,
                source_character_name: character.autospriteName,
                animation_kind: character.approvedKind,
                sheet_path: null,
                atlas_path: null,
                frame_count: character.approvedOutputs && character.approvedOutputs[0] ? character.approvedOutputs[0].frame_count : null,
                frame_size: character.approvedOutputs && character.approvedOutputs[0] ? character.approvedOutputs[0].frame_size : null,
                sheet_size: character.approvedOutputs && character.approvedOutputs[0] ? character.approvedOutputs[0].sheet_size : null,
                created_at: new Date().toISOString(),
                autosprite_job_id: null,
                autosprite_spritesheet_id: null,
                skipGeneration: true,
                skipReason: character.skipReason
              }
            : entry
        );
        await writeJson(MANIFEST_PATH, { ...planManifest, rawResponses });
        await writeJson(options.sandboxManifestPath, buildSandboxManifest({
          traits,
          options,
          approvedAssets,
          rejectedAssets,
          spritesheetManifest
        }));
        continue;
      }

      let characterRecord = await resolveExistingAutoSpriteCharacter({
        traits,
        character,
        apiKey,
        options,
        rawResponses
      });

      characterRecord = characterRecord || (options.resumeJobs && character.characterId
        ? {
            localId: character.id,
            name: character.name,
            autospriteName: character.autospriteName,
            skin: character.skin,
            characterId: character.characterId,
            response: null
          }
        : null);

      characterRecord = characterRecord || (options.resume
        ? characterManifest.characters.find((entry) => entry.localId === character.id && entry.characterId)
        : null);

      if (!characterRecord) {
        const createCharacterResponse = await withRetries(
          `AutoSprite create character ${character.id}`,
          maxRetries,
          retryBaseDelayMs,
          () => requestAutoSprite({
            method: "POST",
            urlPath: "/characters",
            body: buildCreateCharacterBody(character),
            apiKey,
            options,
            rawResponses,
            step: "create-character",
            character
          })
        );
        characterRecord = {
          localId: character.id,
          name: character.name,
          autospriteName: character.autospriteName,
          skin: character.skin,
          characterId: extractId(createCharacterResponse, ["character id"]),
          response: createCharacterResponse
        };
        characterManifest.characters = characterManifest.characters.filter((entry) => entry.localId !== character.id);
        characterManifest.characters.push(characterRecord);
        characterManifest.generatedAt = new Date().toISOString();
        await writeJson(CHARACTER_MANIFEST_PATH, characterManifest);
      } else {
        console.log(`[${character.id}] resume characterId=${characterRecord.characterId}`);
        if (characterRecord.source === "existing_autosprite_character") {
          characterManifest.characters = characterManifest.characters.filter((entry) => entry.localId !== character.id);
          characterManifest.characters.push(characterRecord);
          characterManifest.generatedAt = new Date().toISOString();
          await writeJson(CHARACTER_MANIFEST_PATH, characterManifest);
        }
      }

      let jobRecords = [];
      if (options.resumeJobs && character.jobId) {
        jobRecords = [{
          localId: character.id,
          name: character.name,
          autospriteName: character.autospriteName,
          skin: character.skin,
          characterId: character.characterId,
          jobId: character.jobId,
          kind: character.workflowKind || (character.animations[0] && character.animations[0].kind) || "unknown",
          videoId: character.videoId || null,
          animations: character.animations,
          response: null
        }];
      } else if (options.resume) {
        const requestedKinds = new Set(character.animations.map((animation) => animation.kind));
        jobRecords = jobManifest.jobs.filter((entry) =>
          entry.localId === character.id && entry.jobId && requestedKinds.has(entry.kind)
        );
      }

      if (jobRecords.length === 0) {
        const createSpritesheetResponse = await withRetries(
          `AutoSprite create spritesheets ${character.id}`,
          maxRetries,
          retryBaseDelayMs,
          () => requestAutoSprite({
            method: "POST",
            urlPath: `/characters/${encodeURIComponent(characterRecord.characterId)}/spritesheets`,
            body: buildCreateSpritesheetBody(character),
            apiKey,
            options,
            rawResponses,
            step: "create-spritesheets",
            character
          })
        );
        const workflows = extractWorkflows(createSpritesheetResponse);
        if (workflows.length === 0) {
          throw new Error(`AutoSprite spritesheet response for ${character.id} did not include workflows[].`);
        }
        jobRecords = workflows.map((workflow) => ({
          localId: character.id,
          name: character.name,
          autospriteName: character.autospriteName,
          skin: character.skin,
          characterId: characterRecord.characterId,
          jobId: workflow.jobId,
          kind: workflow.kind,
          videoId: workflow.videoId,
          animations: spriteSheetAnimationKinds,
          response: createSpritesheetResponse
        }));
        const newJobKeys = new Set(jobRecords.map((entry) => `${entry.localId}::${entry.kind}`));
        jobManifest.jobs = jobManifest.jobs.filter((entry) => !newJobKeys.has(`${entry.localId}::${entry.kind}`));
        jobManifest.jobs.push(...jobRecords);
        jobManifest.generatedAt = new Date().toISOString();
        await writeJson(JOB_MANIFEST_PATH, jobManifest);
      } else {
        console.log(`[${character.id}] resume jobIds=${jobRecords.map((job) => job.jobId).join(", ")}`);
      }

      const allSpriteSheetIds = [];
      const failedWorkflowPolls = [];

      for (const jobRecord of jobRecords) {
        const pollCharacter = {
          ...character,
          characterId: characterRecord.characterId,
          workflowKind: jobRecord.kind
        };
        const pollResult = await pollJob({
          jobId: jobRecord.jobId,
          apiKey,
          options,
          rawResponses,
          character: pollCharacter
        });

        if (pollResult.status !== "succeeded") {
          failedWorkflowPolls.push({ jobRecord, pollResult });
          errors.push({
            generatedAt: new Date().toISOString(),
            character: {
              id: character.id,
              name: character.name,
              skin: character.skin
            },
            status: pollResult.status,
            jobId: jobRecord.jobId,
            kind: jobRecord.kind,
            endpoint: pollResult.endpoint,
            pollErrors: pollResult.pollErrors,
            message: pollResult.error
          });
          await writeErrorManifest(errors);
          continue;
        }

        const spriteSheetIds = extractSpriteSheetIds(pollResult.job);
        if (spriteSheetIds.length === 0) {
          failedWorkflowPolls.push({
            jobRecord,
            pollResult: {
              ...pollResult,
              status: "job_poll_failed",
              error: `AutoSprite job ${jobRecord.jobId} succeeded but no sprite sheet IDs were found.`
            }
          });
          continue;
        }
        allSpriteSheetIds.push(...spriteSheetIds.map((spriteSheetId) => ({ spriteSheetId, jobRecord })));
      }

      if (failedWorkflowPolls.length > 0) {
        planManifest.characters = planManifest.characters.map((entry) =>
          entry.id === character.id
            ? {
                ...entry,
                status: "job_poll_failed",
                characterId: characterRecord.characterId,
                workflows: jobRecords,
                pollFailures: failedWorkflowPolls.map(({ jobRecord, pollResult }) => ({
                  jobId: jobRecord.jobId,
                  kind: jobRecord.kind,
                  pollEndpoint: pollResult.endpoint,
                  pollErrors: pollResult.pollErrors,
                  error: pollResult.error
                }))
              }
            : entry
        );
        await writeJson(MANIFEST_PATH, { ...planManifest, rawResponses });
      }

      for (const { spriteSheetId, jobRecord } of allSpriteSheetIds) {
        const spriteSheetRecord = await withRetries(
          `AutoSprite fetch spritesheet ${spriteSheetId}`,
          maxRetries,
          retryBaseDelayMs,
          () => requestAutoSprite({
            method: "GET",
            urlPath: `/spritesheets/${encodeURIComponent(spriteSheetId)}`,
            apiKey,
            options,
            rawResponses,
            step: `fetch-spritesheet-${spriteSheetId}`,
            character
          })
        );

        const downloads = [];
        for (const target of extractDownloadTargets(spriteSheetRecord)) {
          const fileName = `${character.id}-${slug(spriteSheetId)}.${target.extension}`;
          const filePath = path.join(SPRITESHEET_OUTPUT_DIR, character.id, fileName);
          const approvedAsset = findApprovedAssetFor(character, jobRecord.kind, approvedAssets);
          if (approvedAsset && !options.forceApproved) {
            console.log(`[${character.id}] approved output exists; skipping overwrite for ${character.autospriteName} ${jobRecord.kind} ${target.kind}`);
            downloads.push({
              kind: target.kind,
              url: target.url,
              path: path.relative(REPO_ROOT, filePath).replace(/\\/g, "/"),
              skipped: true,
              skipReason: "approved_output_exists"
            });
            continue;
          }
          await withRetries(
            `Download ${target.kind} ${spriteSheetId}`,
            maxRetries,
            retryBaseDelayMs,
            () => downloadFile(target.url, filePath)
          );
          downloads.push({
            kind: target.kind,
            url: target.url,
            path: path.relative(REPO_ROOT, filePath).replace(/\\/g, "/")
          });
        }

        const manifestEntry = buildSpriteSheetManifestEntry({
          character,
          characterRecord,
          jobRecord,
          spriteSheetId,
          downloads,
          spriteSheetRecord,
          approvedAsset: findApprovedAssetFor(character, jobRecord.kind, approvedAssets)
        });
        spritesheetManifest.spriteSheets = (spritesheetManifest.spriteSheets || []).filter((entry) =>
          !(
            (entry.character_name || entry.autospriteName) === manifestEntry.character_name &&
            (entry.animation_kind || entry.kind) === manifestEntry.animation_kind
          )
        );
        spritesheetManifest.spriteSheets.push(manifestEntry);
      }

      planManifest.characters = planManifest.characters.map((entry) =>
        entry.id === character.id
          ? {
              ...entry,
              ...(spritesheetManifest.spriteSheets.find((spriteSheet) =>
                spriteSheet.localId === character.id &&
                (spriteSheet.animation_kind || spriteSheet.kind) === (character.animations[0] && character.animations[0].kind)
              ) || {}),
              status: allSpriteSheetIds.length > 0 && failedWorkflowPolls.length === 0 ? "generated" : entry.status,
              characterId: characterRecord.characterId,
              workflows: jobRecords,
              spriteSheetIds: allSpriteSheetIds.map((entry) => entry.spriteSheetId)
            }
          : entry
      );
      await writeJson(SPRITESHEET_MANIFEST_PATH, spritesheetManifest);
      await writeJson(MANIFEST_PATH, { ...planManifest, rawResponses });
      await writeJson(options.sandboxManifestPath, buildSandboxManifest({
        traits,
        options,
        approvedAssets,
        rejectedAssets,
        spritesheetManifest
      }));
      await sleep(rateLimitMs);
    } catch (error) {
      const autoSpriteError = error.autoSprite || null;
      const errorSummary = isDuplicateCharacterError(error)
        ? duplicateCharacterMessage(character, error)
        : autoSpriteError ? formatAutoSpriteError(autoSpriteError) : error.message;
      console.error(`[${character.id}] failed: ${errorSummary}`);
      planManifest.characters = planManifest.characters.map((entry) =>
        entry.id === character.id ? { ...entry, status: "failed", error: errorSummary } : entry
      );
      if (autoSpriteError) {
        errors.push({
          generatedAt: new Date().toISOString(),
          character: {
            id: character.id,
            name: character.name,
            autospriteName: character.autospriteName,
            skin: character.skin
          },
          status: autoSpriteError.status,
          statusText: autoSpriteError.statusText,
          code: autoSpriteError.code,
          message: autoSpriteError.message,
          details: autoSpriteError.details,
          responseBody: autoSpriteError.bodyText,
          parsedResponseBody: autoSpriteError.parsedBody,
          suggestedName: isDuplicateCharacterError(error) ? nextStyleVersionName(character.autospriteName) : null
        });
        await writeErrorManifest(errors);
      } else {
        errors.push({
          generatedAt: new Date().toISOString(),
          character: {
            id: character.id,
            name: character.name,
            autospriteName: character.autospriteName,
            skin: character.skin
          },
          status: "local_error",
          message: error.message
        });
        await writeErrorManifest(errors);
      }
    }
  }

  await writeJson(CHARACTER_MANIFEST_PATH, characterManifest);
  await writeJson(JOB_MANIFEST_PATH, jobManifest);
  await writeJson(SPRITESHEET_MANIFEST_PATH, spritesheetManifest);
  await writeJson(MANIFEST_PATH, { ...planManifest, rawResponses });
  await writeJson(options.sandboxManifestPath, buildSandboxManifest({
    traits,
    options,
    approvedAssets,
    rejectedAssets,
    spritesheetManifest
  }));
  await writeErrorManifest(errors);

  console.log(`Manifest written to ${path.relative(REPO_ROOT, MANIFEST_PATH).replace(/\\/g, "/")}`);
  console.log(`Character IDs written to ${path.relative(REPO_ROOT, CHARACTER_MANIFEST_PATH).replace(/\\/g, "/")}`);
  console.log(`Job IDs written to ${path.relative(REPO_ROOT, JOB_MANIFEST_PATH).replace(/\\/g, "/")}`);
  console.log(`Spritesheet metadata written to ${path.relative(REPO_ROOT, SPRITESHEET_MANIFEST_PATH).replace(/\\/g, "/")}`);
  console.log(`Sandbox manifest written to ${path.relative(REPO_ROOT, options.sandboxManifestPath).replace(/\\/g, "/")}`);
  if (errors.length > 0) {
    console.log(`AutoSprite error manifest written to ${path.relative(REPO_ROOT, ERROR_MANIFEST_PATH).replace(/\\/g, "/")}`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
