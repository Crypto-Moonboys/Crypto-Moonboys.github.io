import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  LOCAL_EGGYONE_FRONT_FIGHT,
  validateLocalEggyoneFrontFightAsset
} from "./eggyone-front-fight-local.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const downloadModule = await import("./download-moonpet-front-action-pack.js");
const download = downloadModule.default || downloadModule;
const generation = JSON.parse(fs.readFileSync(path.join(root, "data/moonpet-front-action-generation.json"), "utf8"));
const audit = JSON.parse(fs.readFileSync(path.join(root, "data/moonpet-front-action-audit.json"), "utf8"));
const eggManifest = JSON.parse(fs.readFileSync(path.join(root, "data/moonpet-eggyone-stage0-assets.json"), "utf8"));

const eggyone = download.CHARACTERS.find((character) => character.name === "EGGYONE");
assert.deepEqual(download.rolesForCharacter(eggyone), ["front_dance", "front_victory"], "EGGYONE download cycle must exclude AutoSprite front_fight");

assert.equal(generation.animations.length, 30);
assert.equal(generation.autosprite_sheet_count, 29);
assert.equal(generation.local_approved_asset_count, 1);
assert.equal(generation.source, "AutoSprite API + approved local asset");
assert.equal(generation.local_approved_assets.length, 1);
assert.deepEqual(generation.local_approved_assets[0], {
  character_name: "EGGYONE",
  role: "front_fight",
  source_png_path: LOCAL_EGGYONE_FRONT_FIGHT.source_png_path,
  source_blob_sha: LOCAL_EGGYONE_FRONT_FIGHT.source_blob_sha
});

const generatedFight = generation.animations.find((row) => row.character_name === "EGGYONE" && row.role === "front_fight");
assert.ok(generatedFight);
assert.equal(generatedFight.source_mode, "local_approved_asset");
assert.equal(generatedFight.spritesheet_id, null);
assert.equal(generatedFight.user_supplied.source_blob_sha, LOCAL_EGGYONE_FRONT_FIGHT.source_blob_sha);

assert.equal(audit.animation_count, 30);
assert.equal(audit.autosprite_sheet_count, 29);
assert.equal(audit.local_approved_asset_count, 1);
assert.equal(audit.source, "AutoSprite API + approved local asset");
const auditedFight = audit.animations.find((row) => row.character_name === "EGGYONE" && row.role === "front_fight");
assert.ok(auditedFight);
assert.equal(auditedFight.source_mode, "local_approved_asset");
assert.equal(auditedFight.spritesheet_id, null);

const manifestFight = eggManifest.assets.find((asset) => asset.role === "front_fight");
await validateLocalEggyoneFrontFightAsset({
  repoRoot: root,
  asset: manifestFight,
  manifestCharacterId: eggManifest.character_id
});

const runtimeBlob = spawnSync("git", ["hash-object", LOCAL_EGGYONE_FRONT_FIGHT.runtime_png_path.replace(/^\//, "")], { cwd: root, encoding: "utf8" });
assert.equal(runtimeBlob.status, 0);
assert.equal(runtimeBlob.stdout.trim(), LOCAL_EGGYONE_FRONT_FIGHT.source_blob_sha);

console.log("EGGYONE front-action local preservation test passed");
