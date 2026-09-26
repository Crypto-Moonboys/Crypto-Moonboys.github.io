#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  outputPaths,
  resolveCharacterId,
  listSpritesheets,
  pickRecord,
  saveExistingSheet,
  buildContactSheet,
  spritesheetId,
  writeJson
} = require("./download-botty-front-animations");
const {
  LOCAL_EGGYONE_FRONT_FIGHT,
  validateLocalEggyoneFrontFightAsset,
  repoPath: localRepoPath
} = require("./eggyone-front-fight-local");
const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");
const BOT_ART_REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-bot-art-registry.json");
const REPORT_PATH = path.join(REPO_ROOT, "data", "moonpet-front-action-generation.json");
const CACHE_VERSION = "20260926-front-actions-v1";
const REQUIRED_ROLES = Object.freeze({
  front_dance: { loop: true, one_shot: false, playback_mode: "loop" },
  front_victory: { loop: false, one_shot: true, playback_mode: "once_hold_last" },
  front_fight: { loop: false, one_shot: true, playback_mode: "once_then_idle" }
});
const CHARACTERS = Object.freeze([
  { name: "EGGYONE", slug: "eggyone", manifest: "data/moonpet-eggyone-stage0-assets.json" },
  { name: "WTFBOI", slug: "wtfboi", manifest: "data/moonpet-wtfboi-front-assets.json" },
  { name: "F1 EDDY", slug: "f1-eddy", manifest: "data/moonpet-f1-eddy-front-assets.json" },
  { name: "JAKE THE SNAKE", slug: "jake-the-snake", manifest: "data/moonpet-jake-the-snake-front-assets.json" },
  { name: "TUBBY", slug: "tubby", manifest: "data/moonpet-tubby-front-assets.json" },
  { name: "BOTTY", slug: "botty", manifest: "data/moonpet-botty-front-assets.json" },
  { name: "RED ALERT", slug: "red-alert", manifest: "data/moonpet-red-alert-front-assets.json" },
  { name: "THE TING", slug: "the-ting", manifest: "data/moonpet-the-ting-front-assets.json" },
  { name: "TATTOO JOHN", slug: "tattoo-john", manifest: "data/moonpet-tattoo-john-front-assets.json" },
  { name: "TIN BOB", slug: "tin-bob", manifest: "data/moonpet-tin-bob-front-assets.json" }
]);

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function rolesForCharacter(character) {
  if (character && character.name === "EGGYONE") return ["front_dance", "front_victory"];
  return Object.keys(REQUIRED_ROLES);
}

function repoPath(relativePath) {
  return path.join(REPO_ROOT, String(relativePath || "").replace(/^[/\\]+/, ""));
}

function canonicalPaths(character, role) {
  const root = `/img/moonpets/${character.slug}`;
  return {
    png: `${root}/${role}.png`,
    atlas: `${root}/${role}.json`,
    contact: `${root}/front-actions-contact-sheet.png`
  };
}

function buildLocalEggyoneFrontFightEntry(characterId, contactPath) {
  return {
    character_name: "EGGYONE",
    character_id: characterId,
    role: LOCAL_EGGYONE_FRONT_FIGHT.role,
    spritesheet_id: null,
    frame_count: 25,
    playback_mode: REQUIRED_ROLES.front_fight.playback_mode,
    source_mode: "local_approved_asset",
    png_path: LOCAL_EGGYONE_FRONT_FIGHT.runtime_png_path,
    atlas_path: LOCAL_EGGYONE_FRONT_FIGHT.runtime_atlas_path,
    contact_sheet_path: contactPath,
    review_status: "approved_visual_review",
    user_supplied: {
      source_png_path: LOCAL_EGGYONE_FRONT_FIGHT.source_png_path,
      source_blob_sha: LOCAL_EGGYONE_FRONT_FIGHT.source_blob_sha
    }
  };
}

function asInstalledAsset(character, characterId, entry) {
  const contract = REQUIRED_ROLES[entry.id];
  const paths = canonicalPaths(character, entry.id);
  return {
    role: entry.id,
    png_path: paths.png,
    atlas_path: paths.atlas,
    frame_count: Number(entry.frame_count),
    frame_dimensions: entry.frame_size,
    sheet_size: entry.sheet_size,
    loop: contract.loop,
    one_shot: contract.one_shot,
    playback_mode: contract.playback_mode,
    fps: 12,
    autosprite: {
      character_id: characterId,
      spritesheet_id: entry.autosprite_spritesheet_id,
      status: entry.autosprite_status || "succeeded",
      created_at: entry.autosprite_created_at || null,
      updated_at: entry.autosprite_updated_at || null,
      provenance: "current existing AutoSprite spritesheet downloaded for the front action pack",
      source: "AutoSprite API"
    },
    provenance: "downloaded_existing",
    review_status: "pending_visual_review"
  };
}

async function installCharacter(character, characterId, entries) {
  const manifestPath = repoPath(character.manifest);
  const manifest = await readJson(manifestPath);
  if (manifest.character_name !== character.name) throw new Error(`${character.name}: manifest character name mismatch`);
  if (manifest.character_id !== characterId) throw new Error(`${character.name}: manifest character ID mismatch`);
  manifest.assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  manifest.runtime_role_map = manifest.runtime_role_map || {};

  for (const entry of entries) {
    const incomingId = String(entry.autosprite_spritesheet_id || "");
    if (!incomingId) throw new Error(`${character.name} ${entry.id}: missing AutoSprite spritesheet ID`);
    const installed = asInstalledAsset(character, characterId, entry);
    manifest.assets = manifest.assets.filter((asset) => asset.role !== entry.id);
    manifest.assets.push(installed);
    const paths = canonicalPaths(character, entry.id);
    await fs.mkdir(path.dirname(repoPath(paths.png)), { recursive: true });
    await fs.copyFile(repoPath(entry.output_png_path), repoPath(paths.png));
    await fs.copyFile(repoPath(entry.output_atlas_path), repoPath(paths.atlas));
  }

  if (character.name === "EGGYONE") {
    const sourcePath = localRepoPath(REPO_ROOT, LOCAL_EGGYONE_FRONT_FIGHT.source_png_path);
    const runtimePngPath = localRepoPath(REPO_ROOT, LOCAL_EGGYONE_FRONT_FIGHT.runtime_png_path);
    await fs.mkdir(path.dirname(runtimePngPath), { recursive: true });
    await fs.copyFile(sourcePath, runtimePngPath);
    const existingFight = (manifest.assets || []).find((asset) => asset.role === "front_fight");
    if (!existingFight) throw new Error("EGGYONE front_fight must exist in manifest before front-action install");
    await validateLocalEggyoneFrontFightAsset({
      repoRoot: REPO_ROOT,
      asset: existingFight,
      manifestCharacterId: characterId
    });
  }

  manifest.runtime_role_map.dance = "front_dance";
  manifest.runtime_role_map.victory = "front_victory";
  manifest.runtime_role_map.fight = "front_fight";
  manifest.front_action_contact_sheet_path = canonicalPaths(character, "front_dance").contact;
  manifest.cache_version = CACHE_VERSION;
  await writeJson(manifestPath, manifest);
}

async function processCharacter(character, apiKey, globalIds) {
  const paths = outputPaths(character.name);
  const characterId = await resolveCharacterId({ characterName: character.name, characterId: "", registryPath: REGISTRY_PATH });
  const records = await listSpritesheets(apiKey, characterId, paths);

  const requiredRoles = rolesForCharacter(character);
  const matches = new Map();
  for (const role of requiredRoles) {
    try {
      const match = pickRecord(records, role);
      if (match.candidates.length !== 1) {
        throw new Error(`${character.name} ${role}: expected one current sheet, found ${match.candidates.length}; refusing ambiguous download.`);
      }
      matches.set(role, match);
      console.log(`[${character.name}] downloading current existing ${role}`);
    } catch (error) {
      if (!/No complete existing AutoSprite spritesheet matched/.test(error.message)) throw error;
      throw new Error(`${character.name} ${role}: one current existing named AutoSprite sheet is required; generation is disabled.`);
    }
  }

  const entries = [];
  for (const role of requiredRoles) {
    const match = matches.get(role);
    const id = String(spritesheetId(match.record) || "");
    if (!id) throw new Error(`${character.name} ${role}: matched record has no spritesheet ID`);
    if (globalIds.has(id)) throw new Error(`${character.name} ${role}: duplicate spritesheet ID ${id} also used by ${globalIds.get(id)}`);
    globalIds.set(id, `${character.name} ${role}`);
    entries.push(await saveExistingSheet({
      apiKey,
      animationId: role,
      record: match.record,
      characterName: character.name,
      paths
    }));
  }

  await buildContactSheet(entries, paths.contactSheetPath);
  const contactPath = canonicalPaths(character, "front_dance").contact;
  await fs.mkdir(path.dirname(repoPath(contactPath)), { recursive: true });
  await fs.copyFile(paths.contactSheetPath, repoPath(contactPath));
  await installCharacter(character, characterId, entries);

  const rows = entries.map((entry) => ({
    character_name: character.name,
    character_id: characterId,
    role: entry.id,
    spritesheet_id: entry.autosprite_spritesheet_id,
    frame_count: entry.frame_count,
    playback_mode: REQUIRED_ROLES[entry.id].playback_mode,
    source_mode: "downloaded_existing",
    png_path: canonicalPaths(character, entry.id).png,
    atlas_path: canonicalPaths(character, entry.id).atlas,
    contact_sheet_path: contactPath,
    review_status: "pending_visual_review"
  }));
  if (character.name === "EGGYONE") {
    rows.push(buildLocalEggyoneFrontFightEntry(characterId, contactPath));
  }
  return rows;
}

async function main() {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required for the front action pack.");
  const registry = await readJson(REGISTRY_PATH);
  for (const character of CHARACTERS) {
    const row = registry[character.name];
    if (!row || row.active === false || !row.character_id) throw new Error(`${character.name}: verified active AutoSprite registry entry is required`);
  }

  const globalIds = new Map();
  const animations = [];
  const selectedCharacters = CHARACTERS;
  for (const character of selectedCharacters) {
    animations.push(...await processCharacter(character, apiKey, globalIds));
  }
  if (animations.length !== 30) throw new Error(`Front action report must contain 30 runtime sheets, received ${animations.length}.`);
  const autospriteCount = animations.filter((entry) => entry.source_mode === "downloaded_existing").length;
  const localCount = animations.filter((entry) => entry.source_mode === "local_approved_asset").length;
  if (autospriteCount !== 29 || localCount !== 1) {
    throw new Error(`Front action report must contain 29 AutoSprite sheets + 1 local approved asset, received ${autospriteCount} + ${localCount}.`);
  }

  const botRegistry = await readJson(BOT_ART_REGISTRY_PATH);
  botRegistry.role_map.dance = "front_dance";
  botRegistry.role_map.victory = "front_victory";
  botRegistry.role_map.fight = "front_fight";
  botRegistry.front_action_pack = {
    status: "pending_visual_review",
    cache_version: CACHE_VERSION,
    required_roles: Object.keys(REQUIRED_ROLES),
    character_count: CHARACTERS.length,
    animation_count: animations.length,
    autosprite_sheet_count: autospriteCount,
    local_approved_asset_count: localCount,
    audit_path: "/data/moonpet-front-action-audit.json"
  };
  await writeJson(BOT_ART_REGISTRY_PATH, botRegistry);
  await writeJson(REPORT_PATH, {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: "AutoSprite API + approved local asset",
    mode: "download_existing_named_sheets",
    cache_version: CACHE_VERSION,
    characters: CHARACTERS.map((character) => character.name),
    required_roles: Object.keys(REQUIRED_ROLES),
    autosprite_sheet_count: autospriteCount,
    local_approved_asset_count: localCount,
    local_approved_assets: [
      {
        character_name: "EGGYONE",
        role: LOCAL_EGGYONE_FRONT_FIGHT.role,
        source_png_path: LOCAL_EGGYONE_FRONT_FIGHT.source_png_path,
        source_blob_sha: LOCAL_EGGYONE_FRONT_FIGHT.source_blob_sha
      }
    ],
    animations
  });
  console.log(`Moonpet front action pack staged: ${autospriteCount} AutoSprite + ${localCount} approved local runtime sheets.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  CHARACTERS,
  REQUIRED_ROLES,
  CACHE_VERSION,
  canonicalPaths,
  asInstalledAsset,
  rolesForCharacter,
  buildLocalEggyoneFrontFightEntry
};
