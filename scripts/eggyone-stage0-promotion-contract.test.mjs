import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage0Module = await import("./download-eggyone-stage0-animations.js");
const auditModule = await import("./audit-eggyone-stage0-art.js");
const stage0 = stage0Module.default || stage0Module;
const { auditEggyoneStage0Manifest } = auditModule.default || auditModule;

const stageRoles = stage0.ROLE_SHEETS.map((entry) => entry.role);
const backupDir = await fsp.mkdtemp(path.join(os.tmpdir(), "moonpet-stage0-promotion-"));
const stage0ManifestPath = path.join(root, "data/moonpet-eggyone-stage0-assets.json");
const eggyoneDir = path.join(root, "img/moonpets/eggyone");
const initialManifestBytes = await fsp.readFile(stage0ManifestPath);
const unapprovedFrontManifest = JSON.parse(initialManifestBytes.toString('utf8'));
unapprovedFrontManifest.assets.find((asset) => asset.role === 'front_dance').review_status = 'pending';
assert.throws(() => stage0.preservedFrontActionAssets(unapprovedFrontManifest), /cannot approve/);

async function backupFiles() {
  await fsp.copyFile(stage0ManifestPath, path.join(backupDir, "moonpet-eggyone-stage0-assets.json"));
  const files = await fsp.readdir(eggyoneDir);
  for (const fileName of files) {
    await fsp.copyFile(path.join(eggyoneDir, fileName), path.join(backupDir, fileName));
  }
}

async function restoreFiles() {
  const files = await fsp.readdir(backupDir);
  for (const fileName of files) {
    const source = path.join(backupDir, fileName);
    const target = fileName === "moonpet-eggyone-stage0-assets.json"
      ? stage0ManifestPath
      : path.join(eggyoneDir, fileName);
    await fsp.copyFile(source, target);
  }
}

async function buildFixtureManifest(paths) {
  const current = JSON.parse(await fsp.readFile(stage0ManifestPath, "utf8"));
  const byRole = new Map(current.assets.map((asset) => [asset.role, asset]));
  await fsp.mkdir(paths.outputDir, { recursive: true });
  await fsp.copyFile(path.join(eggyoneDir, "contact-sheet.png"), paths.contactSheetPath);
  const animations = [];
  for (const mapping of stage0.ROLE_SHEETS) {
    const asset = byRole.get(mapping.role);
    const outputPng = path.join(paths.outputDir, `${mapping.role}.png`);
    const outputAtlas = path.join(paths.outputDir, `${mapping.role}.json`);
    await fsp.copyFile(path.join(root, asset.png_path.replace(/^\//, "")), outputPng);
    await fsp.copyFile(path.join(root, asset.atlas_path.replace(/^\//, "")), outputAtlas);
    animations.push({
      role: mapping.role,
      autosprite_animation_name: mapping.autosprite_name,
      autosprite_spritesheet_id: asset.autosprite.spritesheet_id,
      output_png_path: path.relative(root, outputPng).replace(/\\/g, "/"),
      output_atlas_path: path.relative(root, outputAtlas).replace(/\\/g, "/"),
      frame_count: asset.frame_count,
      frame_size: asset.frame_dimensions,
      sheet_size: asset.sheet_dimensions
    });
  }
  return {
    generated_at: new Date().toISOString(),
    character_name: "EGGYONE",
    character_id: current.character_id,
    animations
  };
}

await backupFiles();
try {
  const paths = stage0.outputPaths();
  const fixtureManifest = await buildFixtureManifest(paths);
  const promoted = await stage0.promoteStagingPack(fixtureManifest, paths);

  for (const role of stageRoles) {
    const asset = promoted.assets.find((entry) => entry.role === role);
    assert.ok(asset, `promoted manifest must include ${role}`);
    assert.ok(asset.autosprite?.character_id, `${role} must include autosprite.character_id`);
    assert.ok(asset.autosprite?.spritesheet_id, `${role} must include autosprite.spritesheet_id`);
    assert.equal(typeof asset.loop, "boolean", `${role} must include loop`);
    assert.equal(typeof asset.one_shot, "boolean", `${role} must include one_shot`);
    assert.equal(asset.review_status, "approved_visual_review", `${role} byte-identical refresh must preserve its existing approval`);
    for (const [pngSame, atlasSame] of [[false, true], [true, false], [false, false]]) {
      const pending = { ...asset, review_status: 'mechanical_validation_passed_pending_visual_review' };
      assert.equal(stage0.preserveUnchangedStage0Review(pending, asset, pngSame, atlasSame).review_status, pending.review_status,
        `${role} changed bytes must require a new visual review`);
    }
    const changedPlayback = { ...asset, fps: asset.fps + 1, review_status: 'mechanical_validation_passed_pending_visual_review' };
    assert.equal(stage0.preserveUnchangedStage0Review(changedPlayback, asset, true, true).review_status, changedPlayback.review_status);
    const unapproved = { ...asset, review_status: 'mechanical_validation_passed_pending_visual_review' };
    assert.equal(stage0.preserveUnchangedStage0Review(unapproved, unapproved, true, true).review_status, unapproved.review_status);
  }

  const frontFight = promoted.assets.find((entry) => entry.role === "front_fight");
  assert.equal(frontFight.provenance, "local_user_supplied_exact_committed_png");
  assert.equal(frontFight.user_supplied.source_blob_sha, stage0.LOCAL_FRONT_FIGHT_SOURCE.blob_sha);
  assert.equal(frontFight.review_status, "approved_visual_review");

  const audited = auditEggyoneStage0Manifest(promoted, { existingAudit: { audited_at: "fixture-audit-time" } });
  assert.equal(audited.status, "complete");
  assert.equal(audited.failures.length, 0);
} finally {
  await restoreFiles();
}

const stage0ManifestStatus = spawnSync("git", ["status", "--short", "--", "data/moonpet-eggyone-stage0-assets.json"], { cwd: root, encoding: "utf8" });
assert.equal(stage0ManifestStatus.status, 0);
assert.deepEqual(await fsp.readFile(stage0ManifestPath), initialManifestBytes, "promotion contract test must restore the input manifest, including pre-existing edits");

console.log("EGGYONE Stage-0 promotion contract test passed");
