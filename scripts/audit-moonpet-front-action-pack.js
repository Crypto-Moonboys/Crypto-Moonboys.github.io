#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { CHARACTERS, REQUIRED_ROLES, CACHE_VERSION, rolesForCharacter } = require("./generate-moonpet-front-action-pack");

const REPO_ROOT = path.resolve(__dirname, "..");
const CHARACTER_REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");
const BOT_REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-bot-art-registry.json");
const GENERATION_REPORT_PATH = path.join(REPO_ROOT, "data", "moonpet-front-action-generation.json");
const AUDIT_PATH = path.join(REPO_ROOT, "data", "moonpet-front-action-audit.json");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function repoPath(assetPath) {
  return path.join(REPO_ROOT, String(assetPath || "").replace(/^[/\\]+/, ""));
}

function atlasFrames(atlas) {
  if (Array.isArray(atlas?.frames)) return atlas.frames;
  if (atlas?.frames && typeof atlas.frames === "object") return Object.values(atlas.frames);
  return [];
}

function frameRect(frame) {
  const source = frame?.frame || frame || {};
  return { x: Number(source.x), y: Number(source.y), w: Number(source.w || source.width), h: Number(source.h || source.height) };
}

async function inspectPng(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("invalid PNG signature");
  const image = sharp(bytes);
  const metadata = await image.metadata();
  const raw = await image.ensureAlpha().raw().toBuffer();
  let transparent = 0;
  for (let index = 3; index < raw.length; index += 4) if (raw[index] < 250) transparent += 1;
  return {
    width: Number(metadata.width),
    height: Number(metadata.height),
    has_alpha: Boolean(metadata.hasAlpha),
    transparent_ratio: transparent / (Number(metadata.width) * Number(metadata.height))
  };
}

function parseArgs(argv) {
  return {
    write: argv.includes("--write") || argv.includes("--approve-visual-review"),
    approve: argv.includes("--approve-visual-review")
  };
}

async function audit(options = {}) {
  const characterRegistry = readJson(CHARACTER_REGISTRY_PATH);
  const botRegistry = readJson(BOT_REGISTRY_PATH);
  const generationReport = readJson(GENERATION_REPORT_PATH);
  const failures = [];
  const rows = [];
  const spritesheetOwners = new Map();

  for (const character of CHARACTERS) {
    const expectedCharacterId = characterRegistry[character.name]?.character_id;
    const manifestPath = repoPath(character.manifest);
    const manifest = readJson(manifestPath);
    if (!expectedCharacterId) failures.push(`${character.name}: missing verified registry character ID`);
    if (manifest.character_name !== character.name) failures.push(`${character.name}: manifest character_name mismatch`);
    if (manifest.character_id !== expectedCharacterId) failures.push(`${character.name}: manifest character_id mismatch`);
    if (manifest.runtime_role_map?.dance !== "front_dance") failures.push(`${character.name}: dance runtime role is not front_dance`);
    if (manifest.runtime_role_map?.victory !== "front_victory") failures.push(`${character.name}: victory runtime role is not front_victory`);
    if (character.name === "EGGYONE") {
      if (manifest.runtime_role_map?.fight) failures.push("EGGYONE: front_fight must not be registered");
    } else if (manifest.runtime_role_map?.fight !== "front_fight") failures.push(`${character.name}: fight runtime role is not front_fight`);

    const expectedFolder = `/img/moonpets/${character.slug}/`;
    const contactPath = repoPath(manifest.front_action_contact_sheet_path);
    if (!manifest.front_action_contact_sheet_path || !fs.existsSync(contactPath)) failures.push(`${character.name}: front action contact sheet is missing`);

    const expectedRoles = new Set(rolesForCharacter(character));
    for (const asset of manifest.assets || []) {
      if (REQUIRED_ROLES[asset.role] && !expectedRoles.has(asset.role)) failures.push(`${character.name} ${asset.role}: role is not required`);
    }
    for (const role of expectedRoles) {
      const contract = REQUIRED_ROLES[role];
      const asset = (manifest.assets || []).find((candidate) => candidate.role === role);
      if (!asset) {
        failures.push(`${character.name} ${role}: missing manifest asset`);
        continue;
      }
      const owner = `${character.name} ${role}`;
      const spritesheetId = String(asset.autosprite?.spritesheet_id || "");
      if (!spritesheetId) failures.push(`${owner}: missing genuine spritesheet ID`);
      if (spritesheetOwners.has(spritesheetId)) failures.push(`${owner}: spritesheet ID duplicates ${spritesheetOwners.get(spritesheetId)}`);
      else spritesheetOwners.set(spritesheetId, owner);
      if (asset.autosprite?.character_id !== expectedCharacterId) failures.push(`${owner}: AutoSprite character ID mismatch`);
      if (!String(asset.png_path || "").startsWith(expectedFolder)) failures.push(`${owner}: PNG path uses the wrong character folder`);
      if (!String(asset.atlas_path || "").startsWith(expectedFolder)) failures.push(`${owner}: atlas path uses the wrong character folder`);
      if (Number(asset.frame_count) !== 25) failures.push(`${owner}: expected 25 manifest frames`);
      if (asset.loop !== contract.loop || asset.one_shot !== contract.one_shot || asset.playback_mode !== contract.playback_mode) {
        failures.push(`${owner}: playback contract mismatch`);
      }
      if (!["pending_visual_review", "approved_visual_review"].includes(asset.review_status)) failures.push(`${owner}: invalid review status`);

      const pngPath = repoPath(asset.png_path);
      const atlasPath = repoPath(asset.atlas_path);
      if (!fs.existsSync(pngPath)) failures.push(`${owner}: PNG is missing`);
      if (!fs.existsSync(atlasPath)) failures.push(`${owner}: atlas is missing`);
      if (!fs.existsSync(pngPath) || !fs.existsSync(atlasPath)) continue;

      try {
        const image = await inspectPng(pngPath);
        if (!image.has_alpha) failures.push(`${owner}: PNG has no alpha channel`);
        if (image.transparent_ratio < 0.1) failures.push(`${owner}: PNG lacks transparent background spacing`);
        const atlas = readJson(atlasPath);
        const frames = atlasFrames(atlas);
        if (frames.length !== Number(asset.frame_count)) failures.push(`${owner}: atlas frame count does not match manifest`);
        for (const [index, frame] of frames.entries()) {
          const rect = frameRect(frame);
          if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) {
            failures.push(`${owner}: atlas frame ${index} is invalid`);
            break;
          }
          if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > image.width || rect.y + rect.h > image.height) {
            failures.push(`${owner}: atlas frame ${index} is outside PNG bounds`);
            break;
          }
        }
        rows.push({
          character_name: character.name,
          character_id: expectedCharacterId,
          role,
          spritesheet_id: spritesheetId,
          frame_count: frames.length,
          playback_mode: asset.playback_mode,
          png_path: asset.png_path,
          atlas_path: asset.atlas_path,
          contact_sheet_path: manifest.front_action_contact_sheet_path,
          transparent_ratio: image.transparent_ratio,
          review_status: options.approve ? "approved_visual_review" : asset.review_status,
          source_mode: asset.provenance
        });
      } catch (error) {
        failures.push(`${owner}: ${error.message}`);
      }
    }

    if (options.approve && failures.length === 0) {
      for (const asset of manifest.assets || []) {
        if (REQUIRED_ROLES[asset.role]) asset.review_status = "approved_visual_review";
      }
      manifest.front_action_visual_review = {
        status: "approved",
        reviewed_at: new Date().toISOString(),
        contact_sheet_path: manifest.front_action_contact_sheet_path
      };
      writeJson(manifestPath, manifest);
    }
  }

  if (rows.length !== 29) failures.push(`expected 29 audited animations, received ${rows.length}`);
  if (generationReport.animations?.length !== 29) failures.push("generation report must contain 29 animations");
  if (botRegistry.role_map?.dance !== "front_dance" || botRegistry.role_map?.victory !== "front_victory" || botRegistry.role_map?.fight !== "front_fight") {
    failures.push("central bot-art registry is missing front action role mappings");
  }

  const allApproved = rows.length === 29 && rows.every((row) => row.review_status === "approved_visual_review");
  if (options.approve && failures.length === 0) {
    botRegistry.front_action_pack.status = "complete";
    botRegistry.front_action_pack.approved_at = new Date().toISOString();
    writeJson(BOT_REGISTRY_PATH, botRegistry);
  }
  const result = {
    schema_version: 1,
    audited_at: new Date().toISOString(),
    source: "AutoSprite API",
    cache_version: CACHE_VERSION,
    character_count: CHARACTERS.length,
    animation_count: rows.length,
    required_roles: Object.keys(REQUIRED_ROLES),
    mechanical_status: failures.length ? "failed" : "complete",
    visual_review_status: allApproved || options.approve && failures.length === 0 ? "approved" : "pending",
    status: failures.length ? "failed" : allApproved || options.approve ? "complete" : "pending_visual_review",
    failures,
    animations: rows
  };
  if (options.write) writeJson(AUDIT_PATH, result);
  if (failures.length) throw new Error(`Moonpet front action audit failed:\n- ${failures.join("\n- ")}`);
  console.log(`Moonpet front action audit passed mechanically: ${rows.length} sheets; visual review ${result.visual_review_status}.`);
  return result;
}

if (require.main === module) {
  audit(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { audit, inspectPng, atlasFrames, frameRect };
