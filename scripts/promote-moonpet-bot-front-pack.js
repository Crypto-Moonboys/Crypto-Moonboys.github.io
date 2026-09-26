#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const REQUIRED_ROLES = [
  "front_idle", "front_feed", "front_play", "front_clean", "front_sleep",
  "front_train", "front_travel", "front_work", "front_equip", "front_evolve",
  "front_trade", "front_celebrate", "front_interact", "front_blocked", "front_battle"
];
const LOOPING_ROLES = new Set(["front_idle", "front_play", "front_sleep", "front_train", "front_travel", "front_work"]);
const ROLE_MAP = {
  idle: "front_idle", feed: "front_feed", play: "front_play", clean: "front_clean",
  sleep: "front_sleep", train: "front_train", travel: "front_travel", work: "front_work",
  equip: "front_equip", evolve: "front_evolve", trade: "front_trade",
  celebrate: "front_celebrate", interact: "front_interact", greet: "front_interact",
  blocked: "front_blocked", battle: "front_battle"
};

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseArgs(argv) {
  const options = { manifest: "", sourceRoot: REPO_ROOT, speciesId: "", artifactRun: null, artifactId: null, approved: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") options.manifest = path.resolve(argv[++index]);
    else if (arg === "--source-root") options.sourceRoot = path.resolve(argv[++index]);
    else if (arg === "--species-id") options.speciesId = String(argv[++index] || "").trim();
    else if (arg === "--artifact-run") options.artifactRun = Number(argv[++index]);
    else if (arg === "--artifact-id") options.artifactId = Number(argv[++index]);
    else if (arg === "--approve-visual-review") options.approved = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.manifest) throw new Error("--manifest is required.");
  if (!options.speciesId) throw new Error("--species-id is required.");
  if (!options.approved) throw new Error("--approve-visual-review is required before production promotion.");
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath, fallback) {
  try { return await readJson(filePath); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function frameCount(atlas) {
  if (Array.isArray(atlas && atlas.frames)) return atlas.frames.length;
  if (atlas && atlas.frames && typeof atlas.frames === "object") return Object.keys(atlas.frames).length;
  return 0;
}

async function promote(options) {
  const source = await readJson(options.manifest);
  const characterName = String(source.character_name || "").trim().toUpperCase();
  const characterId = String(source.character_id || "").trim();
  if (!characterName || !characterId) throw new Error("Source manifest is missing character identity.");
  const characterSlug = slug(characterName);
  const entries = new Map((source.animations || []).map((entry) => [entry.id, entry]));
  if (entries.size !== REQUIRED_ROLES.length || REQUIRED_ROLES.some((role) => !entries.has(role))) {
    throw new Error(`Expected exactly ${REQUIRED_ROLES.length} required animation roles for ${characterName}.`);
  }

  const assetRoot = path.join(REPO_ROOT, "img", "moonpets", characterSlug);
  await fs.mkdir(assetRoot, { recursive: true });
  const assets = [];
  for (const role of REQUIRED_ROLES) {
    const entry = entries.get(role);
    const pngSource = path.join(options.sourceRoot, entry.output_png_path);
    const atlasSource = path.join(options.sourceRoot, entry.output_atlas_path);
    const pngTarget = path.join(assetRoot, `${role}.png`);
    const atlasTarget = path.join(assetRoot, `${role}.json`);
    const atlas = await readJson(atlasSource);
    const actualFrames = frameCount(atlas);
    if (!actualFrames || actualFrames !== Number(entry.frame_count)) {
      throw new Error(`${role} atlas frame count ${actualFrames} does not match source manifest ${entry.frame_count}.`);
    }
    await fs.copyFile(pngSource, pngTarget);
    await fs.copyFile(atlasSource, atlasTarget);
    const loop = LOOPING_ROLES.has(role);
    assets.push({
      role,
      png_path: `/img/moonpets/${characterSlug}/${role}.png`,
      atlas_path: `/img/moonpets/${characterSlug}/${role}.json`,
      frame_count: actualFrames,
      frame_dimensions: entry.frame_size,
      sheet_size: entry.sheet_size,
      loop,
      one_shot: !loop,
      fps: 12,
      autosprite: {
        character_id: characterId,
        spritesheet_id: entry.autosprite_spritesheet_id || null,
        status: entry.autosprite_status || null,
        created_at: entry.autosprite_created_at || null,
        updated_at: entry.autosprite_updated_at || null,
        provenance: entry.provenance,
        source: "AutoSprite API"
      },
      review_status: "approved_visual_review"
    });
  }

  const cacheVersion = `20260926-${characterSlug}-front-live-beta-v1`;
  const productionManifest = {
    schema_version: 1,
    character_name: characterName,
    character_id: characterId,
    source: "AutoSprite API",
    mode: "production-approved-front-pack",
    approved_artifact_run: options.artifactRun,
    approved_artifact_id: options.artifactId,
    installed_at: new Date().toISOString(),
    cache_version: cacheVersion,
    runtime_policy: {
      normal_gameplay: "approved_front_pack_only",
      disable_side_scroller: true,
      disable_random_idle_variants: true,
      disable_wearable_overlays: true,
      frame_count_source: "atlas frames length"
    },
    runtime_role_map: ROLE_MAP,
    assets
  };
  const productionManifestPath = path.join(REPO_ROOT, "data", `moonpet-${characterSlug}-front-assets.json`);
  await writeJson(productionManifestPath, productionManifest);

  const registryPath = path.join(REPO_ROOT, "data", "moonpet-bot-art-registry.json");
  const registry = await readJsonIfExists(registryPath, {
    schema_version: 1,
    default_bot: "BOTTY",
    role_map: ROLE_MAP,
    bots: {
      BOTTY: {
        canonical_species_ids: ["vinyl_crab"], display_names: ["BOTTY"],
        autosprite_character_id: "cmuh1eo4p000113f3alnoim0v",
        manifest_path: "/data/moonpet-botty-front-assets.json", asset_root: "/img/moonpets/botty/",
        status: "complete", fallback: "BOTTY", display: { scale: 1, fit_width: 168, fit_height: 168, pivot_y: 0.9 }
      },
      "F1 EDDY": { canonical_species_ids: ["neon_raccoon"], display_names: ["F1 EDDY"], status: "pending", fallback: "BOTTY" },
      "JAKE THE SNAKE": { canonical_species_ids: ["bubble_ram"], display_names: ["JAKE THE SNAKE", "JACK THE SNAKE", "JALE THE SNAKE"], status: "pending", fallback: "BOTTY" },
      "RED ALERT": { canonical_species_ids: ["lantern_fox"], display_names: ["RED ALERT"], status: "pending", fallback: "BOTTY" },
      "THE TING": { canonical_species_ids: ["sneaker_snail"], display_names: ["THE TING"], status: "pending", fallback: "BOTTY" },
      "TATTOO JOHN": { canonical_species_ids: ["alley_drake"], display_names: ["TATTOO JOHN"], status: "pending", fallback: "BOTTY" },
      "TIN BOB": { canonical_species_ids: ["moon_ferret"], display_names: ["TIN BOB"], status: "pending", fallback: "BOTTY" }
    }
  });
  registry.role_map = ROLE_MAP;
  registry.bots[characterName] = {
    canonical_species_ids: [options.speciesId],
    display_names: [characterName],
    autosprite_character_id: characterId,
    manifest_path: `/data/moonpet-${characterSlug}-front-assets.json`,
    asset_root: `/img/moonpets/${characterSlug}/`,
    status: "complete",
    fallback: "BOTTY",
    display: { scale: 1, fit_width: 168, fit_height: 168, pivot_y: 0.9 }
  };
  await writeJson(registryPath, registry);

  const autospriteRegistryPath = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");
  const autospriteRegistry = await readJsonIfExists(autospriteRegistryPath, {});
  const existingCharacter = autospriteRegistry[characterName];
  autospriteRegistry[characterName] = {
    character_id: characterId,
    source: "autosprite",
    active: true,
    discovered_at: existingCharacter?.character_id === characterId && existingCharacter.discovered_at
      ? existingCharacter.discovered_at
      : source.generated_at || new Date().toISOString()
  };
  await writeJson(autospriteRegistryPath, autospriteRegistry);
  console.log(`Promoted ${characterName}: ${assets.length} approved assets -> img/moonpets/${characterSlug}/`);
  return productionManifest;
}

if (require.main === module) {
  promote(parseArgs(process.argv.slice(2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { REQUIRED_ROLES, ROLE_MAP, parseArgs, promote };
