#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
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
const { directNames } = require("./inspect-autosprite-stage0-pack");

const REPO_ROOT = path.resolve(__dirname, "..");
const CHARACTER_NAME = "EGGYONE";
const REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");
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
  const productionManifest = {
    schema_version: 1,
    character_name: manifest.character_name,
    character_id: manifest.character_id,
    source: "AutoSprite API",
    provenance: "existing AutoSprite sheets; no generation request was made",
    downloaded_at: manifest.generated_at,
    approval_status: "mechanical_validation_passed_pending_visual_review",
    contact_sheet_path: `/${relative(contactSheetPath)}`,
    animations: productionAnimations
  };
  const productionManifestPath = path.join(REPO_ROOT, "data", "moonpet-eggyone-stage0-assets.json");
  await writeJson(productionManifestPath, productionManifest);
  return productionManifest;
}

async function downloadEggyoneStage0Animations(options) {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required to download EGGYONE outputs.");
  const paths = outputPaths();
  const characterId = await resolveCharacterId(options);
  const records = (await listSpritesheets(apiKey, characterId, paths)).filter(isComplete);
  if (records.length !== ROLE_SHEETS.length) {
    throw new Error(`Expected exactly ${ROLE_SHEETS.length} completed EGGYONE sheets, found ${records.length}.`);
  }
  const recordsByName = new Map();
  for (const record of records) {
    const name = exactName(record);
    if (!name) throw new Error(`Unrecognized EGGYONE sheet ${spritesheetId(record) || "without id"}: ${directNames(record).join(", ") || "name unavailable"}.`);
    if (recordsByName.has(name)) throw new Error(`Multiple completed EGGYONE sheets matched ${name}.`);
    recordsByName.set(name, record);
  }
  const animations = [];
  for (const mapping of ROLE_SHEETS) {
    const record = recordsByName.get(mapping.autosprite_name);
    if (!record) throw new Error(`Missing exact existing EGGYONE sheet ${mapping.autosprite_name}.`);
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

module.exports = { ROLE_SHEETS, parseArgs, exactName, outputPaths, downloadEggyoneStage0Animations };
