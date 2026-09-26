import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage0Module = await import("./download-eggyone-stage0-animations.js");
const stage0 = stage0Module.default || stage0Module;

function makeRecord({ id, name, status = "succeeded" }) {
  return { id, status, animationName: name, name };
}

const records = [
  makeRecord({ id: "1", name: "EGGONE" }),
  makeRecord({ id: "2", name: "EGGTWO" }),
  makeRecord({ id: "3", name: "EGGTHREE" }),
  makeRecord({ id: "4", name: "EGGFOUR" }),
  makeRecord({ id: "5", name: "EGGFIVE" }),
  makeRecord({ id: "6", name: "EGGSIX" }),
  makeRecord({ id: "7", name: "EGGSEVEN" }),
  makeRecord({ id: "8", name: "front_dance" }),
  makeRecord({ id: "9", name: "front_victory" }),
  makeRecord({ id: "10", name: "front_fight" }),
];

const selected = stage0.selectCanonicalStage0Records(records);
assert.equal(selected.size, 7);
for (const role of stage0.ROLE_SHEETS) {
  assert.ok(selected.has(role.autosprite_name), `selected records must include ${role.autosprite_name}`);
}

assert.throws(
  () => stage0.selectCanonicalStage0Records(records.filter((record) => record.name !== "EGGSEVEN")),
  /Missing exact existing EGGYONE sheet EGGSEVEN/
);

assert.throws(
  () => stage0.selectCanonicalStage0Records([...records, makeRecord({ id: "11", name: "EGGONE" })]),
  /Multiple completed EGGYONE sheets matched EGGONE/
);

const manifest = JSON.parse(fs.readFileSync(path.join(root, "data/moonpet-eggyone-stage0-assets.json"), "utf8"));
const frontActionRoles = ["front_dance", "front_victory", "front_fight"];
for (const role of frontActionRoles) {
  assert.ok(manifest.assets.some((asset) => asset.role === role), `manifest must preserve ${role}`);
}
assert.equal(manifest.runtime_role_map.fight, "front_fight");

const frontFight = manifest.assets.find((asset) => asset.role === "front_fight");
assert.equal(frontFight.png_path, "/img/moonpets/eggyone/front_fight.png");
assert.equal(frontFight.atlas_path, "/img/moonpets/eggyone/front_fight.json");
assert.equal(frontFight.provenance, "local_user_supplied_exact_committed_png");
assert.equal(frontFight.user_supplied.source_blob_sha, stage0.LOCAL_FRONT_FIGHT_SOURCE.blob_sha);
assert.equal(frontFight.autosprite?.source, "local_user_supplied");
assert.equal(frontFight.autosprite?.spritesheet_id, null);
assert.equal(frontFight.review_status, "approved_visual_review");

const blob = spawnSync("git", ["hash-object", "img/moonpets/eggyone/front_fight.png"], { cwd: root, encoding: "utf8" });
assert.equal(blob.status, 0, blob.stderr || "git hash-object must succeed");
assert.equal(blob.stdout.trim(), stage0.LOCAL_FRONT_FIGHT_SOURCE.blob_sha, "front_fight runtime PNG must match approved source blob");

const atlas = JSON.parse(fs.readFileSync(path.join(root, frontFight.atlas_path.replace(/^\//, "")), "utf8"));
const metadata = await sharp(path.join(root, frontFight.png_path.replace(/^\//, ""))).metadata();
stage0.validateAtlasAgainstSheet(atlas, {
  frame_count: frontFight.frame_count,
  sheet_size: { w: Number(metadata.width), h: Number(metadata.height) }
});
assert.equal(Number(metadata.width), Number(frontFight.sheet_size.w));
assert.equal(Number(metadata.height), Number(frontFight.sheet_size.h));
assert.equal(frontFight.frame_count, 25);

const stage0Source = fs.readFileSync(path.join(root, "scripts/download-eggyone-stage0-animations.js"), "utf8");
assert.match(stage0Source, /selectCanonicalStage0Records\(records\)/);
assert.doesNotMatch(stage0Source, /Expected exactly .* completed EGGYONE sheets, found/);

const workflow = fs.readFileSync(path.join(root, ".github/workflows/moonpet-art-factory.yml"), "utf8");
assert.match(workflow, /if: \$\{\{ success\(\) && env\.AUTO_COMMIT_AUTOSPRITE_CHARACTER_REGISTRY == 'true' && env\.FACTORY_PHASE != 'download-existing-front-actions' \}\}/);
assert.doesNotMatch(workflow, /\(success\(\) \|\| env\.FACTORY_PHASE != 'approve-front-actions'\)/);

console.log("EGGYONE Stage-0 refresh regression checks passed");
