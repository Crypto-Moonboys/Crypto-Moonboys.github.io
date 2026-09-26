#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "data", "moonpet-eggyone-stage0-assets.json");
const OUTPUT_PATH = path.join(REPO_ROOT, "data", "moonpet-eggyone-stage0-audit.json");
const EXPECTED_ROLES = Object.freeze({
  egg_idle: { loop: true, one_shot: false, playback_mode: "loop" },
  egg_wobble: { loop: true, one_shot: false, playback_mode: "loop" },
  egg_sleep: { loop: true, one_shot: false, playback_mode: "loop" },
  egg_react: { loop: false, one_shot: true, playback_mode: "once_then_idle" },
  egg_care: { loop: false, one_shot: true, playback_mode: "once_then_idle" },
  egg_breakout: { loop: false, one_shot: true, playback_mode: "once_hold_last" },
  egg_hatch: { loop: false, one_shot: true, playback_mode: "once" },
});

function repoPath(assetPath) {
  return path.join(REPO_ROOT, String(assetPath || "").replace(/^[/\\]+/, ""));
}

function atlasFrameCount(atlas) {
  if (Array.isArray(atlas && atlas.frames)) return atlas.frames.length;
  if (atlas && atlas.frames && typeof atlas.frames === "object") return Object.keys(atlas.frames).length;
  return 0;
}

function auditEggyoneStage0() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const failures = [];
  if (manifest.character_name !== "EGGYONE") failures.push("manifest character_name must be EGGYONE");
  if (manifest.source !== "AutoSprite API") failures.push("manifest source must be AutoSprite API");
  if (!manifest.character_id) failures.push("manifest character_id is required");

  const assets = new Map((manifest.assets || []).map((asset) => [asset.role, asset]));
  for (const [role, expected] of Object.entries(EXPECTED_ROLES)) {
    const asset = assets.get(role);
    if (!asset) {
      failures.push(`${role}: missing from manifest`);
      continue;
    }
    if (Number(asset.frame_count) !== 25) failures.push(`${role}: expected 25 manifest frames`);
    if (asset.loop !== expected.loop) failures.push(`${role}: loop must be ${expected.loop}`);
    if (asset.one_shot !== expected.one_shot) failures.push(`${role}: one_shot must be ${expected.one_shot}`);
    if (asset.playback_mode !== expected.playback_mode) failures.push(`${role}: playback_mode must be ${expected.playback_mode}`);
    if (asset.autosprite?.character_id !== manifest.character_id) failures.push(`${role}: AutoSprite character ID mismatch`);
    if (!asset.autosprite?.spritesheet_id) failures.push(`${role}: AutoSprite spritesheet ID is required`);
    if (!fs.existsSync(repoPath(asset.png_path))) failures.push(`${role}: PNG is missing`);
    const atlasPath = repoPath(asset.atlas_path);
    if (!fs.existsSync(atlasPath)) {
      failures.push(`${role}: atlas is missing`);
    } else if (atlasFrameCount(JSON.parse(fs.readFileSync(atlasPath, "utf8"))) !== 25) {
      failures.push(`${role}: atlas must contain 25 frames`);
    }
  }
  for (const role of assets.keys()) {
    if (!EXPECTED_ROLES[role]) failures.push(`${role}: unexpected Stage 0 role`);
  }

  const result = {
    schema_version: 2,
    audited_at: new Date().toISOString(),
    source: "AutoSprite API",
    character_name: manifest.character_name,
    character_id: manifest.character_id,
    manifest_path: "/data/moonpet-eggyone-stage0-assets.json",
    required_frame_count: 25,
    required_roles: Object.keys(EXPECTED_ROLES),
    playback_contract: EXPECTED_ROLES,
    status: failures.length ? "failed" : "complete",
    genuine_authored_pack_available: failures.length === 0,
    failures,
  };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  if (failures.length) throw new Error(`EGGYONE Stage 0 audit failed:\n- ${failures.join("\n- ")}`);
  console.log("EGGYONE Stage 0 AutoSprite audit passed: 7 roles, 25 frames each.");
  return result;
}

if (require.main === module) auditEggyoneStage0();

module.exports = { EXPECTED_ROLES, auditEggyoneStage0, atlasFrameCount };
