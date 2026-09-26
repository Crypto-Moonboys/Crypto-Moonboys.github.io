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
  parseArgs: parseGeneratorArgs,
  generateBottyFrontAnimations
} = require("./generate-botty-front-animations");

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

async function readJsonIfExists(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function parseArgs(argv) {
  const index = argv.indexOf("--regenerate");
  const raw = index >= 0 ? String(argv[index + 1] || "").trim() : "";
  const requested = new Map();
  if (!raw) return { requested };
  for (const token of raw.split(",").map((value) => value.trim()).filter(Boolean)) {
    const separator = token.lastIndexOf(":");
    if (separator <= 0) throw new Error(`Invalid regeneration target "${token}"; expected CHARACTER:front_role.`);
    const characterName = token.slice(0, separator).trim().toUpperCase();
    const role = token.slice(separator + 1).trim();
    if (!REQUIRED_ROLES[role]) throw new Error(`Invalid regeneration role "${role}".`);
    if (!CHARACTERS.some((character) => character.name === characterName)) throw new Error(`Unknown regeneration character "${characterName}".`);
    if (!requested.has(characterName)) requested.set(characterName, new Set());
    requested.get(characterName).add(role);
  }
  return { requested };
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

function findExistingRole(manifest, role) {
  return (manifest.assets || []).find((asset) => asset.role === role) || null;
}

function asInstalledAsset(character, characterId, entry, generated) {
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
      provenance: generated
        ? "new AutoSprite spritesheet generated for the front action pack"
        : "existing exact AutoSprite spritesheet reused for the front action pack",
      source: "AutoSprite API"
    },
    provenance: generated ? "newly_generated" : "reused_existing",
    review_status: "pending_visual_review"
  };
}

async function installCharacter(character, characterId, entries, generatedRoles) {
  const manifestPath = repoPath(character.manifest);
  const manifest = await readJson(manifestPath);
  if (manifest.character_name !== character.name) throw new Error(`${character.name}: manifest character name mismatch`);
  if (manifest.character_id !== characterId) throw new Error(`${character.name}: manifest character ID mismatch`);
  manifest.assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  manifest.runtime_role_map = manifest.runtime_role_map || {};

  for (const entry of entries) {
    const existing = findExistingRole(manifest, entry.id);
    const incomingId = String(entry.autosprite_spritesheet_id || "");
    if (!incomingId) throw new Error(`${character.name} ${entry.id}: missing AutoSprite spritesheet ID`);
    if (existing && !generatedRoles.has(entry.id) && String(existing.autosprite?.spritesheet_id || "") !== incomingId) {
      throw new Error(`${character.name} ${entry.id}: refusing to replace installed spritesheet ${existing.autosprite?.spritesheet_id} with ${incomingId}`);
    }
    const installed = asInstalledAsset(character, characterId, entry, generatedRoles.has(entry.id));
    manifest.assets = manifest.assets.filter((asset) => asset.role !== entry.id);
    manifest.assets.push(installed);
    const paths = canonicalPaths(character, entry.id);
    await fs.mkdir(path.dirname(repoPath(paths.png)), { recursive: true });
    await fs.copyFile(repoPath(entry.output_png_path), repoPath(paths.png));
    await fs.copyFile(repoPath(entry.output_atlas_path), repoPath(paths.atlas));
  }

  manifest.runtime_role_map.dance = "front_dance";
  manifest.runtime_role_map.victory = "front_victory";
  manifest.runtime_role_map.fight = "front_fight";
  manifest.front_action_contact_sheet_path = canonicalPaths(character, "front_dance").contact;
  manifest.cache_version = CACHE_VERSION;
  await writeJson(manifestPath, manifest);
}

async function processCharacter(character, apiKey, globalIds, forceRoles = new Set()) {
  const paths = outputPaths(character.name);
  const characterId = await resolveCharacterId({ characterName: character.name, characterId: "", registryPath: REGISTRY_PATH });
  let records = await listSpritesheets(apiKey, characterId, paths);
  const generatedRoles = new Set();

  for (const role of Object.keys(REQUIRED_ROLES)) {
    if (forceRoles.has(role)) {
      console.log(`[${character.name}] regenerating rejected ${role}`);
      const options = parseGeneratorArgs([
        "--character-name", character.name,
        "--character-id", characterId,
        "--animation", role,
        "--poll-timeout-ms", "1200000",
        "--execute"
      ]);
      await generateBottyFrontAnimations(options);
      generatedRoles.add(role);
      records = await listSpritesheets(apiKey, characterId, paths);
      continue;
    }
    try {
      pickRecord(records, role);
      console.log(`[${character.name}] reusing existing ${role}`);
    } catch (error) {
      if (!/No complete existing AutoSprite spritesheet matched/.test(error.message)) throw error;
      console.log(`[${character.name}] generating missing ${role}`);
      const options = parseGeneratorArgs([
        "--character-name", character.name,
        "--character-id", characterId,
        "--animation", role,
        "--poll-timeout-ms", "1200000",
        "--execute"
      ]);
      await generateBottyFrontAnimations(options);
      generatedRoles.add(role);
      records = await listSpritesheets(apiKey, characterId, paths);
    }
  }

  const entries = [];
  for (const role of Object.keys(REQUIRED_ROLES)) {
    const match = pickRecord(records, role);
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
  await installCharacter(character, characterId, entries, generatedRoles);

  return entries.map((entry) => ({
    character_name: character.name,
    character_id: characterId,
    role: entry.id,
    spritesheet_id: entry.autosprite_spritesheet_id,
    frame_count: entry.frame_count,
    playback_mode: REQUIRED_ROLES[entry.id].playback_mode,
    source_mode: generatedRoles.has(entry.id) ? "newly_generated" : "reused_existing",
    png_path: canonicalPaths(character, entry.id).png,
    atlas_path: canonicalPaths(character, entry.id).atlas,
    contact_sheet_path: contactPath,
    review_status: "pending_visual_review"
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required for the front action pack.");
  const registry = await readJson(REGISTRY_PATH);
  for (const character of CHARACTERS) {
    const row = registry[character.name];
    if (!row || row.active === false || !row.character_id) throw new Error(`${character.name}: verified active AutoSprite registry entry is required`);
  }

  const globalIds = new Map();
  const animations = [];
  const selectedCharacters = options.requested.size
    ? CHARACTERS.filter((character) => options.requested.has(character.name))
    : CHARACTERS;
  for (const character of selectedCharacters) {
    animations.push(...await processCharacter(character, apiKey, globalIds, options.requested.get(character.name)));
  }

  const previousReport = await readJsonIfExists(REPORT_PATH, { animations: [] });
  const selectedNames = new Set(selectedCharacters.map((character) => character.name));
  const completeAnimations = [
    ...(previousReport.animations || []).filter((entry) => !selectedNames.has(entry.character_name)),
    ...animations
  ];
  if (completeAnimations.length !== 30) throw new Error(`Front action report must contain 30 sheets, received ${completeAnimations.length}.`);

  const botRegistry = await readJson(BOT_ART_REGISTRY_PATH);
  botRegistry.role_map.dance = "front_dance";
  botRegistry.role_map.victory = "front_victory";
  botRegistry.role_map.fight = "front_fight";
  botRegistry.front_action_pack = {
    status: "pending_visual_review",
    cache_version: CACHE_VERSION,
    required_roles: Object.keys(REQUIRED_ROLES),
    character_count: CHARACTERS.length,
    animation_count: completeAnimations.length,
    audit_path: "/data/moonpet-front-action-audit.json"
  };
  await writeJson(BOT_ART_REGISTRY_PATH, botRegistry);
  await writeJson(REPORT_PATH, {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: "AutoSprite API",
    cache_version: CACHE_VERSION,
    characters: CHARACTERS.map((character) => character.name),
    required_roles: Object.keys(REQUIRED_ROLES),
    animations: completeAnimations
  });
  console.log(`Moonpet front action pack staged: ${completeAnimations.length} verified AutoSprite sheets.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { CHARACTERS, REQUIRED_ROLES, CACHE_VERSION, canonicalPaths, asInstalledAsset, parseArgs };
