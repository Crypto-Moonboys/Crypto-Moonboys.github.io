#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const {
  resolveCharacterId,
  listSpritesheets,
  spritesheetId,
  isComplete,
  saveExistingSheet,
  buildContactSheet,
  writeJson,
  relative,
  slug
} = require("./download-botty-front-animations");
const { buildLocalAtlas } = require("./generate-moonpet-assets");
const { directNames } = require("./inspect-autosprite-stage0-pack");

const REPO_ROOT = path.resolve(__dirname, "..");
const CHARACTER_NAME = "EGGYONE";
const REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");
const STAGE0_MANIFEST_PATH = path.join(REPO_ROOT, "data", "moonpet-eggyone-stage0-assets.json");
const FRONT_ACTION_CONTACT_SHEET = "/img/moonpets/eggyone/front-actions-contact-sheet.png";
const LOCAL_FRONT_FIGHT_SOURCE = {
  path: "/img/moonpets/eggyone/EGGYONE-front_fight-v1.png",
  blob_sha: "835af206e932916ef0c4e1c3ca13cbdae18bf2f1",
  role: "front_fight"
};
const FRONT_ACTION_ROLES = ["front_dance", "front_victory", "front_fight"];
const FRONT_ACTION_PLAYBACK = Object.freeze({
  front_dance: { loop: true, one_shot: false, playback_mode: "loop" },
  front_victory: { loop: false, one_shot: true, playback_mode: "once_hold_last" },
  front_fight: { loop: false, one_shot: true, playback_mode: "once_then_idle" }
});
const ROLE_SHEETS = [
  { role: "egg_idle", autosprite_name: "EGGONE", playback_mode: "loop" },
  { role: "egg_wobble", autosprite_name: "EGGTWO", playback_mode: "loop" },
  { role: "egg_sleep", autosprite_name: "EGGTHREE", playback_mode: "loop" },
  { role: "egg_react", autosprite_name: "EGGFOUR", playback_mode: "once_then_idle" },
  { role: "egg_care", autosprite_name: "EGGFIVE", playback_mode: "once_then_idle" },
  { role: "egg_breakout", autosprite_name: "EGGSIX", playback_mode: "once_hold_last" },
  { role: "egg_hatch", autosprite_name: "EGGSEVEN", playback_mode: "once" }
];

function parseArgs(argv) {
  const options = { characterName: CHARACTER_NAME, characterId: "", registryPath: REGISTRY_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--character-name") options.characterName = argv[++index];
    else if (arg.startsWith("--character-name=")) options.characterName = arg.slice("--character-name=".length);
    else if (arg === "--character-id") options.characterId = argv[++index];
    else if (arg.startsWith("--character-id=")) options.characterId = arg.slice("--character-id=".length);
    else if (arg === "--registry") options.registryPath = path.resolve(argv[++index]);
    else if (arg.startsWith("--registry=")) options.registryPath = path.resolve(arg.slice("--registry=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  options.characterName = String(options.characterName || "").trim();
  options.characterId = String(options.characterId || "").trim();
  if (options.characterName !== CHARACTER_NAME) throw new Error(`This downloader only accepts the existing ${CHARACTER_NAME} character.`);
  return options;
}

function outputPaths() {
  const outputDir = path.join(REPO_ROOT, "output", "moonpets", "eggyone-stage0");
  return {
    outputDir,
    manifestPath: path.join(REPO_ROOT, "output", "manifests", "eggyone-stage0-existing-sheets.generated.json"),
    rawDir: path.join(REPO_ROOT, "output", "manifests", "autosprite", "eggyone-stage0-existing"),
    contactSheetPath: path.join(outputDir, "contact-sheet.png")
  };
}

function exactName(record) {
  const names = directNames(record).map((name) => String(name).trim().toUpperCase());
  return ROLE_SHEETS.find((entry) => names.includes(entry.autosprite_name))?.autosprite_name || "";
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

function selectCanonicalStage0Records(records) {
  const completed = records.filter(isComplete);
  const buckets = new Map(ROLE_SHEETS.map((entry) => [entry.autosprite_name, []]));
  for (const record of completed) {
    const matchedName = exactName(record);
    if (!matchedName || !buckets.has(matchedName)) continue;
    buckets.get(matchedName).push(record);
  }
  const selected = new Map();
  for (const entry of ROLE_SHEETS) {
    const matches = buckets.get(entry.autosprite_name) || [];
    if (matches.length === 0) {
      throw new Error(`Missing exact existing EGGYONE sheet ${entry.autosprite_name}.`);
    }
    if (matches.length > 1) {
      throw new Error(`Multiple completed EGGYONE sheets matched ${entry.autosprite_name}.`);
    }
    selected.set(entry.autosprite_name, matches[0]);
  }
  return selected;
}

function atlasFrames(atlas) {
  if (Array.isArray(atlas?.frames)) return atlas.frames;
  if (atlas?.frames && typeof atlas.frames === "object") return Object.values(atlas.frames);
  return [];
}

function validateAtlasAgainstSheet(atlas, sheet) {
  const frames = atlasFrames(atlas);
  if (frames.length !== Number(sheet.frame_count)) throw new Error("front_fight atlas frame count does not match sheet layout");
  for (const [index, frame] of frames.entries()) {
    const source = frame?.frame || frame || {};
    const x = Number(source.x);
    const y = Number(source.y);
    const w = Number(source.w || source.width);
    const h = Number(source.h || source.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
      throw new Error(`front_fight atlas frame ${index} is invalid`);
    }
    if (x < 0 || y < 0 || x + w > sheet.sheet_size.w || y + h > sheet.sheet_size.h) {
      throw new Error(`front_fight atlas frame ${index} exceeds PNG bounds`);
    }
  }
}

async function ensureLocalEggyoneFrontFightAsset(productionDir, characterId) {
  const sourcePath = path.join(REPO_ROOT, LOCAL_FRONT_FIGHT_SOURCE.path.replace(/^[/\\]+/, ""));
  const runtimePng = path.join(productionDir, "front_fight.png");
  const runtimeAtlas = path.join(productionDir, "front_fight.json");
  const existingAtlas = await readJsonIfExists(runtimeAtlas, null);
  const existingFrames = atlasFrames(existingAtlas);
  const existingFrame = existingFrames[0]?.frame || existingFrames[0] || {};
  const existingFrameWidth = Number(existingFrame.w || existingFrame.width || existingAtlas?.meta?.frame_size?.w);
  const existingFrameHeight = Number(existingFrame.h || existingFrame.height || existingAtlas?.meta?.frame_size?.h);
  const existingFrameCount = existingFrames.length || Number(existingAtlas?.meta?.frame_count) || 0;
  await fs.copyFile(sourcePath, runtimePng);
  const sourceBlobSha = await fs.readFile(sourcePath).then((buf) => crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest("hex"));
  if (sourceBlobSha !== LOCAL_FRONT_FIGHT_SOURCE.blob_sha) {
    throw new Error(`front_fight source blob mismatch: expected ${LOCAL_FRONT_FIGHT_SOURCE.blob_sha}, found ${sourceBlobSha}`);
  }
  const metadata = await sharp(runtimePng).metadata();
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  if (!(existingFrameCount > 0) || !(existingFrameWidth > 0) || !(existingFrameHeight > 0)) {
    throw new Error("front_fight local atlas seed is missing or invalid; refusing to invent frame layout");
  }
  if (width % existingFrameWidth !== 0 || height % existingFrameHeight !== 0) {
    throw new Error(`front_fight PNG layout ${width}x${height} is incompatible with committed atlas frame size ${existingFrameWidth}x${existingFrameHeight}`);
  }
  const columns = width / existingFrameWidth;
  const rows = height / existingFrameHeight;
  const frameCount = columns * rows;
  if (frameCount !== existingFrameCount) {
    throw new Error(`front_fight PNG grid frame count ${frameCount} does not match committed atlas frame count ${existingFrameCount}`);
  }
  if (existingFrameWidth !== existingFrameHeight) throw new Error("front_fight committed atlas frame cells are not square");
  const atlas = buildLocalAtlas({
    frameCount,
    frameSize: existingFrameWidth,
    sheetSize: { w: width, h: height },
    durationS: 2.333
  });
  validateAtlasAgainstSheet(atlas, {
    frame_count: frameCount,
    sheet_size: { w: width, h: height }
  });
  await writeJson(runtimeAtlas, atlas);
  return {
    role: "front_fight",
    png_path: "/img/moonpets/eggyone/front_fight.png",
    atlas_path: "/img/moonpets/eggyone/front_fight.json",
    frame_count: frameCount,
    frame_dimensions: { w: existingFrameWidth, h: existingFrameHeight },
    sheet_size: { w: width, h: height },
    fps: 12,
    loop: FRONT_ACTION_PLAYBACK.front_fight.loop,
    one_shot: FRONT_ACTION_PLAYBACK.front_fight.one_shot,
    playback_mode: FRONT_ACTION_PLAYBACK.front_fight.playback_mode,
    autosprite: {
      character_id: characterId,
      spritesheet_id: null,
      source: "local_user_supplied"
    },
    provenance: "local_user_supplied_exact_committed_png",
    user_supplied: {
      approved: true,
      source_png_path: LOCAL_FRONT_FIGHT_SOURCE.path,
      source_blob_sha: LOCAL_FRONT_FIGHT_SOURCE.blob_sha
    },
    review_status: "approved_visual_review"
  };
}

function preservedFrontActionAssets(existingManifest) {
  const assets = Array.isArray(existingManifest?.assets) ? existingManifest.assets : [];
  const byRole = new Map(assets.filter((asset) => FRONT_ACTION_ROLES.includes(asset?.role)).map((asset) => [asset.role, asset]));
  for (const role of ["front_dance", "front_victory"]) {
    const asset = byRole.get(role);
    if (!asset) throw new Error(`Missing ${role} in data/moonpet-eggyone-stage0-assets.json; refusing to drop approved front actions during Stage-0 refresh.`);
    byRole.set(role, { ...asset, review_status: "approved_visual_review" });
  }
  return byRole;
}

async function rebuildFrontActionContactSheet(assets) {
  const entries = FRONT_ACTION_ROLES.map((role) => {
    const asset = assets.find((entry) => entry.role === role);
    if (!asset) throw new Error(`Missing ${role} for front-action contact sheet rebuild`);
    return {
      id: role,
      output_png_path: asset.png_path.replace(/^[/\\]+/, "")
    };
  });
  const contactSheetPath = path.join(REPO_ROOT, FRONT_ACTION_CONTACT_SHEET.replace(/^[/\\]+/, ""));
  await buildContactSheet(entries, contactSheetPath);
  return FRONT_ACTION_CONTACT_SHEET;
}

async function promoteStagingPack(manifest, paths) {
  const productionDir = path.join(REPO_ROOT, "img", "moonpets", "eggyone");
  await fs.mkdir(productionDir, { recursive: true });
  const productionAnimations = [];
  for (const animation of manifest.animations) {
    const pngPath = path.join(productionDir, `${animation.role}.png`);
    const atlasPath = path.join(productionDir, `${animation.role}.json`);
    await fs.copyFile(path.join(REPO_ROOT, animation.output_png_path), pngPath);
    await fs.copyFile(path.join(REPO_ROOT, animation.output_atlas_path), atlasPath);
    productionAnimations.push({
      ...animation,
      png_path: `/${relative(pngPath)}`,
      atlas_path: `/${relative(atlasPath)}`,
      approval_status: "mechanical_validation_passed_pending_visual_review"
    });
  }
  const contactSheetPath = path.join(productionDir, "contact-sheet.png");
  await fs.copyFile(paths.contactSheetPath, contactSheetPath);
  const existingManifest = await readJsonIfExists(STAGE0_MANIFEST_PATH, {});
  const frontAssets = preservedFrontActionAssets(existingManifest);
  const localFrontFight = await ensureLocalEggyoneFrontFightAsset(productionDir, manifest.character_id);
  frontAssets.set("front_fight", localFrontFight);
  const mergedAssets = [...productionAnimations, ...FRONT_ACTION_ROLES.map((role) => frontAssets.get(role))];
  const frontActionContactSheetPath = await rebuildFrontActionContactSheet(mergedAssets);
  const productionManifest = {
    schema_version: 2,
    character_name: manifest.character_name,
    character_id: manifest.character_id,
    source: "AutoSprite API + local approved asset",
    provenance: "seven existing AutoSprite Stage-0 sheets plus approved local user-supplied EGGYONE front_fight sheet",
    downloaded_at: manifest.generated_at,
    approval_status: "approved_visual_review",
    contact_sheet_path: `/${relative(contactSheetPath)}`,
    cache_version: existingManifest?.cache_version || "20260926-front-actions-v1",
    runtime_role_map: {
      idle: "egg_idle",
      wobble: "egg_wobble",
      sleep: "egg_sleep",
      feed: "egg_care",
      clean: "egg_care",
      play: "egg_care",
      interact: "egg_react",
      greet: "egg_react",
      blocked: "egg_react",
      breakout: "egg_breakout",
      hatch: "egg_hatch",
      evolve: "egg_hatch",
      dance: "front_dance",
      victory: "front_victory",
      fight: "front_fight"
    },
    display: existingManifest?.display || { scale: 1, fit_width: 184, fit_height: 184, pivot_y: 1 },
    assets: mergedAssets,
    front_action_contact_sheet_path: frontActionContactSheetPath,
    front_action_visual_review: {
      status: "approved",
      reviewed_at: existingManifest?.front_action_visual_review?.reviewed_at || new Date().toISOString(),
      contact_sheet_path: frontActionContactSheetPath
    }
  };
  await writeJson(STAGE0_MANIFEST_PATH, productionManifest);
  return productionManifest;
}

async function downloadEggyoneStage0Animations(options) {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required to download EGGYONE outputs.");
  const paths = outputPaths();
  const characterId = await resolveCharacterId(options);
  const records = await listSpritesheets(apiKey, characterId, paths);
  const recordsByName = selectCanonicalStage0Records(records);
  const animations = [];
  for (const mapping of ROLE_SHEETS) {
    const record = recordsByName.get(mapping.autosprite_name);
    const saved = await saveExistingSheet({
      apiKey,
      animationId: mapping.role,
      record,
      characterName: options.characterName,
      paths
    });
    animations.push({
      ...saved,
      role: mapping.role,
      autosprite_animation_name: mapping.autosprite_name,
      autosprite_spritesheet_id: spritesheetId(record) || saved.autosprite_spritesheet_id,
      playback_mode: mapping.playback_mode,
      character_id: characterId
    });
    console.log(`Downloaded ${mapping.autosprite_name} -> ${mapping.role}`);
  }
  await buildContactSheet(animations.map((entry) => ({ ...entry, id: `${entry.role} (${entry.autosprite_animation_name})` })), paths.contactSheetPath);
  const manifest = {
    generated_at: new Date().toISOString(),
    source: "AutoSprite API",
    mode: "download-existing-stage0",
    character_name: options.characterName,
    character_id: characterId,
    required_roles: ROLE_SHEETS.map((entry) => entry.role),
    contact_sheet_path: relative(paths.contactSheetPath),
    animations
  };
  await writeJson(paths.manifestPath, manifest);
  await promoteStagingPack(manifest, paths);
  console.log(`EGGYONE Stage-0 manifest written to ${relative(paths.manifestPath)}`);
  return manifest;
}

if (require.main === module) {
  downloadEggyoneStage0Animations(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ROLE_SHEETS,
  FRONT_ACTION_ROLES,
  LOCAL_FRONT_FIGHT_SOURCE,
  FRONT_ACTION_CONTACT_SHEET,
  parseArgs,
  exactName,
  outputPaths,
  selectCanonicalStage0Records,
  validateAtlasAgainstSheet,
  ensureLocalEggyoneFrontFightAsset,
  preservedFrontActionAssets,
  rebuildFrontActionContactSheet,
  promoteStagingPack,
  downloadEggyoneStage0Animations
};
