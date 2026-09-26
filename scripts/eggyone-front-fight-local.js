#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");

const LOCAL_EGGYONE_FRONT_FIGHT = Object.freeze({
  role: "front_fight",
  source_png_path: "/img/moonpets/eggyone/EGGYONE-front_fight-v1.png",
  runtime_png_path: "/img/moonpets/eggyone/front_fight.png",
  runtime_atlas_path: "/img/moonpets/eggyone/front_fight.json",
  source_blob_sha: "835af206e932916ef0c4e1c3ca13cbdae18bf2f1",
  provenance: "local_user_supplied_exact_committed_png",
  autosprite_source: "local_user_supplied"
});

function repoPath(repoRoot, assetPath) {
  return path.join(repoRoot, String(assetPath || "").replace(/^[/\\]+/, ""));
}

function blobShaFromBuffer(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash("sha1").update(Buffer.concat([header, buffer])).digest("hex");
}

function gitBlobShaFromFile(filePath) {
  return blobShaFromBuffer(fs.readFileSync(filePath));
}

function atlasFrames(atlas) {
  if (Array.isArray(atlas?.frames)) return atlas.frames;
  if (atlas?.frames && typeof atlas.frames === "object") return Object.values(atlas.frames);
  return [];
}

function frameRect(frame) {
  const source = frame?.frame || frame || {};
  return {
    x: Number(source.x),
    y: Number(source.y),
    w: Number(source.w || source.width),
    h: Number(source.h || source.height)
  };
}

async function validateLocalEggyoneFrontFightAsset({ repoRoot, asset, manifestCharacterId }) {
  const expected = LOCAL_EGGYONE_FRONT_FIGHT;
  const failures = [];
  if (asset.role !== expected.role) failures.push("role must be front_fight");
  if (asset.png_path !== expected.runtime_png_path) failures.push("png_path must use canonical runtime front_fight path");
  if (asset.atlas_path !== expected.runtime_atlas_path) failures.push("atlas_path must use canonical runtime front_fight atlas path");
  if (asset.provenance !== expected.provenance) failures.push("provenance must mark approved local committed PNG source");
  if (asset.autosprite?.source !== expected.autosprite_source) failures.push("autosprite.source must be local_user_supplied");
  if (asset.autosprite?.spritesheet_id !== null) failures.push("autosprite.spritesheet_id must be null for local approved front_fight");
  if (asset.autosprite?.character_id !== manifestCharacterId) failures.push("autosprite.character_id must match manifest character_id");
  if (asset.user_supplied?.source_png_path !== expected.source_png_path) failures.push("user_supplied.source_png_path must match approved source path");
  if (asset.user_supplied?.source_blob_sha !== expected.source_blob_sha) failures.push("user_supplied.source_blob_sha must match approved source blob SHA");

  const sourcePath = repoPath(repoRoot, expected.source_png_path);
  const runtimePngPath = repoPath(repoRoot, expected.runtime_png_path);
  const runtimeAtlasPath = repoPath(repoRoot, expected.runtime_atlas_path);
  if (!fs.existsSync(sourcePath)) failures.push("approved source PNG is missing");
  if (!fs.existsSync(runtimePngPath)) failures.push("runtime front_fight PNG is missing");
  if (!fs.existsSync(runtimeAtlasPath)) failures.push("runtime front_fight atlas is missing");
  if (failures.length) throw new Error(`EGGYONE front_fight local validation failed:\n- ${failures.join("\n- ")}`);

  const sourceBytes = fs.readFileSync(sourcePath);
  const runtimeBytes = fs.readFileSync(runtimePngPath);
  const sourceBlobSha = blobShaFromBuffer(sourceBytes);
  const runtimeBlobSha = blobShaFromBuffer(runtimeBytes);
  if (sourceBlobSha !== expected.source_blob_sha) failures.push(`approved source blob mismatch: expected ${expected.source_blob_sha}, found ${sourceBlobSha}`);
  if (runtimeBlobSha !== expected.source_blob_sha) failures.push(`runtime blob mismatch: expected ${expected.source_blob_sha}, found ${runtimeBlobSha}`);
  if (!sourceBytes.equals(runtimeBytes)) failures.push("runtime front_fight PNG must be byte-identical to approved source PNG");

  const image = sharp(runtimeBytes);
  const metadata = await image.metadata();
  const atlas = JSON.parse(fs.readFileSync(runtimeAtlasPath, "utf8"));
  const frames = atlasFrames(atlas);
  if (frames.length !== Number(asset.frame_count)) failures.push("atlas frame count must match manifest frame_count");
  if (frames.length !== 25) failures.push("atlas must contain exactly 25 frames");
  if (Number(metadata.width) !== Number(asset.sheet_size?.w) || Number(metadata.height) !== Number(asset.sheet_size?.h)) {
    failures.push("manifest sheet_size must match runtime PNG dimensions");
  }
  for (const [index, frame] of frames.entries()) {
    const rect = frameRect(frame);
    if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) {
      failures.push(`atlas frame ${index} is invalid`);
      break;
    }
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > metadata.width || rect.y + rect.h > metadata.height) {
      failures.push(`atlas frame ${index} is outside runtime PNG bounds`);
      break;
    }
  }
  if (failures.length) throw new Error(`EGGYONE front_fight local validation failed:\n- ${failures.join("\n- ")}`);
  return {
    source_blob_sha: sourceBlobSha,
    runtime_blob_sha: runtimeBlobSha,
    frame_count: frames.length,
    width: Number(metadata.width),
    height: Number(metadata.height)
  };
}

module.exports = {
  LOCAL_EGGYONE_FRONT_FIGHT,
  repoPath,
  blobShaFromBuffer,
  gitBlobShaFromFile,
  atlasFrames,
  frameRect,
  validateLocalEggyoneFrontFightAsset
};
